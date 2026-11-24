// 端口像这个导演台会话的专线：新窗口不能接管旧端口，旧结果也不能关闭新窗口。
// 队列只决定宿主写盘顺序，三维状态、历史和动画仍全部由原组件持有。
// 关闭等待原组件的 save → ack → cancel → closed，不用定时器假装保存完成。
import { handleDirectorEvent, isRecord, type DirectorCallbacks } from "./embed-events";
import { t } from "@/i18n";

interface Closing {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class DirectorBridge {
  private queue = Promise.resolve();
  private alive = true;
  private closing?: Closing;
  private opened = false;
  private finished = false;
  private lastRequest = 0;
  private timer: ReturnType<typeof setTimeout>;

  // 初始化失败必须可见且有界；文件缺失或脚本错误不能留下无限加载状态。
  // callbacks 每次执行前读取，避免 React 刷新后仍用旧工程覆盖刚保存的预览。
  // scene 是打开时的副本，本轮保存不会触发 iframe 重新加载或重置撤销历史。
  // 端口的监听在此唯一绑定；dispose 会解除监听、清定时器并拒绝待关闭请求。
  // report 只负责宿主的错误/加载提示，不代替子页面自己的通知界面。
  constructor(private port: MessagePort, private scene: unknown, private callbacks: () => DirectorCallbacks, private report: (state: "ready" | "error", detail?: string) => void) {
    this.timer = setTimeout(() => this.fail("director-open-timeout"), 30000);
    port.onmessage = ({ data }: MessageEvent<unknown>) => this.receive(data);
    port.onmessageerror = () => this.fail("director-invalid-message");
    port.start();
  }

  // 只认约定的几类信封；重复 ready 不重开，重复 closed 不重复调用关闭回调。
  // event 必须带正整数编号，ack 才能准确回到原组件对应的保存承诺。
  // 写盘串行执行，失败被本次请求接住，后续重试仍能排队。
  // 关闭后忽略消息，防止卸载过程的迟到自动保存再次触发界面变更。
  private receive(data: unknown): void {
    if (!this.alive || !isRecord(data)) return;
    if (data.kind === "ready" && !this.opened) this.port.postMessage({ kind: "open", scene: this.scene, connectedMediaUrls: [] });
    if (data.kind === "opened") {
      clearTimeout(this.timer);
      this.opened = true;
      this.report("ready");
    }
    if (data.kind === "error") this.fail("director-save-failed");
    if (data.kind === "closed") this.finish();
    if (data.kind === "event" && Number.isSafeInteger(data.id) && Number(data.id) > 0 && typeof data.event === "string") {
      const id = Number(data.id), event = data.event, payload = data.payload;
      // 原组件编号单调递增；重复消息不能再生成一次图片节点或再次触发下载。
      if (id <= this.lastRequest) return;
      this.lastRequest = id;
      this.queue = this.queue.then(() => this.perform(id, event, payload));
    }
  }

  // 正文校验和真实持久化全部结束后才返回 ok。
  // 对端失败提示使用稳定错误码，不把用户路径、调用堆栈或底层 IPC 细节送进 iframe。
  // 保存过程中若宿主卸载，实际写盘可能已经开始；只禁止迟到 ack 和界面操作。
  // 队列在本方法内消费异常，不让失败变成未处理拒绝或永久堵住后面的重试。
  // 成功会清除旧错误；它表示宿主回调完成，不代表下载文件已经被用户打开验证。
  private async perform(id: number, event: string, payload: unknown): Promise<void> {
    if (!this.alive) return;
    try {
      await handleDirectorEvent(event, payload, this.callbacks());
      if (!this.alive) return;
      this.port.postMessage({ kind: "ack", id, ok: true });
      this.report("ready");
    } catch {
      if (!this.alive) return;
      this.port.postMessage({ kind: "ack", id, ok: false, message: t("director.hostError") });
      this.fail("director-save-failed");
    }
  }

  // 连点关闭共用一次请求；不能在上一次退出快照还没保存时再触发退出。
  // 尚未打开时没有可编辑草稿，直接退出加载态，原工程节点保持原样。
  // 已打开之后必须等待真实退出保存，不能把初始化取消当成保存成功。
  // 超时只报告失败，不自动卸载；用户仍能留在原页面重试。
  close(): Promise<void> {
    if (!this.alive) return Promise.reject(Error("director-unmounted"));
    if (!this.opened) {
      this.callbacks().onCancel();
      this.dispose();
      return Promise.resolve();
    }
    if (this.closing) return this.closing.promise;
    let resolve!: () => void, reject!: (error: Error) => void;
    const promise = new Promise<void>((done, failed) => { resolve = done; reject = failed; });
    const timer = setTimeout(() => this.fail("director-close-timeout"), 130000);
    this.closing = { promise, resolve, reject, timer };
    this.port.postMessage({ kind: "close" });
    return promise;
  }

  // closed 来自已经拿到保存确认的子页面，而不是来自“点击退出”这个意图。
  // 先完成等待导航的承诺，再通知父级卸载，防止清理把成功请求误判为取消。
  // 两种关闭入口最终只经过这里一次，确认生成图片不会再重复执行 cancel 保存。
  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    if (this.closing) {
      clearTimeout(this.closing.timer);
      this.closing.resolve();
      this.closing = undefined;
    }
    this.callbacks().onCancel();
  }

  // 失败时仅拒绝当前关闭，不终止端口；原组件可恢复快照后再次保存。
  // report 的字符串是宿主错误码，显示文案由项目双语词条决定。
  // 先清掉关闭引用，再让 Promise 的处理者运行，下一次点击才能真正重试。
  private fail(message: string): void {
    this.report("error", message);
    if (!this.closing) return;
    clearTimeout(this.closing.timer);
    this.closing.reject(Error(message));
    this.closing = undefined;
  }

  // 每次加载与卸载都成对释放端口；不会给下一实例留下事件监听。
  // 不在这里调用 onCancel，外部主动卸载不应被伪装成保存成功的关闭。
  // 正在写入的用户数据不做回滚删除，文件写盘的原子性仍归原有持久化器。
  dispose(): void {
    this.alive = false;
    clearTimeout(this.timer);
    if (this.closing) {
      clearTimeout(this.closing.timer);
      this.closing.reject(Error("director-unmounted"));
      this.closing = undefined;
    }
    this.port.onmessage = null;
    this.port.onmessageerror = null;
    this.port.close();
  }
}

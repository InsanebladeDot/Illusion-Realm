// 每个 iframe 使用独立 MessageChannel，外部窗口不能靠广播伪造保存请求。
// 消息像按号排队交单：上一笔媒体或保存完成后，下一笔才读取工程。
// 退出也排在队尾，因此最后一份剪辑状态不会被卸载丢弃。
import type { CompositionController } from "./composition-controller";
interface BridgeCallbacks { ready: () => void; close: () => void; error: () => void; selectAssets: () => Promise<unknown>; cancelSelection: () => void }
export class CompositionBridge {
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;
  private closing: { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private timer: ReturnType<typeof setTimeout>;
  constructor(private port: MessagePort, private controller: CompositionController, private callbacks: BridgeCallbacks, private messages: Record<string, string>) {
    this.timer = setTimeout(callbacks.error, 20000);
    port.onmessage = event => {
      this.queue = this.queue.then(() => this.receive(event.data)).catch(() => callbacks.error());
    };
    port.start();
  }
  // ready 才交初始素材，不靠固定延时猜原网页是否已注册监听。
  // 请求 ID 只用于回信匹配；业务对象与窗口身份仍由会话控制器持有。
  // 无效消息不执行文件操作，也不改变外层关闭状态。
  private async receive(value: unknown): Promise<void> {
    if (this.disposed || !value || typeof value !== "object" || !("type" in value)) return;
    if (value.type === "ready") { this.port.postMessage({ type: "open", ...this.controller.initial(), messages: this.messages }); return; }
    if (value.type === "opened") { clearTimeout(this.timer); this.callbacks.ready(); return; }
    if (value.type === "closed") { this.finishClose(); this.callbacks.close(); return; }
    if (value.type === "close-failed") { this.finishClose(Error("composition-save-failed")); return; }
    if (!("id" in value) || typeof value.id !== "string" || !("payload" in value)) return;
    try {
      const result = await this.execute(value.type, value.payload);
      if (!this.disposed) this.port.postMessage({ type: "ack", id: value.id, success: true, result });
    } catch {
      if (!this.disposed) this.port.postMessage({ type: "ack", id: value.id, success: false, error: this.messages.operationError });
    }
  }
  private async execute(type: unknown, payload: unknown): Promise<unknown> {
    if (type === "save") return this.controller.save(payload);
    if (type === "media") return this.controller.media(payload);
    if (type === "compose") return this.controller.compose(payload);
    if (type === "select-assets") return this.callbacks.selectAssets();
    throw Error("composition-unknown-message");
  }
  // 关闭由原组件按钮触发原始保存与媒体清理，父层不自造“已保存”快照。
  // 失败会拒绝导航承诺，原编辑器仍保留当前内容供用户重试。
  // 重复关闭明确拒绝，不发起相互竞争的保存与卸载。
  close(): Promise<void> {
    if (this.disposed) return Promise.reject(Error("composition-session-disposed"));
    if (this.closing) return Promise.reject(Error("composition-close-pending"));
    this.callbacks.cancelSelection();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.finishClose(Error("composition-close-timeout")), 180000);
      this.closing = { resolve, reject, timer };
      this.port.postMessage({ type: "close" });
    });
  }
  private finishClose(error?: Error): void {
    const pending = this.closing;
    this.closing = null;
    if (!pending) return;
    clearTimeout(pending.timer);
    if (error) pending.reject(error); else pending.resolve();
  }
  // 解绑端口与超时后，已卸载会话不会再回写 React 状态。
  // 文件写入已开始时由主进程完成；端口关闭不宣称能够撤销系统写盘。
  dispose(): void {
    this.disposed = true;
    this.callbacks.cancelSelection();
    clearTimeout(this.timer);
    this.finishClose(Error("composition-session-disposed"));
    this.port.onmessage = null;
    this.port.close();
  }
}

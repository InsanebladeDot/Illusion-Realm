// 直接挂载原 Vue 合成器，时间线与编码逻辑不经过 React 重写。
// 专线只传初始素材、状态和媒体正文，页面没有 Node 或 electronAPI 权限。
// 原 demo 的 /api 服务不在正式入口中加载，所有文件由幻域生产桥接接管。
import { t as requireVue } from "./original/vue-vendor-CQe4N-Nh.js";
import VideoComposition from "./original/VideoCompositionDialog-DsVMeLLc.js";
const { createApp, h, ref, nextTick } = requireVue();
const visible = ref(false), initial = ref(null), videos = ref([]), audios = ref([]), session = ref(0);
const requests = new Map(), failures = new Map(), downloads = new Set();
let port = null, latest = null, queue = Promise.resolve(), messages = {}, application = null, closed = false;
let phase = "dirty", pendingSaves = 0;

// 系统主题是唯一信号，保留原构建的 dark 选择器而不另存主题偏好。
// resize 与 visibilitychange 重新读取，媒体事件丢失也不会永久停在旧配色。
const theme = matchMedia("(prefers-color-scheme: dark)");
function syncTheme() { document.documentElement.classList.toggle("dark", theme.matches); }
syncTheme();
theme.addEventListener("change", syncTheme);
window.addEventListener("resize", syncTheme);
document.addEventListener("visibilitychange", syncTheme);

// RPC 有上限，父窗口退出或写盘失败不会让导出永久转圈。
// 一个请求对应一个计时器，收到回执后立即释放。
// 取消另存为是 null，和异常拒绝是不同结果。
function request(type, payload) {
  if (!port || closed) return Promise.reject(Error("composition-disconnected"));
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { requests.delete(id); reject(Error("composition-request-timeout")); }, 180000);
    requests.set(id, { resolve, reject, timer });
    port.postMessage({ type, payload, id });
  });
}
function report(text, level = "info") {
  const node = document.createElement("div");
  node.className = "local-toast";
  node.dataset.level = level;
  node.textContent = text;
  document.body.append(node);
  setTimeout(() => node.remove(), 5000);
}
// 原组件保存事件不等待异步回执，宿主因此自行串行化并保留失败副本。
// 最新快照先复制，关闭后恢复的是用户刚编辑的内容，不是上一次磁盘状态。
// 重试失败单像补寄未签收的包裹，不能把原组件已清除 dirty 当作成功。
// 原状态文字只反映 emit 已发出；这里把它换成宿主实际写盘结果。
// 不改原 Vue refs，尤其不能为了显示“脏”而伪造一处片段参数变化。
// 失败入口复用原页头按钮样式，只有存在未签收事务时才额外出现。
function refreshStatus() {
  const label = document.querySelector(".vcd-save-status");
  if (!label) return;
  if (!pendingSaves && !failures.size && label.textContent.includes("有未保存的修改")) phase = "dirty";
  const text = failures.size ? messages.operationError : pendingSaves ? messages.saving : phase === "saved" ? messages.saved : messages.unsaved;
  // 不替换 Vue 管理的文本节点，否则后续更新会找不到旧锚点。
  // 只写独立属性供 CSS 展示，原状态树保留给原引擎继续更新。
  if (label.dataset.hostStatus !== text) label.dataset.hostStatus = text;
  label.title = text;
  const button = document.querySelector(".embed-retry-save");
  if (!failures.size) { button?.remove(); return; }
  if (button) return;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "vcd-btn embed-retry-save";
  retry.textContent = messages.retry;
  retry.onclick = () => { void retryFailures(); };
  document.querySelector(".vcd-header-tools")?.prepend(retry);
}
const statusObserver = new MutationObserver(refreshStatus);
statusObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
function enqueue(type, value) {
  const payload = structuredClone(value);
  if (type === "save") latest = payload;
  pendingSaves++;
  refreshStatus();
  queue = queue.then(async () => {
    try { await request(type, payload); failures.delete(type); phase = "saved"; }
    catch { failures.set(type, payload); report(messages.operationError, "error"); }
    finally { pendingSaves--; refreshStatus(); }
  });
}
async function retryFailures() {
  for (const [type, payload] of [...failures]) enqueue(type, payload);
  await queue;
}
// 返回成片以前必须已完成真实写盘，原“画布”出口因此只能接收真实 localfile URL。
// 仅用于编码完成的成片；素材导入走宿主选择器，不再把普通素材当成合成产物。
window.__videoLocalImport = async file => {
  const result = await request("media", { file, name: file.name || "composition.mp4", download: false });
  if (!result) throw Error(messages.operationError);
  return result;
};
window.__videoSelectAssets = () => request("select-assets", null).catch(error => {
  report(messages.operationError, "error");
  throw error;
});
// 原本地下载调用方不 await，适配层自己持有承诺并接住失败。
// 原提前成功提示在图标/消息适配器中被抑制，只有系统写盘完成才显示成功。
// 取消系统框仅提示取消，不创建成片节点或伪造下载完成。
window.__videoLocalDownload = (file, options = {}) => {
  const task = request("media", { file, name: options.fileName || "composition.mp4", download: true })
    .then(result => report(result ? messages.downloadSaved : messages.downloadCancelled))
    .catch(() => report(messages.operationError, "error"));
  downloads.add(task);
  void task.finally(() => downloads.delete(task));
  return task;
};
// 原组件自己暂停媒体、清定时器再发 close，宿主等保存排队完成后才能卸载。
// 失败时重开最新快照，背景画布仍 inert，防止丢稿后误操作其他节点。
// Escape、原关闭按钮与应用导航最终都走同一个结束方法。
async function finish() {
  await queue;
  await Promise.allSettled([...downloads]);
  if (failures.size) {
    initial.value = latest;
    session.value++;
    await nextTick();
    visible.value = true;
    report(messages.operationError, "error");
    port.postMessage({ type: "close-failed" });
    return;
  }
  port.postMessage({ type: "closed" });
}
function closeOriginal() {
  const button = document.querySelector('.vcd-header [data-tip="关闭"]');
  if (!button || button.disabled) { port.postMessage({ type: "close-failed" }); return; }
  button.click();
}
// 失败后再次按保存，优先补交未确认快照；否则原组件因 dirty 已清零不会重发。
// 只拦截原页头保存键，不接管其正常字段提交、剪辑快捷键或窗口控制。
function retrySave(event) {
  const button = event.target instanceof Element ? event.target.closest(".vcd-header button") : null;
  if (!failures.size || button?.textContent.trim() !== "保存") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void retryFailures();
}
document.addEventListener("click", retrySave, true);

async function open(value) {
  initial.value = value.initialState;
  latest = value.initialState;
  phase = latest ? "saved" : "dirty";
  videos.value = value.videos;
  audios.value = value.audios;
  messages = value.messages;
  application = createApp({ setup: () => () => h(VideoComposition, {
    key: session.value, visible: visible.value, videos: videos.value, audios: audios.value,
    initialState: initial.value, sessionId: "", "onUpdate:visible": value => { visible.value = value; },
    "onSave-state": state => enqueue("save", state), onCompose: result => enqueue("compose", result),
    onClose: () => { void finish().catch(() => report(messages.operationError, "error")); },
  }) });
  application.mount("#app");
  visible.value = true;
  await nextTick();
  const note = document.createElement("small");
  note.className = "embed-local-note";
  note.textContent = messages.localOnly;
  document.body.append(note);
  port.postMessage({ type: "opened" });
}
// 首次握手验证确切父窗口与同源，随后只接受转交的专用端口。
// 不使用任意 window.message 操作媒体，不允许外部页面注入文件保存命令。
window.addEventListener("message", event => {
  if (port || event.source !== parent || event.origin !== location.origin || event.data?.protocol !== "illusion-video-composition/v1" || !event.ports[0]) return;
  port = event.ports[0];
  port.onmessage = ({ data }) => {
    if (data?.type === "open") void open(data).catch(() => report("composition-start-failed", "error"));
    if (data?.type === "close") closeOriginal();
    if (data?.type !== "ack") return;
    const pending = requests.get(data.id);
    if (!pending) return;
    requests.delete(data.id);
    clearTimeout(pending.timer);
    if (data.success) pending.resolve(data.result); else pending.reject(Error(data.error));
  };
  port.start();
  port.postMessage({ type: "ready" });
});
// 原 Vue 卸载负责解码器与播放节点；宿主负责自己的端口、监听与等待器。
// 已离开的窗口不会再提交迟到回执，也没有悬空的三分钟计时器。
window.addEventListener("pagehide", () => {
  closed = true;
  statusObserver.disconnect();
  application?.unmount();
  theme.removeEventListener("change", syncTheme);
  window.removeEventListener("resize", syncTheme);
  document.removeEventListener("visibilitychange", syncTheme);
  document.removeEventListener("click", retrySave, true);
  for (const item of requests.values()) { clearTimeout(item.timer); item.reject(Error("composition-disconnected")); }
  requests.clear();
  port?.close();
});

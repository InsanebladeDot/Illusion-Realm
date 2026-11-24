import { t as requireVue } from "./vue-vendor-CQe4N-Nh.js";
import Scene from "./SceneComposerDialog-BzigIK-a.js";

const { createApp, h, ref, nextTick } = requireVue();
const protocol = "huanyu-original-director/v1";
const visible = ref(false), initial = ref(null), session = ref(0), connected = ref([]);
let port = null, initialized = false, sequence = 0, latest = null;
let queue = Promise.resolve(), saveError = null, closeScheduled = false;
const pending = new Map();
const status = document.getElementById("embed-status");
const busy = (text) => { status.textContent = text; status.style.display = "grid"; };
const idle = () => { status.style.display = "none"; };

function showError(error) {
  document.querySelector(".embed-error")?.remove();
  const node = document.createElement("div");
  node.className = "embed-error";
  node.textContent = error instanceof Error ? error.message : String(error);
  document.body.append(node);
  port?.postMessage({ kind: "error", message: node.textContent });
}

function request(event, payload) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error("幻域处理超时；未确认保存成功，请重试。"));
    }, 120000);
    pending.set(id, { resolve, reject, timer });
    port.postMessage({ kind: "event", id, event, payload });
  });
}

// Vue 的 emit 不等待异步保存；在原组件外串行等待宿主确认，失败时保留场景并重开。
function persist(scene) {
  latest = structuredClone(scene);
  const snapshot = structuredClone(scene);
  queue = queue.then(async () => {
    try { await request("save", snapshot); saveError = null; }
    catch (error) { saveError = error; showError(error); }
  });
}

function finish(event, scene) {
  if (closeScheduled) return;
  closeScheduled = true;
  if (scene) latest = structuredClone(scene);
  busy(event === "confirm" ? "正在保存机位…" : "正在保存场景…");
  queue = queue.then(async () => {
    try {
      if (event === "cancel" && saveError) throw saveError;
      await request(event, scene || null);
      port.postMessage({ kind: "closed", reason: event });
      busy("导演台已关闭");
    } catch (error) {
      // 原组件在 emit 后会关闭；重新加载未保存快照，宿主未成功时不丢数据。
      initial.value = latest;
      session.value++;
      await nextTick();
      visible.value = true;
      idle();
      showError(error);
    } finally { closeScheduled = false; }
  });
}

function download(content, options = {}) {
  const settings = typeof options === "string" ? { filename: options } : options;
  const filename = settings.filename || settings.fileName || settings.name || `导演台-${Date.now()}.png`;
  return request("download", { content, filename }).catch(showError);
}
window.__localDirectorDownload = download;

createApp({
  setup() {
    return () => h(Scene, {
      key: session.value,
      visible: visible.value,
      initialData: initial.value,
      initialAspectRatio: initial.value?.aspectRatio,
      initialShowLabels: initial.value?.showLabels,
      initialLabelFontSize: initial.value?.labelFontSize,
      initialShowBaseMarker: initial.value?.showBaseMarker,
      sessionId: "",
      connectedMediaUrls: connected.value,
      "onUpdate:visible": (value) => { visible.value = value; },
      onSave: persist,
      onConfirm: (scene) => finish("confirm", scene),
      onCancel: () => finish("cancel"),
      "onExport-video": (blob) => {
        if (!(blob instanceof Blob)) return showError(Error("原组件未返回视频文件。"));
        return request("exportVideo", blob).catch(showError);
      },
    });
  },
}).mount("#app");

window.addEventListener("message", (event) => {
  // 仅由实际父窗口建立一次专用消息通道，场景不出现在 URL 或全局广播中。
  if (port || event.source !== window.parent || event.data?.protocol !== protocol || !event.ports[0]) return;
  if (event.origin !== location.origin && !(location.origin === "null" && event.origin === "null")) return;
  port = event.ports[0];
  port.onmessage = async ({ data }) => {
    if (data.kind === "ack") {
      const item = pending.get(data.id);
      if (!item) return;
      clearTimeout(item.timer); pending.delete(data.id);
      if (data.ok) item.resolve(); else item.reject(Error(data.message || "幻域保存失败；场景尚未关闭。"));
    } else if (data.kind === "open" && !initialized) {
      initialized = true;
      initial.value = data.scene ?? null;
      latest = initial.value;
      connected.value = data.connectedMediaUrls || [];
      visible.value = true;
      idle();
      await nextTick();
      port.postMessage({ kind: "opened" });
    } else if (data.kind === "close" && initialized && visible.value && !closeScheduled) {
      // 调用原退出按钮，沿用其取景、保存、cancel 顺序；展开预览时第一次仅收起预览。
      const button = document.querySelector(".composer-close-action");
      button?.click();
      await nextTick();
      if (visible.value) document.querySelector(".composer-close-action")?.click();
    }
  };
  port.start();
  port.postMessage({ kind: "ready" });
});

window.addEventListener("pagehide", () => {
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error("导演台已卸载")); }
  pending.clear();
  port?.close();
});

import { t as requireVue } from "./vue-vendor-CQe4N-Nh.js";
import VideoComposition from "./VideoCompositionDialog-DsVMeLLc.js";
const { createApp, h, ref, nextTick } = requireVue();
const visible = ref(false), initial = ref(null), videos = ref([]), audios = ref([]), session = ref(0), status = ref("正在读取本地工程…"), result = ref(null);
let latest = null, queue = Promise.resolve(), failed = false;
const events = [];
window.__videoHostEvents = events;
const report = (text, level = "info") => {
  status.value = text; const node = document.createElement("div"); node.className = "local-toast"; node.dataset.level = level; node.textContent = text; document.body.append(node); setTimeout(() => node.remove(), 4500);
};
window.__videoLocalImport = async (file) => {
  const response = await fetch("/api/media?name=" + encodeURIComponent(file.name || "composition.mp4"), { method: "POST", headers: { "content-type": file.type || "application/octet-stream" }, body: file });
  const stored = await response.json(); if (!response.ok) throw Error(stored.error || "本地文件保存失败");
  events.push({ type: "local-file", name: stored.name, url: stored.url, bytes: stored.bytes });
  return stored;
};
window.__videoLocalDownload = (content, options = {}) => {
  const name = typeof options === "string" ? options : options.fileName || options.filename || "视频合成.mp4";
  const url = content instanceof Blob ? URL.createObjectURL(content) : content;
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  if (content instanceof Blob) setTimeout(() => URL.revokeObjectURL(url), 3000);
  events.push({ type: "download", name, bytes: content.size || content.length });
};
function persist(composition) {
  latest = structuredClone(composition);
  const document = { composition: latest, videos: JSON.parse(JSON.stringify(videos.value)), audios: JSON.parse(JSON.stringify(audios.value)), result: result.value ? JSON.parse(JSON.stringify(result.value)) : null };
  queue = queue.then(async () => {
    try {
      const response = await fetch("/api/state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(document) });
      if (!response.ok) throw Error((await response.json()).error);
      failed = false; status.value = "工程已保存到本地数据/composition.json";
      events.push({ type: "save", videos: composition.videoClips.length, audios: composition.audioClips.length });
      window.dispatchEvent(new CustomEvent("video-composition-save", { detail: composition }));
    } catch (error) { failed = true; report("保存失败：" + error.message, "error"); }
  });
}
async function reopen() { initial.value = latest; session.value++; await nextTick(); visible.value = true; }
async function close() {
  await queue;
  if (failed) { await reopen(); report("本地保存尚未成功，已恢复未保存场景，请重试。", "error"); }
  else events.push({ type: "close" });
}
function composed(value) {
  result.value = { url: value.resultUrl, duration: value.duration || value.totalDuration };
  events.push({ type: "compose", ...result.value });
  report("合成结果已保存在本机，可在此预览或下载；未上传网络。");
  window.dispatchEvent(new CustomEvent("video-composition-result", { detail: { ...value, localOnly: true } }));
}
function exportScene() {
  if (!latest) return report("请先在编辑器保存或退出。");
  window.__videoLocalDownload(new Blob([JSON.stringify({ composition: latest, videos: videos.value, audios: audios.value }, null, 2)], { type: "application/json" }), { fileName: "视频合成工程.json" });
}
const input = document.createElement("input"); input.type = "file"; input.accept = ".json,application/json"; input.className = "local-import"; input.setAttribute("aria-label", "导入合成工程 JSON"); document.body.append(input);
input.onchange = async () => {
  try {
    const document = JSON.parse(await input.files[0].text()), composition = document.composition || document;
    if (!Array.isArray(composition.videoClips) || !Array.isArray(composition.audioClips)) throw Error("缺少 videoClips/audioClips 数组");
    for (const entry of [...composition.videoClips, ...composition.audioClips, ...(composition.libraryMaterials || [])]) {
      const url = entry.src || entry.url; if (url && !url.startsWith("/media/")) throw Error("仅允许当前项目 /media/ 下的本地素材");
    }
    videos.value = []; audios.value = []; persist(composition); await queue; await reopen();
  } catch (error) { report("导入失败：" + error.message, "error"); }
  input.value = "";
};
createApp({ setup() { return () => h("div", [
  h("main", { class: "local-home" }, [
    h("h1", "视频合成 · 原组件本地运行"),
    h("p", "使用原视频合成的界面、时间线、效果、预览和编码逻辑。素材选择改为本地文件，工程与合成结果保存在本目录；账号、线上素材库和上传服务未连接。"),
    h("p", { role: "status" }, status.value),
    h("button", { onClick: reopen }, "打开视频合成"),
    h("button", { onClick: exportScene }, "导出工程 JSON"),
    h("button", { onClick: () => input.click() }, "导入工程 JSON"),
    result.value ? h("section", [h("p", `本地合成结果 · ${result.value.duration.toFixed(2)} 秒`), h("video", { src: result.value.url, controls: true }), h("a", { href: result.value.url, download: "本地合成结果.mp4" }, "下载本地合成结果")]) : null,
  ]),
  h(VideoComposition, { key: session.value, visible: visible.value, videos: videos.value, audios: audios.value, initialState: initial.value, sessionId: "", "onUpdate:visible": (value) => { visible.value = value; }, "onSave-state": persist, onClose: close, onCompose: composed }),
]); } }).mount("#app");
try {
  const response = await fetch("/api/state"), saved = await response.json();
  if (saved) { latest = saved.composition; initial.value = latest; videos.value = saved.videos || []; audios.value = saved.audios || []; result.value = saved.result || null; }
  status.value = saved ? "已恢复本地工程" : "尚未创建工程；在编辑器中添加本地素材即可。";
  await nextTick(); visible.value = true;
} catch (error) { report("读取失败：" + error.message, "error"); }

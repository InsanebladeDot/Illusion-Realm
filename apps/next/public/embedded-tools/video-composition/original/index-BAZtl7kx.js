import { t as requireVue } from "./vue-vendor-CQe4N-Nh.js";
const { h } = requireVue();
const icon = (name, nodes) => (props, { attrs }) => h("svg", { xmlns: "http://www.w3.org/2000/svg", width: props.size ?? 24, height: props.size ?? 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": props.strokeWidth ?? 2, "stroke-linecap": "round", "stroke-linejoin": "round", ...attrs }, nodes.map(([tag, attributes]) => h(tag, attributes)));
export { icon as _t };
// 图标节点参数与原主应用对应导出逐项核对；只替换原图标组件的宿主依赖。
const X = icon("x", [["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]]);
const Plus = icon("plus", [["path", { d: "M5 12h14" }], ["path", { d: "M12 5v14" }]]);
const Image = icon("image", [["rect", { x: 3, y: 3, width: 18, height: 18, rx: 2, ry: 2 }], ["circle", { cx: 9, cy: 9, r: 2 }], ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" }]]);
const Video = icon("video", [["path", { d: "m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" }], ["rect", { x: 2, y: 6, width: 14, height: 12, rx: 2 }]]);
const Clapperboard = icon("clapperboard", [["path", { d: "M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" }], ["path", { d: "m6.2 5.3 3.1 3.9" }], ["path", { d: "m12.4 3.4 3.1 4" }], ["path", { d: "M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" }]]);
export { X as W, Plus as et, Image as ot, Video as q, Clapperboard as ut };
const helper = (component, entries) => { const options = component.__vccOpts || component; for (const [key, value] of entries) options[key] = value; return options; };
export { helper as qi };
const notify = (value, type = "info") => {
  // 原下载调用不等待写盘，成功反馈交给嵌入宿主的真实系统框回执。
  if (value === "视频已导出到本地" && window.__videoLocalDownload) return { close: () => {} };
  const message = (typeof value === "string" ? value : value?.message || "").replace("视频合成并上传成功", "视频合成已保存到本机");
  const node = document.createElement("div"); node.className = "local-toast"; node.dataset.level = type; node.textContent = message; document.body.append(node);
  window.__videoHostEvents?.push({ type: "message", level: type, message });
  setTimeout(() => node.remove(), 4500); return { close: () => node.remove() };
};
const messages = new Proxy(notify, { get: (_, key) => key === "closeAll" ? () => document.querySelectorAll(".local-toast").forEach((node) => node.remove()) : (text) => notify(text, key) });
export { messages as rc };
export const s = () => ({ downloadBlob: (blob, settings) => window.__videoLocalDownload(blob, settings), downloadDataUrl: (url, settings) => window.__videoLocalDownload(url, settings) });

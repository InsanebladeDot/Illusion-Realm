// 原合成快照的主进程反证边界，与 shared 分别校验，不运行时 require TypeScript。
// 原组件字段可以随原构建保持，但不能包含可执行对象、无限数组或临时素材地址。
const canvas = require("./project-validation");
/** @param {unknown} state */
function validState(state) {
  let count = 0;
  /** @param {unknown} item @param {number} depth @param {string} [key] @returns {boolean} */
  const visit = (item, depth, key = "") => {
    if (++count > 100000 || depth > 16) return false;
    if (typeof item === "string") return item.length <= 32767 && (!["src", "url"].includes(key) || /^composition-asset:[a-zA-Z0-9-]+$/.test(item));
    if (item === null || typeof item === "boolean") return true;
    if (typeof item === "number") return Number.isFinite(item);
    if (Array.isArray(item)) return item.length <= 5000 && item.every(child => visit(child, depth + 1));
    return !!item && typeof item === "object" && Object.entries(item).every(([name, child]) => !["__proto__", "constructor", "prototype"].includes(name) && visit(child, depth + 1, name));
  };
  return !!state && typeof state === "object" && !Array.isArray(state) && "videoClips" in state && Array.isArray(state.videoClips) && "audioClips" in state && Array.isArray(state.audioClips) && visit(state, 0);
}
/** @param {unknown} value */
function composition(value) {
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("state" in value) || !validState(value.state) || !("assets" in value) || !Array.isArray(value.assets) || value.assets.length > 5000) return false;
  if (!value.assets.every(item => item && typeof item.id === "string" && /^[a-zA-Z0-9-]{1,200}$/.test(item.id) && canvas.media(item.media))) return false;
  const known = new Set(value.assets.map(item => item.id));
  return known.size === value.assets.length && references(value.state, known);
}
// 正文字节长度在主进程重新核对，不能只信页面说它是一个小 MP4。
// 只接受已有三类媒体后缀；文件名不能包含目录或设备路径。
/** @param {unknown} value @returns {value is import('@illusion-realm/shared').CompositionMediaRequest} */
function mediaRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !["name", "workspace", "fileName", "kind", "bytes", "download"].includes(key))) return false;
  if (!("name" in value) || typeof value.name !== "string" || value.name.length > 80 || !("fileName" in value) || typeof value.fileName !== "string" || !/^[^<>:"/\\|?*\x00-\x1f]{1,255}$/.test(value.fileName)) return false;
  if (!("kind" in value) || !["image", "video", "audio"].includes(String(value.kind)) || !("download" in value) || typeof value.download !== "boolean") return false;
  if (!("bytes" in value) || !(value.bytes instanceof Uint8Array) || value.bytes.byteLength < 1 || value.bytes.byteLength > 256 * 1024 * 1024) return false;
  return (!("workspace" in value) || value.workspace === undefined || canvas.workspace(value.workspace)) && canvas.EXTENSIONS[/** @type {'image'|'video'|'audio'} */ (value.kind)].includes(value.fileName.split(".").pop()?.toLowerCase() || "");
}
module.exports = { composition, validState, mediaRequest };

// 独立反证与渲染 schema 同义：状态中的每份素材必须能在资产表中找到。
// 未知编号不回落成外部 URL，避免损坏工程悄悄改成网络访问。
/** @param {unknown} value @param {Set<string>} known @param {string} [key] @returns {boolean} */
function references(value, known, key = "") {
  if (typeof value === "string" && ["src", "url"].includes(key)) return known.has(value.slice("composition-asset:".length));
  if (Array.isArray(value)) return value.every(child => references(child, known));
  return !value || typeof value !== "object" || Object.entries(value).every(([name, child]) => references(child, known, name));
}

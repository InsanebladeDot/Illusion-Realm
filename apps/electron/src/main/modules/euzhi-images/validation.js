// 图片服务的主进程校验，与 shared schema 配对；未知字段也拒绝。
// 不运行时加载 Zod，保持 Electron 打包后仍只依赖现有 CommonJS。
// 校验先于读密钥、读图片与发请求，坏载荷不能产生费用或磁盘副作用。
const canvas = require("../canvas/project-validation");
const MODELS = ["gpt-image-2", "gpt-image-2.5-sunburst", "gpt-image-2.5-flare"];
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function object(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value */
function identity(value) { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
// 和共享校验保持一致，画布保存和生成请求都用这条尺寸规则。
/** @param {unknown} value */
function presetSize(value) {
  if (typeof value !== "string" || !/^[1-9]\d{0,3}x[1-9]\d{0,3}$/.test(value)) return false;
  const sides = value.split("x").map(Number);
  return [1024, 2048].includes(Math.max(...sides)) && sides.every(side => side % 8 === 0);
}
/** @param {unknown} value */
function configuration(value) {
  return object(value) && Object.keys(value).every(key => ["provider", "model", "size", "quality"].includes(key))
    && value.provider === "euzhi" && typeof value.model === "string" && MODELS.includes(value.model)
    && presetSize(value.size) && value.quality === "medium";
}
// 输入数量按用途决定，不按模型名字猜测。三种服务模型使用同一接口格式。
// text 必须没有图片，避免无意把本地参考图传给远端。
// image 必须恰好一张，不截断多图以掩盖错误。
// reference 可一到八张，顺序是调用者确认的边顺序。
// 文件形状先复用画布媒体校验，实际归属和内容在读取边界再检查。
/** @param {unknown} value @returns {value is import('@illusion-realm/shared').EuzhiImageRequest} */
function request(value) {
  if (!object(value) || Object.keys(value).some(key => !["id", "name", "workspace", "configuration", "mode", "prompt", "n", "images"].includes(key))) return false;
  if (!identity(value.id) || typeof value.name !== "string" || value.name.length > 80 || value.workspace !== undefined && !canvas.workspace(value.workspace)) return false;
  if (!configuration(value.configuration) || typeof value.prompt !== "string" || !value.prompt.trim() || value.prompt.trim().length > 4000) return false;
  if (typeof value.n !== "number" || ![1, 2, 4, 6].includes(value.n) || !Array.isArray(value.images) || value.images.length > 8) return false;
  if (!value.images.every(item => canvas.media(item) && item?.kind === "image")) return false;
  return value.mode === "text" ? value.images.length === 0 : value.mode === "image" ? value.images.length === 1 : value.mode === "reference" && value.images.length >= 1;
}
module.exports = { MODELS, configuration, identity, request };

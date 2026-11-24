// 把真实 Images 响应转为画布受管资产；不在 renderer 中传递大段 Base64。
// 输入先验归属再读取，输出先真实解码再写盘，错误不伪造节点结果。
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { nativeImage } = require("electron");
const { allocateWorkspace } = require("../canvas/project-assets");
const transport = require("./transport");

// 每张参考图必须位于 user 下、已有归属标记的工程 Picture 目录。
// 复制节点可以引用另一工程的受管图片，但不能借 API 上传任意系统文件。
// realpath 后检查相对位置，符号链接不能把允许的表面路径引向外部。
// 大小以磁盘 stat 为准，不相信页面提供的 size；整批最多 64 MiB。
// 当前上传只接受能识别签名的 PNG、JPEG、WebP，其他格式明确拒绝。
/** @param {string} root @param {import('@illusion-realm/shared').EuzhiImageRequest['images'][number]} image */
async function readReference(root, image) {
  const source = await fs.realpath(image.path);
  const parts = path.relative(await fs.realpath(root), source).split(path.sep);
  if (parts.length !== 3 || parts[0] === ".." || parts[1] !== "Picture") throw new Error("invalid-input-image");
  const owner = await fs.readFile(path.join(root, parts[0], ".canvas-owner"), "utf8");
  if (!require("./validation").identity(owner)) throw new Error("invalid-input-image");
  const file = await fs.open(source, "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw new Error("invalid-input-image");
    const bytes = await file.readFile();
    const mime = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : bytes[0] === 255 && bytes[1] === 216 ? "image/jpeg" : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : "";
    if (!mime || bytes.length > 20 * 1024 * 1024) throw new Error("invalid-input-image");
    return { bytes, mime };
  } finally { await file.close(); }
}
// 文生图只发 JSON；两种有图模式都使用官方 edits 的 image[] 数组字段。
// input mode 已在 IPC 边界验证，这里不把空图编辑自动降级成文生图。
// 图片按显式连接顺序加入表单，用户的“第一张参考”保持稳定。
// 提交前处理完全部输入，避免发到一半才发现第二张文件缺失。
/** @param {string} root @param {import('@illusion-realm/shared').EuzhiImageRequest} request @param {AbortSignal} signal */
async function payload(root, request, signal) {
  const { model, size, quality } = request.configuration;
  const fields = { model, prompt: request.prompt.trim(), size, n: request.n };
  // Flare 文生图沿用用户跑通的请求，明确传尺寸，画质由服务默认决定。
  if (request.mode === "text") {
    return JSON.stringify(model === "gpt-image-2.5-flare" ? fields : { ...fields, quality });
  }
  const form = new FormData(); let total = 0;
  for (const [key, value] of Object.entries({ ...fields, quality })) form.append(key, String(value));
  for (const image of request.images) {
    signal.throwIfAborted();
    const { bytes, mime } = await readReference(root, image); total += bytes.length;
    if (total > 64 * 1024 * 1024) throw new Error("invalid-input-image");
    form.append("image[]", new Blob([new Uint8Array(bytes)], { type: mime }), `reference.${mime.split("/")[1]}`);
  }
  return form;
}
// 响应必须有非空 data；url 与 b64_json 都按实际图片解码检查。
// 不把 HTTP 200 当成生成成功，安全过滤或坏 JSON 仍然属于失败。
// 超过请求数量的响应拒绝，避免无界写盘；少于请求数量则保留有效结果。
/** @param {unknown} response @param {number} count */
function items(response, count) {
  if (!response || typeof response !== "object" || !("data" in response) || !Array.isArray(response.data) || !response.data.length || response.data.length > count) throw new Error("empty-result");
  return /** @type {{url?:unknown,b64_json?:unknown}[]} */ (response.data);
}
/** @param {{url?:unknown,b64_json?:unknown}} item @param {AbortSignal} signal @param {typeof transport} io */
async function imageBytes(item, signal, io) {
  const bytes = typeof item.b64_json === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(item.b64_json) ? Buffer.from(item.b64_json, "base64") : typeof item.url === "string" ? await io.download(item.url, signal) : null;
  if (!bytes || bytes.length > 32 * 1024 * 1024) throw new Error("empty-result");
  const decoded = nativeImage.createFromBuffer(bytes);
  if (decoded.isEmpty()) throw new Error("empty-result");
  const size = decoded.getSize();
  if (size.width * size.height > 4096 * 4096) throw new Error("response-too-large");
  return decoded.toPNG();
}
// 所有新文件使用独立名字，不覆盖导入素材或上次结果。
// 部分写入后失败会清理本次路径；不清理目录或其他任务的资产。
// 取消在每次磁盘提交前后再检查，已取消的请求不会返回成功结果。
// 输出统一真实 PNG，与扩展名、localfile 协议和工程打包约定一致。
/** @param {string} root @param {import('@illusion-realm/shared').EuzhiImageRequest} request @param {unknown} response @param {AbortSignal} signal @param {typeof transport} io */
async function saveResults(root, request, response, signal, io) {
  const images = items(response, request.n);
  const workspace = await allocateWorkspace(root, { name: request.name, workspace: request.workspace, files: [] });
  const directory = path.join(root, workspace.folder, "Picture");
  await fs.mkdir(directory, { recursive: true });
  if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error("invalid-workspace");
  const media = []; const written = [];
  try {
    for (const item of images) {
      const bytes = await imageBytes(item, signal, io); signal.throwIfAborted();
      const name = `euzhi-${randomUUID()}.png`, target = path.join(directory, name);
      written.push(target); await fs.writeFile(target, bytes, { flag: "wx" });
      media.push({ kind: /** @type {const} */ ("image"), path: target, name, size: bytes.length });
    }
    signal.throwIfAborted(); return { workspace, media };
  } catch (error) { await Promise.all(written.map(file => fs.rm(file, { force: true }).catch(() => {}))); throw error; }
}
/** @param {string} root @param {import('@illusion-realm/shared').EuzhiImageRequest} request @param {string} key @param {AbortSignal} signal @param {typeof transport} [io] */
async function generate(root, request, key, signal, io = transport) {
  const input = await payload(root, request, signal);
  signal.throwIfAborted();
  const response = await io.submit(request.mode === "text" ? "generations" : "edits", key, input, signal);
  return saveResults(root, request, response, signal, io);
}
module.exports = { generate, payload, readReference, items, imageBytes };

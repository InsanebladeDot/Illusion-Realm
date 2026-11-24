// 真实图片任务的生命周期属于发起窗口；关闭或取消都中止网络和迟到结果。
// 主进程只向固定服务发送图片，网页不能借本通道指定任意端点或读取密钥。
const path = require("node:path");
const { IPC_CHANNELS } = require("../../../common/ipc-channels");
const { registerHandle } = require("../../ipc/result");
const { getDefaultUserDataPath } = require("../../storage/user-data-paths");
const validation = require("./validation");
const credentials = require("./credentials");
const service = require("./service");
/** @type {Map<number,{id:string,controller:AbortController}>} */
const jobs = new Map();
/** @param {Electron.WebContents} sender */
function trusted(sender) { return ["app://app/", "http://localhost:3000/", "http://127.0.0.1:3000/"].some(origin => sender.getURL().startsWith(origin)); }
// 固定错误标识由 renderer 翻译，原始网络错误可能带带签名的 URL，不能直传。
// 超时不重试，结束状态保留未知扣费风险说明，不伪装远端已停止计费。
// 取消只停止本地等待和回填，服务端没有文档化的撤销计费接口。
/** @param {Electron.WebContents} sender @param {import('@illusion-realm/shared').EuzhiImageRequest} request @param {string} root @param {string} [secretRoot] */
async function run(sender, request, root, secretRoot) {
  if (!trusted(sender)) throw new Error("euzhi-caller-denied");
  if (jobs.has(sender.id)) throw new Error("euzhi-busy");
  const key = credentials.readKey(secretRoot);
  if (!key) throw new Error("euzhi-key-missing");
  const controller = new AbortController(); jobs.set(sender.id, { id: request.id, controller });
  const destroyed = () => controller.abort(new Error("cancelled"));
  const timer = setTimeout(() => controller.abort(new Error("timeout")), 180000);
  sender.once("destroyed", destroyed);
  try { return await service.generate(root, request, key, controller.signal); }
  catch (error) {
    const reason = controller.signal.aborted ? controller.signal.reason : error;
    const message = reason instanceof Error ? reason.message : "failed";
    throw new Error(`euzhi-${/^(http-\d{3}|cancelled|timeout|invalid-input-image|empty-result|response-too-large)$/.test(message) ? message : "failed"}`);
  } finally { clearTimeout(timer); sender.removeListener("destroyed", destroyed); jobs.delete(sender.id); }
}
// 图片状态和写入共用同一分区，不能因 Agent 已配置就声称图片密钥可用。
// null 只由清除入口产生，空字符串和换行密钥均拒绝。
// 校验器处理任意值，不依赖 TypeScript 对跨进程载荷作保证。
// root 与 secretRoot 是测试注入，不对 renderer 开放任意路径参数。
/** @param {{root?:string,secretRoot?:string}} [options] */
function registerEuzhiImageHandlers(options = {}) {
  // 生成、导入和工程库共用同一素材根；沿用原归属校验，不为新目录放宽文件权限。
  const root = options.root || path.join(path.dirname(getDefaultUserDataPath()), "Infinite Canvas");
  const check = /** @param {unknown[]} args */ (args) => args.length === 0 ? null : "euzhi-invalid-argument";
  registerHandle(IPC_CHANNELS.EUZHI_IMAGE_SECRET_STATUS, event => { if (!trusted(event.sender)) throw new Error("euzhi-caller-denied"); return credentials.status(options.secretRoot); }, check);
  registerHandle(IPC_CHANNELS.EUZHI_IMAGE_SECRET_SET, (event, key) => { if (!trusted(event.sender)) throw new Error("euzhi-caller-denied"); return credentials.update(key, options.secretRoot); }, args => args.length === 1 && typeof args[0] === "string" && !!args[0].trim() && args[0].length <= 4096 && !/[\r\n]/.test(args[0]) ? null : "euzhi-invalid-key");
  registerHandle(IPC_CHANNELS.EUZHI_IMAGE_SECRET_CLEAR, event => { if (!trusted(event.sender)) throw new Error("euzhi-caller-denied"); return credentials.update(null, options.secretRoot); }, check);
  registerHandle(IPC_CHANNELS.EUZHI_IMAGE_GENERATE, (event, request) => run(event.sender, request, root, options.secretRoot), args => args.length === 1 && validation.request(args[0]) ? null : "euzhi-invalid-request");
  registerHandle(IPC_CHANNELS.EUZHI_IMAGE_CANCEL, (event, id) => {
    if (!trusted(event.sender)) throw new Error("euzhi-caller-denied");
    const job = jobs.get(event.sender.id);
    if (!job || job.id !== id) return false;
    job.controller.abort(new Error("cancelled")); return true;
  }, args => args.length === 1 && validation.identity(args[0]) ? null : "euzhi-invalid-request");
}
module.exports = { registerEuzhiImageHandlers };

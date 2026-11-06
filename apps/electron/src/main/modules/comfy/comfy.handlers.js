/** ComfyUI IPC：校验请求及取消标识，按发送窗口隔离生成会话。 */
const { IPC_CHANNELS } = require("../../../common/ipc-channels");
const { registerHandle } = require("../../ipc/result");
const generation = require("./comfy-generation");
// 内存释放复用同域请求器；不经过生成会话表，避免误取消别人的任务。
// 校验器与请求函数放在一起，让独立回归也能验证相同的地址边界。
// registerHandle 继续承担异常收敛，不在服务中重复包装 IPC 结果。
const { freeComfyMemory, validateFreeMemory } = require("./comfy-memory");

/** @param {unknown} value */
function validRequestId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/** 与 ComfyApiPromptSchema 等价；不在主进程引入开发依赖 zod。 @param {unknown} value */
function validPrompt(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((node) => node && typeof node === "object" && !Array.isArray(node)
    && typeof node.class_type === "string" && node.class_type.length > 0
    && node.inputs && typeof node.inputs === "object" && !Array.isArray(node.inputs)
    && (node._meta === undefined || (node._meta && typeof node._meta === "object" && !Array.isArray(node._meta))));
}

const DEFAULT_SERVER = "127.0.0.1:8188";
const PROXY_UNAVAILABLE =
  "ComfyUI 主进程模块未加载，请完全退出并重新运行 pnpm dev";

/**
 * ComfyUI 请求代理。
 * 加载失败时为 null，因此这里按需读取并给出可读错误，避免注册期就崩。
 *
 * 类型直接取 comfyProxy.js 的真实导出（该文件已转正、不再是 any），
 * 因此这里的签名会与实现自动对齐 —— 实现改了签名，这里立刻编译失败。
 *
 * 注意：必须用 typeof import(...) 而非 typeof require(...) —— 后者会与变量自身
 * 互相污染成循环推断（TS7034/TS7005）。
 * @type {typeof import("./proxy") | null}
 */
let comfyProxy = null;
try {
  comfyProxy = require("./proxy");
} catch (error) {
  console.error("[IPC] comfyProxy 加载失败:", error);
  comfyProxy = null;
}

/**
 * 取可用的 comfyProxy，未加载时抛出可读错误
 * @returns {typeof import("./proxy")}
 */
function getComfyProxy() {
  if (!comfyProxy) {
    throw new Error(PROXY_UNAVAILABLE);
  }
  return comfyProxy;
}

/**
 * 注册 ComfyUI 代理通道（生成 / 上传图片 / 拉取模型列表）
 * @returns {void}
 */
function registerComfyHandlers() {
  // 固定动作只接收服务地址，不能由前端选择路由或卸载标志。
  // 返回 true 的含义是远端已经接收请求，并非释放内存已经完成。
  // 无论任务是否正在执行，都交给 ComfyUI 自己安排释放时机。
  // 非法输入由注册助手转成 INVALID_ARGUMENT，不应启动 HTTP 请求。
  // 服务报错也走统一失败结果，确保按钮不会收到假成功。
  // 不与生成队列共用取消逻辑，用户的待执行任务继续保留。
  registerHandle(IPC_CHANNELS.COMFY_FREE_MEMORY,
    (_event, serverAddress) => freeComfyMemory(serverAddress), validateFreeMemory);
  registerHandle(
    IPC_CHANNELS.COMFY_GENERATE,
    /**
     * @param {Electron.IpcMainInvokeEvent} event
     * @param {object} prompt ComfyUI API 工作流
     * @param {string} [serverAddress]
     * @param {string} [requestId]
     * @returns {Promise<object>}
     */
    async (event, prompt, serverAddress, requestId) =>
      generation.generate(event.sender.id, prompt, serverAddress || DEFAULT_SERVER, requestId),
    /** @param {unknown[]} args @returns {string | null} */
    (args) => {
      const [prompt, server, requestId] = args;
      if (!validPrompt(prompt)) return "无效的 ComfyUI prompt";
      if (args.length > 3) return "Invalid ComfyUI arguments";
      if (server !== undefined && (typeof server !== "string" || !server || server.length > 255)) return "Invalid ComfyUI server";
      if (requestId !== undefined && !validRequestId(requestId)) return "Invalid ComfyUI request ID";
      return null;
    }
  );

  registerHandle(IPC_CHANNELS.COMFY_CANCEL,
    /** @param {Electron.IpcMainInvokeEvent} event @param {string} requestId */
    (event, requestId) => generation.cancel(event.sender.id, requestId),
    (args) => args.length === 1 && validRequestId(args[0]) ? null : "Invalid ComfyUI request ID"
  );

  registerHandle(
    IPC_CHANNELS.COMFY_UPLOAD_IMAGE,
    /**
     * @param {Electron.IpcMainInvokeEvent} _event
     * @param {string | undefined} serverAddress
     * @param {Parameters<typeof import("./proxy").uploadImageToComfy>[1]} payload
     * @returns {Promise<object>}
     */
    async (_event, serverAddress, payload) =>
      getComfyProxy().uploadImageToComfy(serverAddress || DEFAULT_SERVER, payload),
    /** @param {unknown[]} args @returns {string | null} */
    (args) => {
      const payload = args[1];
      if (!payload || typeof payload !== "object") return "无效的上传参数";
      const { filename, dataBase64 } = /** @type {{ filename?: unknown, dataBase64?: unknown }} */ (
        payload
      );
      if (typeof filename !== "string" || !filename) {
        return "payload.filename 必须是非空字符串";
      }
      if (typeof dataBase64 !== "string" || !dataBase64) {
        return "payload.dataBase64 必须是非空字符串";
      }
      return null;
    }
  );

  registerHandle(
    IPC_CHANNELS.COMFY_LIST_MODELS,
    /**
     * @param {Electron.IpcMainInvokeEvent} _event
     * @param {string | undefined} serverAddress
     * @returns {Promise<object>}
     */
    async (_event, serverAddress) =>
      getComfyProxy().listComfyModels(serverAddress || DEFAULT_SERVER)
  );
}

module.exports = { registerComfyHandlers };

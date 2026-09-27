const { IPC_CHANNELS } = require("../ipcChannels");
const { registerHandle } = require("../ipcHandlers");

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
 * @type {typeof import("../comfyProxy") | null}
 */
let comfyProxy = null;
try {
  comfyProxy = require("../comfyProxy");
} catch (error) {
  console.error("[IPC] comfyProxy 加载失败:", error);
  comfyProxy = null;
}

/**
 * 取可用的 comfyProxy，未加载时抛出可读错误
 * @returns {typeof import("../comfyProxy")}
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
  registerHandle(
    IPC_CHANNELS.COMFY_GENERATE,
    /**
     * @param {Electron.IpcMainInvokeEvent} _event
     * @param {object} prompt ComfyUI API 工作流
     * @param {string} [serverAddress]
     * @returns {Promise<object>}
     */
    async (_event, prompt, serverAddress) =>
      getComfyProxy().generateWithComfy(serverAddress || DEFAULT_SERVER, prompt),
    /** @param {unknown[]} args @returns {string | null} */
    (args) => {
      const [prompt] = args;
      if (!prompt || typeof prompt !== "object") return "无效的 ComfyUI prompt";
      return null;
    }
  );

  registerHandle(
    IPC_CHANNELS.COMFY_UPLOAD_IMAGE,
    /**
     * @param {Electron.IpcMainInvokeEvent} _event
     * @param {string | undefined} serverAddress
     * @param {Parameters<typeof import("../comfyProxy").uploadImageToComfy>[1]} payload
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

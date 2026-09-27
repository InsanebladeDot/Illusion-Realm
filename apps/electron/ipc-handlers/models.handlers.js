const { IPC_CHANNELS } = require("../ipcChannels");
const { registerHandle } = require("../ipcHandlers");
const { scanModelsInDirectory } = require("../modelScanner");

/**
 * modelScanner 接受的模型类型（从其签名派生，避免与实现重复声明）。
 * @typedef {Parameters<typeof scanModelsInDirectory>[1]} ScanModelType
 */

/**
 * 允许扫描的模型类型。数组元素逐个声明为 ScanModelType：
 * 往 modelScanner 签名里增删类型时，这里会立刻编译失败，
 * 避免「实现支持但白名单没跟上」。
 *
 * 局限：`ScanModelType[]` 只保证**元素合法**，不保证**覆盖完整** ——
 * 若只是往联合类型里追加成员而不改此处，编译不会失败（运行期会拒绝该类型）。
 * 因此新增模型类型时，必须同步这里。
 * @type {ScanModelType[]}
 */
const MODEL_TYPES = ["checkpoint", "lora"];

/** 运行期查表用。显式 Set<string>：数组那边已经承担漂移约束，这里只需能接受任意 string */
const MODEL_TYPE_SET = /** @type {Set<string>} */ (new Set(MODEL_TYPES));

/**
 * 运行期判断是否为受支持的模型类型
 * @param {string} value
 * @returns {value is ScanModelType}
 */
function isScanModelType(value) {
  return MODEL_TYPE_SET.has(value);
}

/**
 * 校验 models:scan 入参
 * @param {unknown[]} args [dirPath, type]
 * @returns {string | null} 错误文案；null 表示通过
 */
function validateScanArgs(args) {
  const [dirPath, type] = args;
  if (!dirPath || typeof dirPath !== "string") return "dirPath 必须是非空字符串";
  if (typeof type !== "string" || !isScanModelType(type)) {
    return `type 必须是 ${MODEL_TYPES.join(" 或 ")}`;
  }
  return null;
}

/**
 * 本地模型扫描（Checkpoint / LoRA）
 * @returns {void}
 */
function registerModelHandlers() {
  registerHandle(
    IPC_CHANNELS.MODELS_SCAN,
    /**
     * @param {Electron.IpcMainInvokeEvent} _event
     * @param {string} dirPath 模型目录
     * @param {ScanModelType} type 模型类型
     */
    async (_event, dirPath, type) => scanModelsInDirectory(dirPath, type),
    validateScanArgs
  );
}

module.exports = { registerModelHandlers };

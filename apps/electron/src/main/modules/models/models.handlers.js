/**
 * 扫描器与模型资料读取同属 models 域；下载队列仍通过 downloads 子域访问。
 * 资料恢复可以依赖 Civitai，但模型扫描本身不以远端站点在线为前提。
 * 通道常量来自 common，注册包装来自 ipc，均不复制进模型业务目录。
 */
/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 * result：业务错误不跨进程抛出，目录迁移不能改变失败形状。
 */
const { IPC_CHANNELS } = require("../../../common/ipc-channels");
const { registerHandle } = require("../../ipc/result");
const { scanModelsInDirectory } = require("./scanner");
const { readLocalModelMetadata, validateMetadataArgs } = require("./local-model-metadata");
// 本地识别复用扫描目录授权、下载元数据格式和目录互斥锁。
// IPC 入参先做形状检查，异步真实路径检查在服务内部完成。
// 服务返回稳定的失败状态，避免日志输出包含路径的系统异常。
const { recoverLocalModel, validateRecoveryArgs } = require("./local-model-recovery");

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
const MODEL_TYPES = ["checkpoint", "lora", "embedding"];

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
  // 界面：本地模型详情中的「通过 SHA-256 补全资料」。
  // 仅允许单个路径，用户不能指定摘要、查询来源或保存位置。
  // registerHandle 统一封装成功结果和参数验证失败。
  // 密钥读取、流式计算和文件落盘均留在主进程。
  // 操作不依赖页面生命周期，切页后已经提交的资料仍会存在。
  // 重复点击与多窗口竞争由服务并发上限及文件夹锁处理。
  registerHandle(IPC_CHANNELS.MODELS_RECOVER_METADATA,
    /** @param {Electron.IpcMainInvokeEvent} _event @param {string} filePath */
    async (_event, filePath) => recoverLocalModel(filePath), validateRecoveryArgs);
  registerHandle(IPC_CHANNELS.MODELS_READ_METADATA,
    /** @param {Electron.IpcMainInvokeEvent} _event @param {string[]} filePaths */
    async (_event, filePaths) => readLocalModelMetadata(filePaths), validateMetadataArgs);
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

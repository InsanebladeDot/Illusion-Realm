/**
 * 默认路径继续从统一 storage 解析器获取，不能以 handler 所在目录决定保存位置。
 */
/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 * result：业务错误不跨进程抛出，目录迁移不能改变失败形状。
 */
const { IPC_CHANNELS } = require("../../common/ipc-channels");
const { registerHandle } = require("../ipc/result");
const { getDefaultOutputPath, ensureDirectory } = require("./output-paths");

/** 默认输出目录：与软件目录同级的「{软件目录名} Output」，返回前确保存在 */
function registerPathHandlers() {
  registerHandle(IPC_CHANNELS.PATHS_GET_DEFAULT_OUTPUT, async () => {
    const dirPath = getDefaultOutputPath();
    ensureDirectory(dirPath);
    return dirPath;
  });
}

module.exports = { registerPathHandlers };

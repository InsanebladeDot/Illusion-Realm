/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * output-paths：输出路径和同名文件避让统一由 storage 处理。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * output-paths：空配置表示使用默认输出目录，显式路径必须保持不被覆盖。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 */
const { shell } = require("electron");
const fs = require("fs");
const path = require("path");

const { IPC_CHANNELS } = require("../../common/ipc-channels");
const { registerHandle } = require("../ipc/result");
const { resolveOutputPath, ensureDirectory } = require("../storage/output-paths");

/**
 * 在系统文件管理器中打开目标：传入文件时打开其所在目录
 * @returns {void}
 */
function registerShellHandlers() {
  registerHandle(
    IPC_CHANNELS.SHELL_OPEN_PATH,
    /**
     * @param {Electron.IpcMainInvokeEvent} _event
     * @param {string} targetPath 文件或目录的绝对路径
     * @returns {Promise<string>} 实际打开的目录
     */
    async (_event, targetPath) => {
      const resolved = resolveOutputPath(
        fs.existsSync(targetPath) && !fs.statSync(targetPath).isDirectory()
          ? path.dirname(targetPath)
          : targetPath
      );
      ensureDirectory(resolved);
      const failure = await shell.openPath(resolved);
      if (failure) {
        throw new Error(failure);
      }
      return resolved;
    },
    /** @param {unknown[]} args @returns {string | null} */
    (args) => {
      const [targetPath] = args;
      if (!targetPath || typeof targetPath !== "string") return "无效的路径";
      return null;
    }
  );
}

module.exports = { registerShellHandlers };

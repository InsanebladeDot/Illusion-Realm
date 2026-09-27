const { shell } = require("electron");
const fs = require("fs");
const path = require("path");

const { IPC_CHANNELS } = require("../ipcChannels");
const { registerHandle } = require("../ipcHandlers");
const { resolveOutputPath, ensureDirectory } = require("../outputPaths");

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

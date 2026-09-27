const { IPC_CHANNELS } = require("../ipcChannels");
const { registerHandle } = require("../ipcHandlers");
const { getDefaultOutputPath, ensureDirectory } = require("../outputPaths");

/** 默认输出目录：与软件目录同级的「{软件目录名} Output」，返回前确保存在 */
function registerPathHandlers() {
  registerHandle(IPC_CHANNELS.PATHS_GET_DEFAULT_OUTPUT, async () => {
    const dirPath = getDefaultOutputPath();
    ensureDirectory(dirPath);
    return dirPath;
  });
}

module.exports = { registerPathHandlers };

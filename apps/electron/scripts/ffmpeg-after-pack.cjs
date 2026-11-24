/** 验证 electron-builder 已把 FFmpeg 和能运行的 Agent Python 复制进资源目录。 */
const path = require("node:path");
const { Arch } = require("electron-builder");
const { validateBundle } = require("./check-ffmpeg-bundle.cjs");
const { verifyAgentPython } = require("./prepare-agent-python.cjs");
module.exports = async (context) => {
  const resources = path.join(context.appOutDir, "resources");
  validateBundle(path.join(resources, "ffmpeg"), context.electronPlatformName, Arch[context.arch]);
  if (context.electronPlatformName === "win32") verifyAgentPython(path.join(resources, "agent", "python"));
};

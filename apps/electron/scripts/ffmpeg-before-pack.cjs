/** 打包前核对 FFmpeg，并准备 Windows 客户端的图标和 Agent Python。 */
const { Arch } = require("electron-builder");
const { validateBundle } = require("./check-ffmpeg-bundle.cjs");
const { prepareWindowsIcon } = require("./prepare-windows-icon.cjs");
const { prepareAgentPython } = require("./prepare-agent-python.cjs");
module.exports = async (context) => {
  const arch = Arch[context.arch];
  validateBundle(undefined, context.electronPlatformName, arch);
  if (context.electronPlatformName !== "win32") return;
  await prepareWindowsIcon();
  await prepareAgentPython(arch);
};

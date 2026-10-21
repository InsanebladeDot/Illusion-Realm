/** Validate bundled FFmpeg resources and prepare the Windows icon before packaging. */
const { Arch } = require("electron-builder");
const { validateBundle } = require("./check-ffmpeg-bundle.cjs");
const { prepareWindowsIcon } = require("./prepare-windows-icon.cjs");
module.exports = async (context) => {
  validateBundle(undefined, context.electronPlatformName, Arch[context.arch]);
  if (context.electronPlatformName === "win32") await prepareWindowsIcon();
};

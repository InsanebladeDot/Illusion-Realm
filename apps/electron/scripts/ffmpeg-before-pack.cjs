/** Stop packaging before a release can silently omit its required native FFmpeg resources. */
const { Arch } = require("electron-builder");
const { validateBundle } = require("./check-ffmpeg-bundle.cjs");
module.exports = async (context) => validateBundle(undefined, context.electronPlatformName, Arch[context.arch]);

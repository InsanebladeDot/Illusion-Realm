/** Verify resources after electron-builder copies them, including the bundled executables and notices. */
const path = require("node:path");
const { Arch } = require("electron-builder");
const { validateBundle } = require("./check-ffmpeg-bundle.cjs");
module.exports = async (context) => validateBundle(path.join(context.appOutDir, "resources", "ffmpeg"), context.electronPlatformName, Arch[context.arch]);

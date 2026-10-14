/** Validate pinned FFmpeg resources and executable versions before/after packaging; fail when a bundle is missing. */
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const config = require("./ffmpeg-bundle.json");
const BUNDLE_DIR = path.resolve(__dirname, "../bin/ffmpeg");
const REQUIRED = ["ffmpeg.exe", "ffprobe.exe", "LICENSE.txt", "UPSTREAM-README.txt", "SOURCE.txt"];
function validateBundle(folder = BUNDLE_DIR, platform = process.platform, arch = process.arch) {
  if (platform !== config.platform || arch !== config.arch) throw new Error(`Bundled FFmpeg supports ${config.platform}/${config.arch}; prepare a matching bundle before packaging ${platform}/${arch}.`);
  if (!fs.existsSync(path.join(folder, "bundle.json"))) throw new Error("Bundled FFmpeg is missing. Run pnpm prepare:ffmpeg before packaging.");
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, "bundle.json"), "utf8"));
  for (const key of ["version", "platform", "arch", "archiveSha256"]) if (manifest[key] !== config[key]) throw new Error(`FFmpeg bundle ${key} does not match the pinned build.`);
  for (const name of REQUIRED) {
    const file = path.join(folder, name);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Bundled FFmpeg is missing ${name}.`);
    const hash = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    if (hash !== manifest.files?.[name]) throw new Error(`Bundled FFmpeg integrity check failed: ${name}.`);
    if (config.files[name] && hash !== config.files[name]) throw new Error(`Bundled FFmpeg differs from the pinned archive: ${name}.`);
  }
  if (!fs.readFileSync(path.join(folder, "SOURCE.txt"), "utf8").includes(config.sourceUrl)) throw new Error("Bundled FFmpeg source notice does not match the pinned revision.");
  if (platform === process.platform && arch === process.arch) {
    for (const name of ["ffmpeg", "ffprobe"]) {
      const firstLine = execFileSync(path.join(folder, name + ".exe"), ["-version"], { windowsHide: true, timeout: 15000, encoding: "utf8" }).split(/\r?\n/)[0];
      if (!firstLine.startsWith(`${name} version ${config.version}-`)) throw new Error(`Unexpected ${name} executable version.`);
    }
  }
  console.log(`PASS bundled FFmpeg ${config.version} (${platform}/${arch}), both executables and distribution notices verified`);
}
module.exports = { validateBundle };
if (require.main === module) {
  try { validateBundle(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

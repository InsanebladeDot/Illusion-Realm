/** Force the production locator to see only bundled files, then exercise real video/GIF jobs and release guard failures. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");
const { app } = require("electron");
const { validateBundle } = require("../apps/electron/scripts/check-ffmpeg-bundle.cjs");
const { startEditJob } = require("../apps/electron/ffmpeg/jobs");
const { probeVideo } = require("../apps/electron/ffmpeg/probe");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "bundled-ffmpeg", timeoutMs: 60000 });
smoke.installWatchdog(app);
const work = fs.mkdtempSync(path.join(os.tmpdir(), "ir-bundled-ffmpeg-"));
const locatorPath = path.resolve(__dirname, "../apps/electron/ffmpeg/locate.js");
const bundle = path.resolve(__dirname, "../apps/electron/bin/ffmpeg");
const resources = process.argv[2] ? path.resolve(process.argv[2]) : null;
function isolatedLocator(packaged, resourceRoot, visibleBundle, locatorFile = locatorPath) {
  const source = fs.readFileSync(locatorFile, "utf8"), fixtureModule = { exports: {} };
  const isVisible = (file) => String(file).toLowerCase().startsWith(visibleBundle.toLowerCase() + path.sep);
  const isolatedFs = {
    statSync: (file) => { if (!isVisible(file)) throw new Error("fixture: system tool unavailable"); return fs.statSync(file); },
    existsSync: (file) => isVisible(file) && fs.existsSync(file),
    readdirSync: (file, options) => isVisible(file) ? fs.readdirSync(file, options) : [],
  };
  const localRequire = createRequire(locatorFile);
  const requireFixture = (name) => name === "electron" ? { app: { isPackaged: packaged, getAppPath: () => path.dirname(locatorFile) } } : name === "fs" ? isolatedFs : localRequire(name);
  vm.runInNewContext(source, { require: requireFixture, module: fixtureModule, __dirname: path.dirname(locatorFile), process: { platform: "win32", env: { PATH: "" }, resourcesPath: resourceRoot } }, { filename: locatorFile });
  return fixtureModule.exports.resolveTools;
}
function guardFailures() {
  const fixture = path.join(work, "broken"); fs.mkdirSync(fixture);
  assert.throws(() => validateBundle(fixture), /missing/);
  assert.throws(() => validateBundle(bundle, "win32", "arm64"), /supports/);
  fs.copyFileSync(path.join(bundle, "bundle.json"), path.join(fixture, "bundle.json"));
  assert.throws(() => validateBundle(fixture), /ffmpeg.exe/);
  fs.writeFileSync(path.join(fixture, "ffmpeg.exe"), "truncated");
  assert.throws(() => validateBundle(fixture), /integrity/);
  smoke.check("Missing bundle, missing executable, wrong architecture and modified bytes stop packaging", true);
}
async function execute(ffmpegPath, job) {
  const progress = [];
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error("fixture conversion timed out")); }, 20000);
    const child = startEditJob({ ffmpegPath, job, onProgress: (event) => progress.push(event.percent), onDone: () => { clearTimeout(timer); resolve(); }, onError: (error) => { clearTimeout(timer); reject(error); } });
  });
  assert.equal(progress.at(-1), 100);
}
async function conversions(tools) {
  const input = path.join(work, "input.mp4"), output = path.join(work, "edited.mp4"), gif = path.join(work, "output.gif");
  execFileSync(tools.ffmpegPath, ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", input], { windowsHide: true, timeout: 20000 });
  const original = await probeVideo(tools.ffprobePath, input);
  assert.equal(original.width, 160); assert.equal(original.hasAudio, true);
  await execute(tools.ffmpegPath, { mode: "single", inputPath: input, outputPath: output, trim: { start: 0.2, end: 1.8 }, speed: 2, crop: { enabled: true, width: 80, height: 60, x: 0, y: 0 }, accurateCut: true, sourceDuration: original.duration });
  const edited = await probeVideo(tools.ffprobePath, output);
  assert.equal(edited.width, 80); assert.equal(edited.height, 60); assert.equal(edited.hasAudio, true); assert.ok(edited.duration > 0.6 && edited.duration < 1.1);
  await execute(tools.ffmpegPath, { mode: "gif", inputPath: input, outputPath: gif, sourceDuration: original.duration, trim: { start: 0, end: 1 }, gif: { fps: 10, width: 80, loop: true } });
  const animation = await probeVideo(tools.ffprobePath, gif);
  assert.equal(animation.videoCodec, "gif"); assert.equal(animation.width, 80); assert.equal(animation.hasAudio, false);
  smoke.check("Bundled video probe, H264/AAC encode, trim/crop/speed, GIF palette conversion and progress=100", true);
}
async function main() {
  await app.whenReady();
  validateBundle(bundle); guardFailures();
  const resolve = isolatedLocator(false, path.join(work, "no-resources"), bundle);
  const tools = resolve();
  assert.equal(tools.source, "bundled"); assert.equal(tools.ffmpegPath, path.join(bundle, "ffmpeg.exe")); assert.equal(tools.ffprobePath, path.join(bundle, "ffprobe.exe"));
  assert.equal(resolve(tools.ffmpegPath).source, "manual");
  const missingPack = isolatedLocator(true, path.join(work, "no-resources"), bundle)();
  assert.equal(missingPack.ffmpegPath, null); assert.equal(missingPack.ffprobePath, null);
  smoke.check("Clean-machine fallback and manual precedence; packaged builds cannot use development binaries", true);
  const shipped = resources || path.join(work, "resources");
  if (!resources) fs.cpSync(bundle, path.join(shipped, "ffmpeg"), { recursive: true });
  validateBundle(path.join(shipped, "ffmpeg"));
  const releaseLocator = resources ? path.join(resources, "app.asar", "ffmpeg", "locate.js") : locatorPath;
  const packaged = isolatedLocator(true, shipped, path.join(shipped, "ffmpeg"), releaseLocator)();
  assert.equal(packaged.source, "bundled"); assert.equal(packaged.ffmpegPath, path.join(shipped, "ffmpeg", "ffmpeg.exe"));
  smoke.check(`${resources ? "Actual" : "Isolated"} packaged resources resolution`, true);
  await conversions(resources ? packaged : tools);
  fs.rmSync(work, { recursive: true, force: true });
  smoke.finish({ app, ok: true });
}
main().catch((error) => { console.error(error.message); smoke.finish({ app, ok: false, error }); });

/**
 * 视频剪辑核心逻辑验证（需本机 ffmpeg）：
 * 1) 无损剪切：-c copy，精确落在关键帧上时输出时长准确
 * 2) 无损剪切的固有特性：起点非关键帧时从上一关键帧开始（输出不短于请求）
 * 3) 精确剪切（accurateCut）：重新编码，帧级精确
 * 4) 变速 + 裁剪：时长与分辨率符合预期
 *
 * 运行：node scripts/verify-video-edit.cjs
 * 可用 FFMPEG_PATH / FFPROBE_PATH 覆盖二进制路径。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const FFMPEG =
  process.env.FFMPEG_PATH ||
  "E:\\Tool\\ffmpeg\\ffmpeg-9.0.1-essentials_build\\bin\\ffmpeg.exe";
const FFPROBE =
  process.env.FFPROBE_PATH ||
  "E:\\Tool\\ffmpeg\\ffmpeg-9.0.1-essentials_build\\bin\\ffprobe.exe";

const { buildEditArgs } = require("../apps/electron/ffmpeg/jobs.js");

const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const run = (bin, args) => spawnSync(bin, args, { encoding: "utf8", windowsHide: true });

function probeDuration(file) {
  const out = run(FFPROBE, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1",
    file,
  ]);
  return parseFloat(String(out.stdout).trim());
}

function probeSize(file) {
  const out = run(FFPROBE, [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=p=0",
    file,
  ]);
  const [width, height] = String(out.stdout).trim().split(",").map(Number);
  return { width, height };
}

function execute(outPath, plan, label) {
  const result = run(FFMPEG, plan.args);
  if (result.status !== 0) {
    check(`${label} 执行成功`, false, String(result.stderr).slice(-160));
    return null;
  }
  return outPath;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "video-edit-test-"));
const source = path.join(dir, "source.mp4");

// 5 秒、关键帧间隔 2 秒（-g 50 @25fps）的测试源
const generated = run(FFMPEG, [
  "-y", "-hide_banner", "-loglevel", "error",
  "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25",
  "-t", "5", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-g", "50", source,
]);
if (generated.status !== 0) {
  console.error("生成测试视频失败：", generated.stderr);
  process.exit(1);
}

const sourceDuration = probeDuration(source);
check("测试源视频生成成功（约 5 秒）", Math.abs(sourceDuration - 5) < 0.4, `${sourceDuration}s`);

// ---------- 1) 无损剪切（起点落在关键帧 2s 上） ----------
const losslessPlan = buildEditArgs({
  inputPath: source,
  outputPath: path.join(dir, "lossless.mp4"),
  sourceDuration,
  trim: { start: 2, end: 4.5 },
  speed: 1,
});
check("无损剪切不重新编码", losslessPlan.requiresReencode === false);
check(
  "剪切参数为输入侧 -ss/-to + -c copy",
  losslessPlan.args.includes("-ss") &&
    losslessPlan.args.includes("-to") &&
    losslessPlan.args.includes("copy")
);
if (execute(losslessPlan.args[losslessPlan.args.length - 1], losslessPlan, "无损剪切")) {
  const duration = probeDuration(path.join(dir, "lossless.mp4"));
  check("无损剪切（关键帧对齐）时长 ≈ 2.5 秒", Math.abs(duration - 2.5) < 0.35, `${duration.toFixed(3)}s`);
}

// ---------- 2) 无损剪切的固有特性：起点非关键帧 ----------
const alignedPlan = buildEditArgs({
  inputPath: source,
  outputPath: path.join(dir, "aligned.mp4"),
  sourceDuration,
  trim: { start: 1, end: 3 },
  speed: 1,
});
if (execute(alignedPlan.args[alignedPlan.args.length - 1], alignedPlan, "非关键帧起点剪切")) {
  const duration = probeDuration(path.join(dir, "aligned.mp4"));
  check(
    "无损剪切不短于请求区间（从上一关键帧开始）",
    duration >= 2 - 0.05,
    `${duration.toFixed(3)}s ≥ 2.000s`
  );
  check("无损剪切额外长度在 1 个关键帧间隔内", duration <= 2 + 2.2, `${duration.toFixed(3)}s`);
}

// ---------- 3) 精确剪切（accurateCut → 重新编码） ----------
const accuratePlan = buildEditArgs({
  inputPath: source,
  outputPath: path.join(dir, "accurate.mp4"),
  sourceDuration,
  trim: { start: 1, end: 3 },
  speed: 1,
  accurateCut: true,
});
check("精确剪切会重新编码", accuratePlan.requiresReencode === true);
if (execute(accuratePlan.args[accuratePlan.args.length - 1], accuratePlan, "精确剪切")) {
  const duration = probeDuration(path.join(dir, "accurate.mp4"));
  check("精确剪切时长 ≈ 2 秒（帧级）", Math.abs(duration - 2) < 0.2, `${duration.toFixed(3)}s`);
}

// ---------- 4) 变速 ----------
const speedPlan = buildEditArgs({
  inputPath: source,
  outputPath: path.join(dir, "speed.mp4"),
  sourceDuration,
  trim: { start: 0, end: 4 },
  speed: 2,
});
check("变速会重新编码", speedPlan.requiresReencode === true);
check(
  "变速滤镜包含 setpts 与 atempo",
  speedPlan.args.some((arg) => arg.includes("setpts=PTS/2")) &&
    speedPlan.args.some((arg) => arg.includes("atempo=2"))
);
if (execute(speedPlan.args[speedPlan.args.length - 1], speedPlan, "变速")) {
  const duration = probeDuration(path.join(dir, "speed.mp4"));
  check("2× 变速后时长 ≈ 2 秒", Math.abs(duration - 2) < 0.35, `${duration.toFixed(3)}s`);
}

// ---------- 5) 变速 + 裁剪 ----------
const comboPlan = buildEditArgs({
  inputPath: source,
  outputPath: path.join(dir, "combo.mp4"),
  sourceDuration,
  trim: { start: 2, end: 4.5 },
  speed: 2,
  crop: { enabled: true, width: 200, height: 200, x: 0, y: 0 },
});
if (execute(comboPlan.args[comboPlan.args.length - 1], comboPlan, "变速+裁剪")) {
  const duration = probeDuration(path.join(dir, "combo.mp4"));
  const size = probeSize(path.join(dir, "combo.mp4"));
  check("变速+裁剪时长 ≈ 1.25 秒", Math.abs(duration - 1.25) < 0.3, `${duration.toFixed(3)}s`);
  check("裁剪后分辨率 200x200", size.width === 200 && size.height === 200, `${size.width}x${size.height}`);
}

fs.rmSync(dir, { recursive: true, force: true });

const failed = results.filter((ok) => !ok).length;
console.log(failed === 0 ? "ALL PASS ✓" : `${failed} FAILED ✗`);
process.exit(failed === 0 ? 0 : 1);

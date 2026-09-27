/**
 * GIF 制作验证（真实 ffmpeg）：
 * - 单段：输入侧剪切 + 等比缩放（宽度定值、高度偶数）
 * - 多段：归一化后 concat，再走调色板两遍编码
 * - 断言：GIF 文件头、输出尺寸、帧数与帧率一致、无音轨
 *
 * 运行：node scripts/verify-gif.cjs
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

const { buildGifArgs } = require("../apps/electron/ffmpeg/jobs.js");

const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const run = (bin, args) => spawnSync(bin, args, { encoding: "utf8", windowsHide: true });

function probeGif(file) {
  const out = run(FFPROBE, [
    "-v", "error",
    "-show_entries", "stream=codec_type,width,height,nb_frames,avg_frame_rate",
    "-show_entries", "format=duration",
    "-of", "json",
    file,
  ]);
  const data = JSON.parse(String(out.stdout));
  const video = (data.streams || []).find((s) => s.codec_type === "video");
  const audio = (data.streams || []).find((s) => s.codec_type === "audio");
  const [num, den] = String(video?.avg_frame_rate ?? "0/1").split("/").map(Number);
  return {
    width: Number(video?.width ?? 0),
    height: Number(video?.height ?? 0),
    frames: Number(video?.nb_frames ?? 0),
    fps: den ? num / den : 0,
    duration: Number(data.format?.duration ?? 0),
    hasAudio: Boolean(audio),
  };
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gif-test-"));

function makeClip(name, { size, duration, pattern, withAudio = true }) {
  const target = path.join(dir, name);
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `${pattern}=size=${size}:rate=25`,
  ];
  if (withAudio) args.push("-f", "lavfi", "-i", "sine=frequency=440");
  args.push("-t", String(duration), "-pix_fmt", "yuv420p", "-c:v", "libx264");
  args.push(...(withAudio ? ["-c:a", "aac", "-shortest"] : ["-an"]), target);
  const result = run(FFMPEG, args);
  if (result.status !== 0) throw new Error(`生成 ${name} 失败: ${result.stderr}`);
  return target;
}

const clipA = makeClip("a.mp4", { size: "320x240", duration: 2, pattern: "testsrc" });
const clipB = makeClip("b.mp4", { size: "640x360", duration: 1.5, pattern: "testsrc2", withAudio: false });

// ---------- 单段 ----------
const singleOut = path.join(dir, "single.gif");
const singlePlan = buildGifArgs({
  mode: "gif",
  outputPath: singleOut,
  width: 320,
  height: 240,
  gif: { fps: 20, width: 200 },
  clips: [{ inputPath: clipA, duration: 2, hasAudio: true, trim: { start: 0.5, end: 1.5 } }],
});

const singleArgs = singlePlan.args.join(" ");
check("单段使用输入侧 -ss/-to", singleArgs.includes("-ss 0.5 -to 1.5 -i"));
check("单段滤镜含 fps 与等比缩放", /fps=20.*scale=200:-2/.test(singleArgs.replace(/\s/g, "")) || singleArgs.includes("fps=20,scale=200:-2"));
check("使用调色板两遍编码", singleArgs.includes("palettegen") && singleArgs.includes("paletteuse"));
check("GIF 无限循环且无音轨", singleArgs.includes("-loop 0") && singleArgs.includes("-an"));
check("预期时长等于选区（用于进度）", Math.abs(singlePlan.expectedDuration - 1) < 1e-6, `${singlePlan.expectedDuration}s`);

const singleRun = run(FFMPEG, singlePlan.args);
check("单段真实执行成功", singleRun.status === 0, singleRun.stderr?.slice(0, 200) ?? "");

if (singleRun.status === 0) {
  const header = fs.readFileSync(singleOut).subarray(0, 6).toString("ascii");
  const info = probeGif(singleOut);
  check("输出是合法 GIF 文件头", /^GIF8[79]a$/.test(header), header);
  check("单段宽度 = 设定值 200", info.width === 200, `${info.width}`);
  check("单段高度按 4:3 等比且为偶数", info.height === 150, `${info.height}`);
  check("帧率与设定一致（20fps）", Math.abs(info.fps - 20) < 0.6, `${info.fps.toFixed(2)}fps`);
  check(
    "帧数 ≈ 时长 × 帧率（1 秒 × 20）",
    Math.abs(info.frames - 20) <= 3,
    `${info.frames} 帧`
  );
  check("GIF 不含音轨", info.hasAudio === false);
}

// ---------- 多段拼接 ----------
const multiOut = path.join(dir, "multi.gif");
const multiPlan = buildGifArgs({
  mode: "gif",
  outputPath: multiOut,
  width: 320,
  height: 240,
  gif: { fps: 10, width: 160 },
  clips: [
    { inputPath: clipA, duration: 2, hasAudio: true, trim: { start: 0, end: 1 } },
    { inputPath: clipB, duration: 1.5, hasAudio: false, trim: { start: 0.5, end: 1.5 } },
  ],
});
const multiArgs = multiPlan.args.join(" ");
check("多段每段都有独立剪切窗口", multiArgs.includes("-to 1 -i") && multiArgs.includes("-ss 0.5 -to 1.5 -i"));
check("多段滤镜含 concat", multiArgs.includes("concat=n=2:v=1:a=0"));
check("多段归一化到首段比例（160x120）", multiArgs.includes("scale=160:120"));
check("多段预期时长 = 各段选区之和", Math.abs(multiPlan.expectedDuration - 2) < 1e-6, `${multiPlan.expectedDuration}s`);

const multiRun = run(FFMPEG, multiPlan.args);
check("多段真实执行成功", multiRun.status === 0, multiRun.stderr?.slice(0, 200) ?? "");
if (multiRun.status === 0) {
  const info = probeGif(multiOut);
  check("多段输出尺寸 160x120", info.width === 160 && info.height === 120, `${info.width}x${info.height}`);
  check("多段帧率与设定一致（10fps）", Math.abs(info.fps - 10) < 0.6, `${info.fps.toFixed(2)}fps`);
  check(
    "多段帧数 ≈ 2 秒 × 10fps",
    Math.abs(info.frames - 20) <= 3,
    `${info.frames} 帧`
  );
}

// ---------- 参数边界 ----------
const clampedPlan = buildGifArgs({
  mode: "gif",
  outputPath: path.join(dir, "clamped.gif"),
  width: 320,
  height: 240,
  gif: { fps: 999, width: 161 },
  clips: [{ inputPath: clipA, duration: 2, hasAudio: true, trim: { start: 0, end: 1 } }],
});
const clampedArgs = clampedPlan.args.join(" ");
check("帧率上限夹取到 120", clampedArgs.includes("fps=120"));
check("宽度取偶数（161 → 160）", clampedArgs.includes("scale=160"));

console.log(results.every(Boolean) ? "ALL PASS ✓" : "FAILED ✗");
process.exit(results.every(Boolean) ? 0 : 1);

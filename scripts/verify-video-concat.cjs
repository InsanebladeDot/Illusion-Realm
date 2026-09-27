/**
 * 视频拼接（concat）验证：
 * - 3 个片段：不同分辨率 + 其中一个无音轨
 * - 每段独立剪切窗口
 * - 断言：输出时长 = 各段裁剪时长之和、分辨率归一化到目标、音轨存在
 *
 * 运行：node scripts/verify-video-concat.cjs
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

const { buildConcatArgs } = require("../apps/electron/ffmpeg/jobs.js");

const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const run = (bin, args) => spawnSync(bin, args, { encoding: "utf8", windowsHide: true });

function probe(file) {
  const out = run(FFPROBE, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-show_entries", "stream=codec_type,width,height",
    "-of", "json",
    file,
  ]);
  const data = JSON.parse(String(out.stdout));
  const video = (data.streams || []).find((s) => s.codec_type === "video");
  const audio = (data.streams || []).find((s) => s.codec_type === "audio");
  return {
    duration: Number(data.format?.duration ?? 0),
    width: Number(video?.width ?? 0),
    height: Number(video?.height ?? 0),
    hasAudio: Boolean(audio),
  };
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "video-concat-test-"));

function makeClip(name, { size, duration, withAudio, pattern }) {
  const target = path.join(dir, name);
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `${pattern}=size=${size}:rate=25`];
  if (withAudio) args.push("-f", "lavfi", "-i", "sine=frequency=440");
  args.push("-t", String(duration), "-pix_fmt", "yuv420p", "-c:v", "libx264");
  args.push(...(withAudio ? ["-c:a", "aac", "-shortest"] : ["-an"]), target);
  const result = run(FFMPEG, args);
  if (result.status !== 0) throw new Error(`生成 ${name} 失败: ${result.stderr}`);
  return target;
}

const clipA = makeClip("a.mp4", { size: "320x240", duration: 3, withAudio: true, pattern: "testsrc" });
const clipB = makeClip("b.mp4", { size: "640x360", duration: 2, withAudio: true, pattern: "testsrc2" });
const clipC = makeClip("c.mp4", { size: "320x240", duration: 2, withAudio: false, pattern: "smptebars" });

const probeA = probe(clipA);
const probeB = probe(clipB);
const probeC = probe(clipC);
check("片段 A/B 有音轨、片段 C 无音轨", probeA.hasAudio && probeB.hasAudio && !probeC.hasAudio);

const output = path.join(dir, "concat.mp4");
const plan = buildConcatArgs({
  mode: "concat",
  outputPath: output,
  width: 320,
  height: 240,
  fps: 25,
  clips: [
    { inputPath: clipA, trim: { start: 0.5, end: 2.5 }, duration: 3, hasAudio: true },
    { inputPath: clipB, trim: { start: 0, end: 1.5 }, duration: 2, hasAudio: true },
    { inputPath: clipC, trim: { start: 0, end: 2 }, duration: 2, hasAudio: false },
  ],
});

check("拼接必然重新编码", plan.requiresReencode === true);
check("滤镜图包含 concat", plan.args.join(" ").includes("concat=n=3:v=1:a=1"));
check("为无音轨片段追加了 anullsrc 静音输入", plan.args.join(" ").includes("anullsrc"));

const executed = run(FFMPEG, plan.args);
check("拼接执行成功", executed.status === 0, String(executed.stderr).slice(-300));

if (executed.status === 0) {
  const info = probe(output);
  const expected = (2.5 - 0.5) + (1.5 - 0) + (2 - 0);
  check(
    `拼接时长 ≈ ${expected} 秒`,
    Math.abs(info.duration - expected) < 0.35,
    `${info.duration.toFixed(3)}s`
  );
  check("分辨率归一化到 320x240", info.width === 320 && info.height === 240, `${info.width}x${info.height}`);
  check("输出包含音轨", info.hasAudio === true);
}

fs.rmSync(dir, { recursive: true, force: true });

const failed = results.filter((ok) => !ok).length;
console.log(failed === 0 ? "ALL PASS ✓" : `${failed} FAILED ✗`);
process.exit(failed === 0 ? 0 : 1);

const { spawn } = require("child_process");

/**
 * 任务参数与进度事件从 shared 派生（仅类型层 import，运行期不 require）：
 * 主进程与渲染进程共用同一份声明，字段漂移会立刻编译失败。
 *
 * @typedef {import("@illusion-realm/shared").VideoEditJob} VideoEditJob
 * @typedef {import("@illusion-realm/shared").VideoClipInput} VideoClipInput
 * @typedef {import("@illusion-realm/shared").VideoProgressEvent} VideoProgressEvent
 *
 * @typedef {object} EditPlan
 * @property {string[]} args ffmpeg 参数
 * @property {boolean} requiresReencode 是否走了重编码路径
 * @property {number} expectedDuration 预期输出时长（秒），0 表示无法换算进度
 *
 * @typedef {object} StartEditJobOptions
 * @property {string} ffmpegPath
 * @property {VideoEditJob} job
 * @property {(progress: Omit<VideoProgressEvent, "jobId">) => void} [onProgress]
 * @property {(result: { outputPath: string, requiresReencode: boolean }) => void} [onDone]
 * @property {(error: Error) => void} [onError]
 */

/**
 * 变速的音频滤镜链：atempo 单实例安全区间为 0.5–2.0，超出则串联
 * @param {number} speed 倍速，> 0
 * @returns {string[]}
 */
function buildAtempoFilters(speed) {
  const filters = [];
  let remaining = speed;

  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${Number(remaining.toFixed(4))}`);
  return filters;
}

/**
 * 保证裁剪尺寸为偶数（libx264 要求）
 * @param {number} value
 * @returns {number}
 */
function toEven(value) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

/**
 * 构建 ffmpeg 参数。
 *
 * 剪切窗口统一用 **输入侧** `-ss START -to END`（放在 `-i` 之前）：
 * - `-to` 放在 `-i` 之后会被当作输出时限，配合变速滤镜会失效（已实测）
 * - 输入侧 `-to` 相对原始时间轴，配合重编码可做到帧级精确（实测误差 < 0.1s）
 *
 * 两条路径：
 * - **无损剪切**（未变速/未裁剪，且未勾选精确剪切）：`-c copy` 流拷贝，秒级完成；
 *   代价是按关键帧对齐——起点不在关键帧时会从上一个关键帧开始，输出可能比请求略长。
 * - **重新编码**（变速/裁剪/精确剪切）：libx264 + aac，帧级精确。
 *
 * @param {VideoEditJob} job
 * @returns {EditPlan}
 */
function buildEditArgs(job) {
  const {
    inputPath,
    outputPath,
    trim,
    speed = 1,
    crop,
    accurateCut = false,
  } = job;

  const start = Math.max(0, Number(trim?.start ?? 0));
  const end = Number(trim?.end ?? 0);
  const hasTrimWindow = end > start;
  const trimDuration = hasTrimWindow ? end - start : 0;

  const videoFilters = [];
  const audioFilters = [];

  if (crop?.enabled) {
    videoFilters.push(
      `crop=${toEven(crop.width)}:${toEven(crop.height)}:${Math.max(0, Math.round(crop.x))}:${Math.max(0, Math.round(crop.y))}`
    );
  }

  const speedValue = Number(speed) || 1;
  if (speedValue !== 1) {
    videoFilters.push(`setpts=PTS/${speedValue}`);
    audioFilters.push(...buildAtempoFilters(speedValue));
  }

  const requiresReencode = videoFilters.length > 0 || accurateCut;

  const args = ["-y", "-hide_banner"];
  if (start > 0) args.push("-ss", String(start));
  if (hasTrimWindow) args.push("-to", String(end));
  // 运行期由 index.js 校验必填；这里显式窄化，避免把 undefined 拼进 ffmpeg 参数
  if (typeof inputPath !== "string" || !inputPath) {
    throw new Error("缺少输入路径");
  }
  if (typeof outputPath !== "string" || !outputPath) {
    throw new Error("缺少输出路径");
  }
  args.push("-i", inputPath);

  if (!requiresReencode) {
    args.push("-c", "copy", "-avoid_negative_ts", "make_zero");
  } else {
    if (videoFilters.length > 0) args.push("-vf", videoFilters.join(","));
    if (audioFilters.length > 0) args.push("-af", audioFilters.join(","));
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p"
    );
    // 重新编码时音频统一转 aac，避免源编码与容器不兼容
    args.push("-c:a", "aac", "-b:a", "192k");
  }

  args.push("-movflags", "+faststart", outputPath);

  // 预期输出时长（用于进度换算）
  const sourceDuration = trimDuration > 0 ? trimDuration : Number(job.sourceDuration ?? 0);
  const expectedDuration = sourceDuration > 0 ? sourceDuration / speedValue : 0;

  return { args, requiresReencode, expectedDuration };
}

/**
 * 构建多片段拼接参数（filter_complex 方案，自动归一化分辨率/帧率/音频）。
 *
 * 每个片段支持独立剪切窗口；分辨率不一致时按目标尺寸等比缩放并补边；
 * 缺少音轨的片段用 anullsrc 生成等长静音，保证 concat 的音频流数量一致。
 * 拼接完成后可选应用变速与裁剪。
 *
 * @param {VideoEditJob} job
 * @returns {EditPlan}
 */
function buildConcatArgs(job) {
  const clips = Array.isArray(job.clips) ? job.clips : [];
  const { outputPath, speed = 1, crop } = job;

  const targetWidth = toEven(job.width || 1280);
  const targetHeight = toEven(job.height || 720);
  const targetFps = Number(job.fps) > 0 ? Number(job.fps) : 25;

  const args = ["-y", "-hide_banner"];
  /** @type {number[]} */
  const clipTrimDurations = [];

  // 1) 各片段输入（带各自的剪切窗口）
  for (const clip of clips) {
    const start = Math.max(0, Number(clip.trim?.start ?? 0));
    const end = Number(clip.trim?.end ?? 0);
    if (start > 0) args.push("-ss", String(start));
    if (end > start) args.push("-to", String(end));
    args.push("-i", clip.inputPath);
    clipTrimDurations.push(
      end > start ? end - start : Number(clip.duration ?? 0)
    );
  }

  // 2) 为缺少音轨的片段追加静音输入（放在所有片段之后）
  /** @type {Map<number, number>} */
  const silenceInputIndex = new Map();
  let nextInputIndex = clips.length;
  clips.forEach((clip, index) => {
    if (clip.hasAudio) return;
    const duration = clipTrimDurations[index] || Number(clip.duration ?? 0) || 1;
    args.push(
      "-f",
      "lavfi",
      "-t",
      String(duration),
      "-i",
      "anullsrc=r=44100:cl=stereo"
    );
    silenceInputIndex.set(index, nextInputIndex);
    nextInputIndex += 1;
  });

  const hasAnyAudio =
    clips.some((clip) => clip.hasAudio) || silenceInputIndex.size > 0;

  // 3) 滤镜图：逐片段归一化 → concat → 可选变速/裁剪
  /** @type {string[]} */
  const chains = [];
  clips.forEach((clip, index) => {
    chains.push(
      `[${index}:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,` +
        `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,` +
        `fps=${targetFps},setpts=PTS-STARTPTS[v${index}]`
    );
  });

  if (hasAnyAudio) {
    clips.forEach((clip, index) => {
      const audioInput = clip.hasAudio ? `${index}:a` : `${silenceInputIndex.get(index)}:a`;
      chains.push(
        `[${audioInput}]aresample=44100,asetpts=PTS-STARTPTS,` +
          `aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${index}]`
      );
    });
  }

  const concatInputs = clips
    .map((_, index) => (hasAnyAudio ? `[v${index}][a${index}]` : `[v${index}]`))
    .join("");
  const concatOutputs = hasAnyAudio ? "[vcat][acat]" : "[vcat]";
  chains.push(
    `${concatInputs}concat=n=${clips.length}:v=1:a=${hasAnyAudio ? 1 : 0}${concatOutputs}`
  );

  // 4) 拼接后的整体处理
  let videoLabel = "vcat";
  let audioLabel = "acat";
  const speedValue = Number(speed) || 1;

  if (crop?.enabled) {
    chains.push(
      `[${videoLabel}]crop=${toEven(crop.width)}:${toEven(crop.height)}:` +
        `${Math.max(0, Math.round(crop.x))}:${Math.max(0, Math.round(crop.y))}[vcrop]`
    );
    videoLabel = "vcrop";
  }

  if (speedValue !== 1) {
    chains.push(`[${videoLabel}]setpts=PTS/${speedValue}[vspeed]`);
    videoLabel = "vspeed";
    if (hasAnyAudio) {
      const tempo = buildAtempoFilters(speedValue).join(",");
      chains.push(`[${audioLabel}]${tempo}[aspeed]`);
      audioLabel = "aspeed";
    }
  }

  args.push("-filter_complex", chains.join(";"), "-map", `[${videoLabel}]`);
  if (hasAnyAudio) args.push("-map", `[${audioLabel}]`);

  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p"
  );
  if (hasAnyAudio) args.push("-c:a", "aac", "-b:a", "192k");
  else args.push("-an");

  args.push("-movflags", "+faststart", outputPath);

  const totalSource = clipTrimDurations.reduce((sum, value) => sum + value, 0);
  const expectedDuration = totalSource > 0 ? totalSource / speedValue : 0;

  return { args, requiresReencode: true, expectedDuration };
}

/**
 * 构建 GIF 制作参数（视频 → 动图）。
 *
 * - 取素材方式与拼接一致：每段独立的**输入侧**剪切窗口，多段时先归一化再 concat
 * - 分辨率按宽度等比缩放（`scale=W:-2`，高度自动取偶数）；多段时以首段比例为准补边
 * - 用 `split + palettegen + paletteuse` 先取调色板再输出，避免直接转 GIF 的色带与噪点
 * - `-loop 0` 无限循环；GIF 无音轨，统一 `-an`
 *
 * @param {VideoEditJob} job
 * @returns {EditPlan}
 */
function buildGifArgs(job) {
  const { outputPath } = job;
  if (typeof outputPath !== "string" || !outputPath) {
    throw new Error("缺少输出路径");
  }
  const clips =
    Array.isArray(job.clips) && job.clips.length > 0
      ? job.clips
      : [
          {
            inputPath: job.inputPath,
            duration: job.sourceDuration,
            hasAudio: false,
            trim: job.trim,
          },
        ];

  const fps = Math.min(120, Math.max(1, Math.round(Number(job.gif?.fps) || 20)));
  const targetWidth = toEven(job.gif?.width || job.width || 480);
  const loopCount = job.gif?.loop === false ? -1 : 0;

  const args = ["-y", "-hide_banner"];
  /** @type {number[]} */
  const clipTrimDurations = [];

  for (const clip of clips) {
    const start = Math.max(0, Number(clip.trim?.start ?? 0));
    const end = Number(clip.trim?.end ?? 0);
    if (start > 0) args.push("-ss", String(start));
    if (end > start) args.push("-to", String(end));
    if (typeof clip.inputPath !== "string" || !clip.inputPath) {
      throw new Error("GIF 任务存在无效片段");
    }
    args.push("-i", clip.inputPath);
    clipTrimDurations.push(end > start ? end - start : Number(clip.duration ?? 0));
  }

  // 首段比例决定多段拼接时的画布高度
  const firstAspect =
    Number(job.width) > 0 && Number(job.height) > 0
      ? Number(job.height) / Number(job.width)
      : 9 / 16;
  const targetHeight = toEven(targetWidth * (firstAspect > 0 ? firstAspect : 9 / 16));

  const chains = [];
  if (clips.length === 1) {
    // 单段：按宽度等比缩放，不做补边
    chains.push(
      `[0:v]fps=${fps},scale=${targetWidth}:-2:flags=lanczos,setpts=PTS-STARTPTS,split[frames][palette_src]`
    );
  } else {
    clips.forEach((_clip, index) => {
      chains.push(
        `[${index}:v]fps=${fps},scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,` +
          `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,setpts=PTS-STARTPTS[v${index}]`
      );
    });
    chains.push(
      `${clips.map((_clip, index) => `[v${index}]`).join("")}` +
        `concat=n=${clips.length}:v=1:a=0[vcat]`
    );
    chains.push(`[vcat]split[frames][palette_src]`);
  }

  chains.push(`[palette_src]palettegen=stats_mode=diff[palette]`);
  chains.push(`[frames][palette]paletteuse=dither=sierra2_4a:diff_mode=rectangle[out]`);

  args.push("-filter_complex", chains.join(";"), "-map", "[out]", "-an");
  args.push("-loop", String(loopCount));
  args.push(outputPath);

  const totalSource = clipTrimDurations.reduce((sum, value) => sum + value, 0);

  return { args, requiresReencode: true, expectedDuration: totalSource };
}

/**
 * 已知的任务类型；未知类型通常意味着渲染进程比主进程新（主进程未重启）
 * @type {Set<string>}
 */
const KNOWN_JOB_MODES = new Set(["single", "concat", "gif"]);

/**
 * 校验任务类型是否已知
 * @param {unknown} mode
 * @returns {void}
 */
function assertKnownMode(mode) {
  if (typeof mode === "string" && mode && !KNOWN_JOB_MODES.has(mode)) {
    throw new Error(
      `未知的导出类型「${mode}」：主进程可能不是最新版本，请完全退出应用后重新启动（仅刷新页面不会重载主进程）`
    );
  }
}

/**
 * 执行编辑任务。返回子进程句柄（可用于取消）。
 * @param {StartEditJobOptions} options
 * @returns {import("child_process").ChildProcess}
 */
function startEditJob({ ffmpegPath, job, onProgress, onDone, onError }) {
  assertKnownMode(job?.mode);
  const plan =
    job.mode === "concat"
      ? buildConcatArgs(job)
      : job.mode === "gif"
        ? buildGifArgs(job)
        : buildEditArgs(job);
  const { args, requiresReencode, expectedDuration } = plan;
  const child = spawn(ffmpegPath, args, { windowsHide: true });

  let stderrTail = "";

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderrTail = `${stderrTail}${text}`.slice(-6000);

    if (!expectedDuration) return;
    const match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
    if (!match) return;

    const seconds =
      Number(match[1]) * 3600 + Number(match[2]) * 60 + parseFloat(match[3]);
    const percent = Math.max(
      0,
      Math.min(99, Math.round((seconds / expectedDuration) * 100))
    );
    onProgress?.({ percent, seconds });
  });

  child.on("error", (error) => onError?.(error));

  child.on("close", (code) => {
    if (code === 0) {
      onProgress?.({ percent: 100, seconds: expectedDuration });
      onDone?.({ outputPath: job.outputPath, requiresReencode });
      return;
    }
    onError?.(
      new Error(
        `ffmpeg 处理失败（退出码 ${code}）${stderrTail ? `\n${stderrTail.trim()}` : ""}`
      )
    );
  });

  return child;
}

module.exports = { buildEditArgs, buildConcatArgs, buildGifArgs, startEditJob };

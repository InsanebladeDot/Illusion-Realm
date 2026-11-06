const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

/**
 * 返回类型从 shared 派生（仅类型层 import，运行期不 require）：
 * 与渲染进程消费的 VideoProbeResult 是同一份声明。
 * @typedef {import("@illusion-realm/shared").VideoProbeResult} VideoProbeResult
 */

const execFileAsync = promisify(execFile);

/**
 * 解析 ffprobe 的帧率字段（形如 "30000/1001"）
 * @param {unknown} value
 * @returns {number} 四舍五入到两位小数；无法解析时返回 0
 */
function parseFrameRate(value) {
  if (!value || typeof value !== "string") return 0;
  const [num, den] = value.split("/").map(Number);
  if (!num || !den) return Number(value) || 0;
  return Math.round((num / den) * 100) / 100;
}

/**
 * 读取视频基础信息（时长/分辨率/帧率/编码）
 * @param {string | null} ffprobePath
 * @param {string} inputPath
 * @param {AbortSignal} [signal] 波形辅助任务取消时同步终止其探测子进程。
 * @returns {Promise<VideoProbeResult>}
 */
async function probeVideo(ffprobePath, inputPath, signal) {
  if (!ffprobePath) {
    throw new Error("未找到 ffprobe，无法读取视频信息");
  }

  const { stdout } = await execFileAsync(
    ffprobePath,
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      inputPath,
    ],
    // 原导入调用不传signal，沿用原有行为；波形请求拥有自己的取消控制器。
    // 抽样前也要探测真实源长，不能只杀后面的FFmpeg而留下前面的FFprobe。
    // 参数存在才启用15秒探测上限，与波形整个30秒截止时间配合。
    // Node通过AbortSignal结束本次execFile，不会操作另一请求或原导出进程。
    // 有限缓冲约束探测JSON，不在这里读取整个视频或解码任何音频。
    // 取消异常继续向调用方传播，由辅助任务将取消和真实失败分别收口。
    { maxBuffer: 32 * 1024 * 1024, windowsHide: true, ...(signal ? { signal, timeout: 15000 } : {}) }
  );

  const data = /** @type {Record<string, any>} */ (JSON.parse(String(stdout)));
  const streams = /** @type {Array<Record<string, any>>} */ (
    Array.isArray(data.streams) ? data.streams : []
  );
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");

  if (!video) {
    throw new Error("该文件不含视频轨道");
  }

  const duration = Number(
    data.format?.duration ?? video.duration ?? 0
  );

  return {
    path: inputPath,
    fileName: path.basename(inputPath),
    duration: Number.isFinite(duration) ? duration : 0,
    width: Number(video.width ?? 0),
    height: Number(video.height ?? 0),
    fps: parseFrameRate(video.avg_frame_rate || video.r_frame_rate),
    videoCodec: String(video.codec_name ?? ""),
    audioCodec: String(audio?.codec_name ?? ""),
    hasAudio: Boolean(audio),
    size: Number(data.format?.size ?? 0),
  };
}

module.exports = { probeVideo };

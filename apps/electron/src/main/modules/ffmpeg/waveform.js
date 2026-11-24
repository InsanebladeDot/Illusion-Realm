/** 源音频振幅包络：复用FFprobe与FFmpeg，用逐窗统计替代整段PCM装入内存。 */
// 像沿胶卷每隔一小格记一个最高水位：这里只返回小格峰值，不把整卷声音搬进渲染层。
// 同一窗口最多两个任务，取消按窗口与请求双重身份限定，不复用导出作业编号。
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs/promises");
const { resolveTools } = require("./locate");
const { registerHandle } = require("../../ipc/result");
const { IPC_CHANNELS } = require("../../../common/ipc-channels");

// 用 8kHz 单声道、约 2048 个窗口绘制音量概览，Node 只接峰值文本，不接整段 PCM。
// 每个窗口最多两个请求；30 秒总期限包含探测，结束后删除控制器，不常驻缓存源路径。
/** @type {Map<string, AbortController>} */
const active = new Map();
const execute = promisify(execFile);

// 这是第一条音轨的振幅包络，不是音高或专业响度分析；立体声下混可能相互抵消。

// 与 shared 等价检查读取/取消两种请求；只接本地绝对路径，不能把 URL 交给 FFmpeg。
/** @param {unknown[]} args @returns {string | null} */
function validateWaveform(args) {
  const value = args[0];
  if (args.length !== 1 || !value || typeof value !== "object" || Array.isArray(value)) return "Invalid waveform request";
  const record = /** @type {Record<string, unknown>} */ (value);
  if (typeof record.requestId !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(record.requestId)) return "Invalid waveform identity";
  if (record.cancel === true && Object.keys(record).every(key => ["requestId", "cancel"].includes(key))) return null;
  if (Object.keys(record).some(key => !["requestId", "inputPath"].includes(key))) return "Invalid waveform fields";
  const input = record.inputPath;
  return typeof input === "string" && input.trim() && input.length <= 4096 && !input.includes("\0") && /^(?:[a-zA-Z]:[\\/]|\\\\)/.test(input) ? null : "Invalid waveform path";
}

// 取消和读取字段不能混用，避免拼错 cancel 反而开始读取；非法请求不占任务名额。

// -inf 是静音，转成 0；缺数据和非法数字须报错，不能伪装成静音。
// dBFS 用 10^(dB/20) 转振幅；4096 条硬上限为约 2048 窗的目标留出编码尾部余量。
/** @param {string} output @returns {number[]} */
function parsePeaks(output) {
  const values = [...output.matchAll(/^lavfi\.astats\.Overall\.Peak_level=(.+)$/gm)].map(match => match[1].trim() === "-inf" ? -Infinity : Number(match[1]));
  if (!values.length || values.length > 4096 || values.some(value => Number.isNaN(value) || value === Infinity)) throw new Error("Waveform data unavailable");
  return values.map(value => value === -Infinity ? 0 : Math.min(1, 10 ** (value / 20)));
}


// 只探第一条音轨与时长，兼容纯音频和带封面的 MP3，不复用要求有画面的 probeVideo。
// 容器时长优先，无音轨返回合法空值；探测失败和坏 JSON 仍报错。
// 探测有 15 秒上限，与采样共用取消信号，受外层 30 秒总期限约束。
/** @param {string | null} binary @param {string} input @param {AbortSignal} signal */
async function probeWaveformSource(binary, input, signal) {
  if (!binary) throw new Error("Waveform probe unavailable");
  const { stdout } = await execute(binary, ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration:format=duration", "-of", "json", input], { signal, timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true });
  const data = /** @type {{ streams?: { duration?: string }[], format?: { duration?: string } }} */ (JSON.parse(String(stdout)));
  return { hasAudio: Array.isArray(data.streams) && data.streams.length > 0, duration: Number(data.format?.duration ?? data.streams?.[0]?.duration ?? 0) };
}

/** @param {string} input @param {AbortSignal} signal @returns {Promise<import("@illusion-realm/shared").VideoWaveformResult | null>} */
async function readWaveform(input, signal) {
  if (!(await fs.stat(input)).isFile()) throw new Error("Waveform source unavailable");
  const tools = resolveTools();
  // 音频卡与视频片段共享这条读取链，差别只在源里是否还包含画面。
  // 同一接口返回相同峰值结构，前端无需猜文件扩展名来选择采样服务。
  // 后面的有音轨、合法时长与 FFmpeg 可用校验继续共同约束两类来源。
  const info = await probeWaveformSource(tools.ffprobePath, input, signal);
  if (!info.hasAudio) return null;
  if (!tools.ffmpegPath || !Number.isFinite(info.duration) || info.duration <= 0) throw new Error("Waveform source unavailable");
  const samples = Math.max(1, Math.ceil(info.duration * 8000 / 2048));
  const filter = `aresample=8000,aformat=channel_layouts=mono,asetnsamples=n=${samples}:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level:file=-`;
  const { stdout } = await execute(tools.ffmpegPath, ["-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe", "-i", input, "-map", "0:a:0", "-vn", "-af", filter, "-f", "null", "-"], { signal, timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true });
  return { duration: info.duration, secondsPerPeak: samples / 8000, peaks: parsePeaks(String(stdout)) };
}

  // 像把长录音分成约 2048 格：按真实时长计算每格样本数，最后不足一格也保留。
  // 用 samples/8000 定位波形，不能均分数组长度，否则编码尾部会挤偏前面的声音位置。
  // FFmpeg 只输出峰值文本，1MiB 超限即失败，不返回半条波形；不写临时 WAV。

// 同一窗口和请求 ID 才能取消对应任务，立即登记保证紧接着的取消能命中。
// 销毁窗口也取消；finally 清记录、计时器和监听，错误只返回脱敏短消息。
/** @param {Electron.IpcMainInvokeEvent} event @param {import("@illusion-realm/shared").VideoWaveformRequest} payload */
async function handleWaveform(event, payload) {
  // 仅应用站点与固定开发站点可读源包络，窗口归属还要在下面单独核对。
  // 前缀包含最后的斜线，localhost:30000或外部相似域名不能冒充开发源。
  // 请求发起于页面加载后；空URL、其他协议和外部导航一律拒绝读取。
  if (!["app://app/", "http://localhost:3000/", "http://127.0.0.1:3000/"].some(origin => event.sender.getURL().startsWith(origin))) throw new Error("Waveform caller denied");
  const prefix = `${event.sender.id}:`, key = prefix + payload.requestId;
  if ("cancel" in payload) { active.get(key)?.abort(); return null; }
  if (active.has(key) || [...active.keys()].filter(id => id.startsWith(prefix)).length >= 2) throw new Error("Waveform queue busy");
  const controller = new AbortController(), cancel = () => controller.abort();
  active.set(key, controller);
  const deadline = setTimeout(cancel, 30000);
  event.sender.once("destroyed", cancel);
  try { return await readWaveform(payload.inputPath, controller.signal); }
  catch { if (controller.signal.aborted) return null; throw new Error("Waveform unavailable"); }
  finally { clearTimeout(deadline); active.delete(key); event.sender.removeListener("destroyed", cancel); }
}


// 导出纯校验和解析器供独立回归；生产调用仍经过统一 IPC 注册。
function registerWaveformIpc() {
  registerHandle(IPC_CHANNELS.VIDEO_WAVEFORM, handleWaveform, validateWaveform);
}
module.exports = { registerWaveformIpc, validateWaveform, parsePeaks };

// 工程时钟像指挥棒：所有视频按它对齐，媒体事件不能反过来推进工程时间。
import type { EditorPreviewClip } from "./editor-panels";

// 每个片段单独登记解码器，同一文件可同时读取不同位置。
// request 和 deadline 属于本次定位；重试换节点后，旧回执不能影响新节点。
export interface ProgramMedia {
  video: HTMLVideoElement;
  state: "loading" | "ready" | "error";
  request: number;
  deadline: number;
  failed: boolean;
  starting: boolean;
}
export interface ClockLayer { clip: EditorPreviewClip; }
// time 是工程秒数；version 标识外部定位，request 还包含内部重试。
// intent 保留用户的播放意图，缓冲等待不等于用户暂停。
export interface ProgramClock {
  time: number;
  version: number;
  request: number;
  last: number;
  intent: boolean;
  media: Map<string, ProgramMedia>;
}
export type ProgramPhase = "loading" | "ready" | "error";

// 工程起点 8 秒、源入点 2 秒时，工程 9 秒读取源 3 秒；倒放反向计算，定格固定源时间。
// 观看倍率已作用于工程时钟，不在这里重复相乘；源末尾留 1 毫秒，避免读到文件外。
export function programSourceTime(clip: EditorPreviewClip, time: number, duration: number) {
  const offset = (time - clip.start) * (clip.speed ?? 1);
  const source = clip.freezeTime ?? (clip.reversed ? (clip.sourceIn ?? 0) + (clip.end - clip.start) * (clip.speed ?? 1) - offset : (clip.sourceIn ?? 0) + offset);
  return Math.max(0, Math.min(duration - .001, source));
}

// 起点包含、终点不包含；相接处只显示后一段，保留调用方给定的轨道顺序。
export function activeProgramLayers<T extends ClockLayer>(layers: readonly T[], time: number): T[] {
  return layers.filter(({ clip }) => time >= clip.start && time < clip.end);
}

// 播放逐站经过入点和出点，等新增图层就绪后再走，避免跳过短片段。
// 需传全部节目层，才能找到黑场之后的入点；当前按片段数线性扫描。
export function nextProgramTime(layers: readonly ClockLayer[], time: number, target: number, duration: number) {
  const boundaries = layers.flatMap(({ clip }) => [clip.start, clip.end]).filter(value => value > time + .000001);
  return Math.min(target, duration, ...boundaries);
}

// 暂停所有已登记的源，包含刚离场的片段；保留 src 和已解码画面，卸载时再释放。
export function pauseProgramMedia(clock: ProgramClock) {
  for (const { video } of clock.media.values()) if (!video.paused) video.pause();
}

// 定位像叫号：只处理最新请求，旧事件不能把播放头拉回去。
// 等元数据就绪后再设置源时间；每次请求最多等 15 秒。
function seekProgramMedia(entry: ProgramMedia, clip: EditorPreviewClip, clock: ProgramClock, now: number) {
  if (entry.request === clock.request || entry.video.readyState < 1) return;
  entry.request = clock.request;
  entry.deadline = now + 15000;
  entry.failed = false;
  const target = programSourceTime(clip, clock.time, entry.video.duration);
  if (Math.abs(entry.video.currentTime - target) > .001) entry.video.currentTime = target;
}

// 不能只看 loadeddata：还要确认请求已应用、寻帧已结束且时间接近目标。
// 暂停按项目帧精度检查，播放允许少量漂移，超出后暂停对齐。
// 只有真正就绪才延长等待期限，反复修正不能无限续期；失败需显式重试。
export function programMediaPhase(entry: ProgramMedia, clip: EditorPreviewClip, clock: ProgramClock, fps: number, now: number): ProgramPhase {
  seekProgramMedia(entry, clip, clock, now);
  if (entry.failed || entry.state === "error" || now > entry.deadline) return "error";
  const video = entry.video;
  if (entry.state !== "ready" || video.readyState < 2 || video.seeking || entry.request !== clock.request) return "loading";
  const expected = programSourceTime(clip, clock.time, video.duration);
  const drift = Math.abs(video.currentTime - expected);
  if (drift <= (clock.intent && !clip.reversed ? .2 : .6 / fps)) { entry.deadline = now + 15000; return "ready"; }
  video.pause();
  video.currentTime = expected;
  return "loading";
}

// 像多台投影机同时开场：所有活动层就绪才显示，任一失败则整体报错。
// 尚未登记的层继续等待；没有活动层是黑场，可正常走钟。
export function programPhase(clock: ProgramClock, layers: readonly ClockLayer[], fps: number, now: number): ProgramPhase {
  const phases = layers.map(({ clip }) => {
    const entry = clock.media.get(clip.id);
    return entry ? programMediaPhase(entry, clip, clock, fps, now) : "loading";
  });
  return phases.includes("error") ? "error" : phases.includes("loading") ? "loading" : "ready";
}

// play 可能在切源或暂停后才完成，回执须核对表项和播放意图，过期就停。
// starting 防止重复发起；主动取消不算失败，其余错误交给节目状态显示。
export function playProgramMedia(clock: ProgramClock, entry: ProgramMedia, rate: number) {
  entry.video.playbackRate = rate;
  if (!entry.video.paused || entry.starting) return;
  entry.starting = true;
  void entry.video.play().then(() => {
    if (!clock.intent || ![...clock.media.values()].includes(entry)) entry.video.pause();
  }).catch((error: unknown) => {
    if (!(error instanceof DOMException && error.name === "AbortError")) entry.failed = true;
  }).finally(() => { entry.starting = false; });
}

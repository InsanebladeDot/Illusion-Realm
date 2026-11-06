"use client";

// 素材查看只拥有源时间，不拥有工程播放头；节目合成在另一适配器中调用同一个预览外壳。
// 返回节目会卸载本组件，旧源声音先停下，再由节目装配自己的静音图层。
// 节目与素材不是两个隐藏播放的页签，互斥挂载才能保证不会同时读源或发声。
// 源素材没有片段变换，缩放、位移与不透明度不得从当前检查器反向套用。
// 本文件不负责轨道层序，也不接音轨分离后的独立试听；原视频本身仍可开启声音。
import { useEffect, useRef, useReducer, useState, useCallback, type ReactNode } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { SimpleSelect } from "@/components/SimpleSelect";
import { useTranslation } from "@/i18n";
import { EditorAction, EditorFloatField, EditorPlaceholder } from "./editor-controls";
import { ProgramPreview, type EditorMediaAsset, type EditorPreviewProject } from "./editor-panels";
import styles from "./editor.module.css";

// 加载状态来自媒体事实，探测成功并不意味着当前浏览器支持这个编解码器。
// 源时间只用于素材时间码，不向timeline.reportTime报告，避免试听改变工程书签。
// 播放标记来自原生事件，按钮点击成功不等于浏览器真的允许播放。
// 报告不持有工程对象，故切源后的迟到事件不能覆盖另一片段属性。
interface PlayerReport {
  state: (state: "loading" | "ready" | "error") => void;
  time: (time: number) => void;
  playing: (playing: boolean) => void;
}
// 事件表同时用于订阅和取消，清理时必须使用原函数身份。
// loadeddata证明当前源已有可显示帧，仅metadata事件不足以解除首帧等待。
// error结束等待并停播；元数据仍留在素材会话，不因预览失败删除素材。
// timeupdate读取源的currentTime，素材查看不使用工程指挥时钟累加时间。
// ended与pause都结束播放标记，避免源结束后按钮仍显示暂停。
function sourceEvents(video: HTMLMediaElement, report: PlayerReport, clear: () => void) {
  return {
    loadeddata: () => { clear(); report.state("ready"); },
    error: () => { clear(); report.state("error"); report.playing(false); },
    timeupdate: () => report.time(video.currentTime),
    play: () => report.playing(true),
    pause: () => report.playing(false),
    ended: () => report.playing(false),
  };
}
// 这份安装器同时服务素材查看和节目中的每台真实视频，避免复制清理逻辑。
// 节目适配器提供空time回调，它不会让每层timeupdate争抢工程进度。
// 像给放映机接好电源再放胶片：先安装事件，再设置src和load，快文件也不丢首帧。
// 十五秒截止线只管本次初次加载；节目后续寻帧另有逐请求截止线。
// 超时会暂停该媒体并报告错误，不靠不断重试维持一个永远转圈的状态。
// 输入沿用localfile协议的URL，不fetch整文件、不生成Base64副本。
// 本地路径读取仍由协议处理器负责，渲染层没有Node文件权限。
// 每次装源默认静音，上一素材的有声授权不继承给下一份素材。
// 首帧或错误都会清掉初次加载定时器，成功后不会被旧超时误报失败。
// 清理先移除监听再pause，避免清理事件写回已经退出的组件。
// removeAttribute而非空src，避免把应用页面意外当作媒体请求。
// 最后load释放解码和读取资源，DOM消失本身不足以证明停止读取。
// 该清理同时覆盖切源、返回节目、重试与路由卸载。
// 源URL归调用方所有，安装器没有创建临时Blob，也不擅自撤销别人的URL。
// 失败状态不包含用户路径或解码堆栈，界面显示统一可理解的错误说明。
export function attachSource(video: HTMLMediaElement, source: string, report: PlayerReport) {
  const timeout = setTimeout(() => { video.pause(); report.state("error"); }, 15000);
  const events = sourceEvents(video, report, () => clearTimeout(timeout));
  for (const [name, handler] of Object.entries(events)) video.addEventListener(name, handler);
  video.src = source;
  video.muted = true;
  video.load();
  return () => {
    clearTimeout(timeout);
    for (const [name, handler] of Object.entries(events)) video.removeEventListener(name, handler);
    video.pause(); video.removeAttribute("src"); video.load();
  };
}
// 播放是可拒绝的异步操作，必须接住Promise，否则不支持的源会产生未处理错误。
// 主动切源与暂停常见AbortError，这种正常取消不应把新画面报成失败。
// 真正的播放拒绝只回写仍连接的旧节点，防止旧Promise影响新查看对象。
// 取消不会自动重新播放，用户必须对当前源明确发出播放意图。
async function toggleSource(video: HTMLMediaElement | null, state: string, onError: () => void) {
  if (!video || state !== "ready") return;
  if (!video.paused) { video.pause(); return; }
  try { await video.play(); }
  catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; if (video.isConnected) onError(); }
}
interface PlayerSnapshot { state: "loading" | "ready" | "error"; time: number; playing: boolean; muted: boolean; attempt: number; }
const INITIAL_PLAYER: PlayerSnapshot = { state: "loading", time: 0, playing: false, muted: true, attempt: 0 };
function playerReports(update: (patch: Partial<PlayerSnapshot>) => void): PlayerReport {
  return { state: state => update({ state }), time: time => update({ time }), playing: playing => update({ playing }) };
}
function setSourceMuted(video: HTMLMediaElement | null, update: (patch: Partial<PlayerSnapshot>) => void) {
  if (!video) return;
  video.muted = !video.muted;
  update({ muted: video.muted });
}
// 每个实例有自己的ref、状态与重试号；共用Hook并不意味着共享播放器。
// retry重装真实源，不能只把错误文案换成ready伪装成功。
// 事件订阅依赖源URL和重试号，观看速度或面板大小变化不会反复重载文件。
function useSourcePlayer(asset: EditorMediaAsset) {
  const videoRef = useRef<HTMLMediaElement>(null);
  const [snapshot, update] = useReducer((state: PlayerSnapshot, patch: Partial<PlayerSnapshot>) => ({ ...state, ...patch }), INITIAL_PLAYER);
  useEffect(() => {
    const video = videoRef.current;
    if (video && asset.sourceUrl) return attachSource(video, asset.sourceUrl, playerReports(update));
  }, [asset.sourceUrl, snapshot.attempt]);
  return {
    elementRef: videoRef, ...snapshot, mediaRef: useCallback((element: HTMLMediaElement | null) => { videoRef.current = element; }, []),
    togglePlay: () => toggleSource(videoRef.current, snapshot.state, () => update({ state: "error", playing: false })),
    toggleMuted: () => setSourceMuted(videoRef.current, update),
    retry: () => update({ ...INITIAL_PLAYER, attempt: snapshot.attempt + 1 }),
  };
}

// 复用ProgramPreview的标题、画布与走带按钮，源播放器只注入媒体与控制插槽。
// 逐帧使用源帧率，源24fps时不能擅自当成30fps；无探测值才回落项目帧率。
// 逐帧先暂停真实节点，媒体当前时间成为后续步进起点，不更改工程书签。
// 声音按钮只在素材查看开放；节目合成没有这条解除静音的通路。
// 错误槽保留重试入口，封面和已探测参数由原素材行继续展示。
// headerActions由公共工作区注入，紧凑面板入口不会为两种媒体复制一份。
// 源节点key由宿主素材ID决定，同一源的工程副本不会改变本处生命周期。
export function LiveSourcePreview({ asset, project, onBack, headerActions }: { asset: EditorMediaAsset; project: EditorPreviewProject; onBack: () => void; headerActions?: ReactNode }) {
  const { t } = useTranslation();
  const { elementRef, mediaRef, state, time, playing, muted, togglePlay, toggleMuted, retry } = useSourcePlayer(asset);
  const [rate, setRate] = useState(1);
  useEffect(() => { if (elementRef.current) elementRef.current.playbackRate = rate; }, [rate, elementRef, state]);
  function step(direction: -1 | 1) {
    const media = elementRef.current;
    if (!media || state !== "ready") return;
    media.pause();
    media.currentTime = Math.max(0, Math.min(media.duration, media.currentTime + direction / (asset.metadata?.fps || project.fps)));
  }
  const video = <video ref={mediaRef} data-live-video className={styles.liveVideo} playsInline preload="auto" aria-label={asset.name} />;
  const live = {
    step: state === "ready" ? step : undefined,
    rateControl: <PreviewRateControl rate={rate} onChange={setRate} />,
    asset, state, time,
    surface: <>{video}{state !== "ready" && <div className={styles.playerOverlay}><EditorPlaceholder state={state} message={t(state === "error" ? "toolBox.editorUi.decodeFailed" : "toolBox.editorUi.previewLoading")} />{state === "error" && <EditorAction label={t("toolBox.editorUi.retryPreview")} onClick={retry} />}</div>}</>,
    controls: <><EditorAction icon={playing ? Pause : Play} label={t(playing ? "toolBox.editorUi.pause" : "toolBox.editorUi.play")} onClick={() => { void togglePlay(); }} disabledReason={state !== "ready" ? t(state === "error" ? "toolBox.editorUi.decodeFailed" : "toolBox.editorUi.previewLoading") : undefined} compact /><EditorAction icon={muted ? VolumeX : Volume2} label={t(muted ? "toolBox.editorUi.enableSound" : "toolBox.editorUi.mute")} onClick={toggleMuted} compact /></>,
  };
  return <ProgramPreview clip={null} assets={[]} project={project} mode="source" onBack={onBack} live={live} headerActions={headerActions} />;
}

// 工程与节目合成的窄接口：time和onTime都是工程秒数，不含任何源入点。
// version只在用户定位或时间安排修改时递增，正常走钟不得递增制造定位回流。
// 多层源时间在programSourceTime统一映射，不能把time直接写给所有video。
// onSeek表示明确用户请求，onTime表示唯一时钟发布，两者方向和授权不同。
// 接口不传selectedId，选中操作因此没有修改合成优先级的入口。
export interface LivePreviewTransport { time: number; version: number; onTime: (time: number) => void; onSeek: (time: number) => void; }


// 素材与节目共用同一组预设和自定义输入，差别仅由onChange绑定的时间所有者注入。
// 自定义值并入当前选项，1.37等合法数值不应在下拉关闭后回落到默认值。
// 原字段继续负责范围、精度、草稿与错误；这里不复制第二套数字输入校验。
export function PreviewRateControl({ rate, onChange }: { rate: number; onChange: (rate: number) => void }) {
  const { t } = useTranslation();
  const options = [...new Set([.25, .5, .75, 1, 1.25, 1.5, 2, 3, 4, rate])].sort((a, b) => a - b).map(value => ({ value: String(value), label: `${value}×` }));
  return <div className={styles.previewRate}><SimpleSelect portal className="w-[72px] shrink-0" ariaLabel={t("toolBox.editorUi.previewRatePreset")} value={String(rate)} options={options} onChange={value => onChange(Number(value))} /><EditorFloatField layout="stacked" label={t("toolBox.editorUi.previewRate")} value={rate} min={.25} max={4} precision={2} unit="×" onCommit={onChange} /></div>;
}

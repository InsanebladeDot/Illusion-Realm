"use client";

/** 正式工程会话管理V1与分离音轨的安排；素材入库、媒体读取仍由LIVE-01拥有。 */
// 鼠标轮廓是便签草稿，松手盖章后才写进工程；取消只撕掉便签。
// 工程没有持久化插件，离开页面即释放，样板不会订阅此会话。
import { createElement, useEffect, useReducer, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type RefObject, type ReactNode, type PointerEvent } from "react";
import { DEFAULT_TRACKS, DEFAULT_TRACK_LIMITS, sameTrackKind, isVideoTrack, nextTrack, trimClip, type TrackId, type TrackLimits } from "./timeline-track-model";
import { timelineHistoryReducer, canStepHistory, type TimelineProjectState } from "./timeline-history";
import { useTimelineEditing } from "./use-timeline-editing";
import { basicClipEdit, updateClipCrop, type BasicClipAction } from "./clip-basic-edit-model";
import type { ClipCrop } from "./editor-timeline";
import type { TimelineTool, SectionEdit } from "./timeline-edit-model";
import { useClipTrim } from "./use-clip-trim";
import { changeClipSpeed } from "./clip-speed-model";
import { TimelineSettings } from "./timeline-settings";
import { defaultTransform, toggleTransformKeyframe, updateAnimatedTransform, type ClipTransform, type TransformKey } from "./clip-transform-model";
import type { EditorPreviewProject } from "./editor-panels";
import { t } from "@/i18n";
import type { EditorMediaAsset } from "./editor-panels";
import { resolveTimelineCommand, applyTimelineEdit, readTimelinePayload, TIMELINE_DRAG_TYPE, timelineDropTime, timelineDuration, type LiveTimelineClip, type TimelineCommand, type TimelinePayload, type TimelineEdit } from "./live-timeline-model";
// 右键锚点只属于当前页面，菜单关闭后不保留DOM或媒体引用。
// 展示复用公共菜单外壳，工程修改继续在本Hook的共同提交边界完成。
import type { LiveClipMenuAnchor } from "./live-clip-menu";

// 拖动草稿只显示候选位置和拒绝原因，松手时还要重新校验。
export interface TimelineDraft { start: number; length: number; track: string; valid: boolean; reason: string; }
// 公共时间线只上报操作意图；工程状态和文件处理由调用方负责。
// range 统一标尺、片段与播放头比例，scrollRef 指向唯一滚动区。
export interface TimelineInteraction {
  basicTools?: ReactNode; currentTime?: number;
  // 定位和锁定回调属于当前工程实例，视口组件不能直接改片段数组。
  tracks?: readonly TrackId[]; limits?: TrackLimits; settings?: ReactNode; draggingKind?: "V" | "A";
  grab?: (event: PointerEvent<HTMLButtonElement>, id: string) => void;
  trimDraft?: LiveTimelineClip | null;
  trimStart?: (event: PointerEvent<HTMLElement>, id: string, edge: "start" | "end") => void;
  trimKey?: (event: KeyboardEvent<HTMLElement>, id: string, edge: "start" | "end") => void;
  seek?: (time: number) => void;
  hiddenTracks?: readonly string[]; toggleVisibility?: (track: string) => void;
  lockedTracks?: readonly string[]; toggleLock?: (track: string) => void;
  // 多选只供工程批量操作，主选中继续服务原检查器；样板不传则保持原单选。
  selectedIds?: readonly string[];
  editing?: { tool: TimelineTool; setTool: (tool: TimelineTool) => void; undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; canDelete: boolean; canSection: boolean; section: (action: SectionEdit) => void; remove: () => void };
  click?: (event: MouseEvent<HTMLButtonElement>, id: string) => void;
  selectedId: string | null; range: number; draft: TimelineDraft | null; notice: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  select: (id: string) => void;
  start: (event: DragEvent<HTMLElement>, kind: "asset" | "clip", id: string) => void;
  over: (event: DragEvent<HTMLDivElement>, track: string) => void;
  drop: (event: DragEvent<HTMLDivElement>, track: string) => void;
  cancel: () => void;
  leave: (event: DragEvent<HTMLDivElement>) => void;
  keyDown: (event: KeyboardEvent<HTMLButtonElement>, id: string) => void;
  // 可选入口保持样板兼容；键盘菜单键与右键绑定相同的实例身份。
  // 公共片段壳只转发事件，不持有菜单或实现工程编辑。
  contextMenu?: (event: MouseEvent<HTMLButtonElement>, id: string) => void;
}
// 手势快照像一张订单：固定开始时的工程、秒尺和抓取偏移，松手才提交。
// 来源轨道保留不变，目标从当前 lane 读取；锁状态变化会取消手势。
// 坐标用 CSS 像素，不再乘 DPR；updated 用于停止失去事件后的自动滚动。
interface Gesture { payload: TimelinePayload; command: TimelineCommand; clips: LiveTimelineClip[]; assets: readonly EditorMediaAsset[]; fps: number; range: number; pixels: number; offset: number; length: number; lane: HTMLDivElement | null; x: number; updated: number; track: string; locked: readonly string[]; }

// 悬停和自动滚动共用落点计算，按目标轨道检查类型、锁定和碰撞。
// lane 矩形已包含滚动位移，不能再加 scrollLeft；草稿不会改动正式工程。
function gestureDraft(gesture: Gesture): TimelineDraft | null {
  if (!gesture.lane) return null;
  const start = timelineDropTime(gesture.x, gesture.lane.getBoundingClientRect().left, gesture.pixels, gesture.offset, gesture.fps);
  const track = gesture.lane.dataset.editorTrackLane ?? "";
  const compatible = sameTrackKind(gesture.track, track);
  const locked = gesture.locked.includes(track);
  const result = resolveTimelineCommand(gesture.clips, gesture.assets, { ...gesture.command, track: track as TrackId, start }, gesture.fps);
  // 轮廓锁在所属行，跨轨经过也不会暗示可以垂直移动。
  // 新视频只允许V1，已有分离音频则只允许其当前音轨。
  // 横坐标继续使用真实滚动后的lane矩形，不复制第二套滚动层。
  return { start: result.ok ? result.clip.start : start, length: gesture.length, track, valid: compatible && !locked && result.ok, reason: locked ? t("toolBox.editorUi.trackLocked") : !compatible ? t(isVideoTrack(gesture.track) ? "toolBox.editorUi.videoTrackOnly" : "toolBox.editorUi.sameTrackOnly") : result.ok ? t("toolBox.editorUi.validPlacement") : t(`toolBox.editorUi.${result.reason}`) };
}

// 在可见内容边缘每次滚动最多 18px，排除固定轨道头。
// 超过 1 秒没有 dragover 就停，防止鼠标移出窗口后一直滚动。
function autoScroll(gesture: Gesture | null, scroller: HTMLDivElement | null) {
  if (!gesture?.lane || !scroller || Date.now() - gesture.updated > 1000) return;
  const box = scroller.getBoundingClientRect();
  const header = scroller.querySelector('[data-editor-track-head="V1"]')?.getBoundingClientRect();
  const left = Math.max(header?.right ?? box.left, gesture.lane.getBoundingClientRect().left);
  const step = gesture.x < left + 32 ? -18 : gesture.x > box.right - 32 ? 18 : 0;
  if (step) scroller.scrollLeft += step;
}

// 有片段时提醒离开；取消导航保留会话，新窗口和下载不拦截。
// 这只是离开确认，不保存工程；卸载时移除监听。
function useTimelineLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    // document订阅收到浏览器原生事件，片段右键收到React合成事件，二者不能混用。
    // 显式globalThis避免新菜单的类型import遮住原有DOM类型。
    // 注册与清理保留同一个函数引用，菜单扩展不改变离开确认的生命周期。
    const navigate = (event: globalThis.MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target || link.download || link.href === location.href || event.ctrlKey || event.metaKey || event.button !== 0) return;
      if (!window.confirm(t("toolBox.editorUi.unsavedTimeline"))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty]);
}

// 片段、轨道顺序、选择和书签共用一份工程状态，素材查看独立管理。
// 隐藏只影响画面，锁定只限制编辑；隐藏片段仍占时间且不能与同轨重叠。
type ProjectSnapshot = TimelineProjectState;
// seekVersion 区分用户定位和正常播放报告，避免播放进度反复触发寻帧。
export interface ProjectContext { step: (step: "undo" | "redo") => void; canUndo: boolean; canRedo: boolean; project: EditorPreviewProject; state: ProjectSnapshot; update: (patch: Partial<ProjectSnapshot>) => void; assets: readonly EditorMediaAsset[]; fps: number; onSelectClip: () => void; }
interface GestureContext { grab: RefObject<{ id: string; offset: number } | null>; project: ProjectContext; session: string; gesture: RefObject<Gesture | null>; scrollRef: RefObject<HTMLDivElement | null>; range: number; setRange: (range: number | null) => void; setDraft: (draft: TimelineDraft | null) => void; }

// 用当前工程重新校验，成功后一次提交片段、选择和书签；失败只显示原因。
// 移动要检查源轨与目标轨的锁，新轨只能使用 nextTrack 分配的编号。
function commitTimeline(context: ProjectContext, command: TimelineCommand) {
  const source = command.kind === "add" ? "V1" : context.state.clips.find(clip => clip.id === command.id)?.track;
  const track = command.track ?? source;
  if (!source || !track || !sameTrackKind(source, track) || context.state.lockedTracks.some(item => (command.kind === "move" && item === source) || item === track)) return;
  if (!context.state.tracks.includes(track as TrackId) && nextTrack(context.state.tracks, isVideoTrack(track) ? "V" : "A", context.state.limits) !== track) return;
  const result = resolveTimelineCommand(context.state.clips, context.assets, command, context.fps);
  if (!result.ok) { context.update({ notice: t(`toolBox.editorUi.${result.reason}`) }); return; }
  // 只给新可视片段补独立构图；移动保留原构图，音频不补画面参数。
  const clips = result.clips.map(item => item.transform || item.audioOnly ? item : { ...item, transform: defaultTransform(context.project) });
  context.update({ tracks: context.state.tracks.includes(result.clip.track) ? context.state.tracks : insertTrack(context.state.tracks, result.clip.track), clips, selectedId: result.clip.id, viewed: true, currentTime: result.clip.start, seekVersion: context.state.seekVersion + 1, notice: t("toolBox.editorUi.placementDone") });
  context.onSelectClip();
}
// 按片段 ID 选择并定位到起点，不改变素材库的高亮。
function selectTimeline(context: ProjectContext, id: string) {
  const clip = context.state.clips.find(clip => clip.id === id);
  if (!clip) return;
  context.update({ selectedId: id, viewed: true, currentTime: clip.start, seekVersion: context.state.seekVersion + 1 }); context.onSelectClip();
}
// 复制、删除和分离共用提交入口；成功才修改工程，分离不提取或改写源文件。
// 新音轨按既有顺序和上限分配，删除片段保留轨道。
function commitTimelineEdit(context: ProjectContext, action: TimelineEdit, id: string) {
  // 菜单可能已过期，执行时重新检查目标和轨道锁。
  if (context.state.lockedTracks.includes(context.state.clips.find(clip => clip.id === id)?.track ?? "")) return;
  // 分离也会写入目标音轨，因此传入完整锁表。
  const result = applyTimelineEdit(context.state.clips, context.assets, action, id, crypto.randomUUID(), context.fps, context.state.lockedTracks, context.state.tracks, context.state.limits);
  if (!result.ok) { context.update({ notice: t(`toolBox.editorUi.${result.reason}`) }); return; }
  // 副本/新音轨从新实例起点查看；删掉末段则把书签收回新总长，不能悬在工程之外。
  const currentTime = result.clips.find(clip => clip.id === result.selectedId)?.start ?? Math.min(context.state.currentTime, timelineDuration(result.clips));
  const tracks = result.clips.reduce((current, clip) => current.includes(clip.track) ? current : insertTrack(current, clip.track), context.state.tracks);
  context.update({ tracks, clips: result.clips, selectedId: result.selectedId, currentTime, seekVersion: context.state.seekVersion + 1, viewed: result.selectedId !== null, notice: t("toolBox.editorUi.editDone") });
  context.onSelectClip();
}

// 键盘菜单以当前按钮为锚点，公共菜单负责聚焦；组合键仍交给系统。
function timelineClipKey(context: GestureContext, event: KeyboardEvent<HTMLButtonElement>, id: string, open: (id: string, x: number, y: number, trigger: HTMLButtonElement) => void) {
  if (event.target !== event.currentTarget || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    open(id, rect.left, rect.bottom, event.currentTarget);
  } else moveByKey(context, event, id);
}
function useTimelineMenu(context: GestureContext) {
  // 关闭后只向仍存在的触发按钮恢复焦点，不让时间线跟着滚动。
  const [anchor, setAnchor] = useState<LiveClipMenuAnchor | null>(null);
  const close = () => { setAnchor(null); if (anchor?.trigger.isConnected) anchor.trigger.focus({ preventScroll: true }); };
  const open = (id: string, x: number, y: number, trigger: HTMLButtonElement) => {
    if (context.project.state.lockedTracks.includes(context.project.state.clips.find(clip => clip.id === id)?.track ?? "")) return;
    // 先结束仍聚焦的字段草稿，再打开菜单；否则失焦提交可能在菜单挂载后触发滚动关闭。
    // preventScroll保留横向时间位置，右键选择不把片段强行滚回视口中心。
    trigger.focus({ preventScroll: true });
    cancelGesture(context); selectTimeline(context.project, id); setAnchor({ id, x, y, trigger });
  };
  const contextMenu = (event: MouseEvent<HTMLButtonElement>, id: string) => { event.preventDefault(); open(id, event.clientX, event.clientY, event.currentTarget); };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string) => timelineClipKey(context, event, id, open);
  const perform = (action: TimelineEdit) => { if (anchor) commitTimelineEdit(context.project, action, anchor.id); close(); };
  return { anchor, close, perform, contextMenu, keyDown };
}
// 工程从空会话开始；撤销栈统一持有快照，素材仍由媒体会话管理。
function useTimelineProject(assets: readonly EditorMediaAsset[], fps: number, onSelectClip: () => void, project: EditorPreviewProject): ProjectContext {
  const initial: ProjectSnapshot = { tracks: [...DEFAULT_TRACKS], limits: { ...DEFAULT_TRACK_LIMITS }, currentTime: 0, seekVersion: 0, hiddenTracks: [], lockedTracks: [], clips: [], selectedId: null, selectedIds: [], viewed: false, notice: "" };
  // 历史只截取确认的结构变化，播放回报和素材选择不会每帧占用撤销步骤。
  // 旧命令仍发原patch；reducer与快捷键/按钮共享一次恢复，保持媒体版本递增。
  const [history, dispatch] = useReducer(timelineHistoryReducer, { present: initial, past: [], future: [] });
  const update = (patch: Partial<ProjectSnapshot>) => dispatch({ patch });
  return { state: history.present, update, assets, fps, onSelectClip, project, step: step => dispatch({ step }), canUndo: canStepHistory(history, "undo"), canRedo: canStepHistory(history, "redo") };
}
// 先清手势引用，迟到的 drop 就不能提交；草稿从未写入工程，无需回滚。
function cancelGesture(context: GestureContext) {
  context.gesture.current = null; context.setRange(null); context.setDraft(null);
}
// 开始时核对来源，冻结秒尺与抓取偏移，载荷只存会话、类型和 ID。
// 原生拖动使用按下时保留的小数偏移，避免整数坐标造成一帧偏差；合成事件用自身坐标。
function startGesture(context: GestureContext, event: DragEvent<HTMLElement>, kind: "asset" | "clip", id: string) {
  const { state, assets, fps } = context.project;
  const lane = context.scrollRef.current?.querySelector<HTMLDivElement>('[data-editor-track-lane="V1"]');
  const clip = kind === "clip" ? state.clips.find(item => item.id === id) : undefined, asset = assets.find(item => item.id === id);
  if (clip && state.lockedTracks.includes(clip.track)) { event.preventDefault(); return; }
  if (!lane || (kind === "asset" ? asset?.state !== "ready" || asset.kind !== "video" : !clip)) { event.preventDefault(); return; }
  const payload = { session: context.session, kind, id }, command: TimelineCommand = kind === "asset" ? { kind: "add", id: crypto.randomUUID(), assetId: id, start: 0 } : { kind: "move", id, start: 0 };
  const pixels = lane.getBoundingClientRect().width / context.range, offset = kind === "clip" ? (event.isTrusted && context.grab.current?.id === id ? context.grab.current.offset : event.clientX - event.currentTarget.getBoundingClientRect().left) / pixels : 0;
  context.grab.current = null;
  context.gesture.current = { payload, command, clips: state.clips, assets, fps, range: context.range, pixels, offset, length: clip ? clip.end - clip.start : Math.ceil((asset?.duration ?? 0) * fps) / fps, lane: null, x: event.clientX, updated: Date.now(), track: clip?.track ?? "V1", locked: state.lockedTracks };
  // 浏览器默认影子会随鼠标上下漂移，隐藏它，只显示锁轨的真实位置轮廓。
  // 透明画布只用于本次dragImage，不挂到DOM，也不保留视频封面副本。
  // 正式片段仍在原位，只有有效松手才提交水平位置。
  event.dataTransfer.setDragImage(document.createElement("canvas"), 0, 0);
  event.dataTransfer.setData(TIMELINE_DRAG_TYPE, JSON.stringify(payload)); event.dataTransfer.effectAllowed = kind === "asset" ? "copy" : "move";
  context.setRange(context.range); context.project.update({ notice: "", dragKind: isVideoTrack(clip?.track ?? "V1") ? "V" : "A" });
}
// 内部拖放只更新草稿；外部文件继续交给宿主导入。
// dragover 可能读不到载荷正文，此时用本地手势，松手再核对实际载荷。
function hoverGesture(context: GestureContext, event: DragEvent<HTMLDivElement>, track: string) {
  if (!event.dataTransfer.types.includes(TIMELINE_DRAG_TYPE)) return;
  event.preventDefault(); event.stopPropagation();
  const current = context.gesture.current;
  if (!current) { event.dataTransfer.dropEffect = "none"; context.project.update({ notice: t("toolBox.editorUi.invalidPlacement") }); return; }
  current.lane = event.currentTarget; current.x = event.clientX; current.updated = Date.now();
  const next = gestureDraft(current); context.setDraft(next);
  event.dataTransfer.dropEffect = sameTrackKind(current.track, track) && next?.valid ? current.payload.kind === "asset" ? "copy" : "move" : "none";
}
// 松手重新核对会话和来源，并按最后坐标计算落点，不能沿用旧轮廓。
// 仅有效候选进入正式提交；成功或失败都清掉手势。
function dropGesture(context: GestureContext, event: DragEvent<HTMLDivElement>, track: string) {
  if (!event.dataTransfer.types.includes(TIMELINE_DRAG_TYPE)) return;
  event.preventDefault(); event.stopPropagation();
  const current = context.gesture.current, payload = readTimelinePayload(event.dataTransfer.getData(TIMELINE_DRAG_TYPE), context.session);
  if (!current || !payload || payload.id !== current.payload.id || payload.kind !== current.payload.kind || !sameTrackKind(current.track, track)) {
    context.project.update({ notice: t(current && !sameTrackKind(current.track, track) ? current.track === "V1" ? "toolBox.editorUi.videoTrackOnly" : "toolBox.editorUi.sameTrackOnly" : "toolBox.editorUi.invalidPlacement") }); cancelGesture(context); return;
  }
  current.lane = event.currentTarget; current.x = event.clientX;
  const next = gestureDraft(current);
  if (next?.valid) commitTimeline(context.project, { ...current.command, track: track as TrackId, start: next.start });
  cancelGesture(context);
}
// 聚焦片段时左右键移动一帧，Shift 移动一秒；拖动中不并行修改工程。
function moveByKey(context: GestureContext, event: KeyboardEvent<HTMLButtonElement>, id: string) {
  if (context.gesture.current || !["ArrowLeft", "ArrowRight"].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  const clip = context.project.state.clips.find(item => item.id === id); if (!clip) return;
  commitTimeline(context.project, { kind: "move", id, start: clip.start + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 1 : 1 / context.project.fps) });
}
// 手势期间才安装自动滚动和取消监听；Escape、失焦、改尺寸或结束拖动都清草稿。
// 结束和卸载同时清定时器、观察器及监听，避免跨页残留。
function useGestureLifecycle(gesture: RefObject<Gesture | null>, scrollRef: RefObject<HTMLDivElement | null>, setDraft: (draft: TimelineDraft | null) => void, setRange: (range: number | null) => void, range: number | null) {
  useEffect(() => {
    if (range === null) return;
    const abort = () => { gesture.current = null; setDraft(null); setRange(null); };
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); abort(); } };
    const timer = setInterval(() => { autoScroll(gesture.current, scrollRef.current); if (gesture.current) setDraft(gestureDraft(gesture.current)); }, 60);
    const stopResize = watchTimelineWidth(scrollRef.current, abort);
    document.addEventListener("dragend", abort); document.addEventListener("keydown", key, true); window.addEventListener("resize", abort); window.addEventListener("blur", abort);
    return () => { clearInterval(timer); stopResize(); document.removeEventListener("dragend", abort); document.removeEventListener("keydown", key, true); window.removeEventListener("resize", abort); window.removeEventListener("blur", abort); gesture.current = null; };
  }, [range, gesture, scrollRef, setDraft, setRange]);
}

// 导航开合未必触发 window.resize，需观察实际视口宽度。
// 宽度改变后旧秒尺不再准确，取消本次拖动；横向滚动不影响宽度。
function watchTimelineWidth(scroller: HTMLDivElement | null, abort: () => void) {
  if (!scroller) return () => {};
  const width = scroller.clientWidth;
  const observer = new ResizeObserver(() => { if (scroller.clientWidth !== width) abort(); });
  observer.observe(scroller);
  return () => observer.disconnect();
}
// 每个编辑器独立持有手势与会话 ID；离开轨道只清轮廓，拖回仍可继续。
function useTimelineGesture(project: ProjectContext, baseRange: number) {
  const [session] = useState(() => crypto.randomUUID()), [frozen, setRange] = useState<number | null>(null);
  const [draft, setDraft] = useState<TimelineDraft | null>(null);
  const grab = useRef<{ id: string; offset: number } | null>(null);
  const gesture = useRef<Gesture | null>(null), scrollRef = useRef<HTMLDivElement>(null);
  useGestureLifecycle(gesture, scrollRef, setDraft, setRange, frozen);
  const context: GestureContext = { grab, project, session, gesture, scrollRef, range: frozen ?? baseRange, setRange, setDraft };
  const leave = (event: DragEvent<HTMLDivElement>) => { if (event.currentTarget.contains(event.relatedTarget as Node | null)) return; if (gesture.current) gesture.current.lane = null; setDraft(null); };
  return { context, draft, leave, draggingKind: frozen !== null ? project.state.dragKind : undefined };
}
// 统一装配工程、菜单、拖动和修剪；视口留十秒空位，空位不计入工程总长。
// 属性按选中片段读取，节目按工程时间和轨道顺序合成，两者可以指向不同片段。
export function useLiveTimeline(assets: readonly EditorMediaAsset[], fps: number, onSelectClip: () => void, dimensions: EditorPreviewProject) {
  const project = useTimelineProject(assets, fps, onSelectClip, dimensions), duration = timelineDuration(project.state.clips);
  const { context, draft, leave, draggingKind } = useTimelineGesture(project, Math.max(30, Math.ceil((duration + 10) / 5) * 5));
  // 菜单是临时UI状态，真实工程与手势仍只有原来的一个拥有者。
  // 键盘事件先处理菜单键/Delete，其余左右移动继续复用共同命令。
  // 不将右键菜单接入DEMO入口，所以样板的禁用能力不会被意外打开。
  const menu = useTimelineMenu(context);
  const seek = (time: number) => seekTimeline(project, time);
  const toggleLock = (track: string) => { menu.close(); cancelGesture(context); trim.cancel(); project.update({ lockedTracks: project.state.lockedTracks.includes(track) ? project.state.lockedTracks.filter(id => id !== track) : [...project.state.lockedTracks, track] }); };
  useTimelineLeaveGuard(project.state.clips.length > 0);
  const trim = useClipTrim({ clips: project.state.clips, locked: project.state.lockedTracks, fps, range: context.range, scrollRef: context.scrollRef, commit: (id, edge, time) => commitTimelineTrim(project, id, edge, time) });
  // 所有历史/剪贴板入口先结束旧手势，迟到的松手不能覆盖恢复后的工程。
  // 工具选择只保存在当前编辑实例，公共样板不创建可写命令。
  const editing = useTimelineEditing(project, () => { menu.close(); cancelGesture(context); trim.cancel(); });
  const interaction: TimelineInteraction = {
    currentTime: project.state.currentTime, selectedIds: project.state.selectedIds, editing: editing.controls, click: (event, id) => editing.click(event, id, context.range),
    tracks: project.state.tracks, limits: project.state.limits,
    settings: createElement(TimelineSettings, { tracks: project.state.tracks, limits: project.state.limits, onChange: limits => project.update({ limits }) }),
    draggingKind,
    grab: (event, id) => captureGrab(context, event, id),
    trimDraft: trim.draft, trimStart: trim.start, trimKey: trim.key,
    seek, toggleLock, lockedTracks: project.state.lockedTracks,
    hiddenTracks: project.state.hiddenTracks, toggleVisibility: track => project.update({ hiddenTracks: project.state.hiddenTracks.includes(track) ? project.state.hiddenTracks.filter(id => id !== track) : [...project.state.hiddenTracks, track] }),
    selectedId: project.state.selectedId, range: context.range, draft, notice: project.state.notice, scrollRef: context.scrollRef,
    select: id => selectTimeline(project, id), start: (event, kind, id) => { menu.close(); startGesture(context, event, kind, id); },
    over: (event, track) => hoverGesture(context, event, track), drop: (event, track) => dropGesture(context, event, track),
    cancel: () => cancelGesture(context), leave, keyDown: menu.keyDown, contextMenu: menu.contextMenu,
  };
  const { transform, resetTransform, selectCanvas } = timelineTransforms(project, assets, dimensions);
  const { basic, crop } = timelineBasicCommands(project, () => { menu.close(); cancelGesture(context); trim.cancel(); });
  return { basic, crop, keyDown: editing.key, speed: (id: string, speed: number) => commitSpeed(project, id, speed), keyframe: (id: string, key: TransformKey, frame: number, value: number) => { const clips = toggleTransformKeyframe(project.state.clips, id, key, frame, value, dimensions, project.state.lockedTracks); if (clips) project.update({ clips }); }, transform, resetTransform, selectCanvas, lockedTracks: project.state.lockedTracks, seek, currentTime: project.state.currentTime, seekVersion: project.state.seekVersion, reportTime: (time: number) => project.update({ currentTime: time }), menu, clips: project.state.clips, duration, selectedClip: project.state.clips.find(clip => clip.id === project.state.selectedId) ?? null, viewed: project.state.viewed, closePreview: () => project.update({ viewed: false }), interaction, addAsset: (assetId: string) => { if (!context.gesture.current) commitTimeline(project, { kind: "add", id: crypto.randomUUID(), assetId, start: duration }); } };
}

// 工具栏与右键共享基础片段命令；先结束手势，再按当前锁表重新验证目标。
// 裁剪草稿在画布拥有，只有确认后的四边比例进入工程和历史。
function timelineBasicCommands(project: ProjectContext, cancel: () => void) {
  // 所有基础动作仍发共同工程补丁，一次确认只留一页历史。
  const basic = (action: BasicClipAction) => {
    cancel();
    const clips = basicClipEdit(project.state.clips, project.state.selectedId ?? "", action, project.state.currentTime, project.fps, project.state.lockedTracks, () => crypto.randomUUID());
    if (clips) {
      const inserted = action === "freeze" ? clips.find(clip => !project.state.clips.some(old => old.id === clip.id) && clip.freezeTime !== undefined) : undefined;
      project.update({ clips, selectedId: inserted?.id ?? project.state.selectedId, seekVersion: project.state.seekVersion + 1 });
      project.onSelectClip();
    }
    else project.update({ notice: t("toolBox.editorUi.sectionBlocked") });
  };
  const crop = (id: string, value: ClipCrop) => {
    const clips = updateClipCrop(project.state.clips, id, value, project.state.lockedTracks);
    if (clips) project.update({ clips });
  };
  return { basic, crop };
}


// 定位像移动书签：按项目帧舍入并限制在工程内，不改变选择或片段区间。
// 每次显式定位增加版本；正常播放报告不能经过这里，否则会反复暂停寻帧。
function seekTimeline(context: ProjectContext, time: number) {
  if (!Number.isFinite(time)) return;
  const currentTime = Math.max(0, Math.min(timelineDuration(context.state.clips), Math.round(time * context.fps) / context.fps));
  context.update({ currentTime, seekVersion: context.state.seekVersion + 1, viewed: true });
  context.onSelectClip();
}

// 同一时刻按视频轨头顺序查找画面；显式选中音轨时保留原独立试听。
function insertTrack(tracks: readonly TrackId[], track: TrackId): TrackId[] {
  return isVideoTrack(track) ? [...tracks.filter(isVideoTrack), track, ...tracks.filter(item => !isVideoTrack(item))] : [...tracks, track];
}

// 构图更新只改画面参数；画布选择不跳时间、不重排轨道。
function timelineTransforms(project: ProjectContext, assets: readonly EditorMediaAsset[], dimensions: EditorPreviewProject) {
  const transform = (id: string, patch: Partial<ClipTransform>) => {
    const clips = updateAnimatedTransform(project.state.clips, assets, id, patch, dimensions, project.state.lockedTracks, project.state.currentTime);
    if (clips) project.update({ clips });
  };
  const selectCanvas = (id: string) => { if (project.state.clips.some(item => item.id === id)) project.update({ selectedId: id }); };
  // 组重置清除该组动画，不能在每个关键帧位置逐次点重置才恢复默认构图。
  const resetTransform = (id: string, patch: Partial<ClipTransform>) => {
    if (project.state.lockedTracks.includes(project.state.clips.find(clip => clip.id === id)?.track ?? "")) return;
    const clips = project.state.clips.map(clip => {
      if (clip.id !== id || clip.audioOnly) return clip;
      const keyframes = { ...clip.keyframes };
      for (const key of Object.keys(patch) as TransformKey[]) delete keyframes[key];
      return { ...clip, transform: { ...defaultTransform(dimensions), ...clip.transform, ...patch }, keyframes };
    });
    project.update({ clips });
  };
  return { transform, resetTransform, selectCanvas };
}

// 修剪成功才换片段数组并重新定位源时间；总长缩短时把书签收回末尾。
// 邻居碰撞和剩余源长度由纯模型检查，界面不另算一套规则。
function commitTimelineTrim(project: ProjectContext, id: string, edge: "start" | "end", time: number) {
  const clips = trimClip(project.state.clips, id, edge, time, project.fps, project.state.lockedTracks);
  if (clips) project.update({ clips, seekVersion: project.state.seekVersion + 1, currentTime: Math.min(project.state.currentTime, timelineDuration(clips)) });
}

// 记录整个片段壳内的按下偏移，不保留事件对象，也不乘 DPR。
function captureGrab(context: GestureContext, event: PointerEvent<HTMLButtonElement>, id: string) {
  context.grab.current = { id, offset: event.clientX - event.currentTarget.getBoundingClientRect().left };
}

// 倍速改变源时间映射，成功后重新定位；冲突保留原工程并显示原因。
function commitSpeed(project: ProjectContext, id: string, speed: number) {
  const clips = changeClipSpeed(project.state.clips, id, speed, project.fps, project.state.lockedTracks);
  if (!clips) { project.update({ notice: t("toolBox.editorUi.speedBlocked") }); return; }
  project.update({ clips, seekVersion: project.state.seekVersion + 1, currentTime: Math.min(project.state.currentTime, timelineDuration(clips)), notice: "" });
}

// 历史像工作台的有限照片册，只记确认后的工程结构，不记视频帧和每次播放进度。
// 统一补丁入口在确认时留一页，鼠标草稿、素材搜索和播放节拍不污染撤销栈。
// 快照引用沿用不可变工程对象；所有编辑模型必须返回新对象，不能回头修改旧页。
import type { LiveTimelineClip } from "./live-timeline-model";
import type { TrackId, TrackLimits } from "./timeline-track-model";

// 这里只定义现有会话数据，未引入工程保存格式或全局第二个store。
// selectedIds为批量选择，selectedId为现有单目标检查器的主选择。
// 书签在每张历史中记录一次，恢复时仍用递增版本关闭旧节目播放请求。
// notice属于界面反馈，不能作为某次剪辑已成功的事实字段。
// dragKind属于当前手势，不应在撤销之后复活一场已经结束的拖动。
// hidden与locked是不同文档事实：显隐影响节目，锁定影响编辑权限。
export interface TimelineProjectState {
  dragKind?: "V" | "A";
  tracks: TrackId[];
  limits: TrackLimits;
  currentTime: number;
  seekVersion: number;
  hiddenTracks: string[];
  lockedTracks: string[];
  clips: LiveTimelineClip[];
  selectedId: string | null;
  selectedIds: string[];
  viewed: boolean;
  notice: string;
}
// 每个会话持有自己的past/future；不从上一个路由实例继承历史或剪贴板。
// 上限100次确认命令，避免长编辑会话无限保存大型片段数组。
// 快照不复制视频文件，媒体资源仍由当前实际挂载节点独立管理。
export interface TimelineHistory { present: TimelineProjectState; past: TimelineProjectState[]; future: TimelineProjectState[]; }
export type HistoryAction = { patch: Partial<TimelineProjectState> } | { step: "undo" | "redo" };
const HISTORY_LIMIT = 100;

// 用内容变化判记录，重复提交同值或同一锁状态不能白占一页历史。
// 比较范围只有工程结构，播放currentTime、选择和提示更新因此不会清掉重做。
// 小型纯JSON数据可比较；函数、媒体DOM和封面不进入这个状态结构。
// 选择也随编辑快照保留，但单独改变选择本身不是一个可撤销编辑。
function documentChanged(before: TimelineProjectState, after: TimelineProjectState) {
  return ["clips", "tracks", "limits", "hiddenTracks", "lockedTracks"].some(key => {
    const field = key as "clips" | "tracks" | "limits" | "hiddenTracks" | "lockedTracks";
    return before[field] !== after[field] && JSON.stringify(before[field]) !== JSON.stringify(after[field]);
  });
}

// 旧入口只传selectedId时，把多选同步回单选，避免上一批选择残留导致误删。
// 显式selectedIds表示调用者正在做多选，不被单目标检查器反向覆盖。
// 删除或分割后清除已不存在的id，主选中若丢失则回落到有效集合末项。
// 片段数组变化但身份未变（如构图）应保留选区，不强行回第一段。
function mergeProject(state: TimelineProjectState, patch: Partial<TimelineProjectState>): TimelineProjectState {
  const next = { ...state, ...patch };
  if ("selectedId" in patch && !("selectedIds" in patch)) next.selectedIds = next.selectedId ? [next.selectedId] : [];
  next.selectedIds = next.selectedIds.filter(id => next.clips.some(clip => clip.id === id));
  if (!next.selectedIds.includes(next.selectedId ?? "")) next.selectedId = next.selectedIds.at(-1) ?? null;
  return next;
}

// 历史也服从当前锁：不能锁住一轨后用撤销或重做悄悄改其中的片段。
// 撤销“锁定”命令本身允许恢复锁状态，否则用户无法用撤销解锁刚才操作。
// 比较每个锁轨的内容而非整个数组，其他未锁轨的独立历史仍可恢复。
// 同轨顺序由工程数组决定，比较按该轨筛出的片段即可发现删除/变换/区间变化。
// 拒绝时保留past/future，用户解锁后仍可继续，不消费历史步骤。
function canRestore(current: TimelineProjectState, target: TimelineProjectState) {
  if (JSON.stringify(current.lockedTracks) !== JSON.stringify(target.lockedTracks)) return true;
  return current.lockedTracks.every(track => JSON.stringify(current.clips.filter(clip => clip.track === track)) === JSON.stringify(target.clips.filter(clip => clip.track === track)));
}

// 每次恢复递增当前版本而非照抄旧版本，避免旧媒体定位回执被错认成最新。
// currentTime夹到恢复工程末尾，删除尾段或恢复空工程都不会留下越界游标。
// 清手势类型与旧通知，源预览切换由宿主回调负责，不由reducer操作DOM。
// 重做栈只在新的结构编辑后清空；选择、搜索和正常播放不构成分叉。
// 恢复使用目标的片段和轨序，不能通过反向移动来近似撤销造成源区间误差。
function restoreHistory(history: TimelineHistory, step: "undo" | "redo"): TimelineHistory {
  const source = step === "undo" ? history.past : history.future, target = source.at(-1);
  if (!target || !canRestore(history.present, target)) return history;
  const duration = target.clips.reduce((end, clip) => Math.max(end, clip.end), 0);
  const present = { ...target, currentTime: Math.min(target.currentTime, duration), seekVersion: history.present.seekVersion + 1, dragKind: undefined, notice: "" };
  return step === "undo" ? { present, past: history.past.slice(0, -1), future: [...history.future, history.present] } : { present, past: [...history.past, history.present].slice(-HISTORY_LIMIT), future: history.future.slice(0, -1) };
}

// 所有旧命令仍发patch，这一层只为确认的变化加历史，不另写一套编辑业务。
// reducer取最新present合并补丁，快速连续快捷键不会读取落后一拍的React闭包。
// 不可变历史让复制、剪切、分割、字段重置和拖动统一撤销，不各自维护栈。
// 失败命令只改notice，不触发documentChanged，不会破坏用户现有重做分支。
// 纯预览草稿不经此入口，松手确认才记一次，避免一次手势需要撤销几十次。
export function timelineHistoryReducer(history: TimelineHistory, action: HistoryAction): TimelineHistory {
  if ("step" in action) return restoreHistory(history, action.step);
  const present = mergeProject(history.present, action.patch);
  return documentChanged(history.present, present) ? { present, past: [...history.past, history.present].slice(-HISTORY_LIMIT), future: [] } : { ...history, present };
}

// 按钮可用性与实际恢复共用权限判断，不能显示可撤销却按下无反应。
// 空历史直接不可用，静态样板则由未传回调保持原禁用契约。
export function canStepHistory(history: TimelineHistory, step: "undo" | "redo") {
  const target = (step === "undo" ? history.past : history.future).at(-1);
  return !!target && canRestore(history.present, target);
}

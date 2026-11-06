// 基础操作只改片段引用，不转码或写源文件；失败返回null，工程保持原状。
// 定格像在胶片中插入三秒静照，同轨后续片段顺延，其他轨的安排不动。
import type { LiveTimelineClip } from "./live-timeline-model";
import type { ClipCrop } from "./editor-timeline";
import { evaluateTransform, visualClipEdit } from "./clip-transform-model";
import { programSourceTime } from "./program-clock";
import { cloneTimelineClip, editTimelineSections } from "./timeline-edit-model";

export type BasicClipAction = "freeze" | "reverse" | "mirror" | "rotate";

// 操作入口重新核对锁与身份；已分离音轨没有画面，不能接受这四类编辑。
// 工具栏和右键共用此入口，因此菜单打开以后再锁轨也不能绕过保护。
// time是工程播放头，只供定格找帧；镜像和倒放不把它写成新的片段起点。
// 返回的新列表是一次确认结果，由宿主统一进入撤销历史，不在模型内维护栈。
// reverse只翻转读取方向，sourceIn仍表示源区间较小的一端。
// 再点倒放可以回到正向，源范围和占用工程的长度始终不变。
// 镜像也为开关；旋转则每次累加90度，已有角度动画必须整条平移。
export function basicClipEdit(clips: readonly LiveTimelineClip[], id: string, action: BasicClipAction, time: number, fps: number, locked: readonly string[], newId: () => string) {
  const clip = clips.find(item => item.id === id);
  if (!clip || clip.audioOnly || locked.includes(clip.track)) return null;
  if (action === "freeze") return insertFreeze(clips, clip, time, fps, newId);
  const next = action === "reverse" ? { ...clip, reversed: !clip.reversed } : visualClipEdit(clip, action);
  return next ? clips.map(item => item.id === id ? next : item) : null;
}

// 定格源帧由共同源映射取得，倒放片段与修剪片段不会错误回到文件开头。
// 插入前先拆开覆盖播放头的片段，前后内容都保留，静帧使用新的实体ID。
// 例如原段8–12秒，在9秒定格后是8–9视频、9–12静帧、12–15视频。
// 右段挪到12秒是工程位置变化，它仍从定格点的原始源内容继续播放。
// 同轨其他后续段一起顺延三秒，避免静帧挤进相邻片段造成重叠。
// 跨轨不顺延，因此这是单轨插入规则，并非全工程波纹编辑。
// 首帧处没有左视频段：原片段整体后移，静帧直接放在原起点。
// 接近尾部时取最后一个有效工程帧，不生成源文件结尾之外的空帧。
// 播放头不在选中区间内就拒绝，不能猜测用户想定格最近的哪一帧。
// 每个后续片段保持原长度，相互之间原有的间隙也一起平移而非压缩。
// 静帧从当前动画求出构图快照，不能继承继续变化的关键帧曲线。
// 镜像和四边裁剪由深复制保留，定格后的画面与按下按钮前一致。
// freezeTime保存源秒数，不复制视频字节，也不生成临时PNG文件。
// 静帧明确没有声音出口，不能让三秒定格意外继续播放原视频的音轨。
// ID由会话生成器提供；同一源的静帧和左右视频仍是三个可独立选择的主体。
function insertFreeze(clips: readonly LiveTimelineClip[], clip: LiveTimelineClip, time: number, fps: number, newId: () => string) {
  if (!Number.isFinite(time) || !Number.isFinite(fps) || fps <= 0 || time < clip.start || time >= clip.end) return null;
  const at = Math.max(clip.start, Math.min(clip.end - 1 / fps, Math.round(time * fps) / fps));
  const split = editTimelineSections(clips, [clip.id], "split", at, fps, [], newId) ?? [...clips];
  const shifted = split.map(item => item.track === clip.track && item.start >= at ? { ...item, start: item.start + 3, end: item.end + 3 } : item);
  const transform = clip.transform && evaluateTransform(clip.transform, clip.keyframes, Math.round((at - clip.start) * fps));
  const freeze = { ...cloneTimelineClip(clip, newId()), start: at, end: at + 3, freezeTime: programSourceTime(clip, at, clip.sourceDuration), transform, keyframes: undefined, audioDetached: true };
  return [...shifted, freeze];
}

// 四边裁剪范围按0–1存储，至少保留1%的有效画面，不能提交退化的空矩形。
// left=.1和right=.2意味着保留横向10%至80%，不是把宽度缩为20%。
// top/bottom独立约束高度；四个边同时验证后才替换，避免只提交半个框。
// 这些比例相对于完整适配画面，播放器缩放或换窗口不会改变裁剪内容。
// 裁剪不重算中心、比例和旋转，遮掉边缘以后构图坐标仍指向完整源盒。
// 保存一份新的crop对象，后续修改草稿不会回头修改已经确认的历史页。
// 错误结果为null，不能用空列表代替失败，否则会把已有时间线清掉。
export function updateClipCrop(clips: readonly LiveTimelineClip[], id: string, crop: ClipCrop, locked: readonly string[]) {
  const clip = clips.find(item => item.id === id);
  const numbers = [crop.left, crop.top, crop.right, crop.bottom];
  if (!clip || clip.audioOnly || locked.includes(clip.track) || numbers.some(value => !Number.isFinite(value) || value < 0 || value > .99) || crop.left + crop.right > .99 || crop.top + crop.bottom > .99) return null;
  return clips.map(item => item.id === id ? { ...item, crop: { ...crop } } : item);
}

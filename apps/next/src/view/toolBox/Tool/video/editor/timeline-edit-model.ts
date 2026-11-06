// 片段编辑只改工程引用：分割像剪开一张书签，不剪磁盘文件，也不挪动旁边的书签。
// 源入点使用源秒，工程起止使用工程秒；右半段必须补上被剪掉的源时间。
// 这些纯规则供工具栏、鼠标与快捷键共用，不维护第二份工程或媒体播放器。
import { hasTimelineOverlap, type LiveTimelineClip } from "./live-timeline-model";
import { evaluateTransform, type ClipKeyframes, type TransformKey } from "./clip-transform-model";
import { TRANSFORM_KEYS } from "./clip-transform-model";

// 工具状态只决定下一次点击的意图，不改变轨道层级或当前播放时间。
// 左右全选跨轨工作，但跳过锁轨；两次分割后的片段各有独立身份。
// 分割不隐式建立链接，之后点其中一段不能连带选中同源的其他片段。
export type TimelineTool = "select" | "razor" | "selectLeft" | "selectRight";
export type SectionEdit = "split" | "removeLeft" | "removeRight";

// 不可变复制必须包括嵌套构图，否则副本后续变换可能改到原片段。
// 素材身份仍保留，复制片段不会生成重复素材、视频文件或封面。
// 源区间、速度和分离音轨标志均保留，不把一次复制误当重新导入。
// 调用者传新id只用于新实体；剪下快照时可以保留旧id作来源记录。
export function cloneTimelineClip(clip: LiveTimelineClip, id = clip.id): LiveTimelineClip {
  const keyframes = clip.keyframes ? {
    x: clip.keyframes.x?.map(point => ({ ...point })), y: clip.keyframes.y?.map(point => ({ ...point })),
    scale: clip.keyframes.scale?.map(point => ({ ...point })), rotation: clip.keyframes.rotation?.map(point => ({ ...point })),
    opacity: clip.keyframes.opacity?.map(point => ({ ...point })),
  } : undefined;
  return { ...clip, id, crop: clip.crop ? { ...clip.crop } : undefined, transform: clip.transform ? { ...clip.transform } : undefined, keyframes };
}

// 多选列表与主选中分开：主选中服务现有检查器，多选集合服务批量命令。
// 普通点击仅选择一段，Ctrl/Meta点击切换单段，方向工具则按起点选一侧。
// 锁轨不进入工具选区，避免看到被选中但批量命令实际偷偷跳过的反馈。
// 方向判断包括点击对象本身，同一时刻开始的跨轨片段也会被选中。
// 这里不按assetId去重，同源片段是两个可独立操作的工程实体。
export function selectTimelineIds(clips: readonly LiveTimelineClip[], id: string, selected: readonly string[], tool: TimelineTool, toggle: boolean, locked: readonly string[]) {
  const target = clips.find(clip => clip.id === id);
  if (!target || locked.includes(target.track)) return [...selected];
  if (tool === "selectLeft" || tool === "selectRight") return clips.filter(clip => !locked.includes(clip.track) && (tool === "selectLeft" ? clip.start <= target.start : clip.start >= target.start)).map(clip => clip.id);
  return toggle ? selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id] : [id];
}

// 确认选区仍完整存在且可写，返回null表示整批拒绝，不能删一半才遇到锁。
// 不用“过滤掉锁定对象再继续”的做法，避免剪切后剪贴板与画面数量对不上。
// 空选区不是成功删除，不应新增历史或弹出完成通知。
// 此处只判编辑权限；复制属于读取，可以由调用方另行保留锁定源快照。
export function editableTimelineSelection(clips: readonly LiveTimelineClip[], ids: readonly string[], locked: readonly string[]) {
  const targets = clips.filter(clip => ids.includes(clip.id));
  return targets.length && targets.length === new Set(ids).size && targets.every(clip => !locked.includes(clip.track)) ? targets : null;
}

// 每段在原工程位置上剪，其他轨和片段的时间不会因删除左边而自动前移。
// split只接受内部帧边界；首尾点击不创建零长片段，也不重复生成相邻实体。
// 保留左段身份便于当前焦点继续访问，右段新建id并克隆构图。
// 右段源入点增加的是工程差乘原速度，不是直接赋工程播放头秒数。
// 图片和音频同样保留自身类型，音频不会因拆分突然长出画面变换。
// 项目帧格只对齐工程时间，不能把已有非整数源入点再次取整产生累积漂移。
function editSection(clip: LiveTimelineClip, action: SectionEdit, time: number, fps: number, id: () => string): LiveTimelineClip[] {
  if (action === "split") {
    if (time <= clip.start || time >= clip.end) return [clip];
    return splitClip(clip, time, fps, id);
  }
  if (action === "removeLeft") {
    if (time >= clip.end) return [];
    return time <= clip.start ? [clip] : [trimClipStart(clip, time, fps)];
  }
  if (time <= clip.start) return [];
  return time >= clip.end ? [clip] : [trimClipEnd(clip, time, fps)];
}

// 分割点先求出当帧画面值，左段封住动画，右段从同值继续走后面的关键帧。
// 两段各自拥有数组和数值对象，之后改一段不会牵连另一段。
function splitClip(clip: LiveTimelineClip, time: number, fps: number, id: () => string): LiveTimelineClip[] {
  const frame = Math.round((time - clip.start) * fps), values = clip.transform && evaluateTransform(clip.transform, clip.keyframes, frame);
  const [leftKeys, rightKeys] = splitKeyframes(clip.keyframes, frame, values);
  const right = cloneTimelineClip(clip, id());
  const leftSource = clip.reversed ? clip.sourceIn + (clip.end - time) * (clip.speed ?? 1) : clip.sourceIn;
  const rightSource = clip.reversed ? clip.sourceIn : clip.sourceIn + (time - clip.start) * (clip.speed ?? 1);
  return [{ ...clip, sourceIn: leftSource, end: time, keyframes: leftKeys }, { ...right, start: time, sourceIn: rightSource, transform: values ?? right.transform, keyframes: rightKeys }];
}

// 左段保留分割点之前的帧；右段把之后的帧改成从0开始计数。
function splitKeyframes(keys: ClipKeyframes | undefined, frame: number, values: LiveTimelineClip["transform"]): [ClipKeyframes | undefined, ClipKeyframes | undefined] {
  if (!keys || !values) return [keys, keys];
  const left: ClipKeyframes = {}, right: ClipKeyframes = {};
  for (const key of TRANSFORM_KEYS) sliceKeyframes(key, keys[key] ?? [], frame, values[key], left, right);
  return [hasKeyframes(left) ? left : undefined, hasKeyframes(right) ? right : undefined];
}

function sliceKeyframes(key: TransformKey, points: NonNullable<ClipKeyframes[TransformKey]>, frame: number, value: number, left: ClipKeyframes, right: ClipKeyframes) {
  const earlier = points.filter(point => point.frame < frame), exact = points.find(point => point.frame === frame), later = points.filter(point => point.frame > frame);
  left[key] = [...earlier, ...(exact ? [exact] : later.length ? [{ frame, value }] : [])];
  right[key] = [...(exact ? [{ frame: 0, value }] : []), ...later.map(point => ({ ...point, frame: point.frame - frame }))];
}

function hasKeyframes(keys: ClipKeyframes) { return TRANSFORM_KEYS.some(key => !!keys[key]?.length); }

// 从中间裁掉左边时，剩余片段以当前动画值作为新起点，后续标记平移到零点。
function trimClipStart(clip: LiveTimelineClip, time: number, fps: number): LiveTimelineClip {
  const frame = Math.round((time - clip.start) * fps), transform = clip.transform && evaluateTransform(clip.transform, clip.keyframes, frame);
  const sourceIn = clip.reversed ? clip.sourceIn : clip.sourceIn + (time - clip.start) * (clip.speed ?? 1);
  return { ...clip, start: time, sourceIn, transform: transform ?? clip.transform, keyframes: shiftedKeyframes(clip.keyframes, frame) };
}

// 从中间裁掉右边时只删掉不可见的关键帧，保留片段开始时的数值来源。
function trimClipEnd(clip: LiveTimelineClip, time: number, fps: number): LiveTimelineClip {
  const frame = Math.round((time - clip.start) * fps), keyframes: ClipKeyframes = {};
  const values = clip.transform && evaluateTransform(clip.transform, clip.keyframes, frame);
  for (const key of TRANSFORM_KEYS) {
    const points = clip.keyframes?.[key];
    if (points?.length) keyframes[key] = [...points.filter(point => point.frame < frame), { frame, value: values?.[key] ?? points.at(-1)!.value }];
  }
  const sourceIn = clip.reversed ? clip.sourceIn + (clip.end - time) * (clip.speed ?? 1) : clip.sourceIn;
  return { ...clip, sourceIn, end: time, keyframes: hasKeyframes(keyframes) ? keyframes : undefined };
}

function shiftedKeyframes(keys: ClipKeyframes | undefined, frame: number): ClipKeyframes | undefined {
  if (!keys) return undefined;
  const shifted: ClipKeyframes = {};
  for (const key of TRANSFORM_KEYS) shifted[key] = keys[key]?.filter(point => point.frame >= frame).map(point => ({ ...point, frame: point.frame - frame }));
  return hasKeyframes(shifted) ? shifted : undefined;
}

// 批量剪切只处理明确选中的主体，不能顺便删除其他轨道在播放头一侧的素材。
// 同一批最多在每个选中实体上分一次，生成的id由会话负责，不由纯模型猜测。
// 分割及缩短都只移除原区间内部内容，因此不会制造新的同轨重叠。
// 非法帧率、非有限时间及锁定目标在生成id之前拒绝，原数组保持原样。
// 没有变化返回null，调用者不写历史、不改变选择，也不发假成功。
// 精确终点遵守半开区间：在前段end分割不会把它再次拆成空段。
export function editTimelineSections(clips: readonly LiveTimelineClip[], ids: readonly string[], action: SectionEdit, time: number, fps: number, locked: readonly string[], id: () => string) {
  if (!Number.isFinite(time) || !Number.isFinite(fps) || fps <= 0 || !editableTimelineSelection(clips, ids, locked)) return null;
  const frame = Math.round(time * fps) / fps;
  const result = clips.flatMap(clip => ids.includes(clip.id) ? editSection(clip, action, frame, fps, id) : [clip]);
  return result.length === clips.length && result.every((clip, index) => clip === clips[index]) ? null : result;
}

// 剪贴板保存片段快照，不保存DOM、播放器或路径字节；粘贴是新工程实体。
// 多选相对位置保持：最早起点对齐播放头，各轨道身份与相互间隙不变。
// 每次粘贴生成不同id，嵌套构图再次复制，重复粘贴不会共享可变属性。
// 轨道不存在或锁定时整批拒绝，不暗中创建超限轨或往其他类型轨道迁移。
// 先构造全部候选再共同检查碰撞，不能先插第一段后才发现第二段撞车。
// 仍使用原hasTimelineOverlap；粘贴精确落在播放头，不替用户寻找另一空隙。
// 旧素材引用必须仍在素材库，不能仅凭快照名称重建一个无源的假素材。
// 复制图片/音频支持工程数据，但本轮不授权新的文件导入能力。
export function pasteTimelineClips(clips: readonly LiveTimelineClip[], copied: readonly LiveTimelineClip[], time: number, fps: number, locked: readonly string[], tracks: readonly string[], assets: readonly string[], id: () => string) {
  if (!copied.length || !Number.isFinite(time) || time < 0 || !Number.isFinite(fps) || fps <= 0) return null;
  if (copied.some(clip => locked.includes(clip.track) || !tracks.includes(clip.track) || !assets.includes(clip.assetId))) return null;
  const offset = Math.round(time * fps) / fps - Math.min(...copied.map(clip => clip.start));
  const added = copied.map(clip => ({ ...cloneTimelineClip(clip, id()), start: Math.round((clip.start + offset) * fps) / fps, end: Math.round((clip.end + offset) * fps) / fps }));
  const all = [...clips, ...added];
  return added.some(clip => hasTimelineOverlap(all, clip, fps)) ? null : { clips: all, ids: added.map(clip => clip.id) };
}

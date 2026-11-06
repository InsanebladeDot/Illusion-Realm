"use client";

// 命令层把键盘、工具栏和片段点击接到同一工程，剪贴板仅保存本会话片段引用快照。
// 像剪贴纸条：Ctrl+C记下形状，Ctrl+X还从工作台拿走，Ctrl+V才放出新的一份。
// 不访问系统文件剪贴板，不移动源文件，也不向主进程新增任意文件能力。
import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { t } from "@/i18n";
import { timelineDuration, type LiveTimelineClip } from "./live-timeline-model";
import { cloneTimelineClip, editableTimelineSelection, editTimelineSections, pasteTimelineClips, selectTimelineIds, type SectionEdit, type TimelineTool } from "./timeline-edit-model";
import type { ProjectContext } from "./use-live-timeline";

// 鼠标点击分割使用lane真实坐标，和原标尺/片段百分比共享同一个时间范围。
// 横向滚动已反映在getBoundingClientRect.left，不能再额外加scrollLeft。
// 获取不到轨道或宽度为零时拒绝点击，不能用零秒代替错误的测量。
// 最终帧格与源映射交给纯编辑模型，界面不重复计算右段sourceIn。
function clickedTime(event: MouseEvent<HTMLButtonElement>, range: number) {
  const lane = event.currentTarget.closest<HTMLElement>("[data-editor-track-lane]");
  const box = lane?.getBoundingClientRect();
  return box?.width ? (event.clientX - box.left) / box.width * range : null;
}

// 任一选中轨被锁即拒绝整批，不能给剪切留一个未完成的半选区。
// 失败提示就近放时间线，已有素材、片段与播放书签不被清空。
// 空选择也不生成成功提示，调用者用相同结果决定是否更新剪贴板。
function removeSelected(project: ProjectContext, ids: readonly string[]) {
  if (!editableTimelineSelection(project.state.clips, ids, project.state.lockedTracks)) return false;
  const clips = project.state.clips.filter(clip => !ids.includes(clip.id));
  project.update({ clips, selectedId: null, selectedIds: [], currentTime: Math.min(project.state.currentTime, timelineDuration(clips)), seekVersion: project.state.seekVersion + 1, notice: t("toolBox.editorUi.editDone") });
  project.onSelectClip();
  return true;
}

// 分割选中多段时每一段仍有独立实体，结果只选择原目标及新增的右半段。
// 缩短后被完全移除的目标不再留在选区；其余未选片段不因源相同而加入。
// 命令会递增定位版本，真实节目按新的源区间解码，不复用旧帧成功状态。
// 不在此调用播放器play；编辑完成后保持显式定位的暂停语义。
// 每次只提交一个patch，因此一批分割在历史中也是一个可撤销步骤。
function sectionSelected(project: ProjectContext, ids: readonly string[], action: SectionEdit, time = project.state.currentTime) {
  const clips = editTimelineSections(project.state.clips, ids, action, time, project.fps, project.state.lockedTracks, () => crypto.randomUUID());
  if (!clips) { project.update({ notice: t("toolBox.editorUi.sectionBlocked") }); return; }
  const original = new Set(project.state.clips.map(clip => clip.id));
  const selectedIds = clips.filter(clip => ids.includes(clip.id) || !original.has(clip.id)).map(clip => clip.id);
  project.update({ clips, selectedIds, selectedId: selectedIds.at(-1) ?? null, currentTime: Math.min(time, timelineDuration(clips)), seekVersion: project.state.seekVersion + 1, notice: t("toolBox.editorUi.editDone") });
  project.onSelectClip();
}

// 普通输入框保留原生文字删除、复制和撤销，不把编辑提示词误当剪辑命令。
// 数字修剪slider及公共菜单有自己的键盘逻辑，也不从这里抢快捷键。
// 已被子控件消费的Escape/Delete不再执行，防止一个事件删除两次。
// 宿主以React冒泡接收键盘，不在document安装全局监听，隐藏/卸载页面不响应。
// 没有使用keyCode，布局无关的Ctrl组合先转小写，兼容大写字母键帽。
function ignoresEditingKey(event: KeyboardEvent<HTMLElement>) {
  return event.defaultPrevented || event.altKey || event.nativeEvent.isComposing || event.target instanceof Element && !!event.target.closest('input,textarea,select,[contenteditable="true"],[role="slider"],[role="menu"],[data-context-menu]');
}

// controls只传有限命令给公共时间线，不把任意project.update交给按钮。
// canDelete、canSection随真实选择与锁更新，未接通样板不获得这些回调。
// 历史操作先取消拖动和边缘草稿，不能把撤销后的工程被迟到松手再覆盖。
// 剪贴板属于Hook实例，返回页面新实例为空，不能串到另一工程。
// copies只存工程字段，没有隐藏播放器、临时URL或跨进程订阅需要释放。
// tool是UI意图，不进入历史，Ctrl+Z撤销剪辑而不是切换鼠标形状。
export function useTimelineEditing(project: ProjectContext, cancel: () => void) {
  const [tool, setTool] = useState<TimelineTool>("select");
  const copied = useRef<LiveTimelineClip[]>([]);
  const ids = project.state.selectedIds;
  const writable = !!editableTimelineSelection(project.state.clips, ids, project.state.lockedTracks);
  const history = (step: "undo" | "redo") => { cancel(); project.step(step); project.onSelectClip(); };
  const section = (action: SectionEdit) => { cancel(); sectionSelected(project, ids, action); };
  const copy = (cut: boolean, selected = ids) => {
    const clips = project.state.clips.filter(clip => selected.includes(clip.id));
    if (!clips.length || cut && !removeSelected(project, selected)) return;
    copied.current = clips.map(clip => cloneTimelineClip(clip));
    if (!cut) project.update({ notice: t("toolBox.editorUi.clipsCopied", { count: clips.length }) });
  };
  const paste = () => pasteSelected(project, copied.current);
  const controls = { tool, setTool, undo: () => history("undo"), redo: () => history("redo"), canUndo: project.canUndo, canRedo: project.canRedo, canDelete: writable, canSection: writable, section, remove: () => { cancel(); removeSelected(project, ids); } };
  const click = (event: MouseEvent<HTMLButtonElement>, id: string, range: number) => clickWithTool(project, event, id, tool, range);
  const key = (event: KeyboardEvent<HTMLElement>) => handleEditingKey(event, { project, tool, setTool, history, copy, paste, cancel });
  return { controls, click, key };
}

// 粘贴时才按当前播放头/锁/轨道校验，不能相信复制当时尚可写的旧权限。
// 碰撞或失效源只提示拒绝，不消费剪贴板，也不把已有片段迁走腾位置。
// 成功选中新副本；每次重复粘贴仍生成新id，支持之后单独移动和删除。
// 当前范围为同工程粘贴，跨页面剪贴板和磁盘文件粘贴不属于这一命令。
// 原工程内容保持只读引用，复制源即使已删除仍可在该会话从快照恢复为新片段。
function pasteSelected(project: ProjectContext, copied: readonly LiveTimelineClip[]) {
  const result = pasteTimelineClips(project.state.clips, copied, project.state.currentTime, project.fps, project.state.lockedTracks, project.state.tracks, project.assets.map(asset => asset.id), () => crypto.randomUUID());
  if (!result) { project.update({ notice: t("toolBox.editorUi.pasteBlocked") }); return; }
  project.update({ clips: result.clips, selectedIds: result.ids, selectedId: result.ids.at(-1) ?? null, seekVersion: project.state.seekVersion + 1, notice: t("toolBox.editorUi.editDone") });
  project.onSelectClip();
}

// 分割刀只处理鼠标点中的独立主体，不自动把同源其他段一起剪开。
// 普通选择保持现有点击定位到片段起点的行为，素材高亮仍归素材会话。
// Ctrl切换后主选择取集合末项，取消最后一个则检查器回无选择。
// 锁轨按钮通常已禁用，但最终入口再查一次防止合成事件绕过权限。
// 只改选择不重排clips/tracks，选中下层不会浮到最上层画面。
function clickWithTool(project: ProjectContext, event: MouseEvent<HTMLButtonElement>, id: string, tool: TimelineTool, range: number) {
  const clip = project.state.clips.find(item => item.id === id);
  if (!clip || project.state.lockedTracks.includes(clip.track)) return;
  if (tool === "razor") {
    const time = clickedTime(event, range);
    if (time !== null) sectionSelected(project, [id], "split", time);
    return;
  }
  const selectedIds = selectTimelineIds(project.state.clips, id, project.state.selectedIds, tool, event.ctrlKey || event.metaKey, project.state.lockedTracks);
  project.update({ selectedIds, selectedId: selectedIds.includes(id) ? id : selectedIds.at(-1) ?? null, currentTime: clip.start, seekVersion: project.state.seekVersion + 1, viewed: true });
  project.onSelectClip();
}

// 键盘动作只消费已识别的组合，浏览器和系统的其他快捷键仍正常工作。
// Delete在素材/预览拥有焦点时仍删时间线选区，不会删除原始文件。
// 原片段局部Delete测试可指定一个未选目标，只有此时临时以焦点对象作为目标。
// Ctrl+Z和Ctrl+Shift+Z分别撤销/重做，Ctrl+Y同样重做。
// A/B/Shift+A/Shift+D与工具菜单提示一致；Escape退出工具并取消当前拖动。
// 复制读取允许锁源，剪切/删除/粘贴仍通过各自共同写入校验。
interface KeyCommands { project: ProjectContext; tool: TimelineTool; setTool: (tool: TimelineTool) => void; history: (step: "undo" | "redo") => void; copy: (cut: boolean, ids?: string[]) => void; paste: () => void; cancel: () => void; }
function handleEditingKey(event: KeyboardEvent<HTMLElement>, commands: KeyCommands) {
  if (ignoresEditingKey(event)) return;
  const key = event.key.toLowerCase(), modifier = event.ctrlKey || event.metaKey;
  if (modifier && ["z", "y", "c", "x", "v"].includes(key)) {
    event.preventDefault(); commands.cancel();
    if (key === "z" || key === "y") commands.history(key === "y" || event.shiftKey ? "redo" : "undo");
    else if (key === "v") commands.paste();
    else commands.copy(key === "x");
  } else if (!modifier && key === "delete") {
    event.preventDefault(); commands.cancel();
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-editor-clip]")?.dataset.editorClip : undefined;
    removeSelected(commands.project, target && !commands.project.state.selectedIds.includes(target) ? [target] : commands.project.state.selectedIds);
  } else if (!modifier && ["a", "b", "d", "escape"].includes(key)) {
    if (key === "d" && !event.shiftKey) return;
    event.preventDefault(); commands.cancel();
    commands.setTool(key === "b" ? "razor" : event.shiftKey && key === "a" ? "selectLeft" : event.shiftKey && key === "d" ? "selectRight" : "select");
  }
}

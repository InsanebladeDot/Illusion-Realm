"use client";

// 时间线工具菜单复用创建页公共菜单，工具和一次性编辑命令各自保留真实意图。
// 工具只改变下一次片段点击，分割/左右删除按钮则立即作用于当前书签和选区。
// 未接业务的静态样板不传editing，继续使用原禁用状态，不能伪装成功。
import { useRef, useState } from "react";
import { MousePointer2, Scissors, ArrowLeftToLine, ArrowRightToLine, Undo2, Redo2, Trash2, ChevronDown, Columns2 } from "lucide-react";
import { ContextMenuShell } from "@/components/context-menu-shell";
import { ContextMenuItem } from "@/components/context-menu-item";
import { useTranslation } from "@/i18n";
import { EditorAction } from "./editor-controls";
import type { TimelineInteraction } from "./use-live-timeline";
import styles from "./editor.module.css";

// 元数据只描述图标、快捷键与文案，工程选择算法仍归共同编辑命令。
// 菜单项保留“选择/分割/向左全选/向右全选”，不把方向选择误作立即删除。
// 工具图标和真正鼠标形状由同一个tool状态驱动，不保存第二份“高亮工具”。
const TOOLS = [
  { id: "select", icon: MousePointer2, label: "select", key: "A" },
  { id: "razor", icon: Columns2, label: "split", key: "B" },
  { id: "selectLeft", icon: ArrowLeftToLine, label: "selectLeft", key: "Shift+A" },
  { id: "selectRight", icon: ArrowRightToLine, label: "selectRight", key: "Shift+D" },
] as const;

// 锚点取按钮当下矩形，不能用轨道坐标定位一个body Portal菜单。
// 菜单关闭只在源按钮还连接时恢复焦点，退出路由不操作失效节点。
// 公共外壳负责屏幕四边、外部点击、Escape与滚动关闭，不复制生命周期监听。
// 行尾快捷键是说明文本，不生成额外按钮或Tab停点。
// 方向键在菜单内部移动焦点；Enter/Space走原生button选择真实工具。
// 按钮禁用来源于canUndo/canRedo与可写选区，锁轨拒绝不是只改颜色。
export function TimelineEditTools({ editing }: { editing?: TimelineInteraction["editing"] }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement>(null), [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const selected = TOOLS.find(tool => tool.id === editing?.tool) ?? TOOLS[0];
  const close = () => { setAnchor(null); if (ref.current?.isConnected) ref.current.focus({ preventScroll: true }); };
  const open = () => { const box = ref.current?.getBoundingClientRect(); if (box) setAnchor({ x: box.left, y: box.bottom + 4 }); };
  const reason = !editing?.canSection ? t("toolBox.editorUi.selectEditableClip") : undefined;
  return <div className={styles.editTools} data-timeline-edit-tools>
    {/* 工具选择：一枚图标加小箭头，弹层行复用全站公共菜单视觉。 */}
    <EditorAction appearance="plain" buttonRef={ref} icon={selected.icon} label={t("toolBox.editorUi.editTools")} compact expanded={!!anchor} onClick={editing ? open : undefined} /><ChevronDown size={10} aria-hidden="true" />
    <i className={styles.toolDivider} />
    <EditorAction appearance="plain" icon={Undo2} label={t("toolBox.editorUi.undo")} compact onClick={editing?.undo} disabledReason={editing && !editing.canUndo ? t("toolBox.editorUi.noUndo") : undefined} />
    <EditorAction appearance="plain" icon={Redo2} label={t("toolBox.editorUi.redo")} compact onClick={editing?.redo} disabledReason={editing && !editing.canRedo ? t("toolBox.editorUi.noRedo") : undefined} />
    <i className={styles.toolDivider} />
    <EditorAction appearance="plain" icon={Scissors} label={t("toolBox.editorUi.split")} compact disabledReason={reason} onClick={editing ? () => editing.section("split") : undefined} />
    <EditorAction appearance="plain" icon={ArrowLeftToLine} label={t("toolBox.editorUi.removeLeft")} compact disabledReason={reason} onClick={editing ? () => editing.section("removeLeft") : undefined} />
    <EditorAction appearance="plain" icon={ArrowRightToLine} label={t("toolBox.editorUi.removeRight")} compact disabledReason={reason} onClick={editing ? () => editing.section("removeRight") : undefined} />
    <EditorAction appearance="plain" icon={Trash2} label={t("common.delete")} compact disabledReason={!editing?.canDelete ? t("toolBox.editorUi.selectEditableClip") : undefined} onClick={editing?.remove} />
    {anchor && editing && <ContextMenuShell x={anchor.x} y={anchor.y} label={t("toolBox.editorUi.editTools")} onClose={close}><div data-timeline-tool-menu onKeyDown={moveToolFocus}>{TOOLS.map(tool => <ContextMenuItem key={tool.id} icon={tool.icon} label={t(`toolBox.editorUi.${tool.label}`)} aria-pressed={editing.tool === tool.id} onClick={() => { editing.setTool(tool.id); close(); }}><small>{tool.key}</small></ContextMenuItem>)}</div></ContextMenuShell>}
  </div>;
}

// 公共菜单已有Escape关闭，方向键只在当前列表内部循环，不抢其他菜单焦点。
// 取真实可用按钮列表，今后某工具被禁用也不会把焦点送到不可操作项。
// Home/End提供首尾替代，焦点移动不提前选择工具或执行工程编辑。
function moveToolFocus(event: React.KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
  items[next]?.focus({ preventScroll: true });
}

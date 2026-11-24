// 便签外观复用现有级联菜单和 StickyNote 参数；这里只生成菜单，不另存作品状态。
import { Paintbrush, Palette } from "lucide-react";
import type { CascadeMenuItem } from "@/components/cascade-menu";
import { t } from "@/i18n";
import type { CanvasData, CanvasNode } from "./canvas-model";

type Appearance = NonNullable<CanvasData["noteAppearance"]>;
const DEFAULT_APPEARANCE: Appearance = { attach: "none", color: "yellow" };
const ATTACHMENTS = [
  { value: "none", label: "canvas.notePlain" },
  { value: "tape", label: "canvas.noteTape" },
  { value: "pin", label: "canvas.notePin" },
] as const;
const COLORS = [
  { value: "yellow", label: "canvas.noteYellow" },
  { value: "pink", label: "canvas.notePink" },
  { value: "blue", label: "canvas.noteBlue" },
  { value: "green", label: "canvas.noteGreen" },
  { value: "orange", label: "canvas.noteOrange" },
] as const;

/** 多选只改便签，每次替换配置对象，避免复制卡片与历史快照互相串值。 */
export function canvasNoteMenu(nodes: CanvasNode[], update: (id: string, patch: Partial<CanvasData>) => void): CascadeMenuItem[] {
  const notes = nodes.filter(node => node.selected && node.data.kind === "note");
  if (!notes.length) return [];
  // 像换纸时保留原图钉，只修改当前维度；混合选择不显示虚假的统一勾选。
  const apply = (patch: Partial<Appearance>) => {
    notes.forEach(node => update(node.id, { noteAppearance: { ...(node.data.noteAppearance ?? DEFAULT_APPEARANCE), ...patch } }));
  };
  return [
    { id: "note-style", label: t("canvas.noteStyle"), icon: Paintbrush, children: ATTACHMENTS.map(({ value, label }) => ({
      id: `note-attach-${value}`, label: t(label), selected: notes.every(node => (node.data.noteAppearance?.attach ?? "none") === value), action: () => apply({ attach: value }),
    })) },
    { id: "note-color", label: t("canvas.noteColor"), icon: Palette, children: COLORS.map(({ value, label }) => ({
      id: `note-color-${value}`, label: t(label), selected: notes.every(node => (node.data.noteAppearance?.color ?? "yellow") === value), action: () => apply({ color: value }),
    })) },
  ];
}

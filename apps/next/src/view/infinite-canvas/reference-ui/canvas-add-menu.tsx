"use client";

/** 节点分类与批量导入共用公共级联菜单，只注入类型和来源回调。 */
import { useRef } from "react";
import { Type, Image, Video, AudioLines, MonitorPlay, MessageCircle, Layers, Expand, Globe, Box, Upload, Folder, Library, RectangleHorizontal, ClipboardPaste } from "lucide-react";
import { CascadeMenu, type CascadeMenuItem } from "@/components/cascade-menu";
import { useTranslation } from "@/i18n";
import type { CanvasAddKind } from "../canvas-model";

export type CanvasBatchSource = "library" | "local" | "nodes";
export interface CanvasAddMenuProps {
  onSelect: (kind: CanvasAddKind) => void; onClose: () => void; onImport?: () => void;
  onBatchImport?: (kind: "image" | "video", source: CanvasBatchSource) => void;
  onPaste?: () => void;
}

export function CanvasAddMenu({ onSelect, onClose, onImport, onBatchImport, onPaste }: CanvasAddMenuProps) {
  const { t } = useTranslation(), anchor = useRef<HTMLDivElement>(null);
  const node = (kind: CanvasAddKind, label: string, icon: CascadeMenuItem["icon"]): CascadeMenuItem => ({ id: kind, label, icon, attributes: { "data-node-kind": kind }, action: () => onSelect(kind) });
  const batch = (kind: "image" | "video"): CascadeMenuItem => ({ id: `batch-${kind}`, label: t(kind === "image" ? "canvas.batchImage" : "canvas.batchVideo"), icon: kind === "image" ? Image : Video, children: [
    { id: `batch-${kind}-library`, label: t("canvas.batchFromLibrary"), icon: Library, action: () => onBatchImport?.(kind, "library") },
    { id: `batch-${kind}-local`, label: t("canvas.batchFromLocal"), icon: Upload, action: () => onBatchImport?.(kind, "local") },
    { id: `batch-${kind}-nodes`, label: t("canvas.batchFromNodes"), icon: Layers, action: () => onBatchImport?.(kind, "nodes") },
  ] });
  const items: CascadeMenuItem[] = [
    { id: "text", label: t("canvas.text"), icon: Type, attributes: { "data-canvas-text-category": true }, children: [node("text", t("canvas.text"), Type), node("note", t("canvas.note"), MessageCircle)] },
    { id: "image", label: t("canvas.imageTools"), icon: Image, attributes: { "data-canvas-image-category": true }, children: [node("image", t("canvas.image"), Image), node("compare", t("canvas.compareImage"), RectangleHorizontal)] },
    node("video", t("canvas.video"), Video), node("audio", t("canvas.audio"), AudioLines), node("composition", t("canvas.composition"), MonitorPlay),
    node("scene", t("canvas.director"), Layers), node("upscale", t("canvas.upscale"), Expand),
    { id: "world", label: t("canvas.world"), icon: Globe, disabledReason: t("canvas.unavailable") }, batch("video"), batch("image"),
    { id: "layer", label: t("canvas.layerEdit"), icon: Layers, disabledReason: t("canvas.unavailable") },
    { id: "import", label: t("canvas.importMedia"), icon: Folder, attributes: { "data-canvas-import": true }, action: onImport },
    { id: "blender", label: t("canvas.blender"), icon: Box, disabledReason: t("canvas.unavailable") },
    ...(onPaste ? [{ id: "paste", label: t("canvas.paste"), icon: ClipboardPaste, action: onPaste }] : []),
  ];
  return <><div ref={anchor} /><CascadeMenu anchor={anchor} items={items} label={t("canvas.add")} heading={t("canvas.add")} backLabel={t("canvas.close")} appearance="canvas" equalHeight placement="pointer" onClose={onClose} attributes={{ "data-canvas-menu": true }} /></>;
}

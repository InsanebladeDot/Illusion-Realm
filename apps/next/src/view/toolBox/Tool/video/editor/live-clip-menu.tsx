"use client";

// 时间线右键复用创建页翻译功能的同一套级联列，不再在主菜单内挤入五行。
// 像操作单旁边打开一张附件：父项仍在原位，子项在侧面独立展开。
// 工程命令和权限留在会话层，公共菜单只接收当前片段的能力与回调。
import { useRef } from "react";
import { AudioLines, Copy, Trash2, Wrench, FlipHorizontal2, RotateCw, Snowflake, Rewind, Crop } from "lucide-react";
import { CascadeMenu, type CascadeMenuItem } from "@/components/cascade-menu";
import { useTranslation } from "@/i18n";
import type { EditorMediaAsset } from "./editor-panels";
import type { LiveTimelineClip, TimelineEdit } from "./live-timeline-model";
import type { BasicClipAction } from "./clip-basic-edit-model";

// 锚点坐标是client像素，trigger只用于会话关闭时恢复焦点，不写入工程。
// 同源的两个片段各有独立id，菜单不能凭文件名猜目标。
export interface LiveClipMenuAnchor { id: string; x: number; y: number; trigger: HTMLButtonElement; }
// 片段和素材只读传入，菜单不能更改素材元数据来伪造音轨存在。
// clip不存在就不渲染，过期菜单不会回落操作工程中的第一个片段。
// onAction只接受有限动作，不能从显示文字反推要运行哪个方法。
// onClose由拥有锚点的会话提供，不触发导航或清空其他页面实例。
interface LiveClipMenuProps {
  anchor: LiveClipMenuAnchor; clip?: LiveTimelineClip; asset?: EditorMediaAsset;
  onClose: () => void; onAction: (action: TimelineEdit) => void;
  onBasic?: (action: BasicClipAction) => void; onCrop?: () => void;
}

// 音轨能力来自探测结果，不按扩展名猜测；分离仍须通过会话碰撞与锁定校验。
// 父项仅展开，不执行工程修改，也不产生撤销记录或虚假的完成通知。
// 固定点锚只负责定位，不进入Tab顺序；焦点进入和方向键导航由共用菜单处理。
// 关闭回调继续归会话，删除后原片段不存在时不会强行聚焦失效按钮。
export function LiveClipMenu({ anchor, clip, asset, onClose, onAction, onBasic, onCrop }: LiveClipMenuProps) {
  const { t } = useTranslation(), point = useRef<HTMLDivElement>(null);
  if (!clip) return null;
  const visualReason = clip.audioOnly ? t("toolBox.editorUi.visualOnly") : undefined;
  const reason = clip.audioOnly ? t("toolBox.editorUi.alreadyAudio") : clip.audioDetached ? t("toolBox.editorUi.alreadyDetached") : !asset?.metadata?.hasAudio ? t("toolBox.editorUi.noAudioTrack") : undefined;
  const tools: CascadeMenuItem[] = [
    { id: "freeze", icon: Snowflake, label: t("toolBox.editorUi.freezeFrame"), disabledReason: visualReason ?? (!onBasic ? t("toolBox.editorUi.visualOnly") : undefined), action: () => onBasic?.("freeze") },
    { id: "reverse", icon: Rewind, label: t("toolBox.editorUi.reverse"), disabledReason: visualReason ?? (!onBasic ? t("toolBox.editorUi.visualOnly") : undefined), action: () => onBasic?.("reverse") },
    { id: "mirror", icon: FlipHorizontal2, label: t("toolBox.editorUi.mirror"), disabledReason: visualReason, action: () => onBasic ? onBasic("mirror") : onAction("mirror") },
    { id: "rotate", icon: RotateCw, label: t("toolBox.editorUi.rotate90"), disabledReason: visualReason, action: () => onBasic ? onBasic("rotate") : onAction("rotate") },
    { id: "crop", icon: Crop, label: t("toolBox.editorUi.crop"), disabledReason: visualReason ?? (!onCrop ? t("toolBox.editorUi.visualOnly") : undefined), action: onCrop },
  ];
  const items: CascadeMenuItem[] = [
    { id: "detach", icon: AudioLines, label: t("toolBox.editorUi.detachAudio"), disabledReason: reason, action: () => onAction("detach") },
    { id: "duplicate", icon: Copy, label: t("toolBox.editorUi.duplicateAtEnd"), action: () => onAction("duplicate") },
    { id: "basic", icon: Wrench, label: t("toolBox.editorUi.basicEdit"), separator: true, children: tools },
    { id: "delete", icon: Trash2, label: t("common.delete"), destructive: true, separator: true, action: () => onAction("delete") },
  ];
  return <>
    {/* 右键锚点：不占排版空间，侧向展开与创建页共用定位和样式。 */}
    <div ref={point} aria-hidden style={{ position: "fixed", left: anchor.x, top: anchor.y, width: 0, height: 0, pointerEvents: "none" }} />
    <CascadeMenu anchor={point} placement="pointer" items={items} label={t("toolBox.editorUi.clipActions")} backLabel={t("create.promptAssistant.back")} caption={asset?.name} onClose={onClose} attributes={{ "data-live-clip-menu": true }} />
  </>;
}

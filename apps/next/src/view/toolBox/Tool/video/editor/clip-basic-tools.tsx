"use client";

// 五个按钮沿用EditorAction的细框和触摸反馈，执行逻辑由正式工程注入。
// 样板不给动作就保持禁用，不能把播放器暂停冒充插入定格。
import { Snowflake, Rewind, FlipHorizontal2, RotateCw, Crop } from "lucide-react";
import { useTranslation } from "@/i18n";
import { EditorAction } from "./editor-controls";
import type { BasicClipAction } from "./clip-basic-edit-model";
import styles from "./editor.module.css";

export function ClipBasicTools({ enabled, onAction, onCrop }: { enabled: boolean; onAction: (action: BasicClipAction) => void; onCrop: () => void }) {
  const { t } = useTranslation(), reason = enabled ? undefined : t("toolBox.editorUi.selectEditableClip");
  return <div data-clip-basic-tools className={styles.editTools}>
    <EditorAction appearance="plain" icon={Snowflake} label={t("toolBox.editorUi.freezeFrame")} compact disabledReason={reason} onClick={() => onAction("freeze")} />
    <EditorAction appearance="plain" icon={Rewind} label={t("toolBox.editorUi.reverse")} compact disabledReason={reason} onClick={() => onAction("reverse")} />
    <EditorAction appearance="plain" icon={FlipHorizontal2} label={t("toolBox.editorUi.mirror")} compact disabledReason={reason} onClick={() => onAction("mirror")} />
    <EditorAction appearance="plain" icon={RotateCw} label={t("toolBox.editorUi.rotate90")} compact disabledReason={reason} onClick={() => onAction("rotate")} />
    <EditorAction appearance="plain" icon={Crop} label={t("toolBox.editorUi.crop")} compact disabledReason={reason} onClick={onCrop} />
  </div>;
}

"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_NEGATIVE_PRESET_ID,
  NEGATIVE_PRESET_DESCRIPTION,
} from "@/data/negativePresetPrompts";
import {
  getAllNegativePresets,
  useNegativePresetStore,
} from "@/stores/useNegativePresetStore";
import { useTranslation, type MessageKey } from "@/i18n";
import { PresetDialogShell, type PresetFieldDef } from "@/components/PresetDialogShell";

type NegativePromptPresetDialogProps = {
  open: boolean;
  selectedPresetId: string;
  onOpenChange: (open: boolean) => void;
  /** 保存：把选中预设的反向提示词交给调用方填入输入框 */
  onApply: (negative: string, presetId: string) => void;
};

/**
 * 模块作用域拿不到 hook：字段文案在这里存**词条 key**，组件内渲染时再 `t()` 取文案
 * （与 `data/navigation.ts` 的 `LocalizedNavItem` 同一套路）。
 */
type LocalizedPresetFieldDef = Omit<PresetFieldDef, "label" | "hint"> & {
  label: MessageKey;
  hint: MessageKey;
};

const NEGATIVE_FIELDS: LocalizedPresetFieldDef[] = [
  {
    key: "negative",
    label: "create.negativePromptPresetDialog.fieldLabel",
    placeholder: "worst quality, low quality, bad anatomy, ...",
    hint: "create.negativePromptPresetDialog.fieldHint",
    tone: "negative",
  },
];

/**
 * 反向提示词预设弹框：与「预设提示词」共用 PresetDialogShell，
 * 自定义预设写入用户数据文件（negativePresets 段）长期保存。
 */
export function NegativePromptPresetDialog({
  open,
  selectedPresetId,
  onOpenChange,
  onApply,
}: NegativePromptPresetDialogProps) {
  const { t } = useTranslation();
  const customPresets = useNegativePresetStore((state) => state.customPresets);
  const addCustomPreset = useNegativePresetStore((state) => state.addCustomPreset);
  const removeCustomPreset = useNegativePresetStore((state) => state.removeCustomPreset);
  const [draftPresetId, setDraftPresetId] = useState(
    selectedPresetId || DEFAULT_NEGATIVE_PRESET_ID
  );

  /** 字段定义存的是 key，渲染前统一换成文案 */
  const localizedFields = useMemo(
    () =>
      NEGATIVE_FIELDS.map((field) => ({
        ...field,
        label: t(field.label),
        hint: t(field.hint),
      })),
    [t]
  );

  // 关闭即卸载：草稿选择随之重置
  if (!open) return null;

  const items = getAllNegativePresets(customPresets);

  return (
    <PresetDialogShell
      title={t("create.negativePromptPresetDialog.title")}
      description={NEGATIVE_PRESET_DESCRIPTION}
      titleId="negative-preset-dialog-title"
      groups={[
        { id: "negative", label: t("create.negativePromptPresetDialog.groupLabel") },
      ]}
      activeGroupId="negative"
      onActiveGroupChange={() => {}}
      items={items}
      selectedId={draftPresetId}
      onSelectedIdChange={setDraftPresetId}
      summaryOf={(preset) => [
        preset.note ? { label: "", value: preset.note } : { label: "", value: "" },
        {
          label: t("create.negativePromptPresetDialog.contentLabel"),
          value: preset.negative
            ? preset.negative.length > 180
              ? `${preset.negative.slice(0, 180)}…`
              : preset.negative
            : t("create.negativePromptPresetDialog.empty"),
          tone: "negative" as const,
        },
      ]}
      fields={localizedFields}
      onCreate={(_groupId, values) =>
        addCustomPreset(values.name ?? "", values.negative ?? "")
      }
      onDeleteItem={removeCustomPreset}
      onOpenChange={onOpenChange}
      onSave={() => {
        const preset = items.find((item) => item.id === draftPresetId);
        onApply(preset?.negative ?? "", draftPresetId);
        onOpenChange(false);
      }}
    />
  );
}

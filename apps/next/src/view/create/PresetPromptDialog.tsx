"use client";

import { useMemo, useState } from "react";
import {
  findSeriesIdByPresetId,
  getSeriesPresets,
  PRESET_PROMPT_DESCRIPTION,
  PRESET_PROMPT_SERIES,
} from "@/data/presetPrompts";
import { useTranslation, type MessageKey } from "@/i18n";
import type { PresetPromptOption } from "@/types/presetPrompt";
import { PresetDialogShell, type PresetFieldDef } from "@/components/PresetDialogShell";

type PresetPromptDialogProps = {
  open: boolean;
  selectedPresetId: string;
  customPresets: Record<string, PresetPromptOption[]>;
  onCustomPresetsChange: (
    presets: Record<string, PresetPromptOption[]>
  ) => void;
  onOpenChange: (open: boolean) => void;
  onSave: (presetId: string) => void;
};

/**
 * 模块作用域拿不到 hook：字段文案在这里存**词条 key**，组件内渲染时再 `t()` 取文案
 * （与 `data/navigation.ts` 的 `LocalizedNavItem` 同一套路）。
 */
type LocalizedPresetFieldDef = Omit<PresetFieldDef, "label" | "placeholder" | "hint"> & {
  label: MessageKey;
  placeholder: MessageKey;
  hint: MessageKey;
};

/** 画师预设的四个字段（正/反 × 前缀/后缀），与反向提示词预设共用同一个弹框外壳 */
const PRESET_FIELDS: LocalizedPresetFieldDef[] = [
  {
    key: "positivePrefix",
    label: "create.presetPromptDialog.positivePrefixLabel",
    placeholder: "create.presetPromptDialog.positivePrefixPlaceholder",
    hint: "create.presetPromptDialog.positivePrefixHint",
    tone: "positive",
  },
  {
    key: "positiveSuffix",
    label: "create.presetPromptDialog.positiveSuffixLabel",
    placeholder: "create.presetPromptDialog.positiveSuffixPlaceholder",
    hint: "create.presetPromptDialog.positiveSuffixHint",
    tone: "positive",
  },
  {
    key: "negativePrefix",
    label: "create.presetPromptDialog.negativePrefixLabel",
    placeholder: "create.presetPromptDialog.negativePrefixPlaceholder",
    hint: "create.presetPromptDialog.negativePrefixHint",
    tone: "negative",
  },
  {
    key: "negativeSuffix",
    label: "create.presetPromptDialog.negativeSuffixLabel",
    placeholder: "create.presetPromptDialog.negativeSuffixPlaceholder",
    hint: "create.presetPromptDialog.negativeSuffixHint",
    tone: "negative",
  },
];

export function PresetPromptDialog({
  open,
  selectedPresetId,
  customPresets,
  onCustomPresetsChange,
  onOpenChange,
  onSave,
}: PresetPromptDialogProps) {
  const { t } = useTranslation();
  const [activeSeriesId, setActiveSeriesId] = useState(() =>
    findSeriesIdByPresetId(selectedPresetId, customPresets)
  );
  const [draftPresetId, setDraftPresetId] = useState(selectedPresetId);

  /** 字段定义存的是 key，渲染前统一换成文案 */
  const localizedFields = useMemo(
    () =>
      PRESET_FIELDS.map((field) => ({
        ...field,
        label: t(field.label),
        placeholder: t(field.placeholder),
        hint: t(field.hint),
      })),
    [t]
  );

  // 关闭即卸载：内部状态（当前分组、草稿选择）随之重置
  if (!open) return null;

  const seriesPresets = getSeriesPresets(activeSeriesId, customPresets);

  return (
    <PresetDialogShell
      title={t("create.presetPromptDialog.title")}
      description={PRESET_PROMPT_DESCRIPTION}
      titleId="preset-prompt-dialog-title"
      groups={PRESET_PROMPT_SERIES.map((series) => ({
        id: series.id,
        label: series.label,
        icon: series.icon,
        description: series.description,
      }))}
      activeGroupId={activeSeriesId}
      onActiveGroupChange={setActiveSeriesId}
      items={seriesPresets}
      selectedId={draftPresetId}
      onSelectedIdChange={setDraftPresetId}
      summaryOf={(preset) => [
        ...(preset.positivePrefix
          ? [
              {
                label: t("create.presetPromptDialog.positivePrefixSummary"),
                value: preset.positivePrefix,
                tone: "positive" as const,
              },
            ]
          : []),
        ...(preset.negativePrefix
          ? [
              {
                label: t("create.presetPromptDialog.negativePrefixSummary"),
                value: preset.negativePrefix,
                tone: "negative" as const,
              },
            ]
          : []),
      ]}
      fields={localizedFields}
      onCreate={(seriesId, values) => {
        const preset: PresetPromptOption = {
          id: `custom-${seriesId}-${Date.now()}`,
          name: values.name ?? "",
          positivePrefix: (values.positivePrefix ?? "").trim(),
          positiveSuffix: (values.positiveSuffix ?? "").trim(),
          negativePrefix: (values.negativePrefix ?? "").trim(),
          negativeSuffix: (values.negativeSuffix ?? "").trim(),
          isCustom: true,
          seriesId,
        };
        onCustomPresetsChange({
          ...customPresets,
          [seriesId]: [...(customPresets[seriesId] ?? []), preset],
        });
        return preset;
      }}
      onOpenChange={onOpenChange}
      onSave={() => {
        onSave(draftPresetId);
        onOpenChange(false);
      }}
    />
  );
}

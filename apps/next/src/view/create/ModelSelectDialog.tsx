"use client";

// 界面：「选择主模型」只适配扫描数据与返回值；弹窗框架和选择规则与 LoRA 完全共用。
import { useMemo } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTranslation } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import type { SelectedModel } from "@/types/model";
import { buildMainModelResources, getModelSeriesName } from "@/utils/main-model-resources";
import type { LocalResourceSeries } from "@/utils/localModelResources";
import { ResourceSelectDialog } from "@/view/create/resource-select-dialog";

interface ModelSelectDialogProps {
  open: boolean;
  selected: SelectedModel;
  series?: LocalResourceSeries;
  onOpenChange: (open: boolean) => void;
  onSelect: (selected: SelectedModel) => void;
}

export function ModelSelectDialog({ open, selected, series = "anima", onOpenChange, onSelect }: ModelSelectDialogProps) {
  const { t } = useTranslation();
  const models = useSettingsStore((state) => state.models);
  const paths = useSettingsStore((state) => state.paths);
  const { resources, selections } = useMemo(() => buildMainModelResources(models, paths, series), [models, paths, series]);
  const selectedIds = useMemo(() => selections.get(selected.versionId)?.modelId === selected.modelId
    ? [selected.versionId] : [], [selections, selected.modelId, selected.versionId]);
  const emptyMessage = series === "minimax" ? t("create.videoModels.emptyMinimax")
    : t(series === "anima" ? "create.modelSelectDialog.emptyAnima" : "create.modelSelectDialog.emptySdxl");

  return (
    /* 弹窗：选择主模型，复用 LoRA 的分类卡片；单模型直接选择，多模型打开分类内卡片。 */
    <ResourceSelectDialog open={open} selectedIds={selectedIds} resources={resources}
      title={t("create.modelSelectDialog.title", { name: getModelSeriesName(series) })}
      titleId="model-select-dialog-title" searchPlaceholder={t("create.modelSelectDialog.searchPlaceholder")}
      emptyMessage={emptyMessage} onOpenChange={onOpenChange}
      onConfirm={(models) => {
        if (models.length !== 1) { useToastStore.getState().show(t("create.resourceSelection.oneMainModel")); return false; }
        const value = selections.get(models[0].id);
        if (!value) return false;
        onSelect(value);
      }} />
  );
}

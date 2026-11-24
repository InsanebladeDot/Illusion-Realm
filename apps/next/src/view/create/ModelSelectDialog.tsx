"use client";

// 界面：「选择主模型」只适配扫描数据与返回值；弹窗框架和选择规则与 LoRA 完全共用。
import { useMemo } from "react";
import { visibleLocalModels } from "@/utils/local-model-visibility";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTranslation } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import type { SelectedModel } from "@/types/model";
import { buildMainModelResources, getModelSeriesName } from "@/utils/main-model-resources";
import type { LocalResourceSeries } from "@/utils/localModelResources";
import { ResourceSelectDialog } from "@/view/create/resource-select-dialog";

interface ModelSelectDialogProps {
  // 画布复用原单选模型列表，只注入中性配色，创建页默认外观保持原样。
  // tone 不改变分类、扫描结果、已选身份或确认回调。
  // 门户也显式继承同一配色，不能只把外层侧栏变成黑白。
  // 省略 tone 的创建页继续使用原应用表面，新增调用方不会改变全局颜色。
  // 该参数透传到公共资源外壳和门户，不重建模型列表或选择器内部状态。
  // 只使用一个明确的中性变体，不按业务名称添加一组互斥布尔开关。
  // 主模型确认仍要求一个版本，配色不能绕过单选校验或改变 onSelect 值。
  // 选择页的取消仍没有 onSelect 回调，节点和创建页各自保留此前的模型。
  tone?: "neutral";
  open: boolean;
  selected: SelectedModel;
  series?: LocalResourceSeries;
  onOpenChange: (open: boolean) => void;
  onSelect: (selected: SelectedModel) => void;
}

export function ModelSelectDialog({ open, selected, series = "anima", onOpenChange, onSelect, tone }: ModelSelectDialogProps) {
  const { t } = useTranslation();
  const scanned = useSettingsStore((state) => state.models);
  const hiddenPaths = useSettingsStore((state) => state.hiddenModelPaths);
  const models = useMemo(() => visibleLocalModels(scanned, hiddenPaths), [scanned, hiddenPaths]);
  const paths = useSettingsStore((state) => state.paths);
  const { resources, selections } = useMemo(() => buildMainModelResources(models, paths, series), [models, paths, series]);
  const selectedIds = useMemo(() => selections.get(selected.versionId)?.modelId === selected.modelId
    ? [selected.versionId] : [], [selections, selected.modelId, selected.versionId]);
  const emptyMessage = series === "minimax" ? t("create.videoModels.emptyMinimax")
    : series === "moss" ? t("create.moss.emptyModels")
    : t(series === "anima" ? "create.modelSelectDialog.emptyAnima" : "create.modelSelectDialog.emptySdxl");

  return (
    /* 弹窗：选择主模型，复用 LoRA 的分类卡片；单模型直接选择，多模型打开分类内卡片。 */
    <ResourceSelectDialog tone={tone} open={open} selectedIds={selectedIds} resources={resources}
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

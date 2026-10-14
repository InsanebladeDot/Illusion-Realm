"use client";

// 界面：「添加扩展」的数据适配入口，图片和视频都交给同一个资源选择器展示。
import { useMemo } from "react";
import { EXTENSION_TAG_CLASS } from "@/data/extensions";
import { useTranslation } from "@/i18n";
import type { CreateExtension } from "@/types/extension";
import type { ResourceSelectionOption } from "@/utils/resource-selection";
import { ResourceSelectDialog } from "@/view/create/resource-select-dialog";

interface ExtensionSelectDialogProps {
  open: boolean;
  selectedIds: string[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (models: ResourceSelectionOption[]) => void;
  resources: CreateExtension[];
}

export function ExtensionSelectDialog(props: ExtensionSelectDialogProps) {
  const { t } = useTranslation();
  const resources = useMemo(() => props.resources.map((item) => ({
    id: item.id, name: item.name, category: item.category, cover: item.cover,
    tag: item.isLocal ? item.category ?? "LoRA" : item.seriesTag,
    tagClassName: item.isLocal ? undefined : EXTENSION_TAG_CLASS[item.seriesTag],
    versions: item.versions?.length ? item.versions : [{ id: item.id, label: item.versionLabel }],
  })), [props.resources]);

  return (
    /* 弹窗：选择扩展（LoRA），与主模型共用分类栏、卡片及分类内模型选择。 */
    <ResourceSelectDialog {...props} resources={resources}
      title={t("create.extensionSelectDialog.title")} titleId="extension-select-dialog-title"
      searchPlaceholder={t("create.extensionSelectDialog.searchPlaceholder")}
      emptyMessage={t("create.extensionSelectDialog.empty")} />
  );
}

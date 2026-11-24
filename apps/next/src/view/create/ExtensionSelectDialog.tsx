"use client";

// 界面：「添加扩展」的数据适配入口，图片和视频都交给同一个资源选择器展示。
import { useMemo } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { modelPathKey } from "@/utils/local-model-visibility";
import { parseLocalLoraId } from "@/utils/localModelResources";
import { EXTENSION_TAG_CLASS } from "@/data/extensions";
import { useTranslation } from "@/i18n";
import type { CreateExtension } from "@/types/extension";
import type { ResourceSelectionOption } from "@/utils/resource-selection";
import { ResourceSelectDialog } from "@/view/create/resource-select-dialog";

interface ExtensionSelectDialogProps {
  open: boolean;
  // 仅将宿主中性外观透传给共用资源外壳，LoRA 业务仍共用原适配。
  // 原调用方省略此字段，图片、编辑、视频和音频创建页维持现有配色。
  // 不按当前全局选中节点判断颜色，避免两个来源互相覆盖。
  tone?: "neutral";
  selectedIds: string[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (models: ResourceSelectionOption[]) => void;
  resources: CreateExtension[];
}

export function ExtensionSelectDialog(props: ExtensionSelectDialogProps) {
  const { t } = useTranslation();
  const hiddenPaths = useSettingsStore(state => state.hiddenModelPaths);
  const resources = useMemo(() => props.resources.flatMap(item => {
    const versions = (item.versions?.length ? item.versions : [{ id: item.id, label: item.versionLabel }]).filter(version => {
      const file = parseLocalLoraId(version.id);
      return !file || !hiddenPaths.includes(modelPathKey(file));
    });
    if (!versions.length) return [];
    return [{
      id: item.id, name: item.name, category: item.category, cover: item.cover,
      tag: item.isLocal ? item.category ?? "LoRA" : item.seriesTag,
      tagClassName: item.isLocal ? undefined : EXTENSION_TAG_CLASS[item.seriesTag],
      versions,
    }];
  }), [props.resources, hiddenPaths]);

  return (
    /* 弹窗：选择扩展（LoRA），与主模型共用分类栏、卡片及分类内模型选择。 */
    <ResourceSelectDialog {...props} resources={resources}
      title={t("create.extensionSelectDialog.title")} titleId="extension-select-dialog-title"
      searchPlaceholder={t("create.extensionSelectDialog.searchPlaceholder")}
      emptyMessage={t("create.extensionSelectDialog.empty")} />
  );
}

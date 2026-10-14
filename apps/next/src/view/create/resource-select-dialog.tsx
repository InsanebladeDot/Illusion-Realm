"use client";

// 主模型和 LoRA 共用的分类卡片与模型弹窗；这里只处理展示和选择，不请求接口或解析工作流。
import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { useCreateFormStore } from "@/stores/useCreateFormStore";
import { useTranslation } from "@/i18n";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { resolveResourceSelection, type ResourceSelectionGroup, type ResourceSelectionOption } from "@/utils/resource-selection";
import { ResourceSelectionMode } from "./resource-selection-mode";
import { ResourceSelectionCard } from "./resource-selection-card";
import {
  INPUT_BORDER_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "@/utils/layout";
import { cn } from "@/utils/cn";
import { getResourceDialogTypography } from "@/utils/resourceDialogFontSize";
import { useMediaQueryAfterHydration } from "@/hooks/useMediaQuery";
import { ResourceCategoryFilter } from "@/view/create/ResourceCategoryFilter";
import { ModelVersionDialog } from "@/view/create/ModelVersionDialog";

interface ResourceSelectDialogProps {
  open: boolean;
  selectedIds: string[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (models: ResourceSelectionOption[]) => boolean | void;
  resources: ResourceSelectionGroup[];
  title: string;
  titleId: string;
  searchPlaceholder: string;
  emptyMessage: string;
}

function getResourceOptions(resource: ResourceSelectionGroup) {
  return resource.versions;
}

export function ResourceSelectDialog(props: ResourceSelectDialogProps) {
  // 点开时创建独立草稿，关闭时卸载；父级数据刷新或字号切换不会重置用户的单选 / 多选操作。
  return props.open ? <ResourceSelectSession {...props} /> : null;
}

function ResourceSelectSession({
  open,
  selectedIds,
  onOpenChange,
  onConfirm,
  resources,
  title,
  titleId,
  searchPlaceholder,
  emptyMessage,
}: ResourceSelectDialogProps) {
  const { t } = useTranslation();
  const resourceDialogFontSize = useCreateFormStore(
    (state) => state.resourceDialogFontSize
  );
  const setResourceDialogFontSize = useCreateFormStore(
    (state) => state.setResourceDialogFontSize
  );
  const resourceCategoryUiMode = useCreateFormStore(
    (state) => state.resourceCategoryUiMode
  );
  const setResourceCategoryUiMode = useCreateFormStore(
    (state) => state.setResourceCategoryUiMode
  );
  const typography = getResourceDialogTypography(resourceDialogFontSize);
  /** 与 `ResourceDialogShell` 同一个断点：紧凑形态下工具栏控件占满整行（外壳负责抬最小高度） */
  const isCompact = !useMediaQueryAfterHydration("(min-width: 1280px)");
  const [search, setSearch] = useState("");
  const [multiple, setMultiple] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>(selectedIds.slice(0, 1));
  const activeIds = pendingIds;
  const pick = (id: string) => setPendingIds((current) => multiple
    ? current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    : [id]);
  const changeMode = (nextMultiple: boolean) => {
    setMultiple(nextMultiple);
    if (!nextMultiple) setPendingIds((current) => current.slice(0, 1));
  };
  const confirm = () => {
    const models = resolveResourceSelection(resources, pendingIds);
    if (onConfirm(models) !== false) onOpenChange(false);
  };
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [draftVersions, setDraftVersions] = useState<Record<string, string>>(() => Object.fromEntries(
    resources.map((resource) => [resource.id, resource.versions.find((item) => selectedIds.includes(item.id))?.id ?? resource.versions[0]?.id ?? resource.id])
  ));
  const [activeGroup, setActiveGroup] = useState<ResourceSelectionGroup | null>(null);
  const source = resources;

  const categories = useMemo(
    () => [...new Set(source.flatMap((item) => item.category ? [item.category] : []))],
    [source]
  );

  const visibleResources = useMemo(
    () => source.filter((item) => (!selectedCategory || item.category === selectedCategory) &&
      [item.name, item.category ?? "", ...getResourceOptions(item).flatMap((version) => [version.label, version.detailLabel ?? ""])].some((text) => text.toLowerCase().includes(search.trim().toLowerCase()))),
    [source, search, selectedCategory]
  );

  if (!open) return null;

  const handleSelectResource = (resource: ResourceSelectionGroup) => {
    const versions = getResourceOptions(resource);
    const versionId = draftVersions[resource.id] ?? versions[0]?.id;
    if (!versionId) return;

    // 单模型更新草稿；分类下有多个模型时打开同一套模型卡片，只有 footer 确认才返回数据。
    if (versions.length > 1) setActiveGroup(resource);
    else pick(versionId);
  };

  return (
    <>
      <ResourceDialogShell
        open={open}
        title={title}
        titleId={titleId}
        bodyPadded={false}
        bodyClassName="px-3 pb-5 pt-7 sm:px-6"
        footer={<button type="button" data-resource-confirm data-extension-confirm disabled={!pendingIds.length} onClick={confirm} className={cn("ml-auto block h-9 rounded-xl px-4 text-sm font-medium", PRIMARY_BUTTON_CLASS, "disabled:cursor-not-allowed disabled:opacity-40")}>{t("common.confirm")}</button>}
        toolbar={
          <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <ResourceCategoryFilter
              categories={categories}
              selectedCategory={selectedCategory}
              uiMode={resourceCategoryUiMode}
              fontSize={resourceDialogFontSize}
              onCategoryChange={setSelectedCategory}
              onUiModeChange={setResourceCategoryUiMode}
              onFontSizeChange={setResourceDialogFontSize}
            />
            {/*
              手机宽度下筛选和搜索分两行，避免字号与显示模式被搜索框挤出视口；
              紧凑形态（< xl）下搜索占满剩余宽度；
              宽屏保持固定宽度（那一档 `w-32`/`sm:w-40` 与卡片网格的节奏一致）。
            */}
            <div className={cn("flex items-center gap-2 pb-1", isCompact ? "min-w-0 flex-1" : "shrink-0")}>
            {/* 界面：未点击「多选」为单选，按钮固定在搜索框左侧。 */}
            <ResourceSelectionMode multiple={multiple} onChange={changeMode} />
            <div
              className={cn(
                "relative min-w-0 flex-1"
              )}
            >
              <Search className={cn("pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground", typography.searchIcon)} />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                className={cn(
                  "rounded-full border-0 bg-muted pl-7 pr-2.5 font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/30 dark:bg-gray-700 dark:focus:ring-zinc-100/30",
                  isCompact ? "w-full" : "w-32 sm:w-40",
                  typography.toolbar,
                  typography.toolbarHeight
                )}
              />
            </div>
            </div>
          </div>
        }
        onOpenChange={onOpenChange}
      >
        {visibleResources.length === 0 ? (
          <div className={cn("flex min-h-[240px] items-center justify-center text-muted-foreground", typography.empty)}>
            {emptyMessage}
          </div>
        ) : (
          <div className="grid auto-rows-auto grid-cols-2 items-start gap-2 pb-4 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {visibleResources.map((resource) => {
              const versions = getResourceOptions(resource);
              const versionId =
                draftVersions[resource.id] ?? versions[0]?.id ?? resource.id;
              const version =
                versions.find((item) => item.id === versionId) ?? versions[0];
              const isSelected = versions.some((item) =>
                activeIds.includes(item.id)
              );

              return (
                <ResourceSelectionCard key={resource.id} name={resource.name} cover={resource.cover}
                  selected={isSelected} typography={typography} tag={resource.tag} tagClassName={resource.tagClassName}
                  meta={<>{versions.length} {t("create.extensionSelectDialog.versionUnit")}</>}>
                    <div className="mt-3 grid min-w-0 grid-cols-2 items-center gap-2">
                      {versions.length === 1 ? (
                        <span title={version?.detailLabel ?? version?.label} className={cn("truncate text-muted-foreground", typography.action)}>
                          {version?.label}
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-resource-model-picker={resource.id}
                          data-lora-model-picker={resource.id}
                          aria-haspopup="dialog"
                          title={version?.detailLabel ?? version?.label}
                          aria-label={t("create.extensionSelectDialog.versionDialogTitle", { name: resource.name })}
                          onClick={() => setActiveGroup(resource)}
                          className={cn(
                            "flex w-full items-center justify-between gap-1.5 whitespace-nowrap rounded-xl bg-muted/40 px-3 py-2 transition-colors hover:bg-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 dark:bg-gray-800/60 dark:hover:bg-gray-800",
                            typography.action,
                            typography.actionHeight,
                            INPUT_BORDER_CLASS,
                            "dark:border-gray-700"
                          )}
                        >
                          <span className="min-w-0 truncate">{version?.label}</span>
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSelectResource(resource)}
                        className={cn(
                          "inline-flex w-full items-center justify-center rounded-xl px-3 py-1 font-medium shadow transition-colors",
                          typography.action,
                          typography.actionHeight,
                          PRIMARY_BUTTON_CLASS
                        )}
                      >
                        {t("create.extensionSelectDialog.select")}
                      </button>
                    </div>
                </ResourceSelectionCard>
              );
            })}
          </div>
        )}
      </ResourceDialogShell>
      {/* 弹窗：图片和视频共用同一份分类数据，模型自己的封面与名称用于卡片展示 */}
      {activeGroup && <ModelVersionDialog
        title={t("create.extensionSelectDialog.versionDialogTitle", { name: activeGroup.name })}
        selectedKeys={activeIds}
        multiple={multiple}
        options={getResourceOptions(activeGroup).map((item) => ({ key: item.id, name: item.label, label: item.detailLabel ?? item.label, cover: item.cover ?? activeGroup.cover }))}
        onOpenChange={(nextOpen) => { if (!nextOpen) setActiveGroup(null); }}
        onSelect={(id) => { setDraftVersions((current) => ({ ...current, [activeGroup.id]: id })); pick(id); }}
      />}
    </>
  );
}

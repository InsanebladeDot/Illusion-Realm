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
  // 已加载列表就是打开时的选择快照，不能像只看购物车第一件商品那样截断其余项。
  // 先按精确模型 ID 去重，数量不由分类数或当前搜索结果推断。
  // 已有多个模型时直接启用多选，避免界面说单选却同时保留多个选中项。
  // 新会话只读取一次初值，搜索或父级重渲染不会把用户临时修改的草稿覆盖掉。
  // 关闭后会话卸载；下次打开重新读取调用方最新的已加载列表。
  // 图片、视频和音频的扩展入口共用这里，各自仍通过 selectedIds 注入本模式数据。
  // 主模型通常只传一个 ID，继续使用原单选行为与单模型确认校验。
  // 保留草稿不会自动提交，用户取消仍沿用外层原有的关闭回调。
  const [multiple, setMultiple] = useState(() => new Set(selectedIds).size > 1);
  const [pendingIds, setPendingIds] = useState<string[]>(() => [...new Set(selectedIds)]);
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
        // 底部计数属于当前草稿；分类筛选或关键词只改变可见卡片，不减少已选数量。
        // 确认仍走原 resolveResourceSelection 和业务回调，不根据屏幕数字组装工作流。
        // 计数用既有“已选”翻译，动态数字不写入设置或生成参数。
        // 整条 footer 共用外壳布局，左侧状态与右侧确认分别保持独立语义。
        // 主模型弹窗复用此处时显示一项，不会因为增加计数而放宽其业务限制。
        // role=status 让键盘勾选后也能获知数量，无需仅凭绿色边框判断。
        footer={<div className="flex w-full items-center justify-between gap-3"><span role="status" data-resource-total-selected={pendingIds.length} className="text-xs text-muted-foreground">{t("create.extensionSelectDialog.selected")} {pendingIds.length}</span><button type="button" data-resource-confirm data-extension-confirm disabled={!pendingIds.length} onClick={confirm} className={cn("ml-auto block h-9 rounded-xl px-4 text-sm font-medium", PRIMARY_BUTTON_CLASS, "disabled:cursor-not-allowed disabled:opacity-40")}>{t("common.confirm")}</button></div>}
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
              // 分类只是多个模型的容器，一张分类卡片可能对应多个已选版本。
              // 按此分类里的真实版本 ID 求交集，不能用当前下拉框显示的单个版本代替。
              // 隐藏的其他分类仍留在草稿里，本卡片只报告自己包含的已选数。
              // 同一分类选两个时角标为二，内层每个模型仍按独立 ID 标记。
              // 这里不修改 activeIds，不会因筛选或渲染重复执行选中操作。
              const selectedCount = versions.filter((item) => activeIds.includes(item.id)).length;
              const isSelected = selectedCount > 0;

              return (
                <ResourceSelectionCard key={resource.id} name={resource.name} cover={resource.cover}
                  selected={isSelected} selectedCount={selectedCount} typography={typography} tag={resource.tag} tagClassName={resource.tagClassName}
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

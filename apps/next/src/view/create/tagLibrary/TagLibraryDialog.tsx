"use client";

import { useMemo, useRef, useState } from "react";
import { Tag } from "lucide-react";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import type { LocalizedTagLibraryConfig } from "@/data/tagLibraries";
import { useTranslation } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { copyText } from "@/utils/charactersFormat";
import {
  TAG_LIBRARY_PAGE_SIZE,
  buildTagPrompt,
  filterTagItems,
  type TagSortMode,
} from "@/utils/tagLibrary";
import type { StaticTagItem } from "@/types/staticTagLibrary";
import { CharacterPagination } from "@/view/create/characters/CharacterPagination";
import { TagCategorySidebar } from "@/view/create/tagLibrary/TagCategorySidebar";
import { TagLibraryCard } from "@/view/create/tagLibrary/TagLibraryCard";
import { TagLibraryToolbar } from "@/view/create/tagLibrary/TagLibraryToolbar";
import { INPUT_BORDER_CLASS, PRIMARY_BUTTON_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type TagLibraryDialogProps = {
  open: boolean;
  /** 静态标签库配置（动作库 / 背景库共用同一套 UI）；文案字段存的是词条 key */
  library: LocalizedTagLibraryConfig;
  onOpenChange: (open: boolean) => void;
  /** 应用：把选中条目的 Tags 交给调用方（高级模式下覆盖对应分类） */
  onApply: (text: string, items: StaticTagItem[]) => void;
};

/**
 * 静态标签库弹窗（动作库 / 背景库）：与角色选择器**完全同一套 UI 排版** ——
 * 复用 ResourceDialogShell 外壳、左侧 Saber 导航 + Main 卡片区 + 底部固定分页与操作按钮，
 * 数据来自 `src/data/prompt/*.ts` 的纯静态数据集。
 *
 * 标题 / 条目单位 / 搜索框占位直接取 `library` 上的词条 key（`LocalizedTagLibraryConfig`），
 * 渲染时用 `t(...)` —— 数据层只描述「这个库是什么」，界面文案只在词条表里维护。
 */
export function TagLibraryDialog({
  open,
  library,
  onOpenChange,
  onApply,
}: TagLibraryDialogProps) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const prefix = library.testIdPrefix;
  const unitLabel = t(library.unitLabel);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<TagSortMode>("default");
  const [multi, setMulti] = useState(true);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<StaticTagItem[]>([]);

  /**
   * 渲染期同步：**每次**「关闭 → 打开」都重置到初始状态。
   * 记录前值到 state、渲染期比较后立即 set，替代 effect 内 setState。
   *
   * 注意：必须在两个方向上记录前值（而不是只在 open 为真时记录），
   * 否则第二次打开时 `open === 前值` 会跳过重置，残留上一次的搜索与已选项
   * （表现为「再打开时已选的还在、应用按钮因去选而变灰」）。
   */
  const [previousOpen, setPreviousOpen] = useState(false);
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) {
      setQuery("");
      setCategory("");
      setSort("default");
      setSelectedOnly(false);
      setSelected([]);
      setPage(1);
    }
  }

  const filtered = useMemo(
    () =>
      filterTagItems(library.items, {
        query,
        category,
        selectedIds: selected.map((item) => item.id),
        selectedOnly,
        sort,
      }),
    [category, library.items, query, selected, selectedOnly, sort]
  );

  const pages = Math.max(1, Math.ceil(filtered.length / TAG_LIBRARY_PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice(
    (currentPage - 1) * TAG_LIBRARY_PAGE_SIZE,
    currentPage * TAG_LIBRARY_PAGE_SIZE
  );
  const selectedIds = selected.map((item) => item.id);

  if (!open) return null;

  const toggleItem = (item: StaticTagItem) => {
    setSelected((prev) => {
      const exists = prev.some((entry) => entry.id === item.id);
      if (exists) return prev.filter((entry) => entry.id !== item.id);
      return multi ? [...prev, item] : [item];
    });
  };

  const handleApply = () => {
    if (selected.length === 0) {
      showToast(t("characters.tagLibrary.selectRequired", { unit: unitLabel }), "error");
      return;
    }
    onApply(buildTagPrompt(selected), selected);
    onOpenChange(false);
  };

  const handleCopySelected = async () => {
    const ok = await copyText(buildTagPrompt(selected));
    showToast(
      ok
        ? t("characters.tagLibrary.copied", { count: selected.length, unit: unitLabel })
        : t("common.copyFailed"),
      ok ? "success" : "error"
    );
  };

  return (
    <ResourceDialogShell
      open={open}
      title={
        <span className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-[#8B5CF6]" />
          {t(library.title)}
        </span>
      }
      titleId={`${prefix}-library-dialog-title`}
      description={
        <>
          {category || t("characters.tagLibrary.allCategories")}
          {query ? t("characters.tagLibrary.searchSuffix", { query }) : ""}
          {t("characters.tagLibrary.totalPrefix")}{" "}
          {filtered.length.toLocaleString("zh-CN")}
          {t("characters.tagLibrary.totalUnit")}
          {unitLabel}
        </>
      }
      toolbar={
        <TagLibraryToolbar
          prefix={prefix}
          placeholder={t(library.searchPlaceholder)}
          query={query}
          sort={sort}
          multi={multi}
          selectedCount={selected.length}
          selectedOnly={selectedOnly}
          onQueryChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          onMultiChange={(next) => {
            setMulti(next);
            if (!next) setSelected((prev) => prev.slice(-1));
          }}
          onCopySelected={() => void handleCopySelected()}
          onToggleSelectedOnly={() => {
            setSelectedOnly((prev) => !prev);
            setPage(1);
          }}
          onClearSelected={() => setSelected([])}
        />
      }
      bodyPadded={false}
      bodyScroll={false}
      bodyClassName="flex min-h-0 flex-col md:flex-row"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            {...{ [`data-${prefix}-selected-count`]: "true" }}
            className="min-w-0 truncate text-xs text-[#666666]"
          >
            {t("characters.tagLibrary.selectedPrefix")}{" "}
            <span className="font-semibold text-[#222222]">{selected.length}</span>{" "}
            {t("characters.tagLibrary.selectedUnit")}
            {unitLabel}
            {selected.length > 0 ? (
              <span className="ml-2 text-[11px] text-[#999999]">
                {selected.map((item) => item.name_zh || item.name).join("、")}
              </span>
            ) : null}
          </span>

          <div
            {...{ [`data-${prefix}-footer-actions`]: "true" }}
            className="ml-auto flex shrink-0 items-center gap-2"
          >
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={cn(
                "inline-flex h-9 items-center justify-center rounded-lg bg-white px-4 text-sm font-medium text-[#333333] transition-colors hover:bg-[#F8F9FA]",
                INPUT_BORDER_CLASS
              )}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              {...{ [`data-${prefix}-apply`]: "true" }}
              disabled={selected.length === 0}
              onClick={handleApply}
              className={cn(
                "inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium shadow transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                PRIMARY_BUTTON_CLASS
              )}
            >
              {t("characters.tagLibrary.apply")}
            </button>
          </div>
        </div>
      }
      onOpenChange={onOpenChange}
    >
      <TagCategorySidebar
        items={library.items}
        prefix={prefix}
        category={category}
        selectedCount={selected.length}
        selectedOnly={selectedOnly}
        onCategoryChange={(next) => {
          setCategory(next);
          setPage(1);
        }}
        onSelectedOnlyChange={(value) => {
          setSelectedOnly(value);
          setPage(1);
        }}
      />

      <section
        {...{ [`data-${prefix}-main`]: "true" }}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#F8F9FA]"
      >
        <div
          ref={scrollAreaRef}
          {...{ [`data-${prefix}-scroll-area`]: "true" }}
          className="min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-width:thin]"
        >
          {visible.length === 0 ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-[#E8E8E8] bg-white px-6 text-center text-sm text-[#9CA3AF]">
              {selectedOnly
                ? t("characters.tagLibrary.emptySelected", { unit: unitLabel })
                : t("characters.tagLibrary.empty")}
            </div>
          ) : (
            <div
              {...{ [`data-${prefix}-grid`]: "true" }}
              className="grid grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:grid-cols-4"
            >
              {visible.map((item) => (
                <TagLibraryCard
                  key={item.id}
                  item={item}
                  prefix={prefix}
                  selected={selectedIds.includes(item.id)}
                  onOpen={() => toggleItem(item)}
                />
              ))}
            </div>
          )}
        </div>

        {pages > 1 ? (
          <div
            {...{ [`data-${prefix}-pagination-bar`]: "true" }}
            className="shrink-0 border-t border-[#EFEFEF] bg-[#F8F9FA] px-4 py-3"
          >
            <CharacterPagination
              page={currentPage}
              pages={pages}
              count={visible.length}
              pageSize={TAG_LIBRARY_PAGE_SIZE}
              total={filtered.length}
              itemLabel={unitLabel}
              testIdPrefix={prefix}
              onChange={(next) => {
                setPage(next);
                if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0;
              }}
            />
          </div>
        ) : null}
      </section>
    </ResourceDialogShell>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { CHARACTER_COPYRIGHT_FILTERS, CHARACTER_PAGE_SIZE } from "@/data/characterFilters";
import { useTranslation } from "@/i18n";
import { useCharacterFavoriteStore } from "@/stores/useCharacterFavoriteStore";
import { useToastStore } from "@/stores/useToastStore";
import type {
  AnimadexCharacter,
  AnimadexSearchParams,
  AnimadexSearchResult,
} from "@/types/character";
import { searchCharacters } from "@/utils/characters";
import { copyText } from "@/utils/charactersFormat";
import { CharacterCard } from "@/view/create/characters/CharacterCard";
import { CharacterDetailDialog } from "@/view/create/characters/CharacterDetailDialog";
import { CharacterFilterSidebar } from "@/view/create/characters/CharacterFilterSidebar";
import { CharacterPagination } from "@/view/create/characters/CharacterPagination";
import { CharacterPickerToolbar } from "@/view/create/characters/CharacterPickerToolbar";
import { INPUT_BORDER_CLASS, PRIMARY_BUTTON_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

const EMPTY_RESULT: AnimadexSearchResult = {
  total: 0,
  page: 1,
  pageSize: CHARACTER_PAGE_SIZE,
  pages: 1,
  results: [],
};

/** 名称首字母（非字母开头归到 #） */
function initialOf(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
}

type CharacterPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 应用：把选中角色的提示词（含可选 Tags）交给调用方写入提示词区 */
  onApply: (text: string, characters: AnimadexCharacter[]) => void;
};

/**
 * 角色选择弹窗（创建页「画师」右侧入口）：
 * - 复用 ResourceDialogShell（与模型/扩展选择器同一父组件）
 * - 标题下为横向工具条；主体左侧固钉导航 + 右侧独立滚动的卡片区；底部分页与操作按钮固定
 * - 支持单选 / 多选；footer 左侧显示已选数量，右侧为 取消 / 应用触发词 / 触发词+Tags
 */
export function CharacterPickerDialog({
  open,
  onOpenChange,
  onApply,
}: CharacterPickerDialogProps) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const favoriteSlugs = useCharacterFavoriteStore((state) => state.slugs);
  const toggleFavorite = useCharacterFavoriteStore((state) => state.toggleFavorite);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [copyright, setCopyright] = useState("");
  const [letter, setLetter] = useState("");
  const [sort, setSort] = useState<NonNullable<AnimadexSearchParams["sort"]> | "">("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [multi, setMulti] = useState(true);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<AnimadexSearchResult>(EMPTY_RESULT);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AnimadexCharacter[]>([]);
  const [detail, setDetail] = useState<AnimadexCharacter | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  /**
   * 渲染期同步：**每次**「关闭 → 打开」都重置到初始状态。
   * 记录前值到 state、渲染期比较后立即 set，替代 effect 内 setState。
   *
   * 注意：必须在两个方向上记录前值（而不是只在 open 为真时记录），
   * 否则第二次打开时 `open === 前值` 会跳过重置，残留上一次的搜索与已选项。
   */
  const [previousOpen, setPreviousOpen] = useState(false);
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setCopyright("");
      setLetter("");
      setSort("");
      setFavoritesOnly(false);
      setSelectedOnly(false);
      setSelected([]);
      setDetail(null);
      setPage(1);
      setPending(true);
    }
  }

  /** 输入防抖 */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const requestParams = useMemo(
    (): AnimadexSearchParams => ({
      q: debouncedQuery || undefined,
      copyright: copyright || undefined,
      sort: sort || undefined,
      page,
      pageSize: CHARACTER_PAGE_SIZE,
    }),
    [copyright, debouncedQuery, page, sort]
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      try {
        const result = await searchCharacters(requestParams);
        if (cancelled) return;
        setData(result);
        setError(null);
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("characters.picker.loadFailed")
        );
        setData(EMPTY_RESULT);
      } finally {
        if (!cancelled) setPending(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, requestParams, t]);

  const selectedSlugs = useMemo(
    () => selected.map((item) => item.slug),
    [selected]
  );

  const characters = useMemo(() => {
    let list = favoritesOnly
      ? data.results.filter((item) => favoriteSlugs.includes(item.slug))
      : data.results;
    if (selectedOnly) {
      list = list.filter((item) => selectedSlugs.includes(item.slug));
    }
    if (letter) {
      list = list.filter((item) => initialOf(item.name) === letter);
    }
    return list;
  }, [data.results, favoriteSlugs, favoritesOnly, letter, selectedOnly, selectedSlugs]);

  const activeCopyrightLabel = t(
    CHARACTER_COPYRIGHT_FILTERS.find((item) => item.slug === copyright)?.label ??
      "characters.picker.allWorks"
  );

  if (!open) return null;

  const toggleCharacter = (character: AnimadexCharacter) => {
    setSelected((prev) => {
      const exists = prev.some((item) => item.slug === character.slug);
      if (exists) return prev.filter((item) => item.slug !== character.slug);
      return multi ? [...prev, character] : [character];
    });
  };

  const handleApply = (includeTags: boolean) => {
    if (selected.length === 0) {
      showToast(t("characters.picker.selectRequired"), "error");
      return;
    }

    const parts: string[] = [];
    for (const character of selected) {
      if (character.trigger) parts.push(character.trigger);
      else parts.push(character.name);
      if (includeTags && character.tags.length > 0) parts.push(...character.tags);
    }
    // 去重但保留顺序
    const text = Array.from(new Set(parts.map((item) => item.trim()).filter(Boolean))).join(", ");

    onApply(text, selected);
    onOpenChange(false);
  };

  const handleCopySelected = async () => {
    const text = selected.map((item) => item.trigger || item.name).join(", ");
    const ok = await copyText(text);
    showToast(
      ok
        ? t("characters.picker.copied", { count: selected.length })
        : t("common.copyFailed"),
      ok ? "success" : "error"
    );
  };

  const renderGrid = () => {
    if (characters.length === 0) {
      return (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-[#E8E8E8] bg-white px-6 text-center text-sm text-[#9CA3AF]">
          {favoritesOnly
            ? t("characters.picker.emptyFavorites")
            : selectedOnly
              ? t("characters.picker.emptySelected")
              : letter
                ? t("characters.picker.emptyLetter", { letter })
                : t("characters.picker.empty")}
        </div>
      );
    }

    return (
      <div
        data-character-grid
        className={cn(
          "grid grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:grid-cols-4",
          pending && "opacity-60"
        )}
      >
        {characters.map((character) => (
          <CharacterCard
            key={character.slug}
            character={character}
            favorite={favoriteSlugs.includes(character.slug)}
            selected={selectedSlugs.includes(character.slug)}
            onOpen={() => toggleCharacter(character)}
            onShowDetail={() => setDetail(character)}
            onToggleFavorite={() => toggleFavorite(character.slug)}
          />
        ))}
      </div>
    );
  };

  const showPagination = !favoritesOnly && !selectedOnly && !letter;

  return (
    <>
      <ResourceDialogShell
        open={open}
        title={
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#8B5CF6]" />
            {t("characters.picker.title")}
          </span>
        }
        titleId="character-picker-dialog-title"
        description={
          <>
            {activeCopyrightLabel}
            {debouncedQuery
              ? t("characters.picker.searchSuffix", { query: debouncedQuery })
              : ""}
            {t("characters.picker.totalPrefix")}{" "}
            {data.total.toLocaleString("zh-CN")}
            {t("characters.picker.roleUnit")}
          </>
        }
        toolbar={
          <CharacterPickerToolbar
            query={query}
            sort={sort}
            multi={multi}
            selectedCount={selected.length}
            selectedOnly={selectedOnly}
            onQueryChange={setQuery}
            onSortChange={(next) => {
              setPending(true);
              setSort(next);
              setPage(1);
            }}
            onMultiChange={(next) => {
              setMulti(next);
              // 切回单选时只保留最后一个
              if (!next) setSelected((prev) => prev.slice(-1));
            }}
            onCopySelected={() => void handleCopySelected()}
            onToggleSelectedOnly={() => setSelectedOnly((prev) => !prev)}
            onClearSelected={() => setSelected([])}
          />
        }
        bodyPadded={false}
        bodyScroll={false}
        bodyClassName="flex min-h-0 flex-col md:flex-row"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              data-character-selected-count
              className="min-w-0 truncate text-xs text-[#666666]"
            >
              {t("characters.picker.selectedPrefix")}
              <span className="font-semibold text-[#222222]">{selected.length}</span>
              {t("characters.picker.roleUnit")}
              {selected.length > 0 && (
                <span className="ml-2 text-[11px] text-[#999999]">
                  {selected.map((item) => item.name).join("、")}
                </span>
              )}
            </span>

            <div
              data-character-footer-actions
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
                data-character-apply-trigger
                disabled={selected.length === 0}
                onClick={() => handleApply(false)}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-[#C4B5FD] bg-white px-4 text-sm font-medium text-[#6D28D9] transition-colors hover:bg-[#F5F3FF] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {t("characters.picker.applyTrigger")}
              </button>
              <button
                type="button"
                data-character-apply-both
                disabled={selected.length === 0}
                onClick={() => handleApply(true)}
                className={cn(
                  "inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium shadow transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                  PRIMARY_BUTTON_CLASS
                )}
              >
                {t("characters.picker.applyBoth")}
              </button>
            </div>
          </div>
        }
        onOpenChange={onOpenChange}
      >
        <CharacterFilterSidebar
          letter={letter}
          copyright={copyright}
          favoritesOnly={favoritesOnly}
          selectedOnly={selectedOnly}
          favoriteCount={favoriteSlugs.length}
          selectedCount={selected.length}
          onLetterChange={setLetter}
          onCopyrightChange={(slug) => {
            setPending(true);
            setCopyright(slug);
            setPage(1);
          }}
          onFavoritesOnlyChange={setFavoritesOnly}
          onSelectedOnlyChange={setSelectedOnly}
        />

        {/* Main（展示区）：与左侧 Saber 完全独立的区域，卡片区滚动、分页固定在卡片区下方 */}
        <section
          data-character-main
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#F8F9FA]"
        >
          <div
            ref={scrollAreaRef}
            data-character-scroll-area
            className="min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-width:thin]"
          >
            {error ? (
              <div className="mb-3 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-sm text-[#B91C1C]">
                {error}
              </div>
            ) : null}

            {pending && characters.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center text-[#9CA3AF]">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              renderGrid()
            )}
          </div>

          {/* 分页固定在 Main 底部（不随卡片滚动，也不属于 Saber） */}
          {showPagination && (
            <div
              data-character-pagination-bar
              className="shrink-0 border-t border-[#EFEFEF] bg-[#F8F9FA] px-4 py-3"
            >
              <CharacterPagination
                page={data.page}
                pages={data.pages}
                count={characters.length}
                pageSize={data.pageSize}
                total={data.total}
                onChange={(next) => {
                  setPending(true);
                  setPage(next);
                  if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0;
                }}
              />
            </div>
          )}
        </section>
      </ResourceDialogShell>

      <CharacterDetailDialog
        character={detail}
        favorite={detail ? favoriteSlugs.includes(detail.slug) : false}
        onToggleFavorite={() => {
          if (detail) toggleFavorite(detail.slug);
        }}
        onInsert={(character) => {
          setDetail(null);
          onApply(character.trigger || character.name, [character]);
          onOpenChange(false);
        }}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDetail(null);
        }}
      />
    </>
  );
}

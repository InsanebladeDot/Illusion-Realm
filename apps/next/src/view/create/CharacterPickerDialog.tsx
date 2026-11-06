"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { LibraryResults } from "@/components/library/library-results";
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
import { favoriteCharacterCatalog, filterFavoriteCharacters } from "@/utils/library-favorites";
import { searchCharacters } from "@/utils/characters";
import { copyText } from "@/utils/charactersFormat";
// 界面：左侧分类复用同一筛选状态，来源菜单沿用 SimpleSelect。
// 实际数据匹配留在主进程，创建页与 Agent 不分别实现搜索算法。
// 在线来源仍保留原有角色卡、多选与收藏交互。
import { CharacterReferenceFilters } from "@/view/create/characters/CharacterReferenceFilters";
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
  const favoriteSnapshots = useCharacterFavoriteStore(state => state.characters);
  const rememberCharacters = useCharacterFavoriteStore(state => state.rememberCharacters);

  // 展示模式只改变卡片外观，不清空已选角色或改变查询分页。
  const [displayMode, setDisplayMode] = useState<"card" | "text">("card");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // 本地为默认来源，普通打开角色选择器不再依赖网络。
  // 只把三个外观条件单独存储，作品继续沿用原有 copyright 状态。
  // 分类键由共享契约限制，不能把 eye 误写成 eyes 发送给主进程。
  // 来源切换时条件和分页一起清空，旧结果不会冒充新来源。
  // 这些状态仅本弹窗有效，不修改用户原提示词或账号数据。
  // 本地分类按真实资料展示，空属性表示未收录，不创建“默认颜色”。
  const [source, setSource] = useState<"local" | "online">("local");
  const [traits, setTraits] = useState<Pick<AnimadexSearchParams, "gender" | "hair" | "eye">>({});
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
      setDisplayMode("card");
      setQuery("");
      setDebouncedQuery("");
      // 每次重开回到离线参考库，避免上次网络失败阻止选择。
      // 清除属性与来源，保持原来“重新打开即重置”的契约。
      // 全量 facets 随第一页返回，重置不需要额外的分类请求。
      setSource("local"); setTraits({}); setData(EMPTY_RESULT);
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
      // 来源与属性是查询的一部分，改变任意一项都会重新请求。
      // 在线来源没有 traits，切换回调会清空旧的本地条件。
      // 即使页面里出现旧数据，结果取消标记仍挡住迟到响应。
      // 分类采用 AND 关系，UI 不在当前页二次筛出不完整全集。
      // 空字符串由主进程视为不筛选，保留已有作品输入语义。
      // 页大小继续复用原角色卡分页，避免本地一次渲染八千项。
      source, ...traits,
      q: debouncedQuery || undefined,
      copyright: copyright || undefined,
      sort: sort || undefined,
      page,
      pageSize: CHARACTER_PAGE_SIZE,
    }),
    [copyright, debouncedQuery, page, sort, source, traits]
  );

  useEffect(() => {
    if (!open || favoritesOnly) return;
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
  }, [open, favoritesOnly, requestParams, t]);

  // 从真实查询补齐旧收藏快照；没有缺项时 store 返回原对象，不循环保存。
  useEffect(() => { rememberCharacters(data.results); }, [data.results, rememberCharacters]);
  const favoriteCatalog = useMemo(() => favoriteCharacterCatalog(favoriteSlugs, favoriteSnapshots, data.results), [favoriteSlugs, favoriteSnapshots, data.results]);

  const selectedSlugs = useMemo(
    () => selected.map((item) => item.slug),
    [selected]
  );

  const characters = useMemo(() => {
    // “只看已选”展示完整选择草稿，不受当前搜索、分类或分页限制。
    // 这是参考工具的独立视图；退出后再恢复原来的查询结果。
    // selected 中的对象来自用户明确选择，不能从当前一页重建。
    // 无条件提前返回也避免字母或收藏条件把已选项再次隐藏。
    // 此处不清空原筛选，因此用户切回来仍能继续原查询。
    if (selectedOnly) return selected;
    let list = favoritesOnly
      ? filterFavoriteCharacters(favoriteCatalog, debouncedQuery, copyright, traits)
      : data.results;
    if (letter) {
      list = list.filter((item) => initialOf(item.name) === letter);
    }
    return favoritesOnly && sort === "az" ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : list;
  // selected 是跨页草稿，依赖它本身以便取消选择后即时更新视图。
  // selectedSlugs 仅用于卡片勾选，不再作为当前页过滤的替代品。
  // 线上与本地来源共用这条规则，不在一个来源中恢复旧的页内限制。
  }, [data.results, favoriteCatalog, favoritesOnly, debouncedQuery, copyright, traits, sort, letter, selectedOnly, selected]);

  // 本地作品值是资料原文，不能拿远端 slug 词表反查显示名。
  // 未选作品时复用原全部作品文案，统计仍来自筛选后的总数。
  // 在线来源继续按既有 i18n 作品名显示，不改变收藏卡的名称。
  const activeCopyrightLabel = source === "local" ? copyright || t("characters.picker.allWorks") : t(
    CHARACTER_COPYRIGHT_FILTERS.find((item) => item.slug === copyright)?.label ??
      "characters.picker.allWorks"
  );

  // 收藏数据先完整过滤，再做分页；它不使用线上请求返回的页码与总数。
  const favoritePages = Math.max(1, Math.ceil(characters.length / CHARACTER_PAGE_SIZE));
  const favoritePage = Math.min(page, favoritePages);
  const visibleCharacters = favoritesOnly && !selectedOnly ? characters.slice((favoritePage - 1) * CHARACTER_PAGE_SIZE, favoritePage * CHARACTER_PAGE_SIZE) : characters;
  const toggleFavoritesOnly = () => { setFavoritesOnly(value => !value); setSelectedOnly(false); setPage(1); setPending(false); };
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
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-border bg-background px-6 text-center text-sm text-muted-foreground">
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
          displayMode === "text" ? "flex content-start flex-wrap gap-2" : "grid grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:grid-cols-4",
          pending && "opacity-60"
        )}
      >
        {visibleCharacters.map((character) => (
          <CharacterCard
            key={character.slug}
            character={character}
            displayMode={displayMode}
            favorite={favoriteSlugs.includes(character.slug)}
            selected={selectedSlugs.includes(character.slug)}
            onOpen={() => toggleCharacter(character)}
            onShowDetail={() => setDetail(character)}
            onToggleFavorite={() => toggleFavorite(character.slug, character)}
          />
        ))}
      </div>
    );
  };

  const showPagination = !selectedOnly && !letter;

  return (
    <>
      <ResourceDialogShell
        open={open}
        title={
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4 text-foreground" />
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
            {(favoritesOnly ? characters.length : data.total).toLocaleString("zh-CN")}
            {t("characters.picker.roleUnit")}
          </>
        }
        toolbar={
          <>
          {/* 本地资料无时间戳，以可验证的字母序替代“最新”。 */}
          {/* 热度数仍来自参考数据，不被描述为实时站点统计。 */}
          {/* 切来源已重置 sort，因此不会残留隐藏的排序选项。 */}
          <CharacterPickerToolbar
            displayMode={displayMode}
            onDisplayModeChange={setDisplayMode}
            localReference={source === "local"}
            favorites={{ count: favoriteSlugs.length, active: favoritesOnly, onToggle: toggleFavoritesOnly }}
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
          </>
        }
        bodyPadded={false}
        bodyScroll={false}
        bodyClassName="flex min-h-0 flex-col md:flex-row"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              data-character-selected-count
              className="min-w-0 truncate text-xs text-muted-foreground"
            >
              {t("characters.picker.selectedPrefix")}
              <span className="font-semibold text-foreground">{selected.length}</span>
              {t("characters.picker.roleUnit")}
              {selected.length > 0 && (
                <span className="ml-2 text-[11px] text-muted-foreground">
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
                  "inline-flex h-9 items-center justify-center rounded-lg bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted",
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
                className="inline-flex h-9 items-center justify-center rounded-lg border border-accent-stroke bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
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
        {/* 界面：四属性筛选放入左侧分类区，顶部只保留搜索和选择动作。 */}
        {/* 来源切换仍清空页码与旧条件，避免在线 slug 和本地作品原文混用。 */}
        {/* 分类和徽标从整库返回，不根据当前页卡片猜可选值或计数。 */}
        {/* 原字母、收藏、多选与卡片详情继续使用同一组父级状态。 */}
        {/* 分类组件只渲染一次，窄屏也不会出现两份互相覆盖的筛选。 */}
        {/* 数量表示本地参考记录，线上资料仅补充已确认身份的展示。 */}
        <CharacterFilterSidebar
          hideCopyright={source === "local"}
          referenceFilters={<CharacterReferenceFilters source={source} filters={{copyright,...traits}} facets={data.facets} facetCounts={data.facetCounts} onSourceChange={next => { setSource(next); setTraits({}); setCopyright(""); setPage(1); setData(EMPTY_RESULT); setPending(true); }} onChange={next => { const {copyright:work,...appearance}=next; setCopyright(work || ""); setTraits(appearance); setPage(1); setPending(true); }} />}
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
          onFavoritesOnlyChange={() => toggleFavoritesOnly()}
          onSelectedOnlyChange={setSelectedOnly}
        />

        {/* Main（展示区）：与左侧 Saber 完全独立的区域，卡片区滚动、分页固定在卡片区下方 */}
{/* 界面：所有库共用滚动主区、主题底色与固定分页，不再独立维护内部布局。 */}
        {/* 分页插槽由角色父级填写，共用主区不理解远端页码。 */}
        {/* 角色API返回的page可能被服务器纠正，因此使用data.page显示真实页。 */}
        {/* 页数与总数也取同一次响应，不以当前卡片数量推算整库大小。 */}
        {/* 本地和在线来源都经过原查询流程，此处不额外发起第二次查询。 */}
        {/* 只看已选时沿用原showPagination条件，不能把草稿再当远端结果翻页。 */}
        {/* scrollAreaRef指向共用组件内部的真实滚动节点。 */}
        {/* 翻页仅重置卡片区滚动，不让整个弹窗或侧栏跳到顶部。 */}
        {/* pending在发起下一页前设置，避免用户误以为点击没有生效。 */}
        {/* 详情状态仍由外层持有，更换展示容器不会替换详情弹窗的数据。 */}
        {/* 错误与加载占位作为children进入同一滚动区。 */}
        {/* 这样请求失败提示不会挤出分页，窄屏也不会撑高整个窗口。 */}
        {/* 角色网格的列数仍由原renderGrid决定，共用层不强行重排数据。 */}
        {/* 共用层只负责底色、留白、滚动与分页位置。 */}
        {/* 像相框只规定边框，角色照片与画师照片仍由各自适配器放进去。 */}
        {/* 底部应用按钮仍属于外层ResourceDialogShell，不随卡片滚走。 */}
        {/* 分页不是覆盖在卡片上的悬浮层，因此末行卡片仍可完整点击。 */}
        {/* 已选列表与收藏列表继续通过原状态控制，不依赖卡片是否仍挂载。 */}
        {/* 跨页选择不会因为滚动容器替换而丢失。 */}
        {/* 角色专有的描述词应用保留在原handleApply中，不下沉到通用卡片。 */}
        {/* 布局复用不等于把不同来源的返回类型合并成不安全对象。 */}
        {/* LibraryResults接收React节点，因此无需知道Animadex的网络协议。 */}
        {/* 新的共享标记用于回归确认真正复用，而不是只复制同名样式。 */}
        {/* 旧character定位属性继续由prefix生成，已有回归仍可定位分页。 */}
        {/* 主题色由共用容器读取当前CSS变量，不缓存首次打开时的浅色值。 */}
        {/* 没有增加遮罩或定位层，键盘和鼠标仍进入原弹窗焦点范围。 */}
        {/* 分页跳转后的重新请求由原effect处理，不在这个插槽中重复调用。 */}
        {/* 如果没有分页，插槽为空，不额外保留一条无内容底栏。 */}
        {/* 计数零条和加载中仍是两种状态，由原查询状态区分。 */}
        {/* 用户关闭后清理与重开规则保持原组件职责。 */}
        {/* 所有库共享布局的改动会同时影响角色，角色回归因此仍是必要检查。 */}
        {/* 此处没有改变选择项写入提示词的内容或顺序。 */}
        {/* 在线预览能否加载仍取决于原图片服务，不由容器假造成功。 */}
        <LibraryResults prefix="character" scrollRef={scrollAreaRef} pagination={showPagination ? (
              <CharacterPagination
                page={favoritesOnly ? favoritePage : data.page}
                pages={favoritesOnly ? favoritePages : data.pages}
                count={visibleCharacters.length}
                pageSize={favoritesOnly ? CHARACTER_PAGE_SIZE : data.pageSize}
                total={favoritesOnly ? characters.length : data.total}
                onChange={(next) => {
                  if (!favoritesOnly) setPending(true);
                  setPage(next);
                  if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0;
                }}
              />
        ) : undefined}>
            {error && !favoritesOnly ? (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            ) : null}

            {favoritesOnly && favoriteCatalog.length < favoriteSlugs.length && <p data-character-favorites-unresolved className="mb-3 text-sm text-muted-foreground">{t("characters.favorites.missingSnapshots", { count: favoriteSlugs.length - favoriteCatalog.length })}</p>}
            {pending && !favoritesOnly && characters.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              renderGrid()
            )}
        </LibraryResults>
      </ResourceDialogShell>

      <CharacterDetailDialog
        character={detail}
        favorite={detail ? favoriteSlugs.includes(detail.slug) : false}
        onToggleFavorite={() => {
          if (detail) toggleFavorite(detail.slug, detail);
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

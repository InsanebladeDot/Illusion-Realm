"use client";

import { useMemo, useRef, useState } from "react";
import { Tag } from "lucide-react";
import { LibraryResults } from "@/components/library/library-results";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import type { LocalizedTagLibraryConfig } from "@/data/tagLibraries";
import { useTranslation } from "@/i18n";
import { useLibraryFavoritesStore } from "@/stores/use-library-favorites-store";
import { useToastStore } from "@/stores/useToastStore";
import { copyText } from "@/utils/charactersFormat";
import {
  TAG_LIBRARY_PAGE_SIZE,
  buildTagPrompt,
  filterTagItems,
  // 背景标题复用同一分类短名规则，不能筛选生效后仍写全部分类。
  // 只处理展示，不把去掉英文括号后的名字传回实际过滤器。
  // 原始categories仍保留完整值，切换语言和清除条件都不受影响。
  tagCategoryShortName,
  type TagSortMode,
} from "@/utils/tagLibrary";
import type { StaticTagItem } from "@/types/staticTagLibrary";
import { CharacterPagination } from "@/view/create/characters/CharacterPagination";
import { TagCategorySidebar } from "@/view/create/tagLibrary/TagCategorySidebar";
import { TagLibraryCard } from "@/view/create/tagLibrary/TagLibraryCard";
import { TagLibraryToolbar } from "@/view/create/tagLibrary/TagLibraryToolbar";
import { INPUT_BORDER_CLASS, PRIMARY_BUTTON_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
// 背景分类复用已有弹窗与卡片，只替换分类面板和过滤规则。
// 算法是独立纯函数，UI 点击与离线回归共用同一实现。
// 类型别名区分受控状态与同名的展示组件。
import { filterBackgroundItems, type BackgroundFilters as BackgroundFilterState } from "@/utils/library-facets";
// 画师只替换查询与侧栏配置，卡片、分页、工具栏和应用仍共用。
// 收藏操作存入同一用户文档，不给每个库重复编写持久化实现。
// 指标从源ID读取，名称搜索不负责猜测画师风格或模型兼容性。
import { useArtistLibraryStore } from "@/stores/use-artist-library-store";
import { ARTIST_METADATA, filterArtistItems, type ArtistSort } from "@/utils/artist-library";
import { ArtistFilters } from "./artist-filters";
import { BackgroundFilters } from "@/view/create/tagLibrary/background-filters";

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

  // 查看收藏与只看已选各自有入口；两者互斥展示，选择草稿本身不会被清空。
  // 三个静态库共用一个带库身份的保存机制，画师沿用现有分组收藏。
  const storedFavorites = useLibraryFavoritesStore();
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  // 背景大类多选并集、特征多选交集，不能继续压成一个 category 字符串。
  // 其他静态库保持旧单分类，隐藏的新状态不影响动作或表情结果。
  // 选择只存在当前弹窗，确认前不会修改提示词和用户文档。
  const [backgroundFilters, setBackgroundFilters] = useState<BackgroundFilterState>({ categories: [], traits: [] });
  // 收藏组和排序仅影响画师；普通静态库不消费这些状态。
  // 新打开弹窗回到全部画师与作品数降序，收藏本身不会被清空。
  // 随机种子只在选择随机排序时更新，分页保持稳定顺序。
// 画师库的持久化状态只存收藏关系，不复制四万条源资料。
// 像通讯录分组只记联系人编号，源画师详情仍从本地JSON读取。
// 组id与画师id不混用，选组不会自动把组名写进提示词。
// 用户选择的草稿与收藏关系分开，取消弹窗不应撤销已点的收藏。
// 分组重命名保留组id，避免已选分组因名称变化突然查不到成员。
// 删除组只删除关系，默认收藏仍保留里面的画师。
// 普通动作库与背景库不会把其条目注册到画师收藏里。
// 单一store使同一资料库从高级组装和普通模式打开时看到相同收藏。
// 页面没有另建localStorage，使用AppShell已水合的用户文档分段。
// 旧文档没有画师段时得到空集合，而不是弹窗读取失败。
// 随机排序seed独立保存为当前浏览状态，不污染持久化资料。
// 相同seed跨页保持同一排列，避免第二页再次出现第一页的画师。
// 只有用户重新选择随机排序才换seed，普通搜索不会自行洗牌。
// 默认使用作品数降序，这个数是导入的资料指标而非实时访问量。
// 独特性指标同样是参考数据，界面不把它解释成生成质量保证。
// 画师没有可靠风格类别，因此侧栏只提供全部、收藏和用户分组。
// 没有根据名称猜测画风，以免形成不存在的数据分类。
// 数据是否能搜索由filterArtistItems决定，侧栏仅提供过滤参数。
  const artist = useArtistLibraryStore();
  const favoriteIds = library.id === "artist" ? artist.collections.favorites : storedFavorites.data.items[library.id].map(item => item.id);
  const toggleFavorite = (item: StaticTagItem) => {
    if (library.id === "artist") artist.toggle(item.id);
    else storedFavorites.toggle(library.id, item);
  };
  const [artistGroup, setArtistGroup] = useState("");
  const [artistSort, setArtistSort] = useState<ArtistSort>("works-desc");
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [sort, setSort] = useState<TagSortMode>("default");
  const [multi, setMulti] = useState(true);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [displayMode, setDisplayMode] = useState<"card" | "text">("card");
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
      setFavoritesOnly(false);
      setQuery("");
      setCategory("");
      // 重开时清空两组筛选，不能让上一轮隐藏特征继续限制新查询。
      // 仅重置分类，与下方既有选择、搜索和页码重置保持同一时机。
      // 没有引入新的落盘字段，旧用户文档无需迁移。
      setBackgroundFilters({ categories: [], traits: [] });
      // 重新打开只重置浏览状态，不能清除用户已持久化的收藏组。
      // 分组与随机顺序不跨会话强行恢复，避免旧筛选隐藏全部资料。
      // 既有普通库default排序与后面的多选清空继续保持原约定。
      setArtistGroup(""); setArtistSort("works-desc"); setShuffleSeed(0);
      setSort("default");
      setSelectedOnly(false);
      setDisplayMode("card");
      setSelected([]);
      setPage(1);
    }
  }

  // 过滤先于分页，1056条背景的分类结果不会被当前24张卡片限制。
  // 返回数组仍交给现有分页和卡片组件，选择和应用链路保持同一入口。
  // 只看已选在背景分支独立展示，动作与表情的规则不随本轮改变。
  const filtered = useMemo(
    () => {
      // 单分类输入仍供动作与表情使用，背景另外组合多分类和特征。
      // 使用明确分支调用，防止背景专用参数泄漏到其他库的接口中。
      // 查询与已选状态只定义一次，避免两条路径漏同步某个字段。
      // 收藏使用整库快照，过滤仍按原搜索/分类规则执行，最后才分页。
      // 已选视图优先，用户跨页选中的项目不因收藏筛选改变而消失。
      if (selectedOnly) return selected;
      const items = favoritesOnly && library.id !== "artist" ? storedFavorites.data.items[library.id] : library.items;
      const input = {
        query,
        category,
        selectedIds: selected.map((item) => item.id),
        selectedOnly,
        sort,
      };
      // 已选视图优先于画师分组和搜索，保证跨页完整草稿可见。
      // 画师计数来自过滤后的完整集合，再交给共用分页器截取。
      // 只有此分支消费静态作品数与独特性评分，其他库不冒用画师元数据。
// 画师专有查询在通用分页之前运行，搜索覆盖整库而非当前24张。
// 源数据、收藏关系、排序和随机seed都作为显式参数传入。
// 查询器返回StaticTagItem，后续卡片无需了解原始画师字段。
// 完整selected对象让已选视图独立于当前页的临时渲染结果。
// 搜索没有命中时返回空集合，不偷偷回退到全部画师。
// 分组未命中同样为空，不在UI层拼接不存在的资料。
// 原始画师名字保留用于提示词，预览文件名的去转义只发生在URL映射。
// 收藏变化会重新计算结果，当前收藏组删成员后立即更新。
// 返回数组由slice生成当前页，不在卡片内再进行第二次过滤。
// 普通库仍使用原有default和az规则，不套用画师作品数排序。
// 背景继续使用已确认的大类并集与特征交集规则。
// 三个分支汇入同一visible数组，因此网格、分页和空态只写一次。
      if (library.id === "artist") return filterArtistItems(library.items, input, favoritesOnly ? "favorites" : artistGroup, artist.collections, artistSort, selected, shuffleSeed);
      return library.id === "background" ? filterBackgroundItems(items, input, backgroundFilters, selected) : filterTagItems(items, input);
    },
    // 背景的双层条件参与实际过滤依赖，不能只改侧栏高亮。
    // selected 提供跨页完整草稿，“只看已选”不再被当前分页截断。
    // 其他库仍调用原函数，单分类、关键词和已选的过滤次序保持一致。
    [favoritesOnly, storedFavorites.data, artist.collections, artistGroup, artistSort, shuffleSeed, backgroundFilters, category, library.id, library.items, query, selected, selectedOnly, sort]
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
          <Tag className="h-4 w-4 text-accent-text" />
          {t(library.title)}
        </span>
      }
      titleId={`${prefix}-library-dialog-title`}
      description={
        <>
          {/* 界面：标题列出真实活动分类，场景与特征和下方结果保持一致。 */}
          {/* 没有条件时才显示全部分类，搜索后仍沿用原来的关键词说明。 */}
          {/* 特征保留原始键，避免标题引入另一份可能不同步的标签翻译。 */}
          {(library.id === "artist" ? (artistGroup === "favorites" ? t("characters.artist.favorites") : artist.collections.groups.find(group => group.id === artistGroup)?.name || t("characters.artist.all")) : library.id === "background" ? [...backgroundFilters.categories.map(tagCategoryShortName), ...backgroundFilters.traits].join(" · ") : category) || t("characters.tagLibrary.allCategories")}
          {query ? t("characters.tagLibrary.searchSuffix", { query }) : ""}
          {t("characters.tagLibrary.totalPrefix")}{" "}
          {filtered.length.toLocaleString("zh-CN")}
          {t("characters.tagLibrary.totalUnit")}
          {unitLabel}
        </>
      }
      toolbar={
        <TagLibraryToolbar
          // 画师排序在侧栏展示全部七种能力，工具栏不重复显示不真实的默认值。
          // 隐藏只影响排序控件，共用搜索、多选、显示方式和复制全部保留。
          // 其他库仍按default/az的原配置显示。
          hideSort={library.id === "artist"}
          prefix={prefix}
          favorites={{ count: favoriteIds.length, active: favoritesOnly || (library.id === "artist" && artistGroup === "favorites"), onToggle: () => { setFavoritesOnly(!(favoritesOnly || (library.id === "artist" && artistGroup === "favorites"))); setArtistGroup(""); setSelectedOnly(false); setPage(1); } }}
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
            setFavoritesOnly(false);
            setPage(1);
          }}
          onClearSelected={() => setSelected([])}
          displayMode={displayMode}
          onDisplayModeChange={setDisplayMode}
        />
      }
      bodyPadded={false}
      bodyScroll={false}
      bodyClassName="flex min-h-0 flex-col md:flex-row"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            {...{ [`data-${prefix}-selected-count`]: "true" }}
            className="min-w-0 truncate text-xs text-muted-foreground"
          >
            {t("characters.tagLibrary.selectedPrefix")}{" "}
            <span className="font-semibold text-foreground">{selected.length}</span>{" "}
            {t("characters.tagLibrary.selectedUnit")}
            {unitLabel}
            {selected.length > 0 ? (
              <span className="ml-2 text-[11px] text-muted-foreground">
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
                "inline-flex h-9 items-center justify-center rounded-lg bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted",
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
      {/* 界面：分类插槽允许不同数据提供条件，但外壳始终是同一侧栏。 */}
      {/* 画师传ArtistFilters，背景传BackgroundFilters，其他库用原分类列表。 */}
      {/* 不为每种库再创建独立的左右分栏或固定底栏。 */}
      {/* 组变化时退出只看已选，避免点了分类却一直看不到分类结果。 */}
      {/* 组和条件变化都回第一页，避免停在旧集合不存在的页码。 */}
      {/* 滚动回顶针对真实scrollAreaRef，用户能立刻看到新结果首行。 */}
      {/* 排序变化不清除草稿，选择可以跨排序和搜索累计。 */}
      {/* 收藏和草稿各由自己的回调修改，不能互相代替。 */}
      {/* ArtistFilters不接收生成模型，不会将画师当作本地LoRA。 */}
      {/* 普通分类仍传category和onCategoryChange，原筛选契约保留。 */}
      {/* selectedCount来自完整草稿，与当前过滤后可见数量无关。 */}
      {/* 侧栏顶部已选入口只挂载一次，不随专用筛选重复渲染。 */}
      <TagCategorySidebar
        // 界面：背景场景与特征填入同一个侧栏父组件，避免覆盖式浮层。
        // 选择分类立即退出已选视图，让用户看到条件实际命中的结果。
        // 返回第一页并滚动到顶部，避免筛完落在不存在的旧页码。
        classification={library.id === "artist" ? <ArtistFilters count={library.items.length} group={artistGroup} sort={artistSort} selectedIds={selectedIds} onGroup={next => { setFavoritesOnly(false); setArtistGroup(next); setSelectedOnly(false); setPage(1); if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0; }} onSort={next => { setArtistSort(next); if (next === "random") setShuffleSeed(Math.floor(Math.random() * 0x100000000)); setPage(1); }} /> : library.id === "background" ? <BackgroundFilters items={library.items} filters={backgroundFilters} onChange={next => { setBackgroundFilters(next); setSelectedOnly(false); setPage(1); if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0; }} /> : undefined}
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

{/* 界面：所有库共用滚动主区、主题底色与固定分页，不再独立维护内部布局。 */}
      {/* 共享主区接收分页节点，不把每个资料库的分页重新定位到浮层。 */}
      {/* 只有多于一页才显示分页，不为短结果保留空白条。 */}
      {/* currentPage已限制在有效页数内，删除收藏或分组后不会显示不存在页。 */}
      {/* count是本页可见数，total是过滤后的全集，两个值不能混淆。 */}
      {/* 单位由库配置给出，画师与动作不用相同的生硬称呼。 */}
      {/* testIdPrefix保留各库已有定位属性，便于独立回归分类与应用。 */}
      {/* 文字模式只替换网格内容，搜索、多选、分页和侧栏仍然共享。 */}
      {/* 文字模式也使用主题背景，避免切模式后重新出现白底。 */}
      {/* 空态使用相同border和background，不单独硬编码浅色占位卡。 */}
      {/* 空选择与没有搜索结果采用不同提示，用户才能知道应该取消什么条件。 */}
      {/* 网格列数保留响应式2到4列，卡片内部比例由LibraryCard统一控制。 */}
      {/* 每个条目使用源id作为key，不以当前页下标识别选择。 */}
      {/* 卡片选择以selectedIds判断，不因收藏状态而自动打勾。 */}
      {/* 五个库都注入收藏回调，心形状态与当前选择草稿分别保存。 */}
      {/* 画师的badge与metric作为可选槽值，角色专有内容无需了解画师字段。 */}
      {/* 缺少指标时用明确的零值，不显示undefined或NaN。 */}
      {/* 独特性小数只在展示时格式化，排序仍使用未截断的原始值。 */}
      {/* 名称和tag应用仍由buildTagPrompt处理，共享卡片不拼接提示词。 */}
      {/* 预览失败只影响图片展示，不阻止选择、搜索或收藏。 */}
      {/* 浅色和深色都读取实时变量，关闭重开弹窗不是主题生效的前置条件。 */}
      {/* 子卡片不拥有整个资料库状态，避免每张卡片维护重复选择集合。 */}
      {/* 所有静态库经这一个map渲染，所以后续修卡片只需改一处。 */}
      {/* 角色虽然有独立查询器，但最终也进入同一个LibraryCard。 */}
      {/* 资料适配器负责字段差异，共用UI负责可见结构，二者职责明确。 */}
      {/* 此处未增加生成、上传或联网请求，选择确认仍走原onApply入口。 */}
      {/* 用户取消只关闭弹窗，不意外提交当前选择到提示词。 */}
      {/* 底部按钮仍由外壳固定，共用主区滚动不会遮挡确认操作。 */}
        <LibraryResults prefix={prefix} scrollRef={scrollAreaRef} pagination={pages > 1 ? (
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
        ) : undefined}>
          {visible.length === 0 ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-border bg-background px-6 text-center text-sm text-muted-foreground">
              {selectedOnly
                ? t("characters.tagLibrary.emptySelected", { unit: unitLabel })
                : t("characters.tagLibrary.empty")}
            </div>
          ) : (
            <div
              {...{ [`data-${prefix}-grid`]: "true" }}
              className={
                displayMode === "text"
                  ? "flex content-start flex-wrap gap-2"
                  : "grid grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:grid-cols-4"
              }
            >
              {visible.map(item => (
                  <TagLibraryCard
                    key={item.id}
                    item={item}
                    displayMode={displayMode}
                    prefix={prefix}
                    selected={selectedIds.includes(item.id)}
                    onOpen={() => toggleItem(item)}
                    // 各库收藏和指标作为参数进入同一卡片；条目身份由外层提供。
                    // 计数与分数均来自参考元数据，不把文件大小等信息冒充画师质量。
                    // 回调只切收藏，不改变当前生成提示词的已选草稿。
                    favorite={favoriteIds.includes(item.id)}
                    onToggleFavorite={() => toggleFavorite(item)}
                    badge={library.id === "artist" ? t("characters.artist.works", { count: ARTIST_METADATA.get(item.id)?.post_count ?? 0 }) : undefined}
                    metric={library.id === "artist" ? t("characters.artist.unique", { score: (ARTIST_METADATA.get(item.id)?.uniqueness_score ?? 0).toFixed(1) }) : undefined}
                  />
              ))}
            </div>
          )}
        </LibraryResults>
    </ResourceDialogShell>
  );
}


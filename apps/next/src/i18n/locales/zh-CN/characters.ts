/**
 * 角色选择器与静态标签库（`view/create/characters/**`、`view/create/tagLibrary/**`、
 * `CharacterPickerDialog`）词条。
 * 命名约定：`characters.<语义>` / `characters.tagLibrary.<语义>`。
 *
 * `toolbar.*` / `card.*` / `pagination.*` 由**角色选择器与静态标签库共用** ——
 * 后者刻意复用前者同一套 UI 排版，两边文案逐字相同，因此不重复登记。
 * 卡片里的条目名（角色名 / 动作名 / 背景名 / Tags）是数据不是文案，不进词条表。
 */
export const characters = {
  picker: {
    title: "选择角色",
    loadFailed: "角色库加载失败",
    selectRequired: "请先选择角色",
    copied: "已复制 {count} 个角色的触发词",
    allWorks: "全部作品",
    searchSuffix: " · 搜索「{query}」",
    totalPrefix: " · 共",
    roleUnit: " 个角色",
    selectedPrefix: "已选择 ",
    applyTrigger: "应用触发词",
    applyBoth: "触发词+Tags",
    emptyFavorites: "还没有收藏任何角色",
    emptySelected: "还没有选择任何角色",
    emptyLetter: "当前结果中没有以「{letter}」开头的角色",
    empty: "没有找到匹配的角色",
  },
  detail: {
    copiedTrigger: "已复制触发词",
    copyFailedManual: "复制失败，请手动选择文本",
    copiedTags: "已复制 {count} 个标签",
    tagUnit: " 个标签",
    unknownWork: "未知作品",
    noPreview: "无预览图",
    triggerLabel: "Trigger · 触发词",
    noTrigger: "（该角色暂无触发词）",
    noLora: "该角色暂无可用 LoRA",
    noTags: "暂无标签",
    insertPrompt: "插入提示词",
    copyTrigger: "复制触发词",
    copyAllTags: "复制全部标签",
    unfavorite: "取消收藏",
    favorite: "收藏角色",
    heat: "热度 ",
    rating: "评分 ",
  },
  card: {
    select: "选择 {name}",
    noPreview: "无预览图",
    unknownWork: "未知作品",
    unfavorite: "取消收藏 {name}",
    favorite: "收藏 {name}",
    viewDetail: "查看 {name} 详情",
  },
  toolbar: {
    searchLabel: "搜索角色",
    searchPlaceholder: "角色名 / 触发词..",
    sort: "排序",
    sortHot: "热度",
    sortLatest: "最新",
    multi: "多选",
    single: "单选",
    copySelected: "复制已选",
    onlySelected: "只看已选",
    clearSelected: "清除已选",
  },
  filterSidebar: {
    letterHint: "按名称首字母筛选当前结果",
    letter: "字母",
    all: "全",
    favorites: "收藏",
    favoritesOnly: "只看收藏（{count}）",
    selectedOnly: "只看已选（{count}）",
    copyrights: "作品",
  },
  pagination: {
    ariaLabel: "分页",
    totalPrefix: "共 ",
    unitSuffix: " 个",
    rangePrefix: "显示第 ",
    pageSuffix: " 页",
    pageInputLabel: "跳转到指定页",
    first: "首页",
    prev: "上一页",
    next: "下一页",
    last: "尾页",
    /** 条目单位（可选 prop 的回退值，动作库等传 tagLibrary.pose.unitLabel） */
    itemLabelDefault: "角色",
  },
  tagLibrary: {
    // 弹窗标题 / 条目单位 / 搜索框占位不在这里：它们随库配置走，
    // 词条在 `taxonomy.tagLibraries.*`（`data/tagLibraries.ts` 存 key）
    searchLabel: "搜索{label}",
    sortDefault: "默认",
    sortAz: "A-Z",
    allCategories: "全部分类",
    allCategoriesCount: "全部分类（{count}）",
    selected: "已选",
    selectedOnlyCount: "只看已选（{count}）",
    selectRequired: "请先选择{unit}",
    copied: "已复制 {count} 个{unit}的 Tags",
    searchSuffix: " · 搜索「{query}」",
    totalPrefix: " · 共",
    totalUnit: " 个",
    selectedPrefix: "已选择",
    selectedUnit: "个",
    apply: "应用 Tags",
    emptySelected: "还没有选择任何{unit}",
    empty: "没有找到匹配的结果",
    uncategorized: "未分类",
    /** 左侧「分类」区标题（可选 prop 的回退值） */
    sectionTitleDefault: "分类",
  },
} as const;

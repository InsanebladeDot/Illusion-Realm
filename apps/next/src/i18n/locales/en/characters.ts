/**
 * English catalogue — **结构与 zh-CN 完全一致**（由 apps/next/scripts/mirror-locale.mjs 生成）。
 *
 * 现状：值仍与 zh-CN 相同（镜像），翻译按命名空间增量推进。
 * 未翻译数量由 apps/next/scripts/check-i18n-en.mjs 的 ratchet 盯着（只减不增），
 * 因此「翻了哪些」是可以机检的数字，不靠人记。
 */
export const characters = {
  favorites: {"view": "Favorites {count}", "export": "Export favorites", "exportHint": "Export favorites from every library as one JSON file", "exportFailed": "Could not start exporting favorites. Please try again.", "missingSnapshots": "{count} older online favorites have no saved details. Find them in the original library and favorite them again; their IDs remain in the export."},
  artist: {
  "title": "Artist library",
  "unit": "artist",
  "search": "Artist name…",
  "all": "All artists",
  "collections": "My collections",
  "favorites": "Favorites",
  "newGroup": "New group",
  "groupName": "Group name",
  "rename": "Rename group",
  "deleteGroup": "Delete group (keep favorites)",
  "addSelected": "Add selected to this group",
  "removeSelected": "Remove selected from this group",
  "hint": "Names, work counts and uniqueness scores are local reference data. Previews load online on demand. Deleting a group keeps its artists in favorites.",
  "applied": "Applied to artist style",
  "works": "Works: {count}",
  "unique": "Uniqueness: {score}",
  "sort": {
    "works-desc": "Works ↓",
    "works-asc": "Works ↑",
    "unique-desc": "Uniqueness ↓",
    "unique-asc": "Uniqueness ↑",
    "name-asc": "Name A–Z",
    "name-desc": "Name Z–A",
    "random": "Random"
  }
},

  facets: { clear: "Clear category filters" },
  background: {
    categories: "Scene categories", traits: "Traits",
    nature: "Nature & Outdoors", urban: "Urban & Daily", fantasy: "Fantasy & Sci-Fi", minimalist: "Minimalist & Abstract",
    hint: "Match any selected scene and all selected traits. Filters and counts use local data; preview images load from their original online URLs.",
  },
  reference: {
    source: "Character library source", local: "Local filters · Online details", online: "Online library",
    copyright: "Popular franchises", gender: "Gender", hair: "Hair color", eye: "Eye color", all: "All",
    hint: "Filters and counts use local reference data; opening details matches online images and information.",
    searchWorks: "Search works", female: "One female (1girl)", male: "One male (1boy)",
    onlineLoading: "Matching online details…", onlineUnavailable: "Online details are unavailable; local reference retained.", onlineMissing: "No online character matched both name and work; local reference retained.",
    colors: { black: "Black", blonde: "Blonde", white: "White / Silver", brown: "Brown", blue: "Blue", pink: "Pink", red: "Red", purple: "Purple", green: "Green", yellow: "Yellow / Gold" },
  },

  "picker": {
    "title": "选择角色",
    "loadFailed": "角色库加载失败",
    "selectRequired": "请先选择角色",
    "copied": "已复制 {count} 个角色的触发词",
    "allWorks": "全部作品",
    "searchSuffix": " · 搜索「{query}」",
    "totalPrefix": " · 共",
    "roleUnit": " 个角色",
    "selectedPrefix": "已选择 ",
    "applyTrigger": "应用触发词",
    "applyBoth": "触发词+Tags",
    "emptyFavorites": "还没有收藏任何角色",
    "emptySelected": "还没有选择任何角色",
    "emptyLetter": "当前结果中没有以「{letter}」开头的角色",
    "empty": "没有找到匹配的角色"
  },
  "detail": {
    "copiedTrigger": "已复制触发词",
    "copyFailedManual": "复制失败，请手动选择文本",
    "copiedTags": "已复制 {count} 个标签",
    "tagUnit": " 个标签",
    "unknownWork": "未知作品",
    "noPreview": "无预览图",
    "triggerLabel": "Trigger · 触发词",
    "noTrigger": "（该角色暂无触发词）",
    "noLora": "该角色暂无可用 LoRA",
    "noTags": "暂无标签",
    "insertPrompt": "插入提示词",
    "copyTrigger": "复制触发词",
    "copyAllTags": "复制全部标签",
    "unfavorite": "取消收藏",
    "favorite": "收藏角色",
    "heat": "热度 ",
    "rating": "评分 "
  },
  "card": {
    "select": "选择 {name}",
    "noPreview": "无预览图",
    "unknownWork": "未知作品",
    "unfavorite": "取消收藏 {name}",
    "favorite": "收藏 {name}",
    "viewDetail": "查看 {name} 详情"
  },
  "toolbar": {
    "searchLabel": "搜索角色",
    "searchPlaceholder": "角色名 / 触发词..",
    "sort": "排序",
    "sortHot": "热度",
    "sortLatest": "最新",
    "multi": "多选",
    "single": "单选",
    "copySelected": "复制已选",
    "onlySelected": "只看已选",
    "clearSelected": "清除已选"
  },
  "filterSidebar": {
    "letterHint": "按名称首字母筛选当前结果",
    "letter": "字母",
    "all": "全",
    "favorites": "收藏",
    "favoritesOnly": "只看收藏（{count}）",
    "selectedOnly": "只看已选（{count}）",
    "copyrights": "作品"
  },
  "pagination": {
    "ariaLabel": "分页",
    "totalPrefix": "共 ",
    "unitSuffix": " 个",
    "rangePrefix": "显示第 ",
    "pageSuffix": " 页",
    "pageInputLabel": "跳转到指定页",
    "first": "首页",
    "prev": "上一页",
    "next": "下一页",
    "last": "尾页",
    "itemLabelDefault": "角色"
  },
  "tagLibrary": {
    "searchLabel": "搜索{label}",
    "sortDefault": "默认",
    "sortAz": "A-Z",
    "allCategories": "全部分类",
    "allCategoriesCount": "全部分类（{count}）",
    "selected": "已选",
    "selectedOnlyCount": "只看已选（{count}）",
    "selectRequired": "请先选择{unit}",
    "copied": "已复制 {count} 个{unit}的 Tags",
    "searchSuffix": " · 搜索「{query}」",
    "totalPrefix": " · 共",
    "totalUnit": " 个",
    "selectedPrefix": "已选择",
    "selectedUnit": "个",
    "apply": "应用 Tags",
    "emptySelected": "还没有选择任何{unit}",
    "empty": "没有找到匹配的结果",
    "uncategorized": "未分类",
    "displayModeLabel": "显示方式",
    "cardMode": "卡片",
    "textMode": "仅文本",
    "sectionTitleDefault": "分类"
  }
} as const;

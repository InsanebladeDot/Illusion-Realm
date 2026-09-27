/**
 * 分类与筛选项文案（`src/data/**` 里的**界面标签**）。
 *
 * 注意边界：这里只放界面 chrome（分类 Tab 名、筛选项名、系列名、教程标题），
 * 素材内容本身（画作标题、角色名、字体名、标签数据集条目）属于内容数据，不进词条表。
 * 命名约定：`taxonomy.<领域>.<语义>`。
 */
export const taxonomy = {
  characterFilters: {
    /** 作品筛选（`CHARACTER_COPYRIGHT_FILTERS`，按 slug 过滤 animadex 结果） */
    copyright: {
      all: "全部作品",
      vocaloid: "Vocaloid",
      touhou: "东方 Project",
      genshinImpact: "原神",
      honkaiStarRail: "崩坏：星穹铁道",
      blueArchive: "蔚蓝档案",
      hololive: "Hololive",
      azurLane: "碧蓝航线",
      fateGrandOrder: "Fate/Grand Order",
      nikke: "胜利女神：妮姬",
      arknights: "明日方舟",
      projectSekai: "世界计划",
      girlsFrontline: "少女前线",
      idolmaster: "偶像大师",
      kantaiCollection: "舰队 Collection",
    },
    // 排序文案不在这里：真正渲染的是 toolbar 里的
    // `characters.toolbar.sortHot` / `sortLatest`；原 `CHARACTER_SORT_OPTIONS`
    // 那份配置全仓库无消费者，已随死代码一并删除
  },
  /** 模型系列说明（`MODEL_SERIES[].description`） */
  modelSeries: {
    sdxl: {
      description: "基于 SDXL 架构的社区训练模型",
      tipsTitle: "SDXL 使用技巧",
      tip1: "使用 booru 风格标签：1girl, smile, outdoors",
    },
    anima: {
      description: "基于 Anima 的新一代动漫模型，由 Comfy Org 和 Circlestone Labs 打造",
      tipsTitle: "Anima 使用技巧",
      tip1: "可自由混用自然语言和 booru 标签",
    },
  },
  /** 扩展卡片 */
  extensions: {
    /** 按 id 找不到扩展时的兜底名字 */
    unknown: "未知扩展",
  },
  /** 提示词教程入口标题（`PROMPT_GUIDES[].title`） */
  promptGuides: {
    anima: {
      title: "如何为 Anima 编写提示词？",
    },
    sdxl: {
      title: "如何为 SDXL 编写提示词？",
    },
  },
  /** 高级组装的 8 大分类 Tab 名（`DEFAULT_PROMPT_TABS[].label`） */
  promptTabs: {
    quality: "质量词",
    shot: "镜头视图",
    style: "画师风格",
    character: "角色",
    outfit: "服饰",
    pose: "姿势",
    expression: "表情",
    background: "背景",
  },
  /** 静态标签库的标题 / 条目单位 / 搜索占位（`TAG_LIBRARY_DEFINITIONS`） */
  tagLibraries: {
    pose: {
      title: "动作库",
      unitLabel: "动作",
      searchPlaceholder: "动作名 / 标签..",
    },
    background: {
      title: "背景库",
      unitLabel: "背景",
      searchPlaceholder: "背景名 / 标签..",
    },
    expression: {
      title: "表情库",
      unitLabel: "表情",
      searchPlaceholder: "表情名 / 标签..",
    },
  },
} as const;

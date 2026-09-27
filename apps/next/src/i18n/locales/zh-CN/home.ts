/**
 * 首页（`view/home/**` + `utils/galleryDetail.ts`）词条。
 * 命名约定：`home.<组件名>.<语义>`，例如 `home.detailDialog.remix`。
 *
 * 注意：`utils/galleryDetail.ts` 是首页专用工具，故其词条也登记在本表
 * （`home.relativeTime.*`）；画作标题 / 描述属于内容数据，不入表。
 */
export const home = {
  /** 首页概念页（分层：背景 / 装饰 / 品牌 / 功能卡） */
  hero: {
    studio: "拾光制作组 · SHIGUANG STUDIO",
    title: "Illusion Realm",
    tagline: "让灵感，成为看得见的世界。",
    about:
      "Illusion Realm 是一款面向 AI 创作者的图片与视频创作工具。通过丰富的模型选择、便捷的创作流程与灵活的作品管理，让灵感从构思走向成品。",
    imageCard: {
      title: "图片创作",
      description: "开启你的插画创作",
    },
    videoCard: {
      title: "视频创作",
      description: "让画面动起来",
    },
    explore: "探索更多功能",
  },
  detailDialog: {
    copiedLabel: "{label}已复制",
    copyLabel: "复制{label}",
    tags: "标签",
    tagFilterNotImplemented: "标签「{tag}」筛选暂未开发",
    fullscreen: "全屏查看",
    fullscreenNotImplemented: "全屏查看暂未开发",
    prevImage: "上一张",
    nextImage: "下一张",
    follow: "关注",
    followNotImplemented: "关注功能暂未开发",
    likeNotImplemented: "点赞功能暂未开发",
    generatedData: "生成数据",
    remix: "二创",
    remixNotImplemented: "二创功能暂未开发",
    model: "模型",
    prompt: "提示词",
    negativePrompt: "反向提示词",
    seed: "种子",
    steps: "步数",
    cfgRatio: "CFG 比例",
    sampler: "采样器",
    moreFrom: "更多来自",
  },
  gallery: {
    sortPublishedAt: "发布时间",
    sortLikes: "最多赞",
    sortReferences: "最多引用",
    sortScore: "最多评分",
    orderAsc: "正序",
    orderDesc: "倒序",
    timeDay: "日",
    timeWeek: "周",
    timeMonth: "月",
    timeAll: "全部",
  },
  card: {
    promptCopied: "提示词已复制",
    like: "点赞",
    likeNotImplemented: "点赞功能暂未开发",
    favorite: "收藏",
    favoriteNotImplemented: "收藏功能暂未开发",
    copyPrompt: "复制提示词",
  },
  waterfall: {
    empty: "暂无匹配的作品",
  },
  searchBox: {
    scopeAll: "全参",
    scopeName: "姓名",
    scopeSwitchLabel: "搜索范围：{scope}，点击切换",
  },
  relativeTime: {
    justNow: "刚刚",
    minutesAgo: "{minutes} 分钟前",
    hoursAgo: "{hours} 小时前",
    daysAgo: "{days} 天前",
    monthsAgo: "{months} 个月前",
    yearsAgo: "{years} 年前",
  },
} as const;

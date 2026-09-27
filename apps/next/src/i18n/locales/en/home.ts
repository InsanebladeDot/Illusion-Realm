/**
 * English catalogue — **结构与 zh-CN 完全一致**（由 apps/next/scripts/mirror-locale.mjs 生成）。
 *
 * 现状：值仍与 zh-CN 相同（镜像），翻译按命名空间增量推进。
 * 未翻译数量由 apps/next/scripts/check-i18n-en.mjs 的 ratchet 盯着（只减不增），
 * 因此「翻了哪些」是可以机检的数字，不靠人记。
 */
export const home = {
  "hero": {
    "studio": "SHIGUANG STUDIO",
    "title": "Illusion Realm",
    "tagline": "Where inspiration becomes a world you can see.",
    "about":
      "Illusion Realm is an image and video creation tool for AI creators — rich model choice, a short path from idea to output, and flexible ways to manage your work.",
    "imageCard": {
      "title": "Image creation",
      "description": "Start an illustration"
    },
    "videoCard": {
      "title": "Video creation",
      "description": "Make the picture move"
    },
    "explore": "Explore more features"
  },
  "detailDialog": {
    "copiedLabel": "{label}已复制",
    "copyLabel": "复制{label}",
    "tags": "标签",
    "tagFilterNotImplemented": "标签「{tag}」筛选暂未开发",
    "fullscreen": "全屏查看",
    "fullscreenNotImplemented": "全屏查看暂未开发",
    "prevImage": "上一张",
    "nextImage": "下一张",
    "follow": "关注",
    "followNotImplemented": "关注功能暂未开发",
    "likeNotImplemented": "点赞功能暂未开发",
    "generatedData": "生成数据",
    "remix": "二创",
    "remixNotImplemented": "二创功能暂未开发",
    "model": "模型",
    "prompt": "提示词",
    "negativePrompt": "反向提示词",
    "seed": "种子",
    "steps": "步数",
    "cfgRatio": "CFG 比例",
    "sampler": "采样器",
    "moreFrom": "更多来自"
  },
  "gallery": {
    "sortPublishedAt": "发布时间",
    "sortLikes": "最多赞",
    "sortReferences": "最多引用",
    "sortScore": "最多评分",
    "orderAsc": "正序",
    "orderDesc": "倒序",
    "timeDay": "日",
    "timeWeek": "周",
    "timeMonth": "月",
    "timeAll": "全部"
  },
  "card": {
    "promptCopied": "提示词已复制",
    "like": "点赞",
    "likeNotImplemented": "点赞功能暂未开发",
    "favorite": "收藏",
    "favoriteNotImplemented": "收藏功能暂未开发",
    "copyPrompt": "复制提示词"
  },
  "waterfall": {
    "empty": "暂无匹配的作品"
  },
  "searchBox": {
    "scopeAll": "全参",
    "scopeName": "姓名",
    "scopeSwitchLabel": "搜索范围：{scope}，点击切换"
  },
  "relativeTime": {
    "justNow": "刚刚",
    "minutesAgo": "{minutes} 分钟前",
    "hoursAgo": "{hours} 小时前",
    "daysAgo": "{days} 天前",
    "monthsAgo": "{months} 个月前",
    "yearsAgo": "{years} 年前"
  }
} as const;

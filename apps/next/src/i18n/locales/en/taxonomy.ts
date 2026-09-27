/**
 * English catalogue — **结构与 zh-CN 完全一致**（由 apps/next/scripts/mirror-locale.mjs 生成）。
 *
 * 现状：值仍与 zh-CN 相同（镜像），翻译按命名空间增量推进。
 * 未翻译数量由 apps/next/scripts/check-i18n-en.mjs 的 ratchet 盯着（只减不增），
 * 因此「翻了哪些」是可以机检的数字，不靠人记。
 */
export const taxonomy = {
  "characterFilters": {
    "copyright": {
      "all": "全部作品",
      "vocaloid": "Vocaloid",
      "touhou": "东方 Project",
      "genshinImpact": "原神",
      "honkaiStarRail": "崩坏：星穹铁道",
      "blueArchive": "蔚蓝档案",
      "hololive": "Hololive",
      "azurLane": "碧蓝航线",
      "fateGrandOrder": "Fate/Grand Order",
      "nikke": "胜利女神：妮姬",
      "arknights": "明日方舟",
      "projectSekai": "世界计划",
      "girlsFrontline": "少女前线",
      "idolmaster": "偶像大师",
      "kantaiCollection": "舰队 Collection"
    }
  },
  "modelSeries": {
    "sdxl": {
      "description": "基于 SDXL 架构的社区训练模型",
      "tipsTitle": "SDXL 使用技巧",
      "tip1": "使用 booru 风格标签：1girl, smile, outdoors"
    },
    "anima": {
      "description": "基于 Anima 的新一代动漫模型，由 Comfy Org 和 Circlestone Labs 打造",
      "tipsTitle": "Anima 使用技巧",
      "tip1": "可自由混用自然语言和 booru 标签"
    }
  },
  "extensions": {
    "unknown": "未知扩展"
  },
  "promptGuides": {
    "anima": {
      "title": "如何为 Anima 编写提示词？"
    },
    "sdxl": {
      "title": "如何为 SDXL 编写提示词？"
    }
  },
  "promptTabs": {
    "quality": "质量词",
    "shot": "镜头视图",
    "style": "画师风格",
    "character": "角色",
    "outfit": "服饰",
    "pose": "姿势",
    "expression": "Expression",
    "background": "背景"
  },
  "tagLibraries": {
    "pose": {
      "title": "动作库",
      "unitLabel": "动作",
      "searchPlaceholder": "动作名 / 标签.."
    },
    "background": {
      "title": "背景库",
      "unitLabel": "背景",
      "searchPlaceholder": "背景名 / 标签.."
    },
    "expression": {
      "title": "Expression Library",
      "unitLabel": "expression",
      "searchPlaceholder": "Expression name / tag.."
    }
  }
} as const;

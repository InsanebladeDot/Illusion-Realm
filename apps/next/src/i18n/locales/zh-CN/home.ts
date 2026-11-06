/**
 * 首页概念页（`view/home/HomeHero.tsx`）词条。
 * 仅保留当前首页使用的品牌介绍和创作入口文案。
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

} as const;

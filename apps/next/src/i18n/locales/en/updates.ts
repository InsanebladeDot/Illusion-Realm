/**
 * English catalogue — **结构与 zh-CN 完全一致**（由 apps/next/scripts/mirror-locale.mjs 生成）。
 *
 * 现状：值仍与 zh-CN 相同（镜像），翻译按命名空间增量推进。
 * 未翻译数量由 apps/next/scripts/check-i18n-en.mjs 的 ratchet 盯着（只减不增），
 * 因此「翻了哪些」是可以机检的数字，不靠人记。
 */
export const updates = {
  "title": "更新公告",
  "page": {
    "loadFailed": "加载更新公告失败",
    "syncedPrefix": "内容与项目根目录 ",
    "syncedSuffix": " 同步",
    "empty": "暂无更新记录",
    "latest": "最新"
  },
  "announcement": {
    "viewAll": "查看全部更新",
    "dismiss": "知道了"
  },
  "errors": {
    "loadFailed": "无法加载更新公告（{status}）"
  }
} as const;

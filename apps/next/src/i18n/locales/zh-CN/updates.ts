/**
 * 更新日志页（`view/updates/**` + `utils/changelog.ts`）词条。
 * 命名约定：`updates.<语义>`，例如 `updates.empty`。
 *
 * 注意：`logs.md` 的章节标题与正文来自项目根目录的 Markdown，属于数据，不入表。
 */
export const updates = {
  title: "更新公告",
  page: {
    loadFailed: "加载更新公告失败",
    syncedPrefix: "内容与项目根目录 ",
    syncedSuffix: " 同步",
    empty: "暂无更新记录",
    latest: "最新",
  },
  announcement: {
    viewAll: "查看全部更新",
    dismiss: "知道了",
  },
  errors: {
    loadFailed: "无法加载更新公告（{status}）",
  },
} as const;

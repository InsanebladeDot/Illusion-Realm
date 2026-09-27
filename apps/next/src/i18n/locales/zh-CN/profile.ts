/**
 * 我的主页（`view/profile/**` + `utils/profile.ts`）词条。
 * 命名约定：`profile.<语义>`，例如 `profile.edit.bio`。
 */
export const profile = {
  edit: {
    title: "编辑公开资料",
    description: "更新你的个人资料，所有人可见。",
    avatarLabel: "头像",
    avatarPreviewAlt: "头像预览",
    uploadAvatar: "上传新头像",
    avatarHint: "JPG、PNG 或 GIF，最大 10MB。",
    uploadFailed: "上传失败",
    bioLabel: "简介（显示在个人主页）",
    bioPlaceholder: "介绍一下你自己…",
    bioCounterUnit: " 字符",
    socialLabel: "社交媒体",
    addSocial: "添加社交媒体",
    saved: "公开资料已保存",
    save: "保存更改",
  },
  stats: {
    posts: "帖子",
    followers: "粉丝",
    following: "已关注",
  },
  tabs: {
    emptyPostsTitle: "暂无帖子",
    emptyPostsDescription: "你还没有创建任何帖子。",
    goCreate: "去创建",
    emptyPrefix: "暂无",
    comingSoon: "此区域内容即将推出。",
    fallbackLabel: "内容",
    ariaLabel: "个人主页内容",
    privateOnly: "仅自己可见",
    allPosts: "全部帖子",
    gridView: "网格视图",
    listView: "列表视图",
  },
  errors: {
    invalidImageType: "请选择图片文件",
    imageTooLarge: "图片大小不能超过 10MB",
    readFailed: "读取图片失败",
  },
} as const;

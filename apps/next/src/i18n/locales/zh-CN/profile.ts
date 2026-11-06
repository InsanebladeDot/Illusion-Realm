/**
 * 我的主页（`view/profile/**` + `utils/profile.ts`）词条。
 * 命名约定：`profile.<语义>`，例如 `profile.edit.bio`。
 */
export const profile = {
  /*
   * 生成统计文案的语义边界：
   * 本地记录与账户云端历史明确区分，不能继续提示所有统计均未接入。
   * 主模型与 LoRA 共用选择器，词条值变化不改变持久化 role 枚举。
   * 平均耗时的秒单位由插值组合，数字格式仍由界面控制。
   * 积分未知继续使用原空值，不提供从本地推理次数估算积分的文案。
   * 保存失败提示只说明统计记录问题，避免误导用户重新生成已保存图片。
   */
  ui: {
    mainModels: "主要模型", loraModels: "LoRA 模型", modelRole: "模型使用分类", modelTotals: "主要模型 {main} · LoRA {lora}", seconds: "{value} 秒", attempts: "已统计 {count} 次任务", outcomes: "生成结果分布", imageUnit: "单位：张", historySaveFailed: "图片任务已结束，但统计记录保存失败，请检查用户数据目录后重试。",
    sample: "界面样例", actual: "实际内容", sampleHint: "当前为界面样例，互动仅在本页生效，不会写入账户。", actualHint: "显示实际资料与本机图片统计；帖子服务尚未接入。",
    edit: "编辑资料", quoteFirst: "你所想象的，", quoteLast: "终会在这里相遇。", defaultBio: "在幻想的世界里，遇见更好的自己。", level: "Lv.3", likesTotal: "获赞",
    posts: "帖子", likes: "喜欢", privatePosts: "仅自己可见", private: "私密统计", cloudImages: "云端图片", cloudCollections: "收藏夹", comments: "评论", received: "收到的评论",
    all: "全部", art: "绘画作品", notes: "创作心得", daily: "日常分享", newest: "最新发布", oldest: "最早发布", popular: "最多喜欢", sort: "帖子排序", category: "帖子分类",
    empty: "暂无符合条件的内容", sampleEmpty: "可以先在帖子中喜欢一张作品，再返回查看。", more: "更多操作", like: "喜欢 {title}", comment: "评论 {title}", save: "收藏", unsave: "取消收藏", privateAction: "设为仅自己可见样例", publicAction: "设为公开样例", detail: "查看详情", saved: "本页样例状态已更新", commentPlaceholder: "分享你的想法…", submit: "发表演示评论", commentHint: "评论仅保存在本页，刷新后清空。",
    post1: "水面之下的少女", post2: "关于 LoRA 训练的一些记录", post3: "紫色的梦境", post4: "新模型测试", post5: "午后的阳光", post6: "关于提示词的思考",
    description1: "尝试了新的光影风格，感觉还不错～", description2: "分享一下这次风格 LoRA 训练的参数和效果对比，可能对大家有帮助。", description3: "最近很喜欢这种冷色调与柔光的感觉，分享一张～", description4: "今天试了新模型，效果很棒！", description5: "好久没画这种清新风格了，感觉很治愈～", description6: "整理了一些常用的 tag，分享给大家参考～",
    myData: "我的数据", creations: "创作作品", totalLikes: "获得点赞", published: "发布帖子", followers: "粉丝数", following: "关注数", privateHint: "仅自己可见", recentActivity: "最近动态", seeAll: "查看全部", shortcuts: "快捷入口", myWorks: "我的作品", myCollections: "我的收藏", settings: "设置", promo: "与更多创作者", promoHint: "一起探索 AI 的无限可能", create: "去创作", activity1: "发布了新帖子《水面之下的少女》", activity2: "收藏了 1 张图片", activity3: "喜欢了 1 张图片", activity4: "上传了 1 张云端图片", activityTime1: "2 小时前", activityTime2: "5 小时前", activityTime3: "昨天 20:34", activityTime4: "昨天 16:20", noActivity: "暂无可展示的动态",
    statsHint: "仅自己可见的数据，记录你的创作与使用情况", range: "统计周期", days7: "近 7 天", days30: "近 30 天", total: "生成总数", success: "成功率", duration: "平均生成时长", models: "使用模型", points: "累计积分", previous: "较上期 {value}", primaryModel: "主用：animaBase", unavailable: "暂无统计", trend: "创作趋势", count: "生成数", countUnit: "单位：次", percentUnit: "单位：%", distribution: "分布统计", person: "人物", scene: "场景", illustration: "插画", other: "其他", totalLabel: "总数", modelUsage: "模型使用占比", otherModels: "其他模型", peak: "创作高峰时段", hour: "{hour}时", today: "今日使用情况", generate: "生成", times: "{count} 次", imageGeneration: "图片生成", videoGeneration: "视频生成", modelCalls: "模型调用", encouragement: "今天也很棒呢！", recentCreations: "最近创作记录", moreRecords: "查看更多", details: "查看明细", chartHint: "展示数据；实际统计尚未接入。", todayHint: "演示数值。正式统计需区分图片生成、视频生成与模型调用，避免重复计数。", actualStats: "仅统计本机启用记录后的图片任务。手动停止不参与统计；ComfyUI 异常计失败；耗时含准备、生成与保存，不含排队。历史图片、音视频及外部工具未纳入，积分未知。",
  },
  collections: {
    all: "全部", character: "角色", scene: "场景", illustration: "插画", work: "作品", other: "其他",
    categories: "收藏夹分类", search: "搜索收藏的内容…", sort: "收藏排序", newest: "最近收藏", oldest: "最早收藏", recent: "最近收藏", manage: "管理", reset: "恢复全部样例", clear: "清除筛选", remove: "取消收藏 {title}",
    sampleHint: "这里展示 8 条收藏样例，分类数量按当前保留的样例计算。取消收藏和喜欢仅在本页生效；实际内容中的云端收藏夹仍由原有账户服务管理。",
    encouragement: "你的收藏，都是热爱的证明～", title7: "樱花下的约定", title8: "幻想的远方",
    tags1: "# 原创角色　# 清新　# 蓝色系", tags2: "# 城市　# 夜景　# 赛博氛围", tags3: "# 少女　# 花　# 梦幻", tags4: "# 角色　# 双人　# 试验",
    tags5: "# 角色　# 阳光　# 清新", tags6: "# 角色　# 夜景　# 情绪", tags7: "# 少女　# 樱花　# 春天", tags8: "# 风景　# 远景　# 治愈",
  },
  cover: { change: "预览封面", reset: "重置封面", preview: "主页封面预览", hint: "仅当前页面预览，刷新后不保留" },
  cloud: {
    resourceScope: "资源范围", mine: "我的", publicLibrary: "公开", myImages: "我的图片", publicImages: "公开图片", myCollections: "我的收藏夹", publicCollections: "公开收藏夹", refresh: "刷新",
    editImage: "编辑图片", deleteImage: "删除图片", save: "保存", createCollection: "新建收藏夹", editCollection: "管理收藏夹", deleteCollection: "删除收藏夹",
    collectionName: "收藏夹名称", description: "说明（选填）", addToCollection: "加入收藏夹", chooseCollection: "选择我的收藏夹", collected: "已加入收藏夹", removeFromCollection: "取消收藏",
    noCollections: "暂无收藏夹", createFirst: "你还没有收藏夹，请先到云端收藏夹中创建。", collectionPrivacy: "公开收藏夹不会公开其中的私有图片。取消收藏或删除收藏夹均不会删除原图。",
    deleteImageHint: "我已知晓：此操作删除云端图片记录并停止 API 访问，但不保证图床直链文件被物理删除。",
    deleteCollectionHint: "我已知晓：此操作删除收藏夹，原图片仍会保留。",
    images: "云端图片", imagesDescription: "管理、分享与整理你的创作素材", manageImages: "管理你的图片素材", collections: "收藏夹", upload: "上传图片", uploading: "正在上传并验证…", retry: "重试上传",
    collectionOwner: "创建者 {name}", noCover: "暂无封面", lookupById: "按 ID 查看收藏夹", backToCollections: "返回收藏夹", collectionsDescription: "把喜欢的创作整理在一起",
    file: "选择 PNG 图片", fileHint: "原始 PNG，最大 16 MiB；保留生成信息，不压缩或重新编码。",
    title: "图片标题", visibility: "访问权限", private: "私有", public: "公开", presentation: "展示方式",
    imageOnly: "仅展示图片", withGenerationInfo: "包含生成信息", login: "登录账户后可上传云端图片。", goLogin: "前往登录",
    privacy: "私有仅限制本应用接口访问，图床直链仍可公开访问；仅展示图片不会移除 PNG 中的生成信息。",
    success: "图片已上传", recent: "本次会话中的图片", recentHint: "这里只展示本次上传或按 ID 查询的结果，并非账户的全部云端图片。",
    imageId: "图片 ID", lookup: "查看", searchPlaceholder: "搜索图片名称或 ID", filter: "筛选图片", all: "全部", noSearchResults: "没有匹配的图片", statsLoaded: "已加载图片", statsPublic: "其中公开", statsPrivate: "其中私有", statsHint: "统计、名称搜索与筛选基于当前已加载的图片；输入完整图片 ID 后可按回车查询云端图片。", empty: "暂无图片", preview: "预览 {title}", dimensions: "{width} × {height} px",
    id: "ID：{id}", collectionId: "收藏夹 ID", collectionHint: "创建、管理和查看云端收藏夹，也可按 ID 查看可访问的收藏夹。",
    collectionEmpty: "此收藏夹暂无可查看的图片。", loadMore: "加载更多", loading: "正在加载…", unavailable: "图片已不可访问",
    revisionReset: "收藏夹已更新，已重新加载第一页。", cooldown: "请在 {seconds} 秒后重试。", requestId: "排查编号：{id}",
    error: {
      generic: "操作失败，请稍后重试。", invalidPng: "请选择有效的 PNG 文件，且大小不超过 16 MiB。",
      invalid: "请检查标题、图片和 ID 等参数后重试。", unauthenticated: "登录已失效，请重新登录。",
      quota: "云端存储额度不足。", conflict: "提交内容发生冲突，请调整内容后重新提交。",
      rate: "请求过于频繁，请等待后重试。", storage: "图床上传或原图校验失败，可以重试本次上传。",
      service: "上传或账户服务暂时不可用，请稍后重试。", notFound: "内容不存在或你没有查看权限。",
      response: "服务返回的数据格式不符合接口约定，请稍后重试。",
    },
  },
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
  crop: {
    title: "裁剪头像", hint: "拖动图片或使用方向键调整位置，滚轮向上放大、向下缩小，也可使用缩放滑条。圆形为预览，实际保存为 512 × 512 正方形静态图片。",
    dragHint: "头像裁剪区域，可拖动图片、使用方向键调整，或滚动滚轮缩放", zoom: "缩放", reset: "重置", confirm: "使用此头像", failed: "头像裁剪失败，请重新选择图片。",
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

/**
 * 创建页（`view/create/**` 根层）词条。
 *
 * 命名约定：`create.<组件名>.<语义>`，例如 `create.advancedSettings.title`。
 * 多个组件共用的同一句话请复用 `common.*`，不要在这里重复登记。
 */
export const create = {
  animaEdit: {
    controlStrength: "控制强度",
    controlStart: "起始百分比",
    controlEnd: "结束百分比",
    runInpaint: "运行蒙版重绘",
    inpaint: "蒙版重绘", controlSize: "使用输入图片原尺寸",
    syncImageModels: "同步图片模式",
    readImageModels: "读取原图模型",
    resourceHint: "仅加载模型与 LoRA，保留当前已选编辑 LoRA。读取原图需要图片内嵌工作流参数。",
    resourcesLoaded: "已加载模型与 LoRA，可继续调整。",
    readingModels: "正在读取模型参数…",
    resourceUnavailable: "资源未扫描到或不适用于 Anima，请检查本地模型目录后手动选择。",
    resourceMissing: "本地未扫描到模型或有多个同名版本：{name}。请检查模型目录并手动选择。",
    animaOnly: "当前文字改图仅支持 Anima UNet，请使用兼容的图片模式或原图工作流。",
    metaUnsupported: "原图参数版本高于当前应用支持范围，请升级应用后重试。",
    noModelMetadata: "原图未包含可读取的工作流模型参数，请同步图片模式或手动选择。",
    "textTab": "文字改图",
    "maskTab": "蒙版编辑",
    "source": "导入原图",
    "fileHint": "PNG / JPG / WebP · 最大 25 MB",
    "instruction": "描述你的修改",
    "placeholder": "例如：把背景换成樱花盛开的庭院，保留人物的脸、发型与服装。",
    "instructionHint": "说清楚“改变什么”和“保留什么”，指令可以使用自然语言。",
    "resolution": "输出分辨率",
    "resolutionHint": "保持原图比例 · 尺寸步进 8",
    "estimate": "约 {size}",
    "advanced": "高级设置",
    "steps": "采样步数",
    "denoise": "降噪强度",
    "randomSeed": "随机种子",
    "dependencies": "必需节点 · 安装说明",
    "dependencyHint": "文字改图依赖 ComfyUI-Cosmos-Reference，请先在 ComfyUI 安装下方参考图节点。",
    "installHint": "进入 ComfyUI 的 custom_nodes 目录，在该目录打开终端并执行上方命令。重启 ComfyUI 后搜索此节点并确认可用；这里不会自动安装或判断安装成功。",
    "run": "运行文字编辑",
    "stop": "停止生成",
    "resultTitle": "编辑结果",
    "original": "原图参考",
    "generated": "已生成",
    "pending": "待生成",
    "result": "结果图",
    "viewOriginal": "查看原图",
    "emptyTitle": "编辑结果将在这里呈现",
    "emptyHint": "先导入原图，再描述你想改变的内容。",
    "waitTitle": "正在等待编辑结果…",
    "waitHint": "正在处理本次编辑，真实结果返回并保存后会显示在这里。",
    "download": "下载结果图",
    "savedHint": "结果已保存到生成输出目录，可在文件管理中查看；切换原图可对照检查。",
    "resultHint": "生成后直接展示编辑后的图片；需要核对时，可切换查看原图。",
    "sourceRequired": "请先导入一张原图。",
    "invalidFile": "请选择 PNG、JPEG 或 WebP 图片，文件大小不超过 25 MB。",
    "tooLarge": "图片超过 4000 万像素，请缩小后重新导入。",
    "invalidInstruction": "请填写修改指令，指令和反向提示词均不能超过 3000 字。",
    "invalidSeed": "Seed 必须是 0 到 9007199254740991 之间的整数。",
    "invalidParameters": "编辑参数超出范围，请检查高级设置和输出分辨率。",
    "modelMissing": "服务端缺少模型或存在多个同名模型：{name}。请检查安装文件与目录。",
    "noResult": "未收到文字改图节点的结果图片，请检查工作流与必需节点。",
    "phase": {
      "idle": "原图仅在运行编辑时发送到已配置的 ComfyUI。",
      "checking": "正在检查模型与输出目录…",
      "uploading": "正在上传本次原图…",
      "generating": "正在等待 ComfyUI 编辑结果…",
      "saving": "正在保存编辑结果…",
      "stopping": "正在请求停止本次生成…"
    },
    "presets": {
      "background": {
        "label": "换个背景",
        "text": "把背景换成樱花盛开的庭院，保留人物的脸、发型、姿势与服装。"
      },
      "expression": {
        "label": "调整表情",
        "text": "把人物的表情改为开心的微笑，保留脸部特征、发型、服装与背景。"
      },
      "lettering": {
        "label": "修改画面文字",
        "text": "把画面标牌上的文字改为“Hello, Illusion Realm!”，保留人物、服装与背景。"
      }
    }
  },
  workspace: {
    totalFiles: "共 {count} 个文件", previousPage: "上一页", nextPage: "下一页",
    latestResult: "最新生成结果", emptyResult: "暂无生成结果", startCreating: "开始创作，欣赏你的作品吧",
    fileCount: "共 {count} 个文件 · 查看全部",
    zoom: "缩放", zoomIn: "放大预览", previous: "上一张", next: "下一张",
    files: "文件管理", upload: "上传", localFile: "本地作品",
    importing: "正在导入…", imported: "已导入 {count} 张图片", importFailed: "导入失败，请检查图片和输出目录后重试。", importInvalid: "请选择 PNG、JPEG 或 WebP 图片，单张不超过 50 MB。",
    edit: "编辑", preview: "预览", emptyTitle: "等待你的第一张作品",
    emptyHint: "在左侧填写提示词，点击生成。完成的作品会显示在这里，并保存到作品库。",
    emptyHintMobile: "在编辑页填写提示词并点击生成，然后在这里查看作品。",
    expandSettings: "展开设置", loadFailed: "读取作品失败，请检查输出目录后重试。",
    folderLoadFailed: "读取文件夹失败，请检查输出目录后重试。", retry: "重试",
    browseAll: "查看全部作品", noMatches: "没有匹配的作品，请调整搜索内容。",
  },
  loraTriggers: {
    apply: "应用触发词", hint: "追加已选 LoRA 的触发词，跳过已有词；高级模式写入当前分类。",
    applied: "已追加 {count} 个触发词", unchanged: "提示词已包含这些触发词",
  },
  maskEditor: {
    useGeneration: "使用蒙版重绘",
    title: "蒙版编辑", import: "导入图片", empty: "导入图片后涂抹需要重绘的区域",
    color: "显示颜色",
    mask: "独立黑白 mask", alphaImage: "原图 + 透明通道 mask",
    loadFailed: "图片读取失败，请选择有效的 PNG、JPEG 或 WebP 图片。", exportFailed: "蒙版导出失败，请重试。",
    tooLarge: "支持不超过 1600 万像素、单边不超过 8192 像素的图片。",
  },
  promptAssistant: {
    // 历史是本机成功转换的收据，空态明确从启用功能后开始记录。
    // 默认最新在前，切换方向只改变查看顺序，不改写已记录时间。
    // 保留上限写在说明里，避免用户把本地历史理解为无限云端备份。
    // 保存失败和翻译失败分开提示，用户已经拿到的译文不会被丢掉。
    // 剪贴板可能被系统拒绝，必须使用失败文案而不是无条件提示已复制。
    history: {
      // 重试针对本地读取，不意味着重新向服务商发送翻译。
      // 名称沿用“翻译”帮助用户从截图中的助手菜单识别入口。
      // 同一入口也收录标签转换，保存的预设标签说明当次处理方式。
      // 描述同时交代存储位置、容量与查看边界，避免用户担心点击即替换原稿。
      // 空态不显示默认样例，因为没有真实响应就没有可以找回的结果。
      // 原文与结果标题顺序固定，左右或上下布局变化也保持相同阅读关系。
      // 排序按时间有两种方向，不借用模型名称排列的“递增”造成含义不明。
      // 保存失败建议及时复制，是因为程序重启后不能保证这条收据还存在。
      // 读取失败允许重试，不引导用户重新填写已配置的供应商密钥。
      // 所有说明都是界面文案，不把译文正文放进翻译词条表。
      retry: "重试",
      title: "翻译历史", description: "保存在本机，最多保留最近 100 条成功结果。查看历史不会修改当前提示词。",
      order: "时间排序", newest: "最新在前", oldest: "最早在前",
      empty: "暂无翻译记录。成功翻译后，原文和结果会自动保存在这里。",
      original: "原文", translated: "翻译结果", copy: "复制译文",
      loadFailed: "翻译历史读取失败，请重试。", saveFailed: "翻译已完成，但历史保存失败；请及时复制结果。",
      copyFailed: "复制失败，请手动选择并复制译文。",
    },
    // 两个入口共用本站凭据，必须明确保存和清除会影响 Agent。
    // 模型入口留在 Agent，避免用户误以为创建页另有独立 Grok 设置。
    // 服务商品牌仍使用 agent.providers.euzhi，这里只新增当前功能的说明文案。
    // 共用提示包含删除语义，避免仅提醒保存共享却遗漏清除也会影响聊天。
    // 管理链接描述的是模型选择，不把打开设置说成已验证本站连接成功。
    euzhiShared: "与 Agent 共用 Euzhi API Key 和 Grok 模型选择；在此保存或清除密钥也会同步影响 Agent。",
    euzhiManage: "前往 Agent 设置选择 Grok 模型",
    editPreset: "编辑自定义预设", editNamedPreset: "编辑或删除预设：{name}", presetDeleted: "已删除自定义预设",
    deletePresetConfirm: "确定删除预设“{name}”？删除后无法恢复。", confirmDeletePreset: "确认删除",
    back: "返回上一级",
    title: "提示词助手", translate: "翻译为英文", busy: "正在处理…", provider: "选择供应商", customProvider: "其他平台 / 中转站",
    presets: "预设文本", configure: "连接设置", addPreset: "添加自定义预设", copy: "复制", undo: "撤销替换",
    translation: "英文翻译", anima: "Anima / Danbooru 标签", instruction: "系统指令", presetName: "预设名称",
    translationInstruction: "将用户提供的内容翻译为英文，保留原意、现有英文标签、权重、括号及逗号结构。不要增删画面元素。只输出翻译结果，不要解释、标题或代码块。",
    animaInstruction: "你是一位从业10年的Anima提示词工程师，擅长使用Danbooru标签描述用户想要的画面。将用户描述转换为英文、逗号分隔的Danbooru风格标签，保留角色、动作、构图、背景和原有权重，不添加用户未描述的画面元素。只输出标签，不要解释或代码块。",
    endpoint: "API 地址", model: "模型 ID", apiKey: "API Key", keyHint: "留空保留已保存密钥；GLM 与不同中转地址各自保存密钥。",
    keyConfigured: "已配置密钥", keyMissing: "尚未配置密钥", save: "保存", clearKey: "清除密钥", saved: "已保存连接设置", deletedKey: "已清除密钥",
    docs: "GLM 官方文档 / 获取 API Key", freeHint: "内置 Flash 模型，实际费用和额度以供应商当前政策为准。",
    empty: "请先输入需要翻译的内容", success: "已替换为英文，可撤销", copied: "已复制", conflict: "输入内容已变化，结果已保留，请确认后应用。",
    result: "处理结果", apply: "应用结果", discard: "放弃结果", undoConflict: "内容已再次编辑，请先复制当前内容再撤销。",
    invalid: "请检查模型、地址和文本长度", missingKey: "请先在设置 → API 密钥 → 提示词助手中填写 API Key", unauthorized: "认证失败（401）：密钥无效或已过期，请确认密钥属于当前供应商",
    forbidden: "访问被拒绝（403）：请检查账户状态及所选模型的调用权限",
    secretSaveFailed: "密钥保存或清除失败，请重试",
    rateLimited: "请求过于频繁或额度不足，请稍后重试", timeout: "请求超时，请重试", networkFailed: "无法连接供应商，请检查 API 地址和网络",
    emptyResponse: "模型未返回有效文本", truncatedResponse: "输出超过长度限制，请缩短输入后重试", failed: "处理失败，请检查连接设置后重试",
    desktopOnly: "请在桌面端使用提示词助手", presetInvalid: "请填写预设名称和系统指令", presetSaved: "已保存自定义预设",
  },
  /*
   * 队列时间文案的语义边界：
   * 提交、开始、完成是三个不同时间，不能只统一叫生成时间。
   * 耗时插值来自真实起止差，词条中不写固定的示例秒数。
   * 两种已登记语言使用相同键，切换语言不改变历史时间戳。
   * 终态名称继续沿用原状态词条，异常失败和主动停止仍能区分。
   */
  generationTasks: {
    submittedAt: "提交时间", startedAt: "开始时间", finishedAt: "完成时间", elapsed: "耗时 {seconds} 秒",
    summary: "{running} 个生成中 · {queued} 个排队中", categories: "任务分类",
    tabs: { active: "进行中", history: "历史" }, current: "当前生成",
    emptyActive: "暂无进行中的任务", emptyHistory: "暂无历史任务",
    serialHint: "任务按提交顺序依次生成", queuePosition: "等待生成 · 排队第 {position} 位",
    generatingImage: "正在生成第 {number} 张", details: "查看参数", noPrompt: "未填写提示词",
    prompt: "提示词", model: "模型", dimensions: "图片尺寸", quantity: "生成张数",
    title: "生成任务", active: "{count} 个任务进行中", empty: "暂无生成任务",
    add: "添加生成任务", progress: "已完成 {completed} / {total} 张", view: "查看图片",
    cancel: "停止生成", cancelQueued: "取消排队", cancelAll: "停止全部", cancelled: "生成已停止",
    disconnected: "ComfyUI 连接已断开或请求超时，请检查服务后重新提交。",
    queueStopped: "队列已终止，请检查 ComfyUI 服务后重新提交。",
    stopFailed: "未能确认 ComfyUI 已停止，待执行任务已取消。请检查服务端任务。",
    stopUnavailable: "停止接口不可用，请完全退出并重新启动应用。",
    timeout: "生成等待超时，队列已终止，请检查 ComfyUI 服务端任务。",
    executionFailed: "ComfyUI 工作流执行失败，请检查模型、参数及服务端日志。",
    status: { queued: "排队中", generating: "生成中", saving: "保存中", cancelling: "正在停止", cancelled: "已停止", completed: "已完成", failed: "失败" },
  },
  addImagesToFolderDialog: {
    titlePrefix: "添加图片到「",
    description: "从已生成的本地图片中批量选择，添加至该文件夹。",
    selected: "已选",
    imageUnit: "张",
    loading: "正在加载图片…",
    empty: "暂无可添加的本地图片",
    selectRequired: "请先选择要添加的图片",
    electronOnly: "请在 Electron 桌面版中添加图片",
    nothingToAdd: "没有可添加的图片",
    added: "已将 {count} 张图片添加到「{name}」",
    add: "添加 ({count})",
    /** 异常且 error 不是 Error 实例时的兜底文案 */
    failed: "添加图片失败",
  },
  advancedSettings: {
    title: "高级设置",
    presetPrompt: "预设提示词",
    presetPromptHint: "预设提示词说明",
    usePreset: "使用预设提示词",
    inUse: "使用中：",
    edit: "编辑",
    positivePrefix: "+正向：",
    negativePrefix: "−反向：",
    sampler: "采样器",
    samplerHint: "采样器说明",
    scheduler: "调度器",
    schedulerHint: "调度器说明",
    steps: "步数",
    stepsHint: "步数说明",
    cfgRatio: "CFG 比例",
    cfgHint: "CFG 说明",
    seed: "种子",
    seedHint: "种子说明",
    random: "随机",
    custom: "自定义",
    seedPlaceholder: "输入种子",
  },
  audioUpload: {
    /** 未选择音频时的占位说明（可选 prop 的回退值） */
    emptyHintDefault: "点击选择或上传音频",
  },
  bulkSelection: {
    selectAll: "全选",
    deselectAll: "取消全选",
  },
  createFolderDialog: {
    nameRequired: "请输入文件夹名称",
    electronOnly: "请在 Electron 桌面版中创建文件夹",
    maxDepth: "文件夹最多嵌套 {depth} 层",
    created: "文件夹「{name}」已创建",
    subfolderDescription: "在「{name}」下创建子文件夹（最多嵌套 {depth} 层）。",
    nameLabel: "文件夹名称",
    namePlaceholder: "输入文件夹名称",
    titleNewSubfolder: "新建子文件夹",
    titleNew: "新建文件夹",
    description: "在生成保存目录下创建文件夹，文件夹内仅用于存放图片文件。",
    creating: "创建中…",
    create: "创建",
    failed: "创建文件夹失败",
  },
  historyOrder: {
    // 标题同时用于入口悬停与窗口名称，“排列”区别真正的磁盘移动操作。
    "title": "图片排列",
    // 描述区将手动显示排序和可选改名分开，用户无需接受改名才能排列。
    // 手柄才是拖动入口，不暗示点击任意缩略图都会开始拖拽。
    "description": "拖动图片手柄调整显示顺序，也可以按序号批量修改文件名。",
    // 数量取整个打开目录，特别说明隐藏项参与，避免误认为只处理当前九张图。
    // 当前搜索只控制列表显示，不是本次批量改名的范围选择器。
    "hint": "当前打开目录共 {count} 张图片（包括其他分页和搜索隐藏的图片）。拖动手柄排列；需要批量改名时启用下方设置。",
    // 计数和提示共享 count 插值，不在组件里额外拼中文量词。
    "count": "{count} 张图片",
    // 外部删除后可能变空，不能把空库当作成功排列了零张图。
    "empty": "当前文件夹没有可排列的图片",
    // 手柄读屏名称保留完整文件名，视觉上的省略不会丢失操作对象。
    "drag": "拖动「{name}」调整图片顺序",
    // 和 EXIF 功能保持一致的叫法，体现这里复用了相同命名设置。
    "renameTitle": "批量重命名",
    // 打开开关后确认按钮写明两项副作用，不让用户误认为只保存显示顺序。
    // 不用“自动整理”掩盖真正的文件名变更。
    "renameAction": "批量改名并保存顺序",
    // 命名关闭时不声称文件被移动或改名。
    "applyOrder": "保存顺序",
    // 预览截取五项后说明剩余数量，执行范围不随预览条数缩减。
    "more": "另有 {count} 个名称预览",
    // 成功数量取正式回执，不能拿最初计划数量冒充已经完成的数量。
    "renameComplete": "已重命名 {count} 张图片",
    // 逐文件服务没有事务回滚，这里必须说明已完成部分仍然有效。
    // reason 取真实失败原因，不预先把所有异常都叫作网络问题。
    "renamePartial": "已重命名 {count} 张，后续文件失败：{reason}。已完成的更改不会撤销。",
    // 未知异常使用中性兜底，不编造具体的系统或权限原因。
    "renameFailed": "图片改名失败",
    // 末尾也须为正数，解释为何递减时一个正起点仍可能不合法。
    // 修复方式由用户决定，提示不会偷偷替换非法前缀。
    "invalidName": "请输入不含路径和非法字符的前缀，以及有效的正整数序号。递减序号不能小于 1。",
    // 冲突区别于格式错误，当前流程保守拒绝名称互换，不覆盖已有图片。
    "nameConflict": "目标文件名发生冲突。请更换前缀或起始序号，不会覆盖已有图片。"
},
  createHistorySidebar: {
    // 移动只整理当前输出根内的文件；目标限制应在打开系统选择器前可见。
    // 使用实际返回的新路径数量反馈，跳过原地文件时不能把选择数当成功数。
    // 处理中只说明当前操作，不宣称所有选中图片已移动完成。
    // 越界提示与普通磁盘失败分开，用户可以直接改选允许范围内的文件夹。
    // moveHint 用在按钮悬停说明，系统选择器仍沿用项目已有的通用标题。
    move: "移动", moving: "移动中…", moveHint: "选择当前输出目录内的目标文件夹",
    moved: "已移动 {count} 张图片", moveFailed: "移动失败，请检查目标文件夹后重试", moveOutside: "请选择当前输出目录或其子文件夹",
    all: "全部",
    folder: "文件夹",
    doubleClickToOpen: "双击打开",
    searchFolder: "搜索文件夹",
    searchFolderPlaceholder: "搜索文件夹…",
    loadingFolders: "正在加载文件夹…",
    collapse: "收起",
    expand: "展开",
    newFolder: "新建文件夹",
    gridView: "网格",
    stackView: "堆栈",
    bookmarkView: "收藏",
    exitSelection: "退出选择",
    batchSelect: "批量选择",
    filterAll: "筛选全部",
    searchMedia: "搜索{label}",
    searchPlaceholder: "搜索...",
    loadingImages: "正在加载图片…",
    emptyInFolder: "「{name}」内暂无图片",
    endOfList: "已经到底了",
    selected: "已选",
    selectAll: "全选",
    deleteUnsupported: "删除功能未加载，请完全退出 Electron 后重新启动应用",
    /** 媒体区标题（可选 prop 的回退值，视频模式下由调用方传「视频」） */
    mediaLabelDefault: "图片",
    /** 文件夹行副信息：该文件夹里的图片数 */
    folderImageCount: "{count} 张",
    freeOutputMode: "自由选择输出目录",
    fixedOutputPath: "固定输出目录",
    chooseFixedOutput: "选择文件夹",
    fixedOutputOutsideRoot: "固定目录必须位于设置中的生成图片保存路径内",
    fixedOutputUpdated: "已更新固定输出目录",
  },
  createModeTabs: {
    image: "图片",
    video: "视频",
    edit: "Edit",
    roleCover: "Role 翻唱",
    roleTts: "Role TTS",
  },
  createQuickPhraseDialog: {
    help: "片段帮助",
    showImage: "显示图片（可选）",
    chooseImage: "选择图片",
    clear: "清除",
    chooseImageHint: "从你的图库中设置一张显示图片",
    keyword: "关键词",
    keywordHint: "不允许空格——空格会被替换为短横线。",
    promptText: "提示词文本",
  },
  deleteFolderDialog: {
    deleteUnsupported: "删除功能未加载，请完全退出 Electron 后重新启动应用",
    deletedSummary: "已删除「{name}」（{imageCount} 张图片、{sidecarCount} 个 JSON）",
    title: "删除文件夹",
    confirmPrefix: "确定要删除「",
    confirmSuffix:
      "」吗？此操作不可撤销，将一并删除该文件夹及其子文件夹内的所有图片与 JSON 参数文件。",
    counting: "正在统计文件夹内容…",
    imagesLabel: "图片：",
    imagesUnit: "张",
    sidecarsLabel: "JSON 参数：",
    sidecarsUnit: "个",
    subfoldersLabel: "子文件夹：",
    subfoldersUnit: "个（将一并删除）",
    /** 读取文件夹内容异常且 error 不是 Error 实例时的兜底文案 */
    readFailed: "无法读取文件夹内容",
    /** 删除异常且 error 不是 Error 实例时的兜底文案 */
    failed: "删除文件夹失败",
  },
  deleteImagesDialog: {
    deleteUnsupported: "删除功能未加载，请完全退出 Electron 后重新启动应用",
    skippedSuffix: "，{count} 项跳过",
    deletedSummary: "已删除 {imageCount} 张图片、{sidecarCount} 个 JSON{skipped}",
    title: "删除图片",
    confirmPrefix: "确定要删除选中的",
    confirmSuffix:
      "张图片吗？此操作不可撤销，将一并删除对应的 JSON 参数文件。",
    deleting: "删除中…",
    failed: "删除图片失败",
  },
  extensionSelectDialog: {
    title: "添加扩展",
    searchPlaceholder: "搜索 LoRA...",
    empty: "未找到 LoRA 扩展，请先在设置页配置 LoRA 路径并扫描",
    selected: "已选",
    viewInfo: "查看扩展信息",
    addToFavorites: "添加到收藏",
    versionUnit: "模型",
    select: "选择",
    versionDialogTitle: "选择 {name} 模型",
  },
  resourceSelection: {
    mode: "模型选择方式",
    multiple: "多选",
    oneMainModel: "当前工作流只支持一个主模型，请切换为单选或仅保留一个模型。",
  },
  generateButton: {
    label: "生成",
  },
  generatedImageDetailDialog: {
    copiedLabel: "{label}已复制",
    copyLabel: "复制{label}",
    notOursRemix: "非本生成器生成，无法二创",
    remixLoaded: "已载入二创参数",
    remixLoadedWithWarnings: "已载入二创参数 ({warnings})",
    parsingMeta: "正在解析图片内嵌 Meta…",
    metaFromImage: "参数来自图片内嵌 Meta",
    notOurs: "非本生成器生成",
    notOursDescription:
      "这张图片的内嵌 Meta 中没有本生成器写入的 ComfyUI 工作流，无法解析正面提示词 / 反向提示词 / 扩展 LoRA 等参数，因此不能二创。",
    generatedData: "生成数据",
    remix: "二创",
    model: "模型",
    extensionLora: "扩展 LoRA",
    prompt: "提示词",
    negativePrompt: "反向提示词",
    seed: "种子",
    steps: "步数",
    cfgRatio: "CFG 比例",
    sampler: "采样器",
    size: "尺寸",
    batch: "批次",
  },
  generatedImageContextMenu: {
    saveAs: "保存图片",
    rename: "在线改名",
    move: "移动到…",
    delete: "删除图片",
    saveUnsupported: "保存功能未加载，请完全退出 Electron 后重新启动应用",
    renameUnsupported: "重命名功能未加载，请完全退出 Electron 后重新启动应用",
    saved: "图片已保存",
    saveFailed: "保存图片失败",
    saveCanceled: "已取消保存",
  },
  renameImageDialog: {
    title: "在线改名",
    description: "只修改文件名，图片内容和内嵌 Meta 保持不变。",
    nameLabel: "新名称",
    namePlaceholder: "输入新名称",
    extensionHint: "扩展名保持为 {ext}",
    nameRequired: "请输入新名称",
    renaming: "重命名中…",
    renamed: "已重命名为「{name}」",
    failed: "重命名失败",
  },
  historyFolderContextMenu: {
    addImages: "添加图片",
    createSubfolder: "新建子文件夹",
    deleteFolder: "删除文件夹",
  },
  historyEmptyState: {
    noGeneratedImages: "暂无已生成图片，双击文件夹可查看内容",
  },
  imageCountDropdown: {
    imageLabel: "图片",
  },
  imageSizeSection: {
    scale: "等比例缩放",
    scaleHint: "双击倍率可编辑，回车或失焦确认，Esc 取消；保留一位小数，宽高输出为整数像素。",
    scaleLimitedHint: "双击倍率可编辑（0.1–{max} 倍），回车或失焦确认，Esc 取消；宽高按模型规则对齐。",
    title: "图片尺寸",
    custom: "自定义",
    customLabel: "（自定义）",
    customHint: "自定义宽高：{min}–{max}，自动对齐 {step} 像素。",
    unlimited: "无上限",
    customUnlimitedHint: "自定义宽高无上限，自动对齐 {step} 像素。",
    presetUnlimitedHint: "预设取自模型训练分辨率（{note}）；自定义宽高无上限。",
    presetHint: "预设取自模型训练分辨率（{note}），比任意等比缩放更稳定；宽高上限 {max}。",
    presetNoteFallback: "训练友好",
    aspectRatioLabel: "（{ratio}）",
    width: "宽",
    height: "高",
    customWidth: "自定义宽度",
    customHeight: "自定义高度",
  },
  modelSelectDialog: {
    title: "选择 {name} 模型",
    emptyAnima:
      "未找到 Anima 模型，请先在设置页配置 Diffusion 模型地址（diffusion_models 目录）并扫描",
    emptySdxl:
      "未找到 SDXL 模型，请先在设置页配置 Checkpoint 模型地址并在 checkpoint/SDXL 目录下放置模型",
    searchPlaceholder: "搜索模型...",
  },
  modelSeriesSelector: {
    seriesLabel: "模型系列",
  },
  negativePromptPresetDialog: {
    fieldLabel: "反向提示词",
    fieldHint: "可直接使用权重语法：(tag:1.2)",
    title: "反向提示词预设",
    groupLabel: "反向提示词",
    contentLabel: "内容：",
    empty: "（空）",
  },
  negativePromptSection: {
    title: "反向提示词",
    collapsedPrefix: "反向提示词已收起（当前预设：",
    collapsedSuffix: "），点击展开",
    none: "未选择",
    inUse: "使用中：",
    noPreset: "未选择预设",
    presetEntry: "反向提示词预设",
    placeholder: "反向提示词...",
  },
  page: {
    modelNotFound: "未找到模型 {name}",
    loraNotFound: "未找到 {count} 个 LoRA",
    remixFilledWithWarnings: "二创参数已填入 ({warnings})",
    remixFilled: "二创参数已填入创作表单",
    promptRequired: "请先填写提示词",
    saveFailed: "生成完成，但图片未能保存，请检查设置中的保存路径",
    generated: "已生成 {count} 张图片",
    generateDone: "图片生成完成",
    generateFailed: "ComfyUI 生成失败",
    model: "模型",
    addExtension: "添加扩展",
    generating: "正在生成{dots}",
    mediaVideo: "视频",
    mediaRoleTts: "语音",
    mediaImage: "图片",
    previewAlt: "刚刚生成",
  },
  presetPromptDialog: {
    title: "预设提示词设置",
    positivePrefixLabel: "正向前缀",
    positivePrefixPlaceholder: "添加在提示词开头的标签...",
    positivePrefixHint: "添加在你的提示词之前",
    positiveSuffixLabel: "正向后缀",
    positiveSuffixPlaceholder: "添加在提示词末尾的标签...",
    positiveSuffixHint: "添加在你的提示词之后",
    negativePrefixLabel: "反向前缀",
    negativePrefixPlaceholder: "添加在反向提示词开头的标签...",
    negativePrefixHint: "添加在你的反向提示词之前",
    negativeSuffixLabel: "反向后缀",
    negativeSuffixPlaceholder: "添加在反向提示词末尾的标签...",
    negativeSuffixHint: "添加在你的反向提示词之后",
    positivePrefixSummary: "+前缀：",
    negativePrefixSummary: "−前缀：",
  },
  progress: {
    adding: "添加中…",
    deleting: "删除中…",
    generating: "生成中…",
  },
  promptCollapseButton: {
    expand: "展开",
    collapse: "收起",
    expandLabel: "展开{label}",
    collapseLabel: "收起{label}",
  },
  promptGuideDialog: {
    eyebrow: "提示词教程",
  },
  quickPhraseCard: {
    use: "使用",
    edit: "编辑",
    deletePhrase: "删除片段",
  },
  quickPhraseDialog: {
    duplicate: "关键词 #{keyword} 已存在",
    title: "快捷短语",
    searchPlaceholder: "搜索快捷短语...",
    listView: "列表视图",
    gridView: "网格视图",
    create: "新建",
    empty: "还没有快捷短语",
    emptyHint: "保存你常用的提示词快捷短语。",
    createPhrase: "创建快捷短语",
  },
  quickPhraseFormDialog: {
    titleCreate: "创建快捷短语",
    titleEdit: "编辑快捷短语",
  },
  quickPhraseImagePicker: {
    title: "选择显示图片",
    description: "从你的图库中选择一张图片",
    loading: "正在加载图片…",
    empty: "暂无已生成图片",
  },
  /**
   * 窄屏（< xl）下图库的入口与抽屉。
   * 背景：右栏整体是 `hidden xl:flex`，窄屏时连图库一起消失且原本没有任何替代入口，
   * 用户于是完全失去对已生成图片的访问 —— 这不是响应式重排，是条件渲染把功能抹掉了。
   */
  historyDrawer: {
    openLabel: "已生成图片",
    closeLabel: "关闭",
  },
  resourceCategoryFilter: {
    filterByCategory: "按分类筛选",
    all: "全部",
    fontSize: "字体大小",
    fontSizeTitle: "字体{label}",
    displayMode: "分类显示方式",
    tabs: "标签栏",
    dropdown: "下拉框",
  },
  roleCoverPanel: {
    audioLabel: "参考音频",
    audioEmptyHint: "点击选择或上传音频文件",
    generateCover: "生成翻唱",
  },
  roleModelSelect: {
    roleLabel: "角色",
  },
  roleSelectDialog: {
    title: "选择角色",
    description: "选择角色及其下的模型版本",
    selected: "已选",
    viewInfo: "查看角色信息",
    addToFavorites: "添加到收藏",
    select: "选择",
    modelLabel: "模型：",
  },
  selectedExtensionRow: {
    weightLabel: "{name} 权重",
    editWeightHint: "双击编辑权重",
    removeLabel: "移除 {name}",
  },
  simpleGenerateFooter: {
    /** 底部提交按钮文案（可选 prop 的回退值） */
    labelDefault: "生成",
  },
  upload: {
    required: "(必填)",
    optional: "(可选)",
    clickToReplace: "点击更换",
    removeLabel: "移除{label}",
  },
  videoCreatePanel: {
    promptRequired: "请先填写提示词",
    startImageRequired: "请先上传起始图片",
    durationRange: "时长需在 {min}–{max} 秒之间",
    generatedSaved: "视频已生成并保存至 {count} 个文件",
    generatedUnsaved: "视频已生成（未保存到磁盘）",
    duration: "时长",
    durationUnit: "秒",
    durationLimitPrefix: "时长必须 ≤",
    durationLimitSuffix: "秒。",
    prompt: "提示词",
    promptHint: "提示词说明",
    promptPlaceholder: "描述动作和声音...",
    /** 生成异常且 error 不是 Error 实例时的兜底文案 */
    generateFailed: "视频生成失败",
  },
  videoImageUpload: {
    previewAlt: "{label}预览",
    clickToSelectOrUpload: "点击选择或上传",
    dragHint: "从侧边栏拖放",
    uploadHint: "或上传文件",
  },
  videoWorkflowSelect: {
    workflowLabel: "工作流",
    minimaxReference: "MiniMax H3 参考素材生视频",
  },
  videoModels: {
    unavailable: "未在 ComfyUI 中找到{label}：{name}。请刷新模型列表并选择已安装的文件；同名文件存在多份时请指定准确路径。",
    videoVae: "视频 VAE", audioVae: "音频 VAE",
    selectLocal: "选择本地 Minimax 模型", selectLora: "从 LoRA 库选择", incompatible: "Minimax 工作流只能选择 Minimax 分类下的模型或 LoRA。", emptyMinimax: "未发现 Minimax 模型，请在 Diffusion 模型根目录下的 Minimax 子目录放入模型并重新扫描。",
    title: "模型加载设置", hint: "默认沿用当前工作流配置；模型名称或位置不同时可修改。CLIP 从 text_encoders / clip 目录读取，VAE 从 vae 目录读取。",
    embedded: "当前工作流的 CLIP 与 VAE 由主模型（Checkpoint）自带，无需单独选择；切换上方主模型即可。",
    unet: "UNet 模型", clip: "CLIP 文本编码器", vae: "VAE", lora: "LoRA",
    default: "工作流默认 · {name}", reset: "恢复工作流默认", refresh: "刷新可选模型",
    listFailed: "未能获取 ComfyUI 模型列表，请检查连接或重启软件后刷新。仍可使用本地扫描结果及工作流默认值。",
    invalid: "模型设置无效，请选择模型相对路径。", missingNode: "视频模板缺少必要节点或连接：{name}",
  },
  videoSettings: {
    resolutionHint: "MiniMax H3 宽高自动对齐 32 像素；预设、自定义及缩放均以显示的实际尺寸提交。",
    invalidResolution: "视频宽高无效，请输入 {min}–{max} 范围内的整数，尺寸将自动对齐 {step} 像素。",
    title: "视频生成参数", fps: "帧率 (fps)",
    actualDuration: "实际长度约 {seconds} 秒",
    firstOnly: "仅首帧", bothFrames: "首尾帧", firstFrame: "首帧", lastFrame: "尾帧",
    referenceMissing: "该图片尚未上传",
    referenceUnavailable: "第 {number} 张图片尚未上传，请先上传图片或移除对应引用。",
    alignment: "Minimax 帧数按 17n + 5 对齐，调整长度、帧率或帧数会同步计算，实际长度可能略有变化。",
    invalid: "视频参数无效，请检查生成步数、帧率、长度和总帧数。",
  },
  mediaReferences: {
    // 这里只是只读转换结果的折叠标题，不把整个技能长文放进表单。
    // 标记格式由转换器生成，翻译不得改变 Picture/Video/Audio 的协议写法。
    // 视频和音频共同引用此词条，避免两处名称逐渐漂移。
    conversionPreview: "转换预览",
    back: "返回分类",
    title: "搜索已导入素材",
    empty: "没有匹配的素材，请先在当前任务中导入。",
    image: "图片", video: "视频", audio: "音频",
  },
  videoReferences: {
    importResources: "批量导入资源",
    resources: "资源",
    mixedSkipped: "已添加 {count} 个资源，另有 {skipped} 个因格式不支持而跳过。",
    batchHint: "点击多选或拖入多个文件",
    hint: "按需导入图片、视频或音频，在提示词中输入 @ 选择素材。参考视频仅使用画面，声音请通过参考音频导入。",
    missing: "素材引用 {token} 不存在，请先导入对应素材或移除引用。",
  },
  canny: {
    controlRequired: "边缘控制仅支持 Anima，请导入图片并等待当前边缘检测完成。",
    title: "检测边缘", invert: "反转", thresholds: "检测阈值", lower: "检测阈值下限", upper: "检测阈值上限",
    original: "原图", result: "检测后的图", preview: "预览", loading: "正在读取图片…",
    pending: "上传原图后自动检测",
    outputHint: "开启后点击生成将使用当前边缘图进行 Anima LLLite 控制绘画，保留输入图尺寸；也可预览或下载 PNG。",
    processing: "正在检测边缘…", processingFailed: "边缘检测失败，请重试", retry: "重试检测", download: "下载 PNG",
    tooLarge: "图片尺寸过大，请使用不超过 8192 像素边长且不超过 1600 万像素的图片",
    invalidImage: "请选择 PNG、JPEG 或 WebP 图片", loadFailed: "图片读取失败，请重新选择",
  },
  colorPicker: {
    area: "饱和度与亮度",
    hue: "色相",
    red: "红色通道",
    green: "绿色通道",
    blue: "蓝色通道",
    keyboard: "左右调整饱和度，上下调整亮度，按住 Shift 加速",
    position: "饱和度 {s}%，亮度 {v}%",
  },
  maskStudio: {
    positivePrompt: "正向提示词",
    returnSettings: "返回生成参数",
    positivePlaceholder: "描述希望生成的画面…",
    exportCurrent: "导出当前图片",
    rectangle: "矩形选区",
    ellipse: "椭圆选区",
    invertSelection: "反向选择",
    deleteSelection: "删除选中区域",
    cropSelection: "使用选区裁剪",
    selectionMenu: "选区操作",
    tools: "图片编辑工具",

    lasso: "套索选区",
    crop: "裁剪",
    blur: "模糊笔刷",
    gaussian: "高斯模糊",
    blurRadius: "模糊半径",
    selectionMask: "选区转蒙版",
    deselect: "取消选区",
    applyCrop: "确认裁剪",
    cancelCrop: "取消裁剪",
    cropHint: "拖动框选范围，确认后删除框外像素",
    lassoHint: "拖动套索勾选主体，可转为蒙版或限定模糊范围",
    brushGroup: "绘画工具",
    selectionGroup: "选区与裁剪",
    retouchGroup: "修饰工具",
    historyGroup: "文档操作",
    channels: "图像通道",
    editingChannel: "编辑图像",
    readOnlyChannel: "通道预览 · 点击首张返回编辑",

    "rotateLeft": "逆时针旋转",
    "title": "蒙版编辑",
    "brushSettings": "笔刷设置",
    "reset": "恢复默认",
    "shape": "笔刷形状",
    "circle": "圆形",
    "square": "方形",
    "size": "笔刷大小",
    "opacity": "笔刷不透明度",
    "hardness": "硬度",
    "spacing": "笔触间距",
    "paintColor": "绘画颜色",
    "displayOpacity": "蒙版显示透明度",
    "tolerance": "颜色容差",
    "contiguous": "仅连通区域",
    "layers": "图层",
    "original": "原图",
    "painted": "绘画层",
    "mask": "蒙版层",
    "activeLayer": "当前编辑层",
    "zoomOut": "缩小",
    "zoomIn": "放大",
    "fit": "适应画布",
    "edgeTab": "边缘绘画",
    "runEdge": "边缘生成",
    "draw": "蒙版笔",
    "paint": "RGB 画笔",
    "erase": "橡皮擦",
    "fill": "油漆桶",
    "select": "颜色选择",
    "pan": "移动画布",
    "undo": "撤销",
    "redo": "重做",
    "invert": "反转蒙版",
    "clear": "清空当前层",
    "rotate": "顺时针旋转",
    "flipX": "水平翻转",
    "flipY": "垂直翻转",
    "save": "保存编辑",
    "cancel": "取消编辑",
    "paintingExport": "原图与绘画合成",
    "composite": "绘画合成与透明通道",
    "canvas": "画布",
    "settings": "生成参数"
},
audio: {
  // 单位放在标签内，数字输入与滑条共享同一个可访问名称。
  // 小数秒只是期望值，提示明确说明原图仍会做帧数对齐。
  // 上限为本客户端的输入范围，不作为模型的官方上限宣传。
  duration: "时长（秒）",
  durationHint: "支持 0.1–60 秒；实际时长按工作流帧数对齐，较长音频需要更多显存和时间。",
  invalidDuration: "音频时长须为 0.1–60 秒之间的有效数值。",
  invalidSettings: "请选择有效的 MiniMax 主模型，步数须为 1–100 的整数。",
progress: "已完成 {completed} / {total} 项",
quantity: "生成数量",
  saved: "音频已生成并保存",
  prompt: "音频提示词",
  promptHint: "描述声音、语气和对白；可使用助手转为英文描述，保留所需对白语言。",
  reference: "参考音频",
  referenceHint: "不上传时使用文生音频；上传后自动使用参考音频生音频。",
  // 两种模式都显示草稿当前秒数，防止修改参数后摘要仍显示默认值。
  // seconds 来自共享参数状态，不使用参考文件自身的播放长度。
  // 有无参考只改变模式名称与缺省值，不覆盖用户自定义时长。
  // 模板默认仍分别为四秒和五秒，文案本身不承担保存默认值的职责。
  // 不写成“精确输出”，因为帧数表达式可能产生少量时长对齐差异。
  textWorkflow: "文生音频 · Audio_Minimax · {seconds} 秒",
  referenceWorkflow: "参考音频生音频 · {seconds} 秒",
  generating: "正在生成音频",
  media: "音频",
  results: "生成的音频",
  empty: "生成的音频将在这里显示",
  resultNumber: "生成音频 {number}",
  reveal: "查看文件",
  invalid: "请输入音频描述，并使用有效的非负整数种子。",
  invalidReference: "请选择有效的音频文件（不超过 500 MiB）。",
  desktopOnly: "请在桌面客户端中生成或查看音频。",
  noOutput: "ComfyUI 未返回可用的音频文件。"
},
} as const;

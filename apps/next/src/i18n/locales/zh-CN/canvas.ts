// 画布文案单独归档，避免把本地UI草稿描述成已经接通的生成工程。
export const canvas = {
  gptSovits: {
    addVoice: "添加自定义音色",
    customVoice: "自定义",
    voiceRole: "角色名",
    voiceTone: "语气",
    chooseVoiceFile: "选择音频并保存",
    voiceSaved: "已添加 {name} · {tone} 的录音。",
    voiceInvalidFields: "请填写有效的角色名、语气和台词。角色名与语气不能包含路径符号。",
    voiceAlreadyExists: "该角色和语气下已有同名录音。请修改台词文件名后再试。",
    voiceInvalidFile: "请选择非空的 WAV、MP3、FLAC、OGG、M4A、AAC 或 OPUS 文件。",
    voiceSaveFailed: "无法保存录音，请检查角色音色库目录是否可写。",
    voice: "音色", playPreview: "试听录音", pausePreview: "暂停试听", previewFailed: "录音无法播放。",
    voicesEmpty: "这里还没有参考录音。", voicesUnavailable: "无法读取参考录音。", voiceSelected: "已选用 {name} · {tone} 的录音。",
    voiceConflict: "无法选用录音，请检查当前节点是否已连接其他参考音频。",
    voiceImportFailed: "无法将选中的录音导入工程。",
    chooseWeights: "选择 GPT-SoVITS 权重", gptWeight: "GPT 权重", sovitsWeight: "SoVITS 权重", selectWeight: "选择",
    weightsUnavailable: "无法读取权重，请检查 ComfyUI 连接与 GPT-SoVITS 加载节点。", weightsEmpty: "加载节点未发现此类权重。",
    text: "朗读文本", textPlaceholder: "输入希望合成的新台词", textRequired: "请填写要朗读的文本。",
    reference: "参考音频", referenceRequired: "请添加一段 3–10 秒的参考音频。",
    transcript: "参考录音原台词", transcriptRequired: "请填写参考录音里实际说的话。",
    referenceLanguage: "参考录音语言", textLanguage: "朗读语言", cut: "切句方式",
    speed: "语速（倍）", interval: "段间停顿（秒）", invalidTiming: "语速须为 0.25–4 倍，段间停顿须为 0–30 秒。",
    invalidSeed: "GPT-SoVITS 的固定种子须为 0–4294967295 的整数。", invalidSettings: "请选择 GPT-SoVITS 支持的语言和切句方式。",
    languages: { auto: "自动", all_zh: "中文", zh: "中英混合", en: "英语", all_ja: "日语", ja: "日英混合", all_yue: "粤语", yue: "粤英混合", all_ko: "韩语", ko: "韩英混合", auto_yue: "自动（中文按粤语）" },
    cuts: { punctuation: "按标点切", none: "不切", fourSentences: "四句一切", fiftyCharacters: "约五十字一切", chineseFullStop: "按中文句号切", englishFullStop: "按英文句号切", eachLine: "按行独立合成" },
  },
  resourceUsedInCanvas: "画布使用中", resourceUnregistered: "未登记",
  resourceUnregisteredHint: "此文件未登记自动回收归属，是否被节点使用不改变其归属；不会自动移入回收站。",
  promptParameterChanges: "提示词转换",
  referenceLabelsHint: "自定义图片、视频和音频前缀，编号按实际输入顺序排列。MiniMax 默认使用 Picture / Video / Audio。",
  referenceLabel: "{kind}标记前缀",
  referenceLabelsReset: "恢复默认",
  referenceLabelsInvalid: "前缀须以英文字母开头，最多32位，仅含字母、数字、下划线或短横线；三类不能重名，也不能借用其他类型的默认前缀。",
  defaultLoraChecking: "已采用工作流默认 LoRA，正在核对服务清单…",
  defaultLoraInherited: "已采用工作流默认 LoRA，生成时加载；清单核对不代表权重已载入。",
  defaultLoraListFailed: "无法读取 ComfyUI 的 LoRA 清单，请检查服务地址和连接；默认配置已保留。",
  defaultLoraMissing: "默认 LoRA 未在服务清单中找到：{name}。请安装对应文件或更换扩展。",
  defaultLoraAmbiguous: "默认 LoRA 存在多个同名文件：{name}。请明确选择对应版本。",
  batchFromLibrary: "从资源库导入", batchFromLocal: "本地导入", batchFromNodes: "现有节点资源",
  imageTools: "图像", compareImage: "对比图像", compareOriginal: "原图", compareResult: "处理后", compareDivider: "图像对比分界线",
  compareHint: "连接原图和处理后图片，或直接连接图片超分节点。", compareWaiting: "等待处理后图片，当前显示原图。", compareFailed: "处理后图片读取失败，仍显示原图。",
  upscaleComplete: "超分完成",
  upscale: "超分",
  postUpscale: "生成后超分",
  upscaleEnable: "一键启用",
  networkPreview: "节点网预览",
  networkPrevious: "上一个节点",
  networkNext: "下一个节点",
  networkLocate: "定位到节点",
  networkCount: "关联节点 {current} / {total}",
  networkEmpty: "这个节点还没有可预览的内容。",
  upscaleSettings: "超分设置",
  upscaleModel: "超分模型",
  upscaleBatchFrames: "每批帧数",
  upscaleSeedMode: "随机种子",
  upscaleSeedRandom: "全部随机",
  upscaleSeedFixed: "固定",
  upscaleSeedShared: "随机一次后共用",
  upscaleSeed: "固定种子",
  upscaleSeedInvalid: "请输入0至9007199254740991的整数。",
  upscaleBatchHint: "每批1秒，FPS跟随每批帧数（1–120）；合并后恢复原视频FPS。",
  upscaleImageSeedHint: "固定模式使用输入种子；其他模式在提交时随机生成。",
  upscaleScale: "放大倍数",
  upscaleHint: "使用 SeedVR2 3B / 7B，默认7B放大2倍。先完成生成，再单独提交超分；请先安装对应模型与节点。",
  upscaleInvalid: "请选择3B或7B、2至8倍、1至120批帧数，以及有效的种子。",
  upscaleNoResult: "超分未返回有效媒体，请检查模型、节点和输出。",
  upscaleVideoUnavailable: "视频分批超分不可用，请完全退出并重新启动应用。",
  upscaleSource: "请连接一张图片或一个视频。",
  upscaleFailedOriginal: "超分失败；生成的原图已保留在原输出目录。",
  upscaleRunning: "正在超分…",

  outputCustom: "自定义画质",
  outputWidth: "宽（px）",
  outputHeight: "高（px）",
  // FPS单位与翻译文案分开，业务字段不依赖当前语言。
  videoFpsLabel: "帧率（FPS）",
  videoMegapixels: "百万像素",
  videoMegapixelsValue: "{value} 百万像素",
  videoMegapixelsHint: "按 1024² 像素计算面积，宽高对齐至 32 像素；取整后面积略有差异。",
  videoDurationLabel: "时长（秒）",
  videoSeconds: "{value}秒",
  videoNumberInvalid: "请输入大于0且为{step}倍数的数字。",
  videoOutputSizeInvalid: "视频宽高需为至少2的偶数整数。",
  outputSizeInvalid: "宽高需为至少8的整数，且是8的倍数。",
  generationCancelled: "已取消本次生成，已保存的图片仍保留在图库。",

  promptToolsAdd: "将{label}显示到工具栏", promptToolsRemove: "移出工具栏中的{label}", promptToolsScene: "场景", promptTools3D: "3D", promptToolsAction: "动作",
  mossCompositionTooLong: "构图超过画布提示词的 4000 字符上限，请缩短描述或减少区域。",
  promptToolsMore: "展开更多提示词工具", promptToolsLess: "编辑",
  promptToolsDone: "收起", promptToolsScrollLeft: "向左查看工具", promptToolsScrollRight: "向右查看工具",
  generationComplete: "已生成 {count} 张图片", generationFailed: "生成失败，请检查工作流、模型与服务连接。",
  addReference: "添加输入图片",
  insertAudio: "插入音频",
  removeReference: "移除输入图片：{name}",

  // 远端图片的模式、约束与真实任务反馈。
  modeTextImage: "文生图",
  modeImageImage: "图生图",
  imageInputOverflow: "图片输入不符合此模式：文生图不接图片，图生图仅一张；请先删除多余连线。",
  remoteKeyMissing: "请在设置 → API 密钥 → Euzhi 图片生成中填写专用密钥。",
  remoteCancelled: "已取消本地等待。远端可能仍在处理，请检查 Euzhi 消费记录。",
  remoteTimeout: "请求超过 180 秒。请先查看 Euzhi 消费记录，避免重复扣费。",
  remoteInputInvalid: "请检查提示词和输入图片数量，并确认所有参考节点均已有 PNG/JPEG/WebP 图片。",
  remoteHttpError: "Euzhi 返回 HTTP {status}：401 检查密钥，403 检查模型权限，429 稍后再试；其他错误先查消费记录。",
  remoteFailed: "图片请求或结果保存失败，原节点内容已保留。请先检查 Euzhi 消费记录再决定重试。",
  remoteComplete: "已保存 {count}/{requested} 张真实结果。少于请求数量时请检查平台记录。",
  remoteVideoUnavailable: "尚未接通远端视频服务。",

  // 入口选择的是创建页模板，不把 SDXL/Anima 系列名误称为本地模型文件。
  // 文字改图与蒙版、边缘工具分开，仅前者属于本轮编辑工作流。
  // 模板选择可保存，但不能用该说明代替真实生成任务状态。
  workflow: "工作流", imageEditWorkflow: "图片编辑 · 文字改图", workflowConfiguration: "复用创作页组件；参数独立保存在当前节点，由节点生成按钮统一提交。",
  // 只说明现有接线边界，不把选择器缺失说成用户本机缺少模型。
  // Wan 与 MiniMax 的构建能力不同，不能提供会被忽略的 LoRA 参数入口。
  // 同步英文键，主题和语言切换不会改变已保存模板身份。
  workflowLoraUnavailable: "此工作流尚未接通 LoRA 配置；与创建页保持一致。",
// 菜单的复制只拍底稿，不沿用旧立即重复节点的含义。
  copy: "复制节点",
// 剪切作用于图节点，文案不暗示移动系统原文件。
  cut: "剪切节点",
// 粘贴只有本会话已复制节点时才出现在菜单。
  paste: "粘贴节点",
// 连线菜单明确说连线，避免用户误认为会删除媒体。
  removeEdge: "删除连线",
// 方案调整展示外壳，不等于图片生成画面比例。
  cardStyle: "卡片样式",
  addAnnotation: "添加标注",
  editAnnotation: "编辑标注：{text}",
  annotationSettings: "编辑标注",
  annotationPlaceholder: "输入标注，回车保存",
  annotationText: "标注文字",
  annotationColor: "标注颜色",
  annotationColorValue: "选择颜色 {color}",
  annotationCustomColor: "自定义颜色",
  annotationLimit: "每个节点最多添加 8 个标注",
  removeAnnotation: "删除标注",
  noteStyle: "便签样式",
  notePlain: "普通便签",
  noteTape: "胶带便签",
  notePin: "图钉便签",
  noteColor: "纸张颜色",
  noteYellow: "浅黄",
  notePink: "粉色",
  noteBlue: "浅蓝",
  noteGreen: "浅绿",
  noteOrange: "浅橙",
// 正方形方案只控制卡片几何，不对媒体执行裁剪。
  cardSquare: "正方形",
// 长方形名称与视频类别分开，文本卡也可使用。
  cardRectangle: "长方形",
// 自定义入口需要确认表单，不在悬停时改尺寸。
  cardCustom: "自定义尺寸",
// 宽度标出画布单位，避免用户误当导出分辨率。
  cardWidth: "宽度（画布像素）",
// 高度同属世界单位，不包含卡片下方展开参数区。
  cardHeight: "高度（画布像素）",
// 正在复制是真实磁盘阶段，不能写成模型正在生成。
  importing: "正在复制素材到工程目录…",
  // 移动是独立的磁盘阶段，不让“复制中”掩盖原视频即将离开原目录。
  movingMedia: "正在移动视频到工程目录…",
  // 系统框和外部拖入后的确认用同一标题，区别于工程包导入。
  importMethod: "视频导入方式",
  // 每次新批次默认选择这一项，不记住上次移动选择。
  copyMedia: "复制（默认）",
  // 移动是磁盘语义，与剪切图节点区分。
  moveMedia: "移动（剪切）",
  // 默认保留来源，工程使用自己持有的副本。
  copyMediaHelp: "复制到画布工程目录，原文件保留在原位置。",
  // 删除副作用必须在确认之前可见，不能等成功后才告诉用户。
  moveMediaHelp: "视频将移到画布工程目录，完成后原位置不再保留该文件。",
  // 说明混合批次和已有工程保护，避免用户误判其他资产也会搬走。
  importMethodScope: "图片、音频仍按复制导入；已有画布工程内的视频不允许移动，请选复制。",
// 整批失败提醒原画布保留，用户可检查目录权限重试。
  importFailed: "素材导入失败，原画布已保留。请检查文件和工程目录权限。",
// 工程导入会替换图，名称与追加本地素材区分。
  openProject: "导入画布工程",
// 导出指完整工程包，不是截图或视频渲染输出。
  exportProject: "导出画布工程",
// 未保存覆盖确认同时给出先保存或导出的可行动建议。
  openConfirm: "导入工程将替换当前画布。未保存的改动会丢失，请先保存或导出。",
// 读包成功后仍需保存当前草稿，不能显示已自动保存。
  projectOpened: "工程已导入；可继续编辑并保存当前草稿。",
// 只有包和素材实际写完才允许使用这个完成文案。
  projectExported: "工程及素材已导出。",
// 固定提示不展示底层系统异常里的私人完整路径。
  projectFailed: "工程操作失败。请检查素材是否存在、文件权限以及工程版本或完整性。当前画布已保留。",
// 处理工程不提供假百分比，等待由实际请求结束。
  projectBusy: "正在处理本地工程文件，请稍候…",
// 暂停名称来自真实播放状态，用于图标的无障碍标签。
  pauseMedia: "暂停视频",
// 播放按钮不是自动播放承诺，权限拒绝仍会反馈错误。
  playMedia: "播放视频",
// 音频有独立的无障碍名称，不能把声音播放按钮读成播放视频。
// 与真实 paused 状态一起更新，不作为已经播放成功的提示。
// 不修改视频旧文案，既有视频入口的标签保持原业务含义。
  playAudio: "播放音频",
// 暂停标签只表示按钮下一步动作，当前是否在播放由媒体事件反馈。
// 复用实际播放器而非节点任务状态，选中卡片本身不能触发标签变化。
// 单独登记词条让切换语言仍能获得与音频类型一致的名称。
  pauseAudio: "暂停音频",
// 音频波形定位的是源文件位置，不是画布工程的统一时间轴。
// 进度控件读出真实秒数，滚动窗口不会把范围值改成百分比。
// 与视频的旧进度名称分开，避免影响已存在的自动化与读屏语义。
  audioSeek: "音频播放进度",
// 进度标签指源视频，不能让用户误认为在定位画布工程。
  mediaSeek: "视频播放进度",
// 切换静音表达一个双向动作，持续状态另由 aria-pressed 说明。
  muteMedia: "切换静音",
// 全屏只预览所属视频，不切换整个编辑器工程模式。
  fullscreen: "全屏预览",
// 权限或环境导致全屏失败，不应提示工程损坏。
  fullscreenFailed: "无法进入全屏。",
// 当前帧导出是源媒体截图，不包含卡片工具和选框。
  captureFrame: "截取当前帧",
// 截帧忙碌标签沿用导出语义，不伪称已经写出图片。
  capturing: "正在导出…",
// 失败提示明确检查现有 FFmpeg 与输出目录，不要求上传文件。
  frameFailed: "当前帧导出失败，请检查 FFmpeg 与输出目录。",
  fitMedia: "适应",
  title: "无限画布", untitled: "未命名画布",
  persistenceLoading: "正在读取本地草稿", persistenceReady: "本地草稿已保存", persistenceError: "本地草稿保存失败",
  empty: "右击画布，开始创作", emptyHint: "把想法放在一起，让灵感自由连接",
  connectNewNode: "连接到新节点",
  imageGeneration: "图片生成",
  videoGeneration: "视频生成",
  add: "添加节点", text: "文本", image: "图片", video: "视频", audio: "音频", note: "便签",
  pan: "平移画布", select: "选择节点", undo: "撤销", redo: "重做", remove: "删除选中项",
  fit: "适配全部", reset: "恢复 100%", grid: "显示点阵", help: "操作说明",
  // 帮助里区分复制底稿与立即创建副本，避免用户以为复制没有响应。
  // C/X/V 是画布对象操作的发现入口，原 D 快捷键继续可用。
  // 这里不列未接通的保存云端或生成快捷键。
  // 删除说明指选择集，连线与节点都遵循同一命令边界。
  helpText: "拖动空白平移 · 滚轮平移 · Ctrl/⌘ + 滚轮缩放 · Shift 多选/框选 · Delete 删除 · Ctrl/⌘ + C/X/V 复制/剪切/粘贴 · Ctrl/⌘ + D 立即创建副本 · Ctrl/⌘ + Z 撤销 · 端口点击或拖动连线 · Esc 取消",
  prompt: "提示词",
  textHint: "双击编写文本", noteHint: "双击记录想法", mediaHint: "尚无媒体结果",
  manual: "手写内容", count: "{nodes} 个节点 · {edges} 条连接",
  settings: "节点参数", collapse: "收起参数", expand: "展开参数", ratio: "画面比例", model: "模型未接入",
  generate: "生成", unavailable: "本地素材可导入预览；模型生成、云端上传和生成结果仍未接入。",
  input: "输入端口", output: "输出端口", connectHint: "请选择目标输入端口；Escape 取消",
  self: "不能连接到自身或已删除的节点。", duplicateEdge: "这两个节点已连接。",
  type: "这两种节点暂不支持引用。", cycle: "连接会形成循环，请选择其他节点。",
  connected: "已建立本地引用连接", titleLabel: "节点名称", close: "关闭",
  locate: "定位节点", preview: "预览结果", nodeCopy: "复制节点", nodeHistory: "生成历史", pin: "固定工具条",
  canvasSettings: "画布设置", closeSettings: "关闭画布设置", snap: "拖拽吸附网格", guides: "对齐辅助线", linkedPreview: "联动预览",

  taskFailed: "生成失败",
  taskRunning: "生成中…",
  openComposer: "打开视频合成",
  composition: "视频合成",
  reference: "添加参考素材",
  quickPrompts: "快捷提示词 >_",
  styleTransfer: "风格转换",
  palette: "调色盘",
  camera: "运镜",
  generationMode: "生成方式",
  modeTextVideo: "文生视频",
  modeReference: "全能参考",
  modeEdit: "视频编辑",
  modeExtend: "视频延长",
  modeMotion: "动作模仿",
  modeVoice: "音色生成",
  modeMusic: "音乐生成",
  modeRecord: "录音",
  promptText: "请输入您的问题或指令…",
  promptImage: "请输入图片描述…",
  promptVideo: "请输入视频描述…",
  promptAudio: "请输入要转换的文本…",
  videoSettings: "视频设置",
  voice: "音色",
  neutral: "中性",
  parameters: "参数",
  polyphone: "多音字",
  batch: "批量",
  director: "导演台",
  world: "3D World",
  batchVideo: "批量导入视频节点",
  batchImage: "批量导入图片节点",
  layerEdit: "图层编辑",
  temporaryAssets: "临时资源",
  blender: "从 Blender 导入",
  assetLibrary: "素材库",
  minimap: "切换小地图",
  singleDraft: "当前使用单一本地草稿",
  brandMark: "幻",
  save: "保存画布",
  reload: "重新读取草稿",
  rename: "重命名画布",
  apply: "应用",
  cancel: "取消",
  retry: "重试",
  loadError: "本地草稿读取失败，请重试；没有覆盖磁盘数据。",
  saving: "正在保存…",
  unsaved: "有未保存的更改",
  reloadConfirm: "重新读取会放弃当前未保存的更改，是否继续？",
  settingsInteraction: "交互操作",
  settingsNotifications: "生成通知",
  settingsEdges: "连线设置",
  settingsGrid: "网格与显示",
  settingsNodes: "节点与布局",
  settingsBackground: "自定义背景",
  settingsTheme: "画布主题",
  settingsColors: "连线色彩",
  settingsSimple: "简化配色",
  restoreDefaults: "恢复默认",
  panSpeed: "画布平移灵敏度",
  animationLimit: "定位动画节点上限",
  blankAction: "空白区域操作",
  wheelAction: "滚轮默认操作",
  rightMenu: "右键菜单",
  doubleMenu: "双击菜单",
  zoom: "缩放",
  dragFocus: "拖动节点获取焦点",
  hoverAutoplay: "视频悬停自动播放",
  delaySubmit: "图/视延迟提交",
  settingsUnverified: "此页尚无完整参考证据，功能未接通。",
  composerUnavailable: "画布合成器尚未接入节点媒体引用，请使用现有视频编辑器处理文件。",
  uiOnly: "仅 UI，未接媒体引擎",
  export: "导出",
  materials: "素材",
  assetType: "素材类型",
  all: "全部",
  fromLibrary: "从素材库添加",
  emptyTimeline: "把素材拖到下方时间轴开始剪辑",
  play: "播放 / 暂停",
  properties: "属性",
  selectClip: "选中时间轴上的片段后，可在这里调整属性。",
  timelineZoom: "时间轴缩放",
  // 导入与解码分开反馈：记录文件引用并不等于浏览器已经成功播放。
  // 工作区通用入口同时允许三类文件，名称不能继续说“上传”暗示联网。
  // 同一词条供底栏与添加菜单，避免两个入口出现不同的能力说明。
  importMedia: "导入本地素材",
  // 空图片卡的具体动作，选择框会限制到已支持的图片后缀。
  // 与生成按钮分开，不会把选择已有图片当作 AI 已生成结果。
  importImage: "导入图片",
  // 空视频卡的具体动作，不承诺导入后就进入剪辑时间线。
  // 播放能否成功要等真实解码，不在这个按钮名称中提前保证。
  importVideo: "导入视频",
  // 空音频卡导入的是已有文件，不是录音，不需要暗示麦克风权限。
  // 模式条的音色生成仍是另一套尚未接通的服务能力。
  importAudio: "导入音频",
  // 更换只修改卡片媒体引用，保留用户标题、提示词与端口关系。
  // 不使用“删除原文件”或“覆盖文件”的文字误导实际只读行为。
  replaceMedia: "更换文件",
  // 卡片内部加载态由原生 load/loadeddata 结束，不是生成队列运行状态。
  // 不显示估算百分比，因为没有真实的全文件读取进度来源。
  mediaLoading: "正在读取本地素材…",
  // 文件缺失和编码不支持都能在此操作恢复，不向用户暴露协议堆栈。
  // 保留“请更换”这个可行动提示，原引用仍留在作品里便于修复。
  mediaError: "文件不存在、无法解码或读取超时，请重试或更换文件。",
  // names 由实际拒绝项的基本名组成，不能把完整路径发进批量错误提示。
  // 混合批次可部分成功，因此不能写成“本次全部导入失败”。
  // 导入边界限制 names 的显示长度，这个词条本身不丢改用户文件名。
  importRejected: "以下文件无法导入，请使用支持的本地图片、视频或音频：{names}",
  // count 表示已经登记进图的引用数，不是媒体解码完成数。
  // 后半句提醒用户以每张卡的实际加载状态为准，避免假成功。
  // 更换一张现有卡同样计入此动作反馈，但不会因此增加节点计数器。
  imported: "已添加 {count} 份本地素材引用；解码状态以卡片为准。",
  // 普通浏览器可以打开文件框，但没有桌面持久路径能力，必须明确区分。
  // 不提供刷新后必失效的 Blob 回落来假装已经支持保存恢复。
  importDesktop: "本地素材需要桌面客户端的文件路径能力。",
  // 取消选择不是导入失败，不清空已有图片、视频或音频节点。
  // 没有选择结果时不能沿用上一条“已添加”的反馈。
  importCancelled: "已取消选择，原素材保持不变。",
  // 工作流菜单的来源和系列是导航层级，不作为磁盘模板编号保存。
  // 本地和非本地来源共用标签，是否可点击由菜单项实际能力决定。
  // 非本地说明只用于禁用原因，不应返回一个假的配置完成状态。
  // 标准文生图在 Anima 和 SDXL 各出现一次，父层系列负责区分同名叶子。
  // 图片编辑沿用既有文字改图词条，不把蒙版或边缘功能藏进相同短标签。
  // generationCount 是选项组的可访问名称，选项文字采用通用乘号和数字。
  // 数量标签不用替换工作流内部名称，切语言不能改变节点记录的配置。
  // 这些词条只负责界面表达，不包含具体用户模型名、目录或服务凭据。
  // 保留同一组键供已登记语言使用，不通过动态拼接隐藏未翻译文本。
  // 旧 countOne 已无调用，改用真实 batchSize 展示，不留未引用的静态一张标签。
  localWorkflows: "本地",
  remoteWorkflows: "非本地",
  remoteWorkflowsUnavailable: "非本地工作流暂未接通。",
  standardImageWorkflow: "标准文生图",
  generationCount: "生成数量",
  compositionLoading: '正在打开原视频合成器…',
  compositionOperationError: '操作未完成，内容已保留。请重试保存或检查本地文件。',
  compositionResult: '视频合成结果',
  compositionSizeLimit: '单份文件需大于 0 且不超过 256 MiB。',
  compositionDownloadSaved: '成片已保存到所选位置。',
  compositionDownloadCancelled: '已取消另存为。',
  compositionLocalOnly: '仅本地处理 · 画布出口回填视频节点 · 不上传网络',
  library: '画布工作区',
  allProjects: '全部画布',
  newProject: '新建画布',
  newFolder: '新建文件夹',
  folders: '分类文件夹',
  removeFolder: '删除空文件夹',
  emptyFolderOnly: '仅可删除空文件夹',
  libraryStorage: '本地存储：user/Infinite Canvas/',
  searchProjects: '搜索画布',
  recentUpdated: '最近修改',
  libraryError: '读取或保存工程失败，原数据保留，请重试。',
  workspaceUnavailable: '工程目录的归属记录不一致或已丢失，未执行操作。请重新加载工程库以找回有效工程。',
  databaseConflict: '工程登记遇到数据冲突。请先刷新工程库确认是否已创建，不要连续重复提交。',
  databaseBusy: '工程数据库忙碌或结果尚未确认。请稍后刷新工程库核对结果，再决定是否重试。',
  multiSelect: '多选',
  cancelSelection: '取消选择',
  selectAll: '全选',
  selectedProjects: '已选择 {count} 项',
  projectNodeCount: '{count} 个节点',
  noProjects: '暂无画布，点击新建开始。',
  noMatchingProjects: '没有匹配的画布。',
  moveToFolder: '移动到分类',
  removeProject: '删除画布',
  projectDeleteNotice: '永久删除所选画布的工程文件夹和专属素材，无法撤销。外部原文件不删除；若其他画布仍引用此处素材，将阻止删除并提示。',
  purgeDeleted: '清理已删画布资源',
  purgeDeletedNotice: '永久清理之前已删除画布遗留的工程文件夹和素材，无法撤销。保留现有画布和外部原文件；仍被其他画布引用的资源会阻止本次清理。请先关闭所有打开或挂起的画布。',
  deleteSharedAssets: '其他画布仍在引用此画布的素材，未执行删除。请先在其他画布移除或替换这些引用，再重试。',
  deleteFilesFailed: '部分工程文件未能删除，可能仍被占用。请关闭相关播放器后重试，或在画布库使用“清理已删画布资源”继续清理。',
  deleteReferenceFailed: '无法核对其他画布的素材引用，未执行删除。请先修复缺失的工程目录，再重试。',
  closeBeforeDelete: '请先关闭其他已打开或挂起的画布，再删除资源。',
  projectMenu: '画布管理',
  suspend: '挂起并返回工作区',
  closeToLibrary: '关闭并返回工作区',
  suspended: '已挂起',
  suspendedCanvases: '挂起的画布',
  sessionBusy: '操作尚未完成或保存失败，请稍后重试。关闭前请等待生成结束；挂起可保留任务。',
  lockSize: '固定尺寸',
  unlockSize: '允许调整尺寸',
  fixAllSizes: '固定所有组件尺寸',
  fixAllSizesHelp: '开启后全部恢复默认尺寸，并禁止拖动边缘和菜单改尺寸；关闭后允许未单独固定的组件自由伸缩。',
  projectResources: "工程素材",
  resourceAll: "全部",
  resourceTrash: "回收区",
  resourcePolicy: "未登记文件不回收；受管资源保存并关闭后无引用才进入回收区，24小时后清理。",
  resourceUnknown: "未知归属",
  resourceManaged: "受管",
  resourceRetained: "已保留",
  resourceEmpty: "当前没有素材",
  resourceRestore: "恢复并保留",
  resourceRetain: "保留素材",
  resourceUnretain: "取消保留",
  resourceUse: "使用素材",
  previewInfo: "图片信息",
  previewReset: "重置视图",
  previewResolution: "分辨率",
  previewFileSize: "大小",
  previewZoom: "预览缩放",
  previewClockwise: "顺时针旋转",
  previewCounterclockwise: "逆时针旋转",
  networkSwitch: "切换",
  resourceTruncated: "素材较多，仅显示前2000个文件；深层目录请使用本地导入。",
  resourceBlocked: "归属待核对（不回收）",
  globalResources: "全局资源库",
  resourceSource: "素材来源",
  resourceSelectAllHint: "全选当前分类，再次点击全部取消",
  globalResourcePolicy: "全局资源可在所有画布中引用；导入只复制文件，不创建节点或连线。",
  resourceDeleteConfirm: "将选中的 {count} 项移入系统回收站？仍被引用的资源不能删除。",
  resourceInUse: "资源仍被当前画布或其他已保存画布使用，请先移除引用。",
  resourceChanged: "资源已变化，请刷新列表后重新选择。",
  resourcePartialFailure: "部分资源操作失败，请查看刷新后的列表。",
  globalResourceLoadFailed: "全局资源库读取失败，请重新打开参数面板重试。",
  mentionLibrary: "资源库",
  mentionImages: "图片",
  mentionAudio: "音频",
  resourceLoading: "正在读取素材…",
} as const;

// 画布文案单独归档，避免把本地UI草稿描述成已经接通的生成工程。
export const canvas = {
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
  title: "无限画布", untitled: "未命名画布",
  persistenceLoading: "正在读取本地草稿", persistenceReady: "本地草稿已保存", persistenceError: "本地草稿保存失败",
  empty: "双击画布，开始创作", emptyHint: "把想法放在一起，让灵感自由连接",
  add: "添加节点", text: "文本", image: "图片", video: "视频", audio: "音频", note: "评论便签",
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
  editor: "视频编辑器", editorHint: "打开现有视频编辑器；画布节点暂不传入素材",
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
  countOne: "1张",
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
} as const;

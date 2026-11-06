// 英文与中文共享键结构，切换语言不改变节点身份、坐标和草稿。
export const canvas = {
// 英文 Copy nodes 区分系统文本复制与图对象底稿。
  copy: "Copy nodes",
// 英文 Cut nodes 保留节点对象范围，不翻译成文件移动。
  cut: "Cut nodes",
// 英文粘贴入口与中文使用同一个条件，不依赖翻译文字判断可用。
  paste: "Paste nodes",
// 英文连接删除项不沿用普通 Delete selected 的模糊对象。
  removeEdge: "Delete connection",
// 英文 Card style 表示展示方案，不使用输出画幅的术语。
  cardStyle: "Card style",
// 方案代码仍是 square，英文标签不会写回存档字段。
  cardSquare: "Square",
// 方案代码 rectangle 与节点 kind 保持各自独立。
  cardRectangle: "Rectangle",
// 自定义标题供共用弹层使用，不创建另一份英文表单。
  cardCustom: "Custom size",
// 英文宽度标签也说明 canvas units，双语单位不能矛盾。
  cardWidth: "Width (canvas pixels)",
// 英文高度没有换算成源视频像素，保存数字与中文一致。
  cardHeight: "Height (canvas pixels)",
// 英文复制进度说明本地项目目录，不能误用 Uploading。
  importing: "Copying media to the project…",
  // 移动中的英文反馈必须说明是本地搬运，不沿用复制或生成中的含义。
  movingMedia: "Moving videos to the project…",
  // 英文界面也使用统一视频导入标题，不把拖入叫作后台上传。
  importMethod: "Video import method",
  // 英文默认选项保留 default 标识，与初始化为复制的模式对应。
  copyMedia: "Copy (default)",
  // 英文 cut 在此描述磁盘剪切，与菜单的 Cut node 具有不同对象。
  moveMedia: "Move (cut)",
  // 保留原文件的结果在复制说明中明确表达，不能只显示通用确认文字。
  copyMediaHelp: "Copy into the canvas project folder and keep the original files.",
  // 英文移动说明也提前告知原位置将没有文件，不依赖中文警示。
  moveMediaHelp: "Move videos into the canvas project folder. The original locations will no longer contain these files.",
  // 英文同步约束混合批次和受管资产，避免切换语言后丢失操作边界。
  importMethodScope: "Images and audio are always copied. Videos already inside a canvas project cannot be moved; choose Copy instead.",
// 英文失败同样强调已有画布未丢失，避免只剩技术错误码。
  importFailed: "Import failed. The canvas is intact. Check file and project folder permissions.",
// 英文 Import project 与 Import media 分开，操作结果范围不同。
  openProject: "Import canvas project",
// 英文 Export project 对应 ircanvas，不指 PNG 截帧。
  exportProject: "Export canvas project",
// 英文确认文案保留覆盖当前画布的后果，不弱化未保存风险。
  openConfirm: "Importing replaces the current canvas. Save or export unsaved changes first.",
// 英文完成提示也保留继续编辑并保存草稿的下一步。
  projectOpened: "Project imported. Continue editing and save the current draft.",
// 英文完成提示包含 assets，反映包确实携带媒体正文。
  projectExported: "Project and media exported.",
// 英文错误原因与中文对应，不把内部异常堆栈直接翻译展示。
  projectFailed: "Project operation failed. Check media, permissions, project version and integrity. The canvas is intact.",
// 英文等待没有虚构剩余秒数，也不写成云端处理。
  projectBusy: "Processing local project files…",
// 英文暂停无障碍标签与图标真实状态同步。
  pauseMedia: "Pause video",
// 英文播放动作不在媒体未 ready 时开放。
  playMedia: "Play video",
// 英文视频进度名称只用于所属 range 控件。
  mediaSeek: "Video playback position",
// 英文静音标签与 pressed 状态组合表达当前切换能力。
  muteMedia: "Toggle mute",
// 英文全屏动作复用同一 requestFullscreen，不受语言切换重建。
  fullscreen: "Fullscreen preview",
// 英文全屏错误局限当前卡片，不覆盖工程保存状态。
  fullscreenFailed: "Unable to enter fullscreen.",
// 英文捕帧标签强调 current frame，不暗示导出完整视频。
  captureFrame: "Capture current frame",
// 英文忙碌文案只持续真实 frame 作业生命周期。
  capturing: "Exporting…",
// 英文失败保留 FFmpeg 与输出目录两个排查点。
  frameFailed: "Frame export failed. Check FFmpeg and the output folder.",
  title: "Infinite canvas", untitled: "Untitled canvas",
  persistenceLoading: "Loading local draft", persistenceReady: "Local draft saved", persistenceError: "Local draft save failed",
  empty: "Double-click to start creating", emptyHint: "Bring ideas together and connect your inspiration",
  add: "Add node", text: "Text", image: "Image", video: "Video", audio: "Audio", note: "Note",
  pan: "Pan canvas", select: "Select nodes", undo: "Undo", redo: "Redo", remove: "Delete selection",
  fit: "Fit all", reset: "Reset to 100%", grid: "Show dots", help: "Controls",
  // 快捷键说明同时列出底稿复制与立即重复，两者不再混为同一个动作。
  // 英文按与中文相同的快捷键范围展示，不因语言不同少提示剪切。
  // 说明文字只帮助发现能力，不参与实际按键分派。
  // 输入框内仍使用原生文本快捷键，实际隔离在 handleKey 负责。
  helpText: "Drag blank space or scroll to pan · Ctrl/⌘ + wheel to zoom · Shift to select/box select · Delete to remove · Ctrl/⌘ + C/X/V to copy/cut/paste · Ctrl/⌘ + D to duplicate immediately · Ctrl/⌘ + Z to undo · Click or drag ports to connect · Esc to cancel",
  prompt: "Prompt",
  textHint: "Double-click to write", noteHint: "Double-click to add a thought", mediaHint: "No media result yet",
  manual: "Written content", count: "{nodes} nodes · {edges} connections",
  settings: "Node parameters", collapse: "Collapse parameters", expand: "Expand parameters", ratio: "Aspect ratio", model: "No model connected",
  generate: "Generate", unavailable: "Local media can be imported and previewed; generation, cloud uploads and generated results are not connected.",
  input: "Input port", output: "Output port", connectHint: "Choose an input port; Escape to cancel",
  self: "Cannot connect a node to itself or a deleted node.", duplicateEdge: "These nodes are already connected.",
  type: "These node types do not support references yet.", cycle: "This connection would create a cycle. Choose a different node.",
  connected: "Local reference connection created", titleLabel: "Node name", close: "Close",
  editor: "Video editor", editorHint: "Open the existing video editor; canvas media is not transferred yet",
  locate: "Locate node", preview: "Preview result", nodeCopy: "Duplicate node", nodeHistory: "Generation history", pin: "Pin toolbar",
  canvasSettings: "Canvas settings", closeSettings: "Close canvas settings", snap: "Snap to grid", guides: "Alignment guides", linkedPreview: "Linked preview",

  taskFailed: "Generation failed",
  taskRunning: "Generating…",
  openComposer: "Open composition",
  composition: "Video composition",
  reference: "Add reference",
  quickPrompts: "Quick prompts >_",
  styleTransfer: "Style transfer",
  palette: "Palette",
  camera: "Camera",
  generationMode: "Generation mode",
  modeTextVideo: "Text to video",
  modeReference: "References",
  modeEdit: "Video edit",
  modeExtend: "Extend",
  modeMotion: "Motion",
  modeVoice: "Voice",
  modeMusic: "Music",
  modeRecord: "Recording",
  promptText: "Enter a question or instruction…",
  promptImage: "Describe the image…",
  promptVideo: "Describe the video…",
  promptAudio: "Enter text to convert…",
  countOne: "1 image",
  videoSettings: "Video settings",
  voice: "Voice",
  neutral: "Neutral",
  parameters: "Parameters",
  polyphone: "Pronunciation",
  batch: "Batch",
  director: "Director",
  world: "3D World",
  batchVideo: "Batch video nodes",
  batchImage: "Batch image nodes",
  layerEdit: "Layer editor",
  temporaryAssets: "Temporary resources",
  blender: "Import from Blender",
  assetLibrary: "Asset library",
  minimap: "Toggle minimap",
  singleDraft: "One local draft is available",
  brandMark: "IR",
  save: "Save canvas",
  reload: "Reload draft",
  rename: "Rename canvas",
  apply: "Apply",
  cancel: "Cancel",
  retry: "Retry",
  loadError: "Could not load the draft. Retry; disk data was not replaced.",
  saving: "Saving…",
  unsaved: "Unsaved changes",
  reloadConfirm: "Reloading discards unsaved changes. Continue?",
  settingsInteraction: "Interaction",
  settingsNotifications: "Notifications",
  settingsEdges: "Connections",
  settingsGrid: "Grid and display",
  settingsNodes: "Nodes and layout",
  settingsBackground: "Background",
  settingsTheme: "Canvas theme",
  settingsColors: "Edge colors",
  settingsSimple: "Simple colors",
  restoreDefaults: "Restore defaults",
  panSpeed: "Pan sensitivity",
  animationLimit: "Animation node limit",
  blankAction: "Blank area action",
  wheelAction: "Wheel action",
  rightMenu: "Right click",
  doubleMenu: "Double click",
  zoom: "Zoom",
  dragFocus: "Select on drag",
  hoverAutoplay: "Autoplay on hover",
  delaySubmit: "Delayed submit",
  settingsUnverified: "No complete reference evidence; settings are not connected.",
  composerUnavailable: "Canvas nodes have no media binding. Use the existing video editor for files.",
  uiOnly: "UI only; no media engine",
  export: "Export",
  materials: "Assets",
  assetType: "Asset type",
  all: "All",
  fromLibrary: "Add from library",
  emptyTimeline: "Add media to the timeline to start editing",
  play: "Play / Pause",
  properties: "Properties",
  selectClip: "Select a timeline clip to inspect properties.",
  timelineZoom: "Timeline zoom",
  // 导入与解码分开反馈：记录文件引用并不等于浏览器已经成功播放。
  // 英文沿用 import 而不是 upload，准确说明这一步没有向服务器发送文件。
  // 菜单与底栏引用同一个键，切语言不会出现一个叫素材库另一个叫导入。
  importMedia: "Import local media",
  // image 对应持久化内部 kind，不把 translated label 用作节点类型。
  // 文案简短以适配空卡按钮，具体格式范围由系统框 accept 呈现。
  importImage: "Import image",
  // video 对应本地预览入口，不能翻成创建时间线或生成视频。
  // 原文件可能无法解码，按钮只表示允许选择，不表示播放保证。
  importVideo: "Import video",
  // audio 表示文件，不用 record 混淆已有但未实现的录音模式。
  // 英文卡片复用原图标，翻译不新增额外的控件或业务分支。
  importAudio: "Import audio",
  // replace 的对象是节点来源引用，不会覆盖磁盘原文件。
  // 保持短词组，媒体上角区域不会因英文比中文宽而遮住播放器进度。
  replaceMedia: "Replace file",
  // loading 与生成运行状态分开，读本地媒体不是提交模型任务。
  // 此处使用真实媒体事件结束状态，译文不能写成固定进度百分比。
  mediaLoading: "Loading local media…",
  // missing 与 unsupported 都属于可通过更换文件恢复的来源错误。
  // 不拼接系统错误堆栈，避免英文提示泄露完整本地目录。
  mediaError: "File missing, decoding failed or reading timed out. Retry or replace it.",
  // names 插值保留用户文件基本名，不能因为英文界面就改写文件名大小写。
  // 其他合法文件仍会添加，所以不用 all failed 描述整个批次。
  importRejected: "Cannot import these files. Choose supported local images, videos or audio: {names}",
  // references 明确这里完成的是引用登记，不能用 uploaded 或 generated。
  // count 由真实成功登记数注入，不能取用户选中的全部文件数。
  // cards show actual decoding status 对应单卡真实加载或错误反馈。
  imported: "Added {count} local media references. Cards show actual decoding status.",
  // 桌面路径桥接缺失时给出原因，避免普通浏览器看起来点击无反应。
  // 不暗示需要联网或登录，当前限制来自宿主本地路径能力。
  importDesktop: "Local media requires the desktop file path bridge.",
  // cancelled 保留英式双写形式，与动作含义无关，不用它参与内部状态分支。
  // existing media is unchanged 对应取消不能清空或替换原有节点的契约。
  importCancelled: "Selection cancelled. Existing media is unchanged.",
} as const;

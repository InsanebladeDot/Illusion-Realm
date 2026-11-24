// 英文与中文共享键结构，切换语言不改变节点身份、坐标和草稿。
export const canvas = {
  gptSovits: {
    addVoice: "Add custom voice",
    customVoice: "Custom",
    voiceRole: "Character name",
    voiceTone: "Tone",
    chooseVoiceFile: "Choose audio and save",
    voiceSaved: "Added a recording for {name} · {tone}.",
    voiceInvalidFields: "Enter a valid character name, tone, and transcript. Character and tone names cannot contain path characters.",
    voiceAlreadyExists: "A recording with that filename already exists for this character and tone. Change the transcript filename and try again.",
    voiceInvalidFile: "Choose a non-empty WAV, MP3, FLAC, OGG, M4A, AAC, or OPUS file.",
    voiceSaveFailed: "Could not save the recording. Check that the character voice library is writable.",
    voice: "Voice", playPreview: "Preview clip", pausePreview: "Pause preview", previewFailed: "This clip could not be played.",
    voicesEmpty: "No reference recordings are available.", voicesUnavailable: "Could not read the reference recordings.", voiceSelected: "Using the {name} · {tone} recording.",
    voiceConflict: "Could not use this clip. Check whether the node already has a linked audio reference.",
    voiceImportFailed: "Could not import the selected clip into this project.",
    chooseWeights: "Choose GPT-SoVITS weights", gptWeight: "GPT weights", sovitsWeight: "SoVITS weights", selectWeight: "Select",
    weightsUnavailable: "Could not read the weights. Check the ComfyUI connection and GPT-SoVITS loader node.", weightsEmpty: "The loader found no weights of this type.",
    text: "Text to speak", textPlaceholder: "Enter the new lines to synthesize", textRequired: "Enter the text to speak.",
    reference: "Reference audio", referenceRequired: "Add a reference clip between 3 and 10 seconds long.",
    transcript: "Reference transcript", transcriptRequired: "Enter the actual words spoken in the reference clip.",
    referenceLanguage: "Reference language", textLanguage: "Spoken language", cut: "Sentence splitting",
    speed: "Speech speed (×)", interval: "Pause between segments (s)", invalidTiming: "Speech speed must be 0.25–4× and the pause must be 0–30 seconds.",
    invalidSeed: "A fixed GPT-SoVITS seed must be an integer from 0 to 4294967295.", invalidSettings: "Choose languages and a split method supported by GPT-SoVITS.",
    languages: { auto: "Automatic", all_zh: "Chinese", zh: "Chinese and English", en: "English", all_ja: "Japanese", ja: "Japanese and English", all_yue: "Cantonese", yue: "Cantonese and English", all_ko: "Korean", ko: "Korean and English", auto_yue: "Automatic (Cantonese for Chinese)" },
    cuts: { punctuation: "By punctuation", none: "Do not split", fourSentences: "Every four sentences", fiftyCharacters: "Every ~50 characters", chineseFullStop: "By Chinese full stop", englishFullStop: "By English full stop", eachLine: "Synthesize each line separately" },
  },
  resourceUsedInCanvas: "Used in canvas", resourceUnregistered: "Unregistered",
  resourceUnregisteredHint: "This file is not registered for automatic recycling. Node usage does not change its ownership; it will not be moved to trash automatically.",
  promptParameterChanges: "Prompt conversion",
  referenceLabelsHint: "Customize image, video and audio prefixes. Numbers follow actual input order. MiniMax defaults to Picture / Video / Audio.",
  referenceLabel: "{kind} marker prefix",
  referenceLabelsReset: "Restore defaults",
  referenceLabelsInvalid: "Start with a letter; use up to 32 letters, digits, underscores or hyphens. Prefixes must be distinct and cannot use another media type's default prefix.",
  defaultLoraChecking: "Using workflow default LoRAs. Checking the server list…",
  defaultLoraInherited: "Using workflow default LoRAs, loaded during generation. A list match does not mean weights are loaded.",
  defaultLoraListFailed: "Could not read the ComfyUI LoRA list. Check the server address and connection. Defaults have been kept.",
  defaultLoraMissing: "Default LoRA not found in the server list: {name}. Install the file or choose another extension.",
  defaultLoraAmbiguous: "Multiple files match the default LoRA: {name}. Select the intended version.",
  batchFromLibrary: "Import from library", batchFromLocal: "Import local files", batchFromNodes: "Existing node media",
  imageTools: "Image", compareImage: "Compare images", compareOriginal: "Original", compareResult: "Processed", compareDivider: "Image comparison divider",
  compareHint: "Connect the original and processed images, or an image upscale node.", compareWaiting: "Waiting for the processed image. Showing the original.", compareFailed: "Could not load the processed image. Showing the original.",
  upscaleComplete: "Upscaling complete",
  upscale: "Upscale",
  postUpscale: "Upscale after generation",
  upscaleEnable: "Enable and run",
  networkPreview: "Connected node preview",
  networkPrevious: "Previous node",
  networkNext: "Next node",
  networkLocate: "Locate node",
  networkCount: "Connected node {current} / {total}",
  networkEmpty: "This node has no content to preview yet.",
  upscaleSettings: "Upscale settings",
  upscaleModel: "Upscale model",
  upscaleBatchFrames: "Frames per batch",
  upscaleSeedMode: "Seed mode",
  upscaleSeedRandom: "Random each batch",
  upscaleSeedFixed: "Fixed",
  upscaleSeedShared: "Random once, reuse",
  upscaleSeed: "Fixed seed",
  upscaleSeedInvalid: "Enter an integer from 0 to 9007199254740991.",
  upscaleBatchHint: "Each batch is 1 second. FPS follows batch frames (1–120); the final video restores source FPS.",
  upscaleImageSeedHint: "Fixed mode uses your seed; other modes draw a seed when submitted.",
  upscaleScale: "Scale factor",
  upscaleHint: "SeedVR2 7B, 2× by default. Generation finishes before a separate upscale request. Requires the model and nodes.",
  upscaleInvalid: "Choose 3B or 7B, 2–8×, 1–120 frames per batch and a valid seed.",
  upscaleNoResult: "Upscaling returned no media. Check models, nodes and outputs.",
  upscaleVideoUnavailable: "Batched video upscaling is unavailable. Fully quit and restart the app.",
  upscaleSource: "Connect one image or one video.",
  upscaleFailedOriginal: "Upscaling failed. The original image remains in its output folder.",
  upscaleRunning: "Upscaling…",

  outputCustom: "Custom resolution",
  outputWidth: "Width (px)",
  outputHeight: "Height (px)",
  // FPS单位与翻译文案分开，业务字段不依赖当前语言。
  videoFpsLabel: "Frame rate (FPS)",
  videoMegapixels: "Megapixels",
  videoMegapixelsValue: "{value} MP",
  videoMegapixelsHint: "Area uses 1024² pixels per MP. Dimensions align to 32 pixels, so the final area may vary slightly.",
  videoDurationLabel: "Duration (seconds)",
  videoSeconds: "{value}s",
  videoNumberInvalid: "Enter a positive number in increments of {step}.",
  videoOutputSizeInvalid: "Video dimensions must be even integers of at least 2 pixels.",
  outputSizeInvalid: "Use integer multiples of 8, at least 8 pixels.",
  generationCancelled: "Generation cancelled. Images already saved remain in the library.",

  promptToolsAdd: "Show {label} in toolbar", promptToolsRemove: "Remove {label} from toolbar", promptToolsScene: "Scene", promptTools3D: "3D", promptToolsAction: "Action",
  mossCompositionTooLong: "The composition exceeds the canvas prompt limit of 4,000 characters. Shorten the descriptions or remove regions.",
  promptToolsMore: "Show more prompt tools", promptToolsLess: "Edit",
  promptToolsDone: "Collapse", promptToolsScrollLeft: "Scroll tools left", promptToolsScrollRight: "Scroll tools right",
  generationComplete: "Generated {count} images", generationFailed: "Generation failed. Check the workflow, models and service connection.",
  addReference: "Add input images",
  insertAudio: "Insert audio",
  removeReference: "Remove input image: {name}",

  // 远端图片的模式、约束与真实任务反馈。
  modeTextImage: "Text to image",
  modeImageImage: "Image to image",
  imageInputOverflow: "Image inputs exceed this mode: text accepts none, image mode accepts one. Remove extra connections first.",
  remoteKeyMissing: "Set a dedicated key in Settings → API keys → Euzhi image generation.",
  remoteCancelled: "Local waiting cancelled. Remote processing may continue; check Euzhi usage records.",
  remoteTimeout: "The 180-second deadline expired. Check Euzhi usage before retrying to avoid duplicate charges.",
  remoteInputInvalid: "Check the prompt, image count and that all connected references contain PNG/JPEG/WebP images.",
  remoteHttpError: "Euzhi returned HTTP {status}: 401 check the key, 403 model access, 429 wait. For other errors, check usage before retrying.",
  remoteFailed: "Image generation or saving failed; existing node content is preserved. Check Euzhi usage before retrying.",
  remoteComplete: "Saved {count}/{requested} actual results. Check platform records if fewer were returned.",
  remoteVideoUnavailable: "Remote video services are not connected yet.",

  // 英文入口同样区分模板身份与实际模型文件，不改变工程中的稳定编号。
  // 明确图片编辑只含文字改图，不暗示蒙版与边缘流程也已纳入选择。
  // 说明选择动作没有生成副作用，避免用户误解保存模板就产生了结果。
  workflow: "Workflow", imageEditWorkflow: "Image editing · Text instructions", workflowConfiguration: "Reuse Create components with isolated node parameters. Submit from the node generation button.",
  // 只说明当前功能范围，不把服务或本地安装状态当作已检测结果。
  // 图片和支持的视频模板依旧可以正常选择自己的 LoRA。
  // 与中文键一一对应，复用原有语言状态与持久化机制。
  workflowLoraUnavailable: "LoRA configuration is not connected for this workflow, matching the Create page.",
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
  addAnnotation: "Add annotation",
  editAnnotation: "Edit annotation: {text}",
  annotationSettings: "Edit annotation",
  annotationPlaceholder: "Enter a label, press Enter to save",
  annotationText: "Annotation text",
  annotationColor: "Annotation color",
  annotationColorValue: "Choose color {color}",
  annotationCustomColor: "Custom color",
  annotationLimit: "Each node supports up to 8 annotations",
  removeAnnotation: "Delete annotation",
  noteStyle: "Note style",
  notePlain: "Plain note",
  noteTape: "Taped note",
  notePin: "Pinned note",
  noteColor: "Paper color",
  noteYellow: "Yellow",
  notePink: "Pink",
  noteBlue: "Blue",
  noteGreen: "Green",
  noteOrange: "Orange",
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
// 音频动作使用独立英文名称，不沿用视频控件标签。
// 该词条只描述按钮行为，不表示权限请求已被允许。
// 与中文保持同键，节点无需自行拼接或硬编码类型名称。
  playAudio: "Play audio",
// 暂停动作跟随所属媒体的实际播放事件，语言切换不重建音源。
// 同源副本各自读取自己的状态，不因共用词条而同步播放。
// 保留视频原词条以维持既有调用方语义。
  pauseAudio: "Pause audio",
// 英文定位名称同样说明音频源位置，不暗示整个画布工程定位。
// 透明滑条仍需这个可读名称，否则键盘可到达却无法辨认用途。
// 由应用既有语言机制提供，不引入新的浏览器默认英文控件。
  audioSeek: "Audio playback position",
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
  fitMedia: "Fit media",
  title: "Infinite canvas", untitled: "Untitled canvas",
  persistenceLoading: "Loading local draft", persistenceReady: "Local draft saved", persistenceError: "Local draft save failed",
  empty: "Right-click the canvas to start creating", emptyHint: "Bring ideas together and connect your inspiration",
  connectNewNode: "Connect to a new node",
  imageGeneration: "Image generation",
  videoGeneration: "Video generation",
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
  localWorkflows: "Local",
  remoteWorkflows: "Non-local",
  remoteWorkflowsUnavailable: "Non-local workflows are not connected yet.",
  standardImageWorkflow: "Text to image",
  generationCount: "Generation count",
  compositionLoading: 'Opening video compositor…',
  compositionOperationError: 'Operation failed. Your edits are retained. Retry saving or check local files.',
  compositionResult: 'Composed video',
  compositionSizeLimit: 'Each file must be nonempty and at most 256 MiB.',
  compositionDownloadSaved: 'Video saved to the selected location.',
  compositionDownloadCancelled: 'Save cancelled.',
  compositionLocalOnly: 'Local processing · Canvas output creates a video node · No uploads',
  library: 'Canvas workspace',
  allProjects: 'All canvases',
  newProject: 'New canvas',
  newFolder: 'New folder',
  folders: 'Folders',
  removeFolder: 'Delete empty folder',
  emptyFolderOnly: 'Only empty folders can be deleted',
  libraryStorage: 'Local storage: user/Infinite Canvas/',
  searchProjects: 'Search canvases',
  recentUpdated: 'Recently updated',
  libraryError: 'Could not read or save the project. Existing data is preserved; try again.',
  workspaceUnavailable: 'The project folder ownership is missing or inconsistent. No operation was performed. Reload the library to recover valid projects.',
  databaseConflict: 'Project registration encountered a data conflict. Refresh the library to check whether it was created before submitting again.',
  databaseBusy: 'The project database is busy or the result is unconfirmed. Refresh the library later to check the result before retrying.',
  multiSelect: 'Select',
  cancelSelection: 'Cancel selection',
  selectAll: 'Select all',
  selectedProjects: '{count} selected',
  projectNodeCount: '{count} nodes',
  noProjects: 'No canvases yet. Create one to get started.',
  noMatchingProjects: 'No matching canvases.',
  moveToFolder: 'Move to folder',
  removeProject: 'Delete canvas',
  projectDeleteNotice: 'Permanently delete the selected canvas folders and their exclusive assets. This cannot be undone. External originals are kept. Deletion is blocked if another canvas still references these assets.',
  purgeDeleted: 'Clean deleted canvas files',
  purgeDeletedNotice: 'Permanently remove folders and assets left by previously deleted canvases. This cannot be undone. Keep current canvases and external originals. References from other canvases block cleanup. Close all open or suspended canvases first.',
  deleteSharedAssets: 'Another canvas still references these assets. Nothing was deleted. Remove or replace those references in the other canvas, then try again.',
  deleteFilesFailed: 'Some project files could not be deleted and may be in use. Close the related players and retry, or use Clean deleted canvas files in the library to finish cleanup.',
  deleteReferenceFailed: 'Could not check asset references in other canvases. Nothing was deleted. Restore missing project folders and try again.',
  closeBeforeDelete: 'Close other open or suspended canvases before deleting project files.',
  projectMenu: 'Canvas menu',
  suspend: 'Suspend and return to workspace',
  closeToLibrary: 'Close and return to workspace',
  suspended: 'Suspended',
  suspendedCanvases: 'Suspended canvases',
  sessionBusy: 'An operation is still running or saving failed. Try again shortly. Wait for generation before closing; suspend to keep the task running.',
  lockSize: 'Lock size',
  unlockSize: 'Unlock size',
  fixAllSizes: 'Fix all node sizes',
  fixAllSizesHelp: 'Restore all nodes to their default size and prevent edge or menu resizing. Turn off to resize nodes that are not individually locked.',
  projectResources: "Project media",
  resourceAll: "All",
  resourceTrash: "Trash",
  resourcePolicy: "Unregistered files are never recycled. Managed files enter trash only after saving and closing without references, and expire after 24 hours.",
  resourceUnknown: "Unregistered",
  resourceManaged: "Managed",
  resourceRetained: "Retained",
  resourceEmpty: "No media here",
  resourceRestore: "Restore and retain",
  resourceRetain: "Retain",
  resourceUnretain: "Release retention",
  resourceUse: "Use media",
  previewInfo: "Media information",
  previewReset: "Reset view",
  previewResolution: "Resolution",
  previewFileSize: "Size",
  previewZoom: "Preview zoom",
  previewClockwise: "Rotate clockwise",
  previewCounterclockwise: "Rotate counterclockwise",
  networkSwitch: "Switch",
  resourceTruncated: "Only the first 2,000 files are shown. Use local import for deeply nested media.",
  resourceBlocked: "Ownership review required (kept)",
  globalResources: "Global library",
  resourceSource: "Media source",
  resourceSelectAllHint: "Select this category; click again to clear",
  globalResourcePolicy: "Global media is available to every canvas. Import copies files without creating nodes or edges.",
  resourceDeleteConfirm: "Move {count} selected files to the system recycle bin? Referenced files cannot be deleted.",
  resourceInUse: "Media is still used by this canvas or another saved canvas. Remove those references first.",
  resourceChanged: "Media has changed. Refresh the list and select it again.",
  resourcePartialFailure: "Some media operations failed. Check the refreshed list.",
  globalResourceLoadFailed: "Cannot load the global library. Reopen the parameters to retry.",
  mentionLibrary: "Library",
  mentionImages: "Images",
  mentionAudio: "Audio",
  resourceLoading: "Loading media…",
} as const;

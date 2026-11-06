/**
 * English catalogue — **结构与 zh-CN 完全一致**（由 apps/next/scripts/mirror-locale.mjs 生成）。
 *
 * 现状：值仍与 zh-CN 相同（镜像），翻译按命名空间增量推进。
 * 未翻译数量由 apps/next/scripts/check-i18n-en.mjs 的 ratchet 盯着（只减不增），
 * 因此「翻了哪些」是可以机检的数字，不靠人记。
 */
export const toolBox = {
  // 新编辑器与旧视频/GIF 工具隔离命名空间，共用当前项目的语言决议机制。
  // 以下英文与中文键逐项相同，数值和媒体文件名仍来自同一演示模型。
  // 不把静态样例翻译成已导入、已保存或已导出的结果声明。
  // 本阶段只提供已呈现入口的名称，不提前登记 UI-02 至 UI-08 的未使用词条。
  // unavailable 作为所有禁用操作的统一原因，后续实际失败应由各业务提供具体信息。
  // legacy 是旧工具的真实可用链接，不能翻成另一个未实现的编辑器模式。
  editorUi: {
    editTools: 'Editing tools',
    selectLeft: 'Select all to left',
    selectRight: 'Select all to right',
    removeLeft: 'Remove selected content before playhead',
    removeRight: 'Remove selected content after playhead',
    keyframeAdd: 'Add a keyframe at the current frame',
    keyframeRemove: 'Remove the keyframe at the current frame',
    keyframeUnavailable: 'Move the playhead inside an unlocked video clip',
    cropApply: 'Apply crop',
    noUndo: 'No undo available, or the affected track is locked',
    noRedo: 'No redo available, or the affected track is locked',
    selectEditableClip: 'Select an unlocked timeline clip first',
    sectionBlocked: 'Cannot edit here. Check selection, playhead and track locks.',
    pasteBlocked: 'Cannot paste: clipboard is empty, a track is locked, or clips overlap here.',
    clipsCopied: 'Copied {count} clips. Paste at the playhead.',
    libraryCategories: 'Resource categories',
    library_media: 'Media',
    library_audio: 'Audio',
    library_text: 'Text',
    library_effects: 'Effects',
    library_transitions: 'Transitions',
    library_subtitles: 'Subtitles',
    library_stickers: 'Stickers',
    library_branding: 'Smart packaging',
    library_filters: 'Filters',
    library_adjustments: 'Adjustments',
    library_templates: 'Templates',
    library_avatars: 'Digital humans',
    previousCategories: 'Show previous categories',
    nextCategories: 'Show next categories',
    libraryUnavailable: 'Resources in this category are not connected yet. Your project and media are preserved.',
    audioImportUnavailable: 'Audio import is not connected yet. Import videos in Media.',
    listView: 'List view',
    gridView: 'Grid view',

    programMuted: 'Program muted · audio mixing unavailable',
    previewRatePreset: 'Preview rate presets',
    basicEdit: 'Basic editing',
    mirror: 'Mirror',
    rotate90: 'Rotate 90° clockwise',
    freezeFrame: 'Freeze frame',
    reverse: 'Reverse',
    crop: 'Crop',
    visualOnly: 'Available for video or image clips only.',
    basicUnavailable: 'This editing capability is not connected; the video will not be modified.',

    previewRate: 'Preview rate',
    speedBlocked: 'Cannot change speed: track locked, invalid rate, or the new duration overlaps another clip.',

    // 边缘标签区分入点和出点，不能复用“移动片段”造成键盘操作歧义。
    // 设置标题只打开当前会话轨道上限，不冒充全局工程偏好已保存。
    // 上限说明同时写明默认五条、当前保护上界与图层覆盖方向。
    // 视频与音频分别命名，用户调高一类时不应误以为两类一起增加。
    // 类型拒绝提示不再提固定V1，因为现在允许同类多轨移动。
    // 左右边缘的单位仍由数值字段显示，词条不把秒数拼进实例身份。
    trimStart: "Trim clip in point",
    trimEnd: "Trim clip out point",
    trackSettings: "Track settings",
    trackLimits: "Track limits",
    videoTrackLimit: "Video track limit",
    audioTrackLimit: "Audio track limit",
    trackLimitsHint: "Current project session only. Default: 5 per type; up to 20. Drag below the same track group to add a track. Upper video tracks cover lower tracks.",
    // 英文新增键与中文逐项对应，但值按实际能力翻译，不继续镜像中文占位。
    // Close panel是局部面板关闭，不使用Close project，防止误解为退出未保存工程。
    // panel入口没有全窗口模态含义，不应翻成Exit dialog。
    // resizeHint的10px/40px是布局调节，不能改为媒体帧或项目像素。
    // Up/Down保留键名语义，不把它们翻成素材列表的移动排序。
    // Shift是步长修饰键，不能省去后让读者以为普通箭头每次40px。
    // 这里Home/End是几何上下限，Boundary不能误标为视频源入出点。
    // cancel drag说明Escape只放弃活跃手势，不承诺工程Undo系统。
    // Playback position用于滑块名称，区别于片段source in和trim start。
    // frame指工程单帧步长，不写固定毫秒以免24/30fps项目提示错误。
    // second表示一秒步长，不是下一个媒体对象。
    // 此滑块Home/End对应工程开始结束，与resizeHint的布局边界语境不同。
    // Volume标签不含百分号，单位由EditorFloatField独立绘制。
    // Duration可用于安排或项目事实，不能固定翻成Source duration。
    // Position X/Y保留方向后缀，方便读屏区分两个独立输入。
    // 位置代表画面中心，不使用Left/Top以免暗示锚点是左上角。
    // Project parameters是只读信息标题，不写Project applied或Saved settings。
    // Frame rate不暗示刷新率，项目fps与显示器Hz不是同一个参数。
    // selectedCount中的{count}必须与中文一致，不能改成{number}造成空插值。
    // clips而非files说明同源两个安排仍分别计数。
    // noCommonProperties表达合法空交集，不用Unsupported file暗示读取失败。
    // No selection与Mixed selection分开，前者没有目标，后者至少有多个目标。
    // Effects are not connected说明功能边界，不能写Effect applied successfully。
    // read-only同样适用于重置按钮附近原因，不只描述某一个数字框。
    // Unset effects保留“没有覆盖才读默认”的含义，不能说所有字段都来自源媒体。
    // duration comes from this clip指当前安排长度，不是整个项目总长。
    // Isolated inspector sample明确公开样板的隔离性质，不冒充开发调试错误。
    // changes stay here指当前实例，A的输入不应该影响B或正式工作区。
    // do not process media避免用户把确认数字当作已发生转码。
    // Inspector interaction samples是页面分组名，不作为真实文件或工程标题。
    // Mixed selection不代表Multiple-track playback，多选表单与合成播放互不等价。
    // 混合占位横线由组件产生，英文词条不额外拼出不同的混合符号。
    // 用户视频名称保持原样，不能为翻译把本地文件名统一成示例名称。
    // 双语键检查验证结构，语义仍需与控件和实际快捷键逐项核对。
    // 这些文字不授予能力，真实按钮是否可用由回调和禁用原因参数决定。
    // 以后接入效果必须更新工程与媒体处理，不能只把not connected文案藏起来。
    // 保存、导出与云端未接入，本组不登记虚假的英文成功提示。
    // 分隔调整属于局部布局，不承诺保存工程或改变媒体尺寸。
    closePanel: "Close panel",
    resizeHint: "Up/Down: 10px; Shift: 40px; Home/End: boundaries; Escape: cancel drag",
    // 只有正式工程接通定位回调；此名称也说明无鼠标定位方法。
    playhead: "Playback position (arrows: frame, Shift: second, Home/End: boundaries)",
    volume: "Volume",
    duration: "Duration",
    // 属性来源和禁用原因在正式区与样板之间明确区分，不暗示媒体效果已生效。
    positionX: "Position X",
    positionY: "Position Y",
    projectParameters: "Project parameters",
    frameRate: "Frame rate",
    selectedCount: "{count} clips selected",
    noCommonProperties: "Selected clips have no common properties",
    effectUnavailable: "Effects are not connected; these values are read-only",
    propertyDefaults: "Unset effects use project defaults; duration comes from this clip",
    propertySampleOnly: "Isolated inspector sample: changes stay here and do not process media",
    inspectorSamples: "Inspector interaction samples",
    noneSelected: "No selection",
    mixedSelection: "Mixed selection",
  // LIVE-02的提示只报告当前安排结果，不把片段移动说成文件保存或媒体转码。
  // 失败原因区分重叠、错误轨道和身份，便于用户更换落点而非重导源文件。
  // 键盘替代和取消方式在同一个时间线说明中可发现，不抢搜索框的方向键。
    // 英文动作使用Add而不是Import，区分入轨引用与从磁盘读取文件。
    // at end对应真实工程末端，不能写成viewport end让用户误解空白范围。
    // ready video明确要求就绪视频，避免把加载中素材称作可添加。
    // Invalid placement同时适用于身份与坐标，不能翻译成Corrupt video。
    // Overlap说明当前安排冲突，不使用Overwrite暗示可覆盖已有片段。
    // Video track only保留V1编号，与时间线轨道头的业务标识一致。
    // Valid location是松手前预期，Placed才表示页面内命令已提交。
    // 未保存状态使用unsaved，而非failed to save，当前根本没有执行保存请求。
    // 键盘提示明确Arrow与Shift，避免把键名翻译成需要输入的普通单词。
    // 离开确认不使用will restore，因为返回后当前实现是新的空会话。
    // 拒绝文案不包含系统路径，英文错误原因也不泄漏磁盘目录。
    // 相邻合法位置不显示overlap，翻译不能改变碰撞门槛的含义。
    // seconds由运行时以s显示，工程数值不从英文文本反向解析。
    // 同名多实例仍显示相同源名，操作对象由clipId决定而不是英文标题。
    // 这些词条只给LIVE-02新增反馈，原样板的禁用原因继续沿用既有英文。
    addToV1: "Add to end of V1",
    selectReadyVideo: "Select a ready video asset first",
    canvasSelect: "Select and move picture",
    transformLive: "Positions use project pixels; 100% fits the full picture. Fades are unavailable.",
    trackLocked: "Track is locked; project unchanged",
    invalidPlacement: "Invalid position or asset identity; project unchanged",
    overlap: "This position overlaps an existing clip; placement rejected",
    videoTrackOnly: "Video can only be placed on video tracks",
    // 音频与视频各自锁定所属轨道，不把工程编辑翻译为磁盘文件操作。
    // 英文键与中文保持一一对应，菜单继续使用当前语言订阅。
    // 分离属于非破坏引用，不宣称生成音频文件或完成混音导出。
    sameTrackOnly: "Audio can only be placed on audio tracks",
    clipActions: "Clip actions",
    detachAudio: "Detach audio to an audio track",
    alreadyDetached: "Audio is detached from this video instance; it stays muted",
    // 独立音轨与无声源分别解释，英文也不把已有音轨说成不存在。
    // 标签仅用于菜单反馈，数据分类仍使用稳定字段，不解析译文。
    alreadyAudio: "This is already an independent audio clip",
    duplicateAtEnd: "Duplicate at the end of this track",
    detachHint: "Audio references the original file. No new file is created; deleting only removes the project clip.",
    audioPreview: "Independent audio preview; enable sound to listen",
    editDone: "Project updated; changes are unsaved",
    validPlacement: "Valid placement",
    placementDone: "Clip position updated; project is still unsaved",
    timelineHint: "Drag video to V1. Arrow keys move one frame; Shift + arrow moves one second. Esc cancels a drag.",
    unsavedTimeline: "This project is unsaved. Leaving will clear its clips. Leave anyway?",

    staticProject: "Static demo project",
    liveProjectName: "Untitled project",
    pause: "Pause",
    enableSound: "Enable sound",
    retryPreview: "Retry preview",
    audioTrack: "Audio track",
    waveformLoading: "Reading waveform…",
    waveformError: "Waveform unavailable",
    noAudioTrack: "No audio track",
    hiddenMedia: "{count} assets are hidden by the current filters",
    rejectedFiles: "Not imported: {names}; local videos only, up to 20 files per batch",
    invalidDrop: "non-local video or invalid source",
    cancelImport: "Cancel import",
    importCancelled: "Import cancelled; existing media retained",
    importTimeout: "Reading the video timed out; try again",
    probeFailed: "Video probing failed; check that the file is complete and contains a video track",
    coverFailed: "Cover unavailable; video metadata retained",
    decodeFailed: "Video preview could not be decoded; metadata retained. Retry or select another video",
    importDialogFailed: "Could not open the video picker; try in the desktop app",
    importSummary: "Imported {added} · Duplicates {duplicate} · Rejected {rejected} · Failed {failed}",
    dropHint: "Drop videos into the workspace; up to 20 per batch",
    noClipSelected: "No timeline clip selected; selecting media opens its source preview only",

    // 样板返回编辑器，标签应明确区分工具箱首页。
    // 与中文保持同名键，不能把路由逻辑藏入翻译文本。
    // 仅用于状态样板导航，不更改旧版工具的返回入口。
    backToEditor: "Back to video editor",
    // UI-02 的状态说明仅用于真实组件反馈；样板说明不进入默认工作区。
    // 加载、缺图和错误分别命名，不能把所有异常统一显示为空列表。
    // 数字错误在提交时展示，不用于输入过程的动态强制纠正。
    samples: "Component states", sampleNotice: "Interactions affect this sample page only; no media processing or project saving is connected.", invalidNumber: "Enter a valid number within the range", loading: "Loading", missing: "Cover missing", error: "Media unavailable", empty: "No media",
    // Unsaved 与已保存本地的文案明确区分，实际保存状态不由时间经过推定。
    // Project actions 是内部项目菜单名称，不能替换应用主导航的 aria-label。
    // File/Edit/View 只是禁用入口，没有伪造菜单项或文件操作结果。
    // Undo/Redo 仅表达名称，本轮并无对应撤销栈或可执行快捷键。
    // Import media 不等同于导入视频，因为后续素材还包含图片和独立音频。
    // Export current frame 与 Export 的对象不同，未来会接入各自业务回调。
    // Visibility 不应用于 A1/A2，音频状态使用 Mute 与 Solo。
    // 原始素材文件名在英文中也不翻译，确保属性和时间轴可核对同一个引用。
    // 未使用文案门禁会继续检查这个命名空间，不因演示阶段而豁免。
    // 后续新增异常文案也须双语同步，不能用中文镜像值假装已翻译。
    projectName: "Spring short film", unsaved: "Unsaved", projectActions: "Project actions",
    unavailable: "This feature is not connected yet", legacy: "Original clip editor", export: "Export",
    file: "File", edit: "Edit", view: "View", undo: "Undo", redo: "Redo",
    // 媒体种类和轨道名采用不同标签，配音与音乐不是两种文件格式。
    // search 用作输入名称和 placeholder，操作禁用原因由独立词条说明。
    // 图片源时长为空时不会拼接秒数，这些分类文字不含虚构时间。
    media: "Media", import: "Import media", search: "Search media…", all: "All",
    // 与中文区分空库、无匹配、整库等待和失败，不使用一个模糊的空态提示。
    // 数量供状态播报使用，不把屏幕读数写成已导入成功。
    // 导入说明固定演示边界，文件名和数量仍由实际展示数据注入。
    // 样板标签仅在显式预览入口使用，不成为真实业务状态机。
    // 英文键与中文逐项同步，避免语言切换时回落到缺失文本。
    // 不新增未接通业务的完成文案，错误也没有虚假的重试成功反馈。
    // 类型名称继续复用 video/audio/image，不重复创建一套筛选词条。
    mediaTypes: "Media type", noMediaResults: "No media matches the search or type filter", clearMediaFilters: "Clear search and filters", mediaResultCount: "Showing {count} media items",
    mediaLoading: "Reading media list…", mediaError: "Could not read the media list; the source is unavailable", mediaImportUnavailable: "Real import and probing are not connected to this demo library",
    mediaSamples: "Media panel states", mediaReady: "Five media items", mediaEdge: "Errors and long list",
    video: "Video", audio: "Audio", image: "Image", voice: "Voice", music: "Music",
    // Program preview 强调节目对象，后续 source viewer 应有单独标题。
    // Previous/next frame 表示帧步进，不是导航到上一个/下一个素材。
    // Fit 表示画面适应，而 Fit all 表示完整时间轴可见范围。
    program: "Program preview", play: "Play", previousFrame: "Previous frame", nextFrame: "Next frame",
    // 英文与中文区分节目和素材查看，返回入口不代表执行 seek。
    // 黑场、无选中、缺图、等待和失败各用准确原因，不统一称为空库。
    // 音频无画面是媒体类型属性，不能提示成损坏文件。
    // 预览状态名称只用于独立样板，正式工程不展示调试控件。
    // 未接通入口明确静态边界，不出现播放或导出的虚假完成提示。
    // 长文件名仍由数据输入，翻译不改动素材 ID 或片段身份。
    // 类型名称继续复用现有 video/audio/image，不另建媒体类型表。
    // source 返回只恢复同一片段的节目形态，选择状态由样板自己保存。
    // 文案本身不承担解码错误恢复或异步重试逻辑。
    sourcePreview: "Source viewer", backToProgram: "Back to program", previewUnavailable: "Playback, frame stepping, zoom and export are not connected to this static preview",
    previewEmpty: "No clip selected", previewLoading: "Preparing preview…", previewMissing: "The clip's media or cover is missing",
    previewError: "Preview unavailable", previewBlack: "Black frame; no program picture", previewAudio: "Audio clips have no picture; playback is not connected",
    previewSamples: "Program preview states", previewClipChoice: "Selected clip", previewStateChoice: "Preview state", previewReady: "Static picture", previewBroken: "Broken cover", previewLong: "Long filename",
    fit: "Fit", exportFrame: "Export current frame", inspector: "Clip properties", reset: "Reset",
    // 字段文案仅表达含义，数值精度、单位和校验边界由属性行参数决定。
    // Fixed speed 保留固定变速语义，不暗示已经支持速度曲线。
    // Opacity 是视觉参数，与音频 volume 的语义保持分离。
    transform: "Transform", scale: "Scale", position: "Position", rotation: "Rotation", opacity: "Opacity",
    playback: "Playback", speed: "Fixed speed", fades: "Fades", fadeIn: "Fade in", fadeOut: "Fade out",
    // 时间轴工具名称不包含默认快捷键，避免与旧工具已实现的操作冲突。
    // Fit all 与 zoom 标签属于工程视口，并不改变输出视频分辨率或时长。
    // Linked selection 是未来选择策略，此阶段并不创建音画链接关系。
    timeline: "Timeline", select: "Select", split: "Split", snap: "Snap", linked: "Linked selection",
    addTrack: "Add track", fitAll: "Fit all", zoomOut: "Zoom timeline out", zoomIn: "Zoom timeline in",
    timelineZoom: "Timeline zoom", visibility: "Visibility", mute: "Mute", solo: "Solo", lock: "Lock",
    // Resize 命名上下区边界，ARIA 禁用状态单独由 separator 表明。
    // 这些标签不会触发真实文件操作，也不替代导出/播放的实际反馈。
    // 后续实现暂时面板时继续复用 media/inspector 名称与现有焦点机制。
    resize: "Resize upper and lower workspace",
  },

  "video": {
    "title": "Video Trimmer",
    "description": "Join clips · Trim start/end · Change speed · Crop — powered by local ffmpeg",
    "folderBridgeMissing": "The main process does not expose folder selection right now — fully restart the app and try again",
    "outputFolderDialogTitle": "Choose the video output folder",
    "outputFolderSet": "Output folder set",
    "concatDone": "Video joined",
    "processDone": "Video processed",
    "processFailed": "Processing failed",
    "exportFrame": "Export current frame",
    "exportFrameHint": "Save the current preview position as a PNG at the original resolution",
    "frameNotReady": "The video frame is not ready yet. Please try again shortly.",
    "frameExported": "Current frame exported",
    "cancelled": "Processing cancelled",
    "trimSection": "Trim range",
    "addRange": "Add trim range",
    "importSummary": "Added {videos} video(s) · {ranges} trim range(s)",
    "rangeLabel": "Range {index}",
    "rangeList": "Trim ranges for the current video",
    "sourceRanges": "Current video · {count} range(s)",
    "mergeAllRanges": "Merge all trim ranges",
    "mergeRangesHint": "{count} trim ranges will be merged into one video in list order. Drag ranges to change their order.",
    "segmentPrefix": "Clip ",
    "segmentMiddle": " ·",
    "concatHint": "Clips are joined in list order — {count} clip(s) total",
    "accurateCut": "Precise cut (re-encode)",
    "accurateCutHint": "When off, streams are copied losslessly, which is fastest. Because a video can only start at a keyframe, a start point that is not a keyframe makes the output begin at the previous keyframe (it may be slightly longer than the range you picked).",
    "durationPrefix": "Total ",
    "durationMiddle": " clip(s), estimated output",
    "concatDurationNote": "(Joining always re-encodes; resolution and frame rate follow the first clip {width}×{height})",
    "losslessNote": "(Lossless stream copy, keyframe-aligned, fastest)",
    "reencodeNote": "(Re-encoded, frame-accurate)",
    "overwriteNote": "; if a file with the same name exists, a number is appended instead of overwriting.",
    "clipMenu": {
      "title": "Clip editing", "speed": "Speed (×)", "volume": "Volume (%)", "volumeSlider": "Clip volume",
      "volumeUp": "Increase volume", "volumeDown": "Decrease volume", "mute": "Disable audio", "reverse": "Reverse",
      "split": "Split here", "copy": "Copy clip", "paste": "Paste after this clip", "delete": "Delete clip",
      "selectedSpeed": "Selected clip speed", "hint": "Right-click a clip to change its speed, volume, mute or reverse, or to split, copy, paste and delete it.",
      "previewHint": "Speed and mute preview immediately. Volume above 100% and reversed audio are applied on export. Deleting a clip keeps the original video file.",
      "effects": "{speed}× · Volume {volume}%", "reverseLabel": "Reverse", "mutedLabel": "Muted"
    },
    "reframe": {
      "title": "Re-export video at frame rate", "tab": "Frame rate", "fps": "Target frame rate",
      "hint": "Keep every original frame of the selected video and rebuild playback timing at the chosen frame rate. Audio speed follows. Trim, speed and crop settings do not apply. Uses the selected output folder, or opens a save dialog.",
      "done": "Video exported at the new frame rate"
    },
    "quick": {
      "title": "Quick tools", "switch": "Switch between video editing and quick tools", "editor": "Video editor",
      "equalSplit": "Split equally", "description": "Divide the entire selected video into N equal-duration parts and export separate MP4 files.",
      "noVideo": "Import and select a video first", "parts": "Number of parts", "invalidParts": "Enter an integer from 2 to {max}. Each part must contain at least one frame, with a maximum of 1000 parts.",
      "partDuration": "Target duration per part: {time}", "frameHint": "Splits use the original video duration and retain audio. Frame boundaries and encoding may cause small duration differences.",
      "pickOnExport": "Choose a folder when exporting", "splitFolder": "Choose the split video output folder",
      "exportParts": "Export {count} video parts", "progress": "Completed {count}/{total} parts", "saved": "Saved {count} video parts",
      "done": "Finished splitting into {count} video parts", "cancelled": "Splitting stopped. Completed videos remain in the output folder."
    },
    "crop": {
      "title": "Crop video",
      "originalFrame": "Original frame",
      "width": "Width",
      "height": "Height",
      "offsetX": "X offset",
      "offsetY": "Y offset",
      "reencodeHint": "Cropping requires re-encoding, so export takes longer and produces larger files than a plain trim.",
      "aspect": {
        "source": "Source ratio",
        "square": "1:1 Square",
        "landscape": "4:3 Landscape",
        "portrait": "3:4 Portrait",
        "wide": "16:9 Widescreen",
        "vertical": "9:16 Vertical",
        "custom": "Custom size"
      }
    },
    "speed": {
      "title": "Change video speed",
      "originalSpeed": "Original speed",
      "reencodeHint": "Changing speed requires re-encoding, so export takes longer and produces larger files than a plain trim."
    }
  },
  "videoEdit": {
    "preview": {
      "empty": "No preview yet",
      "backOneSecond": "Back 1 second",
      "backOneFrame": "后退一帧",
      "pause": "暂停",
      "play": "播放",
      "forwardOneFrame": "前进一帧",
      "forwardOneSecond": "前进 1 秒",
      "setStart": "设为起点",
      "setEnd": "设为终点",
      "backToStart": "回到起点"
    },
    "ffmpeg": {
      "checking": "正在检测 ffmpeg…",
      "readyPrefix": "ffmpeg 已就绪（",
      "unknownSource": "未知来源",
      "missing": "未检测到 ffmpeg",
      "installHint": "请安装 ffmpeg 并加入系统 PATH，或手动指定 ffmpeg.exe 路径",
      "desktopOnly": "（需在 Electron 桌面版中使用）",
      "pickManually": "手动指定",
      "redetect": "重新检测",
      "notFound": "未检测到 ffmpeg，请手动指定或加入系统 PATH",
      "pathSaved": "已保存 ffmpeg 路径",
      "sourceManual": "手动指定",
      "sourcePath": "系统 PATH",
      "sourceCommon": "常见安装位置",
      "sourceBundled": "应用内置"
    },
    "timeline": {
      "startLabel": "起点",
      "endLabel": "终点",
      "selectionLabel": "选取",
      "dragStart": "拖动设置起点",
      "dragEnd": "拖动设置终点",
      "dragRange": "Drag the whole range",
      "hintPrefix": "直接拖动时间轴上的",
      "hintSuffix": "标记划定剪切区间， 拖动时画面会实时跳到对应帧；点击时间轴可跳转预览。",
      "wholeDragHint": "Drag the blue range body to move both boundaries together."
    },
    "importZone": {
      "addedPrefix": "已添加",
      "clipUnit": "个片段",
      "reorderHint": "拖拽下方卡片可调整拼接顺序；选择卡片可编辑该片段的剪切区间",
      "continueAdd": "继续添加",
      "reading": "正在读取视频信息…",
      "pick": "点击添加视频片段",
      "pickHint": "可一次多选：列表顺序即拼接顺序（支持 mp4 / mov / mkv / avi / webm 等）"
    },
    "playlist": {
      "dragHandle": "拖拽排序",
      "trimPrefix": "裁剪",
      "noAudio": " · 无音轨",
      "remove": "移除片段"
    },
    "exportPanel": {
      "folderLabel": "输出文件夹",
      "pickFolder": "选择文件夹",
      "changeFolder": "更换文件夹",
      "fileNameLabel": "文件名",
      "fileNamePrefixPlaceholder": "文件名前缀（可自定义）",
      "fileNamePlaceholder": "文件名（可自定义）",
      "resetFileName": "恢复自动命名",
      "folderHint": "导出到该文件夹，文件名可自行修改；同名文件会自动追加序号，不会覆盖。",
      "noFolderHint": "未选择文件夹时，点击「开始处理」会弹出保存文件对话框，直接指定单个输出文件。",
      "resolvedPrefix": "实际导出为：",
      "donePrefix": "导出完成：",
      "openFolder": "打开所在文件夹",
      "run": "开始处理",
      "headingDefault": "导出",
      "emptyFolderHintDefault": "未选择（点击「开始处理」时弹出保存文件对话框）",
      "runningLabelDefault": "正在处理…"
    },
    "clipEditor": {
      "desktopOnly": "该功能需要在 Electron 桌面版中使用",
      "bridgeMissing": "当前主进程未提供视频选择接口，请使用最新版本重试",
      "clipsAdded": "已添加 {count} 个片段",
      "readFailed": "{count} 个文件无法读取（可能不是视频）"
    }
  },
  "head": {
    "title": "工具箱",
    "themeToggle": "Switch light / dark theme",
    "description": "轻量高效的媒体处理工具集",
    "searchPlaceholder": "搜索工具...",
    "tabs": {
      "all": "全部工具",
      "image": "图片处理",
      "video": "视频处理",
      "models": "Model plugins",
      "ai": "AI 创作"
    }
  },
  "main": {
    back: "Back to toolbox",
    "empty": "No matching tools. Change the category or search query.",
    "exifDescription": "批量清除、打乱或自定义图片元数据",
    "videoDescription": "视频剪切、变速与裁剪",
    "gifDescription": "视频片段一键转换为动图",
    "openHint": "点击开始使用",
    "exifName": "EXIF 编辑器",
    "videoName": "视频工具箱",
    "gifName": "GIF 转换器",
    "comicName": "漫画生成器",
    "exifBadge": "AI 图片专用",
    "gifBadge": "热门",
    "comicBadge": "AI 创作"
  },
  "civitai": {
    // 本地库排序与在线库的发布/热度排序分离，不能共用同一组语义。
    // name 对应文件全名，date 明确指磁盘修改时间而非网站发布日期。
    // size 使用原始字节数比较，显示文案不携带硬编码体积单位。
    // mark 来源仅限已保存的触发词，提示必须同时解释无资料项排末尾。
    // loading 表示小型本地 JSON 读取，不应出现“正在匹配 Civitai”的文案。
    // failed 说明名称回退与手动重扫路径，不能假装排序资料已读取成功。
    localSort: {
      title: "Sort by",
      name: "Name",
      date: "Date",
      size: "Size",
      mark: "Tags",
      asc: "Ascending",
      desc: "Descending",
      direction: "Sort direction",
      markHint: "Sort by locally saved trigger words; untagged models appear last",
      loading: "Reading local tags…",
      failed: "Could not read local tags. Showing names; rescan to retry",
    },
    metadata: {
      batchOccupied: "Batch completion is running. You can match this model manually when it finishes.",
      heading: "Model source information", source: "Source", title: "Source title", creator: "Creator",
      loading: "Reading source JSON…", missing: "No matching .civitai.json source file for this version.",
      invalid: "The source JSON is unreadable or invalid.", unsupported: "This source JSON version is not supported yet.",
      unavailable: "Cannot read model metadata. Check model directories and restart the app.",
      hashHint: "File SHA-256 fingerprint for matching the exact Civitai file version. Descriptions and trigger words come from that version's public information.",
      recover: "Recover information by SHA-256", recovering: "Streaming model hash and querying Civitai…",
      coverUnavailable: "Source information saved, but the preview could not be downloaded. You can set a cover manually later.",
      recovery: {
        recovered: "Source information and a usable logo cover are complete.", existing: "Readable source information and a usable logo cover already exist. Existing information was preserved.",
        notFound: "Civitai has no match for this SHA-256. The file may be unlisted or deleted.",
        auth: "Civitai denied access. Check the API key and access permissions in the model plugin.",
        network: "Unable to connect to Civitai. Check your connection and retry.", timeout: "Reading or lookup timed out. Please retry later.",
        invalid: "The file is outside configured model folders, invalid, or the response failed exact-match validation.",
        changed: "The model changed during identification. Nothing was saved. Wait for the file to stabilize and retry.",
        busy: "The model folder is busy or identification capacity is full. Please retry later.", io: "Unable to read the model or save information. Check folder permissions and retry.",
        noPreview: "Incomplete: the model was identified and text information retained, but Civitai has no currently usable preview. A logo is still missing.",
        coverFailed: "Incomplete: logo download, saving or decoding failed. Text information was retained. Retry or set a cover manually.",
        metadataInvalid: "Incomplete: the existing source file is unreadable, invalid or unsupported. It was preserved. Back it up and resolve the issue before retrying.",
        unsupportedType: "Incomplete: Civitai has a matching file, but recovery currently supports only LoRA, Checkpoint and TextualInversion. This model type is not supported yet.",
      },
    },
    recoveryBatch: {
      title: "Batch model information recovery", start: "Batch recovery", scope: "Scope: all currently filtered models, including {count} file versions.",
      hint: "Complete means readable source information plus a displayable logo cover. Text information alone does not count as complete.",
      progress: "Checked {processed}/{total} · Complete {completed} · Incomplete {incomplete}",
      waiting: "Waiting for recovery", running: "Reading SHA-256, querying Civitai and retrieving a logo…", cancelled: "Stopped before execution.",
      stop: "Stop remaining tasks", stopping: "Stopping after the current file…", retry: "Retry incomplete items", results: "Individual model recovery results",
      continueHint: "Processing continues when switching pages. Stopping waits for the current file to finish.",
      scanFailed: "Batch checks finished, but the model list could not refresh. Rescan manually. Saved information was retained.",
    },
    fileInfo: "File information and checksum", unavailable: "No downloadable file",
    online: "Online models",
    local: "Local models",
    // 官方目录用于一级导航，用户目录保持真实层级，不把标签当作文件夹。
    // 单文件卡片不能调用旧的整目录删除，原因在操作附近明确呈现。
    officialModels: "Official model categories", myFolders: "My folders", chooseOfficial: "Choose a category to browse its folders", folderPath: "Model folder path", toggleFolder: "Expand or collapse {name}", folderOperationOnly: "This folder contains multiple models. Move and delete currently operate on entire folders, so these actions are unavailable for individual file cards.",
    // 本地工作区只提供索引实际支持的名称排序，密度切换复用同一模型卡片。
    fileName: "File name", sourceHeading: "Source and author", workspaceBack: "Back to workspace", sortName: "Name A–Z",
    sortNameReverse: "Name Z–A", viewLarge: "Large cards", viewGrid: "Grid view", viewList: "List view",
    localTitle: "Local model library",
    localDescription: "Models and covers from the scan folders configured in Settings",
    scan: "Rescan",
    scanning: "Scanning…",
    scanFailed: "Scan failed. Check your model folders in Settings and retry",
    configure: "Configure scan folders",
    localEmpty: "No local models. Configure folders in Settings and scan first",
    localSearch: "Search local model names, categories or filenames",
    localCategory: "Category",
    localType: "Model type",
    scrollMore: "Scroll down to load more",
    allLoaded: "All models loaded",
    localFiles: "Local model files",
    localChoose: "Select a local model to view its cover and file versions",
    // 英文摘要提示也覆盖改名模型，不再沿用“same filename”的旧含义。
    // saved 与 not read again 区分已有记录和本轮重新校验，边界与中文保持一致。
    localFound: "Matching local file",
    localMatchHint: "The full SHA256 saved in the local source JSON matches this Civitai file; the model has not been read again for verification",
    // names 使用复数，指目录标题和文件主干同时满足，不是仅下载文件同名。
    // stems 强调完整去后缀主干，不能让英文读者把它理解成宽松 prefix 匹配。
    // 英文同样注明未验证内容，语言切换不能改变用户对证据强弱的理解。
    localNameFound: "Matching local names",
    localNameMatchHint: "The local folder matches the Civitai title and the full filename stems match; file contents have not been verified",
    categoryMove: {
      acknowledge: "I understand: the entire model folder, including all versions, covers and other files, will be moved.",
      title: "Change category", move: "Move to this category", moving: "Moving…", done: "Model category updated",
      hint: "Moves the entire model folder, including all versions and the cover, while preserving the series directory.",
      destination: "Destination folder", crossRoot: "Automatic moves between major categories are not supported. Open the source and destination folders, move the model in File Explorer, then rescan.",
      openSource: "Open source folder", openTarget: "Open target major category", openFailed: "Unable to open the folder. Check that the path exists.",
      layout: "This is not an independent model folder. Organize it as category/model name/model files and cover in File Explorer, then rescan.",
      busy: "The model is downloading or saving files. Wait until it finishes before changing its category.",
      exists: "The destination contains a model folder with the same name. Nothing will be overwritten or merged. Choose another category.",
      io: "Unable to move the folder. Check file locks and folder permissions. No copy-and-delete fallback is used.",
    },
    "title": "Civitai models", "description": "Browse, filter and download Civitai models",
    batch: {
      browseHint: "Click a model to view details", exit: "Exit selection", continueMove: "Move selected models", continueDelete: "Delete selected models",
      selected: "{count} models selected", selectAll: "Select all results", clear: "Clear selection", details: "View details",
      move: "Move models", delete: "Delete models", moveTitle: "Move selected models", deleteTitle: "Delete selected models",
      select: "Select model: {name}", limit: "Select at most 200 models per operation.",
      moveHint: "Moves whole model folders, including versions, covers and other files. Series directories are preserved. Moving across major categories is not supported.",
      deleteHint: "Moves entire selected model folders, including all versions, covers and other files, to the system Recycle Bin. Files are not permanently deleted.",
      acknowledgeMove: "I understand the scope of this move and confirm the destination category.", acknowledgeDelete: "I understand that these models and all files in their folders will be deleted.",
      mixedRoots: "Selected models belong to different major categories. Select models in the same major category to move them.",
      confirmMove: "Confirm move", confirmDelete: "Confirm deletion", working: "Processing…",
      result: "Completed: {success}; failed: {failed}.", refreshFailed: "Files were processed, but refresh failed. Please rescan.",
    },
    "search": "Search", "searchPlaceholder": "Search by name or model ID, or paste a Civitai search URL",
    "filter": "Filter", "reset": "Reset filters", "base": "Base model", "baseAll": "All base models",
    "baseSearch": "Search base models", "baseEmpty": "No matching base models", "sort": "Sort",
    "popular": "Most downloaded", "newest": "Newest", "rated": "Highest rated", "all": "All",
    "source": "API source", "count": "{count} models", "more": "Load more", "loading": "Fetching models…",
    "ready": "API connected", "requestFailed": "Cannot reach the selected site. Check your connection or change API source and retry.",
    "empty": "No models found. Adjust your filters.", "retry": "Retry", "details": "Model details",
    "choose": "Select a model to see previews, versions and download files", "version": "Version",
    "files": "Download files", "noFiles": "This version has no downloadable files", "preview": "Version previews",
    "noPreview": "No preview images", "prevImage": "Previous preview image", "nextImage": "Next preview image",
    // 模型说明阅读器的两个状态共用键，在线和本地不能各自添加不同操作文案。
    // 只控制说明区，不表示展开全部模型或打开整页详情。
    "showAllDescription": "Show all", "collapseDescription": "Collapse",
    "words": "Trigger words", "about": "About this model", "noDescription": "No description provided.",
    "download": "Download model", "downloadHint": "Save to your configured model folder, choose a category and change the cover.",
    "transfer": {
      "centerTitle": "Downloads", "openCenter": "View download progress", "empty": "No downloads yet",
      dismiss: "Remove download record and keep model and cover files",
      "back": "Back to model details", "start": "Start download", "starting": "Starting…",
      "destination": "Save location", "newCategory": "Custom category…", "categoryPlaceholder": "Enter category name",
      "categoryHint": "Uncategorized models go into the Uncategorized folder. Each model has its own folder.",
      "invalidCategory": "Category names cannot contain paths, special characters, reserved names, or end with a dot or space.",
      "logo": "Model cover", "changeLogo": "Change cover", "resetLogo": "Use current preview",
      "logoHint": "Uses the preview currently shown in the details as the cover. Without an image, shows the model filename. PNG, JPEG or WebP, up to 20 MB. Model source JSON is saved with the download.",
      "logoWarning": "Model saved, but the preview cover could not be downloaded. Change it in the local library.",
      "logoChanged": "Model cover updated", "tasks": "Downloads · {count} active", "completed": "Downloaded: {name}",
      "remove": "Delete task and downloaded files", "cancelHint": "Cancel download and keep progress for retry", "retryHint": "Retry and resume retained progress when supported",
      "progressKept": "Progress kept", "estimating": "Estimating time remaining", "unknownTotal": "Unknown size",
      "remainingMinutes": "About {count} min remaining", "remainingSeconds": "About {count} s remaining",
      "progress": "{speed}/s · {received}/{total}, {remaining}",
      "status": { "downloading": "Downloading", "saving": "Saving cover", "completed": "Completed", "failed": "Failed", "cancelled": "Cancelled", "removed": "Removed" },
      "errors": {
        "configuration": "Configure the corresponding model folder in Settings first. Embedding downloads require the model search root.",
        "invalid": "Invalid category, filename, download URL or cover. Please choose again.",
        "exists": "A file with this name exists or is downloading. Choose another category or file; existing files are kept.",
        "network": "Unable to connect or the transfer was interrupted. Check your network and proxy, then retry.",
        "auth": "The server denied the download. Check your Civitai API Key in Settings and this model's download permissions.",
        "redirect": "The download redirect failed, exceeded its limit, or used an unsupported destination. Start the download again.",
        "timeout": "The download connection or data transfer timed out. Check your network and proxy, then retry.",
        "response": "The download server returned an error or webpage instead of a model file. Please retry later.",
        "integrity": "Incomplete file or SHA256 mismatch. The download was discarded; please retry.",
        "io": "Unable to write to the model folder, or too many active downloads. Check permissions and disk space, then retry.",
        "desktop": "Local model downloads require the desktop app. Update and restart it.",
      },
    },
    "modelPage": "View on Civitai", "websiteSearch": "Search on website", "clearBase": "Clear base model",
    "downloads": "Downloads", "likes": "Likes", "comments": "Comments", "tips": "Tips",
  },
  "comic": {
    "title": "漫画生成器",
    "description": "AI 辅助漫画分镜与创作",
    "emptyHint": "输入描述或上传图片开始创作",
    "pageHint": "拖动格子调整排版，编辑顶点制作不规则分镜",
    "layout": "排版",
    "views": { "switch": "Switch comic workspace view", "side": "Edit", "stage": "Canvas", "outline": "Panel list" },
    "mixedTemplate": "混合分镜模板",
    "customTemplate": "自定义排版",
    "customModeHint": "自定义模式下可拖动格子和右下角控制点",
    "outline": "分镜目录",
    "selected": "当前分镜",
    "panelCount": "{count} 格",
    "image": "画面",
    "imageRemoved": "Image removed",
    "imageTools": { "title": "Image tools", "open": "Open image tools", "menu": "Tools", "collapse": "Collapse", "replace": "Replace image", "blur": "Blur", "remove": "Remove image", "restore": "Restore image", "move": "Drag image toolbar", "invalidFile": "Choose a PNG, JPEG or WebP image no larger than 4 MB", "docking": "Toolbox docking", "fold": "Collapse toolbox", "expand": "Expand toolbox", "dock": { "left": "Dock left", "right": "Dock right", "floating": "Float toolbox" } },
    "upload": "替换图片",
    "titleLabel": "分镜标题",
    "descriptionLabel": "画面描述",
    "shape": "形状",
    "editShape": "编辑多边形",
    "finishShape": "完成形状编辑",
    "addVertex": "新增顶点",
    "removeVertex": "删除顶点",
    "resetShape": "恢复矩形",
    "vertexCount": "{count} 个顶点",
    "dragHint": "拖动顶点调整轮廓",
    "polygonEnterHint": "Drag vertices to shape the panel. Press Enter to finish.",
    "emptyPanel": "空白分镜",
    "exportJson": "导出排版 JSON",
    "more": "More actions",
    "zoom": { "title": "Zoom", "out": "Zoom out", "in": "Zoom in", "actual": "Actual size" },
    "exportPng": "Export PNG",
    "exportingPng": "Exporting…",
    "pngExported": "Comic image exported ({width}×{height})",
    "exportFailed": "Image export failed. Please try again.",
    "exportImageLoadFailed": "A panel image could not be loaded. Replace it and try again.",
    "invalidExportLayout": "Invalid panel shape or size. Adjust it and try again.",
    "invalidPageSize": "Canvas width and height must be integers between 64 and 4096 pixels.",
    "pageSize": {
      "title": "Canvas size", "width": "Width", "height": "Height",
      "current": "Width {width} px · Height {height} px",
      "lock": "Lock canvas size", "unlock": "Unlock canvas size",
      "fit": "Fit to view",
      "drag": { "width": "Drag canvas width", "height": "Drag canvas height", "both": "Drag canvas width and height" }
    },
    "reset": "恢复模板",
    "saved": "已保存本机草稿",
    "uploadFailed": "图片载入失败",
    "templates": {
      "backgroundColor": "Template background",
      "finishLayout": "Finish custom layout", "saveTitle": "Save layout to template library", "nameLabel": "Template name", "newCategory": "New category", "categoryName": "Category name",
      "geometryHint": "Save panel shapes and canvas size with text and solid placeholders. Images are excluded.", "saving": "Saving…", "savedToLibrary": "Custom layout saved to template library",
      "saveFailed": "Could not save template. Please try again.", "loadFailed": "Could not load template library. Please try again.", "panelLabel": "Panel {index}",
      "title": "Panel templates", "open": "Choose template", "category": "Template category", "total": "{count} layouts",
      "apply": "Apply template", "confirmApply": "Confirm", "undo": "Undo template change",
      "shrinkWarning": "This removes the last {count} panels and their content. Continue? You can undo after applying.",
      "categories": { "all": "All", "regular": "Regular grids", "dialogue": "Dialogue", "action": "Action cuts", "polygon": "Polygons", "torn": "Torn overlaps" },
      "names": {
        "fourGrid": "Four panels", "sixGrid": "Six panels", "nineGrid": "Nine panels", "fourStrips": "Four strips", "threeColumns": "Three columns",
        "mixed": "Mixed spans", "opener": "Wide opener", "reactions": "Reaction sequence", "tall": "Tall main panel", "alternate": "Alternating dialogue",
        "slant": "Offset slants", "doubleCut": "Double diagonal", "burst": "Radial burst", "impact": "Three-beat impact", "inset": "Inset closeups",
        "shards": "Panel shards", "pentagons": "Pentagonal story", "zigzag": "Zigzag transition", "hexagon": "Hexagonal focus", "offset": "Offset polygons",
        "tornStrips": "Torn strips", "tornDiagonal": "Across three panels", "tornShards": "Photo fragments", "tornInset": "Layered scraps", "tornSlant": "Torn slants"
      }
    },
    "defaults": {
      "sceneTitle": "场景建立",
      "sceneDescription": "开场建立空间关系。",
      "reactionTitle": "人物反应",
      "reactionDescription": "角色停下动作。",
      "closeupTitle": "对话特写",
      "closeupDescription": "视线落在关键物件上。",
      "depthTitle": "空间纵深",
      "depthDescription": "竖向格连接上下节奏。",
      "revealTitle": "揭示",
      "revealDescription": "三人交换目光。"
    }
  },
  "gif": {
    "title": "GIF 转换器",
    "description": "视频片段一键转换为动图 —— 帧率可选、分辨率等比缩放，多段按列表顺序拼接",
    "folderBridgeMissing": "当前主进程未提供文件夹选择接口，请完全重启应用后再试",
    "outputFolderDialogTitle": "选择 GIF 输出文件夹",
    "outputFolderSet": "已设置输出文件夹",
    "done": "GIF 制作完成",
    "makeFailed": "GIF 制作失败",
    "cancelled": "已取消处理",
    "trimSection": "剪切区间",
    "segmentPrefix": "第",
    "segmentMiddle": "段 ·",
    "exportHeading": "导出 GIF",
    "runningLabel": "正在制作 GIF…",
    "concatSegments": " · 拼接 {count} 段",
    "durationPrefix": "共",
    "durationMiddle": "段，选区总时长",
    "approxPrefix": "，约",
    "frameNote": "帧； GIF 无音轨，采用调色板两遍编码（palettegen/paletteuse）以减少色带。",
    "settings": {
      "title": "GIF 参数",
      "frameRateLabel": "帧率（每秒帧数）",
      "recommendedPrefix": "推荐",
      "maxPrefix": "· 上限",
      "unitFps": "帧/秒",
      "fpsAriaLabel": "每秒帧数",
      "customHintPrefix": "点击输入框可直接键入自定义帧率（1–",
      "customHintSuffix": "，超出范围会自动夹取），点击右侧 箭头展开预设；帧率越高越流畅，体积也越大，当前约",
      "frameUnitSuffix": "帧。",
      "resolutionLabel": "分辨率（等比缩放）",
      "widthAriaLabel": "GIF 输出宽度",
      "maxWidthPrefix": "不超过源分辨率（源宽",
      "sizeWarning": "高帧率 + 大分辨率会生成很大的 GIF 文件，若体积过大可降低帧率或宽度。"
    }
  },
  "exif": {
    "title": "EXIF 编辑器",
    "subtitleSingle": "单文件元数据编辑与重命名",
    "subtitleBatch": "批量编辑元数据 & 智能重命名",
    "subtitleEmpty": "拖拽图片 / 选择文件夹批量导入，编辑 PNG 元数据（tEXt）",
    "inconsistent": "元数据结构不一致",
    "processFailed": "处理失败",
    "toastSaved": "处理完成：{count} 个文件已{action}",
    "toastSavedToFolder": "保存到输出文件夹",
    "toastDownloaded": "下载",
    "toastSuccess": "处理完成：成功 {success} 个，失败 {failed} 个（失败文件已保留在队列）",
    "bannerAllSuccess": "处理完成：{count} 个文件全部成功",
    "bannerPartial": "处理完成：成功 {success} 个，失败 {failed} 个",
    "bannerQueueKept": "失败文件已保留在下方队列中，可复查后重新处理。",
    "bannerSavedTo": "已保存到：{path}",
    "bannerDownloaded": "已通过浏览器下载。",
    "closeBanner": "关闭提示",
    "metadataTitle": "元数据编辑",
    "renameTitle": "文件重命名",
    "renamePreview": "重命名预览：",
    "inconsistentKeys": "不一致的字段：",
    "forceClearBanner": "✓ 已强制清空所有不一致的元数据，结构已统一，现在可以批量添加新元数据",
    "forceKeepBanner": "⚠ 已保留原始不一致的元数据。当前仅支持批量重命名功能，元数据编辑已禁用。",
    "batchMetadataTitle": "批量元数据配置",
    "batchRenameTitle": "批量重命名配置",
    "batchRenamePreview": "重命名预览（前 3 个文件）：",
    "forceClearModal": {
      "title": "检测到元数据结构不一致",
      "body": "您导入的图片包含不同的元数据字段。为了进行统一的批量处理，系统需要标准化格式。",
      "choose": "选择",
      "option": "“强行统一并清空”",
      "willDo": "将会：",
      "removeAll": "移除所有图片中现有的元数据（包括 ComfyUI 工作流）。",
      "switchToAdd": "自动为您切换到“添加字段”模式。",
      "reAdd": "允许您为所有图片重新添加统一的新元数据。",
      "cancelKeep": "取消，保留原样",
      "confirm": "强行统一并清空"
    },
    "uploadZone": {
      "none": "未选择",
      "importing": "正在导入…",
      "dropHint": "拖拽图片到此处，或",
      "browse": "点击上传",
      "inputFolderLabel": "输入文件夹（批量导入）",
      "pickFolder": "选择文件夹",
      "outputFolderLabel": "输出文件夹（批量保存）",
      "desktopOnly": "当前为浏览器环境，文件夹批量导入/保存需在 Electron 桌面版中使用。"
    },
    "fileList": {
      "listLabel": "文件列表 (",
      "clear": "清空列表",
      "fieldUnit": "个字段",
      "outputTo": "输出到：{path}",
      "noOutputFolder": "未选择输出文件夹（浏览器模式下将逐个下载）",
      "processing": "处理中…",
      "processAndSave": "批量处理并保存 ({count})",
      "processAndDownload": "处理并下载 ({count})"
    },
    "renameConfig": {
      "enable": "启用重命名",
      "prefixLabel": "前缀名称",
      "prefixPlaceholder": "例如: comic",
      "startNumber": "起始数字",
      "numberSuffix": "数字后缀",
      "direction": "排序方向",
      "ascending": "↑ 递增",
      "descending": "↓ 递减"
    },
    "metadataEditor": {
      "locked": "已锁定",
      "enable": "启用元数据编辑",
      "clearAll": "清除所有元数据",
      "emptyHint": "当前没有元数据字段，点击下方按钮添加。",
      "keyPlaceholder": "键名",
      "valuePlaceholder": "值",
      "addField": "添加字段",
      "modeEdit": "编辑现有",
      "modeAdd": "添加字段",
      "modeClear": "清除全部"
    }
  }
} as const;

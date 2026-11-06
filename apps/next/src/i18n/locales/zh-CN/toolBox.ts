/**
 * 工具箱（`view/toolBox/**` + `components/videoEdit/**` + `utils/video/**`）词条。
 * 命名约定：`toolBox.<页面>.<语义>`，例如 `toolBox.gif.frameRate`；
 * 视频剪辑台子组件用 `toolBox.videoEdit.<语义>`。
 */
export const toolBox = {
  // 新工作区与旧 video 词条分开，旧剪辑/GIF 的按钮和错误文案保持原样。
  // UI-01 所有操作原因共用 unavailable，不为每个禁用按钮复制含义相同的提示。
  // 后续真实导入/保存/导出接入时，应分别引入业务错误，不能沿用统一占位原因。
  // projectName 是统一演示项目的名称，文件名等用户内容不写成词条键。
  // unsaved 不能翻成已保存，当前没有任何本地工程文件写入结果。
  // 工具菜单属于项目级操作，AppShell 的品牌、账户和窗口控制继续用原命名空间。
  // legacy 链接指向现有单片段处理工具，它是可用导航而非禁用动作。
  // 英文同步使用相同键，静态导出首帧通过现有 locale 机制选择语言。
  // 媒体分类键与只读样例 kind 对应，不通过扩展名或中文名称推断类型。
  // program 明确表示节目预览，不能与未来素材查看模式共用模糊的“预览”标题。
  // fit 与 fitAll 分开，前者适应画面，后者适合完整时间轴范围。
  // inspector 只代表面板标题，不暗示 UI-01 已支持音频、多选或编辑提交。
  // 变换字段单位保存在样例值中，词条只负责标签而不参与小数解析。
  // previousFrame/nextFrame 是逐帧控制名称，不能翻成前一个/后一个素材。
  // 独奏与静音是音频状态，可见则是视频状态，三者必须区分。
  // lock 表达可执行的锁定意图，默认解锁状态仍由打开形状的图标表达。
  // split/snap/linked 是时间轴动作，未接通时不会创建全局快捷键说明。
  // resize 只命名未来上下区调整，ARIA 会明确指出 UI-01 的分隔条禁用。
  // 不把当前步骤编号写入正式产品文字，区域编号留在 data 属性和文档。
  // 所有文案保持项目现有零依赖翻译方式，不另装编辑器翻译框架。
  editorUi: {
    editTools: '编辑工具',
    selectLeft: '向左全选',
    selectRight: '向右全选',
    removeLeft: '删除播放头左侧内容',
    removeRight: '删除播放头右侧内容',
    keyframeAdd: '在当前帧添加关键帧',
    keyframeRemove: '删除当前帧关键帧',
    keyframeUnavailable: '播放头需位于未锁定的视频片段内',
    cropApply: '确认裁剪',
    noUndo: '没有可撤销的操作，或目标轨道已锁定',
    noRedo: '没有可重做的操作，或目标轨道已锁定',
    selectEditableClip: '请先选择未锁定的时间线片段',
    sectionBlocked: '当前位置无法剪辑：请检查片段选区、播放头和轨道锁定',
    pasteBlocked: '无法粘贴：剪贴板为空、轨道锁定或当前位置存在重叠',
    clipsCopied: '已复制 {count} 个片段，可在播放头位置粘贴',
    libraryCategories: '资源类别',
    library_media: '素材',
    library_audio: '音频',
    library_text: '文本',
    library_effects: '特效',
    library_transitions: '转场',
    library_subtitles: '字幕',
    library_stickers: '贴纸',
    library_branding: '智能包装',
    library_filters: '滤镜',
    library_adjustments: '调节',
    library_templates: '模板',
    library_avatars: '数字人',
    previousCategories: '向左显示类别',
    nextCategories: '向右显示类别',
    libraryUnavailable: '此类资源尚未接入；现有工程与素材保持不变',
    audioImportUnavailable: '真实音频导入尚未接入，请在素材中导入视频',
    listView: '列表视图',
    gridView: '网格视图',

    programMuted: '节目静音 · 尚未接入混音',
    previewRatePreset: '预览倍速预设',
    basicEdit: '基础编辑',
    mirror: '镜像',
    rotate90: '顺时针旋转 90°',
    freezeFrame: '定格',
    reverse: '倒放',
    crop: '裁剪',
    visualOnly: '仅视频或图片片段可用。',
    basicUnavailable: '该编辑能力尚未接入，当前操作不会修改视频。',

    previewRate: '预览倍速',
    speedBlocked: '无法修改速度：轨道已锁定、数值无效，或变速后的片段与同轨素材重叠。',

    // 边缘标签区分入点和出点，不能复用“移动片段”造成键盘操作歧义。
    // 设置标题只打开当前会话轨道上限，不冒充全局工程偏好已保存。
    // 上限说明同时写明默认五条、当前保护上界与图层覆盖方向。
    // 视频与音频分别命名，用户调高一类时不应误以为两类一起增加。
    // 类型拒绝提示不再提固定V1，因为现在允许同类多轨移动。
    // 左右边缘的单位仍由数值字段显示，词条不把秒数拼进实例身份。
    trimStart: "修剪片段入点",
    trimEnd: "修剪片段出点",
    trackSettings: "轨道设置",
    trackLimits: "轨道数量上限",
    videoTrackLimit: "视频轨上限",
    audioTrackLimit: "音频轨上限",
    trackLimitsHint: "当前工程会话生效，每类默认 5 条，可设至 20 条；拖到同类轨道组下方新增轨道。上方视频轨覆盖下方。",
    // UI-05–07词条属于现有工具域，不能搬到Agent提示词或全局common改变其他页面含义。
    // closePanel表示关闭临时栏，不是关闭工程、删除素材或退出软件。
    // 宽容器常驻侧栏没有关闭按钮，文案不能写成“删除属性”。
    // resizeHint的px指工作区CSS高度，不是项目视频像素。
    // 上下键和Shift步长与分隔条处理保持一致，翻译不能擅自改快捷键。
    // Home/End在此指上下布局边界，不是时间轴开始和结束。
    // Escape只取消当前拖动，不表示撤销整个工程的上一步编辑。
    // playhead名称是可聚焦滑块的无障碍说明，需同时包含用途与无鼠标方法。
    // “播放起点”不是片段源入点，不能翻成“裁剪开始”。
    // 方向键逐帧使用项目帧率，不要在提示里写死为30fps。
    // Shift逐秒不等于跳到下一个片段，不能换成素材切换文案。
    // 此处Home/End属于工程时间边界，与上面的布局提示语境不同。
    // volume是属性字段名，单位由公共输入单独展示，不在标签再加百分号。
    // duration既用于图片安排长度也用于项目事实，真实来源由调用处决定。
    // positionX/Y指画面中心的项目坐标，不能改成“左边距/上边距”。
    // 未来画布拖动仍是待办，位置标签出现不代表已接双向同步。
    // projectParameters只读展示项目设置，不使用“已应用”暗示修改结果。
    // frameRate区分项目帧率与素材元数据；此词条仅是公共字段标题。
    // selectedCount的{count}由翻译器插值，必须原样保留占位符大小写。
    // 计数单位是片段，不是去重后的源文件，同源两次安排应计为两项。
    // noCommonProperties用于混合类型交集为空，与无选择是不同状态。
    // 不写“文件损坏”，字段没有交集是合法选择组合。
    // effectUnavailable明确当前效果未接入，不把只读默认值说成已有实际效果。
    // 这个原因也供重置按钮使用，不能改成只适用于某一个输入的错误。
    // propertyDefaults说明两种来源：未设置效果用默认值，安排时长用当前片段。
    // 不得写成“读取自素材”，否则项目中心与工程占位会被误认为源探测事实。
    // propertySampleOnly明确修改只留此实例，避免用户把演示当作工程已保存。
    // “不处理真实媒体”不是失败提示，而是样板的能力边界。
    // inspectorSamples是公开演示标题，正式工作区不以此作为项目名称。
    // noneSelected用于样板选择操作和无目标说明，不意味着清空整个工程。
    // mixedSelection指多对象值不一致，不表示当前处于多轨合成模式。
    // 横线混合占位由控件提供，不能把“—”追加在每个字段标签上。
    // 用户文件名不经词条翻译，也不以名称内容动态拼接翻译键。
    // 所有新键同步英文登记，不能依赖中文回退掩盖缺键。
    // 修改提示语后应核对实际键盘处理，快捷键文案本身不能替代功能验证。
    // 这里没有真实保存或导出成功语句，UI完成不构成业务执行凭据。
    // 以后效果接通应修改能力来源，不应只删掉禁用说明让输入看起来可用。
    // 分隔调整属于局部布局，不承诺保存工程或改变媒体尺寸。
    closePanel: "关闭面板",
    resizeHint: "上下方向键调整 10px，Shift 调整 40px，Home/End 到边界，Escape 取消拖动",
    // 只有正式工程接通定位回调；此名称也说明无鼠标定位方法。
    playhead: "播放起点（方向键逐帧，Shift 逐秒，Home/End 到边界）",
    volume: "音量",
    duration: "时长",
    // 属性来源和禁用原因在正式区与样板之间明确区分，不暗示媒体效果已生效。
    positionX: "位置 X",
    positionY: "位置 Y",
    projectParameters: "项目参数",
    frameRate: "帧率",
    selectedCount: "已选 {count} 个片段",
    noCommonProperties: "所选片段没有共同属性",
    effectUnavailable: "真实效果尚未接入；当前参数仅供查看",
    propertyDefaults: "未设置的效果显示项目默认值；时长取当前片段",
    propertySampleOnly: "独立属性样板：修改仅影响此实例，不处理真实媒体",
    inspectorSamples: "属性交互样板",
    noneSelected: "无选择",
    mixedSelection: "多选混合",
  // LIVE-02的提示只报告当前安排结果，不把片段移动说成文件保存或媒体转码。
  // 失败原因区分重叠、错误轨道和身份，便于用户更换落点而非重导源文件。
  // 键盘替代和取消方式在同一个时间线说明中可发现，不抢搜索框的方向键。
    // 入轨文案与导入文案分开，避免把复制素材引用说成复制本地文件。
    // 末尾添加指真实工程最后结束帧，不是视口右端的空白时间。
    // 选择提示要求ready视频，音频与失败素材不回落成默认演示对象。
    // invalidPlacement覆盖身份或位置非法，不把这类错误描述成视频损坏。
    // overlap明确表示没有放置，用户可换位置而无需重新导入。
    // videoTrackOnly解释当前仅支持V1，不暗示已经自动提取音轨。
    // validPlacement仅描述候选落点，必须松手后才有placementDone。
    // placementDone提示工程未保存，不把页面内提交描述成磁盘保存成功。
    // timelineHint同时说明鼠标与键盘替代，让拖动不是唯一操作路径。
    // unsavedTimeline是离开提醒，不能承诺恢复、自动保存或撤销历史。
    // 反馈通过固定status区域展示，红色轮廓被裁切时仍能读到原因。
    // 数值起点由运行时拼入，词条不会把秒数写死成某个演示位置。
    // 工程帧率与素材帧率保持业务值，翻译不会更改其计算方式。
    // 同一key在两种已登记语言中都存在，切换语言不丢失错误原因。
    // 英文版本保留V1轨道编号，避免把业务ID翻译成另一个不匹配的标识。
    addToV1: "添加到 V1 末尾",
    selectReadyVideo: "请先选择已就绪的视频素材",
    canvasSelect: "选择并拖动画面",
    transformLive: "位置使用项目像素；100%为完整适配画布，淡入淡出暂不可用",
    trackLocked: "轨道已锁定，未修改工程",
    invalidPlacement: "位置或素材身份无效，未修改工程",
    overlap: "该位置与已有片段重叠，未放置",
    videoTrackOnly: "视频只能放入视频轨",
    // 轨道限制按当前安排表达，分离后的A1/A2不会套用“只可V1”的误导提示。
    // 复制指工程同轨末尾新实例，删除只改安排，不删除磁盘文件。
    // 分离提示明确无损引用与默认静音，不承诺wav导出或多轨合成。
    sameTrackOnly: "音频只能放入音频轨",
    clipActions: "片段操作",
    detachAudio: "分离音频到音频轨",
    alreadyDetached: "该视频实例已分离音轨，保持静音",
    // 音频安排与无声视频是两种状态，不能共用“无音轨”的禁用原因。
    // 该词条只用于分离菜单，不会覆盖源文件真实hasAudio元数据。
    alreadyAudio: "当前已经是独立音频片段",
    duplicateAtEnd: "复制到同轨末尾",
    detachHint: "音轨独立引用原文件，不生成新文件；删除仅移除工程片段。",
    audioPreview: "音轨独立预览，开启声音后可试听",
    editDone: "工程已更新，尚未保存",
    validPlacement: "可放置",
    placementDone: "片段位置已更新，工程尚未保存",
    timelineHint: "拖入视频到 V1；片段方向键移动一帧，Shift 加方向键移动一秒，Esc 取消拖动。",
    unsavedTimeline: "工程尚未保存，离开后片段将清空。确定离开吗？",

    staticProject: "静态演示工程",
    liveProjectName: "未命名项目",
    pause: "暂停",
    enableSound: "开启声音",
    retryPreview: "重试预览",
    audioTrack: "含音轨",
    waveformLoading: "读取波形…",
    waveformError: "波形不可用",
    noAudioTrack: "无音轨",
    hiddenMedia: "有 {count} 项素材被当前筛选隐藏",
    rejectedFiles: "未导入：{names}；仅支持本地视频，每批最多 20 个",
    invalidDrop: "非本地视频或无效来源",
    cancelImport: "取消导入",
    importCancelled: "已取消导入，已有素材保留",
    importTimeout: "读取视频超时，请重试",
    probeFailed: "视频探测失败，请检查文件是否完整且包含视频轨",
    coverFailed: "封面不可用，视频信息仍保留",
    decodeFailed: "视频预览解码失败，已保留元数据；可重试或选择其他视频",
    importDialogFailed: "无法打开视频选择器，请在桌面客户端重试",
    importSummary: "已导入 {added} 项 · 重复 {duplicate} 项 · 拒绝 {rejected} 项 · 失败 {failed} 项",
    dropHint: "可将视频拖入工作区，每批最多 20 个",
    noClipSelected: "未选择时间线片段；选择素材仅打开源视频预览",

    // 样板返回实际目标是编辑器，不能沿用“返回工具箱”误导导航。
    // 路由字符串保留在视图，词条只负责用户可见标签。
    // 英文对应同名键，静态导出与客户端语言切换使用同一入口。
    backToEditor: "返回视频编辑器",
    // UI-02 的状态说明仅用于真实组件反馈；样板说明不进入默认工作区。
    // 加载、缺图和错误分别命名，不能把所有异常统一显示为空列表。
    // 数字错误在提交时展示，不用于输入过程的动态强制纠正。
    samples: "组件状态预览", sampleNotice: "样例交互仅在本页生效，不执行媒体处理或保存工程。", invalidNumber: "请输入范围内的有效数字", loading: "加载中", missing: "缺少封面", error: "素材不可用", empty: "没有素材",
    projectName: "春日短片", unsaved: "未保存", projectActions: "项目操作",
    unavailable: "此功能尚未接通", legacy: "原版剪辑工具", export: "导出",
    file: "文件", edit: "编辑", view: "视图", undo: "撤销", redo: "重做",
    // 素材区的固定工具与列表用同一分类标签，后续筛选不会引入第二套翻译。
    // 搜索 placeholder 和 accessible label 共用短文字，禁用原因独立提供。
    // 图片不显示虚构源时长，时长数字由展示数据提供，不写进媒体类型标签。
    // audio 同时用于素材次行，voice/music 则区分两条独立工程轨道的职责。
    // 空库与无搜索结果分别命名，等待/错误不复用会误导用户的空库说明。
    // import 只命名入口，不承诺已经打开系统文件选择框或读取媒体文件。
    media: "素材", import: "导入素材", search: "搜索素材…", all: "全部",
    // 空库与条件不匹配是不同原因，清除条件仅适用于后者。
    // 数量用于状态播报，不在紧凑素材栏再加一行调试信息。
    // 导入原因明确真实业务边界，不把禁用解释为尚未选择某个素材。
    // 整库等待和失败也阻止搜索，行缺封面不会触发这些整库提示。
    // 样板场景名称只出现在独立预览页，默认工程不展示状态切换工具。
    // 英文同步同名键，文件名和类型状态不由翻译层重新推断。
    // 本轮不登记导入完成或探测成功等尚不存在的业务结果。
    mediaTypes: "素材类型", noMediaResults: "没有符合搜索或类型条件的素材", clearMediaFilters: "清除搜索和筛选", mediaResultCount: "显示 {count} 项素材",
    mediaLoading: "正在读取素材列表…", mediaError: "素材列表读取失败，来源暂不可用", mediaImportUnavailable: "演示素材库尚未接入真实导入与探测",
    mediaSamples: "素材面板状态预览", mediaReady: "五项素材", mediaEdge: "异常与长列表",
    video: "视频", audio: "音频", image: "图片", voice: "配音", music: "背景音乐",
    // 同组控制名称明确预览对象，未来键盘提示应复用此处的可访问名称。
    // 单帧导出与工程导出不同，不能在禁用时显示相同的虚假完成提示。
    // 场景名 scene_02 保留媒体文件身份，不随语言重命名或改路径。
    // 固定帧率的数字来自工程示例，这些词条不承担时间码格式化。
    // UI-04 才接入解码与播放状态，因此没有登记会被误用的“播放完成”。
    // 画面适应按钮与时间轴适合全部的归属按修正稿执行。
    program: "节目预览", play: "播放", previousFrame: "上一帧", nextFrame: "下一帧",
    // 节目与素材查看明确区分，返回只改变查看形态，不触发播放或选中同步。
    // 黑场、未选片段、缺图与音频无画面分别提示，避免误判同一类媒体错误。
    // 静态封面等待不等于真实视频解码，所有处理类入口仍给出禁用原因。
    // 状态样板入口只在独立演示页出现，不进入正式工作区标题栏。
    // 片段控制与素材控制分别命名，用户能看出两类选择互不替代。
    // 同名英文键同步维护，文件名仍使用演示对象的原始名称。
    // 不添加播放成功、导出完成或自动恢复等尚未接通的结果文案。
    // 黑场文字只解释当前画面，不暗示轨道已静音或被隐藏。
    // 加载与错误由调用方传状态，翻译不参与异步状态推进。
    sourcePreview: "素材查看", backToProgram: "返回节目预览", previewUnavailable: "静态预览尚未接入播放、逐帧、缩放或导出",
    previewEmpty: "未选择片段", previewLoading: "正在准备预览…", previewMissing: "片段引用的素材或封面缺失",
    previewError: "预览不可用", previewBlack: "当前为黑场，无节目画面", previewAudio: "音频片段没有画面，播放尚未接入",
    previewSamples: "节目预览状态样板", previewClipChoice: "选中片段", previewStateChoice: "预览状态", previewReady: "静态画面", previewBroken: "损坏封面", previewLong: "长文件名",
    fit: "适应", exportFrame: "导出当前帧", inspector: "片段属性", reset: "重置",
    // 属性标签共用于参数化分组，视频/图片差异通过实际 rows 组合表达。
    // 速度保留固定速度语义，不提前承诺变速曲线或关键帧能力。
    // 淡入淡出只是 UI-01 字段占位，音频和视频的实际提交目标留给业务层区分。
    // opacity 指画面不透明度，不能与音量混用同一个通用 percentage 标签。
    // 位置的 X/Y 是工程坐标，标记不翻译成另一种坐标轴名称。
    // 小数位和单位由样例注入，英文翻译不负责重新计算数值。
    transform: "变换", scale: "缩放", position: "位置", rotation: "旋转", opacity: "不透明度",
    playback: "播放设置", speed: "固定速度", fades: "淡入淡出", fadeIn: "淡入", fadeOut: "淡出",
    // 时间轴分组标签来自工程而非源片段修剪，避免旧工具的 trim 文案被错误复用。
    // zoomIn/zoomOut 明确是视口控制，不是把工程时间或输出分辨率改长改短。
    // fitAll 归 R06，与 R03 的 fit 只在文字上相近但属于不同操作。
    // timelineZoom 用于禁用滑条的 accessible label，不靠数字 40 作为名称。
    // 分隔条名称只描述区域，鼠标与键盘拖动待后续布局交互接入。
    // 暂不添加具体快捷键字符，避免与原剪辑工具的实际快捷键冲突。
    timeline: "时间轴", select: "选择", split: "切分", snap: "吸附", linked: "链接选择",
    addTrack: "添加轨道", fitAll: "适合全部", zoomOut: "缩小时间轴", zoomIn: "放大时间轴",
    timelineZoom: "时间轴缩放", visibility: "可见", mute: "静音", solo: "独奏", lock: "锁定",
    // 锁定和独奏等状态将由后续受控参数提供，本轮只使用这些动作名称。
    // 不为 UI-01 的固定样例创建“已静音/已独奏”的假状态文案。
    // 区域尺寸取决于宿主实际宽度，这个标签不含固定像素或百分比承诺。
    resize: "调整上下工作区",
  },

  video: {
    title: "视频剪辑",
    description: "多片段拼接 · 起点终点剪切 · 变速 · 裁剪 —— 基于本机 ffmpeg",
    folderBridgeMissing: "当前主进程未提供文件夹选择接口，请完全重启应用后再试",
    outputFolderDialogTitle: "选择视频输出文件夹",
    outputFolderSet: "已设置输出文件夹",
    concatDone: "视频拼接完成",
    processDone: "视频处理完成",
    processFailed: "处理失败",
    exportFrame: "导出当前帧",
    exportFrameHint: "将当前预览位置导出为原始分辨率 PNG 图片",
    frameNotReady: "视频画面尚未就绪，请稍后再试",
    frameExported: "当前帧图片已导出",
    cancelled: "已取消处理",
    trimSection: "剪切区间",
    addRange: "添加剪切区间",
    importSummary: "已添加 {videos} 个视频 · {ranges} 个剪切区间",
    rangeLabel: "区间 {index}",
    rangeList: "当前视频的剪切区间",
    sourceRanges: "当前视频 · {count} 个区间",
    mergeAllRanges: "合并所有剪切区间",
    mergeRangesHint: "已设置 {count} 个剪切区间，将按列表顺序合并为一个视频；可拖动区间调整顺序。",
    segmentPrefix: "第",
    segmentMiddle: "段 ·",
    concatHint: "将按列表顺序拼接 {count} 个片段",
    accurateCut: "精确剪切（重新编码）",
    accurateCutHint:
      "关闭时为无损流拷贝，速度最快；由于视频只能从关键帧开始，起点不在关键帧时输出会从上一个关键帧开始（可能比所选区间略长）。",
    durationPrefix: "共",
    durationMiddle: "段，输出预计时长",
    concatDurationNote: "（拼接必然重新编码，画面尺寸与帧率对齐首段 {width}×{height}）",
    losslessNote: "（无损流拷贝，按关键帧对齐，速度最快）",
    reencodeNote: "（重新编码，帧级精确）",
    overwriteNote: "；同名文件已存在时会自动追加序号，不会覆盖。",
    clipMenu: {
      title: "区间编辑", speed: "速度（倍）", volume: "音量（%）", volumeSlider: "区间音量",
      volumeUp: "放大音量", volumeDown: "减小音量", mute: "禁用音轨", reverse: "倒放",
      split: "从这里切开", copy: "复制区间", paste: "粘贴到此区间后", delete: "删除区间",
      selectedSpeed: "当前区间变速", hint: "右键区间可设置独立速度、音量、静音、倒放，或切开、复制粘贴及删除。",
      previewHint: "速度和静音可即时预览；音量超过 100% 和倒放音频以导出效果为准。删除仅移除剪辑区间，不删除原视频。",
      effects: "{speed}× · 音量 {volume}%", reverseLabel: "倒放", mutedLabel: "静音",
    },
    reframe: {
      title: "重新按帧导出视频", tab: "按帧导出", fps: "目标帧率",
      hint: "保留当前选中视频的全部原始画面帧，按所选帧率重新播放并调整时长，音轨同步变速。不应用剪切区间、倍速或裁剪设置。使用已选输出文件夹，未选择则弹出保存对话框。",
      done: "已按新帧率导出视频",
    },
    quick: {
      title: "快捷功能", switch: "切换视频编辑与快捷功能", editor: "视频编辑",
      equalSplit: "等时长切分", description: "将当前视频完整时长平均分为 N 份，分别导出为独立 MP4 文件。",
      noVideo: "请先导入并选择视频", parts: "切分份数", invalidParts: "请输入 2–{max} 之间的整数，每份至少包含一帧，最多支持 1000 份。",
      partDuration: "每份目标时长 {time}", frameHint: "按原视频时长切分并保留音轨。帧边界和编码可能带来少量时长误差。",
      pickOnExport: "导出时选择文件夹", splitFolder: "选择切分视频输出文件夹",
      exportParts: "导出 {count} 份视频", progress: "已完成 {count}/{total} 份", saved: "已保存 {count} 份视频",
      done: "已完成 {count} 份视频切分", cancelled: "已停止切分，已完成的视频保留在输出文件夹中。",
    },
    crop: {
      title: "视频裁剪",
      originalFrame: "原始画面",
      width: "宽度",
      height: "高度",
      offsetX: "X 偏移",
      offsetY: "Y 偏移",
      reencodeHint: "裁剪需要重新编码，导出耗时与体积会高于纯剪切。",
      aspect: {
        source: "原始比例",
        square: "1:1 方形",
        landscape: "4:3 横屏",
        portrait: "3:4 竖屏",
        wide: "16:9 宽屏",
        vertical: "9:16 竖版",
        custom: "自定义尺寸",
      },
    },
    speed: {
      title: "视频变速",
      originalSpeed: "原速",
      reencodeHint: "变速需要重新编码，导出耗时与体积会高于纯剪切。",
    },
  },
  videoEdit: {
    preview: {
      empty: "暂无预览",
      backOneSecond: "后退 1 秒",
      backOneFrame: "后退一帧",
      pause: "暂停",
      play: "播放",
      forwardOneFrame: "前进一帧",
      forwardOneSecond: "前进 1 秒",
      setStart: "设为起点",
      setEnd: "设为终点",
      backToStart: "回到起点",
    },
    ffmpeg: {
      checking: "正在检测 ffmpeg…",
      readyPrefix: "ffmpeg 已就绪（",
      unknownSource: "未知来源",
      missing: "未检测到 ffmpeg",
      installHint: "请安装 ffmpeg 并加入系统 PATH，或手动指定 ffmpeg.exe 路径",
      desktopOnly: "（需在 Electron 桌面版中使用）",
      pickManually: "手动指定",
      redetect: "重新检测",
      notFound: "未检测到 ffmpeg，请手动指定或加入系统 PATH",
      pathSaved: "已保存 ffmpeg 路径",
      sourceManual: "手动指定",
      sourcePath: "系统 PATH",
      sourceCommon: "常见安装位置",
      sourceBundled: "应用内置",
    },
    timeline: {
      startLabel: "起点",
      endLabel: "终点",
      selectionLabel: "选取",
      dragStart: "拖动设置起点",
      dragEnd: "拖动设置终点",
      dragRange: "拖动整体区间",
      hintPrefix: "直接拖动时间轴上的",
      hintSuffix: "标记划定剪切区间， 拖动时画面会实时跳到对应帧；点击时间轴可跳转预览。",
      wholeDragHint: "拖动蓝色区间主体可整体移动起点和终点。",
    },
    importZone: {
      addedPrefix: "已添加",
      clipUnit: "个片段",
      reorderHint: "拖拽下方卡片可调整拼接顺序；选择卡片可编辑该片段的剪切区间",
      continueAdd: "继续添加",
      reading: "正在读取视频信息…",
      pick: "点击添加视频片段",
      pickHint: "可一次多选：列表顺序即拼接顺序（支持 mp4 / mov / mkv / avi / webm 等）",
    },
    playlist: {
      dragHandle: "拖拽排序",
      trimPrefix: "裁剪",
      noAudio: " · 无音轨",
      remove: "移除片段",
    },
    exportPanel: {
      folderLabel: "输出文件夹",
      pickFolder: "选择文件夹",
      changeFolder: "更换文件夹",
      fileNameLabel: "文件名",
      fileNamePrefixPlaceholder: "文件名前缀（可自定义）",
      fileNamePlaceholder: "文件名（可自定义）",
      resetFileName: "恢复自动命名",
      folderHint: "导出到该文件夹，文件名可自行修改；同名文件会自动追加序号，不会覆盖。",
      noFolderHint:
        "未选择文件夹时，点击「开始处理」会弹出保存文件对话框，直接指定单个输出文件。",
      resolvedPrefix: "实际导出为：",
      donePrefix: "导出完成：",
      openFolder: "打开所在文件夹",
      run: "开始处理",
      /** 以下三个是可选 props 的回退值：调用方不传时渲染，原本写在参数默认值里 */
      headingDefault: "导出",
      emptyFolderHintDefault: "未选择（点击「开始处理」时弹出保存文件对话框）",
      runningLabelDefault: "正在处理…",
    },
    clipEditor: {
      desktopOnly: "该功能需要在 Electron 桌面版中使用",
      bridgeMissing: "当前主进程未提供视频选择接口，请使用最新版本重试",
      clipsAdded: "已添加 {count} 个片段",
      readFailed: "{count} 个文件无法读取（可能不是视频）",
    },
  },
  head: {
    title: "工具箱",
    themeToggle: "切换白天 / 黑夜主题",
    description: "轻量高效的媒体处理工具集",
    searchPlaceholder: "搜索工具...",
    /** 分类 Tab 名（与工具卡片名逐字相同，但分属两个组件，各自登记） */
    tabs: {
      all: "全部工具",
      image: "图片处理",
      video: "视频处理",
      models: "模型插件",
      ai: "AI 创作",
    },
  },
  main: {
    back: "返回工具箱",
    empty: "没有匹配的工具，请调整分类或搜索关键词",
    exifDescription: "批量清除、打乱或自定义图片元数据",
    videoDescription: "视频剪切、变速与裁剪",
    gifDescription: "视频片段一键转换为动图",
    openHint: "点击开始使用",
    exifName: "EXIF 编辑器",
    videoName: "视频工具箱",
    gifName: "GIF 转换器",
    comicName: "漫画生成器",
    exifBadge: "AI 图片专用",
    gifBadge: "热门",
    comicBadge: "AI 创作",
  },
  civitai: {
    // 本地库排序与在线库的发布/热度排序分离，不能共用同一组语义。
    // name 对应文件全名，date 明确指磁盘修改时间而非网站发布日期。
    // size 使用原始字节数比较，显示文案不携带硬编码体积单位。
    // mark 来源仅限已保存的触发词，提示必须同时解释无资料项排末尾。
    // loading 表示小型本地 JSON 读取，不应出现“正在匹配 Civitai”的文案。
    // failed 说明名称回退与手动重扫路径，不能假装排序资料已读取成功。
    localSort: {
      title: "排列方式",
      name: "名称",
      date: "日期",
      size: "大小",
      mark: "标记",
      asc: "递增",
      desc: "递减",
      direction: "排列方向",
      markHint: "按本地已保存的触发词排序，缺少标记的模型置后",
      loading: "正在读取本地标记…",
      failed: "本地标记读取失败，已按名称显示，请重新扫描后重试",
    },
    metadata: {
      batchOccupied: "批量补全正在执行，结束后可手动匹配此模型。",
      heading: "模型来源信息", source: "来源", title: "来源标题", creator: "作者",
      loading: "正在读取来源 JSON…", missing: "该版本没有同名 .civitai.json 来源文件。",
      invalid: "来源 JSON 无法读取或格式不正确。", unsupported: "来源 JSON 版本暂不支持。",
      unavailable: "无法读取模型来源，请检查模型目录配置并重启应用。",
      hashHint: "文件的 SHA-256 指纹，用于精确匹配 Civitai 文件版本；说明和触发词来自匹配版本的公开资料。",
      recover: "通过 SHA-256 补全资料", recovering: "正在流式读取模型并查询 Civitai…",
      coverUnavailable: "来源资料已保存，预览图暂未能下载；可稍后手动设置封面。",
      recovery: {
        recovered: "已补全来源资料及 logo 封面。", existing: "来源资料和可用 logo 封面已齐全，原有资料已保留。",
        notFound: "Civitai 未找到此文件的 SHA-256，可能尚未收录或已经删除。",
        auth: "Civitai 拒绝访问，请在模型插件中检查 API Key 和访问权限。",
        network: "无法连接 Civitai，请检查网络后重试。", timeout: "读取或查询超时，请稍后重试。",
        invalid: "文件不在配置的模型目录内、文件无效，或服务返回的数据未通过精确匹配校验。",
        changed: "识别期间模型文件发生变化，未保存资料；请等待文件稳定后重试。",
        busy: "模型目录正在操作或识别任务已满，请稍后重试。", io: "无法读取模型或保存资料，请检查目录权限后重试。",
        noPreview: "尚未补全：模型已匹配并保留文字资料，但 C 站没有当前可用的预览图，缺少 logo。",
        coverFailed: "尚未补全：logo 下载、保存或图片解码失败。文字资料已保留，可重试或手动设置封面。",
        metadataInvalid: "尚未补全：原有来源文件损坏、无法读取或版本不受支持，已保留原文件，请备份处理后重试。",
        unsupportedType: "尚未补全：C 站存在对应文件，但当前补全仅适配 LoRA、Checkpoint 和 TextualInversion，暂不支持该模型类型。",
      },
    },
    recoveryBatch: {
      title: "批量补全模型资料", start: "批量补全", scope: "范围：当前筛选的全部模型，包含 {count} 个文件版本。",
      hint: "完成标准：来源资料可读取，且有可显示的 logo 封面。只有文字资料不会计为完成。",
      progress: "已检查 {processed}/{total} · 已完成 {completed} · 未完成 {incomplete}",
      waiting: "等待补全", running: "正在读取 SHA-256、查询 C 站并补充 logo…", cancelled: "已停止，尚未执行。",
      stop: "停止后续任务", stopping: "当前文件完成后停止…", retry: "重试未完成项", results: "模型补全逐项结果",
      continueHint: "切换页面会继续处理；停止后续任务将等待当前文件结束。",
      scanFailed: "批量检查已结束，但模型列表刷新失败，请点击重新扫描；已保存的资料仍然保留。",
    },
    fileInfo: "文件信息与校验", unavailable: "暂无可下载文件",
    online: "在线模型",
    local: "本地模型",
    // 官方目录用于一级导航，用户目录保持真实层级，不把标签当作文件夹。
    // 单文件卡片不能调用旧的整目录删除，原因在操作附近明确呈现。
    officialModels: "官方模型分类", myFolders: "我的分类", chooseOfficial: "选择官方分类后逐层浏览文件夹", folderPath: "模型文件夹路径", toggleFolder: "展开或收起 {name}", folderOperationOnly: "此目录包含多个模型，当前移动和删除以文件夹为单位。为避免影响其他模型，单文件卡片不执行该操作。",
    // 本地工作区只提供索引实际支持的名称排序，密度切换复用同一模型卡片。
    fileName: "文件名", sourceHeading: "来源与作者", workspaceBack: "返回工作台", sortName: "名称 A–Z",
    sortNameReverse: "名称 Z–A", viewLarge: "大卡片视图", viewGrid: "网格视图", viewList: "列表视图",
    localTitle: "本地模型库",
    localDescription: "使用设置中的模型扫描目录，显示已扫描的模型和本地封面",
    scan: "重新扫描",
    scanning: "正在扫描…",
    scanFailed: "扫描失败，请检查设置中的模型目录后重试",
    configure: "配置扫描目录",
    localEmpty: "暂无本地模型，请先在设置中配置目录并扫描",
    localSearch: "搜索本地模型名称、分类或文件名",
    localCategory: "分类",
    localType: "模型大分类",
    scrollMore: "继续向下滚动，加载更多",
    allLoaded: "已显示全部模型",
    localFiles: "本地模型文件",
    localChoose: "选择本地模型，查看封面及文件版本",
    // 摘要提示删掉“同名”，因为文件改名后仍可能靠已有 JSON 命中。
    // 悬停说明限定为保存过的完整摘要，避免用户误以为浏览列表时重算了模型。
    localFound: "本地已有相同文件",
    localMatchHint: "本地来源 JSON 保存的完整 SHA256 与 C站文件一致；此处未重新读取模型校验",
    // 名称证据单列词条，不能借用摘要提示让同名看起来像内容验证通过。
    // “前缀”在这里指去除权重扩展名后的完整主干，不指字符串开头部分。
    // 名称提示保留未校验说明，文件夹和文件都相同仍不能保证字节未被替换。
    localNameFound: "本地已有同名文件",
    localNameMatchHint: "本地文件夹名与 C站标题、文件名前缀均完全一致；未校验文件内容",
    categoryMove: {
      acknowledge: "我已知晓：将移动整个模型文件夹，包含所有版本、封面和其他文件。",
      title: "切换分类", move: "移动到此分类", moving: "正在移动…", done: "模型分类已更新",
      hint: "移动整个模型文件夹，包含所有版本和封面；保留当前系列目录。",
      destination: "目标文件夹", crossRoot: "不支持跨大分类自动移动。请打开源文件夹和目标大分类文件夹，在资源管理器中自行剪切，完成后重新扫描。",
      openSource: "打开源文件夹", openTarget: "打开目标大分类", openFailed: "无法打开文件夹，请检查路径是否存在。",
      layout: "此目录不是独立模型文件夹，无法自动移动。请在资源管理器中整理为「分类/模型名/模型文件和封面」后重新扫描。",
      busy: "模型正在下载或保存文件，请完成后再切换分类。",
      exists: "目标分类下已存在同名模型文件夹，不会覆盖或合并，请选择其他分类。",
      io: "移动失败，请检查文件是否被占用或目录权限；不会改为复制后删除。",
    },
    title: "C站模型", description: "浏览、筛选与下载 Civitai 模型",
    batch: {
      browseHint: "点击模型查看详情", exit: "退出多选", continueMove: "移动所选模型", continueDelete: "删除所选模型",
      selected: "已选 {count} 个模型", selectAll: "全选当前结果", clear: "取消选择", details: "查看详情",
      move: "移动模型", delete: "删除模型", moveTitle: "批量移动模型", deleteTitle: "批量删除模型",
      select: "选择模型：{name}", limit: "每次最多操作 200 个模型，请减少选择。",
      moveHint: "模型文件夹及其中的版本、封面和其他文件会一起移动。保留系列目录，不支持跨大分类移动。",
      deleteHint: "将所选模型的整个文件夹（包含全部版本、封面和其他文件）移入系统回收站；不会永久删除。",
      acknowledgeMove: "我已知晓上述移动范围，并确认目标分类。", acknowledgeDelete: "我已知晓将删除这些模型及其文件夹中的全部文件。",
      mixedRoots: "选中的模型属于不同大分类，请选择同一大分类内的模型再移动。",
      confirmMove: "确认移动", confirmDelete: "确认删除", working: "正在处理…",
      result: "已完成 {success} 个，失败 {failed} 个。", refreshFailed: "文件已处理，但刷新失败，请重新扫描。",
    },
    search: "搜索", searchPlaceholder: "搜索模型名称、模型 ID 或粘贴 C站搜索网址",
    filter: "筛选", reset: "重置筛选", base: "基础模型", baseAll: "全部基础模型",
    baseSearch: "搜索基础模型", baseEmpty: "没有匹配的基础模型", sort: "排序",
    popular: "下载最多", newest: "最近更新", rated: "评分最高", all: "全部",
    source: "API 来源", count: "{count} 个模型", more: "加载更多", loading: "正在拉取模型…",
    ready: "接口已连接", requestFailed: "无法连接所选站点，请检查网络或切换 API 来源后重试",
    empty: "没有找到模型，请调整筛选条件", retry: "重试", details: "模型详情",
    choose: "选择模型，查看预览图、版本和下载文件", version: "模型版本",
    files: "下载文件", noFiles: "此版本暂时没有可下载文件", preview: "版本预览图",
    noPreview: "暂无预览图", prevImage: "上一张预览图", nextImage: "下一张预览图",
    // 模型说明阅读器的两个状态共用键，在线和本地不能各自添加不同操作文案。
    // 只控制说明区，不表示展开全部模型或打开整页详情。
    showAllDescription: "显示全部", collapseDescription: "收起",
    words: "触发词", about: "模型说明", noDescription: "作者未提供说明。",
    download: "下载模型", downloadHint: "保存到设置中的模型目录，可选择分类和更换封面。",
    transfer: {
      centerTitle: "下载管理", openCenter: "查看下载进度", empty: "暂无下载任务",
      dismiss: "移除下载记录，保留模型及封面文件",
      back: "返回模型详情", start: "开始下载", starting: "正在开始…",
      destination: "保存位置", newCategory: "自定义分类…", categoryPlaceholder: "输入分类名称",
      categoryHint: "未分类的模型保存到 Uncategorized 文件夹；每个模型独立一个文件夹。",
      invalidCategory: "分类名不能包含路径、特殊字符、保留名称，或以点、空格结尾。",
      logo: "模型封面", changeLogo: "更换封面", resetLogo: "使用当前预览图",
      logoHint: "使用详情中当前显示的预览图作为封面；没有图片时显示模型文件名。支持 PNG、JPEG、WebP，最大 20 MB。下载时会同时保存模型来源 JSON。",
      logoWarning: "模型已保存，预览封面下载失败。可在本地模型中更换封面。",
      logoChanged: "模型封面已更新", tasks: "下载记录 · {count} 个进行中",
      completed: "已下载：{name}",
      remove: "删除任务及下载文件", cancelHint: "取消下载，保留进度以便重试", retryHint: "重试下载，支持时从已有进度继续",
      progressKept: "进度已保留", estimating: "正在估算剩余时间", unknownTotal: "未知大小",
      remainingMinutes: "剩余约 {count} 分钟", remainingSeconds: "剩余约 {count} 秒",
      progress: "{speed}/s · {received}/{total}，{remaining}",
      status: { downloading: "下载中", saving: "保存封面中", completed: "已完成", failed: "下载失败", cancelled: "已取消", removed: "已删除" },
      errors: {
        configuration: "请先在设置中配置对应模型目录。Embedding 需要配置模型检索根目录。",
        invalid: "分类、文件名、下载地址或封面无效，请重新选择。",
        exists: "该位置已有同名文件或正在下载，不会覆盖。请选择其他分类或文件。",
        network: "无法连接下载服务器或传输中断，请检查网络与代理后重试。",
        auth: "服务器拒绝下载，请检查设置中的 Civitai API Key 和该模型的下载权限。",
        redirect: "下载地址跳转失败、跳转次数过多或目标地址不受支持，请重新发起下载。",
        timeout: "下载连接或数据传输超时，请检查网络与代理后重试。",
        response: "下载服务器返回了错误响应或网页内容，无法保存为模型，请稍后重试。",
        integrity: "文件不完整或 SHA256 校验失败，下载已取消，请重试。",
        io: "无法写入模型目录，或同时下载过多。请检查权限、磁盘空间后重试。",
        desktop: "本地模型下载需要桌面版，请更新并重启应用。",
      },
    },
    modelPage: "查看 C站页面", websiteSearch: "网站搜索结果", clearBase: "清除基础模型",
    downloads: "下载", likes: "赞", comments: "评论", tips: "打赏",
  },
  comic: {
    title: "漫画生成器",
    description: "AI 辅助漫画分镜与创作",
    emptyHint: "输入描述或上传图片开始创作",
    pageHint: "拖动格子调整排版，编辑顶点制作不规则分镜",
    layout: "排版",
    views: { switch: "切换漫画工作视图", side: "编辑", stage: "画布", outline: "分镜目录" },
    mixedTemplate: "混合分镜模板",
    customTemplate: "自定义排版",
    customModeHint: "自定义模式下可拖动格子和右下角控制点",
    outline: "分镜目录",
    selected: "当前分镜",
    panelCount: "{count} 格",
    image: "画面",
    imageRemoved: "图片已移除",
    imageTools: { title: "图片工具", open: "打开图片工具", menu: "工具", collapse: "收起", replace: "更改图片", blur: "模糊化", remove: "删除图片", restore: "恢复图片", move: "拖动图片工具栏", invalidFile: "请选择不超过 4 MB 的 PNG、JPEG 或 WebP 图片", docking: "工具箱停靠方式", fold: "折叠工具箱", expand: "展开工具箱", dock: { left: "停靠左侧", right: "停靠右侧", floating: "分离浮动" } },
    upload: "替换图片",
    titleLabel: "分镜标题",
    descriptionLabel: "画面描述",
    shape: "形状",
    editShape: "编辑多边形",
    finishShape: "完成形状编辑",
    addVertex: "新增顶点",
    removeVertex: "删除顶点",
    resetShape: "恢复矩形",
    vertexCount: "{count} 个顶点",
    dragHint: "拖动顶点调整轮廓",
    polygonEnterHint: "拖动顶点调整轮廓，按回车完成编辑",
    emptyPanel: "空白分镜",
    exportJson: "导出排版 JSON",
    more: "更多操作",
    zoom: { title: "缩放", out: "缩小画布", in: "放大画布", actual: "实际尺寸" },
    exportPng: "导出 PNG",
    exportingPng: "导出中…",
    pngExported: "已导出漫画图片（{width}×{height}）",
    exportFailed: "图片导出失败，请重试",
    exportImageLoadFailed: "分镜图片加载失败，请替换图片后重试",
    invalidExportLayout: "分镜轮廓或尺寸无效，请调整后重试",
    invalidPageSize: "画布宽高须为 64–4096 像素的整数",
    pageSize: {
      title: "画布尺寸", width: "宽度", height: "高度",
      current: "宽度 {width} px · 高度 {height} px",
      lock: "锁定画布尺寸", unlock: "解锁画布尺寸",
      fit: "按比例显示",
      drag: { width: "拖动调整画布宽度", height: "拖动调整画布高度", both: "拖动调整画布宽高" },
    },
    reset: "恢复模板",
    saved: "已保存本机草稿",
    uploadFailed: "图片载入失败",
    templates: {
      backgroundColor: "模板背景",
      finishLayout: "完成自定义排版", saveTitle: "保存排版到模板库", nameLabel: "模板名称", newCategory: "新建分类", categoryName: "分类名称",
      geometryHint: "仅保存分格、形状与画布尺寸，使用文字和纯色占位，不保存图片。", saving: "保存中…", savedToLibrary: "自定义排版已保存到模板库",
      saveFailed: "模板保存失败，请重试", loadFailed: "模板库加载失败，请重试", panelLabel: "分镜 {index}",
      title: "分镜模板库", open: "选择模板", category: "模板分类", total: "{count} 种排版",
      apply: "应用模板", confirmApply: "确认替换", undo: "撤销模板替换",
      shrinkWarning: "此模板将移除末尾 {count} 格及其内容。是否继续？应用后可撤销。",
      categories: { all: "全部", regular: "规则分格", dialogue: "对话叙事", action: "动作斜切", polygon: "不规则多边形", torn: "撕裂跨格" },
      names: {
        fourGrid: "四格均分", sixGrid: "六格叙事", nineGrid: "九格节奏", fourStrips: "四条横镜", threeColumns: "三列纵镜",
        mixed: "跨行混合", opener: "大幅开场", reactions: "反应连拍", tall: "纵深主镜", alternate: "交错对话",
        slant: "错位斜切", doubleCut: "双重斜切", burst: "放射爆发", impact: "三拍冲击", inset: "特写叠镜",
        shards: "碎片分镜", pentagons: "五边叙事", zigzag: "折线转场", hexagon: "六角主镜", offset: "错落多边",
        tornStrips: "横向撕片", tornDiagonal: "斜向跨三格", tornShards: "破碎相片", tornInset: "撕片叠放", tornSlant: "撕裂斜切",
      },
    },
    defaults: {
      sceneTitle: "场景建立",
      sceneDescription: "开场建立空间关系。",
      reactionTitle: "人物反应",
      reactionDescription: "角色停下动作。",
      closeupTitle: "对话特写",
      closeupDescription: "视线落在关键物件上。",
      depthTitle: "空间纵深",
      depthDescription: "竖向格连接上下节奏。",
      revealTitle: "揭示",
      revealDescription: "三人交换目光。",
    },
  },
  gif: {
    title: "GIF 转换器",
    description: "视频片段一键转换为动图 —— 帧率可选、分辨率等比缩放，多段按列表顺序拼接",
    folderBridgeMissing: "当前主进程未提供文件夹选择接口，请完全重启应用后再试",
    outputFolderDialogTitle: "选择 GIF 输出文件夹",
    outputFolderSet: "已设置输出文件夹",
    done: "GIF 制作完成",
    /** 转码异常且 error 不是 Error 实例时的兜底文案 */
    makeFailed: "GIF 制作失败",
    cancelled: "已取消处理",
    trimSection: "剪切区间",
    segmentPrefix: "第",
    segmentMiddle: "段 ·",
    exportHeading: "导出 GIF",
    runningLabel: "正在制作 GIF…",
    concatSegments: " · 拼接 {count} 段",
    durationPrefix: "共",
    durationMiddle: "段，选区总时长",
    approxPrefix: "，约",
    frameNote: "帧； GIF 无音轨，采用调色板两遍编码（palettegen/paletteuse）以减少色带。",
    settings: {
      title: "GIF 参数",
      frameRateLabel: "帧率（每秒帧数）",
      recommendedPrefix: "推荐",
      maxPrefix: "· 上限",
      unitFps: "帧/秒",
      fpsAriaLabel: "每秒帧数",
      customHintPrefix: "点击输入框可直接键入自定义帧率（1–",
      customHintSuffix:
        "，超出范围会自动夹取），点击右侧 箭头展开预设；帧率越高越流畅，体积也越大，当前约",
      frameUnitSuffix: "帧。",
      resolutionLabel: "分辨率（等比缩放）",
      widthAriaLabel: "GIF 输出宽度",
      maxWidthPrefix: "不超过源分辨率（源宽",
      sizeWarning: "高帧率 + 大分辨率会生成很大的 GIF 文件，若体积过大可降低帧率或宽度。",
    },
  },
  exif: {
    title: "EXIF 编辑器",
    subtitleSingle: "单文件元数据编辑与重命名",
    subtitleBatch: "批量编辑元数据 & 智能重命名",
    subtitleEmpty: "拖拽图片 / 选择文件夹批量导入，编辑 PNG 元数据（tEXt）",
    inconsistent: "元数据结构不一致",
    /** 单个文件处理失败时的行内错误文案 */
    processFailed: "处理失败",
    toastSaved: "处理完成：{count} 个文件已{action}",
    toastSavedToFolder: "保存到输出文件夹",
    toastDownloaded: "下载",
    toastSuccess: "处理完成：成功 {success} 个，失败 {failed} 个（失败文件已保留在队列）",
    bannerAllSuccess: "处理完成：{count} 个文件全部成功",
    bannerPartial: "处理完成：成功 {success} 个，失败 {failed} 个",
    bannerQueueKept: "失败文件已保留在下方队列中，可复查后重新处理。",
    bannerSavedTo: "已保存到：{path}",
    bannerDownloaded: "已通过浏览器下载。",
    closeBanner: "关闭提示",
    metadataTitle: "元数据编辑",
    renameTitle: "文件重命名",
    renamePreview: "重命名预览：",
    inconsistentKeys: "不一致的字段：",
    /** 一致性横幅：用户在弹窗里选择「强行统一并清空」后的提示 */
    forceClearBanner: "✓ 已强制清空所有不一致的元数据，结构已统一，现在可以批量添加新元数据",
    /** 一致性横幅：用户选择「取消，保留原样」后的提示 */
    forceKeepBanner: "⚠ 已保留原始不一致的元数据。当前仅支持批量重命名功能，元数据编辑已禁用。",
    batchMetadataTitle: "批量元数据配置",
    batchRenameTitle: "批量重命名配置",
    batchRenamePreview: "重命名预览（前 3 个文件）：",
    forceClearModal: {
      title: "检测到元数据结构不一致",
      body: "您导入的图片包含不同的元数据字段。为了进行统一的批量处理，系统需要标准化格式。",
      choose: "选择",
      option: "“强行统一并清空”",
      willDo: "将会：",
      removeAll: "移除所有图片中现有的元数据（包括 ComfyUI 工作流）。",
      switchToAdd: "自动为您切换到“添加字段”模式。",
      reAdd: "允许您为所有图片重新添加统一的新元数据。",
      cancelKeep: "取消，保留原样",
      confirm: "强行统一并清空",
    },
    uploadZone: {
      none: "未选择",
      importing: "正在导入…",
      dropHint: "拖拽图片到此处，或",
      browse: "点击上传",
      inputFolderLabel: "输入文件夹（批量导入）",
      pickFolder: "选择文件夹",
      outputFolderLabel: "输出文件夹（批量保存）",
      desktopOnly: "当前为浏览器环境，文件夹批量导入/保存需在 Electron 桌面版中使用。",
    },
    fileList: {
      // 标题与文件数括号拼接显示（「文件列表 (3)」），因此值里保留了空格与左括号
      listLabel: "文件列表 (",
      clear: "清空列表",
      fieldUnit: "个字段",
      outputTo: "输出到：{path}",
      noOutputFolder: "未选择输出文件夹（浏览器模式下将逐个下载）",
      processing: "处理中…",
      processAndSave: "批量处理并保存 ({count})",
      processAndDownload: "处理并下载 ({count})",
    },
    renameConfig: {
      enable: "启用重命名",
      prefixLabel: "前缀名称",
      prefixPlaceholder: "例如: comic",
      startNumber: "起始数字",
      numberSuffix: "数字后缀",
      direction: "排序方向",
      ascending: "↑ 递增",
      descending: "↓ 递减",
    },
    metadataEditor: {
      locked: "已锁定",
      enable: "启用元数据编辑",
      clearAll: "清除所有元数据",
      emptyHint: "当前没有元数据字段，点击下方按钮添加。",
      keyPlaceholder: "键名",
      valuePlaceholder: "值",
      addField: "添加字段",
      /** 批量模式切换按钮（模块级 MODE_LABELS 存 key，渲染时用组件的 t 取文案） */
      modeEdit: "编辑现有",
      modeAdd: "添加字段",
      modeClear: "清除全部",
    },
  },
} as const;

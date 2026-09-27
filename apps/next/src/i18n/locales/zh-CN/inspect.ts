/**
 * 本地解析页（`view/inspect/**` + `utils/remixFromInspect.ts` +
 * `utils/sdImageInspector/**`）词条。
 * 命名约定：`inspect.<语义>`，例如 `inspect.empty.title`。
 *
 * 图片内嵌 Meta 的字段名不再用中文当标识：标识在
 * `utils/sdImageInspector/metaFieldId.ts`（`app:prompt` 等，只在内存里用），
 * 展示文案在下面 `metaField.*`。落盘的 PNG 块关键字本来就是全 ASCII 的。
 */
export const inspect = {
  result: {
    title: "解析结果",
    inspecting: "解析中…",
    placeholder: "请选择或上传图片",
    loadRemix: "载入二创",
    emptyHint: "从左侧选择生成路径图片，或上传本地图片以查看 Meta",
    metaLabel: "内嵌 Meta",
    metaUnrecognized: " · 未识别",
    notOurs:
      "非本生成器生成：图片内嵌 Meta 中没有本生成器写入的 ComfyUI 工作流，无法解析正面提示词 / 反向提示词 / 扩展 LoRA 等参数。",
    /** 图片由更新版本的应用生成（内嵌 Meta 版本号高于当前支持的版本） */
    metaVersionTooNew:
      "这张图片的内嵌 Meta 版本为 {version}，本应用最高支持 {supported} —— 请升级到较新版本后再二创。",
  },
  page: {
    title: "本地图片解析",
    description:
      "上传本地图片或从生成路径选择，读取 PNG / EXIF / Stealth 内嵌参数。运算完全在本地设备运行。",
    uploadTitle: "上传图片",
    uploadHint: "拖拽或点击选择 PNG / JPEG / WebP 等",
    dropzoneTitle: "点击或拖拽图片到此处",
    dropzoneHint: "支持 A1111 / NovelAI / ComfyUI 等内嵌参数",
    pathTitle: "生成路径图片",
    pathHint: "点击缩略图解析",
    loadingImages: "正在加载图片…",
    emptyImages: "生成路径下暂无图片",
    electronOnly: "生成路径图片请在 Electron 桌面版中解析",
    parseFailed: "图片 Meta 解析失败",
    invalidFile: "请选择 PNG / JPEG / WebP 等图片文件",
    cannotRemix: "非本生成器生成，无法读取参数",
    remixLoadedWithWarnings: "已载入二创参数 ({warnings})",
    remixLoaded: "已载入二创参数，正在跳转创作页",
  },
  uploadDropzone: {
    title: "上传图片解析",
    hint: "点击或拖拽 PNG / JPEG / WebP 等到此处",
  },
  metaField: {
    copied: "{key} 已复制",
    copyLabel: "复制{key}",
    /**
     * 我们合成字段的**展示文案**。字段标识见
     * `utils/sdImageInspector/metaFieldId.ts` —— 标识负责匹配、这里负责显示，
     * 两者分开后，切换语言不会影响 remixFromInspect 的字段匹配。
     * 文件自带的块关键字（EXIF 标签名等）没有词条，按原样展示。
     */
    prompt: "提示词",
    negativePrompt: "负面提示词",
    otherParams: "其他参数",
    fileName: "文件名",
    fileSize: "文件大小",
    rawParameters: "完整生成信息",
  },
  /** `utils/sdImageInspector/inspectSdImage.ts` 里真正面向用户的文案 */
  sdImage: {
    /** A1111 / WebUI 参数里没有负面提示词时的占位值 */
    noNegativePrompt: "无",
    /** 无法识别内嵌 Meta 时的兜底字段名 */
    fallbackFieldKey: "提示",
    /** 无法识别内嵌 Meta 时的说明文案 */
    metadataUnreadable: "无法读取图像 Metadata，这可能不是 Stable Diffusion 生成的图，或图片经过压缩。",
  },
  errors: {
    readFailed: "读取文件失败",
    unsupportedFormat: "不支持的图片格式",
    modelNotFound: "未找到模型 {name}",
    lorasNotFound: "未找到 {count} 个 LoRA",
  },
} as const;

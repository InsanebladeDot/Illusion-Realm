/**
 * English catalogue — **结构与 zh-CN 完全一致**（由 apps/next/scripts/mirror-locale.mjs 生成）。
 *
 * 现状：值仍与 zh-CN 相同（镜像），翻译按命名空间增量推进。
 * 未翻译数量由 apps/next/scripts/check-i18n-en.mjs 的 ratchet 盯着（只减不增），
 * 因此「翻了哪些」是可以机检的数字，不靠人记。
 */
export const inspect = {
  "result": {
    "title": "解析结果",
    "inspecting": "解析中…",
    "placeholder": "请选择或上传图片",
    "loadRemix": "载入二创",
    "emptyHint": "从左侧选择生成路径图片，或上传本地图片以查看 Meta",
    "metaLabel": "内嵌 Meta",
    "metaUnrecognized": " · 未识别",
    "notOurs": "非本生成器生成：图片内嵌 Meta 中没有本生成器写入的 ComfyUI 工作流，无法解析正面提示词 / 反向提示词 / 扩展 LoRA 等参数。",
    "metaVersionTooNew": "这张图片的内嵌 Meta 版本为 {version}，本应用最高支持 {supported} —— 请升级到较新版本后再二创。"
  },
  "page": {
    "title": "本地图片解析",
    "description": "上传本地图片或从生成路径选择，读取 PNG / EXIF / Stealth 内嵌参数。运算完全在本地设备运行。",
    "uploadTitle": "上传图片",
    "uploadHint": "拖拽或点击选择 PNG / JPEG / WebP 等",
    "dropzoneTitle": "点击或拖拽图片到此处",
    "dropzoneHint": "支持 A1111 / NovelAI / ComfyUI 等内嵌参数",
    "pathTitle": "生成路径图片",
    "pathHint": "点击缩略图解析",
    "loadingImages": "正在加载图片…",
    "emptyImages": "生成路径下暂无图片",
    "electronOnly": "生成路径图片请在 Electron 桌面版中解析",
    "parseFailed": "图片 Meta 解析失败",
    "invalidFile": "请选择 PNG / JPEG / WebP 等图片文件",
    "cannotRemix": "非本生成器生成，无法读取参数",
    "remixLoadedWithWarnings": "已载入二创参数 ({warnings})",
    "remixLoaded": "已载入二创参数，正在跳转创作页"
  },
  "uploadDropzone": {
    "title": "上传图片解析",
    "hint": "点击或拖拽 PNG / JPEG / WebP 等到此处"
  },
  "metaField": {
    "copied": "{key} 已复制",
    "copyLabel": "复制{key}",
    "prompt": "提示词",
    "negativePrompt": "负面提示词",
    "otherParams": "其他参数",
    "fileName": "文件名",
    "fileSize": "文件大小",
    "rawParameters": "完整生成信息"
  },
  "sdImage": {
    "noNegativePrompt": "无",
    "fallbackFieldKey": "提示",
    "metadataUnreadable": "无法读取图像 Metadata，这可能不是 Stable Diffusion 生成的图，或图片经过压缩。"
  },
  "errors": {
    "readFailed": "读取文件失败",
    "unsupportedFormat": "不支持的图片格式",
    "modelNotFound": "未找到模型 {name}",
    "lorasNotFound": "未找到 {count} 个 LoRA"
  }
} as const;

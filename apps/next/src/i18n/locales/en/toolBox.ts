/**
 * English catalogue — **结构与 zh-CN 完全一致**（由 apps/next/scripts/mirror-locale.mjs 生成）。
 *
 * 现状：值仍与 zh-CN 相同（镜像），翻译按命名空间增量推进。
 * 未翻译数量由 apps/next/scripts/check-i18n-en.mjs 的 ratchet 盯着（只减不增），
 * 因此「翻了哪些」是可以机检的数字，不靠人记。
 */
export const toolBox = {
  "video": {
    "title": "Video Trimmer",
    "description": "Join clips · Trim start/end · Change speed · Crop — powered by local ffmpeg",
    "folderBridgeMissing": "The main process does not expose folder selection right now — fully restart the app and try again",
    "outputFolderDialogTitle": "Choose the video output folder",
    "outputFolderSet": "Output folder set",
    "concatDone": "Video joined",
    "processDone": "Video processed",
    "processFailed": "Processing failed",
    "cancelled": "Processing cancelled",
    "trimSection": "Trim range",
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
      "hintPrefix": "直接拖动时间轴上的",
      "hintSuffix": "标记划定剪切区间， 拖动时画面会实时跳到对应帧；点击时间轴可跳转预览。"
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
    "description": "轻量高效的媒体处理工具集",
    "searchPlaceholder": "搜索工具...",
    "tabs": {
      "all": "全部工具",
      "image": "图片处理",
      "video": "视频处理",
      "ai": "AI 创作"
    }
  },
  "main": {
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
  "comic": {
    "title": "漫画生成器",
    "description": "AI 辅助漫画分镜与创作",
    "emptyHint": "输入描述或上传图片开始创作"
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

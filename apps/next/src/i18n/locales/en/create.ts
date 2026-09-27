/**
 * English catalogue — **结构与 zh-CN 完全一致**（由 apps/next/scripts/mirror-locale.mjs 生成）。
 *
 * 现状：值仍与 zh-CN 相同（镜像），翻译按命名空间增量推进。
 * 未翻译数量由 apps/next/scripts/check-i18n-en.mjs 的 ratchet 盯着（只减不增），
 * 因此「翻了哪些」是可以机检的数字，不靠人记。
 */
export const create = {
  "addImagesToFolderDialog": {
    "titlePrefix": "Add images to “",
    "description": "Pick from the images already generated locally and add them to this folder.",
    "selected": "Selected",
    "imageUnit": "image(s)",
    "loading": "Loading images…",
    "empty": "No local images available to add",
    "selectRequired": "Select the images to add first",
    "electronOnly": "Add images in the Electron desktop app",
    "nothingToAdd": "Nothing to add",
    "added": "Added {count} image(s) to “{name}”",
    "add": "Add ({count})",
    "failed": "Failed to add images"
  },
  "advancedSettings": {
    "title": "Advanced settings",
    "presetPrompt": "Preset prompt",
    "presetPromptHint": "About preset prompts",
    "usePreset": "Use preset prompt",
    "inUse": "In use: ",
    "edit": "Edit",
    "positivePrefix": "+Positive: ",
    "negativePrefix": "−Negative: ",
    "sampler": "Sampler",
    "samplerHint": "About samplers",
    "scheduler": "Scheduler",
    "schedulerHint": "About schedulers",
    "steps": "Steps",
    "stepsHint": "About steps",
    "cfgRatio": "CFG scale",
    "cfgHint": "About CFG",
    "seed": "Seed",
    "seedHint": "About the seed",
    "random": "Random",
    "custom": "Custom",
    "seedPlaceholder": "Enter a seed"
  },
  "audioUpload": {
    "emptyHintDefault": "Click to choose or upload audio"
  },
  "bulkSelection": {
    "selectAll": "Select all",
    "deselectAll": "Deselect all"
  },
  "createFolderDialog": {
    "nameRequired": "Enter a folder name",
    "electronOnly": "Create folders in the Electron desktop app",
    "maxDepth": "Folders can be nested at most {depth} levels deep",
    "created": "Folder “{name}” created",
    "subfolderDescription": "Create a subfolder inside “{name}” (at most {depth} levels deep).",
    "nameLabel": "Folder name",
    "namePlaceholder": "Enter a folder name",
    "titleNewSubfolder": "New subfolder",
    "titleNew": "New folder",
    "description": "Create folders inside the output directory; folders only hold image files.",
    "creating": "Creating…",
    "create": "Create",
    "failed": "Failed to create the folder"
  },
  "createHistorySidebar": {
    "all": "All",
    "folder": "Folders",
    "doubleClickToOpen": "Double-click to open",
    "searchFolder": "Search folders",
    "searchFolderPlaceholder": "Search folders…",
    "loadingFolders": "Loading folders…",
    "collapse": "Collapse",
    "expand": "Expand",
    "newFolder": "New folder",
    "gridView": "Grid",
    "stackView": "Stack",
    "bookmarkView": "Favorites",
    "exitSelection": "Exit selection",
    "batchSelect": "Bulk select",
    "filterAll": "Filter all",
    "searchMedia": "Search {label}",
    "searchPlaceholder": "Search…",
    "loadingImages": "Loading images…",
    "emptyInFolder": "No images in “{name}”",
    "endOfList": "End of list",
    "selected": "Selected",
    "selectAll": "Select all",
    "deleteUnsupported": "Delete is unavailable because the feature did not load — fully quit Electron and restart the app",
    "mediaLabelDefault": "Image",
    "folderImageCount": "{count} images"
  },
  "createModeTabs": {
    "image": "Image",
    "video": "Video",
    "edit": "Edit",
    "roleCover": "Role Cover",
    "roleTts": "Role TTS"
  },
  "createQuickPhraseDialog": {
    "help": "Snippet help",
    "showImage": "Show an image (optional)",
    "chooseImage": "Choose image",
    "clear": "Clear",
    "chooseImageHint": "Pick an image from your gallery to display",
    "keyword": "Keyword",
    "keywordHint": "Spaces are not allowed — they are replaced with hyphens.",
    "promptText": "Prompt text"
  },
  "deleteFolderDialog": {
    "deleteUnsupported": "Delete is unavailable because the feature did not load — fully quit Electron and restart the app",
    "deletedSummary": "Deleted “{name}” ({imageCount} images, {sidecarCount} JSON files)",
    "title": "Delete folder",
    "confirmPrefix": "Delete “",
    "confirmSuffix": "”? This cannot be undone — every image and JSON parameter file inside this folder and its subfolders will be deleted too.",
    "counting": "Counting folder contents…",
    "imagesLabel": "Images: ",
    "imagesUnit": "image(s)",
    "sidecarsLabel": "JSON params: ",
    "sidecarsUnit": "file(s)",
    "subfoldersLabel": "Subfolders: ",
    "subfoldersUnit": "item(s) (deleted as well)",
    "readFailed": "Could not read the folder contents",
    "failed": "Failed to delete the folder"
  },
  "deleteImagesDialog": {
    "deleteUnsupported": "Delete is unavailable because the feature did not load — fully quit Electron and restart the app",
    "skippedSuffix": ", {count} skipped",
    "deletedSummary": "Deleted {imageCount} images and {sidecarCount} JSON files{skipped}",
    "title": "Delete images",
    "confirmPrefix": "Delete the selected ",
    "confirmSuffix": " images? This cannot be undone — the matching JSON parameter files will be deleted too.",
    "deleting": "Deleting…",
    "failed": "Failed to delete images"
  },
  "extensionSelectDialog": {
    "title": "Add extension",
    "searchPlaceholder": "Search LoRA…",
    "empty": "No LoRA extensions found — configure the LoRA path on the Settings page and scan first",
    "selected": "Selected",
    "viewInfo": "View extension info",
    "addToFavorites": "添加到收藏",
    "versionUnit": "版本",
    "select": "选择",
    "versionDialogTitle": "选择 {name} 版本",
    "versionDialogDescription": "选择使用哪个 {name} 版本进行生成"
  },
  "generateButton": {
    "label": "生成"
  },
  "generatedImageDetailDialog": {
    "copiedLabel": "{label}已复制",
    "copyLabel": "复制{label}",
    "notOursRemix": "非本生成器生成，无法二创",
    "remixLoaded": "已载入二创参数",
    "remixLoadedWithWarnings": "已载入二创参数 ({warnings})",
    "parsingMeta": "正在解析图片内嵌 Meta…",
    "metaFromImage": "参数来自图片内嵌 Meta",
    "notOurs": "非本生成器生成",
    "notOursDescription": "这张图片的内嵌 Meta 中没有本生成器写入的 ComfyUI 工作流，无法解析正面提示词 / 反向提示词 / 扩展 LoRA 等参数，因此不能二创。",
    "generatedData": "生成数据",
    "remix": "二创",
    "model": "模型",
    "extensionLora": "扩展 LoRA",
    "prompt": "提示词",
    "negativePrompt": "反向提示词",
    "seed": "种子",
    "steps": "步数",
    "cfgRatio": "CFG 比例",
    "sampler": "采样器",
    "size": "尺寸",
    "batch": "批次"
  },
  "generatedImageContextMenu": {
    "saveAs": "Save image",
    "rename": "Rename",
    "delete": "Delete image",
    "saveUnsupported": "Saving is unavailable because the feature did not load — fully quit Electron and restart the app",
    "renameUnsupported": "Renaming is unavailable because the feature did not load — fully quit Electron and restart the app",
    "saved": "Image saved",
    "saveFailed": "Failed to save the image",
    "saveCanceled": "Save canceled"
  },
  "renameImageDialog": {
    "title": "Rename",
    "description": "Only the file name changes; the image and its embedded metadata stay the same.",
    "nameLabel": "New name",
    "namePlaceholder": "Enter a new name",
    "extensionHint": "Extension stays {ext}",
    "nameRequired": "Enter a new name",
    "renaming": "Renaming…",
    "renamed": "Renamed to “{name}”",
    "failed": "Failed to rename the image"
  },
  "historyFolderContextMenu": {
    "addImages": "添加图片",
    "createSubfolder": "新建子文件夹",
    "deleteFolder": "删除文件夹"
  },
  "historyEmptyState": {
    "noGeneratedImages": "No generated images yet — double-click a folder to browse its contents"
  },
  "imageCountDropdown": {
    "imageLabel": "图片"
  },
  "imageSizeSection": {
    "title": "图片尺寸",
    "custom": "自定义",
    "customLabel": "（自定义）",
    "customHint": "自定义宽高：{min}–{max}，自动对齐 {step} 像素。",
    "presetHint": "预设取自模型训练分辨率（{note}），比任意等比缩放更稳定；宽高上限 {max}。",
    "presetNoteFallback": "训练友好",
    "aspectRatioLabel": "（{ratio}）",
    "width": "宽",
    "height": "高",
    "customWidth": "自定义宽度",
    "customHeight": "自定义高度"
  },
  "modelSelectDialog": {
    "title": "选择 {name} 模型",
    "description": "仅加载 diffusion_models/Anima 目录下的模型文件；VAE 与 CLIP 已固定绑定，无需选择。",
    "emptyAnima": "未找到 Anima 模型，请先在设置页配置 Diffusion 模型地址（diffusion_models 目录）并扫描",
    "emptySdxl": "未找到 SDXL 模型，请先在设置页配置 Checkpoint 模型地址并在 checkpoint/SDXL 目录下放置模型",
    "showDescription": "显示描述",
    "searchPlaceholder": "搜索模型...",
    "selected": "已选",
    "select": "选择"
  },
  "modelSeriesSelector": {
    "seriesLabel": "模型系列"
  },
  "modelVersionDialog": {
    "selected": "已选择",
    "select": "选择"
  },
  "negativePromptPresetDialog": {
    "fieldLabel": "反向提示词",
    "fieldHint": "可直接使用权重语法：(tag:1.2)",
    "title": "反向提示词预设",
    "groupLabel": "反向提示词",
    "contentLabel": "内容：",
    "empty": "（空）"
  },
  "negativePromptSection": {
    "title": "反向提示词",
    "collapsedPrefix": "反向提示词已收起（当前预设：",
    "collapsedSuffix": "），点击展开",
    "none": "未选择",
    "inUse": "使用中：",
    "noPreset": "未选择预设",
    "presetEntry": "反向提示词预设",
    "placeholder": "反向提示词..."
  },
  "page": {
    "modelNotFound": "未找到模型 {name}",
    "loraNotFound": "未找到 {count} 个 LoRA",
    "remixFilledWithWarnings": "二创参数已填入 ({warnings})",
    "remixFilled": "二创参数已填入创作表单",
    "promptRequired": "请先填写提示词",
    "saveFailed": "生成完成，但图片未能保存，请检查设置中的保存路径",
    "generated": "已生成 {count} 张图片",
    "generateDone": "图片生成完成",
    "generateFailed": "ComfyUI 生成失败",
    "model": "模型",
    "addExtension": "添加扩展",
    "editComingSoon": "Edit 功能即将推出",
    "generating": "正在生成…",
    "mediaVideo": "Videos",
    "mediaRoleCover": "Cover songs",
    "mediaRoleTts": "Speech",
    "mediaImage": "Images",
    "previewAlt": "刚刚生成"
  },
  "presetPromptDialog": {
    "title": "预设提示词设置",
    "positivePrefixLabel": "正向前缀",
    "positivePrefixPlaceholder": "添加在提示词开头的标签...",
    "positivePrefixHint": "添加在你的提示词之前",
    "positiveSuffixLabel": "正向后缀",
    "positiveSuffixPlaceholder": "添加在提示词末尾的标签...",
    "positiveSuffixHint": "添加在你的提示词之后",
    "negativePrefixLabel": "反向前缀",
    "negativePrefixPlaceholder": "添加在反向提示词开头的标签...",
    "negativePrefixHint": "添加在你的反向提示词之前",
    "negativeSuffixLabel": "反向后缀",
    "negativeSuffixPlaceholder": "添加在反向提示词末尾的标签...",
    "negativeSuffixHint": "添加在你的反向提示词之后",
    "positivePrefixSummary": "+前缀：",
    "negativePrefixSummary": "−前缀："
  },
  "progress": {
    "adding": "添加中…",
    "deleting": "删除中…",
    "generating": "生成中…"
  },
  "promptCollapseButton": {
    "expand": "展开",
    "collapse": "收起",
    "expandLabel": "展开{label}",
    "collapseLabel": "收起{label}"
  },
  "promptGuideDialog": {
    "eyebrow": "提示词教程"
  },
  "quickPhraseCard": {
    "use": "使用",
    "edit": "编辑",
    "deletePhrase": "删除片段"
  },
  "quickPhraseDialog": {
    "duplicate": "关键词 #{keyword} 已存在",
    "title": "快捷短语",
    "searchPlaceholder": "搜索快捷短语...",
    "listView": "列表视图",
    "gridView": "网格视图",
    "create": "新建",
    "empty": "还没有快捷短语",
    "emptyHint": "保存你常用的提示词快捷短语。",
    "createPhrase": "创建快捷短语"
  },
  "quickPhraseFormDialog": {
    "titleCreate": "创建快捷短语",
    "titleEdit": "编辑快捷短语"
  },
  "quickPhraseImagePicker": {
    "title": "选择显示图片",
    "description": "从你的图库中选择一张图片",
    "loading": "正在加载图片…",
    "empty": "暂无已生成图片"
  },
  "historyDrawer": {
    "openLabel": "Generated images",
    "closeLabel": "Close"
  },
  "resourceCategoryFilter": {
    "filterByCategory": "按分类筛选",
    "all": "全部",
    "fontSize": "字体大小",
    "fontSizeTitle": "字体{label}",
    "displayMode": "分类显示方式",
    "tabs": "标签栏",
    "dropdown": "下拉框"
  },
  "roleCoverPanel": {
    "audioLabel": "参考音频",
    "audioEmptyHint": "点击选择或上传音频文件",
    "generateCover": "生成翻唱"
  },
  "roleModelSelect": {
    "roleLabel": "角色"
  },
  "roleSelectDialog": {
    "title": "选择角色",
    "description": "选择角色及其下的模型版本",
    "selected": "已选",
    "viewInfo": "查看角色信息",
    "addToFavorites": "添加到收藏",
    "select": "选择",
    "modelLabel": "模型："
  },
  "roleTtsPanel": {
    "textLabel": "输入文本",
    "textPlaceholder": "输入要合成的文本...",
    "audioLabel": "参考语音",
    "audioEmptyHint": "上传参考语音音频",
    "referenceTextLabel": "参考语音文本",
    "referenceTextPlaceholder": "输入参考语音对应的文本...",
    "generateVoice": "生成语音"
  },
  "selectedExtensionRow": {
    "weightLabel": "{name} 权重",
    "editWeightHint": "双击编辑权重",
    "removeLabel": "移除 {name}"
  },
  "simpleGenerateFooter": {
    "labelDefault": "生成"
  },
  "upload": {
    "required": "(必填)",
    "optional": "(可选)",
    "clickToReplace": "点击更换",
    "removeLabel": "移除{label}"
  },
  "videoCreatePanel": {
    "promptRequired": "请先填写提示词",
    "startImageRequired": "请先上传起始图片",
    "durationRange": "时长需在 {min}–{max} 秒之间",
    "generatedSaved": "视频已生成并保存至 {count} 个文件",
    "generatedUnsaved": "视频已生成（未保存到磁盘）",
    "duration": "时长",
    "durationUnit": "秒",
    "durationLimitPrefix": "时长必须 ≤",
    "durationLimitSuffix": "秒。",
    "startImage": "起始图片",
    "prompt": "提示词",
    "promptHint": "提示词说明",
    "promptPlaceholder": "描述动作和声音...",
    "generateFailed": "视频生成失败"
  },
  "videoImageUpload": {
    "previewAlt": "{label}预览",
    "clickToSelectOrUpload": "点击选择或上传",
    "dragHint": "从侧边栏拖放",
    "uploadHint": "或上传文件"
  },
  "videoWorkflowSelect": {
    "workflowLabel": "工作流"
  }
} as const;

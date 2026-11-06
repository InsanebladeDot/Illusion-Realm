/**
 * English catalogue — **结构与 zh-CN 完全一致**（由 apps/next/scripts/mirror-locale.mjs 生成）。
 *
 * 现状：值仍与 zh-CN 相同（镜像），翻译按命名空间增量推进。
 * 未翻译数量由 apps/next/scripts/check-i18n-en.mjs 的 ratchet 盯着（只减不增），
 * 因此「翻了哪些」是可以机检的数字，不靠人记。
 */
export const create = {
  animaEdit: {
    controlStrength: "Control strength",
    controlStart: "Start percentage",
    controlEnd: "End percentage",
    runInpaint: "Run inpainting",
    inpaint: "Mask inpainting", controlSize: "Use input image dimensions",
    syncImageModels: "Sync image mode",
    readImageModels: "Read source models",
    resourceHint: "Load models and LoRAs only, keeping the selected edit LoRA. Reading the source requires embedded workflow parameters.",
    resourcesLoaded: "Models and LoRAs loaded. You can continue adjusting them.",
    readingModels: "Reading model parameters…",
    resourceUnavailable: "Resources are not scanned or are incompatible with Anima. Check local model folders and select manually.",
    resourceMissing: "The local model is not scanned or has multiple matching versions: {name}. Check model folders and select manually.",
    animaOnly: "Text-guided editing supports Anima UNet only. Use a compatible image mode or source workflow.",
    metaUnsupported: "The source metadata version is newer than this app supports. Upgrade the app and try again.",
    noModelMetadata: "The source has no readable workflow model parameters. Sync image mode or select manually.",
    "textTab": "Text-guided edit",
    "maskTab": "Mask editor",
    "source": "Import original",
    "fileHint": "PNG / JPG / WebP · Up to 25 MB",
    "instruction": "Describe your changes",
    "placeholder": "For example: change the background to a cherry blossom garden. Keep the character's face, hairstyle and clothing.",
    "instructionHint": "Describe what to change and what to keep, using natural language.",
    "resolution": "Output resolution",
    "resolutionHint": "Keep original aspect ratio · Align to 8 pixels",
    "estimate": "About {size}",
    "advanced": "Advanced settings",
    "steps": "Sampling steps",
    "denoise": "Denoising strength",
    "randomSeed": "Random seed",
    "dependencies": "Required node · Installation",
    "dependencyHint": "Text-guided editing requires ComfyUI-Cosmos-Reference. Install the reference image node below in ComfyUI first.",
    "installHint": "Open a terminal in ComfyUI/custom_nodes and run the command above. Restart ComfyUI, search for this node and confirm it is available. This page does not install or confirm installation automatically.",
    "run": "Run text-guided edit",
    "stop": "Stop generation",
    "resultTitle": "Edited result",
    "original": "Original reference",
    "generated": "Generated",
    "pending": "Not generated",
    "result": "Result",
    "viewOriginal": "View original",
    "emptyTitle": "Your edited image will appear here",
    "emptyHint": "Import an image, then describe what you want to change.",
    "waitTitle": "Waiting for the edited result…",
    "waitHint": "Your edit is being processed. The actual result will appear after generation and saving.",
    "download": "Download result",
    "savedHint": "Saved to the generation output folder. Open File manager to view it, or switch to the original for comparison.",
    "resultHint": "The edited image appears here after generation. Switch to the original to compare.",
    "sourceRequired": "Import an original image first.",
    "invalidFile": "Choose a PNG, JPEG or WebP image up to 25 MB.",
    "tooLarge": "The image exceeds 40 megapixels. Resize it and try again.",
    "invalidInstruction": "Enter an editing instruction. Instructions and negative prompts must each be at most 3000 characters.",
    "invalidSeed": "Seed must be an integer from 0 to 9007199254740991.",
    "invalidParameters": "An editing parameter is out of range. Check advanced settings and resolution.",
    "modelMissing": "A server model is missing or has multiple matches: {name}. Check the installed files and folders.",
    "noResult": "No result image was returned by the editing output node. Check the workflow and required node.",
    "phase": {
      "idle": "The original is sent to your configured ComfyUI only when you run an edit.",
      "checking": "Checking models and output folder…",
      "uploading": "Uploading the original…",
      "generating": "Waiting for the ComfyUI editing result…",
      "saving": "Saving the edited result…",
      "stopping": "Requesting cancellation of this generation…"
    },
    "presets": {
      "background": {
        "label": "Change background",
        "text": "Change the background to a garden with cherry blossoms. Keep the character's face, hairstyle, pose and clothing the same."
      },
      "expression": {
        "label": "Adjust expression",
        "text": "Make the character smile happily. Keep the facial features, hairstyle, clothing and background the same."
      },
      "lettering": {
        "label": "Replace image text",
        "text": "Replace the text on the sign with \"Hello, Illusion Realm!\". Keep the character, clothing and background the same."
      }
    }
  },
  workspace: {
    totalFiles: "{count} files", previousPage: "Previous page", nextPage: "Next page",
    latestResult: "Latest result", emptyResult: "No generated result yet", startCreating: "Start creating and enjoy your artwork",
    fileCount: "{count} files · View all",
    zoom: "Zoom", zoomIn: "Zoom in", previous: "Previous image", next: "Next image",
    files: "File manager", upload: "Upload", localFile: "Local artwork",
    importing: "Importing…", imported: "Imported {count} images", importFailed: "Import failed. Check the images and output folder and retry.", importInvalid: "Choose PNG, JPEG or WebP images, up to 50 MB each.",
    edit: "Edit", preview: "Preview", emptyTitle: "Your first creation starts here",
    emptyHint: "Enter a prompt on the left and select Generate. Finished images appear here and are saved to your library.",
    emptyHintMobile: "Enter a prompt in Edit and select Generate, then view your creation here.",
    expandSettings: "Size settings", loadFailed: "Could not load images. Check the output folder and try again.",
    folderLoadFailed: "Could not load folders. Check the output folder and try again.", retry: "Retry",
    browseAll: "View all images", noMatches: "No matching images. Try a different search.",
  },
  loraTriggers: {
    apply: "Apply triggers", hint: "Append selected LoRA trigger words and skip duplicates. Advanced mode writes to the active category.",
    applied: "Added {count} trigger words", unchanged: "These trigger words are already present",
  },
  maskEditor: {
    useGeneration: "Use mask for inpainting",
    title: "Mask editor", import: "Import image", empty: "Import an image and paint the area to redraw",
    color: "Display color",
    mask: "Standalone grayscale mask", alphaImage: "Original + alpha mask",
    loadFailed: "Cannot read the image. Select a valid PNG, JPEG or WebP.", exportFailed: "Mask export failed. Please retry.",
    tooLarge: "Supports up to 16 million pixels and 8192 pixels per side.",
  },
  promptAssistant: {
    // 历史使用双语界面标签，用户的原文、译文和预设名保持其原始内容。
    // 英文说明保留同样的本地存储与数量上限，不暗示存在云端备份。
    // 两种排序方向都指完成时间，和文本名称的字典序无关。
    // 存储失败只提示记录未保存，不能误导用户以为模型没有成功返回。
    // 复制失败反馈跟随真实剪贴板结果，不显示未经确认的成功状态。
    history: {
      // 英文标题与中文入口一一对应，不复用 Agent 聊天历史这个不同业务名称。
      // Retry 专指重读本机记录，不会发起新的有费用转换。
      // Newest/Oldest 都基于成功完成的时间，措辞不承诺按请求开始顺序排列。
      // Original/Translation 是对照区标签，不能在复制时添加到实际内容中。
      // 空态的将来时说明从成功翻译后才会出现记录，不能回溯安装前操作。
      // 说明保留 device，准确描述沿用用户文档而非服务商在线历史。
      // Copy translation 明确按钮只复制译文，不连带时间、模型或原文。
      // 三种错误分别指读取、保存和复制，不能笼统提示网络错误。
      // 保存失败仍以 completed 描述模型阶段，保留部分成功的实际含义。
      // 英文键与中文键同步新增，普通切换语言不需要重载历史数据。
      retry: "Retry",
      title: "Translation history", description: "Stored on this device, up to 100 recent successful results. Viewing history does not change the current prompt.",
      order: "Sort by time", newest: "Newest first", oldest: "Oldest first",
      empty: "No translations yet. Successful translations will appear here with their original text.",
      original: "Original", translated: "Translation", copy: "Copy translation",
      loadFailed: "Could not load translation history. Please retry.", saveFailed: "Translation completed, but history could not be saved. Please copy the result.",
      copyFailed: "Could not copy. Please select and copy the translation manually.",
    },
    // 英文同样说明共享副作用，不将同一凭据误称为当前输入框专属设置。
    // 链接指向原 Agent 模型入口，站点名称和模型选择保持一致。
    // 英文供应商品牌沿用 Agent 词条，不在这里重新定义另一份 Euzhi 名称。
    // Saving 与 clearing 同时出现，完整表达共享凭据的两种写入副作用。
    // 此说明不承诺令牌有模型权限，权限失败仍由真实请求提示。
    euzhiShared: "Shares the Euzhi API key and Grok model selection with Agent. Saving or clearing the key here also affects Agent.",
    euzhiManage: "Choose the Grok model in Agent settings",
    editPreset: "Edit custom preset", editNamedPreset: "Edit or delete preset: {name}", presetDeleted: "Custom preset deleted",
    deletePresetConfirm: "Delete preset “{name}”? This cannot be undone.", confirmDeletePreset: "Confirm deletion",
    back: "Back",
    title: "Prompt assistant", translate: "Translate to English", busy: "Processing…", provider: "Provider", customProvider: "Other platform / proxy",
    presets: "Instructions", configure: "Connection settings", addPreset: "Add custom preset", copy: "Copy", undo: "Undo replacement",
    translation: "English translation", anima: "Anima / Danbooru tags", instruction: "System instruction", presetName: "Preset name",
    translationInstruction: "Translate the user's content into English. Preserve meaning, existing English tags, weights, parentheses and comma structure. Do not add or remove visual elements. Output only the translation without explanations, headings or code blocks.",
    animaInstruction: "You are an Anima prompt engineer with ten years of experience in Danbooru tags. Convert the user's description into English comma-separated Danbooru-style tags. Preserve characters, actions, composition, background and weights. Do not invent visual elements. Output only tags without explanations or code blocks.",
    endpoint: "API base URL", model: "Model ID", apiKey: "API Key", keyHint: "Leave blank to retain the saved key. GLM and each proxy endpoint have separate keys.",
    keyConfigured: "Key configured", keyMissing: "No key configured", save: "Save", clearKey: "Clear key", saved: "Connection saved", deletedKey: "Key cleared",
    docs: "GLM documentation / Get an API key", freeHint: "Flash models are included. Pricing and quotas follow the provider's current policies.",
    empty: "Enter text to translate first", success: "Replaced with English. Undo is available.", copied: "Copied", conflict: "Input has changed. The result is retained for your review.",
    result: "Result", apply: "Apply result", discard: "Discard result", undoConflict: "Text has been edited again. Copy it before undoing.",
    invalid: "Check the model, endpoint and text length", missingKey: "Enter an API key under Settings → API keys → Prompt assistant", unauthorized: "Authentication failed (401): invalid or expired key. Check that the key belongs to the selected provider.",
    forbidden: "Access denied (403): check your account status and access to the selected model.",
    secretSaveFailed: "Failed to save or clear the key. Please retry.",
    rateLimited: "Rate limit or quota exceeded. Try again later.", timeout: "Request timed out. Try again.", networkFailed: "Cannot reach the provider. Check the endpoint and connection.",
    emptyResponse: "The model returned no usable text", truncatedResponse: "Output limit reached. Shorten the input and retry.", failed: "Processing failed. Check connection settings and retry.",
    desktopOnly: "Use the prompt assistant in the desktop app", presetInvalid: "Enter a preset name and system instruction", presetSaved: "Custom preset saved",
  },
  /*
   * 队列时间文案的语义边界：
   * 提交、开始、完成是三个不同时间，不能只统一叫生成时间。
   * 耗时插值来自真实起止差，词条中不写固定的示例秒数。
   * 两种已登记语言使用相同键，切换语言不改变历史时间戳。
   * 终态名称继续沿用原状态词条，异常失败和主动停止仍能区分。
   */
  generationTasks: {
    submittedAt: "Submitted", startedAt: "Started", finishedAt: "Finished", elapsed: "Duration {seconds}s",
    summary: "{running} generating · {queued} queued", categories: "Task categories",
    tabs: { active: "In progress", history: "History" }, current: "Current generation",
    emptyActive: "No tasks in progress", emptyHistory: "No task history",
    serialHint: "Tasks run in submission order", queuePosition: "Waiting · Queue position {position}",
    generatingImage: "Generating image {number}", details: "View parameters", noPrompt: "No prompt provided",
    prompt: "Prompt", model: "Model", dimensions: "Image size", quantity: "Image count",
    title: "Generation tasks", active: "{count} active tasks", empty: "No generation tasks",
    add: "Add generation task", progress: "Completed {completed} / {total} images", view: "View image",
    cancel: "Stop generation", cancelQueued: "Cancel queued task", cancelAll: "Stop all", cancelled: "Generation stopped",
    disconnected: "ComfyUI disconnected or a request timed out. Check the service and submit again.",
    queueStopped: "The queue was stopped. Check ComfyUI and submit again.",
    stopFailed: "ComfyUI has not confirmed stopping. Pending tasks were cancelled. Check the server task.",
    stopUnavailable: "The stop API is unavailable. Fully quit and restart the app.",
    timeout: "Generation timed out and the queue was stopped. Check the task on ComfyUI.",
    executionFailed: "ComfyUI workflow execution failed. Check models, parameters and the server log.",
    status: { queued: "Queued", generating: "Generating", saving: "Saving", cancelling: "Stopping", cancelled: "Stopped", completed: "Completed", failed: "Failed" },
  },
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
  historyOrder: {
    // 英文沿用独立 historyOrder 域，避免复用下载列表中含不同副作用的排序文案。
    // 短标题不含计数，同一个键能同时适用于图标入口和窗口页头。
    "title": "Arrange images",
    // display order 明确只是应用显示队列，files 指明可选的真实文件操作。
    // 用 or 分开两个用途，不暗示拖拽本身就会触发磁盘改名。
    "description": "Drag image handles to change display order, or rename files in sequence.",
    // open folder 与中文保持相同范围，不把用户当前过滤出的子集称作整个图库。
    // 提醒 other pages，防止英文用户只看见一页就误解了受影响数量。
    "hint": "{count} images in the open folder, including other pages and images hidden by search. Drag handles to arrange; enable batch rename below when needed.",
    // 用数字插值而非格式化字符串拼接，后续计数来源仍由组件统一控制。
    "count": "{count} images",
    // 空态不建议点击真实导入，本窗口本身没有导入业务。
    "empty": "There are no images to arrange in this folder.",
    // name 是文件记录中的真实文本，供辅助功能区分多个相同外观的手柄。
    "drag": "Drag {name} to change its image order",
    // Rename 是改名而非转换格式，不能翻译成重新编码或图像处理。
    "renameTitle": "Batch rename",
    // 英文确认同样明确包括保存排序，避免暗示只提交表单设置。
    "renameAction": "Rename and save order",
    // 纯排序按钮省去 rename，开关状态会直接反映在可见动作名称上。
    "applyOrder": "Save order",
    // more names 只表示尚未列出的预览，不是未处理任务或分页加载提示。
    "more": "{count} more names",
    // 过去式仅用于已收取成功回执的文件，不能在请求开始时显示。
    "renameComplete": "Renamed {count} images.",
    // before a later file failed 区分部分完成和完全失败，已完成数量可为一。
    // kept 对应真实无回滚语义，不向英文用户承诺不存在的撤销。
    "renamePartial": "Renamed {count} images before a later file failed: {reason}. Completed changes were kept.",
    // 这个兜底没有堆栈或本地路径插值，保持跨边界错误呈现简洁。
    "renameFailed": "Image rename failed.",
    // positive sequence 与当前校验一致，零不会因旧 EXIF stepper 可输入而变合法。
    // Descending 的说明覆盖最后一项越过零的情况，不只约束起点。
    "invalidName": "Enter a prefix without path or invalid characters and a valid positive sequence. Descending numbers must stay above zero.",
    // 保留不覆盖承诺，同时给出两种用户可操作的修复入口。
    "nameConflict": "Target names conflict. Change the prefix or starting number; existing images will not be overwritten."
},
  "createHistorySidebar": {
    // 输出根限制与中文一致，不能把系统选择器可选路径误认为产品全部允许。
    // 成功数量表示真实移动文件数；取消、原地跳过和失败不是成功。
    // Moving 是等待状态，必须与成功的 Moved 区分，不能提前给完成反馈。
    // 越界说明允许输出根本身，不能误导用户只能选子目录。
    // 通用失败文字不回显用户本机路径，具体业务异常由原 IPC 错误边界处理。
    move: "Move", moving: "Moving…", moveHint: "Choose a destination within the current output folder",
    moved: "Moved {count} images", moveFailed: "Could not move images. Check the destination and retry.", moveOutside: "Choose the current output folder or one of its subfolders",
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
    "folderImageCount": "{count} images",
    "freeOutputMode": "自由选择输出目录",
    "fixedOutputPath": "固定输出目录",
    "chooseFixedOutput": "选择文件夹",
    "fixedOutputOutsideRoot": "固定目录必须位于设置中的生成图片保存路径内",
    "fixedOutputUpdated": "已更新固定输出目录"
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
    "versionUnit": "models",
    "select": "选择",
    "versionDialogTitle": "Select a {name} model"
  },
  resourceSelection: {
    mode: "Model selection mode",
    multiple: "Multiple",
    oneMainModel: "This workflow supports one main model. Switch to single selection or keep only one model.",
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
    "move": "Move to…",
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
    "scale": "Proportional scaling",
    "scaleHint": "Double-click the multiplier to edit. Enter or blur confirms; Esc cancels. One decimal place, with integer output dimensions.",
    "scaleLimitedHint": "Double-click the multiplier to edit (0.1–{max}×). Enter or blur confirms; Esc cancels. Dimensions follow the model's alignment rules.",
    "title": "图片尺寸",
    "custom": "自定义",
    "customLabel": "（自定义）",
    "customHint": "自定义宽高：{min}–{max}，自动对齐 {step} 像素。",
    "unlimited": "No upper limit",
    "customUnlimitedHint": "Custom dimensions have no upper limit and align to {step} pixels.",
    "presetUnlimitedHint": "Presets follow model training resolutions ({note}); custom dimensions have no upper limit.",
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
    "emptyAnima": "未找到 Anima 模型，请先在设置页配置 Diffusion 模型地址（diffusion_models 目录）并扫描",
    "emptySdxl": "未找到 SDXL 模型，请先在设置页配置 Checkpoint 模型地址并在 checkpoint/SDXL 目录下放置模型",
    "searchPlaceholder": "搜索模型..."
  },
  "modelSeriesSelector": {
    "seriesLabel": "模型系列"
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
    "generating": "Generating{dots}",
    "mediaVideo": "Videos",
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
    "workflowLabel": "工作流",
    minimaxReference: "MiniMax H3 Reference to Video",
  },
  videoModels: {
    unavailable: "{label} not found in ComfyUI: {name}. Refresh and select an installed file. If names are duplicated, choose the exact path.",
    videoVae: "Video VAE", audioVae: "Audio VAE",
    selectLocal: "Choose a local Minimax model", selectLora: "Choose from the LoRA library", incompatible: "The Minimax workflow only accepts models and LoRAs in the Minimax category.", emptyMinimax: "No Minimax models found. Place models in the Minimax subfolder of your Diffusion model root and rescan.",
    title: "Model loading settings", hint: "Uses the current workflow defaults. Change these when model names or locations differ. CLIP uses text_encoders / clip folders; VAE uses the vae folder.",
    embedded: "This workflow uses the CLIP and VAE included in its Checkpoint. No separate selection is needed; change the main model above.",
    unet: "UNet model", clip: "CLIP text encoder", vae: "VAE", lora: "LoRA",
    default: "Workflow default · {name}", reset: "Restore workflow defaults", refresh: "Refresh available models",
    listFailed: "Could not fetch ComfyUI models. Check the connection or restart the app and refresh. Local scan results and workflow defaults remain available.",
    invalid: "Invalid model setting. Select a relative model path.", missingNode: "The video template is missing a required node or connection: {name}",
  },
  videoSettings: {
    resolutionHint: "MiniMax H3 dimensions align to 32 pixels. Presets, custom sizes and scaling submit the displayed dimensions.",
    invalidResolution: "Invalid video dimensions. Enter integers between {min} and {max}; sizes automatically align to {step} pixels.",
    title: "Video generation settings", fps: "Frame rate (fps)",
    actualDuration: "Actual duration about {seconds} seconds",
    firstOnly: "First frame only", bothFrames: "First and last frames", firstFrame: "First frame", lastFrame: "Last frame",
    referenceMissing: "This image has not been uploaded",
    referenceUnavailable: "Image {number} has not been uploaded. Upload it or remove its reference.",
    alignment: "Minimax frame counts follow 17n + 5. Duration, FPS and frames are linked; actual duration may vary slightly.",
    invalid: "Invalid video settings. Check steps, FPS, duration and total frames.",
  },
  mediaReferences: {
    // This labels the read-only projection rather than a second prompt editor.
    // Reference protocol names are emitted by the converter, never translated here.
    // Both video and audio use the same label for the shared preview component.
    conversionPreview: "Conversion preview",
    back: "Back to categories",
    title: "Search imported media",
    empty: "No matching media. Import media into the current task first.",
    image: "Image", video: "Video", audio: "Audio",
  },
  videoReferences: {
    importResources: "Import resources",
    resources: "Resources",
    mixedSkipped: "Added {count} resources; skipped {skipped} due to unsupported formats.",
    batchHint: "Select or drop multiple files",
    hint: "Import images, videos or audio as needed. Type @ in the prompt to choose media. Reference videos use frames only; import sound separately as reference audio.",
    missing: "Media reference {token} is unavailable. Import the media or remove the reference.",
  },
  canny: {
    controlRequired: "Edge control requires Anima and a completed edge detection result. Import an image and wait for processing.",
    title: "Edge detection", invert: "Invert", thresholds: "Detection thresholds", lower: "Lower detection threshold", upper: "Upper detection threshold",
    original: "Original", result: "Detected edges", preview: "Preview", loading: "Loading image…",
    pending: "Upload an original image to detect edges",
    outputHint: "Generation uses the current converted edge image at its original dimensions. Inversion is enabled by default; preview or download the PNG before submitting.",
    processing: "Detecting edges…", processingFailed: "Edge detection failed. Please retry.", retry: "Retry detection", download: "Download PNG",
    tooLarge: "Use an image with sides up to 8192 pixels and no more than 16 megapixels.",
    invalidImage: "Select a PNG, JPEG or WebP image", loadFailed: "Unable to load this image. Please select it again.",
  },
  colorPicker: {
    area: "Saturation and brightness",
    hue: "Hue",
    red: "Red channel",
    green: "Green channel",
    blue: "Blue channel",
    keyboard: "Left/right adjust saturation; up/down adjust brightness. Hold Shift for larger steps.",
    position: "Saturation {s}%, brightness {v}%",
  },
  maskStudio: {
    positivePrompt: "Positive prompt",
    returnSettings: "Back to generation settings",
    positivePlaceholder: "Describe the image to generate…",
    exportCurrent: "Export current image",
    rectangle: "Rectangle selection",
    ellipse: "Ellipse selection",
    invertSelection: "Invert selection",
    deleteSelection: "Delete selected pixels",
    cropSelection: "Crop to selection",
    selectionMenu: "Selection actions",
    tools: "Image editing tools",

    lasso: "Lasso selection",
    crop: "Crop",
    blur: "Blur brush",
    gaussian: "Gaussian blur",
    blurRadius: "Blur radius",
    selectionMask: "Selection to mask",
    deselect: "Deselect",
    applyCrop: "Apply crop",
    cancelCrop: "Cancel crop",
    cropHint: "Drag a rectangle, then apply to delete outside pixels",
    lassoHint: "Draw around the subject, then create a mask or limit blur",
    brushGroup: "Painting tools",
    selectionGroup: "Selection and crop",
    retouchGroup: "Retouching tools",
    historyGroup: "Document actions",
    channels: "Image channels",
    editingChannel: "Edited image",
    readOnlyChannel: "Channel preview · Select the first thumbnail to edit",

    "rotateLeft": "Rotate counterclockwise",
    "title": "Mask editor",
    "brushSettings": "Brush settings",
    "reset": "Reset defaults",
    "shape": "Brush shape",
    "circle": "Circle",
    "square": "Square",
    "size": "Brush size",
    "opacity": "Brush opacity",
    "hardness": "Hardness",
    "spacing": "Spacing",
    "paintColor": "Paint color",
    "displayOpacity": "Mask display opacity",
    "tolerance": "Color tolerance",
    "contiguous": "Contiguous only",
    "layers": "Layers",
    "original": "Original",
    "painted": "Paint layer",
    "mask": "Mask layer",
    "activeLayer": "Active layer",
    "zoomOut": "Zoom out",
    "zoomIn": "Zoom in",
    "fit": "Fit canvas",
    "edgeTab": "Edge painting",
    "runEdge": "Generate from edges",
    "draw": "Mask brush",
    "paint": "RGB brush",
    "erase": "Eraser",
    "fill": "Fill",
    "select": "Color selection",
    "pan": "Pan canvas",
    "undo": "Undo",
    "redo": "Redo",
    "invert": "Invert mask",
    "clear": "Clear active layer",
    "rotate": "Rotate clockwise",
    "flipX": "Flip horizontal",
    "flipY": "Flip vertical",
    "save": "Save edits",
    "cancel": "Cancel edits",
    "paintingExport": "Original with paint",
    "composite": "Paint composite with alpha",
    "canvas": "Canvas",
    "settings": "Generation settings"
},
audio: {
  // Keep the unit in the label so both existing input methods have the same accessible name.
  // The hint distinguishes requested seconds from frame-aligned output duration.
  // The range is a client guardrail rather than an official audio model limit.
  duration: "Duration (seconds)",
  durationHint: "Choose 0.1–60 seconds. Output follows workflow frame alignment; longer audio needs more memory and time.",
  invalidDuration: "Audio duration must be a finite value from 0.1 to 60 seconds.",
  invalidSettings: "Choose a valid MiniMax UNet and an integer step count from 1 to 100.",
progress: "Completed {completed} / {total} jobs",
quantity: "Quantity",
  saved: "Audio generated and saved",
  prompt: "Audio prompt",
  promptHint: "Describe the voice, delivery and dialogue. Use the assistant to translate descriptions while keeping the intended dialogue language.",
  reference: "Reference audio",
  referenceHint: "Without a reference, generate audio from text. Adding a reference automatically selects audio-to-audio.",
  // Both summaries use the current draft value instead of claiming the template default.
  // The reference file's own playback duration does not supply this number.
  // Changing reference mode preserves an explicit user duration.
  // Template defaults remain four and five seconds in the workflow data.
  // Frame alignment means this summary does not promise exact output trimming.
  textWorkflow: "Text to audio · Audio_Minimax · {seconds} seconds",
  referenceWorkflow: "Reference audio to audio · {seconds} seconds",
  generating: "Generating audio",
  media: "Audio",
  results: "Generated audio",
  empty: "Generated audio will appear here",
  resultNumber: "Generated audio {number}",
  reveal: "Show file",
  invalid: "Enter an audio description and a valid non-negative integer seed.",
  invalidReference: "Choose a valid audio file (up to 500 MiB).",
  desktopOnly: "Use the desktop client to generate or locate audio.",
  noOutput: "ComfyUI returned no usable audio files."
},
} as const;

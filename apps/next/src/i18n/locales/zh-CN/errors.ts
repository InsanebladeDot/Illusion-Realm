/**
 * 报错与工具层文案（`api/**`、`utils/**`、非 UI store）词条。
 *
 * 这些字符串多半经 toast / throw 冒到界面上，属于用户可见文案，
 * 但按调用位置分散在 utils 里，因此单独一个命名空间。
 * 命名约定：`errors.<领域>.<语义>`，例如 `errors.comfy.timeout`。
 */
export const errors = {
  /** Electron 桌面版能力缺失时的统一提示（原来散在各 utils 里硬编码） */
  desktopOnly: {
    createFolder: "请在 Electron 桌面版中创建文件夹",
    deleteFolder: "请在 Electron 桌面版中删除文件夹",
    deleteImages: "请在 Electron 桌面版中删除图片",
    saveImageAs: "请在 Electron 桌面版中保存图片",
    renameImage: "请在 Electron 桌面版中重命名图片",
    addImages: "请在 Electron 桌面版中添加图片",
    characters: "角色库需要在 Electron 桌面版中使用",
    videoEditing: "视频剪辑功能需要在 Electron 桌面版中使用",
    readLocalImage: "无法读取本地图片，请在 Electron 桌面版中使用",
    /** Agent 页面：渲染层拿不到 Electron 桥（浏览器里跑 dev 时会出现） */
    agentUnavailable: "当前环境没有 Electron 后端，无法运行 Agent",
    /** 主进程桥接没加载（通常是升级后没完全退出应用） */
    bridgeMissing: "删除功能未加载，请完全退出 Electron 后重新启动应用",
  },
  sdImage: {
    unsupportedFormat: "不支持的图片格式",
  },
  comfy: {
    desktopOnly:
      "{feature}需要在 Electron 桌面版中运行（浏览器模式已不再提供 API 代理）",
    featureImageUpload: "ComfyUI 图片上传",
    featureImageGenerate: "ComfyUI 图片生成",
    featureVideoGenerate: "ComfyUI 视频生成",
    featureModelLists: "ComfyUI 模型列表",
  },
  videoWorkflow: {
    unknownWorkflow: "未知视频工作流: {workflowId}",
  },
  imageWorkflow: {
    missingOutputNode:
      "图像工作流（{series}）缺少输出节点：请在 src/data/comfy/imageWorkflower/ 对应 JSON 中补上 SaveImage 或 PreviewImage，并连接到 VAE 解码后的图像",
    unknownSeries: "未知图像工作流系列: {series}",
    missingSampler: "工作流缺少 KSampler 节点: {series}",
  },
  buildGenerateParams: {
    nonDiffusionModel:
      "所选文件不能作为扩散模型使用（位于 upscale_models / vae / clip 等目录）：{filePath}\n请在「模型」弹窗中重新选择{target} 下的模型",
    modelOutsideSeries: "所选模型不在当前系列的模型目录中：{filePath}\n{seriesHint}",
    animaSeriesOnly: "Anima 系列只使用 {root} 下的模型",
    sdxlSeriesOnly: "SDXL 系列只使用 {root} 下的模型",
  },
  /**
   * 宿主工具：Agent 发起的调用被主进程转回渲染层执行（见 `utils/agentHostTools.ts`）。
   * 这些文本会作为工具结果进模型、再由模型转述给用户，所以照旧走词条表。
   */
  agentHostTool: {
    missingPrompt: "缺少 prompt：不知道要画什么",
    unknownTool: "渲染层没有实现宿主工具：{name}",
    savedImages: "已生成 {count} 张图片，保存路径：{paths}。",
    unsavedImages:
      "ComfyUI 任务 {promptId} 已完成，但图片没能保存到磁盘；请让用户检查「设置 → 输出目录」。",
  },
  metadataConsistency: {
    passed: "✓ 所有 {count} 张图片的元数据结构一致",
    inconsistent: "发现 {count} 个不一致的字段",
  },
  generationKind: {
    text2imgShort: "文 → 图",
    text2imgDescription: "文本生成图片",
    img2imgShort: "图 → 图",
    img2imgDescription: "以图片为参考生成",
  },
  negativePreset: {
    defaultName: "我的反向预设",
  },
  localModelCategory: {
    /** 模型不在扫描根目录下时的兜底分类名（`utils/localModelCategory.ts`） */
    uncategorized: "其他",
  },
} as const;

import type { CanvasImportMediaRequest, CanvasImportMediaResult } from "../schemas/canvas-project.schema";
import type { UserDataInfiniteCanvas } from "../schemas/infinite-canvas.schema";
import type { ModelDownloadLocation, ModelDownloadRequest, ModelDownloadTarget, ModelDownloadTask, LocalModelCategoryTarget, MoveModelCategoryRequest } from "./model-download";
import type {
  AgentEventMessage,
  AgentHostCall,
  AgentHostCallResult,
  AgentRunHandle,
  AgentRunOptions,
  AgentSecretStatus,
} from "./agent";
import type { LocalModel, LocalModelType } from "./localModel";
import type { ComfyApiPrompt } from "./comfy";
import type { AnimadexSearchParams, AnimadexSearchResult } from "./character";
import type { OutputFolderEntry } from "./historyFolder";
import type { IpcResult } from "../ipc-result";
import type { LocalModelMetadataEntry } from "../schemas/local-model-metadata.schema";
// 补全结果类型从 schema 推导，避免 preload 与页面手写状态枚举漂移。
// 这是 type-only 依赖，主进程不会因此装载 Zod。
// 状态不包含任何模型字节或 API Key。
import type { LocalModelRecoveryResult } from "../schemas/local-model-metadata.schema";
// 窗口动作允许集由schema推导，类型与运行时契约共用一个定义。
// type-only引用不会把zod引入主进程或preload运行时。
// 最大化通知仍使用基础boolean，无需暴露Electron实例类型。
import type { WindowControlAction } from "../schemas/user-data.schema";
// 目录形状由 schema 推导，跨边界接口不再复制价格与分组字段。
// 此处为 type-only，不把 Zod 带入 preload 或主进程运行期。
// 可选 provider 仅为旧单站调用兼容，新页面始终传入明确站点。
import type { AgentProvider, AgentCatalog } from '../schemas/agent-provider.schema';

type ComfyRemoteImage = {
  nodeId: string;
  filename: string;
  subfolder: string;
  folderType: string;
  dataUrl: string;
};

type ComfyRemoteVideo = {
  nodeId: string;
  filename: string;
  subfolder: string;
  folderType: string;
  kind: string;
  dataUrl: string;
};

export type ComfyUploadedImage = {
  name: string;
  subfolder: string;
  type: string;
};

/** ffmpeg / ffprobe 探测结果 */
export type FfmpegStatus = {
  ffmpegPath: string | null;
  ffprobePath: string | null;
  source: "manual" | "path" | "common" | "bundled" | null;
  version: string | null;
};

export type VideoProbeResult = {
  path: string;
  fileName: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  hasAudio: boolean;
  size: number;
};

// 波形是源时间轴上的等宽振幅包络，不是音高、真实采样音频或可播放文件。
// duration来自主进程探测，peaks固定上限；0到1表示每个时间窗的绝对振幅峰值。
// 无音轨或取消返回null，有音轨但采样失败由IpcResult错误表达，不能伪造零波形。
// 普通数字数组可跨IPC结构化克隆，不把AudioBuffer或Node Buffer暴露给组件。
// 左右修剪只选择这些源时间窗，同源实例共享源数据但不共享选中和修剪状态。
// 这是临时展示数据，不增加用户文档字段，也不改变原素材的元数据。
// 峰值经过8kHz单声道解码，表达概览，不作为母带电平或音高分析结果。
export interface VideoWaveformResult {
  duration: number;
  // 最后一窗可以不足整窗，不用数组长度反推源秒数，避免尾部AAC填充使映射漂移。
  // 片段入点和倍速均按此秒步长取样，工程位置不能直接当作源数组下标。
  // 窗口大小由主进程采样配置产生，渲染层不能随缩放改写源包络时间尺。
  secondsPerPeak: number;
  peaks: number[];
}

export type VideoCropOptions = {
  enabled: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
};

/** 单个区间的变速、音量、静音及倒放设置，由共享 schema 推导。 */
export type VideoClipEffects = import("zod").infer<typeof import("../schemas/media.schema").VideoClipEffectsSchema>;

/** 拼接用的单个片段输入，效果只作用于该片段的剪切窗口。 */
export type VideoClipInput = {
  inputPath: string;
  /** 源片段总时长 */
  duration: number;
  hasAudio: boolean;
  trim?: { start: number; end: number };
  effects?: VideoClipEffects;
};

/** GIF 制作参数（视频 → 动图） */
export type VideoGifOptions = {
  /** 帧率（帧/秒），1–120 */
  fps: number;
  /** 输出宽度（等比缩放，高度自动取偶数，且不超过源分辨率） */
  width: number;
  /** 是否无限循环，默认 true */
  loop?: boolean;
};

export type VideoEditJob = {
  /** single：剪辑；concat：拼接；gif：动图；frame：单帧；reframe：整片按帧重排 */
  mode?: "single" | "concat" | "gif" | "frame" | "reframe";
  /** 单片段模式使用 */
  inputPath?: string;
  /** 拼接 / GIF 模式使用（顺序即输出顺序） */
  clips?: VideoClipInput[];
  outputPath: string;
  /** 拼接目标尺寸/帧率（取首段） */
  width?: number;
  height?: number;
  /** reframe 模式：按此帧率重新排列全部原始帧，范围 1–120 的整数。 */
  fps?: number;
  /** 源视频总时长（用于进度换算） */
  sourceDuration?: number;
  /** frame 模式使用，原始视频时间轴上的位置（秒） */
  frameTime?: number;
  trim?: { start: number; end: number };
  speed?: number;
  effects?: VideoClipEffects;
  crop?: VideoCropOptions;
  /** 默认 true，重新编码以获得帧级精确剪切；false 为按关键帧对齐的无损流拷贝 */
  accurateCut?: boolean;
  /** GIF 模式使用 */
  gif?: VideoGifOptions;
};

export type VideoRunResult = {
  jobId: string;
  outputPath: string;
  requiresReencode: boolean;
};

export type VideoProgressEvent = {
  jobId: string;
  percent: number;
  seconds: number;
};

/**
 * preload 暴露给渲染进程的 API（window.electronAPI）。
 *
 * 所有 invoke 类方法统一返回 `Promise<IpcResult<T>>`：主进程不再跨边界抛异常，
 * 失败信息以 `{ success: false, error, code? }` 返回；`on*` 订阅类方法返回取消订阅函数。
 */
export type ElectronAPI = {
  // 工程只通过业务接口复制素材与打包，不向页面暴露文件流。
// 画布桥接只传纯数据，不让 renderer 获取任意文件系统对象。
// canvasImportMedia 成功表示受管复制完成，返回归属和逐项结果。
// 来源路径由现有 getPathForFile 取得，不向组件暴露 Node API。
// 失败 IpcResult 由 unwrapIpc 转为本地 UI 错误边界处理。
// 部分拒绝属于成功结果中的 rejected，不混同整个通道失败。
// canvasExportProject 返回完成路径，用户取消则返回 null。
// 完成路径不代表一份新的画布节点，也不自动替换当前草稿。
// canvasOpenProject 不接参数，系统选择框由主进程拥有。
// 打开返回完整文档或取消 null，不能返回半解包状态。
// 这三个返回类型直接复用既有 IpcResult 联合。
// 类型上不允许调用者忘记区分 success 后直接读取 data。
// 当前 API 仍在既有顶层命名，不新增嵌套 bridge 注册体系。
// 跨进程传输没有函数与 DOM，因此能由 Electron 结构化克隆。
// 共享接口只声明能力，具体路径与权限仍由主进程校验。
// 普通浏览器缺少这些方法时应显示桌面能力错误。
// 不能通过临时 Blob URL 回落伪装工程已经可跨页面保存。
  canvasImportMedia: (request: CanvasImportMediaRequest) => Promise<IpcResult<CanvasImportMediaResult>>;
  canvasExportProject: (document: UserDataInfiniteCanvas) => Promise<IpcResult<string | null>>;
  canvasOpenProject: () => Promise<IpcResult<UserDataInfiniteCanvas | null>>;
  accountRegister: (request: { email: string; password: string; displayName: string }) => Promise<IpcResult<import("./account").AccountApiResponse>>;
  accountVerifyEmail: (token: string) => Promise<IpcResult<import("./account").AccountApiResponse>>;
  accountResendVerification: (email: string) => Promise<IpcResult<import("./account").AccountApiResponse>>;
  accountLogin: (request: { email: string; password: string; deviceName: string }) => Promise<IpcResult<import("./account").AccountApiResponse>>;
  accountMe: () => Promise<IpcResult<import("./account").AccountApiResponse>>;
  accountLogout: () => Promise<IpcResult<import("./account").AccountApiResponse>>;
  /**
   * 进入或恢复游客前清除本地账户凭据，不进行 HTTP 请求。
   * 完成前不能挂载业务页面，失败仍通过统一 IPC 结果返回。
   * 不返回旧令牌，也不把游客伪装成服务器已认证账号。
   */
  accountEnterGuest: () => Promise<IpcResult<void>>;
  cloudImageUpload: (request: import("../schemas/cloud-image.schema").CloudImageUpload) => Promise<IpcResult<import("./account").AccountApiResponse>>;
  cloudLibraryRequest: (request: import("../schemas/cloud-image.schema").CloudLibraryRequest) => Promise<IpcResult<import("./account").AccountApiResponse>>;
  cloudImageGet: (id: string) => Promise<IpcResult<import("./account").AccountApiResponse>>;
  cloudCollectionGet: (id: string) => Promise<IpcResult<import("./account").AccountApiResponse>>;
  cloudCollectionItems: (request: { id: string; cursor?: string }) => Promise<IpcResult<import("./account").AccountApiResponse>>;
  transformPrompt: (request: import("./prompt-assistant").PromptTransformRequest) => Promise<IpcResult<string>>;
  promptSecretStatus: (connection: import("./prompt-assistant").PromptConnection) => Promise<IpcResult<import("./prompt-assistant").PromptSecretStatus>>;
  promptSetSecret: (connection: import("./prompt-assistant").PromptConnection, key: string) => Promise<IpcResult<import("./prompt-assistant").PromptSecretStatus>>;
  promptClearSecret: (connection: import("./prompt-assistant").PromptConnection) => Promise<IpcResult<import("./prompt-assistant").PromptSecretStatus>>;
  isElectron: boolean;
  hasCustomTitleBar: boolean;
  onWindowChromeVisibility: (callback: (visible: boolean) => void) => () => void;
  /**
   * 自定义 head 的有限动作；返回调用者窗口当前的最大化状态。
   * state 用于挂载后的初次同步，其余值由主进程校验后执行。
   * 失败遵循统一 IpcResult，不跨边界抛出原生窗口异常。
   * close 仍触发原有关闭生命周期，不提供强制退出进程能力。
   */
  controlWindow: (action: WindowControlAction) => Promise<IpcResult<boolean>>;
  /**
   * 系统或按钮引发的最大化变化；仅传布尔值，不暴露原生窗口。
   * 返回取消订阅函数，页面卸载或热更新必须清理监听器。
   * 初始状态须另行查询，因为订阅前的系统事件不会重放。
   */
  onWindowMaximized: (callback: (maximized: boolean) => void) => () => void;
  selectFolder: (defaultPath?: string) => Promise<IpcResult<string | null>>;
  scanModels: (dirPath: string, type: LocalModelType) => Promise<IpcResult<LocalModel[]>>;
  readLocalModelMetadata: (filePaths: string[]) => Promise<IpcResult<LocalModelMetadataEntry[]>>;
  /**
   * 对配置目录中的一个模型流式计算摘要，并按准确版本补全来源资料。
   * 已有来源 JSON 和封面保留，模型文件本体不写入。
   * 失败原因由 data.status 或 IPC 错误表示，调用方不得忽略。
   */
  recoverLocalModelMetadata: (filePath: string) => Promise<IpcResult<LocalModelRecoveryResult>>;
  modelDownloadTarget: (location: ModelDownloadLocation) => Promise<IpcResult<ModelDownloadTarget>>;
  startModelDownload: (request: ModelDownloadRequest) => Promise<IpcResult<ModelDownloadTask>>;
  cancelModelDownload: (id: string) => Promise<IpcResult<boolean>>;
  retryModelDownload: (id: string) => Promise<IpcResult<ModelDownloadTask>>;
  removeModelDownload: (id: string) => Promise<IpcResult<boolean>>;
  listModelDownloads: () => Promise<IpcResult<ModelDownloadTask[]>>;
  changeModelLogo: (folderPath: string) => Promise<IpcResult<string | null>>;
  localModelCategoryTarget: (folderPath: string) => Promise<IpcResult<LocalModelCategoryTarget>>;
  moveModelCategory: (request: MoveModelCategoryRequest) => Promise<IpcResult<string>>;
  operateLocalModels: (request: import("./model-download").LocalModelBatchRequest) => Promise<IpcResult<import("./model-download").LocalModelBatchResult>>;
  civitaiKeyStatus: () => Promise<IpcResult<{ configured: boolean; protection: "safeStorage" | "plain" | ""; tail: string }>>;
  civitaiKeySet: (apiKey: string) => Promise<IpcResult<{ configured: boolean; protection: "safeStorage" | "plain" | ""; tail: string }>>;
  civitaiKeyClear: () => Promise<IpcResult<{ configured: boolean; protection: "safeStorage" | "plain" | ""; tail: string }>>;
  onModelDownloadProgress: (callback: (task: ModelDownloadTask) => void) => () => void;
  readLocalImage: (filePath: string | null) => Promise<IpcResult<string | null>>;
  listImageFiles: (
    dirPath: string
  ) => Promise<IpcResult<Array<{ filePath: string; fileName: string }>>>;
  comfyGenerate: (
    prompt: ComfyApiPrompt,
    serverAddress: string,
    requestId?: string
  ) => Promise<
    IpcResult<{
      promptId: string;
      images: ComfyRemoteImage[];
      videos: ComfyRemoteVideo[];
    }>
  >;
  comfyCancel: (requestId: string) => Promise<IpcResult<boolean>>;
  /**
   * 向指定 ComfyUI 请求卸载已加载模型，并清理执行器与设备缓存。
   * 成功数据只表示服务接受请求，不是显存已经下降的测量结果。
   * 正在执行的任务由 ComfyUI 自行收尾，本接口不会发送中断。
   * 地址沿用设置页的主机与端口形式，不能传任意 HTTP 路径。
   * 失败仍使用统一 IpcResult，调用方须恢复按钮并显示提示。
   */
  comfyFreeMemory: (serverAddress: string) => Promise<IpcResult<boolean>>;
  comfyUploadImage: (
    serverAddress: string,
    payload: { filename: string; dataBase64: string; subfolder?: string }
  ) => Promise<IpcResult<ComfyUploadedImage>>;
  comfyListModels: (
    serverAddress: string
  ) => Promise<
    IpcResult<import("./comfy").ComfyModelLists>
  >;
  getDefaultOutputPath: () => Promise<IpcResult<string>>;
  saveGeneratedImages: (
    outputPath: string,
    files: Array<{
      filename: string;
      dataBase64: string;
    }>
  ) => Promise<IpcResult<string[]>>;
  /** 把一张已生成的图片另存到用户选定的位置 */
  saveImageAs: (
    outputPath: string,
    filePath: string
  ) => Promise<IpcResult<string | null>>;
  openPathInExplorer: (targetPath: string) => Promise<IpcResult<string>>;
  listGeneratedImages: (
    outputPath: string,
    folderDirPath: string | null
  ) => Promise<
    IpcResult<
      Array<{
        filePath: string;
        fileName: string;
        modifiedAt: number;
      }>
    >
  >;
  createHistoryFolder: (
    outputPath: string,
    folderName: string,
    parentDirPath?: string | null
  ) => Promise<
    IpcResult<{
      dirPath: string;
      name: string;
      parentDirPath: string | null;
      depth: number;
    }>
  >;
  previewDeleteHistoryFolder: (
    outputPath: string,
    folderDirPath: string
  ) => Promise<
    IpcResult<{
      imageCount: number;
      sidecarCount: number;
      subfolderCount: number;
    }>
  >;
  deleteHistoryFolder: (
    outputPath: string,
    folderDirPath: string
  ) => Promise<
    IpcResult<{
      deletedImageCount: number;
      deletedSidecarCount: number;
      deletedSubfolderCount: number;
    }>
  >;
  deleteGeneratedImages: (
    outputPath: string,
    filePaths: string[]
  ) => Promise<
    IpcResult<{
      deletedImageCount: number;
      deletedSidecarCount: number;
      skippedCount: number;
    }>
  >;
  /** 在线改名：只改文件名，保留扩展名与图片内嵌 Meta */
  renameGeneratedImage: (
    outputPath: string,
    filePath: string,
    newFileName: string
  ) => Promise<
    IpcResult<{
      oldPath: string;
      filePath: string;
      fileName: string;
      modifiedAt: number;
    }>
  >;
  moveImagesToFolder: (
    outputPath: string,
    targetFolderDirPath: string,
    filePaths: string[]
  ) => Promise<IpcResult<string[]>>;
  listOutputFolders: (
    outputPath: string
  ) => Promise<IpcResult<OutputFolderEntry[]>>;
  readUserData: () => Promise<
    IpcResult<{
      filePath: string;
      data: Record<string, unknown>;
      isNew: boolean;
    }>
  >;
  writeUserData: (data: Record<string, unknown>) => Promise<
    IpcResult<{
      filePath: string;
      data: Record<string, unknown>;
    }>
  >;
  getDefaultUserDataPath: () => Promise<IpcResult<string>>;
  readChangelogMarkdown: () => Promise<IpcResult<string | null>>;

  // 视频工具箱（ffmpeg）
  videoFfmpegStatus: (manualFfmpegPath?: string | null) => Promise<IpcResult<FfmpegStatus>>;
  videoSelectFfmpeg: () => Promise<IpcResult<string | null>>;
  videoPickFile: () => Promise<IpcResult<string[]>>;
  /** 选择输出**文件夹**（文件名由渲染进程生成或自定义） */
  videoPickOutputFolder: (title?: string) => Promise<IpcResult<string | null>>;
  /** 保存单个文件（未选择输出文件夹时的回退路径） */
  videoPickOutput: (
    defaultName?: string,
    kind?: "video" | "gif" | "image"
  ) => Promise<IpcResult<string | null>>;
  videoProbe: (payload: {
    inputPath: string;
    manualFfmpegPath?: string | null;
  }) => Promise<IpcResult<VideoProbeResult>>;
  // 请求形状来自schema；读取和取消都通过主进程校验与窗口归属检查。
  // 旧主进程没有此方法时渲染层显示不可用，不将缺桥接当成静音源。
  // 原videoProbe和videoRun的参数顺序与返回值不受此独立辅助能力影响。
  videoWaveform: (payload: import("../schemas/media.schema").VideoWaveformRequest) => Promise<IpcResult<VideoWaveformResult | null>>;
  videoRun: (payload: {
    job: VideoEditJob;
    manualFfmpegPath?: string | null;
  }) => Promise<IpcResult<VideoRunResult>>;
  videoCancel: (jobId: string) => Promise<IpcResult<boolean>>;
  onVideoProgress: (
    callback: (event: VideoProgressEvent) => void
  ) => () => void;

  // 3D 视角（three.js）角色模型
  view3dPickModel: (defaultPath?: string) => Promise<IpcResult<string | null>>;
  view3dReadModelFile: (
    filePath: string
  ) => Promise<IpcResult<{ fileName: string; data: Uint8Array } | null>>;
  /** 拖拽文件时取回真实路径（浏览器环境下为 null） */
  getPathForFile: (file: File) => string | null;
  /** 窗口级无边框全屏（3D 视窗 DOM 全屏不可用时的回退） */
  setFullScreen: (flag: boolean) => Promise<IpcResult<boolean>>;
  /** 深色 / 浅色 / 跟随系统：主进程转发到 `nativeTheme.themeSource`，返回生效值 */
  setThemeSource: (
    source: "system" | "light" | "dark",
    shellColor?: string
  ) => Promise<IpcResult<string>>;

  // 角色库（animadex）
  animadexSearch: (params: AnimadexSearchParams) => Promise<IpcResult<AnimadexSearchResult>>;

  // Agent（Python sidecar）：run 立刻返回 runId，结果通过 onAgentEvent 推回来
  runAgent: (options: AgentRunOptions) => Promise<IpcResult<AgentRunHandle>>;
  /** 取消某次运行（kill 整棵进程树） */
  cancelAgent: (runId: string) => Promise<IpcResult<boolean>>;
  /** 订阅事件流，返回退订函数 */
  onAgentEvent: (callback: (event: AgentEventMessage) => void) => () => void;
  /**
   * 订阅宿主工具调用（主进程 → 渲染层），返回退订函数。
   *
   * 渲染层执行完必须调 `agentHostResult` 回执 —— 不回的话主进程要等到超时才收场。
   */
  onAgentHostCall: (callback: (call: AgentHostCall) => void) => () => void;
  /** 回执宿主工具的执行结果（`ok:false` 也要回，error 只放一句可读原因） */
  agentHostResult: (result: AgentHostCallResult) => Promise<IpcResult<boolean>>;
  /** 查密钥状态（**不回原值**：只有有没有 / 来源 / 存储方式 / 尾 4 位） */
  // 不返回密钥原值，切换站点后分别读取状态，禁止共享 configured 标志。
  // 旧调用没有 provider 时仍属于硅基流动，而不是最后访问的站点。
  // 状态 Promise 的错误由标准 IpcResult 表达。
  agentSecretStatus: (provider?: AgentProvider) => Promise<IpcResult<AgentSecretStatus>>;
  /** 写入密钥：主进程侧加密落盘，明文只在这一次调用里存在一瞬 */
  // 密钥原文只经过本次写操作，不存在读回接口。
  // provider 和 key 必须一起提交，以免异步保存串到新标签。
  // 成功只返回所属站点的配置摘要。
  agentSetSecret: (apiKey: string, provider?: AgentProvider) => Promise<IpcResult<AgentSecretStatus>>;
  /** 清除密钥 */
  // 清除只影响传入站点，不能顺便删除另一个服务商的凭据。
  // force 不在清除接口中，刷新目录是独立的只读操作。
  // 主进程会拒绝不在允许集中的 provider。
  agentClearSecret: (provider?: AgentProvider) => Promise<IpcResult<AgentSecretStatus>>;
  // 返回公开目录与可选账户可见性，价格核实不等同推理已成功。
  // 调用者不得把未知价格显示为免费，也不得自动跨站切换。
  // 刷新失败返回保留目录和错误码，离线仍可选择已知模型。
  agentCatalog: (provider: AgentProvider, force?: boolean) => Promise<IpcResult<AgentCatalog>>;
};

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};

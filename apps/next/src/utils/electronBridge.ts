/**
 * 渲染层访问 preload 暴露的 `window.electronAPI` 的**唯一封装**。
 *
 * 怎么做：集中取 api（非 Electron 环境返回 null）→ 提供 `isElectronEnvironment`
 * 与能力探测（`hasXxxSupport`，用于按主进程版本降级）；调用结果交给
 * `utils/ipcResult` 解包。
 */
import type { LocalModel, LocalModelType } from "@/types/localModel";
import type {
  AgentEventMessage,
  AgentHostCall,
  AgentHostCallResult,
  AgentRunHandle,
  AgentRunOptions,
  AgentSecretStatus,
  // 服务商是有限 ID，不允许页面通过 bridge 定义新的网络地址。
  // 目录响应类型与运行时 schema 共用，避免可信边界只靠 TS。
  // 原密钥仍只经过设置写入函数，不加入目录数据。
  AgentProvider,
} from "@illusion-realm/shared";
import { t } from "@/i18n";
import { CivitaiApiKeySchema } from "@illusion-realm/shared";
import { unwrapIpc, unwrapIpcOr } from "@/utils/ipcResult";
import { LocalModelMetadataEntrySchema, ReadLocalModelMetadataArgsSchema, type LocalModelMetadataEntry } from "@illusion-realm/shared";
// 补全入口同时验证请求和响应，不让旧 preload 的缺失能力静默成功。
// 本模块不读取模型字节，也不获取主进程保存的 Civitai 密钥。
// 主进程仍会独立验证路径，不依赖这里的客户端 schema 作为授权。
import { LocalModelRecoveryResultSchema, RecoverLocalModelArgsSchema } from "@illusion-realm/shared";

/**
 * 只提交用户选择的具体版本路径，不把相邻版本或整个目录交给识别器。
 * IpcResult 的失败路径必须抛出，让 hook 转换为用户可见的失败状态。
 * 返回业务状态通过 schema 验证，未知状态不能被显示为补全成功。
 * 非桌面环境显式失败，避免网页开发模式下按钮看似可用。
 * 后续刷新来源继续使用 readLocalModelMetadata，统一过滤说明和 URL。
 */
export async function recoverLocalModelMetadata(filePath: string) {
  // 能力探测用于开发网页和旧主进程，不能仅判断 window 是否存在。
  // 与现有下载功能一致，缺少对应 preload 时显式失败。
  // 不使用默认“成功”对象降级，否则用户会误以为资料已经保存。
  const api = getElectronAPI();
  if (!api?.recoverLocalModelMetadata) throw new Error("desktop");
  // trim 后再发送统一路径字符串，长度在 schema 内限制。
  // absolute/realpath/根目录校验必须留在可信的主进程中完成。
  // renderer 的校验只负责尽早捕获错误调用，不能代替主进程授权。
  const [model] = RecoverLocalModelArgsSchema.parse([filePath]);
  // 先解 IpcResult，再验证 data；两种失败都进入 hook 的 catch。
  // 明确区分传输失败与业务 data.status，UI 不推断 HTTP 状态码。
  // 返回模型结果不含来源文件原始 JSON，展示仍使用只读规范化接口。
  return LocalModelRecoveryResultSchema.parse(unwrapIpc(await api.recoverLocalModelMetadata(model)));
}

/** 模型来源 JSON 和 LoRA 触发词共用这条只读链路，旧版 preload 明确失败而不是伪装为空。 */
export async function readLocalModelMetadata(filePaths: string[]): Promise<LocalModelMetadataEntry[]> {
  const api = getElectronAPI();
  if (!api?.readLocalModelMetadata) throw new Error("desktop");
  const [paths] = ReadLocalModelMetadataArgsSchema.parse([filePaths]);
  return LocalModelMetadataEntrySchema.array().parse(unwrapIpc(await api.readLocalModelMetadata(paths)));
}

// 目录工具也经同一桥接入口探测能力，不在组件里分散访问全局对象。
// 该函数仅返回 preload 的最小 API，不暴露 ipcRenderer 或 Electron 原生实例。
// 服务商网络请求仍只能由主进程执行，导出本函数不增加桥接权限。
export function getElectronAPI() {
  if (typeof window === "undefined") return null;
  const api = window.electronAPI;
  if (!api) return null;
  return api;
}

/** Native model downloads require a matching preload/main-process version. */
export function getModelDownloadAPI() {
  const api = getElectronAPI();
  if (!api?.startModelDownload) throw new Error("desktop");
  return api;
}

export function isElectronEnvironment(): boolean {
  const api = getElectronAPI();
  return (
    typeof api?.selectFolder === "function" &&
    typeof api?.scanModels === "function" &&
    typeof api?.readLocalImage === "function"
  );
}

export function hasDeleteFolderSupport(): boolean {
  const api = getElectronAPI();
  return (
    isElectronEnvironment() &&
    typeof api?.previewDeleteHistoryFolder === "function" &&
    typeof api?.deleteHistoryFolder === "function"
  );
}

export function hasDeleteImagesSupport(): boolean {
  const api = getElectronAPI();
  return (
    isElectronEnvironment() &&
    typeof api?.deleteGeneratedImages === "function"
  );
}

export function hasSaveImageAsSupport(): boolean {
  const api = getElectronAPI();
  return (
    isElectronEnvironment() && typeof api?.saveImageAs === "function"
  );
}

export function hasRenameGeneratedImageSupport(): boolean {
  const api = getElectronAPI();
  return (
    isElectronEnvironment() &&
    typeof api?.renameGeneratedImage === "function"
  );
}

export function unwrapIpcError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error(String(error));
  }

  const match = error.message.match(
    /Error invoking remote method '[^']+': (?:(?:Error|DOMException): )?([\s\S]+)/
  );
  if (match?.[1]) {
    return new Error(match[1].trim());
  }

  return error;
}

export async function selectLocalFolder(
  defaultPath?: string
): Promise<string | null> {
  const api = getElectronAPI();
  if (typeof api?.selectFolder !== "function") return null;
  return unwrapIpcOr(
    await api.selectFolder(defaultPath),
    null,
    "selectFolder"
  );
}

/**
 * 深色 / 浅色 / 跟随系统：转发到主进程的 `nativeTheme.themeSource`。
 *
 * 非 Electron 环境（浏览器里跑 `pnpm dev` 的渲染页）直接返回 null —— 主题由系统偏好决定，
 * 不抛错：主题是个「尽力而为」的偏好，不是业务流程，失败不该打断任何操作。
 */
export async function applyNativeThemeSource(
  source: "system" | "light" | "dark",
  shellColor?: string
): Promise<string | null> {
  const api = getElectronAPI();
  if (typeof api?.setThemeSource !== "function") return null;
  return unwrapIpcOr(await api.setThemeSource(source, shellColor), null, "setThemeSource");
}

export async function scanLocalModels(
  dirPath: string,
  type: LocalModelType
): Promise<LocalModel[]> {
  const api = getElectronAPI();
  if (!dirPath || typeof api?.scanModels !== "function") return [];
  return unwrapIpcOr(await api.scanModels(dirPath, type), [], "scanModels");
}

export async function readLocalImage(
  filePath: string | null
): Promise<string | null> {
  const api = getElectronAPI();
  if (!filePath || typeof api?.readLocalImage !== "function") return null;
  return unwrapIpcOr(await api.readLocalImage(filePath), null, "readLocalImage");
}

/**
 * 起一次 Agent 运行（立刻返回 runId，结果走 `subscribeAgentEvents`）。
 *
 * 这里**故意用 `unwrapIpc`（失败抛错）**而不是 `unwrapIpcOr`：Agent 起不来是流程失败，
 * 调用方要把它显示在那条消息上；静默回落成 null 会让界面卡在「生成中」。
 * 非 Electron 环境直接抛 —— 那条路径本来就没有后端。
 */
export async function runAgent(
  options: AgentRunOptions
): Promise<AgentRunHandle> {
  const api = getElectronAPI();
  if (typeof api?.runAgent !== "function") {
    throw new Error(t("errors.desktopOnly.agentUnavailable"));
  }
  return unwrapIpc(await api.runAgent(options));
}

/** 停下某次运行（主进程负责 kill 整棵进程树）；拿不到桥时返回 false */
export async function cancelAgent(runId: string): Promise<boolean> {
  const api = getElectronAPI();
  if (!runId || typeof api?.cancelAgent !== "function") return false;
  return unwrapIpcOr(await api.cancelAgent(runId), false, "cancelAgent");
}

/** 订阅 Agent 事件流，返回退订函数（与 `onVideoProgress` 同款） */
export function subscribeAgentEvents(
  callback: (event: AgentEventMessage) => void
): () => void {
  const api = getElectronAPI();
  if (typeof api?.onAgentEvent !== "function") return () => {};
  return api.onAgentEvent(callback);
}

/**
 * 订阅宿主工具调用（主进程 → 渲染层），返回退订函数。
 *
 * 拿到调用后**必须**用 `respondAgentHostCall` 回执；执行端见 `utils/agentHostTools.ts`。
 * 桥不在时静默不订阅：这条链路只在 Electron 里存在，浏览器环境本来就不会有请求。
 */
export function subscribeAgentHostCalls(
  callback: (call: AgentHostCall) => void
): () => void {
  const api = getElectronAPI();
  if (typeof api?.onAgentHostCall !== "function") return () => {};
  return api.onAgentHostCall(callback);
}

/**
 * 回执宿主工具的执行结果。
 *
 * 这里**不抛错**：回执失败最坏的后果是主进程等到超时（它自己会兜底成一句失败文本），
 * 而抛出会把异常丢进「工具执行」这条本就该稳的路径里。
 */
export async function respondAgentHostCall(
  result: AgentHostCallResult
): Promise<void> {
  const api = getElectronAPI();
  if (typeof api?.agentHostResult !== "function") return;
  const response = await api.agentHostResult(result);
  if (!response.success) {
    console.warn("[agent] 回执宿主工具结果失败:", response.error);
  }
}

/**
 * 读密钥状态（**拿不到原值**，只有有没有 / 来源 / 存储方式 / 尾 4 位）。
 * 桥不在（浏览器 / 老主进程）时回落到 `configured: false` —— 与"没填密钥"同一条
 * 提示路径，比让界面卡在未知状态好。
 */
// 读状态必须带服务商，默认参数只保留旧页面的兼容调用。
// 不使用当前 UI 全局状态推断站点，避免异步等待期间切换串值。
// 老 preload 的能力探测继续回落未配置。
export async function getAgentSecretStatus(provider: AgentProvider = 'siliconflow'): Promise<AgentSecretStatus> {
  const api = getElectronAPI();
  const fallback: AgentSecretStatus = {
    configured: false,
    source: "none",
    protection: "",
    tail: "",
  };
  if (typeof api?.agentSecretStatus !== "function") return fallback;
  // provider 随请求传入主进程，返回值不包含密钥全文。
  // 读取失败沿用未配置提示，不能把另一个站点的成功状态拿来兜底。
  // warning 不打印请求参数或 API Key。
  return unwrapIpcOr(await api.agentSecretStatus(provider), fallback, "agentSecretStatus");
}

/**
 * 保存密钥。**用 `unwrapIpc`（失败抛错）**：填了但没存上必须让用户看见，
 * 静默成功会让用户以为配好了、然后在 Agent 页撞一句"缺少 API Key"。
 */
// 写入始终捕获本次服务商；切换 UI 后正在等待的操作不会改写新站点。
// 参数默认值仅为旧调用兼容，不会从持久化偏好偷偷读取。
// 原文仅用于本次 IPC 调用，不落 renderer 日志或持久化。
export async function setAgentSecret(apiKey: string, provider: AgentProvider = 'siliconflow'): Promise<AgentSecretStatus> {
  const api = getElectronAPI();
  if (typeof api?.agentSetSecret !== "function") {
    throw new Error(t("errors.desktopOnly.agentUnavailable"));
  }
  // 写失败必须抛给表单，不用默认成功状态掩盖系统加密或磁盘错误。
  // 主进程独立检查站点和密钥长度，不能把页面表单当验证边界。
  // 本函数不在闭包中保留原值，表单在成功后也会清空输入。
  return unwrapIpc(await api.agentSetSecret(apiKey, provider));
}

/** 清除密钥（失败按"没配"处理即可，不值得打断用户） */
// 清除范围明确到服务商，不能跟随之后发生的标签变化。
// 仍使用原有未配置回退，网络目录缓存不受清除影响。
// 清除凭据不代表撤销服务商令牌，用户可在官网自行管理。
export async function clearAgentSecret(provider: AgentProvider = 'siliconflow'): Promise<AgentSecretStatus> {
  const api = getElectronAPI();
  const fallback: AgentSecretStatus = {
    configured: false,
    source: "none",
    protection: "",
    tail: "",
  };
  if (typeof api?.agentClearSecret !== "function") return fallback;
  // 返回的状态只对应当前请求站点，不对另一站凭据做任何推断。
  // 系统环境变量仍可能提供硅基流动密钥，主进程会如实标记 env。
  // 错误输出使用固定操作名，不拼入令牌或用户路径。
  return unwrapIpcOr(await api.agentClearSecret(provider), fallback, "agentClearSecret");
}

export interface CivitaiKeyStatus { configured: boolean; protection: "safeStorage" | "plain" | ""; tail: string }
const CIVITAI_KEY_FALLBACK: CivitaiKeyStatus = { configured: false, protection: "", tail: "" };
export async function getCivitaiKeyStatus(): Promise<CivitaiKeyStatus> {
  const api = getElectronAPI();
  if (typeof api?.civitaiKeyStatus !== "function") return CIVITAI_KEY_FALLBACK;
  return unwrapIpcOr(await api.civitaiKeyStatus(), CIVITAI_KEY_FALLBACK, "civitaiKeyStatus");
}
export async function setCivitaiKey(key: string): Promise<CivitaiKeyStatus> {
  const api = getElectronAPI();
  if (typeof api?.civitaiKeySet !== "function") throw new Error(t("errors.desktopOnly.agentUnavailable"));
  return unwrapIpc(await api.civitaiKeySet(CivitaiApiKeySchema.parse(key)));
}
export async function clearCivitaiKey(): Promise<CivitaiKeyStatus> {
  const api = getElectronAPI();
  if (typeof api?.civitaiKeyClear !== "function") return CIVITAI_KEY_FALLBACK;
  return unwrapIpc(await api.civitaiKeyClear());
}

export async function getDefaultOutputPath(): Promise<string | null> {
  const api = getElectronAPI();
  if (typeof api?.getDefaultOutputPath !== "function") return null;
  return unwrapIpcOr(await api.getDefaultOutputPath(), null, "getDefaultOutputPath");
}

export async function getDefaultUserDataPath(): Promise<string | null> {
  const api = getElectronAPI();
  if (typeof api?.getDefaultUserDataPath !== "function") return null;
  return unwrapIpcOr(
    await api.getDefaultUserDataPath(),
    null,
    "getDefaultUserDataPath"
  );
}

export async function resolveEffectiveOutputPath(
  customPath: string
): Promise<string | null> {
  const trimmed = customPath.trim();
  if (trimmed) return trimmed;
  return getDefaultOutputPath();
}

export async function openPathInExplorer(
  targetPath: string
): Promise<boolean> {
  const api = getElectronAPI();
  if (!targetPath || typeof api?.openPathInExplorer !== "function") {
    return false;
  }

  try {
    return unwrapIpc(await api.openPathInExplorer(targetPath)).length > 0;
  } catch {
    return false;
  }
}

export function getDirectoryFromFilePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? filePath.slice(0, index) : filePath;
}

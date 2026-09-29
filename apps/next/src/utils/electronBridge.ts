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
} from "@illusion-realm/shared";
import { t } from "@/i18n";
import { unwrapIpc, unwrapIpcOr } from "@/utils/ipcResult";

function getElectronAPI() {
  if (typeof window === "undefined") return null;
  const api = window.electronAPI;
  if (!api) return null;
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

export async function selectLocalFolder(): Promise<string | null> {
  const api = getElectronAPI();
  if (typeof api?.selectFolder !== "function") return null;
  return unwrapIpcOr(await api.selectFolder(), null, "selectFolder");
}

/**
 * 深色 / 浅色 / 跟随系统：转发到主进程的 `nativeTheme.themeSource`。
 *
 * 非 Electron 环境（浏览器里跑 `pnpm dev` 的渲染页）直接返回 null —— 主题由系统偏好决定，
 * 不抛错：主题是个「尽力而为」的偏好，不是业务流程，失败不该打断任何操作。
 */
export async function applyNativeThemeSource(
  source: "system" | "light" | "dark"
): Promise<string | null> {
  const api = getElectronAPI();
  if (typeof api?.setThemeSource !== "function") return null;
  return unwrapIpcOr(await api.setThemeSource(source), null, "setThemeSource");
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
export async function getAgentSecretStatus(): Promise<AgentSecretStatus> {
  const api = getElectronAPI();
  const fallback: AgentSecretStatus = {
    configured: false,
    source: "none",
    protection: "",
    tail: "",
  };
  if (typeof api?.agentSecretStatus !== "function") return fallback;
  return unwrapIpcOr(await api.agentSecretStatus(), fallback, "agentSecretStatus");
}

/**
 * 保存密钥。**用 `unwrapIpc`（失败抛错）**：填了但没存上必须让用户看见，
 * 静默成功会让用户以为配好了、然后在 Agent 页撞一句"缺少 API Key"。
 */
export async function setAgentSecret(apiKey: string): Promise<AgentSecretStatus> {
  const api = getElectronAPI();
  if (typeof api?.agentSetSecret !== "function") {
    throw new Error(t("errors.desktopOnly.agentUnavailable"));
  }
  return unwrapIpc(await api.agentSetSecret(apiKey));
}

/** 清除密钥（失败按"没配"处理即可，不值得打断用户） */
export async function clearAgentSecret(): Promise<AgentSecretStatus> {
  const api = getElectronAPI();
  const fallback: AgentSecretStatus = {
    configured: false,
    source: "none",
    protection: "",
    tail: "",
  };
  if (typeof api?.agentClearSecret !== "function") return fallback;
  return unwrapIpcOr(await api.agentClearSecret(), fallback, "agentClearSecret");
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

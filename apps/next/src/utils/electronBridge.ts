/**
 * 渲染层访问 preload 暴露的 `window.electronAPI` 的**唯一封装**。
 *
 * 怎么做：集中取 api（非 Electron 环境返回 null）→ 提供 `isElectronEnvironment`
 * 与能力探测（`hasXxxSupport`，用于按主进程版本降级）；调用结果交给
 * `utils/ipcResult` 解包。
 */
import type { LocalModel, LocalModelType } from "@/types/localModel";
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

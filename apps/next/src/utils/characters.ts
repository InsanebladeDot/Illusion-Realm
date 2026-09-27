/**
 * 角色库检索（animadex）的渲染层入口。
 *
 * 怎么做：走 `animadex:search` IPC + `unwrapIpc`（失败抛带 code 的错），
 * 这里只做参数与结果的收窄，不解析内容。
 */
import type {
  AnimadexSearchParams,
  AnimadexSearchResult,
} from "@/types/character";
import { isElectronEnvironment } from "@/utils/electronBridge";
import { unwrapIpc } from "@/utils/ipcResult";
import { t } from "@/i18n";

/** 角色库请求走主进程（内置 fetch，无第三方 HTTP 依赖），浏览器模式下给出可读错误 */
export async function searchCharacters(
  params: AnimadexSearchParams
): Promise<AnimadexSearchResult> {
  const api = typeof window === "undefined" ? undefined : window.electronAPI;
  if (!isElectronEnvironment() || !api?.animadexSearch) {
    throw new Error(t("errors.desktopOnly.characters"));
  }
  return unwrapIpc(await api.animadexSearch(params));
}

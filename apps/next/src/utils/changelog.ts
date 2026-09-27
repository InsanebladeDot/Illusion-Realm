/**
 * 更新日志（`/updates` 页与启动公告）的解析。
 *
 * 怎么做：把 `logs.md` 同步出来的 `public/changelog.md` 按 `##` 切成 section；
 * Electron 下走 `changelog:read` IPC，浏览器语义下 fetch 静态文件。
 */
import { t } from "@/i18n";
import type { ChangelogSection } from "@/types/changelog";
import { isElectronEnvironment } from "@/utils/electronBridge";
import { unwrapIpcOr } from "@/utils/ipcResult";

export const CHANGELOG_PUBLIC_PATH = "/changelog.md";

export function parseChangelogMarkdown(markdown: string): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  let current: ChangelogSection | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      if (current) sections.push(current);
      const title = line.slice(3).trim();
      current = { id: title, title, bodyLines: [] };
      continue;
    }

    if (current && line.trim()) {
      current.bodyLines.push(line);
    }
  }

  if (current) sections.push(current);
  return sections;
}

export function getLatestChangelogSection(
  markdown: string
): ChangelogSection | null {
  return parseChangelogMarkdown(markdown)[0] ?? null;
}

export async function fetchChangelogMarkdown(): Promise<string> {
  // Electron 打包后为 file:// 环境，fetch 本地文件会被 Chromium 拦截，
  // 必须改由主进程读取（out/changelog.md 或 public/changelog.md）。
  if (isElectronEnvironment() && window.electronAPI?.readChangelogMarkdown) {
    const text = unwrapIpcOr(
      await window.electronAPI.readChangelogMarkdown(),
      null,
      "readChangelogMarkdown"
    );
    if (text) return text;
  }

  const response = await fetch(CHANGELOG_PUBLIC_PATH, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(t("updates.errors.loadFailed", { status: response.status }));
  }
  return response.text();
}

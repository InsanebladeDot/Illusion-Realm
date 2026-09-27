/**
 * 把本地文件路径翻译成 ComfyUI 能识别的模型名（跨盘符、跨分隔符）。
 *
 * 怎么做：路径规范化 → 用设置的模型根目录做前缀匹配 → 取相对名；
 * 失败时再拿 ComfyUI 返回的模型列表反查（`resolveComfyModelNameFromList`）。
 */
import type { SettingsPaths } from "@/types/settings";

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function basename(path: string): string {
  const normalized = normalizePath(path);
  return normalized.split("/").pop() ?? path;
}

/** ComfyUI 在 Windows 下使用反斜杠的相对模型路径 */
export function toComfyPathSeparators(relativePath: string): string {
  return relativePath.replace(/\//g, "\\");
}

/** 从本地扫描根目录计算 ComfyUI 相对模型名 */
export function toComfyRelativeModelName(
  filePath: string,
  rootPath: string
): string | null {
  const file = normalizePath(filePath);
  const root = normalizePath(rootPath);
  if (!root) return null;

  const rootLower = root.toLowerCase();
  const fileLower = file.toLowerCase();

  if (fileLower === rootLower) return null;
  if (!fileLower.startsWith(`${rootLower}/`)) return null;

  const relative = file.slice(root.length).replace(/^\//, "");
  return relative ? toComfyPathSeparators(relative) : null;
}

export function collectModelRootCandidates(paths: SettingsPaths): string[] {
  return [paths.checkpointPath, paths.lorasPath, paths.searchPath].filter(
    Boolean
  );
}

/** 优先用设置路径推导相对名，否则退回文件名 */
export function toComfyModelName(
  filePath: string,
  rootPaths: string[] = []
): string {
  for (const root of rootPaths) {
    const relative = toComfyRelativeModelName(filePath, root);
    if (relative) return relative;
  }
  return basename(filePath);
}

function namesEqual(a: string, b: string): boolean {
  return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase();
}

function basenameLower(name: string): string {
  return basename(name).toLowerCase();
}

/** 在 ComfyUI 模型列表中解析出正确名称（含子目录） */
export function resolveComfyModelNameFromList(
  filePath: string,
  availableNames: string[],
  rootPaths: string[] = []
): string {
  if (availableNames.length === 0) {
    return toComfyModelName(filePath, rootPaths);
  }

  const exactInList = availableNames.find((name) => namesEqual(name, filePath));
  if (exactInList) return exactInList;

  for (const root of rootPaths) {
    const relative = toComfyRelativeModelName(filePath, root);
    if (!relative) continue;

    const exact = availableNames.find((name) => namesEqual(name, relative));
    if (exact) return exact;

    const normalizedRelative = normalizePath(relative).toLowerCase();
    const suffixMatches = availableNames.filter((name) =>
      normalizePath(name).toLowerCase().endsWith(normalizedRelative)
    );
    if (suffixMatches.length === 1) return suffixMatches[0];
  }

  const fileBase = basenameLower(filePath);
  const baseMatches = availableNames.filter(
    (name) => basenameLower(name) === fileBase
  );

  if (baseMatches.length === 1) return baseMatches[0];

  if (baseMatches.length > 1) {
    const normalizedFile = normalizePath(filePath).toLowerCase();
    const pathMatches = baseMatches.filter((name) =>
      normalizedFile.endsWith(normalizePath(name).toLowerCase())
    );
    if (pathMatches.length >= 1) {
      return pathMatches.sort((a, b) => b.length - a.length)[0];
    }
    return baseMatches[0];
  }

  return toComfyModelName(filePath, rootPaths);
}

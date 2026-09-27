/**
 * 输出目录下的文件夹树（含最大嵌套层数）。
 *
 * 怎么做：把主进程扫描到的磁盘条目转成 `HistoryFolder` 列表、校验 folderId、
 * 解析「文件夹 id → 磁盘路径」；默认文件夹（根）不参与重命名/删除。
 */
import {
  ALL_HISTORY_FOLDER,
  DEFAULT_FOLDER_ID,
} from "@/data/historyFolders";
import type { HistoryFolder } from "@/types/historyFolder";

/** 输出目录下用户文件夹最大嵌套层数（含自身，根下第一层为 1） */
export const MAX_HISTORY_FOLDER_DEPTH = 3;

export function buildHistoryFolderList(
  diskFolders: HistoryFolder[]
): HistoryFolder[] {
  return [ALL_HISTORY_FOLDER, ...diskFolders];
}

export function isDefaultHistoryFolder(folderId: string): boolean {
  return folderId === DEFAULT_FOLDER_ID;
}

export function historyFolderFromDiskEntry(entry: {
  dirPath: string;
  name: string;
  parentDirPath?: string | null;
  depth?: number;
  imageCount?: number;
  modifiedAt?: number;
}): HistoryFolder {
  return {
    id: entry.dirPath,
    name: entry.name,
    dirPath: entry.dirPath,
    parentDirPath: entry.parentDirPath ?? null,
    depth: entry.depth ?? 1,
    imageCount: entry.imageCount,
    modifiedAt: entry.modifiedAt,
  };
}

export function isValidFolderId(folderId: string): boolean {
  if (folderId === "all") return true;
  return folderId.includes("/") || folderId.includes("\\");
}

export function resolveFolderDirPath(folderId: string): string | null {
  if (folderId === DEFAULT_FOLDER_ID) return null;
  return folderId;
}

export function folderHasChildren(
  folder: HistoryFolder,
  diskFolders: HistoryFolder[]
): boolean {
  if (!folder.dirPath) return false;
  return diskFolders.some((item) => item.parentDirPath === folder.dirPath);
}

export function sortDiskFolders(folders: HistoryFolder[]): HistoryFolder[] {
  return [...folders].sort((a, b) => {
    const depthA = a.depth ?? 1;
    const depthB = b.depth ?? 1;
    if (depthA !== depthB) return depthA - depthB;
    return a.name.localeCompare(b.name, "zh-CN");
  });
}

function isFolderVisibleInTree(
  folder: HistoryFolder,
  diskFolders: HistoryFolder[],
  expandedIds: Set<string>
): boolean {
  if (!folder.parentDirPath) return true;
  if (!expandedIds.has(folder.parentDirPath)) return false;
  const parent = diskFolders.find((item) => item.dirPath === folder.parentDirPath);
  if (!parent) return true;
  return isFolderVisibleInTree(parent, diskFolders, expandedIds);
}

export function getVisibleDiskFolders(
  diskFolders: HistoryFolder[],
  expandedIds: Set<string>,
  keyword: string
): HistoryFolder[] {
  const trimmed = keyword.trim();
  if (trimmed) {
    const lower = trimmed.toLowerCase();
    return sortDiskFolders(
      diskFolders.filter((folder) =>
        folder.name.toLowerCase().includes(lower)
      )
    );
  }

  const visible: HistoryFolder[] = [];
  for (const folder of sortDiskFolders(diskFolders)) {
    if (isFolderVisibleInTree(folder, diskFolders, expandedIds)) {
      visible.push(folder);
    }
  }
  return visible;
}

export function collectExpandableFolderIds(
  diskFolders: HistoryFolder[]
): string[] {
  const parents = new Set<string>();
  for (const folder of diskFolders) {
    if (folder.parentDirPath) {
      parents.add(folder.parentDirPath);
    }
  }
  return [...parents];
}

export function canCreateSubfolder(folder: HistoryFolder | null): boolean {
  if (!folder?.dirPath) return true;
  return (folder.depth ?? 1) < MAX_HISTORY_FOLDER_DEPTH;
}

import type { HistoryFolder } from "../types/historyFolder";

export const DEFAULT_FOLDER_ID = "all";

export const ALL_HISTORY_FOLDER: HistoryFolder = {
  id: DEFAULT_FOLDER_ID,
  name: "全部",
};

export function filterHistoryFolders(
  folders: HistoryFolder[],
  query: string
): HistoryFolder[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return folders;

  return folders.filter((folder) =>
    folder.name.toLowerCase().includes(keyword)
  );
}

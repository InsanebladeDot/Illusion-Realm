/** 模型下载契约：任务由主进程持有，通过快照与事件同步进度，不持久化下载凭据。 */
export type DownloadModelType = "LORA" | "Checkpoint" | "TextualInversion";
export interface ModelDownloadLocation { modelType: DownloadModelType; baseModel: string }
export interface ModelDownloadTarget { rootPath: string; categories: string[] }
export interface ModelCategoryRoot { name: string; path: string }
export interface LocalModelCategoryTarget {
  rootPath: string;
  categoryRootPath: string;
  currentCategory: string;
  roots: ModelCategoryRoot[];
  categories: string[];
}
export interface MoveModelCategoryRequest { folderPath: string; targetRootPath: string; category: string }
export type LocalModelBatchRequest = { folderPaths: string[]; acknowledged: true } & (
  { action: "move"; targetRootPath: string; category: string } | { action: "delete" }
);
export interface LocalModelBatchItem { folderPath: string; destinationPath?: string; success: boolean; error?: string }
export interface LocalModelBatchResult { items: LocalModelBatchItem[] }
export interface ModelDownloadRequest extends ModelDownloadLocation {
  modelName: string;
  fileName: string;
  downloadUrl: string;
  category: string;
  sha256: string;
  previewUrl: string;
  logoDataUrl?: string;
}
export type ModelDownloadStatus = "downloading" | "saving" | "completed" | "failed" | "cancelled" | "removed";
export type ModelDownloadError = "configuration" | "invalid" | "exists" | "network" | "auth" | "redirect" | "timeout" | "response" | "integrity" | "io";
export interface ModelDownloadTask {
  id: string;
  fileName: string;
  modelName: string;
  status: ModelDownloadStatus;
  received: number;
  total: number;
  bytesPerSecond?: number;
  folderPath: string;
  filePath: string;
  logoWarning: boolean;
  error: ModelDownloadError | null;
  revision: number;
}

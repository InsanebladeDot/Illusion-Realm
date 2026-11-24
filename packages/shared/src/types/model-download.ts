/** 模型下载契约：任务由主进程持有，通过快照与事件同步进度，不持久化下载凭据。 */
export type DownloadModelType = "LORA" | "Checkpoint" | "TextualInversion";
export interface ModelDownloadLocation { modelType: DownloadModelType; baseModel: string }
export interface ModelDownloadTarget { rootPath: string; categories: string[]; modelFolderName?: string }
export interface LocalModelFolderRoot { root: string; folders: string[] }
export interface DeleteLocalModelFolderRequest { root: string; folder: string; acknowledged: true }
export interface CreateLocalModelFolderRequest { root: string; parent: string; name: string }
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
  /** 旧调用可省略；新下载提供来源快照，用于逐文件保存 .civitai.json。 */
  source?: ModelDownloadSource;
  /** 内置安装项由主进程生成，网络请求方不能借它指定任意目录。 */
  setupId?: import("../schemas/setup-download.schema").SetupDownloadId;
}
export type ModelDownloadSource = import("zod").infer<typeof import("../schemas/model-download.schema").ModelDownloadSourceSchema>;
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
  /** 等待现有下载槽位；旧任务没有该字段，状态与续传契约保持兼容。 */
  queued?: boolean;
}

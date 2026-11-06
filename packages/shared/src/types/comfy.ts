export type ComfyApiNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

export type ComfyApiPrompt = Record<string, ComfyApiNode>;
/** Optional extended lists keep older Electron bridges compatible with image generation. */
export interface ComfyModelLists {
  checkpoints: string[];
  loras: string[];
  diffusionModels?: string[];
  clips?: string[];
  vaes?: string[];
  // 模型补丁独立于 UNet 和 LoRA，不在其他类别中猜测同名文件。
  // 可选字段保持旧桥接返回值兼容；需要补丁的任务会明确检查缺失。
  // 值为 ComfyUI 返回的相对名称，允许任意层级子目录。
  modelPatches?: string[];
}

export type ComfyQueueResponse = {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, unknown>;
};

export type ComfyHistoryImage = {
  filename: string;
  subfolder: string;
  type: string;
};

export type ComfyHistoryOutputs = Record<
  string,
  {
    images?: ComfyHistoryImage[];
  }
>;

export type ComfyHistoryEntry = {
  outputs: ComfyHistoryOutputs;
  status?: {
    status_str?: string;
    completed?: boolean;
  };
};

export type ComfyGeneratedImage = {
  nodeId: string;
  filename: string;
  subfolder: string;
  folderType: string;
  blob: Blob;
  objectUrl: string;
};

export type ComfyGeneratedVideo = {
  nodeId: string;
  filename: string;
  subfolder: string;
  folderType: string;
  /** 输出类型标识：videos / gifs */
  kind: string;
  blob: Blob;
  objectUrl: string;
};

export type ComfyGenerateResult = {
  promptId: string;
  images: ComfyGeneratedImage[];
};

export type ComfyGenerateOptions = {
  serverAddress?: string;
  requestId?: string;
  clientId?: string;
  signal?: AbortSignal;
  onExecuting?: (nodeId: string | null) => void;
};

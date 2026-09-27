export type LocalModelType = "checkpoint" | "lora";

export type LocalModelVersion = {
  id: string;
  name: string;
  filePath: string;
};

export type LocalModel = {
  id: string;
  name: string;
  filePath: string;
  iconPath: string | null;
  type: LocalModelType;
  versions: LocalModelVersion[];
  /** 相对扫描根目录的第一级分类名（如 diffusion_models 下的 Anima） */
  category?: string;
};

export type LocalModelScanResult = {
  models: LocalModel[];
  scannedAt: number;
};

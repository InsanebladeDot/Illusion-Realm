import type { ImageAsset } from "./common";

export type ModelSeriesTag = "Illustrious" | "Pony" | "Anima" | "NoobAI" | "Local";

export type ModelCover = ImageAsset | string;

export type ModelVersion = {
  id: string;
  label: string;
  cover: ModelCover;
};

export type CreateModel = {
  id: string;
  name: string;
  seriesTag: ModelSeriesTag;
  cover: ModelCover;
  versions: ModelVersion[];
  isLocal?: boolean;
  filePath?: string;
  /** 鏈湴妯″瀷锛氱浉瀵规壂鎻忔牴鐩綍鐨勭涓€绾ф枃浠跺す鍚?*/
  category?: string;
};

export type SelectedModel = {
  modelId: string;
  versionId: string;
};

export type ModelSortMode = "az" | "newest";

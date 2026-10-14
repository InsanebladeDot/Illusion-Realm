import type { ImageAsset } from "./common";

export type ExtensionSeriesTag = "SDXL 1.0" | "Pony" | "Illustrious" | "Local";

export type ExtensionCover = ImageAsset | string;

export type ExtensionVersion = {
  id: string;
  label: string;
  detailLabel?: string;
  cover?: ExtensionCover;
};

export type CreateExtension = {
  id: string;
  name: string;
  seriesTag: ExtensionSeriesTag;
  cover: ExtensionCover;
  versionLabel: string;
  versions?: ExtensionVersion[];
  isLocal?: boolean;
  filePath?: string;
  /** 鏈湴 LoRA锛氱浉瀵规壂鎻忔牴鐩綍鐨勭涓€绾ф枃浠跺す鍚?*/
  category?: string;
};

export type SelectedExtension = {
  extensionId: string;
  weight: number;
};

export const EXTENSION_WEIGHT_MIN = -5;
export const EXTENSION_WEIGHT_MAX = 5;
export const DEFAULT_EXTENSION_WEIGHT = 0.4;

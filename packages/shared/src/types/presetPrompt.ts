import type { ImageAsset } from "./common";

export type PresetPromptOption = {
  id: string;
  name: string;
  positivePrefix: string;
  positiveSuffix?: string;
  negativePrefix: string;
  negativeSuffix?: string;
  isDefault?: boolean;
  isCustom?: boolean;
  seriesId?: string;
};

export type CustomPresetForm = {
  name: string;
  positivePrefix: string;
  positiveSuffix: string;
  negativePrefix: string;
  negativeSuffix: string;
};

export type PresetPromptSeries = {
  id: string;
  label: string;
  icon: ImageAsset;
  description: string;
  presets: PresetPromptOption[];
};

/** 鍙嶅悜鎻愮ず璇嶉璁撅紙鍐呯疆 + 鐢ㄦ埛鑷畾涔夛紝鍚庤€呮寔涔呭寲鍒扮敤鎴锋暟鎹枃浠讹級 */
export type NegativePromptPreset = {
  id: string;
  name: string;
  /** 鍙嶅悜鎻愮ず璇嶆鏂囷紙鍙洿鎺ュ～鍏ヨ緭鍏ユ锛?*/
  negative: string;
  /** 鍐呯疆棰勮 */
  isDefault?: boolean;
  /** 鐢ㄦ埛鑷畾涔夐璁?*/
  isCustom?: boolean;
  /** 鍗＄墖涓婄殑璇存槑鏂囧瓧 */
  note?: string;
};

import type { AspectRatioLabel } from "../data/imageSizes";

export type { AspectRatioLabel };

/** 兼容旧引用：比例与默认值的唯一来源是 data/imageSizes */
export { DEFAULT_ASPECT_RATIO } from "../data/imageSizes";

export type ImageSizeMode = "preset" | "custom";

export type ImageSizeState = {
  /** preset：使用比例预设的训练友好分辨率；custom：自定义宽高 */
  sizeMode: ImageSizeMode;
  aspectRatio: AspectRatioLabel;
  customWidth: number;
  customHeight: number;
};

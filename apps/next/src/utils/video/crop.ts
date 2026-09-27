/** 裁剪计算：比例预设 + 居中裁剪 + 边界收敛 */

import { t } from "@/i18n";

export type CropAspectId =
  | "source"
  | "1:1"
  | "4:3"
  | "3:4"
  | "16:9"
  | "9:16"
  | "custom";

export type CropAspectOption = {
  id: CropAspectId;
  label: string;
  /** null 表示不限制比例（原始/自定义） */
  ratio: number | null;
};

export const CROP_ASPECT_OPTIONS: CropAspectOption[] = [
  { id: "source", label: t("toolBox.video.crop.aspect.source"), ratio: null },
  { id: "1:1", label: t("toolBox.video.crop.aspect.square"), ratio: 1 },
  { id: "4:3", label: t("toolBox.video.crop.aspect.landscape"), ratio: 4 / 3 },
  { id: "3:4", label: t("toolBox.video.crop.aspect.portrait"), ratio: 3 / 4 },
  { id: "16:9", label: t("toolBox.video.crop.aspect.wide"), ratio: 16 / 9 },
  { id: "9:16", label: t("toolBox.video.crop.aspect.vertical"), ratio: 9 / 16 },
  { id: "custom", label: t("toolBox.video.crop.aspect.custom"), ratio: null },
];

export type CropRect = {
  width: number;
  height: number;
  x: number;
  y: number;
};

/** libx264 要求宽高为偶数，向下取偶并保证 ≥2 */
export function toEven(value: number): number {
  const rounded = Math.floor(Math.abs(value));
  if (rounded < 2) return 2;
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

/** 按比例最大化居中裁剪 */
export function buildCenteredCrop(
  videoWidth: number,
  videoHeight: number,
  ratio: number | null
): CropRect {
  if (videoWidth <= 0 || videoHeight <= 0) {
    return { width: 2, height: 2, x: 0, y: 0 };
  }
  if (!ratio) {
    return { width: toEven(videoWidth), height: toEven(videoHeight), x: 0, y: 0 };
  }

  let width = videoWidth;
  let height = videoHeight;

  if (videoWidth / videoHeight > ratio) {
    height = videoHeight;
    width = videoHeight * ratio;
  } else {
    width = videoWidth;
    height = videoWidth / ratio;
  }

  const evenWidth = toEven(width);
  const evenHeight = toEven(height);

  return {
    width: evenWidth,
    height: evenHeight,
    x: toEven((videoWidth - evenWidth) / 2),
    y: toEven((videoHeight - evenHeight) / 2),
  };
}

/** 收敛到视频范围内，保证裁剪框合法 */
export function clampCrop(
  crop: CropRect,
  videoWidth: number,
  videoHeight: number
): CropRect {
  const width = Math.min(toEven(crop.width), toEven(videoWidth));
  const height = Math.min(toEven(crop.height), toEven(videoHeight));
  const x = Math.max(0, Math.min(toEven(crop.x), Math.max(0, toEven(videoWidth) - width)));
  const y = Math.max(0, Math.min(toEven(crop.y), Math.max(0, toEven(videoHeight) - height)));
  return { width, height, x, y };
}

/** 判断是否为原始整幅画面（无需裁剪） */
export function isFullFrame(
  crop: CropRect,
  videoWidth: number,
  videoHeight: number
): boolean {
  return (
    crop.x === 0 &&
    crop.y === 0 &&
    crop.width >= toEven(videoWidth) &&
    crop.height >= toEven(videoHeight)
  );
}

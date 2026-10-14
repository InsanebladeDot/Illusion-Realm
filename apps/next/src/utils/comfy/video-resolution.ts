/** 视频工作流尺寸适配：UI 返回与图片相同的尺寸参数；只有提交节点时才按 Minimax 要求对齐 32 像素。 */
import type { ComfyApiPrompt } from "@/types/comfy";
import { findImageSizePresetBySize } from "@/data/imageSizes";
import { createSizeSelection, IMAGE_SIZE_MAX, IMAGE_SIZE_MIN, type ImageSizeSelection } from "@/utils/imageSize";
import { t } from "@/i18n";
import { findMinimaxVideoNode } from "./minimax-video-node";

export const VIDEO_SIZE_MIN = 32;
export const VIDEO_SIZE_MAX = 16384;
export const VIDEO_SIZE_STEP = 32;
export type VideoResolutionSettings = ImageSizeSelection;

export function clampVideoSide(value: number) {
  if (!Number.isFinite(value)) return VIDEO_SIZE_MIN;
  return Math.min(VIDEO_SIZE_MAX, Math.max(VIDEO_SIZE_MIN, Math.round(value / VIDEO_SIZE_STEP) * VIDEO_SIZE_STEP));
}

export function getVideoResolutionDefaults(prompt: ComfyApiPrompt): VideoResolutionSettings {
  const video = findMinimaxVideoNode(prompt);
  if (!video) throw new Error(t("create.videoModels.missingNode", { name: "MiniMaxH3ImageToVideo" }));
  const { width, height } = video.inputs;
  if (typeof width !== "number" || typeof height !== "number") throw new Error(t("create.videoSettings.invalid"));
  const preset = findImageSizePresetBySize(width, height);
  return createSizeSelection({ mode: preset ? "preset" : "custom", aspectRatio: preset?.id ?? "1:1", customWidth: width, customHeight: height, scale: 1 });
}

export function applyVideoResolution(prompt: ComfyApiPrompt, settings?: VideoResolutionSettings) {
  if (!settings) return;
  const valid = [settings.width, settings.height].every((value) =>
    Number.isInteger(value) && value >= IMAGE_SIZE_MIN && value <= IMAGE_SIZE_MAX);
  if (!valid) throw new Error(t("create.videoSettings.invalid"));
  const video = findMinimaxVideoNode(prompt);
  if (!video) throw new Error(t("create.videoModels.missingNode", { name: "MiniMaxH3ImageToVideo" }));
  Object.assign(video.inputs, { width: clampVideoSide(settings.width), height: clampVideoSide(settings.height) });
}

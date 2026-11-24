/** 图片编辑的交付尺寸来自首图。推理需要对齐时，解码后恢复首图宽高。 */
import type { ComfyApiPrompt } from "@/types/comfy";

export interface EditImageSize { width: number; height: number }

export function isEditImageSize(size: EditImageSize) {
  return [size.width, size.height].every(side => Number.isSafeInteger(side) && side > 0);
}

export function alignedEditImageSize({ width, height }: EditImageSize, step: number): EditImageSize {
  return { width: Math.ceil(width / step) * step, height: Math.ceil(height / step) * step };
}

export function resizeEditedOutput(prompt: ComfyApiPrompt, size: EditImageSize, step: number) {
  if (size.width % step === 0 && size.height % step === 0) return;
  // 像交付前把照片装回原画框，只调整解码结果，参考图与蒙版的连线保持原样。
  const output = Object.values(prompt).find(node => node.class_type === "SaveImage" || node.class_type === "PreviewImage");
  if (!output) return;
  prompt["edit-output-size"] = {
    class_type: "ImageScale",
    inputs: { image: output.inputs.images, upscale_method: "lanczos", ...size, crop: "disabled" },
  };
  output.inputs.images = ["edit-output-size", 0];
}

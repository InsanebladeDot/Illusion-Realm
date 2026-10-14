"use client";

// 图片和视频共用完整尺寸交互：同一预设、缩放、输入范围与返回结构；模型限制由工作流层负责。
import { IMAGE_SIZE_PRESETS } from "@/data/imageSizes";
import { clampImageSide, createSizeSelection, IMAGE_SIZE_MAX, IMAGE_SIZE_MIN, IMAGE_SIZE_STEP, type ImageSizeInput, type ImageSizeSelection } from "@/utils/imageSize";
import { SizeSelector } from "./size-selector";

interface Props {
  value: ImageSizeInput;
  onChange: (value: ImageSizeSelection) => void;
  className?: string;
  disabled?: boolean;
}

export function CreationSizeSelector({ value, onChange, className, disabled }: Props) {
  const selection = createSizeSelection(value);
  const onPresetChange = (aspectRatio: string) => onChange(createSizeSelection({ ...value, mode: "preset", aspectRatio, scale: 1 }));
  const onCustomSizeChange = (patch: { width?: number; height?: number }) => onChange(createSizeSelection({
    ...value, mode: "custom", scale: 1,
    customWidth: clampImageSide(patch.width ?? selection.width), customHeight: clampImageSide(patch.height ?? selection.height),
  }));
  return (
    <fieldset disabled={disabled} className={className}>
      {/* 界面：「图片尺寸」，图片和视频完整复用此组件，只传入当前值并接收返回参数 */}
      <SizeSelector value={{ ...selection, customWidth: selection.width, customHeight: selection.height }} dimensions={selection}
        presets={IMAGE_SIZE_PRESETS} min={IMAGE_SIZE_MIN} max={IMAGE_SIZE_MAX} step={IMAGE_SIZE_STEP}
        scale={selection.scale} onScaleChange={(scale) => onChange(createSizeSelection({ ...value, scale }))}
        onPresetChange={onPresetChange} onCustomSizeChange={onCustomSizeChange} />
    </fieldset>
  );
}

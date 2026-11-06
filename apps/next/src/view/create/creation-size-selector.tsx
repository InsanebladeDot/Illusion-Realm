"use client";

// 图片复用公共尺寸 UI，但不传业务上限；视频由独立适配层提供限制。
import { IMAGE_SIZE_PRESETS } from "@/data/imageSizes";
// 图片只提供 8 像素对齐，不能把 MiniMax 的尺寸检查带进此组件。
// 公共 UI 接收参数，不自行猜测模型或创作模式。
// 更大分辨率经同一 onChange 返回，不另建一套图片输入框。
import { clampImageSide, createSizeSelection, IMAGE_SIZE_MIN, IMAGE_SIZE_STEP, type ImageSizeInput, type ImageSizeSelection } from "@/utils/imageSize";
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
      {/* 界面：「图片尺寸」不传 max；视频仍通过同一 SizeSelector 注入自己的范围。 */}
      <SizeSelector value={{ ...selection, customWidth: selection.width, customHeight: selection.height }} dimensions={selection}
        presets={IMAGE_SIZE_PRESETS} min={IMAGE_SIZE_MIN} step={IMAGE_SIZE_STEP}
        scale={selection.scale} onScaleChange={(scale) => onChange(createSizeSelection({ ...value, scale }))}
        onPresetChange={onPresetChange} onCustomSizeChange={onCustomSizeChange} />
    </fieldset>
  );
}

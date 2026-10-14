"use client";

// 图片生成的状态适配层：尺寸解析在外层，共用选择器只接收数值和回调。
import { useCreateFormStore } from "@/stores/useCreateFormStore";
import { CreationSizeSelector } from "./creation-size-selector";

export function ImageSizeSection() {
  const mode = useCreateFormStore((state) => state.sizeMode);
  const aspectRatio = useCreateFormStore((state) => state.aspectRatio);
  const customWidth = useCreateFormStore((state) => state.customWidth);
  const customHeight = useCreateFormStore((state) => state.customHeight);
  const scale = useCreateFormStore((state) => state.sizeScale);
  const onChange = useCreateFormStore((state) => state.setSizeSelection);
  const value = { mode, aspectRatio, customWidth, customHeight, scale };
  return (
    /* 界面：「图片尺寸」，保留原有桌面布局及图片尺寸约束 */
    <CreationSizeSelector className="hidden md:block" value={value} onChange={onChange} />
  );
}

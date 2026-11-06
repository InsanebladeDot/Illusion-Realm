"use client";

// 图片生成的状态适配层：尺寸解析在外层，共用选择器只接收数值和回调。
import { useCreateFormStore } from "@/stores/useCreateFormStore";
import { CreationSizeSelector } from "./creation-size-selector";
import { createSizeSelection } from "@/utils/imageSize";
import { useTranslation } from "@/i18n";

export function ImageSizeSection() {
  const { t } = useTranslation();
  const mode = useCreateFormStore((state) => state.sizeMode);
  const aspectRatio = useCreateFormStore((state) => state.aspectRatio);
  const customWidth = useCreateFormStore((state) => state.customWidth);
  const customHeight = useCreateFormStore((state) => state.customHeight);
  const scale = useCreateFormStore((state) => state.sizeScale);
  const onChange = useCreateFormStore((state) => state.setSizeSelection);
  const value = { mode, aspectRatio, customWidth, customHeight, scale };
  const dimensions = createSizeSelection(value);
  return (
    /* 界面：「图片尺寸」，保留原有桌面布局及图片尺寸约束 */
    <details data-create-size className="rounded-xl border border-border p-3">
      <summary className="flex min-h-8 cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
        <span>{t("create.imageSizeSection.title")}</span>
        <span data-size-summary className="font-medium tabular-nums">{dimensions.width} × {dimensions.height}</span>
        <span className="text-xs text-muted-foreground">{t("create.workspace.expandSettings")}</span>
      </summary>
      <CreationSizeSelector className="pt-3" value={value} onChange={onChange} />
    </details>
  );
}

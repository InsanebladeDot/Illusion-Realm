"use client";

import { useState } from "react";
import { useTranslation } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { createSizeSelection, type ImageSizeSelection } from "@/utils/imageSize";
import { MossCompositionControl } from "@/view/create/moss-composition/moss-composition-control";
import { serializeMossComposition, type CompositionDraft } from "@/view/create/moss-composition/composition-draft";
import { canvasOutputDimensions, canvasSizePatch } from "./canvas-output-size";
import type { CanvasData } from "./canvas-model";

interface Props {
  data: CanvasData;
  onChange: (patch: Partial<CanvasData>) => void;
}

/** 用节点的提示词和尺寸打开原构图页，确认时一起写回给生成队列。 */
export function CanvasMossComposition({ data, onChange }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<CompositionDraft | null>(null);
  function readSize() {
    const { width, height } = canvasOutputDimensions(data);
    return createSizeSelection({ mode: "custom", aspectRatio: data.ratio.replace("/", ":"), customWidth: width, customHeight: height, scale: 1 });
  }
  function apply(value: CompositionDraft, size: ImageSizeSelection) {
    const prompt = serializeMossComposition(value, size);
    // 截断会破坏 JSON，超限时保留原提示词和构图草稿。
    if (prompt.length > 4000) {
      useToastStore.getState().show(t("canvas.mossCompositionTooLong"));
      return false;
    }
    setDraft(value);
    const current = canvasOutputDimensions(data);
    const sizeChanged = size.width !== current.width || size.height !== current.height;
    onChange({ ...(sizeChanged ? canvasSizePatch(data, size.width, size.height) : {}), prompt });
    return true;
  }
  return <div className="flex justify-end" data-canvas-popover>
    <MossCompositionControl draft={draft} readPrompt={() => data.prompt} readSize={readSize} onApply={apply} />
  </div>;
}

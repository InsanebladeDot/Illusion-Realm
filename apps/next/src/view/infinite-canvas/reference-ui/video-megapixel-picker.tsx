"use client";

/** 面积滑块复用原参数浮层和画布range样式；每档继续走原节点尺寸事务。 */
import { useTranslation } from "@/i18n";
import type { CanvasData } from "../canvas-model";
import { canvasOutputDimensions } from "../canvas-output-size";
import { canvasMegapixelPatch, VIDEO_MEGAPIXELS } from "../canvas-video-resolution";
import { ParameterPopover } from "./parameter-popover";

interface Props { data: CanvasData; disabled?: boolean; onChange: (patch: Partial<CanvasData>) => void }

export function VideoMegapixelPicker({ data, disabled, onChange }: Props) {
  const { t } = useTranslation();
  // 旧自定义宽高保留原值，不用近似面积冒充用户曾选过某一档。
  const selected = data.videoMegapixels ?? (data.videoOutput ? undefined : 1);
  const dimensions = canvasOutputDimensions(data);
  const label = selected === undefined ? t("canvas.outputCustom") : t("canvas.videoMegapixelsValue", { value: selected.toFixed(1) });
  return <ParameterPopover marker="megapixels" label={label} icon="image" disabled={disabled}>{() => <div>
    {/* 面积滑块：0.1一档即时确认，原生方向键和Home/End沿用相同参数更新。 */}
    <label className="hy-megapixel-control"><span>{t("canvas.videoMegapixels")}<output>{label}</output></span>
      <input type="range" min={0.1} max={1} step={0.1} value={selected ?? 1} disabled={disabled} aria-label={t("canvas.videoMegapixels")} aria-valuetext={label} onChange={event => {
        // 从固定档位取值，避免浮点草稿或异常事件绕过已有枚举校验。
        const value = VIDEO_MEGAPIXELS.find(option => option === Number(event.currentTarget.value));
        if (value !== undefined) onChange(canvasMegapixelPatch(data, data.ratio, value));
      }} />
      <span className="hy-megapixel-limits" aria-hidden="true"><span>0.1</span><span>1.0</span></span>
    </label>
    <output className="hy-output-pixels" data-canvas-output-pixels>{dimensions.width} × {dimensions.height} px</output>
    <small className="hy-output-limit">{t("canvas.videoMegapixelsHint")}</small>
  </div>}</ParameterPopover>;
}

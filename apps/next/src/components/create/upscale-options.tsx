"use client";
import { HoverTip } from "@/components/hover-tip";


/** 创建页与节点共用配置，开关直接引用画布设置组件；这里只发出确认值，不启动推理。 */
import { useTranslation } from "@/i18n";
import { CanvasSwitch } from "@/view/infinite-canvas/reference-ui/components";
import { DEFAULT_UPSCALE, type UpscaleSettings } from "@/utils/comfy/seedvr2-workflow";

interface Props { value?: UpscaleSettings; onChange: (value: UpscaleSettings) => void; disabled?: boolean; expanded?: boolean; compact?: boolean }

export function UpscaleOptions({ value = DEFAULT_UPSCALE, onChange, disabled, expanded, compact }: Props) {
  const { t } = useTranslation();
  // 画布的生成后超分沿用固定 ×2 设置，详情放在专属浮层。
  if (compact) return <div data-upscale-options className="flex items-center justify-between gap-3 whitespace-nowrap text-xs">
    <span>{t("canvas.postUpscale")}</span>
    <CanvasSwitch label={t("canvas.postUpscale")} checked={value.enabled} disabled={disabled} onChange={enabled => onChange({ ...DEFAULT_UPSCALE, enabled })} />
  </div>;
  return <div data-upscale-options className="space-y-2 text-xs">
    <HoverTip asChild layer="window" label={(t("canvas.upscaleHint")) ?? ""}><div className="flex items-center justify-between gap-3">
      <span>{t("canvas.upscale")}</span>
      <CanvasSwitch label={t("canvas.upscale")} checked={value.enabled} disabled={disabled} onChange={enabled => onChange({ ...value, enabled })} />
    </div></HoverTip>
    {(value.enabled || expanded) && <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
      <span>SeedVR2 7B</span>
      <select aria-label={t("canvas.upscaleScale")} disabled={disabled} value={value.scale} className="rounded-md bg-transparent px-2 py-1 text-foreground" onChange={event => onChange({ ...value, scale: event.target.value === "4" ? 4 : event.target.value === "3" ? 3 : 2 })}>
        {[2, 3, 4].map(scale => <option key={scale} value={scale}>×{scale}</option>)}
      </select>
    </div>}
  </div>;
}

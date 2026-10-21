"use client";

// 界面：「检测边缘」；上传、大图预览和下载复用现有实现，OpenCV 计算由业务 hook 管理。
import { ArrowRight, Contrast, Download, Loader2, ScanLine } from "lucide-react";
import { useState } from "react";
import { ImagePreviewOverlay } from "@/components/ImagePreviewOverlay";
import { RangeIntervalSlider } from "@/components/range-interval-slider";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import { ACCENT_SWITCH_ON_CLASS } from "@/utils/layout";
import { downloadMaskImage } from "@/utils/mask-image";
import { VideoImageUpload } from "./VideoImageUpload";
import type { CannyPreviewState } from "./use-canny-preview";

export function CannyEnableToggle({ state }: { state: CannyPreviewState }) {
  const { t } = useTranslation();
  return <div className="flex items-center justify-between gap-3 text-sm font-medium">
    <span className="flex items-center gap-2"><ScanLine size={15} />{t("create.canny.title")}</span>
    {/* 界面：沿用提示词标题栏的开关样式。 */}
    <button type="button" role="switch" data-canny-enable aria-label={t("create.canny.title")} aria-checked={state.enabled} onClick={() => state.setEnabled(!state.enabled)} className={cn("inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background", state.enabled ? ACCENT_SWITCH_ON_CLASS : "bg-gray-300 dark:bg-gray-700")}>
      <span aria-hidden className={cn("pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform", state.enabled ? "translate-x-4" : "translate-x-0")} />
    </button>
  </div>;
}

function CannySource({ state }: { state: CannyPreviewState }) {
  const { t } = useTranslation(), source = state.source;
  const [preview, setPreview] = useState(false);
  return <div className="min-w-0 space-y-1.5" data-canny-source aria-busy={state.loading}>
    <VideoImageUpload label={t("create.canny.original")} required imageUrl={source?.url ?? null} onSelect={file => { void state.select(file); }} onRemove={state.remove} />
    {source && <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
      <span className="min-w-0 truncate" title={source.name}>{source.name}</span>
      <button type="button" data-canny-preview onClick={() => setPreview(true)} className="shrink-0 text-accent-text hover:underline">{t("create.canny.preview")}</button>
    </div>}
    {source && <ImagePreviewOverlay items={[{ key: source.url, src: source.url, alt: source.name }]} index={0} open={preview} onOpenChange={setPreview} />}
    {state.loading && <p role="status" className="text-xs text-muted-foreground">{t("create.canny.loading")}</p>}
  </div>;
}

function CannyResult({ state }: { state: CannyPreviewState }) {
  const { t } = useTranslation(), [preview, setPreview] = useState(false), result = state.result;
  const name = `${state.source?.name.replace(/\.[^.]+$/, "") ?? "image"}_canny.png`;
  return <div className="min-w-0 space-y-2" data-canny-result aria-busy={state.processing}>
    <h3 className="text-xs font-semibold sm:text-sm">{t("create.canny.result")}</h3>
    {result ? <>
      <button type="button" data-canny-output-preview onClick={() => setPreview(true)} className="block h-32 w-full overflow-hidden rounded-xl border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stroke" aria-label={t("create.canny.preview")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 预览 Worker 生成的原尺寸 PNG Blob */}
        <img data-canny-output src={result.url} alt={t("create.canny.result")} className="h-full w-full object-contain" />
      </button>
      <button type="button" data-canny-download onClick={() => downloadMaskImage(result.blob, name)} className="flex items-center gap-1 text-[11px] text-accent-text hover:underline"><Download size={12} />{t("create.canny.download")}</button>
      <ImagePreviewOverlay items={[{ key: result.url, src: result.url, alt: name }]} index={0} open={preview} onOpenChange={setPreview} />
    </> : <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background/50 px-3 py-4 text-center text-xs text-muted-foreground" role="status">
      {state.processing ? <Loader2 size={22} className="animate-spin" /> : <ScanLine size={22} className="opacity-40" />}<span>{t(state.processing ? "create.canny.processing" : state.processingError ? "create.canny.processingFailed" : "create.canny.pending")}</span>
      {state.processingError && <button type="button" data-canny-retry onClick={state.retry} className="text-accent-text hover:underline">{t("create.canny.retry")}</button>}
    </div>}
  </div>;
}

export function CannyPreviewPanel({ state }: { state: CannyPreviewState }) {
  const { t } = useTranslation();
  if (!state.enabled) return null;
  return <section data-canny-panel className="@container min-w-0 space-y-3 rounded-xl border border-border bg-muted/20 p-3" aria-label={t("create.canny.title")}>
    <header className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-medium"><ScanLine size={15} />{t("create.canny.title")}</h2>
      <button type="button" data-canny-invert aria-pressed={state.inverted} onClick={() => state.setInverted(!state.inverted)} className={cn("flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stroke", state.inverted ? "border-accent-stroke bg-accent-soft text-accent-text" : "border-border text-muted-foreground hover:bg-muted")}><Contrast size={13} />{t("create.canny.invert")}</button>
    </header>
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-[11px] text-muted-foreground"><span>{t("create.canny.thresholds")}</span><output data-canny-thresholds className="tabular-nums">{state.thresholds.lower.toFixed(2)} – {state.thresholds.upper.toFixed(2)}</output></div>
      <RangeIntervalSlider value={state.thresholds} onChange={state.setThresholds} lowerLabel={t("create.canny.lower")} upperLabel={t("create.canny.upper")} />
      <div aria-hidden className="flex justify-between text-[10px] text-muted-foreground"><span>0</span><span>1</span></div>
    </div>
    {/* rail 空间足够时并排，紧凑时上下排列；按容器宽度判断，避免宽屏窄栏挤压。 */}
    <div data-canny-comparison className="grid min-w-0 grid-cols-1 items-start gap-2 @[300px]:grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)]">
      <CannySource state={state} />
      <ArrowRight aria-hidden size={16} className="mx-auto rotate-90 text-muted-foreground @[300px]:mt-20 @[300px]:rotate-0" />
      <CannyResult state={state} />
    </div>
    {state.error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
    <p className="text-[11px] leading-relaxed text-muted-foreground">{t("create.canny.outputHint")}</p>
  </section>;
}

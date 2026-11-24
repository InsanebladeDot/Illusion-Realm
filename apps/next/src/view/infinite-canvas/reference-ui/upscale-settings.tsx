"use client";

/** 超分浮层只编辑节点参数；横向选择与数字自定义直接复用原画布控件。 */
import { useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { AdvancedSettingsSection } from "@/view/create/advanced-settings-section";
import { resolveUpscaleSettings, UPSCALE_SCALES, type UpscaleSettings } from "@/utils/comfy/seedvr2-workflow";
import { SegmentedControl } from "./components";
import { VideoNumberOptions } from "./video-number-picker";

interface Props { value: UpscaleSettings; onChange: (value: UpscaleSettings) => void; video: boolean }

/** 固定种子保留输入草稿；只在确认合法整数后保存，避免半个数字进入工程。 */
function SeedInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value), [error, setError] = useState(false);
  const cancelled = useRef(false);
  const commit = () => {
    if (cancelled.current) return;
    if (!/^\d{1,16}$/.test(draft) || !Number.isSafeInteger(Number(draft))) { setError(true); return; }
    setError(false); onChange(draft);
  };
  return <div className="hy-quality-custom hy-number-custom">
    <input aria-label={t("canvas.upscaleSeed")} inputMode="numeric" value={draft} aria-invalid={error} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === "Escape") cancelled.current = true; if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />
    {error && <small role="alert">{t("canvas.upscaleSeedInvalid")}</small>}
  </div>;
}

export function UpscaleSettingsContent({ value, onChange, video }: Props) {
  const { t } = useTranslation();
  const config = resolveUpscaleSettings(value);
  const patch = (next: Partial<UpscaleSettings>) => onChange({ ...config, ...next });
  return <div className="hy-upscale-settings" data-upscale-settings>
    {/* 超分参数：共用浮层与选择条，不在打开设置时提交生成。 */}
    <label>{t("canvas.upscaleModel")}</label>
    <div className="hy-parameter-options"><SegmentedControl label={t("canvas.upscaleModel")} value={config.model} items={[{ id: "seedvr2_3b", label: "SeedVR2 3B" }, { id: "seedvr2_7b", label: "SeedVR2 7B" }]} onChange={model => { if (model === "seedvr2_3b" || model === "seedvr2_7b") patch({ model }); }} /></div>
    <label>{t("canvas.upscaleScale")}</label>
    <div className="hy-parameter-options"><SegmentedControl label={t("canvas.upscaleScale")} value={String(config.scale)} items={UPSCALE_SCALES.map(scale => ({ id: String(scale), label: `×${scale}` }))} onChange={value => { const scale = UPSCALE_SCALES.find(scale => String(scale) === value); if (scale) patch({ scale }); }} /></div>
    {video && <div data-upscale-batch-frames><div className="hy-upscale-setting-row"><span>{t("canvas.upscaleBatchFrames")}</span><span>{config.batchFrames}</span></div><VideoNumberOptions marker="upscale-frames" label={t("canvas.upscaleBatchFrames")} value={config.batchFrames} step={1} max={120} presets={[5, 10, 20, 30, 60]} format={value => String(value)} onChange={batchFrames => patch({ batchFrames })} close={() => undefined} /></div>}
    <label>{t("canvas.upscaleSeedMode")}</label>
    <div className="hy-parameter-options"><SegmentedControl label={t("canvas.upscaleSeedMode")} value={config.seedMode} items={[{ id: "random", label: t("canvas.upscaleSeedRandom") }, { id: "fixed", label: t("canvas.upscaleSeedFixed") }, { id: "shared", label: t("canvas.upscaleSeedShared") }]} onChange={seedMode => { if (seedMode === "random" || seedMode === "fixed" || seedMode === "shared") patch({ seedMode }); }} /></div>
    {config.seedMode === "fixed" && <SeedInput value={config.seed} onChange={seed => patch({ seed })} />}
    <AdvancedSettingsSection />
    <small>{t(video ? "canvas.upscaleBatchHint" : "canvas.upscaleImageSeedHint")}</small>
  </div>;
}

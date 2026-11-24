"use client";

/** 独立超分在卡内展示已保存的模型与倍数；只有用户点击才提交，重开不自动运行。 */
import type { ReactNode } from "react";
import styles from "../canvas.module.css";
import { resolveUpscaleSettings, type UpscaleSettings } from "@/utils/comfy/seedvr2-workflow";
import { ParameterPopover } from "./parameter-popover";
import { UpscaleSettingsContent } from "./upscale-settings";
import { CanvasChip } from "./components";
import { useTranslation } from "@/i18n";

interface Props { children?: ReactNode; busy: boolean; onSubmit: () => void; value?: UpscaleSettings; onChange: (value: UpscaleSettings) => void; video: boolean }
export function UpscalePanel({ children, busy, onSubmit, value, onChange, video }: Props) {
  const { t } = useTranslation();
  const config = resolveUpscaleSettings(value);
  return <section className={styles.upscaleCard} data-canvas-upscale-card data-has-media={!!children} data-video={video} aria-label={t("canvas.upscale")}>
    <div className={`${styles.upscaleModel} nodrag nopan nowheel`}><div>{config.model === "seedvr2_3b" ? "SeedVR2 3B" : "SeedVR2 7B"} <span>×{config.scale}</span></div>
      <ParameterPopover marker="upscale-settings" icon="settings" iconOnly label={t("canvas.upscaleSettings")} disabled={busy}>{() => <UpscaleSettingsContent value={config} onChange={onChange} video={video} />}</ParameterPopover>
    </div>
    <div className={styles.upscalePreview}>{children || <span className={styles.upscaleHint}>{t("canvas.upscaleSource")}</span>}</div>
    {/* 卡内操作：沿用原chip的主题、禁用和键盘状态，只有“一键启用”才提交，参数修改不会启动任务。 */}
    <div className={`${styles.upscaleAction} nodrag nopan`}><CanvasChip disabled={busy} onClick={onSubmit}>{t("canvas.upscaleEnable")}</CanvasChip></div>
  </section>;
}

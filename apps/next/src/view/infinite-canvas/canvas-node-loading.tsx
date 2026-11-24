"use client";

/** 真实请求存续期间显示卡内扫光，没有假进度，也不按动画时长猜测完成。 */
import { useTranslation } from "@/i18n";
import styles from "./canvas.module.css";

export function CanvasNodeLoading({ upscale, cancel }: { upscale: boolean; cancel: () => void }) {
  const { t } = useTranslation();
  return <div data-canvas-node-loading className={`${styles.nodeLoading} nodrag nopan`} role="status" aria-live="polite">
    <span>{t(upscale ? "canvas.upscaleRunning" : "canvas.taskRunning")}</span>
    <button type="button" className="hy-chip" onClick={cancel}>{t("canvas.cancel")}</button>
  </div>;
}

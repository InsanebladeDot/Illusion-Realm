"use client";

/** 查看工具只更改当前预览会话；实际宽高来自解码，大小来自原媒体登记，不使用卡片尺寸。 */
import { useState, type ReactNode } from "react";
import { Info, RefreshCw, RotateCw, RotateCcw, ZoomIn, ZoomOut, X } from "lucide-react";
import { useTranslation } from "@/i18n";
import { HoverTip } from "@/components/hover-tip";
import type { useNetworkView } from "./use-network-view";
import styles from "./canvas-network-preview.module.css";

export function PreviewButton({ label, children, onClick, disabled, pressed }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean; pressed?: boolean }) {
  return <HoverTip label={label}><button type="button" className="hy-icon-button hy-hover-grow" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>{children}</button></HoverTip>;
}

export function CanvasPreviewTools({ view, size, visual, onClose }: { view: Omit<ReturnType<typeof useNetworkView>, "viewport" | "pan" | "style">; size?: number; visual: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState(false);
  const dimensions = `${view.dimensions.width} × ${view.dimensions.height}`;
  return <header className={styles.tools} data-preview-chrome>
    {/* 预览顶部：左右独立胶囊；信息仅在主动打开时出现，名称保留给读屏。 */}
    <div className={styles.information}>
      <div className={styles.pill}><PreviewButton label={t("canvas.previewInfo")} pressed={info} onClick={() => setInfo(value => !value)}><Info size={16} /></PreviewButton><i /><PreviewButton label={t("canvas.previewReset")} onClick={view.reset}><RefreshCw size={16} /></PreviewButton></div>
      <output data-network-metadata className={styles.metadata} hidden={!info}><span>{t("canvas.previewResolution")}</span><b>{view.dimensions.width ? dimensions : "—"}</b><span>{t("canvas.previewFileSize")}</span><b>{size === undefined ? "—" : size < 1024 * 1024 ? `${(size / 1024).toFixed(2)} KB` : `${(size / 1024 / 1024).toFixed(2)} MB`}</b></output>
    </div>
    <div className={`${styles.pill} ${styles.zoom}`}>
      <PreviewButton label={t("components.imagePreviewOverlay.zoomIn")} disabled={!visual} onClick={() => view.changeZoom(view.zoom + .1)}><ZoomIn size={16} /></PreviewButton>
      <PreviewButton label={t("components.imagePreviewOverlay.zoomOut")} disabled={!visual} onClick={() => view.changeZoom(view.zoom - .1)}><ZoomOut size={16} /></PreviewButton><i />
      <output data-preview-zoom>{Math.round(view.zoom * 100)}%</output><input type="range" min={.1} max={4} step={.01} value={view.zoom} disabled={!visual} aria-label={t("canvas.previewZoom")} onChange={event => view.changeZoom(Number(event.currentTarget.value))} /><i />
      <PreviewButton label={t("canvas.previewClockwise")} disabled={!visual} onClick={() => view.rotate(90)}><RotateCw size={16} /></PreviewButton>
      <PreviewButton label={t("canvas.previewCounterclockwise")} disabled={!visual} onClick={() => view.rotate(-90)}><RotateCcw size={16} /></PreviewButton>
    </div>
    <div className={`${styles.pill} ${styles.close}`}><PreviewButton label={t("canvas.close")} onClick={onClose}><X size={18} /></PreviewButton></div>
  </header>;
}

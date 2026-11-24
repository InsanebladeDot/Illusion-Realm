"use client";

/** 两张原始媒体叠放，用裁切移动分界线；不移动图片、不重采样、不写工程历史。 */
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronsLeftRight } from "lucide-react";
import { useTranslation } from "@/i18n";
import { CanvasMediaPreview } from "./canvas-media";
import type { CanvasData } from "./canvas-model";
import { CanvasChip } from "./reference-ui/components";
import styles from "./canvas-image-compare.module.css";

interface Props { original?: CanvasData["media"]; result?: CanvasData["media"] }
type MediaStatus = "loading" | "ready" | "error";

export function CanvasImageCompare({ original, result }: Props) {
  const { t } = useTranslation();
  const [revision, setRevision] = useState(0);
  if (!original) return <div className={styles.empty} data-image-compare-empty>{t("canvas.compareHint")}</div>;
  // 换源与重试创建独立会话，旧图片的迟到事件不会解除新来源的等待状态。
  return <CompareSession key={`${original.path}:${result?.path ?? ""}:${revision}`} original={original} result={result} onRetry={() => setRevision(value => value + 1)} />;
}

function CompareSession({ original, result, onRetry }: Props & { onRetry: () => void }) {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  const grab = useRef<number | null>(null);
  const [originalReady, setOriginalReady] = useState(false);
  const [resultStatus, setResultStatus] = useState<MediaStatus>("loading");
  const [split, setSplit] = useState(50);
  const readOriginal = useCallback((status: MediaStatus) => setOriginalReady(status === "ready"), []);
  const ready = originalReady && resultStatus === "ready" && !!result;

  // 像拉开相框上的遮布，只改变左侧原图露出的比例；DOM实际宽度已包含画布缩放。
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (grab.current === null || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const bounds = root.current?.getBoundingClientRect();
    if (bounds?.width) setSplit(Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)));
  };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Tab") return;
    event.stopPropagation();
    if (event.key === "Escape" && grab.current !== null) { setSplit(grab.current); grab.current = null; }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    setSplit(value => event.key === "Home" ? 0 : event.key === "End" ? 100 : Math.max(0, Math.min(100, value + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 : 2))));
  };
  const cancel = () => { if (grab.current !== null) setSplit(grab.current); grab.current = null; };
  return <div ref={root} className={styles.compare} data-image-compare data-compare-ready={ready}>
    {/* 先读原图，再安装下层结果；两层共用原媒体组件的加载、超时、错误与主题规则。 */}
    {originalReady && result && <div className={styles.result}><CanvasMediaPreview media={result} selected fit="contain" onStatus={setResultStatus} /></div>}
    <div className={styles.original} style={{ clipPath: ready ? `inset(0 ${100 - split}% 0 0)` : undefined }}><CanvasMediaPreview media={original!} selected fit="contain" onStatus={readOriginal} /></div>
    <span className={styles.left}>{t("canvas.compareOriginal")}</span>
    {ready ? <><span className={styles.right}>{t("canvas.compareResult")}</span><button type="button" role="slider" className={`${styles.divider} nodrag nopan`} style={{ left: `${split}%` }} aria-label={t("canvas.compareDivider")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split)} onKeyDown={keyDown} onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); grab.current = split; event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={move} onPointerUp={event => { move(event); grab.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={cancel} onLostPointerCapture={cancel}><ChevronsLeftRight size={18} /></button></> : originalReady && <div className={`${styles.status} nodrag nopan`} role="status">{t(resultStatus === "error" ? "canvas.compareFailed" : "canvas.compareWaiting")}{resultStatus === "error" && <CanvasChip onClick={onRetry}>{t("canvas.retry")}</CanvasChip>}</div>}
  </div>;
}

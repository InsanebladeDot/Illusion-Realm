"use client";
/* eslint-disable @next/next/no-img-element -- 本地协议图片交给浏览器，静态导出没有图片优化服务器。 */

/** 节点网只读查看原工程；每次切换卸载旧播放器，底部缩略项不自动播放。 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import { ChevronLeft, ChevronRight, LocateFixed, FileText, Music, Video, Image as ImageIcon } from "lucide-react";
import { useTranslation } from "@/i18n";
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import { CanvasMediaPreview } from "./canvas-media";
import { CanvasCompareNode } from "./canvas-compare-node";
import { canvasNodeTitle } from "./canvas-media-name";
import { NODE_LABELS, type CanvasNode } from "./canvas-model";
import { HoverTip } from "@/components/hover-tip";
import { VideoFirstFrameCover } from "@/components/video-first-frame-cover";
import { CanvasPreviewTools, PreviewButton } from "./canvas-preview-tools";
import { useNetworkView } from "./use-network-view";
import styles from "./canvas-network-preview.module.css";

interface Props { nodes: CanvasNode[]; initialId: string; onClose: () => void; onLocate: (id: string) => void }

function NetworkThumbnail({ node, selected, onSelect }: { node: CanvasNode; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  const button = useRef<HTMLButtonElement>(null);
  const media = node.data.media;
  const imagePath = media?.kind === "image" ? media.path : node.data.scene?.previewPath;
  const Icon = media?.kind === "video" ? Video : media?.kind === "audio" ? Music : node.data.kind === "image" ? ImageIcon : FileText;
  useEffect(() => { if (selected) button.current?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [selected]);
  return <button ref={button} type="button" className={styles.thumbnail} aria-pressed={selected} aria-label={canvasNodeTitle(node.data) || t(NODE_LABELS[node.data.kind])} data-network-node={node.id} onClick={onSelect}>
    {imagePath ? <img src={buildLocalFileUrl(imagePath)!} loading="lazy" alt="" draggable={false} /> : media?.kind === "video" ? <VideoFirstFrameCover src={buildLocalFileUrl(media.path)!} fallback={<Icon size={24} />} /> : <Icon size={24} />}
    {selected && <span>{canvasNodeTitle(node.data) || t(NODE_LABELS[node.data.kind])}</span>}
  </button>;
}

function PreviewContent({ node, onClose }: { node: CanvasNode; onClose: () => void }) {
  const { t } = useTranslation();
  const media = node.data.media;
  const visual = node.data.mode === "compare" || !!node.data.scene?.previewPath || !!media && media.kind !== "audio";
  const { viewport: viewportRef, pan, style, ...view } = useNetworkView(visual);
  const { setDimensions } = view;
  const videoDimensions = useCallback((width: number, height: number) => setDimensions({ width, height }), [setDimensions]);
  // 尺寸取真正解码的元素；载入其他节点时由key重建，旧尺寸不会带到新资源。
  const measure = (event: SyntheticEvent) => {
    const element = event.target;
    if (element instanceof HTMLImageElement) view.setDimensions({ width: element.naturalWidth, height: element.naturalHeight });
    if (element instanceof HTMLVideoElement) videoDimensions(element.videoWidth, element.videoHeight);
  };
  // main：整个展示区含四周留白均唤出工具，footer与侧栏不在此范围内。
  return <section className={styles.stage} data-preview-view-area>
    <CanvasPreviewTools view={view} size={media?.size} visual={visual} onClose={onClose} />
    <div ref={viewportRef} className={styles.content} data-network-content={node.id} data-preview-dragging={view.dragging} onLoadCapture={measure} onLoadedMetadataCapture={measure} {...pan}>
      <div className={styles.surface} data-preview-surface style={visual ? style : undefined}>
        {node.data.mode === "compare" ? <CanvasCompareNode nodeId={node.id} /> : media ? <CanvasMediaPreview media={media} selected fit="contain" onDimensions={videoDimensions} /> : node.data.scene?.previewPath ? <img src={buildLocalFileUrl(node.data.scene.previewPath)!} alt={t("director.preview")} draggable={false} /> : <div className={styles.text}>{node.data.content || node.data.prompt || t("canvas.networkEmpty")}</div>}
      </div>
    </div>
  </section>;
}

export default function CanvasNetworkPreview({ nodes, initialId, onClose, onLocate }: Props) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  // 打开只读预览先让底层播放器交出话筒，避免网内预览和卡片同时响。
  useEffect(() => {
    host.current?.closest("[data-infinite-canvas]")?.dispatchEvent(new CustomEvent("canvas-media-play"));
    host.current?.querySelector("button")?.focus();
  }, []);
  const [selectedId, setSelectedId] = useState(initialId);
  const [hovered, setHovered] = useState(false);
  const index = Math.max(0, nodes.findIndex(node => node.id === selectedId));
  const node = nodes[index];
  // 切换会卸载旧播放器与工具；焦点随之丢失时接回查看区，Escape仍能关闭。
  useEffect(() => {
    if (host.current && !host.current.contains(document.activeElement)) host.current.focus();
  }, [node?.id]);
  const move = (offset: number) => setSelectedId(nodes[(index + offset + nodes.length) % nodes.length].id);
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === "Tab" || event.target instanceof Element && event.target.closest('[data-image-compare] [role="slider"]') && event.key !== "Escape") return;
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    if (event.target instanceof Element && event.target.closest("input,textarea,select")) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
  };
  if (!node) return null;
  return <div ref={host} tabIndex={-1} className={styles.preview} data-canvas-network-preview data-controls-visible={hovered} onPointerMove={event => setHovered(!!(event.target instanceof Element && event.target.closest("[data-preview-view-area],[data-preview-chrome]")))} onPointerLeave={() => setHovered(false)} onFocusCapture={event => { if (event.target.matches(":focus-visible")) setHovered(true); }} onKeyDownCapture={keyDown}>
    <span className={styles.srOnly}>{canvasNodeTitle(node.data) || t(NODE_LABELS[node.data.kind])}</span>
    <PreviewContent key={node.id + (node.data.media?.path ?? "")} node={node} onClose={onClose} />
    <footer className={styles.footer}><div className={styles.summary}>
      <span className={styles.pill} role="status">{t("canvas.networkCount", { current: index + 1, total: nodes.length })}</span>
      <div className={styles.pill} data-network-navigation>
        <PreviewButton disabled={nodes.length < 2} label={t("canvas.networkPrevious")} onClick={() => move(-1)}><ChevronLeft size={14} /></PreviewButton>
        <PreviewButton disabled={nodes.length < 2} label={t("canvas.networkNext")} onClick={() => move(1)}><ChevronRight size={14} /></PreviewButton><span>{t("canvas.networkSwitch")}</span>
      </div>
      <HoverTip label={t("canvas.networkLocate")}><button type="button" className={styles.pill + " hy-hover-grow"} onClick={() => onLocate(node.id)}><LocateFixed size={14} />{t("canvas.networkLocate")}</button></HoverTip>
    </div>
      <div className={styles.strip} aria-label={t("canvas.networkPreview")}><div className={styles.stripInner}>{nodes.map(item => <NetworkThumbnail key={item.id} node={item} selected={item.id === node.id} onSelect={() => setSelectedId(item.id)} />)}</div></div>
    </footer>
  </div>;
}

"use client";

/** 预览变换只作用于查看窗口，不写节点或文件；像转动相框，不改照片本身。 */
import { useEffect, useRef, useState, type RefObject, type Dispatch, type SetStateAction } from "react";
import { useImagePreviewPan } from "@/hooks/use-image-preview-pan";

export function useNetworkView(visual: boolean) {
  const { viewport, bounds } = useViewBounds();
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  useNetworkWheel(viewport, visual, setZoom);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const { dragging, stop, handlers: pan } = useImagePreviewPan({ offset, onOffsetChange: setOffset });
  const swapped = Math.abs(rotation / 90) % 2 === 1;
  const width = swapped ? dimensions.height : dimensions.width;
  const height = swapped ? dimensions.width : dimensions.height;
  const fit = width && height ? Math.min(bounds.width / width, bounds.height / height) : 1;
  const style = { width: dimensions.width ? dimensions.width * fit : "100%", height: dimensions.height ? dimensions.height * fit : "100%",
    transform: `translate(${offset.x}px,${offset.y}px) rotate(${rotation}deg) scale(${zoom})`, transition: dragging ? "none" : undefined };
  const reset = () => { stop(); setZoom(1); setRotation(0); setOffset({ x: 0, y: 0 }); };
  const changeZoom = (value: number) => setZoom(clampZoom(value));
  return { viewport, dimensions, setDimensions, zoom, changeZoom, rotation, rotate: (delta: number) => setRotation(value => value + delta), reset, style, dragging, pan };
}

function clampZoom(value: number) { return Math.max(.1, Math.min(4, value)); }

// 滚轮覆盖main展示区留白；原生非被动监听可阻止页面滚动，退出预览即移除。
function useNetworkWheel(viewport: RefObject<HTMLDivElement | null>, visual: boolean, setZoom: Dispatch<SetStateAction<number>>) {
  useEffect(() => {
    const area = viewport.current?.closest("[data-preview-view-area]");
    if (!area || !visual) return;
    const wheel = (event: Event) => {
      if (!(event instanceof WheelEvent) || !event.deltaY || event.target instanceof Element && event.target.closest("[data-preview-chrome],button,input,textarea,select,[data-canvas-media-control]")) return;
      event.preventDefault();
      event.stopPropagation();
      // 连续输入按上一次结果累加，不能让同一帧到达的多个滚轮事件互相覆盖。
      setZoom(current => clampZoom(Number((current + (event.deltaY < 0 ? .1 : -.1)).toFixed(2))));
    };
    area.addEventListener("wheel", wheel, { passive: false });
    return () => area.removeEventListener("wheel", wheel);
  }, [viewport, visual, setZoom]);
}

// 仅观察查看区，不监听整张画布；隐藏或卸载后释放尺寸观察器。
function useViewBounds() {
  const viewport = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 1, height: 1 });
  useEffect(() => {
    const target = viewport.current;
    if (!target) return;
    const measure = () => setBounds({ width: target.clientWidth, height: target.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  return { viewport, bounds };
}


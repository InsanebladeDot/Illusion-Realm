"use client";

// 界面：蒙版涂抹画布；坐标始终使用原图像素，缩放只作用于显示，窗口变窄不会移动笔迹。
import { useEffect, useRef, useState, type RefObject } from "react";
import { ReactSketchCanvas, type ReactSketchCanvasRef } from "react-sketch-canvas";
import type { MaskSource } from "@/utils/mask-image";

interface Props {
  source: MaskSource; sketchRef: RefObject<ReactSketchCanvasRef | null>;
  color: string; brush: number; onChange: () => void;
}
export function MaskSketchSurface({ source, sketchRef, color, brush, onChange }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(1);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const measure = () => setAvailable(node.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(node); measure();
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(available / source.width, 520 / source.height, 1);
  return <div ref={container} className="min-w-0 w-full overflow-hidden rounded-xl bg-muted/40 p-0">
    <div className="relative mx-auto overflow-hidden" style={{ width: source.width * scale, height: source.height * scale }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 本地原图与笔迹保持完全一致的像素坐标 */}
      <img src={source.url} alt={source.name} className="absolute inset-0 h-full w-full" />
      <div data-mask-surface className="absolute left-0 top-0 origin-top-left opacity-55"
        style={{ width: source.width, height: source.height, transform: `scale(${scale})` }}>
        <ReactSketchCanvas ref={sketchRef} id="mask-sketch" width={`${source.width}px`} height={`${source.height}px`}
          style={{ border: "none", borderRadius: 0 }} canvasColor="transparent" strokeColor={color}
          strokeWidth={brush} eraserWidth={brush} onChange={onChange} />
      </div>
    </div>
  </div>;
}

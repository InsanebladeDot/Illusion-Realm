"use client";

/** 视频资源只提取首帧作静态封面，列表和引用菜单共用，不自动播放。 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Film } from "lucide-react";
import { videoFirstFrame } from "@/utils/video-first-frame";

interface Props { src: string; alt?: string; className?: string; fallback?: ReactNode }

export function VideoFirstFrameCover({ src, alt = "", className, fallback }: Props) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [frame, setFrame] = useState<{ src: string; image?: string }>();
  // 像只给进店的顾客取货：进入可见区才读视频，不为整库同时开启解码。
  useEffect(() => {
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)));
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !src || frame?.src === src) return;
    const controller = new AbortController();
    // 换源、滚出列表或卸载立即释放旧读取，迟到的结果不覆盖新资源。
    void videoFirstFrame(src, controller.signal).then(image => {
      if (!controller.signal.aborted) setFrame({ src, image });
    });
    return () => controller.abort();
  }, [src, visible, frame?.src]);
  const image = frame?.src === src ? frame.image : undefined;
  return <span ref={host} data-video-cover className="flex h-full w-full items-center justify-center overflow-hidden">
    {/* 封面不写入工程或磁盘；加载失败保留原入口与类型提示。 */}
    {/* eslint-disable-next-line @next/next/no-img-element -- 浏览器提取的小图无需图片服务。 */}
    {image ? <img src={image} alt={alt} draggable={false} className={className ?? "h-full w-full object-cover"} /> : fallback ?? <Film className="h-5 w-5 text-muted-foreground" />}
  </span>;
}

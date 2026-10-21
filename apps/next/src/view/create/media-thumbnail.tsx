"use client";

// 界面：资源方形封面，导入网格和 @ 素材菜单共用；视频使用提取的首帧，音频显示图标。
import { Film, Image as ImageIcon, Music } from "lucide-react";
import type { PromptReferenceMedia } from "@/utils/prompt-media-references";
import { cn } from "@/utils/cn";

export function MediaThumbnail({ item, className }: { item: PromptReferenceMedia; className?: string }) {
  const Icon = item.kind === "video" ? Film : item.kind === "audio" ? Music : ImageIcon;
  const thumbnail = item.thumbnail ?? (item.kind === "image" ? item.src : undefined);
  return <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-muted-foreground", className)}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {thumbnail ? <img src={thumbnail} alt="" draggable={false} className="h-full w-full object-cover" /> : <Icon className="h-5 w-5" />}
  </span>;
}

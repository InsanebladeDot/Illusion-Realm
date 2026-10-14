"use client";

import { ChevronDown } from "lucide-react";
import { ResourceCoverImage } from "@/components/ResourceCoverImage";
import type { ImageAsset } from "@/types/common";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

interface ModelCoverSelectProps {
  name: string; cover: ImageAsset | string; label: string;
  onClick: () => void; disabled?: boolean; priority?: boolean;
}

/** 图片与视频共用的模型封面入口；没有封面时仍显示模型名，整张卡片可用键盘打开。 */
export function ModelCoverSelect({ name, cover, label, onClick, disabled, priority }: ModelCoverSelectProps) {
  return <button data-model-cover-select type="button" disabled={disabled} onClick={onClick} aria-label={`${label}: ${name}`} aria-haspopup="dialog" className={cn("relative isolate flex h-16 w-full cursor-pointer items-end overflow-hidden rounded-xl bg-muted p-2 text-left disabled:cursor-not-allowed disabled:opacity-50 sm:h-20 md:h-[72px] md:p-3", THIN_BORDER_CLASS)}>
    {/* 界面：「模型」封面卡片，图片和视频使用相同样式 */}
    {cover && <ResourceCoverImage cover={cover} alt={name} fill sizes="(max-width: 768px) 100vw, 50vw" className="absolute inset-0 -z-10 h-full w-full object-cover" priority={priority} />}
    {cover && <div className="absolute inset-0 -z-10 bg-gradient-to-t from-gray-900/70 via-gray-900/50 to-gray-900/10 sm:from-gray-900/60 sm:via-gray-900/40 sm:to-gray-900/0" />}
    <div className={cn("flex w-full min-w-0 flex-col pr-7", cover ? "text-white" : "text-foreground")}><span className="text-xs font-semibold sm:text-sm">{label}</span><span className="truncate text-base font-semibold leading-tight sm:text-lg sm:leading-6" title={name}>{name}</span></div>
    <ChevronDown className={cn("pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2", cover ? "text-white drop-shadow" : "text-muted-foreground")} />
  </button>;
}

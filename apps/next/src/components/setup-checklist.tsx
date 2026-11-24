"use client";
import { HoverTip } from "@/components/hover-tip";


/** 顶栏清单只管理展开和看图；正文从 Markdown 读取，下载与文件检查交给原服务。 */
import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ListChecks } from "lucide-react";
import { useTranslation } from "@/i18n";
import { WindowTaskPanel } from "./window-task-panel";
import { ImagePreviewOverlay } from "./ImagePreviewOverlay";
import { useSetupChecklistStore } from "@/stores/use-setup-checklist-store";

// Markdown 阅读器按需加载，未打开清单时不让顶栏加载代码高亮等阅读依赖。
const SetupChecklistPanel = dynamic(() => import("./setup-checklist-panel"));

export function SetupChecklist({ onOpenDownloads }: { onOpenDownloads: () => void }) {
  const { t } = useTranslation();
  const anchor = useRef<HTMLButtonElement>(null);
  const open = useSetupChecklistStore(state => state.open);
  const setOpen = useSetupChecklistStore(state => state.setOpen);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  // 路由切换可能重建标题栏，入口开关留在原会话 store，图片预览属于当前浮窗。
  const close = useCallback(() => setOpen(false), [setOpen]);
  // 看图只暂停清单，不卸载正文；返回时原生 details 和滚动条都停在原来的位置。
  const preview = (src: string) => setPreviewSrc(src);
  const closePreview = (value: boolean) => { if (!value) setPreviewSrc(null); };
  return <>
    {/* head：任务清单复用下载中心的浮窗、主题和退出方式。 */}
    <HoverTip asChild layer="window" label={(t("components.setupChecklist.title")) ?? ""}><button ref={anchor} type="button" data-window-checklist aria-label={t("components.setupChecklist.title")} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? "window-setup-checklist" : undefined} onClick={() => setOpen(value => !value)} className="window-caption-action flex h-full w-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-foreground/5 sm:w-[46px]"><ListChecks size={17} aria-hidden /></button></HoverTip>
    {open && <WindowTaskPanel id="window-setup-checklist" title={t("components.setupChecklist.title")} description={t("components.setupChecklist.description")} anchor={anchor} onClose={close} suspended={!!previewSrc} expanded={expanded} expandLabel={t(expanded ? "components.setupChecklist.collapse" : "components.setupChecklist.expand")} onToggleExpand={() => setExpanded(value => !value)}>
      <SetupChecklistPanel onClose={close} onPreview={preview} onOpenDownloads={() => { close(); onOpenDownloads(); }} />
    </WindowTaskPanel>}
    {previewSrc && <ImagePreviewOverlay items={[{ key: previewSrc, src: previewSrc }]} index={0} open onOpenChange={closePreview} />}
  </>;
}

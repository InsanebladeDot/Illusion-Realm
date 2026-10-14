"use client";

import { useCallback, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { Download, Images, type LucideIcon } from "lucide-react";
import { AppLogo } from "@/assets/AppLogo";
import { ModelDownloadList } from "@/components/model-download-list";
import { WindowTaskPanel } from "@/components/window-task-panel";
import { GenerationTaskList } from "@/components/generation-task-list";
import { useGenerationTaskStore, isGenerationTaskActive } from "@/stores/useGenerationTaskStore";
import { useModelDownloadStore } from "@/stores/useModelDownloadStore";
import { useTranslation } from "@/i18n";
import { subscribeWindowChrome, windowChromeVisible } from "@/utils/window-chrome";

interface CenterProps { anchor: RefObject<HTMLButtonElement | null>; onClose: () => void }
function DownloadCenter({ anchor, onClose }: CenterProps) {
  const { t } = useTranslation();
  const tasks = useModelDownloadStore((state) => state.tasks);
  const active = tasks.filter((task) => ["downloading", "saving"].includes(task.status)).length;
  return <WindowTaskPanel id="window-download-center" title={t("toolBox.civitai.transfer.centerTitle")} description={t("toolBox.civitai.transfer.tasks", { count: active })} anchor={anchor} onClose={onClose}>
    {tasks.length ? <ModelDownloadList className="min-h-0 overflow-y-auto p-3" /> : <div className="flex flex-col items-center gap-3 px-4 py-10 text-xs text-muted-foreground"><Download size={28} aria-hidden="true" />{t("toolBox.civitai.transfer.empty")}</div>}
  </WindowTaskPanel>;
}
interface CaptionActionProps { anchor: RefObject<HTMLButtonElement | null>; kind: "download" | "generation"; label: string; count: number; open: boolean; onClick: () => void; Icon: LucideIcon }
function CaptionAction({ anchor, kind, label, count, open, onClick, Icon }: CaptionActionProps) {
  return <button ref={anchor} type="button" {...{ [`data-window-${kind}`]: true }} aria-label={label} title={label} aria-expanded={open} aria-controls={`window-${kind}-center`} aria-haspopup="dialog" onClick={onClick} className={`window-caption-action relative flex h-full w-[46px] shrink-0 items-center justify-center hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-stroke ${count ? "text-foreground" : "text-muted-foreground"}`}><Icon size={17} aria-hidden="true" />{count > 0 && <span {...{ [`data-window-${kind}-count`]: true }} className="absolute right-1 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent-fill px-0.5 text-[9px] font-medium leading-none text-accent-fill-foreground">{count}</span>}</button>;
}
function noWindowChrome() { return false; }
export function WindowTitlebar() {
  const { t } = useTranslation();
  const visible = useSyncExternalStore(subscribeWindowChrome, windowChromeVisible, noWindowChrome);
  const tasks = useModelDownloadStore((state) => state.tasks);
  const active = tasks.filter((task) => ["downloading", "saving"].includes(task.status)).length;
  const generationTasks = useGenerationTaskStore((state) => state.tasks);
  const generationActive = generationTasks.filter(isGenerationTaskActive).length;
  const [open, setOpen] = useState<"download" | "generation" | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const generationAnchor = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(null), []);
  if (!visible) return null;
  return <><header data-window-titlebar className="window-titlebar flex select-none items-center justify-between bg-muted text-foreground"><div className="flex min-w-0 items-center gap-2 pl-3"><AppLogo className="h-4 w-4 rounded-sm" /><span className="truncate text-xs">Illusion Realm</span></div>
    {/* 界面：原生最小化按钮左侧的生成任务与下载进度入口 */}
    <div className="flex h-full shrink-0"><CaptionAction anchor={generationAnchor} kind="generation" label={t("create.generationTasks.title")} count={generationActive} open={open === "generation"} onClick={() => setOpen((value) => value === "generation" ? null : "generation")} Icon={Images} /><CaptionAction anchor={anchor} kind="download" label={t("toolBox.civitai.transfer.openCenter")} count={active} open={open === "download"} onClick={() => setOpen((value) => value === "download" ? null : "download")} Icon={Download} /></div>
  </header>{open === "download" && <DownloadCenter anchor={anchor} onClose={close} />}{open === "generation" && <WindowTaskPanel id="window-generation-center" title={t("create.generationTasks.title")} description={t("create.generationTasks.active", { count: generationActive })} anchor={generationAnchor} onClose={close}><GenerationTaskList onClose={close} /></WindowTaskPanel>}</>;
}

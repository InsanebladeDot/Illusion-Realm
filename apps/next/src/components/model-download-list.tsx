"use client";

import { useState } from "react";
import { FileDown, LoaderCircle, X } from "lucide-react";
import type { ModelDownloadTask } from "@illusion-realm/shared";
import { useTranslation } from "@/i18n";
import { performDownloadAction, useModelDownloadStore } from "@/stores/useModelDownloadStore";
import { downloadErrorMessage } from "@/utils/model-downloads";
import { downloadBytes, downloadRemainingSeconds } from "@/utils/model-download-progress";

function DownloadSummary({ task }: { task: ModelDownloadTask }) {
  const { t } = useTranslation();
  if (task.status !== "downloading") return <>{t(`toolBox.civitai.transfer.status.${task.status}`)}{task.status === "cancelled" && ` · ${t("toolBox.civitai.transfer.progressKept")}`}</>;
  const seconds = downloadRemainingSeconds(task);
  const remaining = seconds === null ? t("toolBox.civitai.transfer.estimating") : seconds >= 60
    ? t("toolBox.civitai.transfer.remainingMinutes", { count: Math.ceil(seconds / 60) })
    : t("toolBox.civitai.transfer.remainingSeconds", { count: seconds });
  return <>{t("toolBox.civitai.transfer.progress", {
    speed: downloadBytes(task.bytesPerSecond ?? 0), received: downloadBytes(task.received),
    total: task.total ? downloadBytes(task.total) : t("toolBox.civitai.transfer.unknownTotal"), remaining,
  })}</>;
}

function DownloadTask({ task }: { task: ModelDownloadTask }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const progress = task.total > 0 ? Math.min(100, task.received / task.total * 100) : 0;
  const retry = task.status === "cancelled" || task.status === "failed";
  const removeLabel = t(task.status === "completed" || task.status === "saving" ? "toolBox.civitai.transfer.dismiss" : "toolBox.civitai.transfer.remove");
  const act = async (action: "cancel" | "retry" | "remove") => {
    setBusy(true);
    try { await performDownloadAction(task.id, action); } finally { setBusy(false); }
  };
  return <li className="grid grid-cols-[20px_minmax(0,1fr)_auto] gap-x-2 rounded-lg px-2 py-2.5 hover:bg-muted/50" data-model-download-task={task.id} data-download-status={task.status}>
    <FileDown size={18} className="mt-0.5 text-muted-foreground" aria-hidden="true" />
    <p className="min-w-0 truncate text-xs font-medium leading-5 text-foreground" title={task.fileName}>{task.fileName}</p>
    <button type="button" data-download-remove disabled={busy} aria-label={removeLabel} title={removeLabel} onClick={() => { void act("remove"); }} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><X size={14} /></button>
    <div className="col-start-2 min-w-0"><p className="text-[10px] leading-5 tabular-nums text-muted-foreground"><DownloadSummary task={task} /></p>
      <progress aria-label={task.fileName} value={task.total ? progress : undefined} max={100} className="block h-1 w-full overflow-hidden rounded-full accent-sky-500 [&::-webkit-progress-bar]:bg-border [&::-webkit-progress-value]:bg-sky-500" />
      {task.error && <p role="alert" className="mt-1 text-[10px] text-red-600 dark:text-red-400">{downloadErrorMessage(task.error)}</p>}
      {task.logoWarning && <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">{t("toolBox.civitai.transfer.logoWarning")}</p>}
    </div>
    <div className="col-start-3 row-start-2 self-center pl-1">{busy ? <LoaderCircle size={14} className="animate-spin text-muted-foreground" aria-label={t("common.loading")} /> : (retry || task.status === "downloading") && <button type="button" {...{ [retry ? "data-download-retry" : "data-download-cancel"]: true }} onClick={() => { void act(retry ? "retry" : "cancel"); }} title={retry ? t("toolBox.civitai.transfer.retryHint") : t("toolBox.civitai.transfer.cancelHint")} className="rounded px-1 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground">{retry ? t("toolBox.civitai.retry") : t("common.cancel")}</button>}</div>
  </li>;
}

export function ModelDownloadList({ className = "" }: { className?: string }) {
  const tasks = useModelDownloadStore((state) => state.tasks);
  return <ul className={`divide-y divide-border/60 ${className}`} data-model-download-list>{[...tasks].reverse().map((task) => <DownloadTask key={task.id} task={task} />)}</ul>;
}

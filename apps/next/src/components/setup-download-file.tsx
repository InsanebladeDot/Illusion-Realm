"use client";
/** 清单逐文件显示真实队列状态；磁盘是否已安装仍只认主进程的 SHA256 核对。 */
import type { ModelDownloadTask, SetupCheckStatus, SetupDownloadItem } from "@illusion-realm/shared";
import { useTranslation } from "@/i18n";
import { downloadErrorMessage } from "@/utils/model-downloads";
import { DownloadProgress, DownloadSummary } from "./model-download-list";
import { downloadBytes } from "@/utils/model-download-progress";
import { Link2 } from "lucide-react";
import { useState } from "react";
import { HoverTip } from "./hover-tip";
import { useToastStore } from "@/stores/useToastStore";

interface DownloadFileProps {
  asset: { id: string; sourceFileName: string; relativePath: string; downloadUrl: string; expectedBytes: number };
  root: string;
  item?: SetupDownloadItem;
  automatic?: boolean;
  task?: ModelDownloadTask;
  status?: SetupCheckStatus;
  busy?: boolean;
  onDownload?: () => void;
  onVerify: () => void;
}

export function SetupDownloadFile({ asset, root, item, status, task, automatic, busy, onDownload, onVerify }: DownloadFileProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const inQueue = task?.queued || task?.status === "downloading" || task?.status === "saving";
  const error = item?.status === "failed" && status !== "ready" ? item.error : task?.error;
  const action = status === "found" ? "verify" : "download";
  // 悬停链接按用户要求复制地址；文件名只在点击时复制路径，避免浏览清单就覆盖剪贴板。
  const copy = async (url: boolean) => {
    try {
      if (!url && !root) throw new Error('configuration');
      await navigator.clipboard.writeText(url ? asset.downloadUrl : `${root.replace(/[/\\]+$/, '')}/${asset.relativePath}`);
      if (url) setCopied(true);
      useToastStore.getState().show(t(url ? 'components.setupChecklist.copiedLink' : 'components.setupChecklist.copiedDestination'), 'success');
    } catch { useToastStore.getState().show(t(!url && !root ? 'components.setupChecklist.chooseToCopy' : 'components.setupChecklist.copyFailed'), 'error'); }
  };
  return <li data-setup-file={asset.id} className="space-y-1.5 py-2.5">
    <div className="flex min-w-0 items-start gap-1.5">
      <HoverTip asChild label={t('components.setupChecklist.copyDestination')}><button type="button" data-setup-copy-path={asset.id} onClick={() => { void copy(false); }} className="min-w-0 flex-1 wrap-anywhere text-left font-medium text-foreground hover:text-accent-text">{asset.sourceFileName}</button></HoverTip>
      <span className="shrink-0 pt-0.5 tabular-nums text-muted-foreground">{downloadBytes(asset.expectedBytes)}</span>
      <HoverTip asChild label={t(copied ? 'components.setupChecklist.copiedLink' : 'components.setupChecklist.copyDownloadLink')}><button type="button" data-setup-copy-link={asset.id} aria-label={t('components.setupChecklist.copyDownloadLink')} onPointerEnter={() => { void copy(true); }} onPointerLeave={() => setCopied(false)} onClick={() => { void copy(true); }} className="flex size-6 shrink-0 items-center justify-center hover:text-accent-text"><Link2 size={13} /></button></HoverTip>
      {status === "ready" ? <span data-setup-ready className="shrink-0 px-1 py-0.5 font-medium text-foreground">{t("components.setupChecklist.ready")}</span>
        : action === "verify" || automatic ? <button type="button"
          data-setup-verify-file={action === "verify" ? asset.id : undefined}
          data-setup-download-file={action === "download" ? asset.id : undefined}
          disabled={!root || busy || inQueue || !status || status === "unavailable"}
          onClick={action === "verify" ? onVerify : onDownload} className="shrink-0 px-1 py-0.5 text-accent-text disabled:opacity-40">
          {t(action === "verify" ? "components.setupChecklist.verifyFile" : "components.setupChecklist.downloadFile")}
        </button> : <a data-setup-download-source={asset.id} href={asset.downloadUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 px-1 py-0.5 text-accent-text">{t("components.setupChecklist.downloadFile")}</a>}
    </div>
    <code data-setup-download-path={asset.id} className="block wrap-anywhere text-[11px] text-muted-foreground">{asset.relativePath}</code>
    <p data-setup-download-result={item?.status} data-setup-file-status={task?.queued ? "queued" : status ?? "unchecked"} className="wrap-anywhere text-muted-foreground">
      {status === "ready" ? t("components.setupChecklist.result.present")
        : inQueue && task ? <DownloadSummary task={task} />
          : status === "mismatch" ? t("components.setupChecklist.hashMismatch")
            : status === "unavailable" ? t("components.setupChecklist.verifyUnavailable")
              : error ? error === "exists" ? t("components.setupChecklist.fileConflict") : downloadErrorMessage(error)
                : status === "found" ? t("components.setupChecklist.installedFile")
                  : status === "missing" ? t("components.setupChecklist.fileMissing") : t("components.setupChecklist.unchecked")}
    </p>
    {task?.status === "downloading" && !task.queued && <DownloadProgress task={task} />}
  </li>;
}

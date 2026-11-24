"use client";

/** 左栏切换工作流，右栏共用文件清单、下载服务和手动图文。 */
import { useState } from "react";
import { Download, FolderOpen, ShieldCheck } from "lucide-react";
import { useSetupChecklistStore } from "@/stores/use-setup-checklist-store";
import catalog from "@illusion-realm/shared/src/data/setup-downloads.json";
import type { SetupCheckStatus, SetupDownloadId, SetupDownloadItem } from "@illusion-realm/shared";
import type { Components } from "react-markdown";
import type { SetupGuideDocument } from "@/utils/setup-guide-markdown";
import { useTranslation } from "@/i18n";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useModelDownloadStore } from "@/stores/useModelDownloadStore";
import { useSetupDownloads } from "@/hooks/use-setup-downloads";
import { useSetupChecks } from "@/hooks/use-setup-checks";
import { downloadBytes } from "@/utils/model-download-progress";
import { findSetupFileTask } from "@/utils/setup-file-status";
import { SetupDownloadFile } from "./setup-download-file";
import { MarkdownResponse } from "./MarkdownResponse";

type Group = (typeof catalog.groups)[number];
const ALL_IDS = [...new Set(catalog.groups.flatMap(group => group.files))] as SetupDownloadId[];
const CONTROL = "inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 hover:bg-muted disabled:opacity-50";

interface RowData {
  asset: (typeof catalog.files)[number];
  item?: SetupDownloadItem;
  status?: SetupCheckStatus;
  task: ReturnType<typeof findSetupFileTask>;
}

interface PanelProps {
  guides: SetupGuideDocument[];
  guideLoading: boolean;
  guideFailed: boolean;
  retryGuide: () => void;
  components: Components;
  onOpenDownloads: () => void;
}

// 这里只汇总已确认的文件和队列状态。未检查过的文件可能已在磁盘上，大小只报上限。
function summarizeRows(rows: RowData[]) {
  let complete = 0, bytes = 0, active = 0, queued = 0;
  for (const { asset, status, task } of rows) {
    if (status === "ready") complete++;
    else if (task?.queued) queued++;
    else if (task?.status === "downloading" || task?.status === "saving") active++;
    else bytes += asset.expectedBytes;
  }
  return { complete, bytes, active, queued };
}

function guideTitle(group: Group, guides: SetupGuideDocument[]) {
  return guides.find(guide => guide.id === group.id)?.title ?? group.id;
}

function ManualGuide({ guide, components }: { guide?: SetupGuideDocument; components: Components }) {
  if (!guide) return null;
  const markdown = [guide.introduction, ...guide.steps.map(step => `### ${step.title}\n\n${step.markdown}`)].join("\n\n");
  return <div data-setup-manual-guide>
    <MarkdownResponse markdown={markdown} components={components} className="text-xs leading-5" />
  </div>;
}

function DownloadFeedback({ download, root }: { download: ReturnType<typeof useSetupDownloads>; root: string }) {
  const { t } = useTranslation();
  const result = download.root === root ? download.result : null;
  return <>
    {result && <p data-setup-download-summary role="status" className="leading-5 text-muted-foreground">{t("components.setupChecklist.summary", {
      total: result.items.length, added: result.items.filter(item => item.status === "added").length,
      existing: result.items.filter(item => item.status === "existing").length,
      present: result.items.filter(item => item.status === "present").length,
      failed: result.items.filter(item => item.status === "failed").length,
    })}</p>}
    {download.error && <p role="alert" className="text-destructive">{download.error}</p>}
  </>;
}

export function SetupDownloadPanel({ guides, guideLoading, guideFailed, retryGuide, components, onOpenDownloads }: PanelProps) {
  const { t } = useTranslation();
  const groupId = useSetupChecklistStore(state => state.group);
  const setGroupId = useSetupChecklistStore(state => state.selectGroup);
  const [mode, setMode] = useState<"manual" | "automatic">("automatic");
  const root = useSettingsStore(state => state.paths.searchPath);
  const tasks = useModelDownloadStore(state => state.tasks);
  const download = useSetupDownloads();
  const checks = useSetupChecks(root, ALL_IDS, download.result);
  const items = download.root === root ? download.files : [];
  const group = catalog.groups.find(entry => entry.id === groupId) ?? catalog.groups[0];
  // 共享文件用同一个编号。切换组时，两个 MiniMax 工作流看到的是同一条下载任务。
  const byId = new Map(catalog.files.map(asset => [asset.id, {
    asset, item: items.find(item => item.id === asset.id), status: checks.files[asset.id]?.status, task: findSetupFileTask(root, asset.relativePath, tasks),
  }]));
  const groupRows = (entry: Group) => entry.files.flatMap(id => byId.get(id) ?? []);
  const rows = groupRows(group);
  const summary = summarizeRows(rows);
  const all = summarizeRows([...byId.values()]);
  const automatic = mode === "automatic";
  const busy = download.busy || checks.verifying;
  const buttonDisabled = !root || busy;
  return <section data-setup-documents data-setup-automatic={automatic || undefined} className="setup-checklist-layout flex min-h-0 flex-1 flex-col text-xs">
    {/* 清单工具栏：目录沿用设置里的 models 路径，右侧直接打开同一个下载队列。 */}
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t("components.setupChecklist.modelsFolder")}</p>
        <p data-setup-models-path className="mt-0.5 wrap-anywhere text-muted-foreground">{root || t("components.setupChecklist.selectFirst")}</p>
      </div>
      <button type="button" data-setup-select-models disabled={busy} onClick={() => { void download.act(); }} className={CONTROL}><FolderOpen size={14} />{t("components.setupChecklist.chooseModels")}</button>
      <button type="button" data-setup-verify-all disabled={buttonDisabled} onClick={() => { void checks.verify(ALL_IDS); }} className={CONTROL}>
        <ShieldCheck size={14} />{t(checks.verifying ? "components.setupChecklist.verifying" : "components.setupChecklist.verifyAll")}
      </button>
      <button type="button" data-setup-open-queue onClick={onOpenDownloads} className={CONTROL}><Download size={14} />{t("toolBox.civitai.transfer.centerTitle")}</button>
    </div>
    <div className="setup-checklist-columns min-h-0 flex-1">
      {/* 左栏滚动与右栏阅读分开，窄窗时改成顶部工作流条。 */}
      <nav aria-label={t("components.setupChecklist.workflows")} className="setup-checklist-nav min-w-0 p-2">
        {catalog.groups.map(entry => <button key={entry.id} type="button" data-setup-group={entry.id}
          aria-pressed={entry.id === group.id} onClick={() => setGroupId(entry.id)}
          className="flex min-w-0 items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left hover:bg-muted/60 aria-pressed:bg-accent-soft aria-pressed:text-accent-text">
          <span className="font-medium">{guideTitle(entry, guides)}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{summarizeRows(groupRows(entry)).complete}/{entry.files.length}</span>
        </button>)}
      </nav>
      {/* 右栏：换工作流回到顶部，看大图返回仍停在原阅读位置。 */}
      <section key={group.id} data-setup-guide={group.id} data-setup-detail className="min-h-0 min-w-0 space-y-3 overflow-y-auto px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{guideTitle(group, guides)}</h3>
            <p className="mt-1 text-muted-foreground" data-setup-group-summary>
              {t("components.setupChecklist.groupProgress", { present: summary.complete, total: rows.length })}
              {summary.bytes > 0 && ` · ${t("components.setupChecklist.checkSize", { size: downloadBytes(summary.bytes) })}`}
            </p>
          </div>
          {automatic && <button type="button" data-setup-download-group={group.id} disabled={buttonDisabled}
            onClick={() => { void download.act(group.files); }} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-50">
            <Download size={14} />{t(download.busy ? "components.setupChecklist.adding" : "components.setupChecklist.downloadGroup")}
          </button>}
        </div>
        <div className="flex gap-4 border-b border-border" role="group" aria-label={t("components.setupChecklist.title")}>
          {(["automatic", "manual"] as const).map(value => <button key={value} type="button" data-setup-mode={value}
            aria-pressed={mode === value} onClick={() => setMode(value)}
            className="border-b-2 border-transparent pb-2 text-muted-foreground hover:text-foreground aria-pressed:border-accent-stroke aria-pressed:text-accent-text">
            {t(value === "automatic" ? "components.setupChecklist.fileList" : "components.setupChecklist.manualSteps")}
          </button>)}
        </div>
        {guideLoading && !automatic && <p role="status" className="text-muted-foreground">{t("components.setupChecklist.loading")}</p>}
        {guideFailed && !automatic && <div role="alert" className="space-y-2"><p>{t("components.setupChecklist.failed")}</p><button type="button" onClick={retryGuide} className={CONTROL}>{t("components.setupChecklist.retry")}</button></div>}
        <ul className="divide-y divide-border">{rows.map(({ asset, item, status, task }) => <SetupDownloadFile key={asset.id}
          asset={asset} root={root} item={item} status={status} task={task} automatic={automatic} busy={busy}
          onVerify={() => { void checks.verify([asset.id]); }}
          onDownload={() => { void download.act([asset.id]); }} />)}</ul>
        {checks.error && <p role="alert" className="text-destructive">{checks.error}</p>}
        {automatic ? <>
          {(summary.active > 0 || summary.queued > 0) && <p role="status" data-setup-queue-summary className="text-muted-foreground">
            {t("components.setupChecklist.queueSummary", { active: summary.active, queued: summary.queued })}
          </p>}
          <DownloadFeedback download={download} root={root} />
          <details className="rounded-md border border-border px-3 py-2">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t("components.setupChecklist.allGroups")}</summary>
            <p className="my-2 text-muted-foreground">{t("components.setupChecklist.allSize", { count: ALL_IDS.length, size: downloadBytes(all.bytes) })}</p>
            <button type="button" data-setup-download-all disabled={buttonDisabled} className={CONTROL} onClick={() => { void download.act(ALL_IDS); }}>
              {t("components.setupChecklist.downloadAll")}
            </button>
          </details>
        </> : <ManualGuide guide={guides.find(entry => entry.id === group.id)} components={components} />}
      </section>
    </div>
  </section>;
}

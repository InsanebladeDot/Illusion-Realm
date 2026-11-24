"use client";
import { HoverTip } from "@/components/hover-tip";

/** 在线库只增加离线摘要入口；弹窗仍用已有资源外壳，不复制补全资料的联网流程。 */
import { useState } from "react";
import { ScanSearch } from "lucide-react";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { useTranslation } from "@/i18n";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useLocalModelHashBatch } from "@/hooks/use-local-model-hash-batch";

export function LocalModelHashButton() {
  const { t } = useTranslation();
  const models = useSettingsStore(state => state.models);
  const scanning = useSettingsStore(state => state.scanning);
  const [open, setOpen] = useState(false);
  const batch = useLocalModelHashBatch();
  const done = batch.items.filter(item => item.status !== "waiting" && item.status !== "running").length;
  function close(value: boolean) { if (!value) batch.stop(); setOpen(value); }
  return <>
    {/* 在线页头：点击先查看范围，确认开始才读取权重。 */}
    <HoverTip asChild layer="window" label={(t("toolBox.civitai.hashLocalHint")) ?? ""}><button type="button" data-civitai-hash-local onClick={() => setOpen(true)} disabled={scanning || !models.length} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"><ScanSearch size={13} />{t("toolBox.civitai.hashLocal")}</button></HoverTip>
    <ResourceDialogShell open={open} onOpenChange={close} title={t("toolBox.civitai.hashLocal")} titleId="local-model-hash-title" description={t("toolBox.civitai.hashLocalHint")} footer={<div className="flex items-center gap-3 text-xs"><span role="status">{done} / {batch.items.length}</span><button type="button" data-civitai-hash-start disabled={batch.running || scanning || !models.length} onClick={() => { void batch.run(); }} className="rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">{t("toolBox.civitai.hashStart")}</button><button type="button" disabled={!batch.running} onClick={batch.stop} className="px-3 py-2 disabled:opacity-50">{t("toolBox.civitai.hashStop")}</button></div>}>
      {/* 摘要结果：每个文件单独显示进度和原因，不把跳过算成重新计算。 */}
      {batch.failed && <p role="alert">{t("toolBox.civitai.hashFailed")}</p>}
      <ul className="space-y-2">{batch.items.map((item, index) => <li key={index} data-civitai-hash-result={item.status} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs"><HoverTip asChild layer="window" label={(item.label) ?? ""}><span className="min-w-0 truncate">{item.label}</span></HoverTip><span className="shrink-0 text-muted-foreground">{t(`toolBox.civitai.hashStatus.${item.status}`)}</span></li>)}</ul>
    </ResourceDialogShell>
  </>;
}

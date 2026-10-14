"use client";
import { isMinimaxWorkflow } from "@/data/videoForm";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, RefreshCw, Settings2 } from "lucide-react";
import { SimpleSelect } from "@/components/SimpleSelect";
import { useTranslation } from "@/i18n";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { fetchComfyModelLists } from "@/api/comfyui";
import type { ComfyModelLists } from "@/types/comfy";
import { getVideoWorkflowTemplate } from "@/utils/comfy/videoWorkflow";
import { getVideoModelNames, getVideoModelSlots, type VideoModelOverrides, type VideoModelSlot } from "@/utils/comfy/video-workflow-models";

interface SettingsProps { workflowId: string; overrides: VideoModelOverrides; onChange: (value: VideoModelOverrides) => void; onReset: () => void; disabled: boolean }
function useVideoModelLists() {
  const server = useSettingsStore((state) => state.comfyServerUrl);
  const [snapshot, setSnapshot] = useState<{ server: string; lists: ComfyModelLists | null; error: boolean } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [request, setRequest] = useState<{ server: string; refresh: number } | null>(null);
  useEffect(() => {
    let active = true;
    fetchComfyModelLists(server, true).then((lists) => { if (active) setSnapshot({ server, lists, error: !Array.isArray(lists.diffusionModels) || !Array.isArray(lists.clips) || !Array.isArray(lists.vaes) }); })
      .catch(() => { if (active) setSnapshot({ server, lists: null, error: true }); })
      .finally(() => { if (active) setRequest({ server, refresh }); });
    return () => { active = false; };
  }, [server, refresh]);
  return { lists: snapshot?.server === server ? snapshot.lists : null, error: snapshot?.server === server && snapshot.error, loading: request?.server !== server || request.refresh !== refresh, reload: () => setRefresh((value) => value + 1) };
}
function VideoModelSlotSelect({ slot, overrides, lists, onChange, minimax }: { slot: VideoModelSlot; overrides: VideoModelOverrides; lists: ComfyModelLists | null; onChange: (value: VideoModelOverrides) => void; minimax: boolean }) {
  const { t } = useTranslation();
  const models = useSettingsStore((state) => state.models);
  const paths = useSettingsStore((state) => state.paths);
  const names = getVideoModelNames(slot, models, paths, lists, minimax ? "minimax" : undefined);
  const value = overrides[slot.id] || "";
  const options = [{ value: "", label: t("create.videoModels.default", { name: slot.defaultName }) }, ...[...new Set([...(value ? [value] : []), ...names])].map((name) => ({ value: name, label: name }))];
  function select(name: string) {
    const next = { ...overrides };
    if (name) next[slot.id] = name; else delete next[slot.id];
    onChange(next);
  }
  return <div data-video-model-slot={slot.id} className="flex min-w-0 items-center gap-2"><span title={t(slot.label)} className="w-20 shrink-0 whitespace-nowrap text-xs font-medium">{slot.category === "clips" ? "CLIP" : t(slot.label)} {slot.position}</span>
    <SimpleSelect value={value} options={options} onChange={select} ariaLabel={`${t(slot.label)}${slot.position ? ` ${slot.position}` : ""}`} portal className="min-w-0 flex-1" triggerClassName="text-xs" />
  </div>;
}
function VideoModelSettingsBody(props: SettingsProps) {
  const { t } = useTranslation();
  const remote = useVideoModelLists();
  const slots = useMemo(() => getVideoModelSlots(getVideoWorkflowTemplate(props.workflowId)), [props.workflowId]);
  return <fieldset disabled={props.disabled} className="min-w-0 space-y-3 rounded-lg border border-border bg-background p-3" data-video-model-settings>
    <p className="text-xs leading-relaxed text-muted-foreground">{t("create.videoModels.hint")}</p>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><button type="button" onClick={props.onReset} className="rounded-md border border-border px-2 py-1.5 hover:bg-muted">{t("create.videoModels.reset")}</button><button type="button" disabled={remote.loading} data-video-model-refresh onClick={remote.reload} className="flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-muted disabled:opacity-50"><RefreshCw size={12} className={remote.loading ? "animate-spin" : ""} />{t("create.videoModels.refresh")}</button></div>
    {remote.loading && <p role="status" className="text-xs text-muted-foreground">{t("common.loading")}</p>}
    {remote.error && <p role="alert" className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">{t("create.videoModels.listFailed")}</p>}
    {slots.filter((slot) => !isMinimaxWorkflow(props.workflowId) || slot.category === "clips" || slot.category === "vaes").map((slot) => <VideoModelSlotSelect key={slot.id} slot={slot} overrides={props.overrides} lists={remote.lists} onChange={props.onChange} minimax={isMinimaxWorkflow(props.workflowId)} />)}
  </fieldset>;
}
export function VideoModelSettings(props: SettingsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return <section className="space-y-2 px-2 py-2 sm:px-3" data-video-model-section>
    {/* 界面：「模型加载设置」默认收起，展开才加载可选模型清单 */}
    <button type="button" data-video-model-toggle disabled={props.disabled} aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded-md px-1 py-2 text-xs text-muted-foreground hover:bg-muted"><Settings2 size={14} /><span>{t("create.videoModels.title")}</span><ChevronDown size={14} className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`} /></button>
    {open && <VideoModelSettingsBody {...props} />}
  </section>;
}

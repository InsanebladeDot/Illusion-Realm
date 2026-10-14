"use client";

/** In-memory download snapshots survive tool navigation; revisions prevent stale IPC replies overwriting progress. */
import { create } from "zustand";
import type { ModelDownloadTask } from "@illusion-realm/shared";
import { t } from "@/i18n";
import { modelDownloadApi, downloadErrorMessage } from "@/utils/model-downloads";
import { unwrapIpc } from "@/utils/ipcResult";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { invalidateLocalImageSrc } from "@/utils/localImageSrcCache";

interface DownloadState { tasks: ModelDownloadTask[]; revisions: Record<string, number>; update: (task: ModelDownloadTask) => void }
export const useModelDownloadStore = create<DownloadState>((set) => ({
  tasks: [],
  revisions: {},
  update: (task) => set((state) => {
    if ((state.revisions[task.id] ?? -1) >= task.revision) return state;
    const remaining = state.tasks.filter((item) => item.id !== task.id);
    return { tasks: task.status === "removed" ? remaining : [...remaining, task], revisions: { ...state.revisions, [task.id]: task.revision } };
  }),
}));
function waitForModelScan(): Promise<void> {
  if (!useSettingsStore.getState().scanning) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const unsubscribe = useSettingsStore.subscribe((state) => { if (!state.scanning) { clearTimeout(timer); unsubscribe(); resolve(); } });
    const timer = setTimeout(() => { unsubscribe(); reject(new Error("io")); }, 30000);
  });
}
async function refreshCompleted(task: ModelDownloadTask) {
  try {
    const existing = useSettingsStore.getState().models.find((model) => model.filePath === task.folderPath);
    if (existing?.iconPath) await invalidateLocalImageSrc(existing.iconPath);
    await waitForModelScan();
    await useSettingsStore.getState().scanAllModels();
  } catch { useToastStore.getState().show(t("toolBox.civitai.scanFailed"), "error"); }
}
function receiveTask(task: ModelDownloadTask) {
  if ((useModelDownloadStore.getState().revisions[task.id] ?? -1) >= task.revision) return;
  const previous = useModelDownloadStore.getState().tasks.find((item) => item.id === task.id);
  useModelDownloadStore.getState().update(task);
  if (task.status === "removed") { void refreshCompleted(task); return; }
  if (task.status === "completed" && previous?.status !== "completed") {
    useToastStore.getState().show(t("toolBox.civitai.transfer.completed", { name: task.fileName }), "success");
    void refreshCompleted(task);
  } else if (task.status === "failed" && previous?.status !== "failed") {
    useToastStore.getState().show(downloadErrorMessage(task.error), "error");
  }
}
export function subscribeModelDownloads(): () => void {
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  if (!api?.onModelDownloadProgress) return () => undefined;
  let active = true;
  const unsubscribe = api.onModelDownloadProgress(receiveTask);
  api.listModelDownloads().then((result) => { if (active) unwrapIpc(result).forEach(receiveTask); }).catch(() => undefined);
  return () => { active = false; unsubscribe(); };
}
export async function performDownloadAction(id: string, action: "cancel" | "retry" | "remove"): Promise<void> {
  try {
    const api = modelDownloadApi();
    if (action === "retry") receiveTask(unwrapIpc(await api.retryModelDownload(id)));
    else if (action === "remove") unwrapIpc(await api.removeModelDownload(id));
    else unwrapIpc(await api.cancelModelDownload(id));
  } catch (error) { useToastStore.getState().show(downloadErrorMessage(error), "error"); }
}

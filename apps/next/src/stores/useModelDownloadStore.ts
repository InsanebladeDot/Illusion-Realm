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
    // 下载列表像固定座位：进度只换座位上的内容，不让任务重新排队。
    // 以前先删再追加，界面倒序后就会把刚更新的任务顶到最前面。
    // 这里按稳定编号原位替换，速度、已收字节和剩余时间仍会更新。
    // 暂停、失败、重试和完成也复用原位置，不按状态临时分组。
    // 已知编号只出现一次，因此一次快照不会产生两个任务行。
    // 从未见过的编号才追加，保留现有“新任务显示在顶部”的规则。
    // 恢复历史时沿用主进程的清单顺序，不增加第二套排序时间字段。
    // 删除仍使用 remaining，真正移除该行而不是留下空白占位。
    // 上方 revision 校验继续拒绝旧事件，已删除任务不会被旧快照复活。
    // 数组及变更对象保持新引用，Zustand 订阅仍能通知界面刷新。
    const tasks = state.tasks.some((item) => item.id === task.id)
      ? state.tasks.map((item) => item.id === task.id ? task : item) : [...state.tasks, task];
    return { tasks: task.status === "removed" ? remaining : tasks, revisions: { ...state.revisions, [task.id]: task.revision } };
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
// progress事件表示本次运行中新发生的状态，初始磁盘快照只是恢复已有历史。
// 两者共用revision合并，但恢复快照不能反复弹出完成通知或触发逐任务扫描。
// notify默认开启，现有preload事件回调不需要改变参数或通道契约。
function receiveTask(task: ModelDownloadTask, notify = true) {
  if ((useModelDownloadStore.getState().revisions[task.id] ?? -1) >= task.revision) return;
  const previous = useModelDownloadStore.getState().tasks.find((item) => item.id === task.id);
  useModelDownloadStore.getState().update(task);
  // 重启读取先恢复全部任务，完成记录保持可见，但不当作刚完成的新下载。
  // 新的completed进度事件仍走下方通知与模型扫描，实际功能不会被历史去重吞掉。
  // 较旧快照已由上方revision检查拒绝，不会覆盖同时收到的更新进度。
  if (!notify) return;
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
  // 列表可能包含跨进程保留的完成记录，只补回状态，不播放旧任务完成提示。
  // 订阅先于列表请求，恢复期间的新事件继续由正常receiveTask处理。
  // 卸载后拒绝异步列表回填，保留原有active生命周期约束。
  api.listModelDownloads().then((result) => { if (active) unwrapIpc(result).forEach(task => receiveTask(task, false)); }).catch(() => undefined);
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

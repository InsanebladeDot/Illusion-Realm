/**
 * 图片生成队列：提交时冻结参数、模型路径和输出目录，按 FIFO 执行并独立保存状态。
 * 队列由模块持有，页面卸载不取消；普通失败继续，断连/停止未确认时终止待执行任务。
 */
import { cancelComfyGeneration, generateWithComfy, revokeComfyImages } from "@/api/comfyui";
import { t } from "@/i18n";
import { DEFAULT_FOLDER_ID } from "@/data/historyFolders";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { getSelectedFolderDirPath, useHistoryFolderStore } from "@/stores/useHistoryFolderStore";
import { useGenerationNoticeStore } from "@/stores/useGenerationNoticeStore";
import { useGenerationTaskStore } from "@/stores/useGenerationTaskStore";
import type { SettingsPaths } from "@/types/settings";
import type { ComfyGenerateResult } from "@/types/comfy";
import { buildImagePrompt, type ImageWorkflowParams } from "@/utils/comfy/imageWorkflow";
import { resolveImageWorkflowParams } from "@/utils/comfy/resolveComfyModels";
import { buildGeneratedImageMeta } from "@/utils/buildGeneratedImageMeta";
import { isPathWithinOutputRoot, resolveSaveOutputPath } from "@/utils/generatedImages";
import { resolveEffectiveOutputPath } from "@/utils/electronBridge";
import { saveGeneratedImagesToDisk } from "@/utils/saveGeneratedImages";
import { IpcCallError } from "@/utils/ipcResult";

export interface ImageGenerationResult { promptId: string; savedPaths: string[] }
interface Snapshot {
  params: ImageWorkflowParams;
  server: string;
  paths: SettingsPaths;
  outputPath: string;
  folderPath: string | null;
  fixed: boolean;
  folderId: string;
}
interface Job {
  id: string;
  controller: AbortController;
  run: () => Promise<void>;
  reject: (error: unknown) => void;
}
const pending: Job[] = [];
const jobs = new Map<string, Job>();
let draining = false;

function cancelledError() { return new DOMException(t("create.generationTasks.cancelled"), "AbortError"); }
function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? error.code : undefined;
}
function taskError(error: unknown) {
  const code = errorCode(error);
  if (code === "COMFY_DISCONNECTED") return t("create.generationTasks.disconnected");
  if (code === "COMFY_STOP_FAILED") return t("create.generationTasks.stopFailed");
  if (code === "COMFY_TIMEOUT") return t("create.generationTasks.timeout");
  if (code === "COMFY_EXECUTION_FAILED") return t("create.generationTasks.executionFailed");
  return error instanceof Error ? error.message : t("create.page.generateFailed");
}
function cancelPending(message?: string) {
  for (const job of pending.splice(0)) {
    job.controller.abort(cancelledError());
    useGenerationTaskStore.getState().update(job.id, { status: "cancelled", error: message ?? null });
    jobs.delete(job.id);
    job.reject(cancelledError());
  }
}

/** 排队任务直接撤回；运行任务等待主进程确认远端停止，保存中的图片保留。 */
export async function cancelImageGeneration(id: string): Promise<void> {
  const job = jobs.get(id);
  if (!job || job.controller.signal.aborted) return;
  const index = pending.indexOf(job);
  job.controller.abort(cancelledError());
  if (index >= 0) {
    pending.splice(index, 1);
    jobs.delete(id);
    useGenerationTaskStore.getState().update(id, { status: "cancelled", error: null });
    job.reject(cancelledError());
    return;
  }
  useGenerationTaskStore.getState().update(id, { status: "cancelling" });
  try { await cancelComfyGeneration(id); }
  catch (error) {
    cancelPending(t("create.generationTasks.queueStopped"));
    useGenerationTaskStore.getState().update(id, { error: taskError(error) });
    throw new Error(taskError(error));
  }
}

export async function cancelAllImageGeneration(): Promise<void> {
  cancelPending();
  for (const id of jobs.keys()) await cancelImageGeneration(id);
}

function snapshot(params: ImageWorkflowParams): Snapshot {
  const settings = useSettingsStore.getState();
  const history = useHistoryFolderStore.getState();
  const fixed = history.outputMode === "fixed";
  return {
    params: structuredClone(params), server: settings.comfyServerUrl,
    paths: structuredClone(settings.paths), outputPath: settings.outputPath, fixed,
    folderPath: fixed ? history.fixedOutputPath : getSelectedFolderDirPath(history.selectedFolderId),
    folderId: history.selectedFolderId,
  };
}
async function saveTarget(input: Snapshot) {
  const root = await resolveEffectiveOutputPath(input.outputPath);
  const folderPath = input.fixed && (!root || !isPathWithinOutputRoot(root, input.folderPath ?? ""))
    ? null : input.folderPath;
  return { path: resolveSaveOutputPath(root ?? input.outputPath, folderPath), folderId: folderPath ?? DEFAULT_FOLDER_ID };
}
async function generateImage(id: string, params: ImageWorkflowParams, input: Snapshot, path: string, signal: AbortSignal) {
  const update = useGenerationTaskStore.getState().update;
  const prompt = buildImagePrompt(params.series ?? "anima", params);
  update(id, { status: "generating" });
  signal.throwIfAborted();
  const result = await generateWithComfy(prompt, { serverAddress: input.server, requestId: id });
  try {
    signal.throwIfAborted();
    if (!result.images.length) throw new Error(t("create.page.generateFailed"));
    update(id, { status: "saving" });
    const savedPaths = await saveGeneratedImagesToDisk(result.images, result.promptId, path,
      buildGeneratedImageMeta({ promptId: result.promptId, params, workflow: prompt, generationKind: "text2img", sourceImagePath: null }));
    if (!savedPaths.length) throw new Error(t("create.page.saveFailed"));
    return { ...result, savedPaths };
  } catch (error) {
    revokeComfyImages(result.images);
    throw error;
  }
}
function updatePreview(id: string, result: ComfyGenerateResult) {
  const store = useGenerationTaskStore.getState();
  const previous = store.tasks.find((task) => task.id === id)?.previewUrl;
  if (previous) URL.revokeObjectURL(previous);
  revokeComfyImages(result.images.slice(1));
  store.update(id, { previewUrl: result.images[0]?.objectUrl ?? null });
}
async function execute(id: string, input: Snapshot, count: number, signal: AbortSignal): Promise<ImageGenerationResult> {
  const update = useGenerationTaskStore.getState().update;
  update(id, { status: "generating" });
  useGenerationNoticeStore.getState().start();
  const target = await saveTarget(input);
  update(id, { folderId: target.folderId });
  const base = await resolveImageWorkflowParams(input.params, input.server, input.paths);
  let promptId = "";
  const savedPaths: string[] = [];
  for (let index = 0; index < count; index++) {
    signal.throwIfAborted();
    const params = { ...base, seed: index === 0 ? base.seed : Math.floor(Math.random() * 4_294_967_295) };
    const result = await generateImage(id, params, input, target.path, signal);
    promptId = result.promptId;
    savedPaths.push(...result.savedPaths);
    updatePreview(id, result);
    update(id, { completed: index + 1, savedPaths: [...savedPaths] });
    useHistoryFolderStore.getState().refreshGeneratedImages();
  }
  signal.throwIfAborted();
  update(id, { status: "completed" });
  useGenerationNoticeStore.getState().succeed({ filePath: savedPaths[0] ?? null, folderId: target.folderId });
  return { promptId, savedPaths };
}
async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try { while (pending.length) await pending.shift()!.run(); }
  finally { draining = false; }
}
export function enqueueImageGeneration(params: ImageWorkflowParams, count = 1): Promise<ImageGenerationResult> {
  const input = snapshot(params);
  const id = crypto.randomUUID();
  const total = Math.max(1, Math.min(4, Math.trunc(count) || 1));
  useGenerationTaskStore.getState().add({ id, status: "queued", prompt: params.positivePrompt ?? "",
    model: params.checkpointName ?? params.series ?? "Anima", width: params.width ?? 0, height: params.height ?? 0,
    total, completed: 0, createdAt: Date.now(), previewUrl: null, savedPaths: [], folderId: input.folderId, error: null });
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const job = { id, controller, reject, run: async () => {
      try { resolve(await execute(id, input, total, controller.signal)); }
      catch (error) { reject(finishFailure(job, error)); }
      finally { jobs.delete(id); }
    } };
    jobs.set(id, job);
    pending.push(job);
    void drain().catch(reject);
  });
}

function finishFailure(job: Job, error: unknown): unknown {
  const code = errorCode(error);
  const cancelled = code === "COMFY_CANCELLED" || (error instanceof DOMException && error.name === "AbortError");
  useGenerationTaskStore.getState().update(job.id, { status: cancelled ? "cancelled" : "failed", error: cancelled ? null : taskError(error) });
  if (cancelled) useGenerationNoticeStore.getState().dismiss();
  else useGenerationNoticeStore.getState().fail();
  if (["COMFY_DISCONNECTED", "COMFY_STOP_FAILED", "COMFY_TIMEOUT"].includes(String(code))) {
    cancelPending(t("create.generationTasks.queueStopped"));
  }
  return cancelled ? cancelledError() : new IpcCallError(taskError(error), typeof code === "string" ? code : undefined);
}

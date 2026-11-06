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
// 文生图与文字改图共享同一任务身份，卡片无需维护另一套取消入口。
// 类型只描述可展示的提交快照；File 与执行闭包留在模块队列中。
// 队列不是页面组件的子状态，因此路由卸载不会销毁执行中的任务。
import { useGenerationTaskStore, type GenerationTask } from "@/stores/useGenerationTaskStore";
import type { SettingsPaths } from "@/types/settings";
import type { ComfyGenerateResult } from "@/types/comfy";
import { buildImagePrompt, type ImageWorkflowParams } from "@/utils/comfy/imageWorkflow";
import { resolveImageWorkflowParams } from "@/utils/comfy/resolveComfyModels";
import { buildGeneratedImageMeta } from "@/utils/buildGeneratedImageMeta";
import { isPathWithinOutputRoot, resolveSaveOutputPath } from "@/utils/generatedImages";
import { resolveEffectiveOutputPath } from "@/utils/electronBridge";
import { saveGeneratedImagesToDisk } from "@/utils/saveGeneratedImages";
import { IpcCallError } from "@/utils/ipcResult";
// 统计读取最终节点，解析后的子目录和默认模型都能保留。
// 不从界面显示名、扫描数量或图片提示词反推使用过哪些模型。
import { generationModelsFromPrompt } from "@/utils/generation-statistics";

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
  // 上传和检查阶段尚未提交远端任务，不能对其他客户端发送全局 interrupt。
  // 普通图片任务沿用原取消路径；编辑任务用阶段回调明确是否需要远端停止。
  // 此函数每次取消时读取，不能在入队时冻结为 false。
  remote?: () => boolean;
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
  // 保存已进入文件副作用阶段，停止不能承诺回滚已经写入的图片。
  // 卡片与表单统一经过此边界，避免表单禁用而全局入口仍可误取消。
  // 请求保留到保存自然结束，后续任务也不能抢先占用当前队列槽。
  if (useGenerationTaskStore.getState().tasks.find((task) => task.id === id)?.status === "saving") return;
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
  // 本地检查或上传不可撤回，但 AbortSignal 会阻止它们继续提交生成。
  // 不提前删除 jobs：等待旧异步返回，严格保持一个运行槽。
  // 排队撤回分支在此之前结束，不会进入远端停止接口。
  if (job.remote && !job.remote()) return;
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

// 导出同一快照入口供编辑适配器使用，避免等待期间重新读取服务器或目标目录。
// structuredClone 断开 LoRA 与设置对象引用，后续改设置只作用于下一次提交。
// 默认路径仍在执行时经安全 IPC 解析，但传入的用户选择已在提交时固定。
export function snapshotGeneration(params: ImageWorkflowParams): Snapshot {
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
// 两种工作流共用固定目录的范围校验与自由目录规则。
// 调用者负责在等待返回后检查 signal，避免取消后继续上传或生成。
// 返回的 folderId 同时用于任务“查看”入口与完成通知，不能借用当前浏览目录。
export async function generationSaveTarget(input: Snapshot) {
  const root = await resolveEffectiveOutputPath(input.outputPath);
  const folderPath = input.fixed && (!root || !isPathWithinOutputRoot(root, input.folderPath ?? ""))
    ? null : input.folderPath;
  return { path: resolveSaveOutputPath(root ?? input.outputPath, folderPath), folderId: folderPath ?? DEFAULT_FOLDER_ID };
}
async function generateImage(id: string, params: ImageWorkflowParams, input: Snapshot, path: string, signal: AbortSignal) {
  const update = useGenerationTaskStore.getState().update;
  const prompt = buildImagePrompt(params.series ?? "anima", params);
  // 先冻结本次实际图的模型身份，成功保存后的张数才用于汇总。
  // 每轮种子变化不改变模型，重复快照不会重复增加模型使用次数。
  // 节点执行失败仍能保留任务失败记录，但零张结果不会增加使用占比。
  update(id, { models: generationModelsFromPrompt(prompt) });
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
// 每轮预览绑定该轮实际保存的第一张图，不用原名猜保存时改名后的路径。
// 批量任务的 savedPaths 会累计，不能把上一轮路径误配给当前 URL。
// URL 所有权仍留在任务队列，图库合并不能提前回收正在显示的预览。
function updatePreview(id: string, result: ComfyGenerateResult, previewFilePath: string | null) {
  const store = useGenerationTaskStore.getState();
  const previous = store.tasks.find((task) => task.id === id)?.previewUrl;
  if (previous) URL.revokeObjectURL(previous);
  revokeComfyImages(result.images.slice(1));
  // 同次状态更新关联 URL 与文件身份，避免界面读到新图配旧路径。
  // 其他输出仍回收临时地址，保存文件不会因为不作预览而丢失。
  // 未保存路径保持 null，调用方不能据此删除任何磁盘图片。
  store.update(id, { previewUrl: result.images[0]?.objectUrl ?? null, previewFilePath });
}
async function execute(id: string, input: Snapshot, count: number, signal: AbortSignal): Promise<ImageGenerationResult> {
  const update = useGenerationTaskStore.getState().update;
  update(id, { status: "generating" });
  useGenerationNoticeStore.getState().start();
  // 只解析提交时的目标；切换图库不会改变当前任务落盘位置。
  // 与文字编辑共用这一路径规则，避免同一队列的任务行为不一致。
  // 目录解析失败由统一失败分支记录，不能报告生成成功。
  const target = await generationSaveTarget(input);
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
    // 取当前结果而非累计数组，多个任务或多张输出都不会配错身份。
    // 路径已经由保存 IPC 确认，刷新磁盘列表前即可用于去重。
    // 后续保存数量与进度更新继续沿用原顺序，不改任务调度。
    updatePreview(id, result, result.savedPaths[0] ?? null);
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
  // 普通生成保留原有参数冻结、批量种子与保存逻辑，只共用调度入口。
  // 编辑任务也进入 pending，因此两种模式不会各自同时提交到 ComfyUI。
  // 任务 ID 由调度器统一产生，并一路传给生成、停止和卡片。
  const input = snapshotGeneration(params);
  const total = Math.max(1, Math.min(4, Math.trunc(count) || 1));
  return enqueueGenerationTask({ prompt: params.positivePrompt ?? "",
    model: params.checkpointName ?? params.series ?? "Anima", width: params.width ?? 0, height: params.height ?? 0,
    total, folderId: input.folderId }, (id, signal) => execute(id, input, total, signal)).promise;
}

/**
 * 共用 FIFO 入口：每个模式只提供快照摘要和实际执行器。
 * 同步返回 id，让页面离开前即可关联全局卡片；promise 负责最终结果。
 * 任务先写 store 再入 pending，点击后即使等待前一任务也能看到“排队中”。
 * 所有执行器共用一个 drain，不能在模式适配器内部另开循环。
 * 失败统一更新卡片和通知；断线、超时与停止未确认会终止剩余队列。
 * 撤回排队任务通过 reject 回传，不运行执行器，也不上传源文件。
 * jobs 的生命周期覆盖异步收尾，不能因页面卸载释放正在使用的 File。
 * 调用者必须消费 promise 的拒绝，避免取消变成未处理异常。
 */
// mediaKind 是可选展示信息，原图片执行器无需补字段即可继续使用。
// 音频也进入这个 pending，不能与图片编辑分别建立第二个调度器。
// 类型只接受音频/图片标记，不把 File、Blob 或远端路径暴露到卡片摘要。
export function enqueueGenerationTask<T>(task: Pick<GenerationTask, "prompt" | "model" | "width" | "height" | "total" | "folderId" | "mediaKind">, executeTask: (id: string, signal: AbortSignal) => Promise<T>, remote?: () => boolean) {
  // ID 不含提示词、文件路径等用户数据，适合作为跨进程停止标识。
  // 剩余展示字段由队列补齐，模式调用者不能误把新任务标成已完成。
  // completed 从零开始，只有实际保存后才由执行器增加。
  const id = crypto.randomUUID();
  useGenerationTaskStore.getState().add({ ...task, id, status: "queued", completed: 0, createdAt: Date.now(), previewUrl: null, savedPaths: [], error: null });
  // Promise 仅负责完成回传，不作为调度所有者；调用页面离开后 run 仍由 pending 引用。
  const promise = new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    // controller 一次一份，撤回旧任务不能中断以后创建的新任务。
    // run 自己消费异常，某个普通失败不会让 drain 丢掉后续排队任务。
    // finally 无论是否保存成功都解除 jobs 引用，避免永久持有源文件。
    const job = { id, controller, reject, remote, run: async () => {
      try { resolve(await executeTask(id, controller.signal)); }
      catch (error) { reject(finishFailure(job, error)); }
      finally { jobs.delete(id); }
    } };
    jobs.set(id, job);
    pending.push(job);
    void drain().catch(reject);
  });
  // 返回普通对象而不是让组件持有调度器，页面只需保留 id 和展示状态。
  // drain 的存活时间独立于调用方是否仍在渲染。
  // promise 仍是可等待的最终完成信号，兼容原图片生成调用者。
  return { id, promise };
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

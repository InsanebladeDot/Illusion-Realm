/**
 * 图片生成队列：提交时冻结参数、模型路径和输出目录，按 FIFO 执行并独立保存状态。
 * 队列由模块持有，页面卸载不取消；单个任务失败后继续执行后续任务。
 */
import { generateWithComfy, revokeComfyImages } from "@/api/comfyui";
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
const pending: Array<() => Promise<void>> = [];
let draining = false;

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
async function generateImage(id: string, params: ImageWorkflowParams, input: Snapshot, path: string) {
  const update = useGenerationTaskStore.getState().update;
  const prompt = buildImagePrompt(params.series ?? "anima", params);
  update(id, { status: "generating" });
  const result = await generateWithComfy(prompt, { serverAddress: input.server });
  try {
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
async function execute(id: string, input: Snapshot, count: number): Promise<ImageGenerationResult> {
  const update = useGenerationTaskStore.getState().update;
  update(id, { status: "generating" });
  useGenerationNoticeStore.getState().start();
  const target = await saveTarget(input);
  update(id, { folderId: target.folderId });
  const base = await resolveImageWorkflowParams(input.params, input.server, input.paths);
  let promptId = "";
  const savedPaths: string[] = [];
  for (let index = 0; index < count; index++) {
    const params = { ...base, seed: index === 0 ? base.seed : Math.floor(Math.random() * 4_294_967_295) };
    const result = await generateImage(id, params, input, target.path);
    promptId = result.promptId;
    savedPaths.push(...result.savedPaths);
    updatePreview(id, result);
    update(id, { completed: index + 1, savedPaths: [...savedPaths] });
    useHistoryFolderStore.getState().refreshGeneratedImages();
  }
  update(id, { status: "completed" });
  useGenerationNoticeStore.getState().succeed({ filePath: savedPaths[0] ?? null, folderId: target.folderId });
  return { promptId, savedPaths };
}
async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try { while (pending.length) await pending.shift()!(); }
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
    pending.push(async () => {
      try { resolve(await execute(id, input, total)); }
      catch (error) {
        useGenerationTaskStore.getState().update(id, { status: "failed", error: error instanceof Error ? error.message : t("create.page.generateFailed") });
        useGenerationNoticeStore.getState().fail();
        reject(error);
      }
    });
    void drain().catch(reject);
  });
}

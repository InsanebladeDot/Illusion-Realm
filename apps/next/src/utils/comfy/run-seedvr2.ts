/** 超分沿用生成传输、Meta 与落盘器；调用方必须持有共享队列槽，避免两套模型同时推理。 */
import { freeComfyMemory, generateWithComfy, uploadImageToComfy, revokeComfyImages } from "@/api/comfyui";
import { saveGeneratedImagesToDisk } from "@/utils/saveGeneratedImages";
import { buildGeneratedImageMeta } from "@/utils/buildGeneratedImageMeta";
import { useGenerationTaskStore } from "@/stores/useGenerationTaskStore";
import { generationModelsFromPrompt } from "@/utils/generation-statistics";
import { buildSeedvr2Prompt, type UpscaleSettings } from "./seedvr2-workflow";
import { resolveVideoPromptModels } from "./resolve-video-models";
import { IpcCallError } from "@/utils/ipcResult";
import { t } from "@/i18n";
import type { ComfyGenerateResult } from "@/types/comfy";
import { useHistoryFolderStore } from "@/stores/useHistoryFolderStore";

export interface UpscaleSession { modelAttention?: import("@/types/model-attention").ModelAttentionSettings; id: string; server: string; output: string; signal: AbortSignal }
export { runSeedvr2Video } from "./run-seedvr2-video";

/** /free 只确认接受卸载请求；随后 prompt 排在其后，由 Comfy 执行器完成实际卸载。 */
async function prepare(file: File, kind: "image" | "video", value: UpscaleSettings, session: UpscaleSession) {
  session.signal.throwIfAborted();
  const prompt = buildSeedvr2Prompt(file.name, kind, value);
  // 复用现有加载器匹配，服务端斜杠和目录可不同；不会自动下载或替换另一款模型。
  await resolveVideoPromptModels(prompt, session.server);
  session.signal.throwIfAborted();
  const uploaded = await uploadImageToComfy(file, session.server);
  session.signal.throwIfAborted();
  prompt[kind === "video" ? "source-video" : "1"].inputs[kind === "video" ? "file" : "image"] = [uploaded.subfolder, uploaded.name].filter(Boolean).join("/");
  await freeComfyMemory(session.server);
  session.signal.throwIfAborted();
  const store = useGenerationTaskStore.getState();
  // 同一张任务单经过两套模型，合并真实加载记录，不让超分抹掉基础模型的使用事实。
  const models = [...store.tasks.find(task => task.id === session.id)?.models ?? [], ...generationModelsFromPrompt(prompt)];
  store.update(session.id, { status: "generating", models: [...new Map(models.map(model => [JSON.stringify(model), model])).values()] });
  return prompt;
}

export async function runSeedvr2Image(file: File, value: UpscaleSettings, session: UpscaleSession) {
  const prompt = await prepare(file, "image", value, session);
  const result = await generateWithComfy(prompt, { serverAddress: session.server, requestId: session.id, modelAttention: session.modelAttention });
  try {
    session.signal.throwIfAborted();
    if (!result.images.length) throw Error(t("canvas.upscaleNoResult"));
    useGenerationTaskStore.getState().update(session.id, { status: "saving" });
    const savedPaths = await saveGeneratedImagesToDisk(result.images, result.promptId, session.output,
      buildGeneratedImageMeta({ promptId: result.promptId, params: {}, workflow: prompt, generationKind: "img2img" }), "upscale");
    if (!savedPaths.length) throw Error(t("create.page.saveFailed"));
    return { ...result, savedPaths };
  } catch (error) { revokeComfyImages(result.images); throw error; }
}

/** 原图先落盘，像保留底片再冲大照片；第二次请求失败也不会丢失第一次生成的成果。 */
export async function upscaleGeneratedImages(result: ComfyGenerateResult & { savedPaths: string[] }, value: UpscaleSettings | undefined, session: UpscaleSession) {
  if (!value?.enabled) return result;
  useGenerationTaskStore.getState().update(session.id, { status: "generating", savedPaths: result.savedPaths, previewFilePath: result.savedPaths[0] ?? null });
  useHistoryFolderStore.getState().refreshGeneratedImages();
  const images: ComfyGenerateResult["images"] = [], savedPaths: string[] = [];
  let promptId = result.promptId;
  try {
    for (const image of result.images) {
      session.signal.throwIfAborted();
      const next = await runSeedvr2Image(new File([image.blob], image.filename, { type: image.blob.type }), value, session);
      images.push(...next.images); savedPaths.push(...next.savedPaths); promptId = next.promptId;
      useGenerationTaskStore.getState().update(session.id, { status: "generating", savedPaths: [...result.savedPaths, ...savedPaths] });
    }
    revokeComfyImages(result.images);
    return { images, savedPaths, promptId };
  } catch (error) {
    revokeComfyImages(images);
    // 取消保留原错误码；真正的超分故障解释原图去向，不能报告整次生成成功。
    if (session.signal.aborted) throw error;
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
    throw new IpcCallError(t("canvas.upscaleFailedOriginal"), code);
  }
}

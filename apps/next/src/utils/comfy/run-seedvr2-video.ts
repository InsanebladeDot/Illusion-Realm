/** 视频按所选批帧数串行请求；只保存最终成片到工程，分段与中间结果都由本次临时会话回收。 */
import { freeComfyMemory, generateVideoWithComfy, uploadImageToComfy, revokeComfyVideos } from "@/api/comfyui";
import { saveVideosToDisk } from "@/utils/save-generated-videos";
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import { unwrapIpc } from "@/utils/ipcResult";
import { t } from "@/i18n";
import { useGenerationTaskStore } from "@/stores/useGenerationTaskStore";
import { generationModelsFromPrompt } from "@/utils/generation-statistics";
import type { VideoUpscaleBatch, VideoUpscalePrepared, VideoUpscaleRequest } from "@/schemas/video-upscale.schema";
import { buildSeedvr2Prompt, seedvr2VideoBatch, resolveUpscaleSettings, upscaleSeed, type UpscaleSettings } from "./seedvr2-workflow";
import { resolveVideoPromptModels } from "./resolve-video-models";
import type { ComfyApiPrompt } from "@/types/comfy";
import type { UpscaleSession } from "./run-seedvr2";

async function localVideo(payload: VideoUpscaleRequest) {
  if (!window.electronAPI?.videoUpscale) throw Error(t("canvas.upscaleVideoUnavailable"));
  return unwrapIpc(await window.electronAPI.videoUpscale(payload));
}

/** 完整原视频只上传一次；所有串行请求引用同一个服务端文件。 */
async function uploadSource(path: string, session: UpscaleSession) {
  session.signal.throwIfAborted();
  const response = await fetch(buildLocalFileUrl(path)!, { signal: session.signal });
  if (!response.ok) throw Error(t("canvas.upscaleSource"));
  // 会话名隔离不同任务；同一任务共享源文件，允许服务端复用完整解码结果。
  const file = new File([await response.blob()], `seedvr2-${session.id}-${path.split(/[/\\]/).pop()}`, { type: "video/mp4" });
  const uploaded = await uploadImageToComfy(file, session.server);
  session.signal.throwIfAborted();
  return [uploaded.subfolder, uploaded.name].filter(Boolean).join("/");
}

async function upscaleBatch(batch: VideoUpscaleBatch, graph: ComfyApiPrompt, directory: string, session: UpscaleSession, remote: (active: boolean) => void, seed: number) {
  const prompt = seedvr2VideoBatch(graph, batch.startTime, batch.frames, seed);
  remote(true);
  const result = await generateVideoWithComfy(prompt, { serverAddress: session.server, requestId: session.id, modelAttention: session.modelAttention });
  remote(false);
  try {
    session.signal.throwIfAborted();
    // 只接收本次 SaveVideo 的产物，其他节点的预览不计入分段结果。
    const videos = result.videos.filter(video => prompt[video.nodeId]?.class_type === "SaveVideo");
    if (videos.length !== 1) throw Error(t("canvas.upscaleNoResult"));
    const saved = await saveVideosToDisk(videos, directory);
    if (saved.length !== 1) throw Error(t("create.page.saveFailed"));
    return saved[0];
  } finally { revokeComfyVideos(result.videos); }
}

/** 每段完成才开下一段；中间模型保持加载，不反复卸载同一套权重。 */
async function runBatches(prepared: VideoUpscalePrepared, graph: ComfyApiPrompt, session: UpscaleSession, remote: (active: boolean) => void, value: UpscaleSettings) {
  const sharedSeed = Number(graph["66:54"].inputs.seed);
  const paths: string[] = [];
  const store = useGenerationTaskStore.getState();
  store.update(session.id, { total: prepared.batches.length, completed: 0, models: generationModelsFromPrompt(graph) });
  for (const batch of prepared.batches) {
    session.signal.throwIfAborted();
    paths.push(await upscaleBatch(batch, graph, prepared.directory, session, remote, upscaleSeed(value, sharedSeed)));
    store.update(session.id, { completed: paths.length });
  }
  session.signal.throwIfAborted();
  store.update(session.id, { status: "saving" });
  const result = await localVideo({ action: "merge", requestId: session.id, paths, outputPath: session.output });
  if (!result.savedPath) throw Error(t("create.page.saveFailed"));
  return { savedPaths: [result.savedPath] };
}

export async function runSeedvr2Video(source: string, value: UpscaleSettings, session: UpscaleSession, remote: (active: boolean) => void) {
  const graph = buildSeedvr2Prompt("pending.mp4", "video", value);
  const cancel = () => { void localVideo({ action: "cancel", requestId: session.id }).catch(() => console.warn("[video-upscale] cancellation unavailable")); };
  session.signal.throwIfAborted();
  session.signal.addEventListener("abort", cancel, { once: true });
  try {
    await resolveVideoPromptModels(graph, session.server);
    session.signal.throwIfAborted();
    const result = await localVideo({ action: "prepare", requestId: session.id, inputPath: source, fps: resolveUpscaleSettings(value).batchFrames });
    session.signal.throwIfAborted();
    if (!result.prepared) throw Error(t("canvas.upscaleNoResult"));
    graph["73"].inputs.file = await uploadSource(source, session);
    await freeComfyMemory(session.server);
    return await runBatches(result.prepared, graph, session, remote, value);
  } finally {
    session.signal.removeEventListener("abort", cancel);
    remote(false);
    // 清理失败单独记录，避免盖住生成错误，或把已经保存的成片误报为生成失败。
    await localVideo({ action: "release", requestId: session.id }).catch(() => console.warn("[video-upscale] temporary cleanup failed"));
  }
}

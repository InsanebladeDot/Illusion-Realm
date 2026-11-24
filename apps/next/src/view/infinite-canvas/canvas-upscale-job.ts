/** 独立超分节点只读取一个上游，沿用 FIFO、取消和受管导入，不复制媒体执行器。 */
import { t } from "@/i18n";
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import { enqueueGenerationTask, cancelImageGeneration, generationSaveTarget, snapshotGeneration, type GenerationOutputTarget } from "@/utils/image-generation-queue";
import { useGenerationTaskStore } from "@/stores/useGenerationTaskStore";
import { runSeedvr2Image, runSeedvr2Video } from "@/utils/comfy/run-seedvr2";
import { resolveUpscaleSettings, type UpscaleSettings } from "@/utils/comfy/seedvr2-workflow";
import { importGeneratedImages } from "./canvas-local-generation";
import { canvasOutputTarget } from "./canvas-output-target";
import type { CanvasData, CanvasDocument, CanvasNode } from "./canvas-model";

export function enqueueMediaUpscale(media: NonNullable<CanvasData["media"]>, value: UpscaleSettings, target: GenerationOutputTarget) {
  const input = snapshotGeneration({}, target);
  let remote = false;
  return enqueueGenerationTask<string[]>({ prompt: "", model: value.model === "seedvr2_3b" ? "SeedVR2 3B" : "SeedVR2 7B", width: 0, height: 0, total: 1, folderId: input.folderId, mediaKind: media.kind === "video" ? "video" : "image" }, async (id, signal) => {
    useGenerationTaskStore.getState().update(id, { status: "generating" });
    if (media.kind !== "image" && media.kind !== "video") throw Error(t("canvas.upscaleSource"));
    const target = await generationSaveTarget(input);
    const session = { id, signal, server: input.server, output: target.path, modelAttention: input.modelAttention };
    const result = media.kind === "video" ? await runSeedvr2Video(media.path, value, session, active => { remote = active; }) : await upscaleImage(media, value, session, () => { remote = true; });
    const count = useGenerationTaskStore.getState().tasks.find(task => task.id === id)?.total ?? 1;
    useGenerationTaskStore.getState().update(id, { status: "completed", completed: count, savedPaths: result.savedPaths });
    return result.savedPaths;
  }, () => remote);
}

/** 图片仍复用原执行器；视频分段不再经过这条整文件读取路径。 */
async function upscaleImage(media: NonNullable<CanvasData["media"]>, value: UpscaleSettings, session: Parameters<typeof runSeedvr2Image>[2], before: () => void) {
  const response = await fetch(buildLocalFileUrl(media.path)!, { signal: session.signal });
  if (!response.ok) throw Error(t("canvas.upscaleSource"));
  const file = new File([await response.blob()], media.name);
  before();
  const result = await runSeedvr2Image(file, value, session);
  for (const image of result.images) URL.revokeObjectURL(image.objectUrl);
  return { savedPaths: result.savedPaths };
}

export function startCanvasUpscaleJob(node: CanvasNode, document: CanvasDocument) {
  const sources = document.edges.filter(edge => edge.target === node.id).map(edge => document.nodes.find(item => item.id === edge.source));
  const media = sources[0]?.data.media;
  // 提交时快照当前节点配置，排队期间修改面板不会串到已提交任务。
  const value = { ...resolveUpscaleSettings(node.data.upscale), enabled: true };
  if (sources.length !== 1 || !media) throw Error(t("canvas.upscaleSource"));
  let job: ReturnType<typeof enqueueMediaUpscale> | undefined;
  const controller = new AbortController();
  const promise = canvasOutputTarget(document, media.kind === "video" ? "video" : "image").then(async output => {
    controller.signal.throwIfAborted();
    job = enqueueMediaUpscale(media, value, output.target);
    return importGeneratedImages({ ...document, workspace: output.workspace }, await job.promise, media.kind === "video" ? "video" : "image");
  });
  return { promise, cancel: async () => { controller.abort(); if (job) await cancelImageGeneration(job.id); } };
}

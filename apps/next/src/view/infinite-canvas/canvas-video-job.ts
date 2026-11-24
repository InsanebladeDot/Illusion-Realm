/** 视频节点只适配工程引用和参数，实际上传、排队与生成复用创作页执行器。 */
import { enqueueVideoGeneration, type VideoGenerationInput } from "@/utils/video-generation-queue";
import { cancelImageGeneration } from "@/utils/image-generation-queue";
import { revokeComfyVideos } from "@/api/comfyui";
import { getVideoGenerationDefaults } from "@/utils/comfy/video-generation-settings";
import { getVideoResolutionDefaults } from "@/utils/comfy/video-resolution";
import { getVideoLoras } from "@/utils/comfy/video-workflow-loras";
import { buildVideoPrompt } from "@/utils/comfy/videoWorkflow";
import { normalizeVideoReferences, type VideoReferenceFile } from "@/utils/comfy/video-reference-media";
import { canvasOutputDimensions } from "./canvas-output-size";
import { canvasReferenceMedia } from "./canvas-reference-media";
import { canvasImageInputs } from "./canvas-input-rules";
import { canvasPromptReferencesEnabled } from "./canvas-prompt-conversion";
import { getCanvasVideoWorkflowTemplate } from "./canvas-video-workflow";
import { canvasOutputTarget } from "./canvas-output-target";
import { importGeneratedImages } from "./canvas-local-generation";
import type { CanvasDocument, CanvasNode } from "./canvas-model";
import { t } from "@/i18n";

/** 参数预检先于上传；UI显示的宽高/FPS/秒数与发出的工作单来自同一份节点数据。 */
export function canvasVideoRequest(node: CanvasNode, document: CanvasDocument): VideoGenerationInput {
  const data = node.data;
  if (data.workflow === "wan2.2") throw Error(t("canvas.unavailable"));
  const workflowId = data.workflow === "minimax-reference" ? data.workflow : "minimax";
  const template = getCanvasVideoWorkflowTemplate({ ...data, workflow: workflowId });
  const media = canvasReferenceMedia(canvasImageInputs(node.id, document), data.inputImages);
  if (media.some(item => !item.src) || workflowId === "minimax" && media.length !== 1) throw Error(t("canvas.remoteInputInvalid"));
  const prompt = canvasPromptReferencesEnabled(data) ? normalizeVideoReferences(data.prompt, media, data.promptReferenceLabels) : data.prompt;
  const defaults = getVideoGenerationDefaults(template);
  const input = { workflowId, prompt, durationSeconds: data.videoDuration ?? 5,
    modelOverrides: data.videoModelOverrides?.[workflowId], loras: data.workflowLoras?.[workflowId] ?? getVideoLoras(template),
    generationSettings: {
      ...defaults,
      steps: data.videoSteps ?? defaults.steps,
      fps: data.videoFps ?? 24,
      durationSeconds: data.videoDuration ?? 5,
    },
    resolution: { ...getVideoResolutionDefaults(template), ...canvasOutputDimensions(data) } };
  buildVideoPrompt({ ...input, imageName: workflowId === "minimax" ? "reference.png" : undefined,
    referenceMedia: media.map(item => ({ kind: item.kind, number: item.number, name: "reference.png" })) });
  return input;
}

async function readReferences(node: CanvasNode, document: CanvasDocument, signal: AbortSignal): Promise<VideoReferenceFile[]> {
  const media = canvasReferenceMedia(canvasImageInputs(node.id, document), node.data.inputImages);
  const result: VideoReferenceFile[] = [];
  for (const item of media) {
    const response = await fetch(item.src, { signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]) });
    if (!response.ok) throw Error(t("canvas.remoteInputInvalid"));
    const blob = await response.blob();
    const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
    result.push({ ...item, file: new File([blob], `${item.name}.${extension}`, { type: blob.type }) });
  }
  signal.throwIfAborted();
  return result;
}

export function startCanvasVideoJob(node: CanvasNode, document: CanvasDocument) {
  const input = canvasVideoRequest(node, document);
  const controller = new AbortController();
  let current: string | undefined;
  const promise = (async () => {
    const references = await readReferences(node, document, controller.signal);
    const { target, workspace } = await canvasOutputTarget(document, "video");
    controller.signal.throwIfAborted();
    const job = enqueueVideoGeneration({ ...input, imageFile: input.workflowId === "minimax" ? references[0].file : undefined,
      referenceMedia: input.workflowId === "minimax-reference" ? references : undefined }, target);
    current = job.id;
    const result = await job.promise;
    // 画布用落盘路径预览，释放执行器生成的临时视频URL。
    try { return await importGeneratedImages({ ...document, workspace }, result.savedPaths, "video"); }
    finally { revokeComfyVideos(result.videos); }
  })();
  return { promise, cancel: async () => { controller.abort(); if (current) await cancelImageGeneration(current); } };
}

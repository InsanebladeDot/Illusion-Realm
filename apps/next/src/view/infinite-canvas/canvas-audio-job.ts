/** 画布音频共用排队、取消和工程 Audio 目录，各引擎独立构图。 */
import { enqueueAudioGeneration, enqueueGptSovitsGeneration } from "@/utils/audio-generation-queue";
import { cancelImageGeneration } from "@/utils/image-generation-queue";
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import { buildAudioPrompt } from "@/utils/comfy/audio-workflow";
import { buildGptSovitsPrompt, GPT_SOVITS_MAX_SEED } from "@/utils/comfy/gpt-sovits-workflow";
import { generateRandomSeed } from "@/utils/seed";
import { canvasOutputTarget } from "./canvas-output-target";
import { canvasAudioInput, canvasAudioSettings } from "./canvas-audio-parameters";
import { importGeneratedImages } from "./canvas-local-generation";
import type { CanvasDocument, CanvasNode } from "./canvas-model";
import type { GenerationOutputTarget } from "@/utils/image-generation-queue";

async function readReference(media: ReturnType<typeof canvasAudioInput>, signal: AbortSignal) {
  if (!media) return null;
  const response = await fetch(buildLocalFileUrl(media.path)!, { signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]) });
  if (!response.ok) throw Error("canvas-audio-reference-unavailable");
  const blob = await response.blob(); signal.throwIfAborted();
  return new File([blob], media.name, { type: blob.type });
}

export function startCanvasAudioJob(node: CanvasNode, document: CanvasDocument) {
  const controller = new AbortController();
  let current: string | null = null;
  const source = canvasAudioInput(node, document);
  const enqueue = prepareAudioJob(node.data, Boolean(source));
  const promise = (async () => {
    const reference = await readReference(source, controller.signal);
    const { workspace, target } = await canvasOutputTarget(document, "audio");
    // 画布音频固定一份请求；旧工程的批量字段保留兼容读取，但不再驱动额外生成。
    controller.signal.throwIfAborted();
    const job = enqueue(reference, target);
    current = job.id;
    const { savedPaths } = await job.promise;
    controller.signal.throwIfAborted();
    return importGeneratedImages({ ...document, workspace }, savedPaths, "audio");
  })();
  // 像撤回工单：先标记取消再通知队列，迟到的结果不能回填节点。
  return { promise, cancel: async () => { controller.abort(); if (current) await cancelImageGeneration(current); } };
}

function prepareAudioJob(data: CanvasNode["data"], hasReference: boolean) {
  // 占位名称只用于本地校验；真正提交的名称由 ComfyUI 上传接口给出。
  const referenceName = hasReference ? "reference.wav" : undefined;
  const row = data.audioParameters;
  if (row?.engine === "gpt-sovits") {
    const gpt = row.gptSovits, fixed = gpt?.seed ?? "0";
    const seed = gpt?.random !== false ? generateRandomSeed(0, GPT_SOVITS_MAX_SEED) : /^\d+$/.test(fixed) ? Number(fixed) : NaN;
    const settings = { textLanguage: gpt?.textLanguage, referenceLanguage: gpt?.referenceLanguage, cut: gpt?.cut,
      gptWeight: gpt?.gptWeight, sovitsWeight: gpt?.sovitsWeight, speed: gpt?.speed, interval: gpt?.interval,
      transcript: gpt?.transcript, text: data.prompt, seed };
    buildGptSovitsPrompt(settings, referenceName);
    return (reference: File | null, target: GenerationOutputTarget) => enqueueGptSovitsGeneration(settings, reference, target);
  }
  const settings = canvasAudioSettings(data, hasReference);
  buildAudioPrompt({ ...settings, referenceName });
  return (reference: File | null, target: GenerationOutputTarget) => enqueueAudioGeneration(settings, reference, target);
}

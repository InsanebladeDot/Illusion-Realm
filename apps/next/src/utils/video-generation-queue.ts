/** 视频与图片共用串行队列；上传、构图、保存分别沿用创作页原实现。 */
import { generateVideoWithComfy, revokeComfyVideos, uploadImageToComfy } from "@/api/comfyui";
import { buildVideoPrompt, getVideoWorkflowTemplate } from "@/utils/comfy/videoWorkflow";
import { resolveVideoPromptModels } from "@/utils/comfy/resolve-video-models";
import { orderedReferences, type VideoReferenceFile, type UploadedVideoReference } from "@/utils/comfy/video-reference-media";
import type { VideoModelOverrides } from "@/utils/comfy/video-workflow-models";
import type { VideoLora } from "@/utils/comfy/video-workflow-loras";
import type { VideoGenerationSettings } from "@/utils/comfy/video-generation-settings";
import type { VideoResolutionSettings } from "@/utils/comfy/video-resolution";
import { saveVideosToDisk } from "@/utils/save-generated-videos";
import { assertWorkflowModelsInstalled } from "@/utils/workflow-model-readiness";
import { workflowModelDraft } from "@/utils/workflow-model-draft";
import { enqueueGenerationTask, snapshotGeneration, generationSaveTarget, type GenerationOutputTarget } from "@/utils/image-generation-queue";
import { useGenerationTaskStore } from "@/stores/useGenerationTaskStore";
import { t } from "@/i18n";

export interface VideoGenerationInput {
  workflowId: string;
  prompt: string;
  durationSeconds?: number;
  imageFile?: File | null;
  lastImageFile?: File | null;
  referenceMedia?: VideoReferenceFile[];
  modelOverrides?: VideoModelOverrides;
  loras?: VideoLora[];
  generationSettings?: VideoGenerationSettings;
  resolution?: VideoResolutionSettings;
}

/** 同名素材用独立上传名，避免首尾帧或不同节点的参考互相覆盖。 */
async function upload(file: File, server: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const extension = /\.[a-z0-9]+$/i.exec(file.name)?.[0] || ".png";
  const named = new File([file], `ir_${crypto.randomUUID()}${extension}`, { type: file.type });
  const result = await uploadImageToComfy(named, server);
  signal.throwIfAborted();
  return [result.subfolder, result.name || named.name].filter(Boolean).join("/");
}

async function uploadInputs(input: VideoGenerationInput, server: string, signal: AbortSignal) {
  const imageName = input.imageFile ? await upload(input.imageFile, server, signal) : undefined;
  const lastImageName = input.lastImageFile ? await upload(input.lastImageFile, server, signal) : undefined;
  const referenceMedia: UploadedVideoReference[] = [];
  // 像按座位号入场：编号顺序固定，不让上传耗时决定引用位置。
  for (const item of orderedReferences(input.referenceMedia ?? [])) {
    referenceMedia.push({ kind: item.kind, number: item.number, name: await upload(item.file, server, signal) });
  }
  return { imageName, lastImageName, referenceMedia };
}

async function execute(input: VideoGenerationInput, snapshot: ReturnType<typeof snapshotGeneration>, id: string, signal: AbortSignal, markRemote: () => void) {
  const update = useGenerationTaskStore.getState().update;
  signal.throwIfAborted();
  update(id, { status: "generating" });
  const target = await generationSaveTarget(snapshot);
  const sources = await uploadInputs(input, snapshot.server, signal);
  const prompt = buildVideoPrompt({ ...input, ...sources });
  await resolveVideoPromptModels(prompt, snapshot.server);
  signal.throwIfAborted(); markRemote();
  const result = await generateVideoWithComfy(prompt, { serverAddress: snapshot.server, requestId: id, modelAttention: snapshot.modelAttention });
  try {
    signal.throwIfAborted();
    if (!result.videos.length) throw Error(t("canvas.generationFailed"));
    update(id, { status: "saving" });
    const savedPaths = await saveVideosToDisk(result.videos, target.path);
    if (savedPaths.length !== result.videos.length) throw Error(t("create.page.saveFailed"));
    update(id, { status: "completed", completed: 1, savedPaths, folderId: target.folderId });
    return { ...result, savedPaths };
  } catch (error) { revokeComfyVideos(result.videos); throw error; }
}

export function enqueueVideoGeneration(value: VideoGenerationInput, target?: GenerationOutputTarget) {
  const input = { ...value, modelOverrides: structuredClone(value.modelOverrides), loras: structuredClone(value.loras), generationSettings: structuredClone(value.generationSettings), resolution: structuredClone(value.resolution), referenceMedia: value.referenceMedia?.map(item => ({ ...item })) };
  assertWorkflowModelsInstalled(workflowModelDraft(getVideoWorkflowTemplate(input.workflowId), { overrides: input.modelOverrides, loras: input.loras }));
  const snapshot = snapshotGeneration({ positivePrompt: input.prompt }, target);
  let remote = false;
  return enqueueGenerationTask({ prompt: input.prompt, model: input.workflowId, width: input.resolution?.width ?? 0,
    height: input.resolution?.height ?? 0, total: 1, folderId: snapshot.folderId, mediaKind: "video" },
  (id, signal) => execute(input, snapshot, id, signal, () => { remote = true; }), () => remote);
}

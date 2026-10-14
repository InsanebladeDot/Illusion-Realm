/**
 * 图生视频工作流（minimax / wan2.2）的参数拼装。
 *
 * 怎么做：读静态工作流 JSON，把输入图 / 首尾帧 / 时长等参数写进对应节点，
 * 产出 API prompt；与 `imageWorkflow` 同一套写法。
 */
import type { ComfyApiPrompt, ComfyApiNode } from "@/types/comfy";
import minimaxJson from "@/data/comfy/videoWorkflower/minnimax/minimax h3 图生视频-首尾帧.json";
import wanJson from "@/data/comfy/videoWorkflower/wan2.2/wan2.2-Remix-NSFW.json";
import referenceJson from "@/data/comfy/videoWorkflower/minnimax/minimax h3 参考视频.json";
import { isMinimaxWorkflow } from "@/data/videoForm";
import { applyVideoReferences, type UploadedVideoReference } from "./video-reference-media";
import { t } from "@/i18n";
import { cloneComfyPrompt } from "@/utils/comfy/workflowToApi";
import { applyVideoModelOverrides, type VideoModelOverrides } from "./video-workflow-models";
import { applyVideoLoras, type VideoLora } from "./video-workflow-loras";
import { applyVideoGenerationSettings, type VideoGenerationSettings } from "./video-generation-settings";
import { applyVideoResolution, type VideoResolutionSettings } from "./video-resolution";

/**
 * 工作流保持模板默认配置；用户可按加载节点覆盖模型名，参数按节点类型和连线注入。
 */
const VIDEO_WORKFLOWS: Record<string, ComfyApiPrompt> = {
  minimax: minimaxJson as ComfyApiPrompt,
  "minimax-reference": referenceJson as ComfyApiPrompt,
  "wan2.2": wanJson as ComfyApiPrompt,
};

type NodeRef = { id: string; node: ComfyApiNode } | null;

/**
 * 节点定位用的 `_meta.title` 关键字 —— **数据契约，不是界面文案**。
 *
 * 它们必须与 `data/comfy/videoWorkflower/minnimax/minimax h3 图生视频-首尾帧.json`
 * 里的节点标题逐字一致，否则 `findNodeByClass` 找不到节点、参数注入会静默失效。
 *
 * 为什么不把 JSON 里的标题改成英文：`_meta.title` 是 ComfyUI 界面显示的节点名，
 * 改它会连带改变用户在 ComfyUI 里看到的节点标题 —— 那是跨应用的外观变化，
 * 而这里并没有 i18n 收益（它不面向我们的界面文案）。所以只把代码侧的字面量
 * 收成具名常量，JSON 保持原样。
 */
const NODE_TITLE = {
  firstFrame: "首帧",
  lastFrame: "尾帧",
  duration: "时长",
} as const;

function findNodeByClass(
  prompt: ComfyApiPrompt,
  classType: string,
  titleKeyword?: string
): NodeRef {
  for (const [id, node] of Object.entries(prompt)) {
    if (node.class_type !== classType) continue;
    if (titleKeyword) {
      const title = String(node._meta?.title ?? "");
      if (!title.toLowerCase().includes(titleKeyword.toLowerCase())) {
        continue;
      }
    }
    return { id, node };
  }
  return null;
}

function setInput(node: NodeRef, inputName: string, value: unknown): void {
  if (node?.node?.inputs) {
    node.node.inputs[inputName] = value;
  }
}

export type VideoGenerateInput = {
  workflowId: string;
  /** 正向提示词 */
  prompt: string;
  /** 时长（秒），不提供则保持模板值 */
  durationSeconds?: number;
  /** 已上传到 ComfyUI 输入目录的图片文件名 */
  imageName?: string;
  referenceMedia?: UploadedVideoReference[];
  lastImageName?: string;
  modelOverrides?: VideoModelOverrides;
  loras?: VideoLora[];
  generationSettings?: VideoGenerationSettings;
  resolution?: VideoResolutionSettings;
};

export function getVideoWorkflowTemplate(workflowId: string): ComfyApiPrompt {
  const base = VIDEO_WORKFLOWS[workflowId];
  if (!base) throw new Error(t("errors.videoWorkflow.unknownWorkflow", { workflowId }));
  const template = cloneComfyPrompt(base);
  // 视频不替用户预选 LoRA；移除节点时会把调度器和引导器重新接回 UNet。
  if (isMinimaxWorkflow(workflowId)) applyVideoLoras(template, [], workflowId);
  return template;
}
function requiredNode(prompt: ComfyApiPrompt, classType: string, titleKeyword?: string): NonNullable<NodeRef> {
  const node = findNodeByClass(prompt, classType, titleKeyword);
  if (!node) throw new Error(t("create.videoModels.missingNode", { name: classType }));
  return node;
}
function applyMinimaxInputs(prompt: ComfyApiPrompt, input: VideoGenerateInput) {
  if (!input.imageName) throw new Error(t("create.videoCreatePanel.startImageRequired"));
  const video = requiredNode(prompt, "MiniMaxH3ImageToVideo").node;
  video.inputs.prompt = input.prompt;
  // 首帧沿用模板连接；新版模板没有尾帧节点时按需创建，不上传尾帧就移除对应输入。
  for (const [name, image] of [["first_frame", input.imageName], ["last_frame", input.lastImageName]] as const) {
    if (!image) { delete video.inputs[name]; continue; }
    const link = video.inputs[name];
    const node = Array.isArray(link) && typeof link[0] === "string" ? prompt[link[0]] : undefined;
    if (node?.class_type === "LoadImage") node.inputs.image = image;
    else {
      let id = `ir_${name}`;
      while (prompt[id]) id += "_";
      prompt[id] = { class_type: "LoadImage", inputs: { image } };
      video.inputs[name] = [id, 0];
    }
  }
  if (input.durationSeconds != null) {
    const math = requiredNode(prompt, "ComfyMathExpression").node;
    const link = math.inputs["values.a"];
    const duration = Array.isArray(link) && typeof link[0] === "string" ? prompt[link[0]] : undefined;
    if (duration?.class_type !== "PrimitiveFloat") throw new Error(t("create.videoModels.missingNode", { name: "PrimitiveFloat" }));
    duration.inputs.value = input.durationSeconds;
  }
}
function applyWanInputs(prompt: ComfyApiPrompt, input: VideoGenerateInput) {
  if (!input.imageName) throw new Error(t("create.videoCreatePanel.startImageRequired"));
  setInput(requiredNode(prompt, "CLIPTextEncode", "Positive"), "text", input.prompt);
  if (input.durationSeconds != null) {
    const durationNode = findNodeByClass(prompt, "PrimitiveFloat", "Duration") ?? requiredNode(prompt, "PrimitiveFloat", NODE_TITLE.duration);
    setInput(durationNode, "value", input.durationSeconds);
  }
  prompt["start_image"] = { class_type: "LoadImage", inputs: { image: input.imageName } };
  setInput(requiredNode(prompt, "WanImageToVideo"), "image", ["start_image", 0]);
}

export function buildVideoPrompt(input: VideoGenerateInput): ComfyApiPrompt {
  const prompt = getVideoWorkflowTemplate(input.workflowId);
  if (input.workflowId === "minimax-reference") {
    requiredNode(prompt, "MiniMaxH3ReferenceToVideo").node.inputs.prompt = input.prompt;
    applyVideoReferences(prompt, input.referenceMedia ?? []);
  } else if (input.workflowId === "minimax") applyMinimaxInputs(prompt, input);
  else applyWanInputs(prompt, input);
  applyVideoModelOverrides(prompt, input.modelOverrides, input.workflowId);
  applyVideoLoras(prompt, input.loras, input.workflowId);
  applyVideoGenerationSettings(prompt, input.generationSettings);
  applyVideoResolution(prompt, input.resolution);
  return prompt;
}

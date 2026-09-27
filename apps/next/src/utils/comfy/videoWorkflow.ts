/**
 * 图生视频工作流（minimax / wan2.2）的参数拼装。
 *
 * 怎么做：读静态工作流 JSON，把输入图 / 首尾帧 / 时长等参数写进对应节点，
 * 产出 API prompt；与 `imageWorkflow` 同一套写法。
 */
import type { ComfyApiPrompt, ComfyApiNode } from "@/types/comfy";
import minimaxJson from "@/data/comfy/videoWorkflower/minnimax/minimax h3 图生视频-首尾帧.json";
import wanJson from "@/data/comfy/videoWorkflower/wan2.2/wan2.2-Remix-NSFW.json";
import { t } from "@/i18n";
import { cloneComfyPrompt } from "@/utils/comfy/workflowToApi";

/**
 * 视频工作流注册表：底层模型/VAE/CLIP/采样器均固定，用户仅提供
 * 提示词、时长（wan2.2）、起始图片。参数注入按 class_type/_meta.title 定位节点。
 */
const VIDEO_WORKFLOWS: Record<string, ComfyApiPrompt> = {
  minimax: minimaxJson as ComfyApiPrompt,
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
  /** 时长（秒），仅 wan2.2 需要 */
  durationSeconds?: number;
  /** 已上传到 ComfyUI 输入目录的图片文件名 */
  imageName: string;
};

export function buildVideoPrompt(input: VideoGenerateInput): ComfyApiPrompt {
  const base = VIDEO_WORKFLOWS[input.workflowId];
  if (!base) {
    throw new Error(
      t("errors.videoWorkflow.unknownWorkflow", { workflowId: input.workflowId })
    );
  }
  const prompt = cloneComfyPrompt(base);

  if (input.workflowId === "minimax") {
    // 提示词注入 MiniMaxH3ImageToVideo.prompt
    setInput(
      findNodeByClass(prompt, "MiniMaxH3ImageToVideo"),
      "prompt",
      input.prompt
    );
    // 首帧 + 尾帧都使用上传图片（单图驱动）
    setInput(
      findNodeByClass(prompt, "LoadImage", NODE_TITLE.firstFrame),
      "image",
      input.imageName
    );
    setInput(
      findNodeByClass(prompt, "LoadImage", NODE_TITLE.lastFrame),
      "image",
      input.imageName
    );
  } else {
    // wan2.2：正向提示词注入 Positive CLIPTextEncode
    setInput(
      findNodeByClass(prompt, "CLIPTextEncode", "Positive"),
      "text",
      input.prompt
    );
    // 时长
    if (input.durationSeconds != null) {
      const durationNode =
        findNodeByClass(prompt, "PrimitiveFloat", "Duration") ??
        findNodeByClass(prompt, "PrimitiveFloat", NODE_TITLE.duration);
      setInput(durationNode, "value", input.durationSeconds);
    }
    // 起始图片：新增 LoadImage 节点并接到 WanImageToVideo.image
    prompt["start_image"] = {
      class_type: "LoadImage",
      inputs: { image: input.imageName },
    };
    setInput(
      findNodeByClass(prompt, "WanImageToVideo"),
      "image",
      ["start_image", 0]
    );
  }

  return prompt;
}

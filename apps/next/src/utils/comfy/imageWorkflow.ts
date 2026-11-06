/**
 * 文生图工作流（Anima / SDXL 两套 JSON）的加载与参数填槽。
 *
 * 怎么做：import 静态工作流 JSON → 深拷贝 → 按参数名把提示词 / 模型 / LoRA /
 * 采样参数写进对应节点，产出可直接提交的 API prompt。
 */
import type { ComfyApiPrompt } from "@/types/comfy";
import animaWorkflowJson from "@/data/comfy/imageWorkflower/Anima/标准anima生成流.json";
import sdxlWorkflowJson from "@/data/comfy/imageWorkflower/SDXL/标准SDXL生成.json";
import { t } from "@/i18n";
import { cloneComfyPrompt } from "@/utils/comfy/workflowToApi";
// 图片与视频共用槽位校验，只把当前图片工作流的 CLIP/VAE 交给辅助设置。
// 参数随队列深拷贝，后续改选只影响下一次生成。
import { applyWorkflowAuxiliaryOverrides, type VideoModelOverrides } from "./video-workflow-models";

/** 图像生成工作流系列（对应创建页模型系列） */
export type ImageWorkflowSeries = "anima" | "sdxl";

export type LoraPromptItem = {
  name: string;
  strength: number;
};

export type ImageWorkflowParams = {
  positivePrompt?: string;
  negativePrompt?: string;
  seed?: number;
  steps?: number;
  cfg?: number;
  samplerName?: string;
  scheduler?: string;
  denoise?: number;
  width?: number;
  height?: number;
  batchSize?: number;
  /** Anima → UNETLoader.unet_name；SDXL → CheckpointLoaderSimple.ckpt_name */
  checkpointName?: string;
  /** 按 UI 扩展顺序链式加载；空数组表示不加载 LoRA */
  loras?: LoraPromptItem[];
  /** 使用哪个系列的工作流（默认 anima） */
  series?: ImageWorkflowSeries;
  // 节点号属于当前系列，SDXL 与 Anima 的覆盖不能互相套用。
  // 未提供时保持原工作流，不新增任何加载节点或重接 checkpoint 输出。
  modelOverrides?: VideoModelOverrides;
};

type WorkflowNode = {
  class_type: string;
  inputs: Record<string, unknown>;
};

/**
 * 图像工作流注册表：任务规范要求 Anima / 传统 SDXL 分开管理，
 * 工作流 JSON 位于 src/data/comfy/imageWorkflower/<系列>/。
 * Anima 工作流的 VAE/CLIP 已固定绑定（CLIPLoader/VAELoader），不开放给用户选择。
 */
const IMAGE_WORKFLOWS: Record<ImageWorkflowSeries, ComfyApiPrompt> = {
  anima: animaWorkflowJson as ComfyApiPrompt,
  sdxl: sdxlWorkflowJson as ComfyApiPrompt,
};
// UI 与提交使用同一模板来源，文件改名后的默认展示不会另维护一份常量。
// 返回深拷贝，设置组件读取它不会污染下一次图片或编辑生成。
// SDXL 的 CLIP/VAE 来自 checkpoint 输出，不能虚构独立加载器。
// 模板 getter 与生成构建器引用同一张 IMAGE_WORKFLOWS 表，避免配置来源分叉。
// 这里只暴露拷贝，UI 即使为了展示遍历或暂存也拿不到模块原件的写权限。
// 系列是已支持的工作流联合类型，不能把外部任意路径当成模板导入位置。
// Anima 的独立 loader 可以改名，SDXL 的内置输出则保持原有连线。
// 克隆不替换节点 id，设置面板拿到的键才能直接用于实际生成。
// 读取模板本身不注入提示词、随机种子或用户 LoRA，展示不会改变生成草稿。
export function getImageWorkflowTemplate(series: ImageWorkflowSeries): ComfyApiPrompt {
  return cloneComfyPrompt(IMAGE_WORKFLOWS[series]);
}

function findNodes(
  prompt: ComfyApiPrompt,
  classType: string
): Array<{ id: string; node: WorkflowNode }> {
  const result: Array<{ id: string; node: WorkflowNode }> = [];
  for (const [id, node] of Object.entries(prompt)) {
    if (node.class_type === classType) {
      result.push({ id, node: node as WorkflowNode });
    }
  }
  return result;
}

function findNode(
  prompt: ComfyApiPrompt,
  classType: string
): { id: string; node: WorkflowNode } | null {
  return findNodes(prompt, classType)[0] ?? null;
}

/** 通过 KSampler 的 positive/negative 链接定位 CLIPTextEncode 节点（避免硬编码节点 ID） */
function resolveTextEncodeNodeId(
  prompt: ComfyApiPrompt,
  samplerId: string,
  slot: "positive" | "negative"
): string | null {
  const link = prompt[samplerId]?.inputs?.[slot];
  if (Array.isArray(link)) {
    const target = prompt[String(link[0])];
    if (target?.class_type === "CLIPTextEncode") return String(link[0]);
  }
  return null;
}

function extractWorkflowDefaults(series: ImageWorkflowSeries) {
  const prompt = IMAGE_WORKFLOWS[series];
  const sampler = findNode(prompt, "KSampler");
  const latent = findNode(prompt, "EmptyLatentImage");
  return {
    cfg: (sampler?.node.inputs.cfg as number) ?? 3,
    steps: (sampler?.node.inputs.steps as number) ?? 15,
    samplerName: (sampler?.node.inputs.sampler_name as string) ?? "euler",
    scheduler: (sampler?.node.inputs.scheduler as string) ?? "simple",
    denoise: (sampler?.node.inputs.denoise as number) ?? 1,
    width: (latent?.node.inputs.width as number) ?? 1024,
    height: (latent?.node.inputs.height as number) ?? 1024,
    batchSize: (latent?.node.inputs.batch_size as number) ?? 1,
  } as const;
}

/**
 * 取某个系列工作流模板自带的参数默认值。
 * 前端「采样器 / 调度器」初始显示即取这里的值（Anima: euler_ancestral + simple，SDXL: euler + karras），
 * 用户仍可自由切换。
 */
export function getImageWorkflowDefaults(
  series: ImageWorkflowSeries = "sdxl"
): ReturnType<typeof extractWorkflowDefaults> {
  return extractWorkflowDefaults(IMAGE_WORKFLOWS[series] ? series : "sdxl");
}

/** 生成参数缺省值：取自 SDXL 工作流内置参数 */
export const IMAGE_WORKFLOW_DEFAULTS = getImageWorkflowDefaults("sdxl");

/**
 * LoRA 动态注入（任务规范第 4 节）：
 * - **精确数量**：用户选了几个 LoRA 就生成几个节点，不多不少
 * - **节点 ID 从 100 开始递增**（100, 101, 102 …）
 * - **节点类型**：`LoraLoaderModelOnly`（无 strength_clip / clip 字段）
 * - **串联链路**：UNETLoader(7) → LoRA(100) → … → LoRA(100+N-1) → KSampler(5).model
 * - **CLIP 不经过 LoRA**：CLIPLoader(1) 只连到 CLIPTextEncode(4)/(6)
 * - **零 LoRA 边界**：KSampler(5).model 直连模型加载器 `[loaderId, 0]`
 */
const LORA_NODE_ID_START = 100;

function injectUserLoras(
  prompt: ComfyApiPrompt,
  samplerId: string,
  loras: LoraPromptItem[]
): void {
  const sampler = prompt[samplerId];
  if (!sampler) return;

  // 链首固定为模型加载器（Anima → UNETLoader，SDXL → CheckpointLoaderSimple）
  const loader =
    findNode(prompt, "UNETLoader") ?? findNode(prompt, "CheckpointLoaderSimple");
  const baseLink = loader
    ? ([loader.id, 0] as [string, number])
    : (sampler.inputs.model as [string, number] | undefined);

  if (loras.length === 0) {
    // 零 LoRA 边界：KSampler.model 直连加载器（工作流自带 LoRA 栈时不覆盖）
    const hasBuiltinLora = Object.values(prompt).some(
      (node) => (node as WorkflowNode)?.class_type === "LoraLoaderModelOnly"
    );
    if (!hasBuiltinLora && Array.isArray(baseLink)) sampler.inputs.model = baseLink;
    return;
  }

  let previous = baseLink;
  if (!Array.isArray(previous)) return;

  loras.forEach((lora, index) => {
    const nodeId = String(LORA_NODE_ID_START + index);
    prompt[nodeId] = {
      class_type: "LoraLoaderModelOnly",
      inputs: {
        lora_name: lora.name,
        strength_model: lora.strength ?? 1.0,
        model: previous,
      },
    };
    previous = [nodeId, 0];
  });

  sampler.inputs.model = previous;
}

/** 输出节点判定：ComfyUI 要求 API Prompt 至少有一个输出节点，否则报 prompt_no_outputs */
function isOutputNode(node: WorkflowNode): boolean {
  return /save|preview/i.test(node.class_type);
}

function assertHasOutputNode(prompt: ComfyApiPrompt, series: ImageWorkflowSeries): void {
  const hasOutput = Object.values(prompt).some((node) =>
    isOutputNode(node as WorkflowNode)
  );
  if (!hasOutput) {
    throw new Error(t("errors.imageWorkflow.missingOutputNode", { series }));
  }
}

/** 把用户参数注入对应系列的工作流 API Prompt */
export function buildImagePrompt(
  series: ImageWorkflowSeries,
  params: ImageWorkflowParams = {}
): ComfyApiPrompt {
  const base = IMAGE_WORKFLOWS[series];
  if (!base) {
    throw new Error(t("errors.imageWorkflow.unknownSeries", { series }));
  }
  const prompt = cloneComfyPrompt(base);

  const sampler = findNode(prompt, "KSampler");
  if (!sampler) {
    throw new Error(t("errors.imageWorkflow.missingSampler", { series }));
  }
  const samplerNode = sampler.node;

  const positiveId = resolveTextEncodeNodeId(prompt, sampler.id, "positive");
  const negativeId = resolveTextEncodeNodeId(prompt, sampler.id, "negative");

  if (params.positivePrompt != null && positiveId) {
    prompt[positiveId].inputs.text = params.positivePrompt;
  }
  if (params.negativePrompt != null && negativeId) {
    prompt[negativeId].inputs.text = params.negativePrompt;
  }

  if (params.seed != null) samplerNode.inputs.seed = params.seed;
  if (params.steps != null) samplerNode.inputs.steps = params.steps;
  if (params.cfg != null) samplerNode.inputs.cfg = params.cfg;
  if (params.samplerName != null) {
    samplerNode.inputs.sampler_name = params.samplerName
      .toLowerCase()
      .replace(/\s+/g, "_");
  }
  if (params.scheduler != null) {
    samplerNode.inputs.scheduler = params.scheduler;
  }
  if (params.denoise != null) {
    samplerNode.inputs.denoise = params.denoise;
  }

  const latent = findNode(prompt, "EmptyLatentImage");
  if (latent) {
    if (params.width != null) latent.node.inputs.width = params.width;
    if (params.height != null) latent.node.inputs.height = params.height;
    if (params.batchSize != null) {
      latent.node.inputs.batch_size = params.batchSize;
    }
  }

  const modelLoader =
    findNode(prompt, "CheckpointLoaderSimple") ?? findNode(prompt, "UNETLoader");
  if (modelLoader && params.checkpointName != null) {
    const key =
      modelLoader.node.class_type === "UNETLoader" ? "unet_name" : "ckpt_name";
    modelLoader.node.inputs[key] = params.checkpointName;
  }

  // LoRA 注入：模型链由加载器 → LoRA(100…) → KSampler，CLIP 链路不动
  injectUserLoras(prompt, sampler.id, params.loras ?? []);
  // LoRA 注入不改变 CLIP/VAE 的节点身份，辅助覆盖最后写入实际提交图。
  // 路径和槽位校验失败交给生成入口提示，不能悄悄回落到另一个模型。
  applyWorkflowAuxiliaryOverrides(prompt, params.modelOverrides);

  // ComfyUI 侧校验：没有输出节点会直接 400（prompt_no_outputs），提前给出可读报错
  assertHasOutputNode(prompt, series);

  return prompt;
}

export { toComfyModelName } from "@/utils/comfy/comfyModelPath";

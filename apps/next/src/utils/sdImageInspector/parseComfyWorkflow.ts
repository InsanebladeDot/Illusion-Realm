/**
 * 从内嵌工作流里读出「用了什么模型 / LoRA / 采样参数」（二创回填与信息展示用）。
 *
 * 怎么做：遍历 API prompt 的节点，按 class_type 白名单提取（Checkpoint /
 * LoraLoader / 采样器…），再整理成结构化结果。
 */
import type { ComfyApiPrompt } from "@/types/comfy";
import { displayModelFileName } from "@/utils/buildGeneratedImageMeta";

const LORA_CLASS_TYPES = new Set(["LoraLoader", "LoraLoaderModelOnly"]);
const CHECKPOINT_CLASS_TYPES = new Set([
  "CheckpointLoaderSimple",
  "CheckpointLoader",
]);
/**
 * 扩散模型加载节点：本应用的 Anima 工作流用 UNETLoader（`unet_name`）而不是
 * 传统 CheckpointLoader，这里一并识别，保证「模型」字段能从图片 Meta 里解析出来。
 */
const DIFFUSION_LOADER_INPUT_KEYS = ["ckpt_name", "unet_name", "model_name"];
const SAMPLER_CLASS_TYPES = new Set([
  "KSampler",
  "KSamplerAdvanced",
  "SamplerCustom",
]);

export type ParsedComfyLora = {
  nodeId: string;
  name: string;
  rawName: string;
  strengthModel: number | null;
  strengthClip: number | null;
};

export type ParsedComfyNode = {
  class_type: string;
  title?: string;
  inputs: Record<string, unknown>;
};

export type ParsedComfyWorkflow = {
  checkpoint: string | null;
  checkpointNodeId: string | null;
  checkpointRaw: string | null;
  positivePrompt: string | null;
  negativePrompt: string | null;
  loras: ParsedComfyLora[];
  nodes: Record<string, ParsedComfyNode>;
};

export type ComfyWorkflowSource = "embedded";

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function isComfyApiPrompt(value: unknown): value is ComfyApiPrompt {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return false;

  return entries.some(([, node]) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return false;
    }
    const record = node as Record<string, unknown>;
    return (
      typeof record.class_type === "string" &&
      record.inputs != null &&
      typeof record.inputs === "object" &&
      !Array.isArray(record.inputs)
    );
  });
}

function unwrapComfyApiPrompt(value: unknown): ComfyApiPrompt | null {
  if (isComfyApiPrompt(value)) return value;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["prompt", "workflow"]) {
    const nested = record[key];
    if (isComfyApiPrompt(nested)) return nested;
  }

  return null;
}

function resolveClipText(workflow: ComfyApiPrompt, ref: unknown): string | null {
  if (!Array.isArray(ref) || ref.length < 1) return null;
  const nodeId = String(ref[0]);
  const node = workflow[nodeId];
  if (!node || node.class_type !== "CLIPTextEncode") return null;
  return asString(node.inputs.text);
}

export function extractPromptsFromWorkflow(workflow: ComfyApiPrompt): {
  positivePrompt: string | null;
  negativePrompt: string | null;
} {
  let positivePrompt: string | null = null;
  let negativePrompt: string | null = null;

  for (const node of Object.values(workflow)) {
    if (!SAMPLER_CLASS_TYPES.has(node.class_type)) continue;

    const positive = resolveClipText(workflow, node.inputs.positive);
    const negative = resolveClipText(workflow, node.inputs.negative);
    if (positive) positivePrompt = positive;
    if (negative) negativePrompt = negative;
  }

  return { positivePrompt, negativePrompt };
}

export function parseComfyWorkflow(
  workflow: ComfyApiPrompt
): ParsedComfyWorkflow {
  let checkpoint: string | null = null;
  let checkpointNodeId: string | null = null;
  let checkpointRaw: string | null = null;
  const loras: ParsedComfyLora[] = [];
  const nodes: Record<string, ParsedComfyNode> = {};

  for (const [nodeId, node] of Object.entries(workflow)) {
    const title =
      typeof node._meta?.title === "string" ? node._meta.title : undefined;

    nodes[nodeId] = {
      class_type: node.class_type,
      ...(title ? { title } : {}),
      inputs: { ...node.inputs },
    };

    if (CHECKPOINT_CLASS_TYPES.has(node.class_type)) {
      const ckpt = asString(node.inputs.ckpt_name);
      if (ckpt) {
        checkpointRaw = ckpt;
        checkpoint = displayModelFileName(ckpt);
        checkpointNodeId = nodeId;
      }
      continue;
    }

    // UNETLoader / 其它扩散模型加载器：取 unet_name / model_name
    if (!checkpointRaw) {
      for (const key of DIFFUSION_LOADER_INPUT_KEYS) {
        const named = asString(node.inputs[key]);
        if (named) {
          checkpointRaw = named;
          checkpoint = displayModelFileName(named);
          checkpointNodeId = nodeId;
          break;
        }
      }
    }

    if (LORA_CLASS_TYPES.has(node.class_type)) {
      const rawName = asString(node.inputs.lora_name);
      if (rawName) {
        loras.push({
          nodeId,
          name: displayModelFileName(rawName),
          rawName,
          strengthModel: asNumber(node.inputs.strength_model),
          strengthClip: asNumber(node.inputs.strength_clip),
        });
      }
    }
  }

  const { positivePrompt, negativePrompt } = extractPromptsFromWorkflow(workflow);

  return {
    checkpoint,
    checkpointNodeId,
    checkpointRaw,
    positivePrompt,
    negativePrompt,
    loras,
    nodes,
  };
}

const WORKFLOW_JSON_FIELD_KEYS = new Set(["Comment", "workflow", "prompt"]);

function tryExtractWorkflowFromField(field: {
  key: string;
  value: string;
  json?: unknown;
}): ComfyApiPrompt | null {
  const fromJson = unwrapComfyApiPrompt(field.json);
  if (fromJson) return fromJson;

  try {
    const parsed = JSON.parse(field.value);
    return unwrapComfyApiPrompt(parsed);
  } catch {
    return null;
  }
}

export function extractComfyWorkflowFromFields(
  fields: Array<{ key: string; value: string; json?: unknown }>
): ComfyApiPrompt | null {
  for (const field of fields) {
    if (!WORKFLOW_JSON_FIELD_KEYS.has(field.key)) continue;
    const workflow = tryExtractWorkflowFromField(field);
    if (workflow) return workflow;
  }

  for (const field of fields) {
    const workflow = tryExtractWorkflowFromField(field);
    if (workflow) return workflow;
  }

  return null;
}

/** 从图片内嵌字段里找 ComfyUI 工作流（参数唯一来源，不再有旁车 JSON） */
export function resolveComfyWorkflowFromInspect(input: {
  fields?: Array<{ key: string; value: string; json?: unknown }>;
}): { workflow: ComfyApiPrompt; source: ComfyWorkflowSource } | null {
  const fromFields = input.fields
    ? extractComfyWorkflowFromFields(input.fields)
    : null;
  if (fromFields) {
    return { workflow: fromFields, source: "embedded" };
  }

  return null;
}

export function logParsedComfyWorkflowFromInspect(input: {
  fields?: Array<{ key: string; value: string; json?: unknown }>;
  fileName?: string;
}): ParsedComfyWorkflow | null {
  const resolved = resolveComfyWorkflowFromInspect(input);
  if (!resolved) return null;

  const parsed = parseComfyWorkflow(resolved.workflow);
  const label = input.fileName
    ? `[ComfyUI Workflow] ${input.fileName}`
    : "[ComfyUI Workflow]";

  console.log(label, {
    source: resolved.source,
    checkpoint: parsed.checkpoint,
    checkpointNodeId: parsed.checkpointNodeId,
    positivePrompt: parsed.positivePrompt,
    negativePrompt: parsed.negativePrompt,
    loras: parsed.loras.map((lora) => ({
      nodeId: lora.nodeId,
      name: lora.name,
      strengthModel: lora.strengthModel,
      strengthClip: lora.strengthClip,
    })),
    nodes: parsed.nodes,
  });

  return parsed;
}

/** @deprecated Use logParsedComfyWorkflowFromInspect */
export function logParsedComfyWorkflowFromFields(
  fields: Array<{ key: string; value: string; json?: unknown }>,
  context?: { fileName?: string }
): ParsedComfyWorkflow | null {
  return logParsedComfyWorkflowFromInspect({
    fields,
    fileName: context?.fileName,
  });
}

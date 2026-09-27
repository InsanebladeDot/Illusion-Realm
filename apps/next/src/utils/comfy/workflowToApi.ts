/**
 * 把 ComfyUI 的「界面工作流」（节点 + 连线）转成 API prompt（`/prompt` 要的格式）。
 *
 * 怎么做：递归解析节点的 inputs / links，摊平成「节点 id → 入参」的结构；
 * 另有 `cloneComfyPrompt` 供填槽前深拷贝。
 */
import type { ComfyApiPrompt } from "@/types/comfy";

type WorkflowInput = {
  name: string;
  link?: number | null;
  widget?: { name: string };
};

type WorkflowNode = {
  id: number;
  type: string;
  inputs?: WorkflowInput[];
  widgets_values?: unknown[];
};

type WorkflowLink = [
  number,
  number,
  number,
  number,
  number,
  string,
];

export type ComfyUiWorkflow = {
  nodes: WorkflowNode[];
  links: WorkflowLink[];
};

const PREVIEW_TO_SAVE_IMAGE = new Set(["PreviewImage"]);

function isControlAfterGenerate(value: unknown): boolean {
  return value === "fixed" || value === "randomize" || value === "increment";
}

function readWidgetValue(
  nodeType: string,
  inputName: string,
  values: unknown[],
  index: number
): { value: unknown; nextIndex: number } {
  const current = values[index];

  if (
    nodeType === "KSampler" &&
    inputName === "seed" &&
    isControlAfterGenerate(values[index + 1])
  ) {
    return { value: current, nextIndex: index + 2 };
  }

  return { value: current, nextIndex: index + 1 };
}

function resolveClassType(nodeType: string): string {
  if (PREVIEW_TO_SAVE_IMAGE.has(nodeType)) {
    return "SaveImage";
  }
  return nodeType;
}

function buildPreviewSaveInputs(
  node: WorkflowNode,
  inputs: Record<string, unknown>
): Record<string, unknown> {
  const imageInput = node.inputs?.find((input) => input.name === "images");
  if (!imageInput?.link) {
    return {
      filename_prefix: "IllusionRealm",
      ...inputs,
    };
  }

  return {
    filename_prefix: "IllusionRealm",
    images: inputs.images,
  };
}

export function workflowToApiPrompt(workflow: ComfyUiWorkflow): ComfyApiPrompt {
  const linksById = new Map<
    number,
    { from: string; fromSlot: number; to: string; toSlot: number }
  >();

  for (const link of workflow.links ?? []) {
    const [linkId, fromNode, fromSlot, toNode, toSlot] = link;
    linksById.set(linkId, {
      from: String(fromNode),
      fromSlot,
      to: String(toNode),
      toSlot,
    });
  }

  const prompt: ComfyApiPrompt = {};

  for (const node of workflow.nodes ?? []) {
    const nodeInputs: Record<string, unknown> = {};
    let widgetIndex = 0;
    const widgetValues = node.widgets_values ?? [];

    for (const input of node.inputs ?? []) {
      if (input.link != null) {
        const link = linksById.get(input.link);
        if (link) {
          nodeInputs[input.name] = [link.from, link.fromSlot];
        }
        continue;
      }

      if (!input.widget?.name) continue;

      const { value, nextIndex } = readWidgetValue(
        node.type,
        input.name,
        widgetValues,
        widgetIndex
      );
      widgetIndex = nextIndex;

      if (value === undefined) continue;
      nodeInputs[input.name] = value;
    }

    const classType = resolveClassType(node.type);
    const inputs =
      classType === "SaveImage" && node.type === "PreviewImage"
        ? buildPreviewSaveInputs(node, nodeInputs)
        : nodeInputs;

    prompt[String(node.id)] = {
      class_type: classType,
      inputs,
    };
  }

  return prompt;
}

export function cloneComfyPrompt(prompt: ComfyApiPrompt): ComfyApiPrompt {
  return structuredClone(prompt);
}

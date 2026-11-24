/** 音频节点只保存纯参数；连线参考按稳定 ID 排序，模板与请求沿用创作页。 */
import { t } from "@/i18n";
import type { CanvasData, CanvasDocument, CanvasNode } from "./canvas-model";
import { defaultAudioLoras, type AudioWorkflowInput } from "@/utils/comfy/audio-workflow";
import { generateRandomSeed } from "@/utils/seed";

export function canvasAudioReferences(data: Pick<CanvasData, "audioParameters">, sources: Pick<CanvasNode, "id" | "data">[]) {
  const linked = sources.filter(node => node.data.kind === "audio").sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return [...linked.map(node => node.data.media), ...(data.audioParameters?.reference ? [data.audioParameters.reference] : [])];
}

export function canvasAudioInput(node: CanvasNode, document: CanvasDocument) {
  const sourceIds = new Set(document.edges.filter(edge => edge.target === node.id).map(edge => edge.source));
  const references = canvasAudioReferences(node.data, document.nodes.filter(item => sourceIds.has(item.id)));
  // 模板只有一个音频槽，多条连线不能偷偷取第一条，也不能把缺失来源当成无参考。
  if (references.length > 1 || references.some(item => item?.kind !== "audio")) throw Error(t("create.audio.invalidReference"));
  return references[0] ?? null;
}

export function canvasAudioSettings(data: CanvasData, reference: boolean): AudioWorkflowInput {
  const row = data.audioParameters ?? {};
  const seed = row.random !== false ? generateRandomSeed() : /^\d+$/.test(row.seed ?? "0") ? Number(row.seed ?? "0") : NaN;
  return { prompt: data.prompt, promptConversion: data.promptConversion, promptReferenceLabels: data.promptReferenceLabels, seed, loras: row.loras ?? defaultAudioLoras(), unetName: row.unetName,
    steps: row.steps, durationSeconds: row.durationSeconds, modelOverrides: row.modelOverrides?.[reference ? "reference" : "text"] };
}

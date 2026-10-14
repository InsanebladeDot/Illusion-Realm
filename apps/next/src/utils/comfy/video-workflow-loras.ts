/** Read template LoRAs and rebuild their model chain only after user edits; preserve all other video connections. */
import type { ComfyApiPrompt } from "@/types/comfy";
import { t } from "@/i18n";
import { isMinimaxWorkflow } from "@/data/videoForm";

export interface VideoLora { id: string; name: string; strength: number }
function loraEntries(prompt: ComfyApiPrompt) {
  return Object.entries(prompt).filter(([, node]) => node.class_type === "LoraLoaderModelOnly");
}
export function getVideoLoras(prompt: ComfyApiPrompt): VideoLora[] {
  return loraEntries(prompt).map(([id, node]) => ({ id, name: String(node.inputs.lora_name), strength: Number(node.inputs.strength_model) }));
}
function validateLoras(loras: VideoLora[], workflowId: string) {
  for (const lora of loras) {
    if (!lora.name || /^(?:[a-z]:|[/\\])|(?:^|[/\\])\.\.(?:[/\\]|$)/i.test(lora.name) || !Number.isFinite(lora.strength) || Math.abs(lora.strength) > 5) throw new Error(t("create.videoModels.invalid"));
    if (isMinimaxWorkflow(workflowId) && !/^minimax[/\\]/i.test(lora.name)) throw new Error(t("create.videoModels.incompatible"));
  }
}
export function applyVideoLoras(prompt: ComfyApiPrompt, loras: VideoLora[] | undefined, workflowId: string) {
  if (loras === undefined) return;
  validateLoras(loras, workflowId);
  const entries = loraEntries(prompt);
  const ids = new Set(entries.map(([id]) => id));
  const unetId = Object.keys(prompt).find((id) => prompt[id].class_type === "UNETLoader");
  const base = entries.find(([, node]) => Array.isArray(node.inputs.model) && !ids.has(String(node.inputs.model[0])))?.[1].inputs.model ?? (unetId ? [unetId, 0] : undefined);
  if (!Array.isArray(base)) throw new Error(t("create.videoModels.missingNode", { name: "LoraLoaderModelOnly" }));
  let link = [...base];
  for (const [id] of entries) delete prompt[id];
  for (const [index, lora] of loras.entries()) {
    let id = `ir_video_lora_${index}`;
    while (prompt[id]) id += "_";
    prompt[id] = { class_type: "LoraLoaderModelOnly", inputs: { model: link, lora_name: lora.name, strength_model: lora.strength } };
    link = [id, 0];
  }
  for (const [id, node] of Object.entries(prompt)) {
    if (id.startsWith("ir_video_lora_") && node.class_type === "LoraLoaderModelOnly") continue;
    for (const [key, value] of Object.entries(node.inputs)) {
      if (Array.isArray(value) && (ids.has(String(value[0])) || entries.length === 0 && key === "model" && value[0] === base[0])) node.inputs[key] = [...link];
    }
  }
}

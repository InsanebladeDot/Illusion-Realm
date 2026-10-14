/** Match every video loader against live ComfyUI names; reuse image name resolution and reject missing or ambiguous files before submission. */
import { fetchComfyModelLists } from "@/api/comfyui";
import { resolveComfyModelNameFromList } from "./comfyModelPath";
import { getVideoModelSlots, isVideoModelAllowed } from "./video-workflow-models";
import type { ComfyApiPrompt, ComfyModelLists } from "@/types/comfy";
import { t } from "@/i18n";
import { findMinimaxVideoNode } from "./minimax-video-node";

function nameKey(name: string) { return name.replace(/\\/g, "/").toLowerCase(); }
function resolveName(name: string, available: string[], label: string) {
  const resolved = resolveComfyModelNameFromList(name, available);
  const exact = available.some((item) => nameKey(item) === nameKey(name));
  const basename = nameKey(name).split("/").pop();
  const unique = available.filter((item) => nameKey(item).split("/").pop() === basename).length === 1;
  if (!available.includes(resolved) || !exact && !unique) throw new Error(t("create.videoModels.unavailable", { label, name }));
  return resolved;
}
export function applyResolvedVideoModels(prompt: ComfyApiPrompt, lists: ComfyModelLists) {
  const workflowId = findMinimaxVideoNode(prompt) ? "minimax" : undefined;
  for (const slot of getVideoModelSlots(prompt)) {
    const available = lists[slot.category];
    if (!Array.isArray(available)) continue;
    prompt[slot.id].inputs[slot.input] = resolveName(slot.defaultName, available.filter((name) => isVideoModelAllowed(slot, name, workflowId)), t(slot.label));
  }
}
export async function resolveVideoPromptModels(prompt: ComfyApiPrompt, server: string) {
  let lists: ComfyModelLists;
  try { lists = await fetchComfyModelLists(server, true); }
  catch { return; } // Preserve local/default names when list endpoints are unavailable, as in image generation.
  applyResolvedVideoModels(prompt, lists);
}

/** 在最终生成图上接注意力后端；像主水管加阀门，MODEL 分支改道，CLIP/VAE 等旁路保持原连线。 */
import type { ComfyApiPrompt } from "@/types/comfy";
import type { ModelAttentionSettings } from "@/types/model-attention";
import { t } from "@/i18n";

const LOADERS = new Set(["UNETLoader", "UnetLoaderGGUF", "CheckpointLoaderSimple", "CheckpointLoader"]);
const BACKEND_CLASS = "ModelAttentionBackend";

/** 只替换指定输出口；排除新阀门本身，防止把它接回自身形成环。 */
function reconnect(prompt: ComfyApiPrompt, source: string, output: number, target: unknown[], exclude: string) {
  for (const [id, node] of Object.entries(prompt)) {
    if (id === exclude) continue;
    for (const [key, link] of Object.entries(node.inputs)) {
      if (Array.isArray(link) && link[0] === source && link[1] === output) node.inputs[key] = [...target];
    }
  }
}

function bypass(prompt: ComfyApiPrompt, id: string) {
  const link = prompt[id].inputs.model;
  if (!Array.isArray(link) || typeof link[0] !== "string" || !prompt[link[0]] || link[0] === id) throw Error(t("create.attention.invalidGraph"));
  reconnect(prompt, id, 0, link, id);
  delete prompt[id];
}

/** 已有节点先更新；缺少时接在主加载器后。重复调用不叠加节点，关闭则原样接回上游模型。 */
export function applyModelAttention(prompt: ComfyApiPrompt, settings: ModelAttentionSettings) {
  if (typeof settings.enabled !== "boolean" || !["comfy kitchen attention", "pytorch attention"].includes(settings.backend)) throw Error(t("create.attention.invalid"));
  const existing = Object.entries(prompt).filter(([, node]) => node.class_type === BACKEND_CLASS);
  if (!settings.enabled) { for (const [id] of existing) bypass(prompt, id); return; }
  for (const [, node] of existing) node.inputs.attention = settings.backend;
  for (const [source, loader] of Object.entries(prompt)) {
    if (!LOADERS.has(loader.class_type)) continue;
    const consumers = Object.values(prompt).filter(node => Object.values(node.inputs).some(link => Array.isArray(link) && link[0] === source && link[1] === 0));
    if (!consumers.length) continue;
    const active = existing.find(([, node]) => Array.isArray(node.inputs.model) && node.inputs.model[0] === source && node.inputs.model[1] === 0);
    if (active) { reconnect(prompt, source, 0, [active[0], 0], active[0]); continue; }
    let id = `ir_attention_${source}`;
    while (prompt[id]) id += "_";
    reconnect(prompt, source, 0, [id, 0], id);
    prompt[id] = { class_type: BACKEND_CLASS, inputs: { attention: settings.backend, model: [source, 0] } };
  }
}

/** 按本机日期汇总生成记录；像对账，任务算成功率，已保存图片算产量。 */
import { GenerationRecordSchema, type GenerationHistory, type GenerationModel, type GenerationRecord } from "@/schemas/generation-history.schema";
import type { ComfyApiPrompt } from "@/types/comfy";

// 身份比较统一斜杠与大小写，保留目录、扩展名和角色；展示仍用原名。
export function generationModelKey(model: GenerationModel): string {
  return `${model.role}:${model.name.replace(/\\/g, "/").toLowerCase()}`;
}

// 逐条恢复，坏记录不影响好记录；同任务取最后一份有效记录，旧文档缺段返回空账本。
export function normalizeGenerationHistory(value: unknown): GenerationHistory {
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("records" in value) || !Array.isArray(value.records)) return { version: 1, records: [] };
  const records = new Map<string, GenerationRecord>();
  for (const entry of value.records) {
    const parsed = GenerationRecordSchema.safeParse(entry);
    if (parsed.success) records.set(parsed.data.id, parsed.data);
  }
  return { version: 1, records: [...records.values()] };
}

// 从实际工作流取主模型和 LoRA，包含模板预载项；VAE、CLIP 等辅助加载器不计入。
const MODEL_LOADERS = {
  UNETLoader: { field: "unet_name", role: "main", loader: "unet" },
  CheckpointLoaderSimple: { field: "ckpt_name", role: "main", loader: "checkpoints" },
  CheckpointLoader: { field: "ckpt_name", role: "main", loader: "checkpoints" },
  LoraLoader: { field: "lora_name", role: "lora", loader: "loras" },
  LoraLoaderModelOnly: { field: "lora_name", role: "lora", loader: "loras" },
} as const;

// 像沿插线板查电器：从图片输出回溯，只统计接上输出的加载器，visited 防止绕圈。
// 无输出的检查片段保留全部节点作身份预览，不代表可执行。
function generationModelNodes(prompt: ComfyApiPrompt) {
  const pending = Object.keys(prompt).filter(id => ["SaveImage", "PreviewImage"].includes(prompt[id].class_type));
  if (!pending.length) return Object.values(prompt);
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id) || !prompt[id]) continue;
    visited.add(id);
    for (const value of Object.values(prompt[id].inputs)) {
      if (Array.isArray(value) && value.length === 2 && Number.isInteger(value[1]) && prompt[String(value[0])]) pending.push(String(value[0]));
    }
  }
  return [...visited].map(id => prompt[id]);
}

// 同图中的同一模型只记一次；LoRA 的模型和 CLIP 权重都为零才不计，负权重仍生效。
export function generationModelsFromPrompt(prompt: ComfyApiPrompt): GenerationModel[] {
  const models = new Map<string, GenerationModel>();
  for (const node of generationModelNodes(prompt)) {
    const definition = MODEL_LOADERS[node.class_type as keyof typeof MODEL_LOADERS];
    if (!definition) continue;
    const name = node.inputs[definition.field];
    if (typeof name !== "string" || !name.trim()) continue;
    if (definition.role === "lora" && Number(node.inputs.strength_model ?? 0) === 0 && Number(node.inputs.strength_clip ?? 0) === 0) continue;
    const model: GenerationModel = { role: definition.role, loader: definition.loader, name: name.replace(/\\/g, "/") };
    models.set(generationModelKey(model), model);
  }
  return [...models.values()];
}

// 按当前本机时区分组，不用 UTC 日期；时区变化不会改写原始时间戳。
function dayKey(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// 汇总只作展示，不再存盘；图片数与任务数分开，主模型与 LoRA 的比例各自计算。
export interface GenerationStatistics {
  total: number; attempts: number; successRate: number | null; averageMs: number | null;
  modelCount: number; mainCount: number; loraCount: number;
  dates: string[]; counts: number[]; rates: (number | null)[]; hours: number[];
  outcomes: { name: "completed" | "failed"; value: number }[];
  usage: Record<"main" | "lora", { name: string; value: number }[]>;
}

// 按完成日分组，空日期保留；没运行的成功率是 null，运行全失败才是 0。
function dailyStatistics(records: GenerationRecord[], dates: string[]) {
  const daily = dates.map(date => records.filter(record => dayKey(record.finishedAt) === date));
  return {
    dates,
    counts: daily.map(entries => entries.reduce((sum, entry) => sum + entry.images, 0)),
    rates: daily.map(entries => entries.length
      ? entries.filter(entry => entry.status === "completed").length / entries.length * 100 : null),
  };
}

// 成功率按任务数算；平均耗时只取有开始时间的成功任务，含准备和保存，不含排队。
// 图片数按实际保存量算，失败前产出的图片也保留。
function metricStatistics(records: GenerationRecord[], successful: GenerationRecord[]) {
  const timed = successful.filter(record => record.startedAt !== null);
  return {
    total: records.reduce((sum, record) => sum + record.images, 0),
    attempts: records.length,
    successRate: records.length ? successful.length / records.length * 100 : null,
    averageMs: timed.length
      ? timed.reduce((sum, record) => sum + record.finishedAt - record.startedAt!, 0) / timed.length : null,
  };
}

// 含今天的最近若干日，按日历加减兼容夏令时，不用固定 24 小时倒推。
function calendarDates(days: number, now: number): string[] {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - days + index + 1);
    return dayKey(date.getTime());
  });
}

// 每张已保存图片为每个不同模型计一次；同任务先去重，按次数和完整名称稳定排序。
function modelUsage(records: GenerationRecord[], role: "main" | "lora") {
  const counts = new Map<string, { name: string; value: number }>();
  for (const record of records) {
    const unique = new Map(record.models.filter(model => model.role === role).map(model => [generationModelKey(model), model]));
    for (const [key, model] of unique) {
      if (record.images > 0) counts.set(key, { name: model.name, value: (counts.get(key)?.value ?? 0) + record.images });
    }
  }
  return [...counts.values()].sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
}

// 按完成时间过滤周期，排除取消和未来记录；空账本的成功率与耗时保持 null。
// now 可传入固定时间，方便验证跨日边界；切换周期不修改历史。
export function summarizeGenerationHistory(history: GenerationHistory, days: number, now = Date.now()): GenerationStatistics {
  const dates = calendarDates(days, now);
  const records = history.records.filter(record => record.status !== "cancelled" && record.finishedAt <= now && dates.includes(dayKey(record.finishedAt)));
  const successful = records.filter(record => record.status === "completed");
  const usage = { main: modelUsage(records, "main"), lora: modelUsage(records, "lora") };
  const hours = Array.from({ length: 24 }, () => 0);
  for (const record of records) hours[new Date(record.finishedAt).getHours()] += record.images;
  return {
    ...metricStatistics(records, successful),
    ...dailyStatistics(records, dates),
    modelCount: usage.main.length + usage.lora.length, mainCount: usage.main.length, loraCount: usage.lora.length,
    hours, usage, outcomes: [{ name: "completed", value: successful.length }, { name: "failed", value: records.length - successful.length }],
  };
}

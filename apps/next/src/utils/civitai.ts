/** Civitai 数据适配：校验外部 JSON、限定请求来源，并将基础模型和下载地址规范化。 */
import { t } from "@/i18n";

export const CIVITAI_SOURCES = ["https://civitai.red", "https://civitai.com"] as const;
export interface CivitaiFile { id: number; name: string; sizeKB: number; downloadUrl: string; primary: boolean; format: string; sha256: string }
export interface CivitaiVersion { id: number; name: string; baseModel: string; description: string; files: CivitaiFile[]; images: string[]; trainedWords: string[] }
export interface CivitaiModel { id: number; name: string; type: string; description: string; baseModels: string[]; creator: string; avatar: string; versions: CivitaiVersion[]; stats: Record<string, number> }
export interface CivitaiFilters { source: string; query: string; type: string; base: string; sort: string }
export interface CivitaiPage { models: CivitaiModel[]; next: string | null }
const object = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown): string => typeof value === "string" ? value : "";
const number = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? value : 0;
const strings = (value: unknown): string[] => array(value).filter((item): item is string => typeof item === "string" && item.trim().length > 0);

export function civitaiUrl(value: unknown): string {
  try { const url = new URL(string(value)); return url.protocol === "https:" && !url.username && !url.password ? url.href : ""; }
  catch { return ""; }
}
function parseFile(value: unknown): CivitaiFile {
  const file = object(value);
  return { id: number(file.id), name: string(file.name), sizeKB: Math.max(0, number(file.sizeKB)), downloadUrl: civitaiUrl(file.downloadUrl), primary: file.primary === true, format: string(object(file.metadata).format), sha256: string(object(file.hashes).SHA256) };
}
function parseImages(value: unknown): string[] {
  return array(value).map(object).filter((image) => image.type === "image" && image.nsfw !== true && number(image.nsfwLevel) <= 1).map((image) => civitaiUrl(image.url).replace("original=true", "width=640")).filter(Boolean);
}
function parseVersion(value: unknown): CivitaiVersion {
  const version = object(value);
  return { id: number(version.id), name: string(version.name), baseModel: string(version.baseModel), description: string(version.description), files: array(version.files).map(parseFile).filter((file) => file.id > 0 && file.name), images: [...new Set(parseImages(version.images))], trainedWords: strings(version.trainedWords) };
}
function parseModel(value: unknown): CivitaiModel {
  const model = object(value), creator = object(model.creator), stats = object(model.stats);
  return { id: number(model.id), name: string(model.name), type: string(model.type), description: string(model.description), baseModels: strings(model.baseModels), creator: string(creator.username), avatar: civitaiUrl(creator.image), versions: array(model.modelVersions).map(parseVersion).filter((version) => version.id > 0), stats: Object.fromEntries(Object.entries(stats).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))) };
}
export function civitaiRequestUrl(filters: CivitaiFilters): string {
  const params = new URLSearchParams({ limit: "12", nsfw: "false", primaryFileOnly: "false", sort: filters.sort });
  if (filters.type) params.set("types", filters.type);
  if (filters.base) params.set("baseModels", filters.base);
  if (filters.query) params.set("query", filters.query);
  return `${filters.source}/api/v1/models?${params}`;
}
export function civitaiInput(filters: CivitaiFilters): CivitaiFilters {
  try {
    const url = new URL(filters.query);
    if (!["civitai.red", "civitai.com"].includes(url.hostname)) return filters;
    if (url.pathname.startsWith("/models/")) return { ...filters, query: url.pathname.split("/")[2] || "" };
    if (url.pathname !== "/search/models") return filters;
    const type = url.searchParams.get("modelType") || "";
    return { ...filters, query: (url.searchParams.get("query") || "").trim(), base: url.searchParams.get("baseModel") || "", type: ["", "LORA", "Checkpoint", "TextualInversion"].includes(type) ? type : filters.type };
  } catch { return { ...filters, query: filters.query.trim() }; }
}
export async function fetchCivitai(filters: CivitaiFilters, next: string | null, signal: AbortSignal): Promise<CivitaiPage> {
  if (!CIVITAI_SOURCES.some((source) => source === filters.source)) throw new Error(t("toolBox.civitai.requestFailed"));
  const id = /^\d+$/.test(filters.query), url = next || (id ? `${filters.source}/api/v1/models/${filters.query}` : civitaiRequestUrl(filters));
  const response = await fetch(url, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error(t("toolBox.civitai.requestFailed"));
  const data: unknown = await response.json(), payload = object(data);
  if (!next && id && (!payload.id || !payload.name)) throw new Error(t("toolBox.civitai.requestFailed"));
  if ((next || !id) && !Array.isArray(payload.items)) throw new Error(t("toolBox.civitai.requestFailed"));
  const models = (!next && id ? [payload] : array(payload.items)).map(parseModel).filter((model) => model.id > 0 && model.name);
  const nextUrl = civitaiUrl(object(payload.metadata).nextPage);
  const parsed = nextUrl ? new URL(nextUrl) : null;
  return { models, next: parsed?.origin === filters.source && parsed.pathname === "/api/v1/models" ? nextUrl : null };
}
export function civitaiDownload(file: CivitaiFile, source: string): string {
  const value = civitaiUrl(file.downloadUrl);
  if (!value) return "";
  const url = new URL(value);
  return ["civitai.red", "civitai.com"].includes(url.hostname) && url.pathname.startsWith("/api/download/models/") ? source + url.pathname + url.search : value;
}
export function civitaiDescription(value: string): string {
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(value, "text/html");
  doc.querySelectorAll("script,style,iframe").forEach((node) => node.remove());
  doc.querySelectorAll("p,br,li").forEach((node) => node.append("\n"));
  return doc.body.textContent?.trim() || "";
}

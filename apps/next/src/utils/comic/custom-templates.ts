/** 校验用户模板的版本与几何；按字段白名单读取，阻止图片内容进入模板库。 */
import type { ComicTemplateLibrary, SavedComicTemplate } from "@/types/comic-template";
import { COMIC_CATEGORIES, type ComicFrame } from "@/data/comic-templates";
import { isComicDimension } from "./page-size";

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
export const readBackgroundColor = (value: unknown): string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : "#ffffff";
function validFrame(value: unknown): value is ComicFrame {
  if (!record(value)) return false;
  const number = (key: string) => typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 100;
  return ["x", "y", "width", "height"].every(number) && Number(value.width) > 0 && Number(value.height) > 0
    && Number(value.x) + Number(value.width) <= 100.001 && Number(value.y) + Number(value.height) <= 100.001
    && Array.isArray(value.vertices) && value.vertices.length >= 3 && value.vertices.every(p => record(p)
      && typeof p.x === "number" && typeof p.y === "number" && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100);
}
export function geometryOnly(frames: ComicFrame[]): ComicFrame[] {
  return frames.map(({ x, y, width, height, vertices }) => ({ x, y, width, height, vertices: vertices.map(p => ({ x: p.x, y: p.y })) }));
}
function readCategory(value: string): string | null {
  const category = value.trim().slice(0, 80);
  if (COMIC_CATEGORIES.some(item => item === category)) return category;
  return category.startsWith("custom:") && category.slice(7).trim() ? `custom:${category.slice(7).trim()}` : null;
}
function readTemplate(value: unknown): SavedComicTemplate | null {
  if (!record(value) || typeof value.id !== "string" || !value.id || typeof value.name !== "string" || !value.name.trim()
    || typeof value.category !== "string" || !value.category.trim() || !Array.isArray(value.frames) || !value.frames.length || !value.frames.every(validFrame)) return null;
  const size = value.pageSize, category = readCategory(value.category);
  if (!category) return null;
  if (!record(size) || typeof size.width !== "number" || typeof size.height !== "number" || !isComicDimension(size.width) || !isComicDimension(size.height)) return null;
  return { id: value.id, name: value.name.trim().slice(0, 80), category, frames: geometryOnly(value.frames), pageSize: { width: size.width, height: size.height }, backgroundColor: readBackgroundColor(value.backgroundColor) };
}
export function readComicTemplateLibrary(value: unknown): ComicTemplateLibrary {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.templates)) return { version: 1, templates: [] };
  const ids = new Set<string>();
  const templates = value.templates.map(readTemplate).filter((item): item is SavedComicTemplate => {
    if (!item || ids.has(item.id)) return false; ids.add(item.id); return true;
  });
  return { version: 1, templates };
}
export const PANEL_COLORS = ["#e8edef", "#f2e9e7", "#e7efea"];
export function placeholderImage(index: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320"><rect width="240" height="320" fill="${PANEL_COLORS[index % 3]}"/><text x="120" y="160" text-anchor="middle" dominant-baseline="middle" fill="#57646c" font-size="24">${index + 1}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** 按完整路径优先、唯一文件名兜底核对默认扩展；同名多份时不替用户猜文件。 */
import { t } from "@/i18n";

const nameKey = (name: string) => name.replace(/\\/g, "/").toLowerCase();

export function defaultLoraIssues(names: readonly string[], available: readonly string[]) {
  const keys = available.map(nameKey);
  return names.flatMap(name => {
    const key = nameKey(name);
    if (keys.includes(key)) return [];
    const matches = keys.filter(item => item.split("/").pop() === key.split("/").pop());
    return matches.length === 1 ? [] : [t(matches.length ? "canvas.defaultLoraAmbiguous" : "canvas.defaultLoraMissing", { name })];
  });
}

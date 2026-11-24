// 原合成器快照只保存 JSON 和资产编号，浏览器临时地址不得成为永久媒体引用。
// 像把剪辑单上的货架号与货物地址分开：搬工程时只替换 assets 内的真实路径。
// 原片段效果字段由原组件维护，这里限制规模和可序列化性，不重写其剪辑模型。
import { z } from "zod";

export type CompositionJson = string | number | boolean | null | CompositionJson[] | { [key: string]: CompositionJson };
export interface CompositionState { [key: string]: CompositionJson }

// 有界遍历还拒绝原型污染键和临时 URL；解析文件不执行其中任何内容。
// 所有素材 src/url 都必须使用资产编号，重开后由宿主换成 localfile 门票。
// 深度和总量都有限制，避免损坏工程在恢复阶段拖住窗口。
export function isCompositionState(value: unknown): value is CompositionState {
  let count = 0;
  const visit = (item: unknown, depth: number, key = ""): boolean => {
    if (++count > 100000 || depth > 16) return false;
    if (typeof item === "string") return item.length <= 32767 && (!['src', 'url'].includes(key) || /^composition-asset:[a-zA-Z0-9-]+$/.test(item));
    if (item === null || typeof item === "boolean") return true;
    if (typeof item === "number") return Number.isFinite(item);
    if (Array.isArray(item)) return item.length <= 5000 && item.every(child => visit(child, depth + 1));
    return !!item && typeof item === "object" && Object.entries(item).every(([name, child]) => !["__proto__", "constructor", "prototype"].includes(name) && visit(child, depth + 1, name));
  };
  return !!value && typeof value === "object" && !Array.isArray(value) && 'videoClips' in value && Array.isArray(value.videoClips) && 'audioClips' in value && Array.isArray(value.audioClips) && visit(value, 0);
}

// schema 工厂由画布注入已有媒体契约，避免合成与画布两个 schema 相互 import。
// assets 同时包括原组件内导入和画布连线素材，不把源节点删除等同于删除文件。
export function compositionSchema<T extends z.ZodType>(media: T) {
  return z.object({ version: z.literal(1), state: z.custom<CompositionState>(isCompositionState), assets: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9-]{1,200}$/), media })).max(5000) }).refine(value => validCompositionReferences(value.state, value.assets.map(asset => asset.id)));
}

// 二进制只在导出时跨桥接，用户文档仍仅保存路径；上限为单次 256 MiB。
// download 表示系统另存为，取消时必须返回 null，不能出现结果节点或成功提示。
export interface CompositionMediaRequest {
  name: string;
  workspace?: { id: string; folder: string };
  fileName: string;
  kind: "image" | "video" | "audio";
  bytes: Uint8Array;
  download: boolean;
}
export interface CompositionStoredMedia {
  workspace: { id: string; folder: string };
  media: { kind: "image" | "video" | "audio"; name: string; path: string; size: number };
}
// 本地另存为没有工程副本，也没有可供画布登记的媒体地址。
export type CompositionMediaResult = CompositionStoredMedia | { downloaded: true };

// 资产号像剪辑单的页码：不能重复登记，也不能引用不存在的一页。
// 路径更换只发生在资产表，片段参数不随打包、重命名而漂移。
// 完整遍历覆盖素材库和音轨，不只检查视频片段的第一层 src。
export function validCompositionReferences(state: CompositionState, ids: string[]): boolean {
  const known = new Set(ids);
  if (known.size !== ids.length) return false;
  const visit = (item: CompositionJson, key = ""): boolean => {
    if (typeof item === "string" && ["src", "url"].includes(key)) return known.has(item.slice("composition-asset:".length));
    if (Array.isArray(item)) return item.every(child => visit(child));
    return !item || typeof item !== "object" || Object.entries(item).every(([name, child]) => visit(child, name));
  };
  return visit(state);
}

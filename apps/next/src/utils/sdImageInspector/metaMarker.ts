/**
 * 内嵌 Meta 的版本标记块（`illusionRealmMeta`）编解码；设计与理由见下方注释。
 */
import { GENERATED_IMAGE_META_VERSION } from "@/types/generatedImageMeta";

/**
 * 图片内嵌 Meta 的**版本标记**。
 *
 * 为什么需要它：在此之前，落盘时只嵌入了工作流图（`prompt` 块），而
 * `GENERATED_IMAGE_META_VERSION` / `promptId` / `params` 全被丢弃 ——
 * 图上没有任何版本信息，于是「未来版本的图」与「别的工具生成的图」在读取侧
 * 完全无法区分，都会掉进「非本生成器生成」。基线统计也证实了这一点：
 * 2026-09-18 摸底的 28 张真实图片全部没有标记。
 *
 * 设计约束（见 AGENTS.md「数据契约与格式变更」段）：
 * 1. **独立块**，不动 `prompt` 块 —— 那个块必须与发送给 ComfyUI 的 API Prompt
 *    逐字一致（`smoke-anima-workflow` 有断言）。
 * 2. 读取侧对**没有标记**的图按 v1 推理：标记落地前产出的图必须仍可二创。
 * 3. 标记只记「谁写的、什么版本」，**不重复存参数** —— 参数仍从工作流图反推，
 *    避免同一份数据两个来源。
 */
export const META_MARKER_KEYWORD = "illusionRealmMeta";

/**
 * 没有标记块时假定的版本。取值等于标记机制落地时的当前版本：
 * 那批图确实是按 v1 格式写的，只是没留标记。
 */
export const LEGACY_META_VERSION = GENERATED_IMAGE_META_VERSION;

export type MetaMarker = {
  version: number;
  /** 生成该图的 ComfyUI prompt_id（诊断用，不参与逻辑） */
  promptId?: string;
};

/** PNG 的 tEXt 块只允许 Latin-1，非 ASCII 一律转义（沿用 embedComfyPrompt 的做法） */
function escapeNonAscii(value: string): string {
  return value.replace(
    /[\u007f-\uffff]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
}

export function encodeMetaMarker(marker: MetaMarker): string {
  const payload: MetaMarker = { version: marker.version };
  if (marker.promptId) payload.promptId = marker.promptId;
  return escapeNonAscii(JSON.stringify(payload));
}

/** 解析标记块；格式不对或缺少 version 时返回 null（当作「没有标记」处理） */
export function decodeMetaMarker(text: string): MetaMarker | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.version !== "number" || !Number.isFinite(record.version)) {
      return null;
    }
    return {
      version: record.version,
      promptId: typeof record.promptId === "string" ? record.promptId : undefined,
    };
  } catch {
    return null;
  }
}

/** 该版本号是否被当前应用支持（比当前版本新的图不做二创，避免误解析） */
export function isMetaVersionSupported(version: number): boolean {
  return version <= GENERATED_IMAGE_META_VERSION;
}

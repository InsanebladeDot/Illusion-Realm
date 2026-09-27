/**
 * 为「二创」单独取一次图片 Meta（不经过页面展示层）。
 *
 * 怎么做：解析图片 → 转成 Remix 需要的 Meta 文档；给「从历史图直接二创」用。
 */
import type { GeneratedImageMetaDocument } from "@/types/generatedImageMeta";
import type { SdImageInspectResult } from "@/types/sdImageMeta";
import { buildRemixMetaFromImageInspect } from "@/utils/remixFromInspect";
import { inspectGeneratedImageFromPath } from "@/utils/sdImageInspector/inspectImageFromPath";

export async function inspectImageMetaForRemix(
  filePath: string,
  fileName: string
): Promise<{
  embedded: SdImageInspectResult;
  meta: GeneratedImageMetaDocument | null;
}> {
  const embedded = await inspectGeneratedImageFromPath(filePath, fileName);
  const meta = buildRemixMetaFromImageInspect(embedded);
  return { embedded, meta };
}

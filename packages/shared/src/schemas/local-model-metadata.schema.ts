/** 本地模型旁的来源 JSON 的只读展示契约；不把原始 JSON 或任意文件读取暴露给渲染进程。 */
import { z } from "zod";

export const LocalModelMetadataSchema = z.object({
  version: z.literal(1),
  source: z.string(), sourceUrl: z.string(), sourceTitle: z.string(),
  modelPageUrl: z.string(), downloadUrl: z.string(), modelName: z.string(),
  versionName: z.string(), creator: z.string(), baseModel: z.string(), modelType: z.string(),
  trainedWords: z.array(z.string()), description: z.string(), versionDescription: z.string(),
  sha256: z.string(), downloadedAt: z.string(),
});
export const LocalModelMetadataEntrySchema = z.object({
  filePath: z.string(),
  status: z.enum(["ready", "missing", "invalid", "unsupported", "unavailable"]),
  metadata: LocalModelMetadataSchema.nullable(),
});
export const ReadLocalModelMetadataArgsSchema = z.tuple([
  z.array(z.string().trim().min(1).max(4096)).min(1).max(200),
]);
export type LocalModelMetadata = z.infer<typeof LocalModelMetadataSchema>;
export type LocalModelMetadataEntry = z.infer<typeof LocalModelMetadataEntrySchema>;

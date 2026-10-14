/** 模型下载 IPC 入参校验；主进程保留等价校验，不把 zod 带入打包运行时。 */
import { z } from "zod";

export const CivitaiApiKeySchema = z.string().max(4096).trim().regex(/^[\x21-\x7e]+$/);

export const ModelDownloadLocationSchema = z.object({ modelType: z.enum(["LORA", "Checkpoint", "TextualInversion"]), baseModel: z.string().max(120) }).strict();
export const ModelCategorySchema = z.string().trim().max(120).refine((value) => !value || (!/[<>:"/\\|?*\x00-\x1f]/.test(value) && !/[. ]$/.test(value) && !/^(\.{1,2}|CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i.test(value)));
export const MoveModelCategoryRequestSchema = z.object({
  folderPath: z.string().min(1).max(4096),
  targetRootPath: z.string().min(1).max(4096),
  category: ModelCategorySchema,
}).strict();
const batchFields = { folderPaths: z.array(z.string().min(1).max(4096)).min(1).max(200), acknowledged: z.literal(true) };
export const LocalModelBatchRequestSchema = z.discriminatedUnion("action", [
  z.object({ ...batchFields, action: z.literal("move"), targetRootPath: z.string().min(1).max(4096), category: ModelCategorySchema }).strict(),
  z.object({ ...batchFields, action: z.literal("delete") }).strict(),
]);
export const ModelDownloadRequestSchema = ModelDownloadLocationSchema.extend({
  modelName: z.string().trim().min(1).max(240),
  fileName: z.string().min(1).max(240).regex(/^[^<>:"/\\|?*\x00-\x1f]+\.(safetensors|ckpt|pt|pth|gguf)$/i).refine((value) => !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i.test(value)),
  downloadUrl: z.string().max(4096).regex(/^https:\/\/civitai\.(red|com)\/api\/download\/models\/\d+(\?[^#]*)?$/),
  category: ModelCategorySchema,
  sha256: z.string().regex(/^([a-f0-9]{64})?$/i),
  previewUrl: z.string().max(4096).refine((value) => !value || /^https:\/\/([a-z0-9-]+\.)?civitai\.(com|red)\//i.test(value)),
  logoDataUrl: z.string().max(28 * 1024 * 1024).regex(/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i).optional(),
}).strict();

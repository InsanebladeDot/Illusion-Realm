/** 模型下载 IPC 入参校验；主进程保留等价校验，不把 zod 带入打包运行时。 */
import { z } from "zod";
import setupDownloads from "../data/setup-downloads.json";
import { SetupDownloadIdSchema } from "./setup-download.schema";

export const CivitaiApiKeySchema = z.string().max(4096).trim().regex(/^[\x21-\x7e]+$/);

export const ModelDownloadLocationSchema = z.object({ modelType: z.enum(["LORA", "Checkpoint", "TextualInversion"]), baseModel: z.string().max(120) }).strict();
export const ModelCategorySchema = z.string().trim().max(120).refine((value) => !value || (!/[<>:"/\\|?*\x00-\x1f]/.test(value) && !/[. ]$/.test(value) && !/^(\.{1,2}|CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i.test(value)));
export const ModelDownloadTargetRequestSchema = ModelDownloadLocationSchema.extend({ modelName: z.string().trim().min(1).max(240).optional() });
export const CreateLocalModelFolderRequestSchema = z.object({
  root: ModelCategorySchema.refine(Boolean),
  parent: z.string().max(4096).refine(value => !value || value.split("/").every(segment => segment === segment.trim() && !!segment && ModelCategorySchema.safeParse(segment).success)),
  name: ModelCategorySchema.refine(Boolean),
}).strict();
export const DeleteLocalModelFolderRequestSchema = z.object({
  root: ModelCategorySchema.refine(Boolean),
  folder: CreateLocalModelFolderRequestSchema.shape.parent.refine(Boolean),
  acknowledged: z.literal(true),
}).strict();
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
export const ModelDownloadSourceSchema = z.object({
  modelId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  versionId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  versionName: z.string().max(240),
  creator: z.string().max(240),
  trainedWords: z.array(z.string().max(4096)).max(256),
  description: z.string().max(200000),
  versionDescription: z.string().max(200000),
}).strict();
export const ModelDownloadRequestSchema = ModelDownloadLocationSchema.extend({
  modelName: z.string().trim().min(1).max(240),
  fileName: z.string().min(1).max(240).regex(/^[^<>:"/\\|?*\x00-\x1f]+\.(safetensors|ckpt|pt|pth|gguf)$/i).refine((value) => !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i.test(value)),
  downloadUrl: z.string().max(4096).refine(value => /^https:\/\/civitai\.(red|com)\/api\/download\/models\/\d+(\?[^#]*)?$/.test(value) || setupDownloads.files.some(asset => asset.downloadUrl === value)),
  category: ModelCategorySchema,
  sha256: z.string().regex(/^([a-f0-9]{64})?$/i),
  previewUrl: z.string().max(4096).refine((value) => !value || /^https:\/\/([a-z0-9-]+\.)?civitai\.(com|red)\//i.test(value)),
  logoDataUrl: z.string().max(28 * 1024 * 1024).regex(/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i).optional(),
  source: ModelDownloadSourceSchema.optional(),
  setupId: SetupDownloadIdSchema.optional(),
}).strict().refine((value) => !value.source || value.source.versionId === Number(/\/models\/(\d+)/.exec(value.downloadUrl)?.[1]))
  .refine((value) => {
    if (!value.setupId) return /^https:\/\/civitai\.(red|com)\/api\/download\/models\//.test(value.downloadUrl);
    const asset = setupDownloads.files.find(item => item.id === value.setupId);
    // 安装编号像固定取货单，不能带着它换成另一个下载地址或文件名。
    return Boolean(asset && !value.source && !value.logoDataUrl && value.modelType === "Checkpoint" &&
      value.baseModel === asset.baseModel && value.modelName === asset.modelName && value.fileName === asset.fileName &&
      value.downloadUrl === asset.downloadUrl && value.sha256 === asset.sha256 && value.category === "" && value.previewUrl === "");
  });

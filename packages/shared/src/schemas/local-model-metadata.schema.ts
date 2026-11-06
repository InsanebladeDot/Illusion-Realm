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
/**
 * 补全请求只允许一个本地路径，绝对路径及配置目录权限由主进程最终检查。
 * tuple 禁止额外参数，调用方无法注入远程地址或 API Key。
 * 摘要不作为输入，必须由主进程实际读取该文件后产生。
 */
export const RecoverLocalModelArgsSchema = z.tuple([z.string().trim().min(1).max(4096)]);
/**
 * 业务状态保持可判别，避免把未找到、鉴权失败或本地变更混成成功。
 * recovered 必须同时具备来源资料和可解码封面，不再仅凭 JSON 判成功。
 * existing 表示已有可读取来源及封面，不代表本轮重新验证过它的哈希。
 * 不返回模型字节、密钥或原始错误堆栈；摘要可以用于手工复核。
 * cover=none 表示没有公开预览；unavailable 表示下载或保存未成功。
 * metadata 继续走原有只读入口，使所有展示遵循同一过滤规则。
 */
export const LocalModelRecoveryResultSchema = z.object({
  // busy 表示尚未启动读取，不自动排队所有被扫描出来的模型。
  // changed 是本地一致性失败，应等文件稳定后重新计算摘要。
  // auth 与 notFound 分开，避免把受限模型错误描述成没有收录。
  // noPreview：身份已匹配但没有可用预览，资料可以保留但仍未补全。
  // coverFailed：图片下载、保存或本地解码失败，不得归入完成数。
  // metadataInvalid：现有资料不可读取或版本不兼容，保留原文件并报告。
  // unsupportedType 表示网站有对应文件，但现有下载来源适配器不支持该类型。
  // 当前支持 LoRA、Checkpoint、TextualInversion，不能把其他类型猜成 Checkpoint。
  // 该状态也必须展示原因并可重试，不能记作成功或静默从批次删除。
  status: z.enum(["recovered", "existing", "notFound", "auth", "network", "invalid", "changed", "busy", "timeout", "io", "noPreview", "coverFailed", "metadataInvalid", "unsupportedType"]),
  sha256: z.string().regex(/^([a-f\d]{64})?$/i), cover: z.enum(["none", "saved", "preserved", "unavailable"]),
});
/**
 * 返回类型从运行时 schema 推导，主进程 JSDoc 与渲染层共用。
 * 新增失败原因必须同步词条与 UI，不回落成不可见的原始字符串。
 * 保持为结构化值，跨 IPC 时无需序列化 Error 实例。
 */
export type LocalModelRecoveryResult = z.infer<typeof LocalModelRecoveryResultSchema>;

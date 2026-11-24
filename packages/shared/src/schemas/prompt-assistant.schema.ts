/** 转译请求的跨进程校验；命名站点使用固定地址，自定义地址保留兼容。 */
import { z } from "zod";
import { AgentImagesSchema, AGENT_IMAGES_MAX_CHARS } from "./agent-messages.schema";
// 仅扩展原提示词助手契约，仍沿用同一转换和凭据 IPC。
// Euzhi 的 baseUrl 与 GLM 一样由主进程固定，页面不能用它指定密钥目的地。
// 保留字段以兼容现有连接表单，不额外持久化一套中转站配置。
export const PromptConnectionSchema = z.object({ provider: z.enum(["glm", "custom", "euzhi", "siliconflow"]), baseUrl: z.string().max(2048) });
export const PromptTransformSchema = PromptConnectionSchema.extend({
  model: z.string().trim().min(1).max(200), text: z.string().trim().max(16000),
  // Moss 的内置指令超过 8000 字符，上限与桌面端校验同步。
  instruction: z.string().trim().min(1).max(10000),
  // 与 Agent 共用图片格式和预算；只有图片时允许正文为空。
  images: AgentImagesSchema.optional(),
// 命名站点接受聊天型号，媒体生成和向量模型不能混入文本转译。
}).refine(value => Boolean(value.text || value.images?.length))
  .refine(value => (value.images ?? []).reduce((sum, image) => sum + image.length, 0) <= AGENT_IMAGES_MAX_CHARS)
  .refine(value => value.provider === "custom" || !/image|imagine|video|audio|embedding|rerank|whisper|tts|dall-e/i.test(value.model));
export const PromptSecretArgsSchema = z.tuple([PromptConnectionSchema, z.string().trim().min(1).max(4096).regex(/^[\x21-\x7e]+$/)]);

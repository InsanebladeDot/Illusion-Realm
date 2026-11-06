/** Validate transformations and connection-scoped credentials at the IPC boundary. */
import { z } from "zod";
// 仅扩展原提示词助手契约，仍沿用同一转换和凭据 IPC。
// Euzhi 的 baseUrl 与 GLM 一样由主进程固定，页面不能用它指定密钥目的地。
// 保留字段以兼容现有连接表单，不额外持久化一套中转站配置。
export const PromptConnectionSchema = z.object({ provider: z.enum(["glm", "custom", "euzhi"]), baseUrl: z.string().max(2048) });
export const PromptTransformSchema = PromptConnectionSchema.extend({
  model: z.string().trim().min(1).max(200), text: z.string().trim().min(1).max(16000),
  instruction: z.string().trim().min(1).max(8000),
// 命名 Euzhi 仅提供 Grok 聊天转换，图片和音视频 ID 不能走聊天接口。
// 这与 Agent 对本站的系列限制一致，主进程同时执行等价判断。
// 自定义站点仍保留用户原有模型命名自由，不将此限制扩大到其他供应商。
}).refine(value => value.provider !== "euzhi" || /^grok-/i.test(value.model) && !/image|imagine|video|audio/i.test(value.model));
export const PromptSecretArgsSchema = z.tuple([PromptConnectionSchema, z.string().trim().min(1).max(4096).regex(/^[\x21-\x7e]+$/)]);

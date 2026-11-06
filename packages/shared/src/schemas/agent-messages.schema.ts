/**
 * Agent 图片入参只允许内嵌图片，避免把本机路径或 blob URL 交给远端模型。
 * 单张限制按 base64 字符数计算，约允许八 MiB 二进制数据。
 * 每条消息至多八张，整次上下文另有总量限制，由传输端核对。
 * 旧客户端不传 images 时继续按纯文本处理。
 * 支持 PNG、JPEG、WebP、GIF；其他浏览器图片先转为 PNG。
 * schema 与主进程等价检查器共享同样的限制，不把任意远端 URL 当作附件。
 */
import { z } from 'zod';
export const AGENT_IMAGE_MAX_CHARS = 12 * 1024 * 1024;
export const AGENT_IMAGES_MAX_CHARS = 32 * 1024 * 1024;
// 八张上限适用于当前问题与每条历史用户消息，助手消息不接受用户图片输入。
// 总量上限覆盖多轮上下文，避免多次追问无限放大同一 stdin 请求。
// 这些公开常量没有用户数据，可以在渲染端提前给出保留草稿的错误提示。
export const AGENT_IMAGE_MAX_COUNT = 8;
// 只接受 base64 数据体，不支持 file、localfile、blob 或 HTTP 协议。
// 不解读图中文字或文件名，附件内容属于用户数据而非应用指令。
// 正则限定 MIME，实际图片解码失败仍由用户可见的发送错误处理。
export const AgentImageDataUrlSchema = z.string().max(AGENT_IMAGE_MAX_CHARS).regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/);
// 可选性由消息字段处理：空数组合法，表示本条消息只有文字。
// 有效图片不能被校验器静默删掉，否则用户会再次遇到“能预览却看不到”的问题。
// 错误由调用方转为固定提示，不将 base64 原文回显到界面或日志。
export const AgentImagesSchema = z.array(AgentImageDataUrlSchema).max(AGENT_IMAGE_MAX_COUNT);
// 历史文本保持原文，与当前问题图片使用同一数据 URL 约定。
// 仅 user 可以携带图片；工具生成的本地路径继续走原产物预览链路。
// 该 schema 不引入文档迁移，会话目前仍只存在本次客户端内存。
export const AgentHistoryItemSchema = z.object({ role: z.enum(['user', 'assistant']), content: z.string(), images: AgentImagesSchema.optional() }).refine(value => value.role === 'user' || !value.images?.length);

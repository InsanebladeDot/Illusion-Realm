/** ComfyUI 跨进程契约：校验工作流、服务地址及可取消请求的标识。 */
import { z } from 'zod';

export const ComfyRequestIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

/** ComfyUI API 工作流：节点 id → 节点定义 */
export const ComfyApiNodeSchema = z.object({
  class_type: z.string().min(1),
  inputs: z.record(z.string(), z.unknown()),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

export const ComfyApiPromptSchema = z.record(z.string(), ComfyApiNodeSchema);

/** comfy:generate */
export const ComfyGenerateArgsSchema = z.tuple([
  ComfyApiPromptSchema,
  z.string().min(1).max(255),
  ComfyRequestIdSchema.optional(),
]);

/** comfy:cancel：服务地址从主进程持有的请求中读取，避免取消其它来源的任务。 */
export const ComfyCancelArgsSchema = z.tuple([ComfyRequestIdSchema]);

/** comfy:listModels */
export const ComfyServerArgsSchema = z.tuple([z.string().min(1).max(255)]);

/**
 * comfy:freeMemory 只接受一个设置页使用的主机地址。
 * 地址不带协议、路径、查询串或凭据，固定路由由主进程选择。
 * 支持常见域名、IPv4，以及方括号包住的 IPv6；端口可省略。
 * 长度上限沿用当前 ComfyUI 地址约定，避免异常大字符串跨进程。
 * 这里只检查输入形状，服务是否在线仍由有界 HTTP 请求判断。
 * 主进程的 validateFreeMemory 必须使用相同的字符与长度规则。
 * 元组限制参数个数，空值与额外参数均不能触发网络操作。
 * 不把这条新规则扩展到现有生成调用，避免改变旧地址契约。
 */
export const ComfyFreeMemoryArgsSchema = z.tuple([
  z.string().min(1).max(255).regex(/^(?:[A-Za-z0-9.-]+|\[[A-Fa-f0-9:]+\])(?::[0-9]{1,5})?$/),
]);

/** comfy:uploadImage */
export const ComfyUploadImageArgsSchema = z.tuple([
  z.string().min(1).max(255),
  z.object({
    filename: z.string().min(1),
    dataBase64: z.string().min(1),
    subfolder: z.string().optional(),
  }),
]);

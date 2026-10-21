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

/** comfy:uploadImage */
export const ComfyUploadImageArgsSchema = z.tuple([
  z.string().min(1).max(255),
  z.object({
    filename: z.string().min(1),
    dataBase64: z.string().min(1),
    subfolder: z.string().optional(),
  }),
]);

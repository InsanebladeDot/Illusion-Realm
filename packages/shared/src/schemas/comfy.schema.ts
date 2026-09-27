import { z } from 'zod';

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
]);

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

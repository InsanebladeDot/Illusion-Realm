import { z } from 'zod';

/** userData:write —— 持久化文档（形状由 types/userData.ts 的 UserDataDocument 约束） */
export const WriteUserDataArgsSchema = z.tuple([
  z.object({
    version: z.number().int().optional(),
  }).passthrough(),
]);

/** window:setFullScreen */
export const SetFullScreenArgsSchema = z.tuple([z.boolean()]);

/** 超分配置可随工程保存；新增字段可缺省，让旧工程继续使用默认值。 */
import { z } from "zod";

export const UpscaleSettingsSchema = z.object({
  enabled: z.boolean(),
  model: z.enum(["seedvr2_3b", "seedvr2_7b"]),
  scale: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8)]),
  batchFrames: z.number().int().min(1).max(120).optional(),
  seedMode: z.enum(["random", "fixed", "shared"]).optional(),
  seed: z.string().regex(/^\d{1,16}$/).refine(value => Number.isSafeInteger(Number(value))).optional(),
}).strict();
export type UpscaleSettings = z.infer<typeof UpscaleSettingsSchema>;

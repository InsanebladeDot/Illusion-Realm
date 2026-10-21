/** 主题 IPC 只接受明暗偏好和可选十六进制底色，不暴露任意原生窗口配置。 */
import { z } from 'zod';

export const themeSourceRequestSchema = z.object({
  source: z.enum(['system', 'light', 'dark']),
  shellColor: z.string().regex(/^#[\da-f]{6}$/i).optional(),
});

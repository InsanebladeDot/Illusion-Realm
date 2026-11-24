// 可随工程保存的图片服务配置，不含端点或凭据。
// 独立文件避免画布 schema 与任务 schema 相互导入而在启动时形成循环。
// 模型允许集只覆盖本轮官方 Images 接口，不混入使用聊天接口的 Grok 编辑模型。
// size 保存比例和档位算出的像素，旧工程的 1024x1024 仍可直接读取。
import { z } from "zod";
export const EuzhiImageModelSchema = z.enum(["gpt-image-2", "gpt-image-2.5-sunburst", "gpt-image-2.5-flare"]);
// 应用只开放 1K 和 2K 预设，供应商会再次检查尺寸是否受模型支持。
const EuzhiImageSizeSchema = z.string().regex(/^[1-9]\d{0,3}x[1-9]\d{0,3}$/).refine(size => {
  const sides = size.split("x").map(Number);
  return [1024, 2048].includes(Math.max(...sides)) && sides.every(side => side % 8 === 0);
});
export const EuzhiImageConfigurationSchema = z.object({
  provider: z.literal("euzhi"), model: EuzhiImageModelSchema,
  size: EuzhiImageSizeSchema, quality: z.literal("medium"),
}).strict();
export type EuzhiImageConfiguration = z.infer<typeof EuzhiImageConfigurationSchema>;

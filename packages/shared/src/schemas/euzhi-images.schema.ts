// Euzhi 图片请求的公开契约：只传任务参数和受管媒体引用，不传 API Key。
// 密钥属于本机设置，不能跟着画布导出或复制到其他用户的作品。
// 这像把订餐单与付款卡分开：作品保存订餐内容，主进程单独取付款凭据。
// 三个模型名按官方文档原样保留，不能把展示名称当作接口编号。
// 当前只开放文档明确给出的尺寸与质量，避免沿用本地采样器的无效参数。
import { z } from "zod";
import { InfiniteCanvasMediaSchema, InfiniteCanvasWorkspaceSchema } from "./infinite-canvas.schema";
import { EuzhiImageConfigurationSchema } from "./euzhi-image-configuration.schema";
export * from "./euzhi-image-configuration.schema";
// 模式不根据有没有上传图片偷偷切换；用户选择的意图必须参与校验。
// 文生图零张、图生图一张、参考生成一到八张，八张来自官方页面限制。
// 参考生成允许一张，方便从单张参考开始，第二张不会被静默忽略。
// n 是输出数量，与输入图片数完全独立，沿用画布已有批量选项。
export const EuzhiImageRequestSchema = z.object({
  id: z.string().uuid(), name: z.string().max(80), workspace: InfiniteCanvasWorkspaceSchema.optional(),
  configuration: EuzhiImageConfigurationSchema,
  mode: z.enum(["text", "image", "reference"]), prompt: z.string().trim().min(1).max(4000),
  n: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6)]),
  images: z.array(InfiniteCanvasMediaSchema.extend({ kind: z.literal("image") })).max(8),
}).strict().refine(value => value.mode === "text" ? value.images.length === 0 : value.mode === "image" ? value.images.length === 1 : value.images.length >= 1);
export type EuzhiImageRequest = z.infer<typeof EuzhiImageRequestSchema>;
// 结果沿用既有媒体身份，页面不需要把 Base64 或临时公网 URL 存进工程。
// 数量不足时保留实际成功文件，调用方明确反馈部分结果，不伪造空图补齐。
// workspace 是主进程实际分配的资产目录，后续导入与便携打包继续使用它。
export interface EuzhiImageResult {
  workspace: z.infer<typeof InfiniteCanvasWorkspaceSchema>;
  media: z.infer<typeof InfiniteCanvasMediaSchema>[];
}

// 画布存储契约只依赖纯数据，比例复用创作页清单，保存为兼容旧工程的斜杠写法。
import { IMAGE_SIZE_PRESETS } from "../data/imageSizes";
// 工程只存可恢复数据，不存 DOM、事件或临时测量；文件权限由主进程检查。
import { z } from "zod";
import { PromptReferenceLabelsSchema } from "./prompt-reference-labels.schema";
import { UpscaleSettingsSchema } from "./upscale-settings.schema";
import { compositionSchema } from "./video-composition.schema";
import { DirectorSceneSchema } from "./director.schema";
import { EuzhiImageConfigurationSchema } from "./euzhi-image-configuration.schema";

const Coordinate = z.number().finite().min(-10000000).max(10000000);
const Identity = z.string().min(1).max(200);
// 卡片尺寸是世界单位，与生成像素和画布缩放无关；旧节点缺省时用默认尺寸。
export const InfiniteCanvasCardSchema = z.object({
  style: z.enum(["square", "rectangle", "custom", "fit"]),
  width: z.number().int().min(160).max(1200),
  height: z.number().int().min(100).max(900),
});
// 纸色与装饰独立于卡片尺寸；旧便签不填时继续使用普通黄色纸。
const NoteAppearanceSchema = z.object({
  attach: z.enum(["none", "tape", "pin"]),
  color: z.enum(["yellow", "pink", "blue", "green", "orange"]),
}).strict();
// 标注只是节点的文字牌，不是资源标签；每张卡最多八个，颜色只收六位 RGB。
const NodeAnnotationsSchema = z.array(z.object({
  id: Identity,
  text: z.string().min(1).max(80).refine(value => value.trim().length > 0),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
}).strict()).max(8).refine(items => new Set(items.map(item => item.id)).size === items.length);
// folder 是主进程分配的单层目录名，id 用于核对归属；改标题不搬动资产。
// 草稿保留本机归属，便携导入重新分配，避免同名工程互相覆盖。
export const InfiniteCanvasWorkspaceSchema = z.object({
  id: z.string().uuid(), folder: z.string().min(1).max(100).regex(/^[^<>:"/\\|?*\x00-\x1f]+$/).refine(value => !value.endsWith(".") && !value.endsWith(" ") && value !== ".."),
});
// 媒体引用像索引卡：只存地址、名称和大小，内容由 localfile 按需读取。
// 不存重开即失效的 Blob URL；文件是否存在由加载时检查。
export const InfiniteCanvasMediaSchema = z.object({
  kind: z.enum(["image", "video", "audio"]),
  // 保留原路径，URL 编码交给协议层；丢失文件不能导致整张草稿无法恢复。
  path: z.string().min(1).max(32767),
  name: z.string().min(1).max(255),
  // 大小按字节计，零字节也可登记；大小相同不代表内容相同。
  size: z.number().int().nonnegative().safe(),
});

// LoRA 按节点和模板隔离，图片存资源身份与权重，视频存行身份、模型名与强度。
// 像各自保存配料单：缺字段继承默认，空数组表示全部清空，不能混用。
// 保留列表顺序，按行身份拒绝重复；模型文件不随工程打包。
const ImageLoras = z.array(z.object({ extensionId: z.string().min(1).max(33000), weight: z.number().finite().min(-5).max(5) })).max(128).refine(items => new Set(items.map(item => item.extensionId)).size === items.length);
const VideoLoras = z.array(z.object({ id: Identity, name: z.string().min(1).max(32767), strength: z.number().finite().min(-5).max(5) })).max(128).refine(items => new Set(items.map(item => item.id)).size === items.length);
export const CanvasWorkflowLorasSchema = z.object({ anima: ImageLoras.optional(), sdxl: ImageLoras.optional(), moss: ImageLoras.optional(), "anima-edit": ImageLoras.optional(), "minimax-image-edit": VideoLoras.optional(), minimax: VideoLoras.optional(), "minimax-reference": VideoLoras.optional() }).strict();

// 图片附表只存当前节点的覆盖项，不复制创建页全局状态或服务凭据。
// 缺字段继承模板，空负面词表示清空；种子保留字符串草稿，执行时再核验。
// size 保留基础宽高与倍率，最终像素由原解析器计算，不另存一份易过期的镜像。
const CanvasImageParametersSchema = z.object({
  model: z.object({ modelId: z.string().min(1).max(33000), versionId: z.string().min(1).max(33000) }).strict().optional(),
  modelOverrides: z.record(z.string().min(1).max(200), z.string().max(32767)).refine(value => Object.keys(value).length <= 64).optional(),
  negative: z.string().max(4000).optional(),
  steps: z.number().int().min(1).max(100).optional(),
  cfg: z.number().finite().min(0).max(30).optional(),
  sampler: z.string().min(1).max(80).optional(),
  scheduler: z.string().min(1).max(80).optional(),
  seed: z.string().max(32).regex(/^\d*$/).optional(),
  seedMode: z.enum(["random", "custom"]).optional(),
  size: z.object({ mode: z.enum(["preset", "custom"]), aspectRatio: z.string().min(1).max(80), customWidth: z.number().int().min(8).safe(), customHeight: z.number().int().min(8).safe(), scale: z.number().finite().min(0.1).optional() }).strict().optional(),
}).strict();
// 用工作流编号分别保存配置，切换模板保留其他模板草稿；旧工程可缺省。
// SLG 只在 Moss 模板存在，其他模板的附表仍会拒绝它。
export const CanvasImageParametersTableSchema = z.object({ anima: CanvasImageParametersSchema.optional(), sdxl: CanvasImageParametersSchema.optional(), moss: CanvasImageParametersSchema.extend({ slg: z.boolean().optional() }).optional(), "anima-edit": CanvasImageParametersSchema.optional(), "minimax-image-edit": CanvasImageParametersSchema.optional() }).strict();

// 音频参数随节点保存，参考只存媒体索引；请求中的 File、播放状态和凭据不进入工程。
export const CanvasAudioParametersSchema = z.object({
  unetName: z.string().min(1).max(32767).optional(),
  steps: z.number().int().min(1).max(100).optional(),
  durationSeconds: z.number().finite().min(0.1).max(60).optional(),
  seed: z.string().max(32).regex(/^\d*$/).optional(), random: z.boolean().optional(),
  count: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6)]).optional(),
  loras: CanvasWorkflowLorasSchema.shape.minimax,
  modelOverrides: z.object({ text: CanvasImageParametersSchema.shape.modelOverrides, reference: CanvasImageParametersSchema.shape.modelOverrides }).strict().optional(),
  reference: InfiniteCanvasMediaSchema.refine(value => value.kind === "audio").optional(),
  // 缺省引擎仍是 MiniMax；切换引擎保留各自已经填写的参数。
  engine: z.enum(["minimax", "gpt-sovits"]).optional(),
  gptSovits: z.object({
    textLanguage: z.string().min(1).max(24).optional(),
    referenceLanguage: z.string().min(1).max(24).optional(),
    transcript: z.string().max(4000).optional(),
    cut: z.string().min(1).max(48).optional(),
    gptWeight: z.string().max(2048).regex(/\.ckpt$/i).optional(),
    sovitsWeight: z.string().max(2048).regex(/\.pth$/i).optional(),
    // 保持与节点序列化顺序一致，避免保存后误报未保存。旧画布可省略这两项。
    speed: z.number().min(0.25).max(4).optional(),
    interval: z.number().min(0).max(30).optional(),
    seed: z.string().max(32).regex(/^\d*$/).optional(),
    random: z.boolean().optional(),
  }).strict().optional(),
}).strict();

export const InfiniteCanvasDataSchema = z.object({
  kind: z.enum(["text", "image", "video", "audio", "note", "composition", "scene"]),
  title: z.string().max(80),
  prompt: z.string().max(4000),
  // 省略表示开启；显式 false 随节点保存，旧工程不用补写默认值。
  promptConversion: z.boolean().optional(),
  promptReferenceLabels: PromptReferenceLabelsSchema.optional(),
  content: z.string().max(8000),
  // 比例与创建页共用静态清单，持久化继续斜杠写法，旧四项无需迁移。
  // 不接受任意字符串，否则显示可恢复却无法按受控菜单解释同一比例。
  // 已有自定义像素仍在size或videoOutput保存，不用伪造一个custom比例字段。
  ratio: z.string().refine(value => IMAGE_SIZE_PRESETS.some(preset => preset.id.replace(":", "/") === value)),
  mode: z.string().max(40).optional(),
  upscale: UpscaleSettingsSchema.optional(),
  // 模板选择与引用模式独立；H3 多参考改图和 Anima 单图编辑各有独立编号。
  workflow: z.enum(["anima", "sdxl", "moss", "anima-edit", "minimax-image-edit", "minimax", "minimax-reference", "wan2.2"]).optional(),
  // 配置按节点和工作流双重隔离，不借用创建页全局已选 LoRA。
  // 旧数据省略整张配置表即可兼容，不为浏览旧作品自动写默认值。
  // Wan 当前创建页没有 LoRA 选择接线，因此这里也不接受其覆盖字段。
  workflowLoras: CanvasWorkflowLorasSchema.optional(),
  audioParameters: CanvasAudioParametersSchema.optional(),
  // 数量仅用于图片生成；附表属于当前节点，不能写进其他媒体类型。
  imageParameters: CanvasImageParametersTableSchema.optional(),
  // 两个 MiniMax 流分别保存原加载槽覆盖；空名称表示恢复默认，不包含模型权重。
  videoModelOverrides: z.object({ minimax: CanvasImageParametersSchema.shape.modelOverrides, "minimax-reference": CanvasImageParametersSchema.shape.modelOverrides }).strict().optional(),
  // 旧节点省略步数，生成时读取当前模板的默认值。
  videoSteps: z.number().int().min(1).max(100).optional(),
  // 视频只存确切宽高，不另存档位；偶数约束允许 1080，不套用图片的八像素步进。
  // 时长精确到一位小数秒，FPS 表示每秒帧数；二者独立，总帧数由执行器计算。
  // 缺字段沿用显示默认，不自动写盘；数据合法不代表模型支持该输出组合。
  videoFps: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  // 面积预算保留用户选择，最终宽高仍以videoOutput为准，旧工程无需补默认值。
  videoMegapixels: z.union([z.literal(0.1), z.literal(0.2), z.literal(0.3), z.literal(0.4), z.literal(0.5), z.literal(0.6), z.literal(0.7), z.literal(0.8), z.literal(0.9), z.literal(1)]).optional(),
  videoDuration: z.number().finite().min(0.1).max(Number.MAX_SAFE_INTEGER / 10).multipleOf(0.1).optional(),
  videoOutput: z.object({ width: z.number().int().min(2).max(Number.MAX_SAFE_INTEGER).multipleOf(2), height: z.number().int().min(2).max(Number.MAX_SAFE_INTEGER).multipleOf(2) }).strict().optional(),
  remoteImage: EuzhiImageConfigurationSchema.optional(),
  inputImages: z.array(InfiniteCanvasMediaSchema).max(8).refine(items => items.every(item => item.kind === "image")).optional(),
  batchSize: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6)]).optional(),
  createdAt: z.number().finite().nonnegative().optional(),
  resizeLocked: z.boolean().optional(),
  noteAppearance: NoteAppearanceSchema.optional(),
  annotations: NodeAnnotationsSchema.optional(),
  card: InfiniteCanvasCardSchema.optional(),
  // 引用可缺省以兼容空媒体节点，出现时必须与节点类型一致。
  media: InfiniteCanvasMediaSchema.optional(),
  // 场景沿用同一节点持久化边界，旧节点不需要补空场景。
  scene: DirectorSceneSchema.optional(),
  // 合成器保存原剪辑快照，素材路径集中在资产表，便携工程可以统一搬运。
  composition: compositionSchema(InfiniteCanvasMediaSchema).optional(),
// 按 kind 检查参数归属，空表也不能混入其他节点；主进程须做等价检查。
}).refine(data => (!data.noteAppearance || data.kind === "note") && (!data.audioParameters || data.kind === "audio") && (!data.upscale || data.kind === "image" || data.kind === "video") && (!data.composition || data.kind === "composition") && (!data.inputImages || data.kind === "image" || data.kind === "video") && (!data.remoteImage || data.kind === "image" && ["text", "image", "reference"].includes(data.mode ?? "text")) && (data.batchSize === undefined || data.kind === "image") && (data.imageParameters === undefined || data.kind === "image") && (data.videoModelOverrides === undefined || data.kind === "video") && (data.videoOutput === undefined || data.kind === "video") && (data.videoDuration === undefined || data.kind === "video") && (data.videoFps === undefined || data.kind === "video") && (data.videoSteps === undefined || data.kind === "video") && (data.videoMegapixels === undefined || data.kind === "video") && (!data.media || data.media.kind === data.kind) && (!data.scene || data.kind === "scene") && (!data.workflow || (data.kind === "image" ? ["anima", "sdxl", "moss", "anima-edit", "minimax-image-edit"] : data.kind === "video" ? ["minimax", "minimax-reference", "wan2.2"] : []).includes(data.workflow)) && (!data.workflowLoras || (data.kind === "image" || data.kind === "video") && Object.keys(data.workflowLoras).every(key => (data.kind === "image" ? ["anima", "sdxl", "moss", "anima-edit", "minimax-image-edit"] : ["minimax", "minimax-reference"]).includes(key))), { message: "canvas-media-kind-mismatch" }).refine(data => data.mode !== "compare" || data.kind === "image", { message: "canvas-compare-kind-mismatch" });

// 限制单个草稿规模，损坏文档不能在恢复时创建无限节点和连线拖垮界面。
// 默认名称保留为空，显示时用当前语言的“未命名画布”，不把翻译当作作品身份。
// optional 兼容本轮最早的草稿字段；解析会去掉未列出的临时属性。
export const InfiniteCanvasDocumentSchema = z.object({
  version: z.literal(1),
  name: z.string().max(80).default(""),
  fixedSize: z.boolean().optional(),
  workspace: InfiniteCanvasWorkspaceSchema.optional(),
  nodes: z.array(z.object({ id: Identity, position: z.object({ x: Coordinate, y: Coordinate }), data: InfiniteCanvasDataSchema })).max(5000),
  edges: z.array(z.object({ id: Identity, source: Identity, target: Identity, sourceHandle: z.literal("out").optional(), targetHandle: z.literal("in").optional() })).max(10000),
});

export type UserDataInfiniteCanvas = z.infer<typeof InfiniteCanvasDocumentSchema>;

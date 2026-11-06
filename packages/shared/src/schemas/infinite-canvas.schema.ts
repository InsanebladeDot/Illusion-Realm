// 画布草稿的磁盘契约，不依赖 React Flow，也不把 DOM、事件函数或临时测量写进 JSON。
// 像寄送作品前的装箱清单：先确认每张纸和每条连接形状正确，再由渲染侧检查关系是否合法。
// 同一份数据供用户文档与工程交换使用；实际磁盘权限仍由主进程控制。
import { z } from "zod";

const Coordinate = z.number().finite().min(-10000000).max(10000000);
const Identity = z.string().min(1).max(200);
// 卡片几何与生成画面比例独立；缩放镜头不改变这里的世界单位。
// 自定义大小设上下界，防止坏工程生成覆盖整个工作区的巨大交互层。
// 卡片展示尺寸成为稳定数据，重开后不依赖上次 DOM 测量。
// style 只区分 square、rectangle、custom 三种方案。
// 宽高均为整数，范围与尺寸表单和主进程相同。
// 宽度从一百六十到一千二百，保留控件最小可用区域。
// 高度从一百到九百，避免坏文档创建无限高的交互层。
// 这些数字不表示源文件输出像素，也不修改媒体元数据。
// 等比生成参数仍用 ratio，两个概念不能共用一个字段。
// 改变画布 zoom 后保存 card 不应跟着变化。
// 恢复旧文档时没有 card 就使用原组件默认值。
// 不需要为了兼容给每张旧卡批量回写一份默认对象。
export const InfiniteCanvasCardSchema = z.object({
  style: z.enum(["square", "rectangle", "custom"]),
  width: z.number().int().min(160).max(1200),
  height: z.number().int().min(100).max(900),
});
// folder 是主进程分配的单层目录名，不接受路径；改标题不搬动原资产。
// id 用于目录归属确认，同名项目导入不会覆盖已有工程。
// 归属是主进程分配的数据，不是渲染层按标题猜出来的目录。
// id 使用标准 UUID，folder 是一个单层目录基本名。
// 目录分隔符、通配符和控制字符不能进入 folder。
// 禁止尾部空格与点，减少平台规范化后的身份歧义。
// 界面重命名画布只改 name，不改 folder。
// 这样已有媒体绝对引用不会因标题调整集体失效。
// 同名工程导入分配不同归属，用户资产不被覆盖。
// 归属标记校验发生在主进程实际读盘，不只比较两个字符串。
// 便携导出不携带这个本机归属，打开后重新建立。
// 用户草稿则保留归属，下一次追加媒体继续写入同一目录。
export const InfiniteCanvasWorkspaceSchema = z.object({
  id: z.string().uuid(), folder: z.string().min(1).max(100).regex(/^[^<>:"/\\|?*\x00-\x1f]+$/).refine(value => !value.endsWith(".") && !value.endsWith(" ") && value !== ".."),
});
// 本地素材像图书馆的索引卡：只保存受管副本地址和名称，不把整本书塞进用户 JSON。
// 文件内容仍由已有 localfile 协议按需读取；路径不是可执行命令，也不发往模型服务。
// kind 同时作为恢复预览时的媒体标签，不能从任意 MIME 字符串创建 HTML。
// 路径上限兼容 Windows 长路径；非空只说明有引用，文件是否还在由实际加载判断。
// 大小用于展示与诊断，不作为“文件内容一定可信”的证明；浏览器仍须实际解码。
// 不保存 Blob URL，因为它是当前页面的临时号码，重开页面后就失效。
export const InfiniteCanvasMediaSchema = z.object({
  // 只允许原有三种媒体节点类型，文本、便签和合成器不能伪装成文件播放器。
  // 枚举值是内部身份，不使用翻译后的“图片”等文案做持久化。
  // 后续新增媒体类型需要同时接通导入分类与展示，不能只放宽这里的枚举。
  kind: z.enum(["image", "video", "audio"]),
  // 字符串保留平台原路径格式，不提前替换反斜杠或 URL 编码。
  // 协议构造器负责编码，磁盘存储负责保留原始引用，两者不能混用。
  // 文件存在性是运行期条件：今天有效的文件明天也可能被用户移走。
  // 不因文件不存在就拒绝整个草稿，用户需要看到丢失项才能修复作品。
  // 不在 schema 读取文件或启动进程，shared 必须保持纯数据边界。
  // 长度限制只防御损坏文档，不声称每个操作系统都支持同样长度。
  path: z.string().min(1).max(32767),
  // 基本名供卡片和错误反馈显示，不从 path 临时猜测平台分隔符。
  // 完整目录不会展示在卡片正文中，避免共享截图时泄露用户文件夹结构。
  // 名称上限与常见本地文件系统一致，不复用更短的节点标题上限。
  // 节点标题允许用户自定义，原始名称则保留作为识别真实素材的线索。
  name: z.string().min(1).max(255),
  // 文件大小是字节整数，不能接受 NaN、负数或需要精度丢失才能表示的值。
  // 零字节可登记为引用，解码时给出真实错误，不把它误解释成未选择文件。
  // 大小不用于去重：相同大小的两个视频不代表内容相同。
  // 普通导入不计算哈希；只有工程交换需要完整性摘要。
  size: z.number().int().nonnegative().safe(),
});

// 旧草稿没有 media 时仍按原样恢复，不迁移文件、不自动创建媒体结果。
// 素材引用与提示词并列，导入图片不会改写用户已经填写的生成描述。
// 来源类型必须与卡片一致，防止手改 JSON 把音频地址装进图片节点。
// 这里拒绝错误契约；“文件已经移动”则属于有效引用的运行期错误，不应抹掉整张作品。
export const InfiniteCanvasDataSchema = z.object({
  kind: z.enum(["text", "image", "video", "audio", "note", "composition"]),
  title: z.string().max(80),
  prompt: z.string().max(4000),
  content: z.string().max(8000),
  ratio: z.enum(["1/1", "16/9", "9/16", "4/3"]),
  mode: z.string().max(40).optional(),
  createdAt: z.number().finite().nonnegative().optional(),
  card: InfiniteCanvasCardSchema.optional(),
  // optional 让新增引用字段兼容上一轮已保存的文本与空媒体节点。
  // 缺少字段与字段为空对象不同，后者应被识别为坏数据而不是默默吞掉。
  // 不把浏览器 Event、File 或加载状态纳入契约；这些对象无法可靠跨页面恢复。
  // 只读引用本身可被复制节点复用，替换时仍要建立一个新对象。
  // refinement 检查引用类型与外层 kind，一处手改错误不能混出错误媒体标签。
  // 原有持久化边界会把 schema 失败显示为读取错误并保留磁盘内容。
  // 工程请求在主进程另有等价手写校验，不运行时导入此 Zod 模块。
  // 用户草稿仍由原用户文档通道写 JSON，工程包不替代用户设置存储。
  media: InfiniteCanvasMediaSchema.optional(),
}).refine(data => !data.media || data.media.kind === data.kind, { message: "canvas-media-kind-mismatch" });

// 限制单个草稿规模，损坏文档不能在恢复时创建无限节点和连线拖垮界面。
// 默认名称保留为空，显示时用当前语言的“未命名画布”，不把翻译当作作品身份。
// optional 兼容本轮最早的草稿字段；解析会去掉未列出的临时属性。
export const InfiniteCanvasDocumentSchema = z.object({
  version: z.literal(1),
  name: z.string().max(80).default(""),
  workspace: InfiniteCanvasWorkspaceSchema.optional(),
  nodes: z.array(z.object({ id: Identity, position: z.object({ x: Coordinate, y: Coordinate }), data: InfiniteCanvasDataSchema })).max(5000),
  edges: z.array(z.object({ id: Identity, source: Identity, target: Identity, sourceHandle: z.literal("out").optional(), targetHandle: z.literal("in").optional() })).max(10000),
});

export type UserDataInfiniteCanvas = z.infer<typeof InfiniteCanvasDocumentSchema>;

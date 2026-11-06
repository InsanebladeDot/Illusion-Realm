// 工程交换只携带画布和素材清单，不混入账户、密钥、撤销栈或播放器状态。
// 像搬家时先列纸箱清单，再按清单装原文件：素材字节在二进制包里独立流转。
import { z } from "zod";
import { InfiniteCanvasDocumentSchema, InfiniteCanvasMediaSchema, InfiniteCanvasWorkspaceSchema } from "./infinite-canvas.schema";

// 原路径只在本机导入请求出现；可携带工程中的路径统一为相对路径。
// 文件名和类型复用现有媒体 schema，避免导入、预览、归档各维护一套名字。
// 导入请求与工程清单复用相同媒体描述，但路径语义不同。
// 请求中的 path 是本机来源，清单中的 path 是包内相对地址。
// 二者不能互换，否则另一台机器会尝试读取原电脑盘符。
// name 上限与画布标题一致，不用媒体文件名推断工程名。
// workspace 可省略，支持第一次导入时才创建工程目录。
// 已有归属必须整体传 id 和 folder，不能只靠文件夹名续写。
// files 最少一项，取消选择不应发空批次请求。
// 最多二百项限制单次系统选择对主进程的压力。
// 这不是全库扫描 API，不能传一个根目录要求递归导入。
// 同批允许多种媒体，具体单卡更换类型由调用方再约束。
// 每项仍由 InfiniteCanvasMediaSchema 校验大小和基本名。
// 主进程必须用同样范围的手写校验，不运行时加载 Zod。
// 类型推导来自 schema，preload 与 renderer 不各写一份请求形状。
// 请求不包含 user 根目录字段，不能用它改变系统资产位置。
// 也不包含 overwrite 之类的任意文件开关，复制统一不覆盖。
// 只传原媒体描述，不把 HTML File、事件或函数装进 IPC。
export const CanvasImportMediaSchema = z.object({
  name: z.string().max(80),
  workspace: InfiniteCanvasWorkspaceSchema.optional(),
  // 旧调用不传模式仍按复制处理，不能让升级后的软件意外剪切原素材。
  // move 只影响本批视频；图片和音频仍复制，与确认框的范围一致。
  // 模式是本次系统操作，不写入节点或工程包，重开工程不会再次移动文件。
  // schema 不在读取时替调用方补 mode，主进程显式解释 undefined 为 copy。
  // 这样省略字段的旧 preload 调用仍能与新渲染层保持相同安全默认。
  // 不允许 delete、overwrite 或任意路径迁移参数，移动只作用于 files 中的视频。
  // 请求仍受现有二百项上限约束，不把选择移动扩大为递归搬走一个文件夹。
  // 媒体源路径继续由各项描述，不从显示标题构造来源目录。
  // 实际磁盘能力没有增加新通道，只扩展现有受校验的导入请求。
  mode: z.enum(["copy", "move"]).optional(),
  files: z.array(InfiniteCanvasMediaSchema).min(1).max(200),
});
// 文件名必须正好位于一种资产目录，不能接受 ../、盘符或嵌套目录。
// 大小是后续流读取边界；所有偏移由主进程按顺序累加，不信任外部偏移值。
// format 是稳定机器标记，不能翻译成界面语言。
// version 表示容器清单的版本，和文档内部 version 分开。
// 当前只接受第一版，不把未知新版当旧版勉强读取。
// document 直接引用现有画布 schema，参数字段只有一个来源。
// 工程文件不打包账户、令牌、主题偏好或应用全局设置。
// assets 按正文顺序排列，数组顺序具有实际字节意义。
// 不能为美化 JSON 按文件名排序而不重写对应正文。
// path 只允许 video、Picture、Audio 三种一级目录。
// 图片目录大小写是规范一部分，不按当前系统习惯临时转换。
// 基本名中的冒号被拒绝，也就无法嵌入 Windows 盘符。
// 反斜杠不允许，打包格式统一使用正斜杠。
// 包内地址只有一层，素材文件不能进一步包含子目录。
// 尾部点空格拒绝，避免在 Windows 解包后别名碰撞。
// 路径上限三百字符控制清单规模，不是浏览器 URL 上限。
// size 保存原二进制长度，不保存压缩前后两份含糊数字。
// 当前正文不压缩，读方直接按 size 累加偏移。
// 安全整数确保加减后不会丢失定位精度。
// sha256 统一小写六十四位十六进制。
// 摘要不是文件路径，也不作为用户可见标题。
// 它检验包内内容是否一致，不等同于可信作者签名。
// assets 最多五千条，与画布最大节点规模相协调。
// 同源多节点去重后资产数可能小于媒体节点数。
// 空画布 assets 可以为空，不强制塞一张默认素材。
// 结构 schema 不读取正文，字节完整性由主进程实际文件校验。
// 重复路径、总长度与节点引用对应也由主进程关系校验负责。
// 因此 safeParse 成功不能单独当作可安全解包的结论。
// 导出流程先去掉本机 workspace，再生成便携清单。
// 打开后分配新 workspace，避免沿用包里伪造的机器归属。
// 便携文件扩展名是 ircanvas，外部工具不能把它当普通用户 JSON。
// 这一格式只服务画布交换，不是未来视频渲染导出的容器。
export const CanvasArchiveSchema = z.object({
  format: z.literal("illusion-realm-canvas"), version: z.literal(1),
  document: InfiniteCanvasDocumentSchema,
  assets: z.array(z.object({
    path: z.string().max(300).regex(/^(video|Picture|Audio)\/[^<>:"/\\|?*\x00-\x1f]+$/).refine(value => !/[. ]$/.test(value)),
    size: z.number().int().nonnegative().safe(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })).max(5000),
});
export type CanvasArchive = z.infer<typeof CanvasArchiveSchema>;
export type CanvasImportMediaRequest = z.infer<typeof CanvasImportMediaSchema>;
// 返回结果分开列出成功复制与被拒文件。
// workspace 是主进程实际分配的归属，界面必须采用它。
// media 中 path 已改为受管副本，不能再写回原 File 路径。
// media 中 size 来自实际 stat，纠正浏览器可能过期的大小。
// rejected 只携带基本名，避免把私有目录加入界面消息。
// 本结构不是 IpcResult，外层注册助手才负责统一 success 包装。
// 部分成功不会抛成整批失败，调用方按两个数组分别反馈。
// 所有失败也保留原画布，不能用空 media 清空既有节点。
// 返回不包含解码 ready，复制与播放是不同生命周期。
// 解码错误留在节点预览，不改这份成功复制事实。
// 结果没有进度百分比，因为底层 copyFile 未提供真实逐字节事件。
// 不得基于文件个数伪装成全文件传输进度。
export interface CanvasImportMediaResult {
  workspace: z.infer<typeof InfiniteCanvasWorkspaceSchema>;
  media: z.infer<typeof InfiniteCanvasMediaSchema>[];
  rejected: string[];
}

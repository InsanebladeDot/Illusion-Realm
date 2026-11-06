/**
 * 本地生成账本的版本化形状，供用户文档恢复和统计共同使用。
 * 像购物小票：只记时间、结果与用过的商品，不把整辆购物车复制进去。
 * 对应到这里，小票不含提示词、图片字节、输出目录或服务密钥。
 * 账户退出不会删除本机记录；记录不自动上传，也不代表云端账户历史。
 */
import { z } from "zod";

// 主模型与 LoRA 使用不同身份；同名文件不能跨这两个角色合并。
// loader 保留 ComfyUI 的模型类别，不用文件大小猜测是不是主模型。
// name 保存提交给节点的文件标识，保留子目录，不能只取 basename。
// VAE、CLIP 与控制补丁不属于本次用户要求的两类模型。
/**
 * 模型字段的约定：
 * role 描述模型在生成中的职责，允许主要模型和 LoRA 两种值。
 * loader 描述加载体系，和 role 一起保留迁表时需要的类型证据。
 * name 是传给 ComfyUI 的精确文件标识，不是界面上截断的标题。
 * 模型名字可以含多级目录，长度限制不能按普通标题的几十字符处理。
 * 名称为空时不创建未知模型占位，避免榜单出现无法解释的空行。
 * 此 schema 不包含文件大小，因为它不参与本次使用次数计算。
 * 此 schema 不包含 SHA256，因为生成过程不要求重新读取模型权重。
 * 此 schema 不包含服务地址，同名模型的服务迁移不会泄漏连接配置。
 */
export const GenerationModelSchema = z.object({
  role: z.enum(["main", "lora"]),
  loader: z.enum(["unet", "diffusion_models", "checkpoints", "loras"]),
  name: z.string().trim().min(1).max(2048),
});

// 任务 ID 是去重键，界面重绘或终态重复通知不能多算一次。
// createdAt 为提交时间，startedAt 为离开排队进入执行的时间。
// finishedAt 在终态确定时记录；这三个时间均沿用本地毫秒时间戳。
// 不存 Date 对象，用户 JSON 导出后仍是普通数字。
// 成功张数使用实际保存文件数，不能拿请求数量冒充已生成数量。
// failed 可能保留前几张已保存结果，cancelled 则整体排除统计。
// 未执行就撤回的任务没有 startedAt，不能算作零秒生成。
// 耗时由起止时间计算，不持久化可发生矛盾的第二份 duration。
/**
 * 任务字段的约定：
 * id 沿用队列创建时的 UUID，批次内多张图片仍属于同一次任务。
 * createdAt 保留用户提交时刻，可解释为什么任务跨了很久才开始。
 * startedAt 为 null 表示没有执行证据，不能补成创建时间。
 * finishedAt 为真实终态时刻，私密统计按这个日期选择查询窗口。
 * completed 表示执行并保存成功，光有服务器 promptId 不足以成立。
 * failed 表示实际异常，不用图片数是否为零来决定状态。
 * cancelled 表示任务没有继续执行；其是否进入指标由统计规则决定。
 * images 表示本机确认保存的文件数量，不是工作流请求的 batch_size。
 * models 只用于解释已经产出的图片，不证明加载器在异常前运行到了哪一步。
 * 有限数字校验挡住 JSON 手工修改后可能产生的非法统计输入。
 * 时间顺序校验覆盖创建、开始、结束，不允许倒计时式的负耗时。
 * 使用 nullable 明确区分未开始，与 startedAt 为数值零这两个情况。
 * 一个失败记录仍可有正数 images，这是批次部分成功的正常事实。
 * 一个取消记录也可保留已保存数量，汇总时整体排除而不物理删除文件。
 * 未知字段不会被 Zod object 保留，备份中的额外内容不传播到下次写入。
 */
export const GenerationRecordSchema = z.object({
  id: z.string().min(1).max(100),
  status: z.enum(["completed", "failed", "cancelled"]),
  createdAt: z.number().finite().nonnegative(),
  startedAt: z.number().finite().nonnegative().nullable(),
  finishedAt: z.number().finite().nonnegative(),
  images: z.number().int().nonnegative(),
  models: z.array(GenerationModelSchema),
}).refine(record => record.finishedAt >= record.createdAt &&
  (record.startedAt === null || record.startedAt >= record.createdAt && record.finishedAt >= record.startedAt));

// v1 是用户主文档中的可选分段，不升级或重写主文档其他字段。
// 未来不兼容版本不能被当作当前格式猜读；恢复器会明确回落为空。
// 模型与记录类型从同一 schema 推导，避免持久化和界面各写一份。
// records 不裁到队列的四十条上限，清理界面卡片不等于删除历史。
/**
 * 未来按表组织时的字段对应：
 * 任务表可以直接以 record.id 作为去重主键。
 * 任务表保存 createdAt、startedAt 和 finishedAt 三个有区别的时间。
 * status 保留完成、失败和取消三个明确状态，不用一个 success 布尔值混淆取消。
 * images 是该任务确认的产图数量，不是预估额度。
 * 模型表的业务身份至少由 role 与 name 组成。
 * loader 可以保留加载体系，作为后续分类查询依据。
 * 任务与模型之间是多对多关系，一条任务可以使用多个 LoRA。
 * 模型使用表可以用任务 ID 和模型身份建立唯一约束。
 * 本轮的 models 数组就是这种关系的 JSON 表达。
 * 统计汇总不额外落盘，未来可以由相同原始事实重新生成。
 * 当前段没有账户 ID，因为这份记录明确属于本机用户文档范围。
 * 切换登录账户不应把它伪称为对应账户的云端历史。
 * 当前段没有 prompt，分享统计备份不会直接带出用户输入内容。
 * 当前段没有 savedPaths，迁移时不需要复制用户的输出目录结构。
 * 当前段没有模型字节或 SHA256，迁移统计不会触发大文件扫描。
 * version 为每个分段声明兼容边界，表结构改变时可以显式写迁移器。
 * 这只是可迁移的数据契约，本轮仍然保持单 JSON 存储。
 */
export type GenerationModel = z.infer<typeof GenerationModelSchema>;
export type GenerationRecord = z.infer<typeof GenerationRecordSchema>;
export interface GenerationHistory { version: 1; records: GenerationRecord[] }

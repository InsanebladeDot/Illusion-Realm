import { z } from 'zod';

/**
 * Agent 的远端聊天目录契约；与本地绘图模型、提示词助手配置相互独立。
 * provider 只能来自固定允许集，页面不能把已保存密钥发送到自定义地址。
 * 价格单位统一为每百万 token，货币保留来源，禁止跨币种直接比较。
 * 分组倍率已经计入展示价；实际充值折扣和账户分组仍由服务商决定。
 * 阶梯价格只用于展示，不在本地实现服务商的结算表达式。
 * 模型发现不证明流式工具调用可用，认证和真实推理仍可能失败。
 * 状态字段不含密钥；模型 ID 仅作为选择值，不可解释为文件路径。
 */
export const AgentProviderSchema = z.enum(['siliconflow', 'euzhi']);
// 默认服务商不在 schema 中隐式补齐，迁移策略由渲染层统一决定。
// 这样损坏文档不会在 IPC 验证时悄悄指向另一把密钥。
// 显式枚举还使新增服务商必须同时补足类型和运行期校验。
export type AgentProvider = z.infer<typeof AgentProviderSchema>;
// 类型别名只在编译期使用，主进程可通过 JSDoc 保持同一允许集声明。
// models 的键集合固定，两个站点的选择可同时保存而不互相覆盖。
// 空字符串只表示该站尚未选择，不等于接受空模型进行运行。
// 运行前由 agentRunSelection 等待目录推荐或向用户报告不可用。
// 长度限制与主进程运行配置验证一致，避免无界模型名进入持久化文档。
export const AgentPreferencesSchema = z.object({ provider: AgentProviderSchema, models: z.record(AgentProviderSchema, z.string().max(200)) });
export type AgentPreferences = z.infer<typeof AgentPreferencesSchema>;
// 不接受函数或任意表达式：网络目录只允许有限数字和字符串。
// 模型条目保留价格出处相关字段，以便界面说明最便宜的适用条件。
// null 表示未知价格，不能把未知默认为免费。
// available 为 null 表示未用用户密钥核对，不宣称账户已获授权。
// groups 是服务商返回的计费分组，不是应用新建的用户权限。
// context 为零代表来源未公布，不能推断无限上下文。
// tiers 只接受更长输入的阈值和明确输入输出价。
// tier 为 UI 分档，不改变请求、配额或服务商实际收费。
export const AgentCatalogModelSchema = z.object({
  // id 保留服务商原始大小写及路径前缀，例如 Pro/ 不能自动删除。
  // input/output 同为每百万 token，nullable 明确表达来源未公布。
  // 非负限制拦下错误价格数据，负数不得用于最低价排序。
  id: z.string().min(1).max(200), input: z.number().nonnegative().nullable(), output: z.number().nonnegative().nullable(),
  currency: z.enum(['CNY', 'USD']), tier: z.enum(['free', 'budget', 'premium']), groups: z.array(z.string()),
  // context 不负责限制本地历史长度，只展示来源目录已公布的上限。
  // pricingBasis=tiered 要让界面展示长上下文规则，不能只显示基础价。
  // available=false 只来自用户令牌列表，不能从价格高低推断权限。
  context: z.number().nonnegative(), pricingBasis: z.enum(['token', 'tiered']), available: z.boolean().nullable(),
  tiers: z.array(z.object({ above: z.number().nonnegative(), input: z.number().nonnegative(), output: z.number().nonnegative() })),
});
export type AgentCatalogModel = z.infer<typeof AgentCatalogModelSchema>;
// 这些类型可被 main 的 JSDoc 引用，运行时不会 require shared 的 Zod。
// 渲染层会 parse 实际 IPC 响应，TS 声明本身不能保证远端数据符合契约。
// 异常目录不会写入偏好，已有 provider/model 保留供用户之后重试。
// 时间戳来自最近一次成功读取价目表，不用失败尝试刷新时间伪装新数据。
// snapshot 是随包核实目录；cache 是旧的联网结果；live 才是本次联网成功。
// error 使用有限错误码，让渲染层翻译提示，不透传响应正文或认证信息。
// 不存储余额、账户 ID 或令牌限制详情，只存模型可见性。
// 空列表是有效结果，界面必须明确展示，不能自动换服务商发送。
// recommended 可为空；未知价格或全部不可用时不能承诺最低价。
// force 只跳过目录 TTL，不允许修改网络目标或请求头。
export const AgentCatalogSchema = z.object({
  provider: AgentProviderSchema, updatedAt: z.string(), source: z.enum(['live', 'cache', 'snapshot']),
  models: z.array(AgentCatalogModelSchema), recommended: z.string(), error: z.enum(['', 'network', 'auth', 'catalog', 'availability']),
});
export type AgentCatalog = z.infer<typeof AgentCatalogSchema>;
export const AgentCatalogArgsSchema = z.tuple([AgentProviderSchema, z.boolean().optional()]);
// secretStatus/clear 的零参数形式兼容原来只有硅基流动的客户端。
// tuple 不接受额外元素，不能夹带路径、baseUrl 或自定义请求选项。
// 主进程手写 validator 使用相同省略规则，null 不会视作默认 provider。
export const AgentProviderArgsSchema = z.tuple([AgentProviderSchema.optional()]);
// 保存 key 允许任意服务商格式，但限定空白处理和最大长度。
// 不在 schema 中猜测 sk- 前缀，服务商未来调整格式时无需改业务判断。
// 认证失败属于网络业务结果，与参数格式不合法的 INVALID_ARGUMENT 区分。
// 原值不能出现在 schema 的对用户错误详情里，生产 handler 使用固定错误文案。
// optional provider 仍只兼容硅基流动，不能跟随最近选择隐式改站点。
export const AgentProviderSecretArgsSchema = z.tuple([z.string().trim().min(1).max(8192), AgentProviderSchema.optional()]);

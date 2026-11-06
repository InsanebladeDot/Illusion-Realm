/** Prompt assistant contracts: provider-specific credentials stay in the main process. */
// Euzhi 是命名供应商，主进程固定目的地并复用 Agent 的凭据分区。
// 不能把它当普通 custom 保存另一份密钥，否则两个入口会显示不同配置状态。
// 原 GLM 和自定义供应商值保持不变，旧用户文档无需迁移。
export type PromptProvider = "glm" | "custom" | "euzhi";
export interface PromptConnection { provider: PromptProvider; baseUrl: string }
export interface PromptTransformRequest extends PromptConnection { model: string; text: string; instruction: string }
export interface PromptSecretStatus { configured: boolean; protection: string; tail: string }
export interface PromptInstructionPreset { id: string; name: string; instruction: string }
/** 成功转换的本地收据；只保留查看结果需要的信息，不包含连接地址或密钥。 */
// 同一次响应有自己的 id，重复翻译相同文本仍是不同时间发生的两次操作。
// createdAt 是响应完成时的毫秒时间，不使用列表位置代替真实时间。
// before/after 保留原始换行，便于对照，不再发请求重新生成历史结果。
// provider/model/presetName 来自发送快照，后来切站或删除预设不改写旧记录。
// contextId 只区分来源输入，不授予历史列表自动覆盖该输入的能力。
// 历史和其他偏好一起落到现有用户文档，不新增旁车文件或数据库。
export interface PromptTranslationRecord {
  // 随机操作标识不由正文生成，相同原文多次翻译不会互相覆盖。
  // 它只作为本地列表身份，不是服务商的请求号或计费凭证。
  id: string;
  // 单位固定毫秒，旧数据不能把秒数当作相同日期解析。
  // 记录成功完成而非发起时刻，耗时较长的请求可能排在后来发起的请求前面。
  createdAt: number;
  // 请求时冻结的原文，不是用户在等待过程中后来修改的草稿。
  // 英文标签、括号和换行需要原样保留，不能为了摘要显示而截断存储。
  before: string;
  // 经过现有响应解析与非空检查的实际文本，不拼入时间或模型说明。
  // 它可以还没应用到输入框，因此不能从当前编辑器内容反向恢复历史。
  after: string;
  // 只保留供应商枚举，不记录自定义端点，减少本地文档的连接信息冗余。
  // 切换 Agent 聊天站点不改变此枚举，它描述的是这次文本转换的站点。
  provider: PromptProvider;
  // 使用真正提交的模型名，Euzhi 的值取自发送时的 Agent 选择。
  // 不用 preferences.model 推断所有站点，因为自定义站点另有模型字段。
  model: string;
  // 内置预设存当时可见名称，自定义预设存用户当时保存的名称。
  // 这里不是预设外键，日后删除预设仍应能解释历史结果使用的模式。
  presetName: string;
  // 保存来源标识帮助识别同一时间由不同输入框完成的操作。
  // 它不带文本写入函数，持久化数据不能成为可执行的 UI 回调。
  contextId: string;
}
export interface PromptAssistantPreferences {
  provider: PromptProvider;
  baseUrl: string;
  model: string;
  customModel: string;
  presetId: string;
  presets: PromptInstructionPreset[];
  // 旧文档没有该字段时按空历史读取，不要求用户迁移或重新配置连接。
  // 只保存已成功返回的结果，失败、取消查看或撤销替换不制造新记录。
  // 数量与字段校验在渲染侧归一化，接口不会把整段历史发给模型。
  history?: PromptTranslationRecord[];
}

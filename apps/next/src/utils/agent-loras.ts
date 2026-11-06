/**
 * Agent 主模型与可选 LoRA 参数在渲染端的收口及 ComfyUI 精确名称解析。
 * 主进程已经按实际本地文件检查架构，这里防止路径解析把文件换成同名候选。
 * 显式主模型不论是否带 LoRA 都必须核对服务器清单，不回落到模糊 basename。
 * 使用真实服务器返回的路径分隔符生成节点，避免 Windows 与远端平台的命名差异。
 * 不修改全局 UI 模型解析策略，严格规则作用于 Agent 明确指定模型的请求。
 * 纯渲染模块只通过既有 API 取得清单，不访问 Node 文件系统或 Electron 对象。
 * 此处不读取自报的 family；实际架构证据始终由主进程目录与来源校验负责。
 */
import { fetchComfyModelLists } from "@/api/comfyui";
import { t } from "@/i18n";
import type { ImageWorkflowParams, LoraPromptItem } from "@/utils/comfy/imageWorkflow";

/**
 * IPC 中的工具参数仍是 unknown，不把 JSON Schema 当作运行时类型保证。
 * 只接受最多二十项数组，防止意外为字符串或超大数组时静默丢失加载需求。
 * 缺省返回空数组，与不添加扩展的旧工具行为保持一致。
 * 每项复制为新对象，仅保留 name 与 strength，不传播模型自行添加的其他字段。
 * strength 缺省是 1，显式 0 与负数原样保留，不进行字符串转数字。
 * 非有限数字与范围外数值直接报错，不让 JSON 序列化悄悄变成 null。
 * 主进程先做同样的边界检查，此处保证内部调用也无法生成损坏的 LoRA 节点。
 * 不做架构猜测，也不自动按名字选相似模型。
 * 错误统一走词条，调用端会按已有宿主回执协议返回可读失败。
 * @param value 原始工具的 loras 字段
 * @returns 保留调用顺序的模型权重列表
 */
export function readAgentLoras(value: unknown): LoraPromptItem[] {
  // 不使用 strength || 1，因为零是合法权重，不是缺少数值。
  // 正负权重范围对称，避免接收端的行为与主进程参数护栏分叉。
  // name 后续还要在服务器清单唯一匹配，此处非空不代表文件已经存在。
  // 不接收 LoRA 的自报模型家族，也不凭 name 中的字符重新判断架构。
  // 字符串权重必须报错，不能通过隐式转换制造界面与实际执行差异。
  // 返回新数组允许后续替换服务器精确名称，而不污染原始调用参数。
  // 数量上限在 map 前检查，防止先处理大量脏输入再报告超过限制。
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) throw new Error(t("errors.agentHostTool.invalidLoras"));
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || !("name" in item) || typeof item.name !== "string" || !item.name.trim()) throw new Error(t("errors.agentHostTool.invalidLoras"));
    const strength = "strength" in item && item.strength !== undefined ? item.strength : 1;
    if (typeof strength !== "number" || !Number.isFinite(strength) || Math.abs(strength) > 5) throw new Error(t("errors.agentHostTool.invalidLoras"));
    return {name:item.name.trim(),strength};
  });
}

/**
 * 只比较完整相对名称，允许斜杠与反斜杠这一个平台差异。
 * 不按 basename、后缀或第一项兜底，避免 Anima/foo 和 SDXL/foo 被混淆。
 * 多个服务器名称规范化后相同也拒绝，不能在大小写敏感服务上随便选一个。
 * 名称不是相对形式或包含上级目录时拒绝，主进程不会产生这样的规范结果。
 * 成功时返回服务器原名，节点不会继续使用本地 Windows 分隔符猜测远端路径。
 * 缺失与歧义共享一个失败提示，请求在提交 GPU 任务之前停止。
 * 名称在此不做 URL 编码，ComfyUI API prompt 输入本来就是普通字符串。
 * 规范化不是文件授权；本地读取授权已经在主进程完成。
 * @param name Agent 提供或主进程规范化的完整相对名
 * @param available 对应加载器的实时服务器清单
 */
function exactServerName(name: string, available: string[]): string {
  // 大小写规范化后匹配多项也算歧义，兼容 Linux 的区分大小写模型目录。
  // 一个合法的文件名也可能在其他系列存在，因此不允许只取路径最后一段匹配。
  // 主模型或扩展名称必须在对应加载器清单中存在，不混入其他类别的同名资源。
  // 服务器返回名原样写入 prompt，不能重新换成 UI 显示名或去掉扩展名。
  // 此处仅处理名字映射，不访问目录，也不把远端模型路径当成本地文件路径。
  // 清单为空时也明确失败，不能保留未核实名称后假设服务器会自行处理。
  const normalize = (value: string) => value.replace(/\\/g,"/").toLowerCase();
  if (/^(?:[a-z]:|[/\\])/i.test(name) || name.split(/[/\\]/).includes("..")) throw new Error(t("errors.agentHostTool.loraModelUnavailable",{name}));
  const matches = available.filter(value => normalize(value) === normalize(name));
  if (matches.length !== 1) throw new Error(t("errors.agentHostTool.loraModelUnavailable",{name}));
  return matches[0];
}

/**
 * Agent 明确指定主模型时统一严格解析，LoRA 为空也不能走模糊同名匹配。
 * Anima 对照 diffusionModels，SDXL 对照 checkpoints，不能混用两个加载器清单。
 * model 必须明确填写，防止模板中的默认模型掩盖本地兼容性检查所用的主模型。
 * 带 LoRA 时主进程会按实际模型核验 series；无扩展时沿用宿主入口的系列选择。
 * 所有 LoRA 都精确存在后才返回参数；中途某项失败不会提交部分加载链。
 * 数组映射保留顺序与权重，工作流构造函数负责把它们接入已有模型链。
 * 服务器不可连接时保留异常原因，不能把未知清单当成空目录后继续生成。
 * 调用端的 try/catch 会完成失败通知和宿主错误回执。
 * 本函数不提交任务，不写文件，不修改任何生成状态。
 * 返回参数会同时用于工作流和 Meta，确保图片记录的 LoRA 与实际提交一致。
 * @param params 已转换为工作流形状的请求
 * @param serverAddress 当前设置里的 ComfyUI 地址
 */
export async function resolveAgentLoraParams(params: ImageWorkflowParams, serverAddress: string): Promise<ImageWorkflowParams> {
  // 列表获取沿用既有 API 代理，因此不会在浏览器里绕开地址与凭据管理规则。
  // 复用现有 API 的短期清单缓存，不维护第二份 Agent 专用模型列表。
  // 先解析主模型再映射 LoRA，失败时不会返回带未确认主模型的半成品参数。
  // 这里没有直接调用 generateWithComfy，所有校验通过后才由宿主执行端提交。
  // 返回模型和 LoRA 都来自同一次服务器响应，避免混合多个时间点的模型清单。
  // 如果本地库与远端 ComfyUI 库不同，需要用户使完整名称与实际部署一致。
  // 这里只核对名称，不假装可以在未读取远端权重的情况下证明两个文件哈希相同。
  if (!params.checkpointName) throw new Error(t("errors.agentHostTool.loraModelRequired"));
  const lists = await fetchComfyModelLists(serverAddress);
  // 较旧服务器可能不提供 diffusionModels 字段，视为不可核实而非使用 checkpoint 顶替。
  // 空数组会产生可读的模型缺失错误，不会在运行时对 undefined 调用 filter。
  // SDXL 的清单独立保留，不把两个加载器的名称合并成一个宽松匹配集合。
  const models = params.series === "anima" ? lists.diffusionModels ?? [] : lists.checkpoints;
  return {...params,checkpointName:exactServerName(params.checkpointName,models),loras:params.loras?.map(item => ({...item,name:exactServerName(item.name,lists.loras)}))};
}

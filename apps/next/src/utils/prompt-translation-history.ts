/** 校验用户文档里的翻译历史，用完成时间恢复顺序；不读取文件或发网络请求。 */
// 像整理按日期归档的收据：坏掉的一张跳过，不能使整本记录都打不开。
// 本模块只管历史形状，连接参数与密钥仍由原提示词助手处理。
// 接收 unknown 是为了容忍用户手动编辑 JSON 或旧版本没有此字段。
// 类型守卫检查真实字段，不把任意对象强行断言为成功转换记录。
// 空原文或空译文不算成功，不能出现在可查看的结果列表里。
// 模型和预设是历史快照，不能用此刻的设置替换过去的标签。
// 完成时间必须有效，否则日期控件和排序都会失去确定含义。
// 同一时间戳沿用输入先后，避免渲染时随机抖动。
// 最多保留最近一百条，防止每次保存偏好都带上无限增长的文本。
// 数量限制在读取与追加后的归一化都生效，不只是界面隐藏旧条目。
// 该上限是本地保留策略，不代表旧版本早于此功能的翻译能够追溯。
// 不依据原文去重，因为相同原文可能有不同预设、模型或译文。
// 只按操作 id 去重，处理手工文档中重复粘贴同一条收据的情况。
// 文本始终当普通字符串展示，不解析成 HTML、脚本或路径。
import type { PromptTranslationRecord } from "@illusion-realm/shared";

/** 缺字段或时间损坏的单项被排除，其他有效记录仍可使用。 */
// 不检查是否还能访问旧模型；看历史不需要模型在线或持有 API Key。
// 供应商只接受当前约定的三个值，避免把未知字符串当作正式连接类型。
// contextId 可以是分类标识，但不会在历史里作为用户可见标题直接输出。
// 每个字段单独缩窄，禁止 any 绕过用户文档的输入边界。
// 日期上界采用 JavaScript Date 能表达的范围，避免格式化时抛出异常。
// 字符串上限只拦截损坏的大字段，不截断合法记录形成假完整结果。
// 元数据同样按字符串读取，不执行自定义预设中的任何指令。
function isTranslationRecord(value: unknown): value is PromptTranslationRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return [item.id, item.before, item.after, item.model, item.presetName, item.contextId].every(text => typeof text === "string" && text.length > 0 && text.length <= 100000)
    && typeof item.createdAt === "number" && Number.isFinite(item.createdAt) && item.createdAt > 0 && item.createdAt <= 8640000000000000
    && (item.provider === "glm" || item.provider === "custom" || item.provider === "euzhi");
}

/** 保存顺序以最新完成在前为准；用户的查看方向只影响 UI，不改写历史。 */
// 复制数组后再排序，不能就地更改 Zustand 已发布的偏好。
// 相同 id 只保留第一次，避免 React key 重复或把同一操作显示两遍。
// 一百条之外的记录不会继续留在本次归一化结果中。
// 没有历史的旧用户返回空数组，不伪造样例收据。
// 返回真实记录对象，原文、译文的换行与空格保持原样。
// Set 只存轻量 id，不复制文本或持有图片等其他创作资源。
export function normalizeTranslationHistory(value: unknown): PromptTranslationRecord[] {
  // 例如文档为旧时间 A、新时间 B，返回 B、A，和磁盘数组原先顺序无关。
  // 若 B 被误粘贴两次，只保留一条 B；真正的两次翻译应有两个独立 id。
  // 一百零一条有效收据会留下时间最新的一百条，而不是数组最前的一百个未知项。
  // 坏记录先被过滤，所以它既不占保留名额，也不会让排序读到非数字时间。
  // 排序的 .filter 产生新数组，旧 Zustand 引用不会因 sort 原地变更。
  // seen 只活在单次调用里，不能跨文档把另一个用户恰好相同的 id 当成重复。
  // 同毫秒不同 id 仍保留输入先后，JavaScript 稳定排序提供一致的平局顺序。
  // 当前追加把新收据放在数组前，同毫秒的完成记录因此优先显示刚追加的项。
  // 这里不修复非法时间或缺失正文，猜测补齐会让用户误认为这是实际响应。
  // 对坏数据采取跳过策略，原连接和预设仍可以正常使用，不要求整段重置。
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter(isTranslationRecord).sort((a, b) => b.createdAt - a.createdAt).filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, 100);
}

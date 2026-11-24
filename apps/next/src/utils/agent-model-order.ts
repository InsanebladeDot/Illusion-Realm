/** 排列共用模型窗口的副本；只改变显示顺序，不改目录、推荐或已选模型。 */
import type { AgentCatalogModel } from '@illusion-realm/shared';

export const AGENT_MODEL_ORDERS = ['free-first', 'price-asc', 'price-desc', 'official'] as const;
export type AgentModelOrder = typeof AGENT_MODEL_ORDERS[number];

/** 输入、输出各一百万 token 的基础价相加；缺一项就视为未知，不能当零元。 */
function cost(model: AgentCatalogModel): number | null {
  return model.input === null || model.output === null ? null : model.input + model.output;
}

function compare(left: AgentCatalogModel, right: AgentCatalogModel, order: AgentModelOrder): number {
  const a = cost(left), b = cost(right);
  // 像没有标价的货架：无论升序还是降序，未知价格都放在已标价的后面。
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  if (order === 'free-first' && (a === 0 || b === 0)) return a === b ? 0 : a === 0 ? -1 : 1;
  return order === 'price-desc' ? b - a : a - b;
}

/** 同价保留官网先后顺序；排序不受名称、令牌权限或卡片选中状态影响。 */
export function orderAgentModels(models: readonly AgentCatalogModel[], order: AgentModelOrder): AgentCatalogModel[] {
  return order === 'official' ? [...models] : [...models].sort((a, b) => compare(a, b, order));
}

/** Agent 服务商、价格分档与目录来源使用显式词条映射，便于类型与词条引用检查。 */
export const AGENT_PROVIDER_LABELS = { siliconflow: 'agent.providers.siliconflow', euzhi: 'agent.providers.euzhi' } as const;
export const AGENT_PRICE_LABELS = { free: 'agent.providers.free', budget: 'agent.providers.budget', premium: 'agent.providers.premium' } as const;
export const AGENT_SOURCE_LABELS = { live: 'agent.providers.live', cache: 'agent.providers.cache', snapshot: 'agent.providers.snapshot' } as const;
export const AGENT_PRICING_SOURCES = { siliconflow: 'https://siliconflow.cn/models', euzhi: 'https://euzhi.vip/pricing' } as const;

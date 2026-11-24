/** Agent 与转译共用的三站目录契约；价格按百万 token，权限未知用 null，目录时间保留最近成功读取时间。 */
import { z } from 'zod';

export const AgentProviderSchema = z.enum(['siliconflow', 'euzhi', 'glm']);
export type AgentProvider = z.infer<typeof AgentProviderSchema>;
export const AgentPreferencesSchema = z.object({ provider: AgentProviderSchema, models: z.object({
  siliconflow: z.string().max(200), euzhi: z.string().max(200), glm: z.string().max(200).default(''),
}) });
export type AgentPreferences = z.infer<typeof AgentPreferencesSchema>;
export const AgentCatalogModelSchema = z.object({
  id: z.string().min(1).max(200), input: z.number().nonnegative().nullable(), output: z.number().nonnegative().nullable(),
  currency: z.enum(['CNY', 'USD']), tier: z.enum(['free', 'budget', 'premium']), groups: z.array(z.string()),
  context: z.number().nonnegative(), pricingBasis: z.enum(['token', 'tiered']), available: z.boolean().nullable(),
  tiers: z.array(z.object({ above: z.number().nonnegative(), input: z.number().nonnegative(), output: z.number().nonnegative() })),
  groupPrices: z.array(z.object({ group: z.string(), input: z.number().nonnegative().nullable(), output: z.number().nonnegative().nullable() })).optional(),
  priceNote: z.string().optional(),
  // 老缓存缺少能力字段时保持未知，不把模型可调用误当成可以看图。
  imageInput: z.boolean().nullable().optional(),
});
export type AgentCatalogModel = z.infer<typeof AgentCatalogModelSchema>;
export const AgentCatalogSchema = z.object({
  provider: AgentProviderSchema, updatedAt: z.string(), source: z.enum(['live', 'cache', 'snapshot']),
  models: z.array(AgentCatalogModelSchema), recommended: z.string(), error: z.enum(['', 'network', 'auth', 'catalog', 'availability']),
});
export type AgentCatalog = z.infer<typeof AgentCatalogSchema>;
export const AgentCatalogArgsSchema = z.tuple([AgentProviderSchema, z.boolean().optional()]);
export const AgentProviderArgsSchema = z.tuple([AgentProviderSchema.optional()]);
export const AgentProviderSecretArgsSchema = z.tuple([z.string().trim().min(1).max(8192), AgentProviderSchema.optional()]);

"use client";

/** 共用模型卡片，展示原始 ID、分组和价格条件；未知价格与免费分开，令牌可见不代表推理验证通过。 */

import { AGENT_PRICE_LABELS } from '@/data/agent-providers';
import { Check } from 'lucide-react';
import type { AgentCatalogModel } from '@illusion-realm/shared';
import { useTranslation } from '@/i18n';
import { cn } from '@/utils/cn';
import { imageCapabilityHint } from '@/utils/provider-image-capability';
interface Props { model: AgentCatalogModel; selected: boolean; recommended: boolean; onChoose: () => void; busy: boolean }
function money(value: number, currency: string) { return `${currency === 'CNY' ? '¥' : '$'}${new Intl.NumberFormat('en', { maximumFractionDigits: 4 }).format(value)}`; }
export function AgentModelCard({ model, selected, recommended, onChoose, busy }: Props) {
  const { t } = useTranslation();
  return <button type="button" data-agent-model-option={model.id} data-image-input={model.imageInput === true ? 'supported' : model.imageInput === false ? 'unsupported' : 'unknown'} disabled={busy || model.available === false} aria-pressed={selected} onClick={onChoose}
    className={cn('flex min-w-0 flex-col gap-3 rounded-2xl border p-4 text-left transition-colors disabled:opacity-45', selected ? 'border-primary/50 bg-primary/10' : 'border-border/50 bg-background/60 hover:border-primary/30')}>
    <div className="flex w-full items-start justify-between gap-3"><span className="break-all text-sm font-medium">{model.id}</span>{selected && <Check aria-hidden className="h-4 w-4 shrink-0 text-primary" />}</div>
    <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground"><span className="rounded-md bg-muted px-2 py-1">{t(AGENT_PRICE_LABELS[model.tier])}</span><span className="rounded-md bg-muted px-2 py-1">{imageCapabilityHint(model.imageInput ?? null)}</span>{recommended && <span className="rounded-md bg-primary/10 px-2 py-1 text-primary">{t('agent.providers.recommended')}</span>}</div>
    <div className="space-y-1 text-xs text-muted-foreground"><p>{t('agent.providers.input')}: {model.input === null ? t('agent.providers.unknownPrice') : money(model.input, model.currency)}</p><p>{t('agent.providers.output')}: {model.output === null ? t('agent.providers.unknownPrice') : money(model.output, model.currency)}</p>
      {model.groups.length > 0 && <p>{t('agent.providers.group', { group: model.groups.join(', ') })}</p>}
      {model.groupPrices?.map(group => <p key={group.group}>{t('agent.providers.groupPrice', { group: group.group, input: group.input === null ? t('agent.providers.unknownPrice') : money(group.input, model.currency), output: group.output === null ? t('agent.providers.unknownPrice') : money(group.output, model.currency) })}</p>)}
      {model.priceNote && model.pricingBasis === 'tiered' && <p className="break-words">{model.priceNote}</p>}
      {model.tiers.map(tier => <p key={tier.above}>{t('agent.providers.longPrice', { count: tier.above, input: money(tier.input, model.currency), output: money(tier.output, model.currency) })}</p>)}
      <p>{model.available === false ? t('agent.providers.unavailable') : model.available === null ? t('agent.providers.unverified') : t('agent.providers.visible')}</p>
    </div>
  </button>;
}

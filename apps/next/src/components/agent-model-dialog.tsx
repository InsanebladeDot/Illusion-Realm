"use client";

/** 复用资源弹窗和模型卡片；浏览只改草稿，应用才调用注入的保存动作，失败保留选择。 */

import { AGENT_SOURCE_LABELS, AGENT_PRICING_SOURCES } from '@/data/agent-providers';
import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import type { AgentProvider } from '@illusion-realm/shared';
import { useAgentModelDialog } from '@/hooks/use-agent-model-dialog';
import { ResourceDialogShell } from '@/components/ResourceDialogShell';
import { AgentProviderTabs } from '@/components/agent-provider-tabs';
import { AgentModelCard } from '@/components/agent-model-card';
import { SimpleSelect } from '@/components/SimpleSelect';
import { AGENT_MODEL_ORDERS, orderAgentModels, type AgentModelOrder } from '@/utils/agent-model-order';
import { useAgentProviderStore } from '@/stores/use-agent-provider-store';
import { useToastStore } from '@/stores/useToastStore';
import { useTranslation } from '@/i18n';
import { PRIMARY_BUTTON_CLASS } from '@/utils/layout';

const ORDER_LABELS = {
  'free-first': 'agent.providers.sort.free-first',
  'price-asc': 'agent.providers.sort.price-asc',
  'price-desc': 'agent.providers.sort.price-desc',
  official: 'agent.providers.sort.official',
} as const;

interface Props {
  provider: AgentProvider; onClose: () => void;
  models?: Partial<Record<AgentProvider, string>>;
  onApply?: (provider: AgentProvider, model: string) => Promise<void>;
}
export function AgentModelDialog({ provider: initial, onClose, models: selection, onApply }: Props) {
  const { t } = useTranslation(); const store = useAgentProviderStore(); const [provider, setProvider] = useState(initial);
  const [query, setQuery] = useState(''), [saving, setSaving] = useState(false); const search = useRef<HTMLInputElement>(null);
  const [order, setOrder] = useState<AgentModelOrder>('free-first');
  const [imageOnly, setImageOnly] = useState(false);
  // 像购物时先放入购物篮，点结算才付款：卡片只修改草稿，应用才写入偏好。
  const [draftModels, setDraftModels] = useState(() => ({ ...(selection ?? store.preferences.models) }));
  const catalog = store.catalogs[provider];
  const models = orderAgentModels(catalog?.models ?? [], order).filter(x => (!imageOnly || x.imageInput === true) && x.id.toLowerCase().includes(query.trim().toLowerCase()));
  const selectedModel = draftModels[provider], canApply = Boolean(selectedModel) && catalog?.models.some(model => model.id === selectedModel && model.available !== false) === true;
  const refresh = store.refresh;
  const compactLeft = useAgentModelDialog(search);
  useEffect(() => { void refresh(provider); }, [provider, refresh]);
  const apply = async () => {
    if (saving || !canApply || !selectedModel) return;
    setSaving(true);
    try { await (onApply ?? store.choose)(provider, selectedModel); onClose(); }
    catch { useToastStore.getState().show(t('agent.providers.saveFailed'), 'error'); }
    finally { setSaving(false); }
  };
  return <ResourceDialogShell open compactLeft={compactLeft} title={t('agent.providers.title')} titleId="agent-model-dialog" onOpenChange={open => { if (!open && !saving) onClose(); }}
    description={t('agent.providers.description')} toolbar={<div className="space-y-3 px-4 py-2 sm:px-6">
      <AgentProviderTabs value={provider} disabled={saving} onChange={value => { setProvider(value); setQuery(''); }} />
      {/* 模型分类：复用同一份目录和卡片，图片分类只筛选已确认支持识图的型号。 */}
      <div className="flex gap-2" role="group" aria-label={t('agent.providers.capabilityFilter')}>
        {[false, true].map(value => <button key={String(value)} type="button" data-agent-image-filter={value ? 'images' : 'all'} aria-pressed={imageOnly === value} disabled={saving} onClick={() => setImageOnly(value)} className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${imageOnly === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>{t(value ? 'agent.providers.imagesOnly' : 'agent.providers.allModels')}</button>)}
      </div>
      {/* 模型工具条：沿用统一下拉，窄窗口换行后仍能搜索、排序和刷新。 */}
      {/* 搜索区由外层圆角框显示焦点，内层不再叠加全局直角轮廓。 */}
      <div className="flex flex-wrap items-center gap-2"><label className="flex min-w-40 flex-1 items-center gap-2 rounded-xl border border-border/50 bg-background px-3 has-[:focus-visible]:border-accent-stroke"><Search className="h-4 w-4 shrink-0 text-muted-foreground" /><input ref={search} data-agent-model-search value={query} onChange={event => setQuery(event.target.value)} aria-label={t('agent.providers.search')} placeholder={t('agent.providers.search')} className="h-9 min-w-0 flex-1 border-0 bg-transparent text-sm outline-none focus-visible:outline-none!" /></label>
      <SimpleSelect portal data-agent-model-sort value={order} disabled={saving} ariaLabel={t('agent.providers.sort.label')} className="w-40 shrink-0" triggerClassName="h-9 rounded-xl text-xs" options={AGENT_MODEL_ORDERS.map(value => ({ value, label: t(ORDER_LABELS[value]) }))} onChange={value => { if (AGENT_MODEL_ORDERS.some(item => item === value)) setOrder(value as AgentModelOrder); }} />
      <button type="button" data-agent-catalog-refresh disabled={store.busy[provider]} onClick={() => void store.refresh(provider, true)} className="flex h-9 items-center gap-2 rounded-xl px-3 text-xs hover:bg-muted disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" />{t('agent.providers.refresh')}</button></div>
    </div>} footer={<div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground"><p>{t('agent.providers.priceNote')}</p><p>{t('agent.providers.recommendNote')}</p><a href={AGENT_PRICING_SOURCES[provider]} target="_blank" rel="noopener noreferrer" className="text-primary underline">{t('agent.providers.pricingLink')}</a></div>
      <button type="button" data-agent-model-apply disabled={saving || !canApply} onClick={() => void apply()} className={`${PRIMARY_BUTTON_CLASS} ml-auto min-h-9 shrink-0 rounded-xl px-5 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50`}>{t(saving ? 'common.loading' : 'agent.providers.apply')}</button>
    </div>}>
    <div className="space-y-4">{catalog && <p className="text-xs text-muted-foreground">{t('agent.providers.updated', { time: new Date(catalog.updatedAt).toLocaleString() })} · {t(AGENT_SOURCE_LABELS[catalog.source])}</p>}
      {provider === 'euzhi' && <p data-euzhi-token-help className="text-xs text-muted-foreground">{t('agent.providers.euzhiHelp')} <a href="https://euzhi.vip/console/token" target="_blank" rel="noopener noreferrer" className="text-primary underline">{t('agent.providers.tokenLink')}</a></p>}
      {(store.errors[provider] || catalog?.error) && <p role="status" className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">{t(catalog?.error === 'auth' ? 'agent.providers.authError' : 'agent.providers.refreshError')}</p>}
      {!models.length && <p role="status" className="py-8 text-center text-sm text-muted-foreground">{t(store.busy[provider] ? 'agent.providers.loading' : 'agent.providers.empty')}</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{models.map(model => <AgentModelCard key={model.id} model={model} selected={selectedModel === model.id} recommended={catalog?.recommended === model.id} busy={saving} onChoose={() => setDraftModels(current => ({ ...current, [provider]: model.id }))} />)}</div>
    </div>
  </ResourceDialogShell>;
}

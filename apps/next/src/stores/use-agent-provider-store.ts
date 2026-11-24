"use client";

/** 共享模型目录与 Agent 选择；目录请求去重，偏好写入排队，转译只复用目录不修改 Agent 选择。 */

import { create } from 'zustand';
import { AGENT_DEFAULTS, AgentPreferencesSchema, type AgentProvider, type AgentCatalog, type AgentPreferences } from '@illusion-realm/shared';
import { createUserDataSectionPersistStorage, flushUserDataSave } from '@/utils/userDataStorage';
import { readAgentCatalog } from '@/utils/agent-provider';
import { t } from '@/i18n';
const defaults: AgentPreferences = { provider: 'siliconflow', models: { siliconflow: AGENT_DEFAULTS.model, euzhi: '', glm: '' } };
// 状态 store 不读取环境变量，避免把主进程开发配置镜像进浏览器内存。
const storage = createUserDataSectionPersistStorage<AgentPreferences>('agentPreferences');
let loading: Promise<void> | null = null;
let preferencesWrite: Promise<void> = Promise.resolve();
const jobs = new Map<AgentProvider, Promise<void>>();
interface ProviderState {
  preferences: AgentPreferences; ready: boolean; catalogs: Partial<Record<AgentProvider, AgentCatalog>>;
  errors: Partial<Record<AgentProvider, boolean>>; busy: Partial<Record<AgentProvider, boolean>>;
  load: () => Promise<void>; choose: (provider: AgentProvider, model?: string) => Promise<void>; refresh: (provider: AgentProvider, force?: boolean) => Promise<void>;
}
export const useAgentProviderStore = create<ProviderState>((set, get) => ({
  preferences: structuredClone(defaults), ready: false, catalogs: {}, errors: {}, busy: {},
  load: () => {
    if (!loading) loading = (async () => {
      try { const value = (await storage.getItem('agentPreferences'))?.state; const parsed = AgentPreferencesSchema.safeParse(value); set({ preferences: parsed.success ? parsed.data : structuredClone(defaults), ready: true }); }
      catch (error) { loading = null; throw error; }
    })();
    return loading;
  },
  choose: (provider, model) => {
    const operation = preferencesWrite.then(async () => {
    await get().load();
    const previous = get().preferences; const selected = model ?? (previous.models[provider] || get().catalogs[provider]?.recommended || '');
    const preferences = { provider, models: { ...previous.models, [provider]: selected } };
    try { await storage.setItem('agentPreferences', { state: preferences }); await flushUserDataSave(); set({ preferences }); }
    catch (error) { await storage.setItem('agentPreferences', { state: previous }); throw error; }
    });
    preferencesWrite = operation.catch(() => {}); return operation;
  },
  refresh: (provider, force = false) => {
    const previous = jobs.get(provider);
    // 换密钥或重新登录时，旧请求结束后再查一次，不能把旧权限当成刷新结果。
    if (previous) return force ? previous.then(() => get().refresh(provider, true)) : previous;
    const job = (async () => {
      set(s => ({ busy: { ...s.busy, [provider]: true } }));
      try { const catalog = await readAgentCatalog(provider, force); set(s => ({ catalogs: { ...s.catalogs, [provider]: catalog }, errors: { ...s.errors, [provider]: false } })); }
      catch { set(s => ({ errors: { ...s.errors, [provider]: true } })); }
      finally { set(s => ({ busy: { ...s.busy, [provider]: false } })); jobs.delete(provider); }
    })(); jobs.set(provider, job); return job;
  },
}));
export async function agentRunSelection(providerOverride?: AgentProvider) {
  const store = useAgentProviderStore.getState(); await store.load();
  const { provider: savedProvider, models } = useAgentProviderStore.getState().preferences;
  const provider = providerOverride ?? savedProvider;
  if (!models[provider]) await store.refresh(provider);
  const catalog = useAgentProviderStore.getState().catalogs[provider];
  const model = models[provider] || catalog?.recommended || '';
  if (!model || catalog?.models.find(x => x.id === model)?.available === false) throw new Error(t('agent.providers.selectionUnavailable'));
  return { provider, model };
}

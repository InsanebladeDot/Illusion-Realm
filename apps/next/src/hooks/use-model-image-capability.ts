"use client";

/** 只读公共目录判断当前型号；请求复用 store 去重，多个输入框不各自下载目录。 */
import { useEffect } from 'react';
import type { AgentProvider } from '@illusion-realm/shared';
import { useAgentProviderStore } from '@/stores/use-agent-provider-store';
import { modelImageInput } from '@/utils/provider-image-capability';

export function useModelImageCapability(provider: AgentProvider | 'custom', model?: string) {
  const catalog = useAgentProviderStore(state => provider === 'custom' ? undefined : state.catalogs[provider]);
  const refresh = useAgentProviderStore(state => state.refresh);
  useEffect(() => { if (provider !== 'custom' && !catalog) void refresh(provider); }, [catalog, provider, refresh]);
  return modelImageInput(catalog, model ?? catalog?.recommended ?? '');
}

"use client";

/** 登录后刷新三站目录；页面只读共享缓存，关掉应用不会留下后台轮询。 */
import { useEffect } from 'react';
import { useAgentProviderStore } from '@/stores/use-agent-provider-store';
import { useAgentSecretStore } from '@/stores/useAgentSecretStore';
import { useAccountStore } from '@/stores/useAccountStore';
import { useGuestSessionStore } from '@/stores/useGuestSessionStore';
import { AGENT_PROVIDERS } from '@/data/agent-providers';
let lastSession: string | null = null;

export function useAgentProviders() {
  const load = useAgentProviderStore(s => s.load), refresh = useAgentProviderStore(s => s.refresh);
  const provider = useAgentProviderStore(s => s.preferences.provider), ready = useAgentProviderStore(s => s.ready);
  const account = useAccountStore(s => s.profile), accountReady = useAccountStore(s => s.ready);
  const guest = useGuestSessionStore(s => s.guest), guestReady = useGuestSessionStore(s => s.ready);
  const session = account?.id ?? (guest ? 'guest' : null);
  useEffect(() => { if (ready) void useAgentSecretStore.getState().refresh(provider); }, [provider, ready]);
  useEffect(() => {
    if (!guestReady || !accountReady) return;
    if (!session) { lastSession = null; return; }
    const force = lastSession !== session;
    lastSession = session;
    // 同一登录不因路由重挂重复联网；下次登录绕过旧缓存，失败仍可查看旧目录。
    const update = (fresh = false) => { for (const id of AGENT_PROVIDERS) void refresh(id, fresh); };
    void load().then(() => update(force)).catch(() => console.warn('[agent] Could not load model preferences.'));
    const timer = setInterval(update, 6 * 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [session, guestReady, accountReady, load, refresh]);
}

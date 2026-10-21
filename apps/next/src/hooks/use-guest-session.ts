"use client";

// 页面打开、窗口恢复与计时器都重新读时间；系统休眠或后台节流不延长游客有效期。
import { useEffect } from "react";
import { useGuestSessionStore } from "@/stores/useGuestSessionStore";

export function useGuestSession() {
  const guest = useGuestSessionStore(state => state.guest);
  const ready = useGuestSessionStore(state => state.ready);
  useEffect(() => {
    if (!ready || !guest) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(timer);
      useGuestSessionStore.getState().checkExpiry();
      const current = useGuestSessionStore.getState().guest;
      if (current) timer = setTimeout(check, Math.max(1, Math.min(30000, current.expiresAt - Date.now())));
    };
    check(); window.addEventListener("focus", check); document.addEventListener("visibilitychange", check);
    return () => { clearTimeout(timer); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [guest, ready]);
  return { guest, ready };
}

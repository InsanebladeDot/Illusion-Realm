"use client";

// 长期游客只订阅持久化状态，不启动倒计时或监听窗口恢复来撤销入口。
// 水合与主动退出由 store 处理，路由切换不会创建新的游客记录。
// ready 仍阻止文档尚未读完时闪现登录页，避免把加载中当成已退出。
import { useGuestSessionStore } from "@/stores/useGuestSessionStore";

export function useGuestSession() {
  const guest = useGuestSessionStore(state => state.guest);
  const ready = useGuestSessionStore(state => state.ready);
  return { guest, ready };
}

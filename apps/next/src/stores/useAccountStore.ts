"use client";

// 登录账户状态只保留资料；令牌由 Electron 主进程管理，浏览器预览也不落盘。
import { create } from "zustand";
import { getAccountProfile, loginAccount, logoutAccount, registerAccount, AccountApiError } from "@/api/account";
import type { AccountProfile } from "@/types/account";

interface State { profile: AccountProfile | null; ready: boolean; loading: boolean; errorCode: string; hydrate: () => Promise<void>; register: (request: { email: string; password: string; displayName: string }) => Promise<void>; login: (request: { email: string; password: string; deviceName: string }) => Promise<void>; logout: () => Promise<void> }
export const useAccountStore = create<State>((set) => ({
  profile: null, ready: false, loading: false, errorCode: "",
  hydrate: async () => { try { const body = await getAccountProfile(); set({ profile: body.data as AccountProfile, ready: true, errorCode: "" }); } catch (error) { set({ profile: null, ready: true, errorCode: error instanceof AccountApiError ? error.code : "NETWORK_ERROR" }); } },
  register: async (request) => { set({ loading: true, errorCode: "" }); try { await registerAccount(request); } catch (error) { set({ errorCode: error instanceof AccountApiError ? error.code : "NETWORK_ERROR" }); throw error; } finally { set({ loading: false }); } },
  login: async (request) => { set({ loading: true, errorCode: "" }); try { await loginAccount(request); const body = await getAccountProfile(); set({ profile: body.data as AccountProfile }); } catch (error) { set({ errorCode: error instanceof AccountApiError ? error.code : "NETWORK_ERROR" }); throw error; } finally { set({ loading: false }); } },
  logout: async () => { set({ loading: true }); try { await logoutAccount(); } finally { set({ profile: null, loading: false }); } },
}));

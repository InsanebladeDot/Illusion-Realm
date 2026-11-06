"use client";

// 游客入口状态复用用户 JSON 文档持久化；不存密码，也不模拟已认证的普通用户。
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GuestSession, UserDataEntrySession } from "@/types/guest-session";
import { createGuestSession, readGuestSession } from "@/utils/guest-session";
import { clearAccountForGuest } from "@/api/account";
import { createUserDataSectionPersistStorage, flushUserDataSave } from "@/utils/userDataStorage";
import { t } from "@/i18n";

interface State {
  // 游客状态只区分有无本地记录，不再公开倒计时或到期退出动作。
  // ready 必须等凭据隔离结束；error 只用于入口的重试提示。
  // 主动退出仍保留，用户可以明确返回登录注册页面。
  guest: GuestSession | null; ready: boolean; error: string;
  enterGuest: () => Promise<void>; leaveGuest: () => void;
}
const storage = createUserDataSectionPersistStorage<UserDataEntrySession>("entrySession");
// 新旧记录统一落回用户 JSON 的 entrySession，不新增第二套本地存储。
// store 初始化不产生任何 HTTP；账户凭据的处理仅调用本地清除入口。
// persisted 的 ready/error 不保留，重启后必须重新完成当前进程的隔离步骤。
export const useGuestSessionStore = create<State>()(persist<State, [], [], UserDataEntrySession>((set) => ({
  guest: null, ready: false, error: "",
  enterGuest: async () => {
    // 新记录只在用户主动进入时创建；恢复已有记录走下面的水合分支。
    // startedAt 不是超时起点，也不参与任何生成次数或功能权限计算。
    // 先准备对象并不代表进入成功，只有清理与持久化全部完成才 set guest。
    // 登录页等待此 Promise，失败时仍可点击原入口重试。
    // 首次进入和再次进入共用同一动作，不能保留上一次退出前的截止时间。
    const guest = createGuestSession();
    try {
      // 必须在写入和挂载游客页面之前清除旧凭据，不使用发网络请求的 logout。
      // 失败由本动作既有回滚分支处理，不让“写盘成功”掩盖凭据隔离失败。
      // 等待清理也使已在刷新的旧会话不能随后恢复游客的云端访问权限。
      await clearAccountForGuest();
      await storage.setItem("illusion-realm-entry", { state: { guest } });
      // setItem 先更新用户文档缓存；显式 flush 确认真正落盘再放行页面。
      // 生成能力可能立即开始使用，不能只依靠 300ms 自动保存保留入口。
      // 文档写入按 section 合并，不覆盖之前保存的下载或生成设置。
      // 清理账户凭据的步骤在此之前完成，写盘失败也不会重新激活旧账号。
      // 不把 accessToken 或 refreshToken 写进这份业务用户文档。
      await flushUserDataSave();
      set({ guest, error: "" });
    } catch {
      // 写盘失败先撤销缓存中的游客，防止后续自动保存把失败的入口误写成成功。
      await Promise.resolve(storage.setItem("illusion-realm-entry", { state: { guest: null } })).catch(() => undefined);
      set({ error: t("auth.sessionSaveFailed") });
      throw new Error(t("auth.sessionSaveFailed"));
    }
  },
  // 主动退出只撤销本地入口，不清除生成资源、下载进度或其他用户设置。
  // JSON 持久化继续由 persist 处理，重启后不会误恢复已退出的游客。
  // 账户凭据在进入时已清除，退出游客不需要再次发送后端请求。
  leaveGuest: () => set({ guest: null }),
}), {
  name: "illusion-realm-entry", storage, skipHydration: true,
  partialize: ({ guest }) => ({ guest }),
  merge: (persisted, current) => {
    const guest = readGuestSession(persisted && typeof persisted === "object" && "guest" in persisted ? persisted.guest : null);
    // 读取侧先验证版本再兼容旧的一小时格式，已经到期的旧记录同样升级。
    // 合并时保留运行期回调和加载状态，不能让文档覆盖 store 动作。
    // 不读取当前时间，因此路由切换、休眠或系统校时不会中断本地任务。
    return { ...current, guest };
  },
  // persist 的合并完成并不代表业务页面可挂载；恢复游客还要撤销历史账户凭据。
  // async 回调内显式捕获错误，避免 Zustand 不等待回调导致未处理 Promise。
  // AuthGate 读取 ready，因此清理结束前不会执行账户资料加载或挂载云端页面。
  // 失败回落登录入口，保留错误提示，用户可重试；不带旧令牌放行游客。
  // 最后一次 setState 也会把迁移后的 v2 记录写回同一文档，不改其他 section。
  // 没有游客记录时不清除正式账户的令牌，原来的账号自动恢复仍保留。
  onRehydrateStorage: () => async (state, error) => {
    // state 已经由 merge 规范化；这里不重复解析或根据当前时间续期。
    // persist 不等待异步回调，所以 ready 只能在本回调内部最终设置。
    // 初始化默认 ready=false，AuthGate 因此不会在 await 清理期间误挂载应用。
    // 有账户却没有游客记录时保持原流程，让正式账号可以自动恢复。
    // 有游客时则优先本地身份选择，即使旧版本留下账户文件也先撤销。
    // read/load 的异常与凭据清理异常均在同一边界收敛，避免未处理拒绝。
    // 加载失败只取消当前入口，不删除用户模型、原始图片或队列记录。
    // 登录页通过 error 提供重试说明，不泄露主进程内部清理细节。
    // ready=true 的失败状态会让 AuthGate 跳过自动账户资料请求。
    // 因此残留令牌不会在“清理失败”后立刻被另一条自动恢复路径使用。
    // 后续手动登录仍可走登录注册接口，不需要重启客户端解锁入口。
    try {
      if (error) throw error;
      if (state?.guest) await clearAccountForGuest();
      useGuestSessionStore.setState({ ready: true });
    } catch {
      useGuestSessionStore.setState({ ready: true, guest: null, error: t("auth.sessionLoadFailed") });
    }
  },
}));

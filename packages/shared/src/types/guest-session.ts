/**
 * 长期游客入口只记录开始时间，不是账户凭据，也没有服务端权限。
 * version 2 明确区分旧的一小时记录，读取侧负责把旧记录迁移到此格式。
 * 不用 Infinity 或巨大时间戳伪装无限期，JSON 可无损保存这个记录。
 * 主动退出通过 guest=null 表达，时间流逝或系统时钟变化不会清除入口。
 * startedAt 保留最初进入时间，重启不应重建会话或修改这个值。
 */
export interface GuestSession { version: 2; startedAt: number }
export interface UserDataEntrySession { guest: GuestSession | null }
/** 仅用于识别旧版有效形状；新游客记录不再使用一小时截止时间。 */
export const GUEST_SESSION_DURATION_MS = 60 * 60 * 1000;

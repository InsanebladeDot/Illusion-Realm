/**
 * 规范化长期游客记录：v2 无截止时间，旧版一小时记录按原始形状迁移。
 * 旧记录即使已到期也可恢复；保留 startedAt，不重写用户其他数据。
 * 这个入口只决定本地页面可用性，不能用来授权账户后端请求。
 */
import { GUEST_SESSION_DURATION_MS, type GuestSession } from "@/types/guest-session";

/**
 * 输入来自用户 JSON，按 unknown 窄化，不能相信持久化层已有静态类型。
 * 数组不属于游客记录，即使运行时被附加同名属性也不能进入迁移分支。
 * startedAt 必须是可无损序列化的非负整数，拒绝小数与超出安全整数的值。
 * 新格式通过独立 version 字段识别，不能通过“没有 expiresAt”猜测版本。
 * 旧格式必须明确带正确的一小时截止时间，空对象不能变成自动游客入口。
 * 旧字段只帮助识别格式；已经过期与形状非法是两个不同命题。
 * v2 返回新对象，不把未知字段或旧 expiresAt 传播到后续持久化。
 * startedAt 原样保留，系统时钟向前或向后跳变都不应要求用户重新进入。
 * 返回 null 表示需要用户明确选择入口，不会自动创建游客或账户。
 * 全部检查均为本地纯计算，恢复游客不依赖账户服务是否在线。
 * 这里的记录无法替代主进程持有的账户令牌，也不决定云端读写权限。
 */
export function readGuestSession(value: unknown): GuestSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("startedAt" in value)) return null;
  const { startedAt } = value;
  if (typeof startedAt !== "number" || !Number.isSafeInteger(startedAt) || startedAt < 0) return null;
  // 版本存在时必须精确为 v2，不能把未知的新版本误读成旧版。
  // 无版本记录仍按旧的一小时形状验证，防止损坏数据被升级成有效入口。
  // 迁移不比较当前时间，因此停用一年后再启动也无需重新进入游客模式。
  // v2 不再保留 expiresAt，写回用户文档时自然得到统一的新格式。
  if ("version" in value) return value.version === 2 ? { version: 2, startedAt } : null;
  if (!("expiresAt" in value) || typeof value.expiresAt !== "number" || !Number.isSafeInteger(value.expiresAt)
    || value.expiresAt !== startedAt + GUEST_SESSION_DURATION_MS) return null;
  return { version: 2, startedAt };
}

/**
 * 只有显式退出或记录无法解析才失去入口，系统休眠不会改变有效性。
 * 调用方应先经过 readGuestSession；此函数不承担动态对象校验。
 * 不读取系统时间，校时和时区变化也不能中断本地生成任务。
 */
export function isGuestSessionActive(session: GuestSession | null): session is GuestSession {
  return session !== null;
}

/**
 * 新记录自带版本且没有截止时间，序列化后仍保持长期有效语义。
 * now 只记录首次进入时间，便于测试；不是任何配额或权限的依据。
 * 后端授权由账户客户端单独检查，不从 startedAt 推断登录状态。
 */
export function createGuestSession(now = Date.now()): GuestSession {
  return { version: 2, startedAt: now };
}

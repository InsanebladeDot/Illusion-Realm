import { z } from 'zod';

/** userData:write —— 持久化文档（形状由 types/userData.ts 的 UserDataDocument 约束） */
export const WriteUserDataArgsSchema = z.tuple([
  z.object({
    version: z.number().int().optional(),
  }).passthrough(),
]);

/** window:setFullScreen */
export const SetFullScreenArgsSchema = z.tuple([z.boolean()]);

/**
 * 游客切换只清除本地账户凭据，不接收任何可由页面指定的身份或路径。
 * 空 tuple 同时拒绝多传参数；主进程使用等价校验，不把 zod 带入打包运行时。
 * 该通道不调用后端 logout，也不删除生成资源或用户数据文档。
 */
export const AccountEnterGuestArgsSchema = z.tuple([]);

/**
 * 自定义 head 只能请求这四种窗口动作，不能传入任意原生方法。
 * state 只读取当前最大化状态，不产生窗口副作用。
 * minimize 与 toggle-maximize 仍由操作系统执行，不在页面内模拟。
 * close 走窗口既有 close 生命周期，保留主进程退出清理。
 * 主进程使用同值手写校验，避免将开发依赖 zod 引入 asar。
 * tuple 要求恰好一个参数，多传对象或窗口编号同样应被拒绝。
 */
export const WindowControlArgsSchema = z.tuple([z.enum(['state', 'minimize', 'toggle-maximize', 'close'])]);
// 动作类型从schema推导，preload接口与renderer不再手写第二份允许集。
// 主进程运行时仍使用等价校验器，shared类型只在编译时引用。
// tuple第一项是唯一动作，跨边界参数数量仍由tuple本身校验。
export type WindowControlAction = z.infer<typeof WindowControlArgsSchema>[0];

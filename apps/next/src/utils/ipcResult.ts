/**
 * IpcResult 解包助手。
 *
 * 主进程统一返回 `{ success, data }` / `{ success: false, error, code }`，
 * 本文件把它们还原为渲染进程惯用的语义：
 * - `unwrapIpc`：失败即抛出带 `code` 的 Error（原语义是 `throw unwrapIpcError(...)`）
 * - `unwrapIpcOr`：失败时回落为给定值（原语义是静默返回空值，现在额外 warn 一条可诊断日志）
 */
import type { IpcResult } from "@illusion-realm/shared";

/** 保留错误码的 IPC 异常 */
export class IpcCallError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "IpcCallError";
    this.code = code;
  }
}

function toIpcCallError(result: { error: string; code?: string }): IpcCallError {
  return new IpcCallError(result.error, result.code);
}

/** 成功取 data，失败抛出 IpcCallError */
export function unwrapIpc<T>(result: IpcResult<T>): T {
  if (result.success) return result.data;
  throw toIpcCallError(result);
}

/** 成功取 data，失败回落为 fallback（并打一条可诊断日志，便于定位静默失效） */
export function unwrapIpcOr<T>(result: IpcResult<T>, fallback: T, label?: string): T {
  if (result.success) return result.data;
  console.warn(
    `[ipc] ${label ?? "call"} failed${result.code ? ` (${result.code})` : ""}: ${result.error}`
  );
  return fallback;
}

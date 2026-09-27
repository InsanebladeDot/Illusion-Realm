/**
 * IPC 统一返回形状。
 *
 * 约定：跨 IPC 边界**不抛异常**，一律返回 IpcResult；
 * 调用方（渲染进程封装层）负责把失败转换成回退值或异常。
 */

export interface IpcSuccess<T> {
  success: true;
  data: T;
}

export interface IpcFailure {
  success: false;
  error: string;
  /** 稳定的机器可读标识（如 INVALID_ARGUMENT / ENOTFOUND），供调用方分支判断 */
  code?: string;
}

export type IpcResult<T> = IpcSuccess<T> | IpcFailure;

export function ipcOk<T>(data: T): IpcSuccess<T> {
  return { success: true, data };
}

export function ipcErr(error: string, code?: string): IpcFailure {
  return code ? { success: false, error, code } : { success: false, error };
}

/** 常用错误码 */
export const IPC_ERROR_CODES = {
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  NOT_FOUND: 'NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  IO_ERROR: 'IO_ERROR',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  INTERNAL: 'INTERNAL',
} as const;

export type IpcErrorCode = (typeof IPC_ERROR_CODES)[keyof typeof IPC_ERROR_CODES];

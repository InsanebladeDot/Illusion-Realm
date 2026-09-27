/**
 * IPC 注册助手：让每个 handler 只关心业务逻辑，
 * 返回值统一为 IpcResult（{ success: true, data } / { success: false, error, code? }）。
 *
 * 约定（与 packages/shared/src/ipc-result.ts 一致）：
 * - 跨 IPC 边界不抛异常；
 * - 入参校验失败返回 INVALID_ARGUMENT；
 * - 业务异常按 Error.code（ENOENT/EACCES…）映射到稳定错误码。
 *
 * 类型（仅类型层引用 shared，运行期不 require，主进程无需打包 zod/该包）：
 * @typedef {import("@illusion-realm/shared").IpcResult<unknown>} IpcResultUnknown
 * @typedef {import("@illusion-realm/shared").IpcFailure} IpcFailure
 */
const { ipcMain } = require("electron");

/** @type {Record<string, string>} */
const CODES = {
  INVALID_ARGUMENT: "INVALID_ARGUMENT",
  NOT_FOUND: "NOT_FOUND",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  IO_ERROR: "IO_ERROR",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  INTERNAL: "INTERNAL",
};

/**
 * 成功结果包装
 * @template T
 * @param {T} data
 * @returns {{ success: true, data: T }}
 */
function ipcOk(data) {
  return { success: true, data };
}

/**
 * 失败结果包装
 * @param {string} error 面向用户的错误信息
 * @param {string} [code] 稳定错误码
 * @returns {{ success: false, error: string, code?: string }}
 */
function ipcErr(error, code) {
  return code ? { success: false, error, code } : { success: false, error };
}

/**
 * 把任意异常收敛成 { error, code }（不向渲染进程泄露堆栈）
 * @param {unknown} error
 * @returns {{ error: string, code: string }}
 */
function toIpcError(error) {
  const message =
    error instanceof Error && error.message ? error.message : String(error);
  const rawCode =
    error && typeof error === "object" && "code" in error
      ? /** @type {{ code?: unknown }} */ (error).code
      : undefined;

  let code = CODES.INTERNAL;
  if (rawCode === "ENOENT") code = CODES.NOT_FOUND;
  else if (rawCode === "EACCES" || rawCode === "EPERM") code = CODES.PERMISSION_DENIED;
  else if (typeof rawCode === "string" && /^E[A-Z]+$/.test(rawCode)) code = CODES.IO_ERROR;

  return { error: message, code };
}

/**
 * 校验入参：validator 返回 null 表示通过，否则返回错误文案。
 * @param {unknown[]} args handler 收到的参数
 * @param {((args: unknown[]) => string | null) | undefined} [validator]
 * @returns {IpcFailure | null}
 */
function validateArgs(args, validator) {
  if (!validator) return null;
  const message = validator(args);
  return message ? ipcErr(message, CODES.INVALID_ARGUMENT) : null;
}

/**
 * 注册一个 invoke 类通道：统一入参校验 + 结果包装 + 异常收敛。
 * @param {string} channel 通道名（取自 ipcChannels.js）
 * @param {(event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown | Promise<unknown>} handler
 * @param {(args: unknown[]) => string | null} [validator] 返回错误文案表示校验失败
 * @returns {void}
 */
function registerHandle(channel, handler, validator) {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (event, ...args) => {
    const invalid = validateArgs(args, validator);
    if (invalid) return invalid;

    try {
      return ipcOk(await handler(event, ...args));
    } catch (error) {
      const { error: message, code } = toIpcError(error);
      console.error(`[IPC] ${channel} failed (${code}):`, message);
      return ipcErr(message, code);
    }
  });
}

/**
 * 主进程 → 渲染进程的单向通知：不做 IpcResult 包装
 * @param {string} channel
 * @param {(event: Electron.IpcMainEvent, ...args: any[]) => void} handler
 * @returns {void}
 */
function registerSend(channel, handler) {
  ipcMain.removeAllListeners(channel);
  ipcMain.on(channel, (event, ...args) => handler(event, ...args));
}

module.exports = {
  CODES,
  ipcOk,
  ipcErr,
  toIpcError,
  registerHandle,
  registerSend,
};

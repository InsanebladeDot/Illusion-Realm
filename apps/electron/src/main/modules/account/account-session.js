/**
 * 账户令牌只由主进程管理：优先使用 Electron safeStorage 加密，降级时明确标记。
 * 渲染进程只能通过账户 IPC 发起请求，不能读取 accessToken 或 refreshToken。
 */
const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");

const FILE = "account-session.json";
/** @typedef {{ accessToken: string, refreshToken: string, accessExpiresAt: string, sessionExpiresAt: string, sessionId: string }} AccountSession */

function filePath() {
  return path.join(app.getPath("userData"), FILE);
}

function readSession() {
  try {
    const document = JSON.parse(fs.readFileSync(filePath(), "utf8"));
    if (!document || typeof document.value !== "string") return null;
    const encrypted = document.protection === "safeStorage";
    const text = encrypted ? safeStorage.decryptString(Buffer.from(document.value, "base64")) : Buffer.from(document.value, "base64").toString("utf8");
    const session = JSON.parse(text);
    return typeof session.accessToken === "string" && typeof session.refreshToken === "string" ? session : null;
  } catch {
    return null;
  }
}

/** @param {AccountSession} session */
function writeSession(session) {
  const text = JSON.stringify(session);
  const encrypted = safeStorage.isEncryptionAvailable();
  const value = encrypted ? safeStorage.encryptString(text).toString("base64") : Buffer.from(text, "utf8").toString("base64");
  fs.mkdirSync(path.dirname(filePath()), { recursive: true });
  fs.writeFileSync(filePath(), `${JSON.stringify({ version: 1, protection: encrypted ? "safeStorage" : "plain", value })}\n`, { mode: 0o600 });
}

function clearSession() {
  try { fs.rmSync(filePath(), { force: true }); } catch { /* 清理失败不暴露令牌 */ }
}

module.exports = { readSession, writeSession, clearSession };

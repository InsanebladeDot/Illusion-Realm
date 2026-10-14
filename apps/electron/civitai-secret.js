/** Store the Civitai API key separately with Electron safeStorage; expose status only to the renderer. */
const fs = require("fs");
const path = require("path");
const { getDefaultUserDataPath } = require("./userDataPaths");
const FILE_NAME = "civitai-api-key.json";
/** @param {string} [dir] Test callers supply an isolated directory; the env override is smoke-only, as for Agent secrets. */
const filePath = (dir) => path.join(dir || process.env.ILLUSION_CIVITAI_SECRET_DIR || path.dirname(getDefaultUserDataPath()), FILE_NAME);
const electronSafeStorage = () => { try { return require("electron").safeStorage; } catch { return null; } };
/** @param {unknown} value @returns {value is string} */
function validKey(value) { return typeof value === "string" && value.length <= 4096 && /^[\x21-\x7e]+$/.test(value.trim()); }
/** @param {string} [dir] */
function read(dir) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath(dir), "utf8"));
    if (!value || value.version !== 1 || typeof value.value !== "string" || !value.value) return null;
    if (!["plain", "safeStorage"].includes(value.protection)) return null;
    const safe = value.protection !== "plain", storage = electronSafeStorage();
    if (safe && !storage) return null;
    const key = safe && storage ? storage.decryptString(Buffer.from(value.value, "base64")) : Buffer.from(value.value, "base64").toString("utf8");
    return validKey(key) ? { key, protection: safe ? "safeStorage" : "plain" } : null;
  } catch { return null; }
}
/** @param {string} [dir] */
function resolve(dir) { return read(dir) || { key: "", protection: "" }; }
/** @param {string} [dir] */
function status(dir) { const value = resolve(dir); return { configured: Boolean(value.key), protection: value.protection, tail: value.key.length > 4 ? value.key.slice(-4) : "" }; }
/** @param {unknown} key @param {string} [dir] */
function write(key, dir) {
  if (!validKey(key)) throw new Error("invalid");
  try {
    const storage = electronSafeStorage(), safe = Boolean(storage?.isEncryptionAvailable?.());
    const encoded = safe && storage ? storage.encryptString(key.trim()).toString("base64") : Buffer.from(key.trim()).toString("base64");
    fs.mkdirSync(path.dirname(filePath(dir)), { recursive: true });
    fs.writeFileSync(filePath(dir), JSON.stringify({ version: 1, protection: safe ? "safeStorage" : "plain", value: encoded }) + "\n", { mode: 0o600 });
    return status(dir);
  } catch { throw new Error("io"); }
}
/** @param {string} [dir] */
function clear(dir) { try { fs.rmSync(filePath(dir), { force: true }); } catch { throw new Error("io"); } return status(dir); }
module.exports = { resolve, status, write, clear, validKey };

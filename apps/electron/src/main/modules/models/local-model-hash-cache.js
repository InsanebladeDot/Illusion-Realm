/** 每个权重各存一份摘要 JSON；附带文件状态，文件变动后旧摘要失效。 */
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const MAX_BYTES = 16384;

/** @param {import('node:fs').Stats} stat */
function fingerprint(stat) {
  return { size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, ino: stat.ino, dev: stat.dev };
}

/** 错误摘要文件保留原样，向界面报告资料损坏，不当作磁盘故障。 @param {string} raw */
function parseSnapshot(raw) {
  try { return /** @type {unknown} */ (JSON.parse(raw)); }
  catch { throw new Error("metadataInvalid"); }
}

/** 限量读取且拒绝链接，不让旁车文件把访问带出模型目录。 @param {string} target */
async function readSnapshot(target) {
  try {
    if (await fs.realpath(target) !== target) throw new Error("metadataInvalid");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      try { await fs.lstat(target); } catch (missing) {
        if (missing && typeof missing === "object" && "code" in missing && missing.code === "ENOENT") return null;
      }
    }
    throw new Error("metadataInvalid");
  }
  const handle = await fs.open(target, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("metadataInvalid");
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > MAX_BYTES) throw new Error("metadataInvalid");
    const raw = bytes.subarray(0, bytesRead).toString("utf8");
    const parsed = parseSnapshot(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !("version" in parsed) || parsed.version !== 1) throw new Error("metadataInvalid");
    return { raw, data: /** @type {Record<string, unknown>} */ (parsed) };
  } finally { await handle.close(); }
}

/** 缓存须与当前文件状态一致；损坏或旧记录不能贡献匹配证据。 @param {string} model */
async function readCachedHash(model) {
  try {
    const entry = await readSnapshot(model + ".sha256.json");
    if (!entry) return undefined;
    if (typeof entry.data.sha256 !== "string" || !/^[a-f\d]{64}$/i.test(entry.data.sha256)) return "";
    const current = fingerprint(await fs.stat(model));
    return JSON.stringify(entry.data.file) === JSON.stringify(current) ? entry.data.sha256.toLowerCase() : "";
  } catch { return ""; }
}

/** 像盖章前再核对原稿，别人改过记录就停止；来源 JSON 始终不动。
 * @param {string} model @param {Awaited<ReturnType<typeof readSnapshot>>} previous
 * @param {string} sha256 @param {() => Promise<void>} verify */
async function saveCachedHash(model, previous, sha256, verify) {
  const target = model + ".sha256.json", temporary = path.join(path.dirname(model), `.hash-${randomUUID()}.part`);
  try {
    const data = { ...previous?.data, version: 1, sha256, file: fingerprint(await fs.stat(model)) };
    await fs.writeFile(temporary, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
    await verify();
    if ((await readSnapshot(target))?.raw !== previous?.raw) throw new Error("changed");
    if (previous) await fs.rename(temporary, target);
    else await fs.link(temporary, target);
  } finally { await fs.rm(temporary, { force: true }); }
}

module.exports = { readCachedHash, readSnapshot, saveCachedHash };

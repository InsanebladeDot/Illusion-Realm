/** 离线补 SHA256，复用授权、固定缓冲摘要和目录锁；不联网、不改权重或来源资料。 */
const path = require("node:path");
const { configuredPaths } = require("./downloads/model-download-paths");
const { authorizedModel, readEntry } = require("./local-model-metadata");
const { openModelHash } = require("./local-model-hash");
const { readSnapshot, saveCachedHash } = require("./local-model-hash-cache");
const { reserveFolders } = require("./model-folder-locks");
let active = 0;

/** 计算前后都核对实际文件；句柄在任何失败路径都会归还。
 * @param {string} model @param {string} filePath @param {string[]} roots */
async function calculate(model, filePath, roots) {
  const previous = await readSnapshot(model + ".sha256.json");
  const signal = AbortSignal.timeout(15 * 60 * 1000);
  const opened = await openModelHash(model, signal);
  try {
    await saveCachedHash(model, previous, opened.sha256, async () => {
      if (await authorizedModel(filePath, roots) !== model) throw new Error("changed");
      if (signal.aborted) throw new Error("timeout");
      await opened.verify();
    });
    return { status: "saved", sha256: opened.sha256 };
  } finally { await opened.release().catch(() => undefined); }
}

/** 已有完整摘要跳过；本入口最多同时读两个文件，目录与下载和移动互斥。
 * @param {string} filePath @returns {Promise<import('@illusion-realm/shared').LocalModelHashResult>} */
async function hashLocalModel(filePath) {
  if (active >= 2) return { status: "busy", sha256: "" };
  active++;
  let release = () => {};
  try {
    const roots = Object.values(configuredPaths()).filter(Boolean);
    const model = await authorizedModel(filePath, roots);
    if (!model) return { status: "invalid", sha256: "" };
    release = reserveFolders([path.dirname(model)]);
    const entry = await readEntry(model, roots);
    const existing = entry.localSha256 ?? entry.metadata?.sha256;
    if (existing) return { status: "existing", sha256: existing.toLowerCase() };
    return /** @type {import('@illusion-realm/shared').LocalModelHashResult} */ (await calculate(model, filePath, roots));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "io";
    const status = ["changed", "timeout", "metadataInvalid", "busy", "invalid"].includes(reason) ? reason : "io";
    return { status: /** @type {import('@illusion-realm/shared').LocalModelHashResult['status']} */ (status), sha256: "" };
  } finally { release(); active--; }
}

module.exports = { hashLocalModel };

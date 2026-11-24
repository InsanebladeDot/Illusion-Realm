/** 按任务清单的目标文件计算指纹。目录和文件名都由主进程从内置清单解析。 */
const fs = require("node:fs/promises"), path = require("node:path");
const { openModelHash } = require("../local-model-hash");
const { reserveFolders } = require("../model-folder-locks");
/** @typedef {import('@illusion-realm/shared').SetupCheckStatus} CheckStatus */
/** @type {Map<string, { key: string, status: 'ready' | 'mismatch' }>} */
const recentChecks = new Map();

/** 沿用校验结果前先比对文件身份和修改时间，文件被覆盖后恢复到待校验。
 * @param {import('node:fs').Stats} stat */
function fingerprint(stat) {
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("exists");
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
}

/** 像逐页读书一样分块读模型，内存不随文件大小增长。读取后再确认路径仍指向原文件。
 * @param {string} file @param {string} sha256 @param {string} stamp */
async function checkHash(file, sha256, stamp) {
  const release = reserveFolders([path.dirname(file)]);
  try {
    const opened = await openModelHash(file, AbortSignal.timeout(15 * 60 * 1000));
    try {
      await opened.verify();
      if (fingerprint(await fs.lstat(file)) !== stamp) throw new Error("changed");
      return opened.sha256 === sha256.toLowerCase() ? "ready" : "mismatch";
    } finally { await opened.release(); }
  } finally { release(); }
}

/** 打开清单只查看目标文件是否存在，主动校验才读取大文件的内容。
 * @param {string} file @param {string} sha256 @param {boolean} verify
 * @returns {Promise<Exclude<CheckStatus, 'unavailable'>>} */
async function inspectSetupFile(file, sha256, verify) {
  // 每次都重读文件属性。文件换了或清单锁定了新版本，旧结果都不能沿用。
  const stat = await fs.lstat(file).catch(error => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (!stat) { recentChecks.delete(file); return "missing"; }
  const stamp = fingerprint(stat);
  const key = `${stamp}:${sha256}`;
  const previous = recentChecks.get(file);
  if (!verify) return previous?.key === key ? previous.status : "found";
  const status = stat.size === 0 ? "mismatch" : await checkHash(file, sha256, stamp);
  if (recentChecks.size >= 128) recentChecks.clear();
  recentChecks.set(file, { key, status });
  return status;
}

/** 下载前沿用同一套校验，只有缺少文件时才允许写入。
 * @param {string} file @param {string} sha256 */
async function alreadyPresent(file, sha256) {
  const status = await inspectSetupFile(file, sha256, true);
  if (status === "mismatch") throw new Error("exists");
  return status === "ready";
}

module.exports = { alreadyPresent, inspectSetupFile };

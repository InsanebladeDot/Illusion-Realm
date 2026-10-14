/** Validate HTTP resume boundaries and hash the retained prefix before appending new model bytes. */
const fs = require("fs");
/** @param {Response} response @param {number} offset */
function responseRange(response, offset) {
  const length = Number(response.headers.get("content-length")) || 0;
  if (response.status === 200) return { offset: 0, total: length };
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || "");
  if (response.status !== 206 || !match) throw new Error("response");
  const [start, end, total] = match.slice(1).map(Number);
  if (![start, end, total].every(Number.isSafeInteger) || start !== offset || end < start || total <= end || (length && length !== end - start + 1)) throw new Error("integrity");
  return { offset: start, total };
}
/** @param {Response} response */
function resumeValidator(response) {
  const etag = response.headers.get("etag");
  return etag && !etag.startsWith("W/") ? etag : response.headers.get("last-modified") || "";
}
/** @param {string} temporary @param {number} length @param {import("crypto").Hash} hash @param {AbortSignal} signal */
async function hashPrefix(temporary, length, hash, signal) {
  if (!length) return;
  const stream = fs.createReadStream(temporary, { end: length - 1 });
  let count = 0;
  try {
    for await (const bytes of stream) { signal.throwIfAborted(); count += bytes.length; hash.update(bytes); }
    if (count !== length) throw new Error("integrity");
  } finally { stream.destroy(); }
}
/** @param {import("fs/promises").FileHandle} file @param {Uint8Array} bytes @param {number} position */
async function writeChunk(file, bytes, position) {
  let offset = 0;
  while (offset < bytes.length) {
    const result = await file.write(bytes, offset, bytes.length - offset, position + offset);
    if (!result.bytesWritten) throw new Error("io");
    offset += result.bytesWritten;
  }
}
module.exports = { responseRange, resumeValidator, hashPrefix, writeChunk };

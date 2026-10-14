/** Reserve whole model folders during asynchronous trash operations; prevent downloads, logo writes and moves from racing them. */
const path = require("path");
const fs = require("fs");
/** @type {Set<string>} */
const locked = new Set();
/** @param {string} folder */
function key(folder) { return path.resolve(folder).toLowerCase(); }
/** @param {string} folder */
function identities(folder) {
  try { return [key(folder), key(fs.realpathSync(folder))]; } catch { return [key(folder)]; }
}
/** @param {string} folder */
function isFolderLocked(folder) { return identities(folder).some((value) => locked.has(value)); }
/** @param {string} folder */
function assertFolderUnlocked(folder) { if (isFolderLocked(folder)) throw new Error("busy"); }
/** @param {string[]} folders */
function reserveFolders(folders) {
  folders.forEach(assertFolderUnlocked);
  const reserved = folders.flatMap(identities);
  reserved.forEach((value) => locked.add(value));
  return () => reserved.forEach((value) => locked.delete(value));
}
module.exports = { isFolderLocked, assertFolderUnlocked, reserveFolders };

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
function isFolderLocked(folder) {
  return identities(folder).some(value => [...locked].some(other => foldersOverlap(value, other)));
}
/** 父目录操作像封住整层抽屉，任何子目录读写都要等待。 @param {string} a @param {string} b */
function foldersOverlap(a, b) {
  const prefix = (/** @type {string} */ value) => value.endsWith(path.sep) ? value : value + path.sep;
  return a === b || a.startsWith(prefix(b)) || b.startsWith(prefix(a));
}
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

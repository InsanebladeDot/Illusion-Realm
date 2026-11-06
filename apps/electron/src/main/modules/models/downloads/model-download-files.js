/** Delete only tracked download artifacts in the original real directory; preserve replaced files and other models. */
const fs = require("fs");
const path = require("path");
/** @param {string} folder @param {string} realFolder */
function checkFolder(folder, realFolder) {
  if (fs.lstatSync(folder).isSymbolicLink() || fs.realpathSync(folder) !== realFolder) throw new Error("invalid");
}
/** @param {string} file */
function fileIdentity(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("invalid");
  return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}:${stat.size}:${stat.mtimeMs}`;
}
/** @param {string} folder @param {string} realFolder @param {string} temporary @param {Map<string,string>} owned */
async function deleteArtifacts(folder, realFolder, temporary, owned) {
  if (!fs.existsSync(folder)) return;
  checkFolder(folder, realFolder);
  for (const [file, identity] of owned) {
    checkFolder(folder, realFolder);
    if (path.dirname(file) !== folder) throw new Error("invalid");
    if (!fs.existsSync(file)) continue;
    if (fileIdentity(file) !== identity) continue;
    await fs.promises.unlink(file);
  }
  if (fs.existsSync(temporary)) {
    checkFolder(folder, realFolder);
    if (path.dirname(temporary) !== folder || !/^\.download-[a-f0-9-]+\.part$/.test(path.basename(temporary))) throw new Error("invalid");
    fileIdentity(temporary);
    await fs.promises.unlink(temporary);
  }
  // Removing an empty model folder is optional; never remove a category or recursively delete a folder.
  checkFolder(folder, realFolder);
  await fs.promises.rmdir(folder).catch((error) => { if (!["ENOTEMPTY", "EEXIST", "ENOENT"].includes(error.code)) throw error; });
}
module.exports = { checkFolder, fileIdentity, deleteArtifacts };

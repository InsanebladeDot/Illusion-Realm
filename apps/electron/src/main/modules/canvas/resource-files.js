/** 受管文件的安全定位与同盘搬运；像核对行李牌，身份对不上就保留，不按名字删除。 */
const fs = require('node:fs/promises');
const path = require('node:path');
const validation = require('./project-validation');
/** @typedef {{resource_id:string,workspace_id:string,workspace_folder:string,relative_path:string,media_kind:'image'|'video'|'audio',origin:string,identity:string,state:string,entered_at:number|null,expires_at:number|null,retained:number}} Resource */

/** 文件改名不改变这组身份；内容被覆盖或替换则不再有自动删除资格。 @param {import('node:fs').Stats} stat */
function identity(stat) {
  return JSON.stringify([stat.dev, stat.ino, stat.birthtimeMs, stat.size, stat.mtimeMs]);
}

/** 缺文件与无权限不同；后者必须停止回收，不能当作已不存在。 @param {string} file */
async function inspect(file) {
  try { return await fs.lstat(file); }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** @param {string} directory */
async function plainDirectory(directory) {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('canvas-resource-unsafe-directory');
}

/** owner 是删除权限的必要条件；仅仅位于 Infinite Canvas 下面仍不够。 @param {string} root @param {{id:string,folder:string}} workspace */
async function ownedDirectory(root, workspace) {
  if (!validation.workspace(workspace)) throw Error('canvas-workspace-unavailable');
  await plainDirectory(root);
  const directory = path.join(root, workspace.folder);
  await plainDirectory(directory);
  const marker = path.join(directory, '.canvas-owner');
  if (!(await fs.lstat(marker)).isFile() || await fs.readFile(marker, 'utf8') !== workspace.id) throw Error('canvas-workspace-unavailable');
  return directory;
}

/** 合成成片单独归档；只开放这层固定前缀，不接受任意嵌套目录。 @param {string} relative */
function validRelative(relative) {
  return /^(Composition[/\\])?(Picture|video|Audio)[/\\][^/\\<>:"|?*\x00-\x1f]+$/.test(relative) && !/[. ]$/.test(relative);
}

/** 像逐道检查门锁，每层都拒绝链接，避免中间目录把读写引到工程外。 @param {string} directory @param {string} relative */
async function mediaPath(directory, relative) {
  if (!validRelative(relative)) throw Error('canvas-resource-invalid-path');
  const parts = relative.split(/[/\\]/);
  let current = directory;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    await plainDirectory(current);
  }
  return path.join(current, parts[parts.length - 1]);
}

/** @param {string} root @param {Resource} row */
async function originalPath(root, row) {
  if (!validRelative(row.relative_path)) throw Error('canvas-resource-invalid-path');
  const directory = await ownedDirectory(root, { id: row.workspace_id, folder: row.workspace_folder });
  return mediaPath(directory, row.relative_path);
}

/** temp 中的子目录只属于一个台账编号；不沿链接，也不接管用户已有的普通 temp。 @param {string} root @param {Resource} row */
async function trashPath(root, row) {
  if (!/^[0-9a-f-]{36}$/i.test(row.resource_id) || !validRelative(row.relative_path)) throw Error('canvas-resource-invalid-path');
  await plainDirectory(root);
  const directory = path.join(root, 'temp');
  await fs.mkdir(directory, { recursive: true });
  await plainDirectory(directory);
  const marker = path.join(directory, '.canvas-resource-trash');
  if (!await inspect(marker)) {
    if ((await fs.readdir(directory)).length) throw Error('canvas-resource-trash-unavailable');
    await fs.writeFile(marker, 'illusion-realm-resource-trash-v1', { flag: 'wx' });
  }
  if (!(await fs.lstat(marker)).isFile() || await fs.readFile(marker, 'utf8') !== 'illusion-realm-resource-trash-v1') throw Error('canvas-resource-trash-unavailable');
  const slot = path.join(directory, row.resource_id);
  await fs.mkdir(slot, { recursive: true });
  await plainDirectory(slot);
  return path.join(slot, path.basename(row.relative_path));
}

/** @param {string} file @param {string} expected */
async function matches(file, expected) {
  const stat = await inspect(file);
  return Boolean(stat?.isFile() && !stat.isSymbolicLink() && identity(stat) === expected);
}

/**
 * 先建立不覆盖目标的硬链接再移除来源，像先确认新柜子里的行李再撤旧柜号。
 * 中断时最多留下两个指向同一文件的入口，恢复可续接；不支持硬链接的磁盘保留原件并报错。
 * 不复制大视频、不覆盖同名文件；用户在外部同时改文件仍不具备系统独占锁保证。
 * @param {string} source @param {string} target @param {string} expected
 */
async function transfer(source, target, expected) {
  const from = await inspect(source);
  const to = await inspect(target);
  if (!from && await matches(target, expected)) return;
  if (!await matches(source, expected)) throw Error('canvas-resource-identity-changed');
  if (to && !await matches(target, expected)) throw Error('canvas-resource-name-conflict');
  if (!to) await fs.link(source, target);
  if (!await matches(source, expected) || !await matches(target, expected)) throw Error('canvas-resource-identity-changed');
  await fs.unlink(source);
}

/** 外部改名时只在同一分类目录按已登记的磁盘身份找回，绝不靠同名或内容相似接管。 @param {string} root @param {Resource} row */
async function locateRenamed(root, row) {
  const original = await originalPath(root, row);
  if (await matches(original, row.identity)) return row.relative_path;
  // 原地址已被替换时保留替代文件；只找独一份匹配，多个硬链接的归属不作猜测。
  const found = [];
  for (const item of await fs.readdir(path.dirname(original), { withFileTypes: true })) {
    if (item.isFile() && await matches(path.join(path.dirname(original), item.name), row.identity)) found.push(item.name);
  }
  return found.length === 1 ? path.join(path.dirname(row.relative_path), found[0]) : null;
}

/** 仅 unlink 已核对文件，绝不用递归删除清空整个回收目录。 @param {string} file @param {string} expected */
async function removeFile(file, expected) {
  if (!await inspect(file)) return;
  if (!await matches(file, expected)) throw Error('canvas-resource-identity-changed');
  await fs.unlink(file);
}

module.exports = { identity, inspect, plainDirectory, ownedDirectory, validRelative, mediaPath, originalPath, trashPath, matches, transfer, locateRenamed, removeFile };

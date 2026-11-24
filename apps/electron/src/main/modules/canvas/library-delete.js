/** 删除自有工程目录；先核对归属和跨工程引用，失败保留删除标记供重试，不碰外部源文件。 */
const fs = require('node:fs/promises');
const path = require('node:path');
const validation = require('./project-validation');
const { nodeReferences } = require('./project-archive');
/** @typedef {import('@illusion-realm/shared').UserDataInfiniteCanvas} Canvas */
/** @typedef {{entry_id:string,directory:string,deleted:number}} Entry */

/** @param {string} parent @param {string} file */
function contains(parent, file) {
  const relative = path.relative(parent, path.resolve(file));
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** @param {string} root @param {Entry} entry */
async function targetDirectory(root, entry) {
  if (!validation.workspace({ id: entry.entry_id, folder: entry.directory })) throw new Error('canvas-library-invalid-entry');
  const target = path.resolve(root, entry.directory);
  if (target === path.resolve(root) || !contains(root, target)) throw new Error('canvas-library-invalid-entry');
  try { if ((await fs.lstat(target)).isSymbolicLink()) throw new Error('canvas-library-symlink'); }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
  if (await fs.readFile(path.join(target, '.canvas-owner'), 'utf8') !== entry.entry_id) throw new Error('canvas-workspace-unavailable');
  return target;
}

/** @param {string} target */
async function inspectTree(target) {
  // 像清空自己的抽屉：不沿快捷入口进入其他目录，删除前确认整棵树都没有链接。
  for (const item of await fs.readdir(target, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error('canvas-library-symlink');
    if (item.isDirectory()) await inspectTree(path.join(target, item.name));
  }
}

/** @param {string} root @param {Entry} entry @param {(target:string)=>Promise<Canvas>} read */
async function projectTargets(root, entry, read) {
  const target = await targetDirectory(root, entry);
  if (!target) return [];
  const result = [];
  // 导入工程包可能另分配素材抽屉；先清理它，最后再删保存着该归属的工程数据库。
  try { await fs.access(path.join(target, 'project.sqlite')); }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [{ entry, target }];
    throw error;
  }
  const canvas = await read(target);
  if (canvas.workspace && canvas.workspace.folder !== entry.directory) {
    const assets = { entry_id: canvas.workspace.id, directory: canvas.workspace.folder, deleted: entry.deleted };
    const folder = await targetDirectory(root, assets);
    if (folder) result.push({ entry: assets, target: folder });
  }
  result.push({ entry, target });
  return result;
}

/** @param {string} target @param {Entry} entry */
async function removeOwnedDirectory(target, entry) {
  const items = await fs.readdir(target);
  // 媒体先删，工程数据库和钥匙最后删；文件占用失败时仍能确认归属并再次清理。
  const files = items.filter(name => name !== '.canvas-owner').sort((a, b) => Number(a.startsWith('project.sqlite')) - Number(b.startsWith('project.sqlite')));
  for (const name of files) await fs.rm(path.join(target, name), { recursive: true, force: false });
  await fs.unlink(path.join(target, '.canvas-owner'));
  try { await fs.rmdir(target); }
  catch (error) {
    // 最后一步失败只补回本次刚移除的钥匙，不覆盖新 owner，也不重建已经消失的目录。
    try { await fs.writeFile(path.join(target, '.canvas-owner'), entry.entry_id, { flag: 'wx' }); }
    catch { /* 保留目录删除的原始失败类别，外层仍报告未清理完成。 */ }
    throw error;
  }
}

/** @param {string} root @param {Entry[]} entries @param {Set<string>} selected @param {string[]} targets @param {(target:string)=>Promise<Canvas>} read */
async function checkReferences(root, entries, selected, targets, read) {
  for (const entry of entries) {
    if (selected.has(entry.entry_id) || entry.deleted) continue;
    const directory = await targetDirectory(root, entry);
    if (!directory) throw new Error('canvas-delete-reference-check-failed');
    if (targets.includes(directory)) throw new Error('canvas-delete-shared-assets');
    const canvas = await read(directory);
    for (const node of canvas.nodes) for (const reference of nodeReferences(node)) {
      let resolved = path.resolve(reference.path);
      try { resolved = await fs.realpath(resolved); }
      catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
      if (targets.some(target => contains(target, resolved))) throw new Error('canvas-delete-shared-assets');
    }
    if (canvas.workspace && targets.includes(path.resolve(root, canvas.workspace.folder))) throw new Error('canvas-delete-shared-assets');
  }
}

/** @param {string} root @param {import('../../storage/sqlite/client').SqliteClient} catalog @param {string[]|null} ids @param {(target:string)=>Promise<Canvas>} read */
async function deleteProjects(root, catalog, ids, read) {
  const entries = /** @type {Entry[]} */ (await catalog.request('library', { operation: 'all' }));
  const selected = new Set(ids ?? entries.filter(entry => entry.deleted).map(entry => entry.entry_id));
  if ([...selected].some(id => !entries.some(entry => entry.entry_id === id))) throw new Error('canvas-library-not-found');
  const chosen = entries.filter(entry => selected.has(entry.entry_id));
  const plans = [];
  for (const entry of chosen) plans.push(...await projectTargets(root, entry, read));
  for (const plan of plans) await inspectTree(plan.target);
  await checkReferences(root, entries, selected, plans.map(plan => plan.target), read);
  if (!chosen.length) return catalog.request('library', { operation: 'list' });
  // 删除意图先落库，避免断电后残目录被扫描复活；磁盘失败不报成功，可用同一 id 或清理按钮重试。
  await catalog.request('library', { operation: 'remove', ids: [...selected] });
  try {
    for (const { entry } of plans) {
      const target = await targetDirectory(root, entry);
      if (target) await removeOwnedDirectory(target, entry);
    }
  } catch { throw new Error('canvas-delete-files-failed'); }
  return catalog.request('library', { operation: 'list' });
}

module.exports = { deleteProjects };

/** 手动删除只处理逐项确认的资源；如核对行李牌，路径、身份和依赖全部对上才移入系统回收站。 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { shell } = require('electron');
const files = require('./resource-files');
const ledger = require('./resource-ledger');
const recycle = require('./resource-recycle');
const { nodeReferences } = require('./project-archive');
/** @typedef {import('@illusion-realm/shared').UserDataInfiniteCanvas} Canvas */
/** @typedef {import('@illusion-realm/shared').CanvasResourceItem} Item */
/** @typedef {import('../../storage/sqlite/client').SqliteClient} Client */

/** 当前草稿也算依赖：没有连线的参考附件同样保护，符号链接指向的正文也保护。 @param {Set<string>} refs @param {Canvas} document */
async function includeDraft(refs, document) {
  for (const node of document.nodes) for (const reference of nodeReferences(node)) {
    refs.add(recycle.key(reference.path));
    try { refs.add(recycle.key(await fs.realpath(reference.path))); }
    catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
}

/** 逐级拒绝目录链接，不让未知归属文件的子目录变成通向工程外的跳板。 @param {string} root @param {string} directory @param {Item} item */
async function verifyItem(root, directory, item) {
  const relative = path.relative(directory, item.media.path);
  if (item.state !== 'trashed' && (!relative || relative.startsWith('..') || path.isAbsolute(relative))) throw Error('canvas-resource-invalid-path');
  let current = path.dirname(item.media.path);
  const boundary = item.state === 'trashed' ? root : directory;
  while (true) {
    await files.plainDirectory(current);
    if (recycle.key(current) === recycle.key(boundary)) break;
    const parent = path.dirname(current);
    if (parent === current) throw Error('canvas-resource-invalid-path');
    current = parent;
  }
  if (!await files.matches(item.media.path, item.identity)) throw Error('canvas-resource-identity-changed');
}

/** 先整批预检；引用或身份失败时整批不动。系统回收站逐项失败则明确返回部分结果。
 * @param {string} root @param {Client} client @param {Canvas} document @param {Item[]} items @param {(target:string)=>Promise<Canvas>} read @param {()=>Promise<unknown>} commit */
async function remove(root, client, document, items, read, commit) {
  if (!document.workspace) throw Error('canvas-workspace-unavailable');
  const directory = await files.ownedDirectory(root, document.workspace);
  const refs = await recycle.references(root, client, read);
  await includeDraft(refs, document);
  const rows = new Map((await ledger.select(client, 'resource.all')).map(row => [row.resource_id, row]));
  for (const item of items) {
    await verifyItem(root, directory, item);
    const row = item.id ? rows.get(item.id) : undefined;
    if (row && refs.has(recycle.key(path.join(root, row.workspace_folder, row.relative_path)))) throw Error('canvas-resource-in-use');
    if (refs.has(recycle.key(item.media.path)) || refs.has(recycle.key(await fs.realpath(item.media.path)))) throw Error('canvas-resource-in-use');
  }
  // 先把已移除的节点存好再删文件；保存失败直接退出，避免重开旧图却找不到素材。
  await commit();
  const removed = [], failed = [];
  for (const item of items) {
    try {
      // 预检后仍再核对身份；不使用递归删除，也不删除源文件或同目录的其他资源。
      if (!await files.matches(item.media.path, item.identity)) throw Error('canvas-resource-identity-changed');
      await shell.trashItem(item.media.path);
      if (item.id) await ledger.write(client, 'resource.state', ['deleted', null, null, item.id]);
      removed.push(item.media.path);
    } catch { failed.push(item.media.path); }
  }
  return { removed, failed };
}

module.exports = { remove };

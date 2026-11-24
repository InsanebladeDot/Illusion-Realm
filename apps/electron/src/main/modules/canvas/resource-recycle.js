/** 保存关闭后的资源回收状态机；数据库先记搬运意图，文件成功后才记完成，重启可接着做。 */
const path = require('node:path');
const fs = require('node:fs/promises');
const ledger = require('./resource-ledger');
const files = require('./resource-files');
const { nodeReferences } = require('./project-archive');
/** @typedef {import('./resource-files').Resource} Resource */
/** @typedef {import('../../storage/sqlite/client').SqliteClient} Client */
/** @typedef {import('@illusion-realm/shared').UserDataInfiniteCanvas} Canvas */
/** @typedef {{entry_id:string,directory:string,deleted:number}} Entry */

/** 路径统一大小写仅用于 Windows 比对，磁盘操作仍用原路径。 @param {string} file */
function key(file) {
  const resolved = path.resolve(file);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** 先收齐所有工程依赖；坏库或缺失工程中止整轮，不把“查不到”当作“没有引用”。 @param {string} root @param {Client} client @param {(target:string)=>Promise<Canvas>} read */
async function references(root, client, read) {
  const result = new Set();
  const entries = /** @type {Entry[]} */ (await client.request('library', { operation: 'all' }));
  for (const entry of entries) {
    if (entry.deleted) continue;
    const directory = await files.ownedDirectory(root, { id: entry.entry_id, folder: entry.directory });
    const canvas = await read(directory);
    for (const node of canvas.nodes) for (const ref of nodeReferences(node)) {
      result.add(key(ref.path));
      // 链接入口与真实地址都保护，旧工程用链接引用媒体也不能被错误回收。
      try { result.add(key(await fs.realpath(ref.path))); }
      catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
    }
  }
  return result;
}

/** 从回收区回到原地址；同名冲突明确失败，不覆盖用户在原位置新放的文件。 @param {string} root @param {Client} client @param {Resource} row */
async function restore(root, client, row) {
  if (row.state === 'active') return;
  const target = await files.originalPath(root, row);
  const source = await files.trashPath(root, row);
  await ledger.state(client, row, 'restoring', row.entered_at);
  await files.transfer(source, target, row.identity);
  await ledger.state(client, row, 'active');
  await fs.rmdir(path.dirname(source)).catch(() => {});
}

/** 仅恢复文档实际引用的回收资源，普通素材列表不获得保活资格。 @param {string} root @param {Client} client @param {Canvas} canvas */
async function restoreReferences(root, client, canvas) {
  const refs = new Set(canvas.nodes.flatMap(node => nodeReferences(node).map(ref => key(ref.path))));
  for (const row of await ledger.select(client, 'resource.all')) {
    if (row.state !== 'active' && row.state !== 'blocked' && refs.has(key(path.join(root, row.workspace_folder, row.relative_path)))) await restore(root, client, row);
  }
}

/** @param {string} root @param {Client} client @param {Resource} row @param {number} now */
async function recycle(root, client, row, now) {
  const source = await files.originalPath(root, row);
  const target = await files.trashPath(root, row);
  if (row.state === 'active') await ledger.state(client, row, 'moving', now);
  await files.transfer(source, target, row.identity);
  await ledger.state(client, row, 'trashed', row.entered_at ?? now);
}

/** 先写 purging 再 unlink；中断后只有正文确实不在才补记删除，不能误删替代文件。 @param {string} root @param {Client} client @param {Resource} row */
async function purge(root, client, row) {
  const file = await files.trashPath(root, row);
  await ledger.state(client, row, 'purging', row.entered_at);
  await files.removeFile(file, row.identity);
  await ledger.state(client, row, 'deleted', row.entered_at);
  await fs.rmdir(path.dirname(file)).catch(() => {});
}

/** 外部正常改名沿用原身份；被替换或找不到的资源停留在 blocked，避免扩大删权。 @param {string} root @param {Client} client @param {Resource} row */
async function refreshPath(root, client, row) {
  const relative = await files.locateRenamed(root, row);
  if (!relative) { await ledger.state(client, row, 'blocked'); return false; }
  if (relative !== row.relative_path) {
    await ledger.write(client, 'resource.path', [relative, row.resource_id]);
    row.relative_path = relative;
  }
  return true;
}

/** @param {string} root @param {Client} client @param {Resource} row @param {Set<string>} refs @param {Set<string>} released @param {number} now */
async function processResource(root, client, row, refs, released, now) {
  if (row.state === 'blocked') return;
  if (row.state === 'active' && !await refreshPath(root, client, row)) return;
  const referenced = refs.has(key(path.join(root, row.workspace_folder, row.relative_path)));
  // 恢复未完成时无条件续接，不能把用户已点恢复的素材再送去过期清理。
  if (row.state === 'restoring' || referenced || row.retained) {
    if (row.state !== 'active') await restore(root, client, row);
    return;
  }
  if (row.state === 'active' && released.has(row.workspace_id) || row.state === 'moving') await recycle(root, client, row, now);
  if ((row.state === 'trashed' || row.state === 'purging') && row.expires_at !== null && now >= row.expires_at) await purge(root, client, row);
}

/**
 * 所有打开/挂起会话结束后才搬运：撤销、剪贴板、在途任务属于尚未落盘的潜在依赖。
 * 这是保守的全局门闩，会延迟其他工程回收，但不读取渲染端猜测的“无引用”列表。
 * now 仅供主进程测试注入；IPC 不允许传时间或绕过会话保护。
 * @param {string} root @param {Client} client @param {(target:string)=>Promise<Canvas>} read @param {number} [now]
 */
async function collect(root, client, read, now = Date.now()) {
  const rows = await ledger.select(client, 'resource.all');
  if (!rows.length) return { recycled: 0, failed: 0 };
  const refs = await references(root, client, read);
  const released = new Set((await ledger.select(client, 'resource.releaseList')).map(row => row.workspace_id));
  let failed = 0;
  let recycled = 0;
  for (const row of rows) {
    try {
      const prior = row.state;
      await processResource(root, client, row, refs, released, now);
      if (prior !== row.state) recycled++;
    } catch { failed++; }
  }
  return { recycled, failed };
}

module.exports = { key, collect, restore, restoreReferences, references };

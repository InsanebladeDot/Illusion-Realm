/** 当前工程素材清单：展示不等于依赖；未登记文件只列出，不移动、不补登记。 */
const fs = require('node:fs/promises');
const path = require('node:path');
const ledger = require('./resource-ledger');
const files = require('./resource-files');
const recycle = require('./resource-recycle');
const { EXTENSIONS } = require('./project-validation');
/** @typedef {import('@illusion-realm/shared').CanvasResourceItem} Item */
/** @typedef {import('@illusion-realm/shared').UserDataInfiniteCanvas} Canvas */
/** @typedef {import('../../storage/sqlite/client').SqliteClient} Client */
/** @typedef {import('./resource-files').Resource} Resource */

/** 不跟随链接；只枚举当前工程，数量和深度有限，避免打开弹窗就递归整块盘。 @param {string} directory @param {string[]} result @param {number} [depth] */
async function listFiles(directory, result, depth = 0) {
  if (depth > 8 || result.length > 2000) return;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (result.length > 2000) return;
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await listFiles(file, result, depth + 1);
    else if (entry.isFile() && Object.values(EXTENSIONS).some(values => values.includes(path.extname(entry.name).slice(1).toLowerCase()))) result.push(file);
  }
}

/** @param {string} file */
function kind(file) {
  const extension = path.extname(file).slice(1).toLowerCase();
  return /** @type {'image'|'video'|'audio'} */ (Object.keys(EXTENSIONS).find(value => EXTENSIONS[/** @type {keyof EXTENSIONS} */ (value)].includes(extension)));
}

/** @param {string} root @param {Resource} row @returns {Promise<Item>} */
async function item(root, row) {
  const original = path.join(root, row.workspace_folder, row.relative_path);
  const state = row.state === 'active' ? 'active' : row.state === 'blocked' ? 'blocked' : 'trashed';
  const target = state === 'trashed' ? await files.trashPath(root, row) : original;
  const stat = await files.inspect(target);
  return { id: row.resource_id, identity: stat ? files.identity(stat) : row.identity, ownership: 'managed', state, retained: Boolean(row.retained), expiresAt: row.expires_at,
    media: { kind: row.media_kind, path: target, name: path.basename(original), size: stat?.size ?? 0 } };
}

/** @param {string} root @param {Client} client @param {Canvas} canvas */
async function listResources(root, client, canvas) {
  if (!canvas.workspace) return { resourceItems: [], truncated: false };
  const directory = await files.ownedDirectory(root, canvas.workspace);
  const rows = await ledger.select(client, 'resource.workspace', [canvas.workspace.id]);
  const known = new Set();
  /** @type {Item[]} */
  const resourceItems = [];
  for (const row of rows) {
    // 外部替换的正文仍属于用户；旧台账不能把同路径新文件标成可回收素材。
    const original = path.join(directory, row.relative_path);
    if ((row.state === 'active' || row.state === 'blocked') && !await files.matches(original, row.identity)) continue;
    known.add(recycle.key(original));
    resourceItems.push(await item(root, row));
  }
  /** @type {string[]} */
  const disk = [];
  await listFiles(directory, disk);
  for (const file of disk.slice(0, 2000)) {
    if (known.has(recycle.key(file))) continue;
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    resourceItems.push({ id: null, identity: files.identity(stat), ownership: 'unknown', state: 'active', retained: true, expiresAt: null,
      media: { kind: kind(file), path: file, name: path.basename(file), size: stat.size } });
  }
  return { resourceItems: resourceItems.slice(0, 2000), truncated: disk.length > 2000 || resourceItems.length > 2000 };
}

/** 恢复或保留只能操作当前工程台账中的资源，不能用另一个工程编号越权。 @param {string} root @param {Client} client @param {Canvas} canvas @param {string} resourceId @param {boolean|undefined} retained */
async function updateResource(root, client, canvas, resourceId, retained) {
  if (!canvas.workspace) throw Error('canvas-workspace-unavailable');
  await files.ownedDirectory(root, canvas.workspace);
  const row = (await ledger.select(client, 'resource.all')).find(row => row.resource_id === resourceId && row.workspace_id === canvas.workspace?.id);
  if (!row) throw Error('canvas-resource-not-found');
  if (retained === undefined || retained) await recycle.restore(root, client, row);
  // 主动恢复即保留闲置素材，否则下一轮定时检查会再次回收。
  await ledger.write(client, 'resource.retain', [retained === false ? 0 : 1, row.resource_id]);
  return null;
}

module.exports = { listResources, updateResource };

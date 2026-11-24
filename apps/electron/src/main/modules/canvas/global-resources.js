/** 全局素材沿用工程复制器和原子资源台账；独立抽屉不属于任何单张画布。 */
const fs = require('node:fs/promises');
const path = require('node:path');
const files = require('./resource-files');
const ledger = require('./resource-ledger');
const { allocateWorkspace, importAssets } = require('./project-assets');
const catalog = require('./resource-catalog');
const validation = require('./project-validation');
/** @typedef {import('../../storage/sqlite/client').SqliteClient} Client */
/** @typedef {NonNullable<import('@illusion-realm/shared').UserDataInfiniteCanvas['workspace']>} Workspace */

/** 小标记只记录抽屉身份；资源明细仍在现有SQLite台账，不扫描同名目录猜归属。 @param {string} root @returns {Promise<Workspace>} */
async function workspace(root) {
  const marker = path.join(root, '.global-resources.json');
  const stat = await files.inspect(marker);
  if (!stat) {
    const value = await allocateWorkspace(root, { name: 'Resource Library', files: [] });
    await fs.writeFile(marker, JSON.stringify({ version: 1, workspace: value }), { flag: 'wx' });
    return value;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw Error('canvas-resource-library-invalid');
  const value = JSON.parse(await fs.readFile(marker, 'utf8'));
  if (!value || typeof value !== 'object' || value.version !== 1 || !validation.workspace(value.workspace)) throw Error('canvas-resource-library-invalid');
  await files.ownedDirectory(root, value.workspace);
  return value.workspace;
}

/** 全局库常驻保留，不因某张画布没有引用而进入24小时回收。 @param {string} root @param {Client} client */
async function list(root, client) {
  const owner = await workspace(root);
  const document = { version: /** @type {const} */ (1), name: 'Resource Library', workspace: owner, nodes: [], edges: [] };
  return catalog.listResources(root, client, document);
}

/** 批量只复制，不剪切外部原件，也不在画布上生成节点或连线。 @param {string} root @param {Client} client @param {import('@illusion-realm/shared').CanvasImportMediaRequest['files']} media */
async function importMedia(root, client, media) {
  const owner = await workspace(root);
  const result = await importAssets(root, { name: 'Resource Library', workspace: owner, mode: 'copy', files: media });
  const rows = (await ledger.select(client, 'resource.workspace', [owner.id])).filter(row => !row.retained);
  if (rows.length) await client.request('batch', rows.map(row => ({ name: 'resource.retain', params: [1, row.resource_id] })));
  return { imported: result.media.length, rejected: result.rejected };
}

module.exports = { workspace, list, importMedia };

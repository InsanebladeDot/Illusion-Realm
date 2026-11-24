/** 资源台账记录明确的软件副本；旧文件未登记就永远没有自动回收资格。 */
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SqliteClient } = require('../../storage/sqlite/client');
const files = require('./resource-files');
/** @typedef {import('./resource-files').Resource} Resource */
/** @typedef {NonNullable<import('@illusion-realm/shared').UserDataInfiniteCanvas['nodes'][number]['data']['media']>} Media */
/** @typedef {import('@illusion-realm/shared').UserDataInfiniteCanvas} Canvas */

/** @template T @param {string} root @param {(client:SqliteClient)=>Promise<T>} action */
async function database(root, action) {
  await files.plainDirectory(root);
  const file = path.join(root, 'library.sqlite');
  if ((await files.inspect(file))?.isSymbolicLink()) throw Error('canvas-resource-unsafe-directory');
  const client = new SqliteClient(file);
  try { return await action(client); }
  finally { await client.close(); }
}

/** @param {SqliteClient} client @param {string} name @param {(string|number|null)[]} [params] */
async function select(client, name, params = []) {
  return /** @type {Resource[]} */ (await client.request('select', { name, params }));
}

/** @param {SqliteClient} client @param {string} name @param {(string|number|null)[]} params */
async function write(client, name, params) {
  await client.request('batch', [{ name, params }]);
}

/**
 * 调用处必须已完成真实复制/生成/解包；普通复用路径不能调用本方法给未知文件补删权。
 * 只有分类目录中的普通文件可登记；正文失败或台账失败都不主动删除用户成果。
 * @param {string} root @param {NonNullable<Canvas['workspace']>} workspace @param {Media[]} media @param {'imported'|'generated'|'archive'} origin
 */
async function registerResources(root, workspace, media, origin) {
  if (!media.length) return;
  const directory = await files.ownedDirectory(root, workspace);
  await database(root, async client => {
    for (const item of media) {
      const relative = path.relative(directory, item.path);
      if (!files.validRelative(relative)) throw Error('canvas-resource-invalid-path');
      await files.mediaPath(directory, relative);
      const stat = await files.inspect(item.path);
      if (!stat?.isFile() || stat.isSymbolicLink()) throw Error('canvas-resource-invalid-file');
      await write(client, 'resource.add', [randomUUID(), workspace.id, workspace.folder, relative, item.kind, origin, files.identity(stat)]);
    }
  });
}

/** @param {SqliteClient} client @param {Resource} row @param {string} state @param {number|null} [entered] */
async function state(client, row, state, entered = null) {
  const expires = entered === null ? null : entered + 24 * 60 * 60 * 1000;
  await write(client, 'resource.state', [state, entered, expires, row.resource_id]);
  Object.assign(row, { state, entered_at: entered, expires_at: expires });
}

module.exports = { database, select, write, state, registerResources };

/** 同名新建/删除回归：真实 SQLite 与目录；仅登记失败和丢失回执采用注入，不访问用户工程。 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createCanvasLibrary, saveDocument } = require('../../apps/electron/src/main/modules/canvas/canvas-library');
const { allocateWorkspace } = require('../../apps/electron/src/main/modules/canvas/project-assets');
const { SqliteClient } = require('../../apps/electron/src/main/storage/sqlite/client');

async function catalog(library, input) {
  const client = new SqliteClient(path.join(library.root, 'library.sqlite'));
  try { return await client.request('library', input); }
  finally { await client.close(); }
}

async function reusedName(root, smoke) {
  const library = createCanvasLibrary(path.join(root, 'reused-name'));
  let last;
  for (let index = 0; index < 4; index++) {
    const entry = await library.request({ operation: 'create', name: '测试', folderId: null });
    assert.equal((await library.request({ operation: 'load', id: entry.id })).name, '测试');
    assert.notEqual(entry.id, last);
    assert.equal((await fs.readdir(library.root, { withFileTypes: true })).filter(item => item.isDirectory()).length, 1);
    await library.request({ operation: 'remove', ids: [entry.id] });
    await assert.rejects(fs.access(path.join(library.root, '测试')));
    last = entry.id;
  }
  assert.equal((await library.request({ operation: 'list' })).entries.length, 0);
  smoke.check('同名新建删除连续四轮，无唯一目录冲突、无半成品残留', true);
}

async function recoveredRegistration(root, smoke) {
  const library = createCanvasLibrary(path.join(root, 'recovered-registration'));
  const old = await library.request({ operation: 'create', name: '测试', folderId: null });
  await library.request({ operation: 'remove', ids: [old.id] });
  // 重建旧版“已写作品但目录登记失败”的磁盘现场，内容必须找回而非当垃圾清掉。
  const workspace = await allocateWorkspace(library.root, { name: '测试', files: [] });
  const original = { version: 1, name: '测试', workspace, edges: [], nodes: [{ id: 'keep', position: { x: 1, y: 2 },
    data: { kind: 'text', title: 'keep', prompt: '', content: '不要丢失', ratio: '1/1' } }] };
  await saveDocument(path.join(library.root, workspace.folder), original);
  await fs.mkdir(path.join(library.root, 'bad-residue'));
  await fs.writeFile(path.join(library.root, 'bad-residue', 'project.sqlite'), 'not a database');
  const other = await library.request({ operation: 'create', name: '测试', folderId: null });
  const listed = await library.request({ operation: 'list' });
  assert.equal(listed.entries.length, 2);
  assert.deepEqual(await library.request({ operation: 'load', id: workspace.id }), original);
  await library.request({ operation: 'purgeDeleted' });
  await fs.access(path.join(library.root, workspace.folder, 'project.sqlite'));
  await library.request({ operation: 'remove', ids: [other.id] });
  await fs.access(path.join(library.root, 'bad-residue', 'project.sqlite'));
  smoke.check('旧版登记失败工程找回且不被旧墓碑误删，坏残目录不阻塞列表或删除', true);
}

async function failedRegistration(root, smoke, afterCommit) {
  const library = createCanvasLibrary(path.join(root, afterCommit ? 'lost-create-reply' : 'failed-create'));
  const original = SqliteClient.prototype.request;
  let injected = false;
  SqliteClient.prototype.request = async function(kind, input) {
    if (!injected && kind === 'library' && input?.operation === 'put') {
      injected = true;
      if (afterCommit) await original.call(this, kind, input);
      throw new Error('SQLITE_CONSTRAINT');
    }
    return original.call(this, kind, input);
  };
  try {
    const result = library.request({ operation: 'create', name: '测试', folderId: null });
    if (afterCommit) assert.equal((await result).name, '测试');
    else await assert.rejects(result, /SQLITE_CONSTRAINT/);
  } finally { SqliteClient.prototype.request = original; }
  assert.equal(injected, true);
  assert.equal((await fs.readdir(library.root, { withFileTypes: true })).filter(item => item.isDirectory()).length, afterCommit ? 1 : 0);
  if (!afterCommit) await library.request({ operation: 'create', name: '测试', folderId: null });
  assert.equal((await library.request({ operation: 'list' })).entries.length, 1);
  smoke.check(afterCommit ? '登记提交后回执失败按稳定身份核实成功，不重复创建或删已提交作品' : '登记失败回滚本次目录，重试只生成一份工程', true);
}

async function checkCanvasLibraryRetry(root, smoke) {
  await reusedName(root, smoke);
  await recoveredRegistration(root, smoke);
  await failedRegistration(root, smoke, false);
  await failedRegistration(root, smoke, true);
}

module.exports = { checkCanvasLibraryRetry };

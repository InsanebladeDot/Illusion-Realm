/** 隔离磁盘删除回归：真实目录/SQLite，只有占用失败由故障注入模拟，不删除用户工程。 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createCanvasLibrary } = require('../../apps/electron/src/main/modules/canvas/canvas-library');
const { SqliteClient } = require('../../apps/electron/src/main/storage/sqlite/client');

async function catalog(library, input) {
  const client = new SqliteClient(path.join(library.root, 'library.sqlite'));
  try { return await client.request('library', input); }
  finally { await client.close(); }
}

async function fixture(root, label) {
  const library = createCanvasLibrary(path.join(root, label));
  const a = await library.request({ operation: 'create', name: 'A', folderId: null });
  const b = await library.request({ operation: 'create', name: 'B', folderId: null });
  const file = path.join(library.root, 'A', 'Picture', 'shared.png');
  await fs.mkdir(path.dirname(file));
  await fs.writeFile(file, 'actual owned media bytes');
  const outside = path.join(root, `${label}-outside.png`);
  await fs.writeFile(outside, 'original stays');
  return { library, a, b, file, outside };
}

function image(id, file) {
  return { id, position: { x: 10, y: 20 }, data: { kind: 'image', title: id, prompt: '', content: '', ratio: '1/1',
    media: { kind: 'image', path: file, name: 'sample.png', size: 10 } } };
}

async function sharedProtection(root, smoke) {
  const { library, a, b, file, outside } = await fixture(root, 'shared-delete');
  const document = await library.request({ operation: 'load', id: b.id });
  document.nodes = [image('foreign-reference', file)];
  await library.request({ operation: 'save', id: b.id, document });
  await assert.rejects(library.request({ operation: 'remove', ids: [a.id] }), /canvas-delete-shared-assets/);
  assert.equal((await library.request({ operation: 'list' })).entries.length, 2);
  assert.equal(await fs.readFile(file, 'utf8'), 'actual owned media bytes');
  document.nodes = [image('external-original', outside)];
  await library.request({ operation: 'save', id: b.id, document });
  await library.request({ operation: 'remove', ids: [a.id] });
  await assert.rejects(fs.access(path.join(library.root, 'A')));
  assert.equal(await fs.readFile(outside, 'utf8'), 'original stays');
  assert.equal((await library.request({ operation: 'load', id: b.id })).nodes[0].data.media.path, outside);
  await library.request({ operation: 'remove', ids: [a.id] });
  assert.equal((await library.request({ operation: 'list' })).entries.length, 1);
  smoke.check('跨工程引用先阻止；解除引用后实际删除工程库与素材，外部原文件保留，重复删除不复活', true);
}

async function batchAndLegacy(root, smoke) {
  const { library, a, b, file } = await fixture(root, 'batch-delete');
  const document = await library.request({ operation: 'load', id: b.id });
  document.nodes = [image('within-batch', file)];
  await library.request({ operation: 'save', id: b.id, document });
  await library.request({ operation: 'remove', ids: [a.id, b.id] });
  await assert.rejects(fs.access(path.join(library.root, 'A')));
  await assert.rejects(fs.access(path.join(library.root, 'B')));
  const old = await library.request({ operation: 'create', name: 'old', folderId: null });
  await catalog(library, { operation: 'remove', ids: [old.id] });
  await fs.access(path.join(library.root, 'old', 'project.sqlite'));
  await library.request({ operation: 'purgeDeleted' });
  await assert.rejects(fs.access(path.join(library.root, 'old')));
  await library.request({ operation: 'purgeDeleted' });
  const reopened = createCanvasLibrary(path.dirname(library.root));
  assert.equal((await reopened.request({ operation: 'list' })).entries.length, 0);
  smoke.check('批量内共享可一起删，旧软删目录清理可重复，重启扫描不复活', true);
}

async function failedDelete(root, smoke) {
  const { library, a, file } = await fixture(root, 'failed-delete');
  const remove = fs.rm;
  // 模拟 Windows 文件被占用；只拦本用例的目标，finally 恢复，不把注入当成系统实测。
  fs.rm = async (target, options) => {
    if (target === path.join(library.root, 'A', 'Picture')) throw Object.assign(new Error('busy fixture'), { code: 'EBUSY' });
    return remove(target, options);
  };
  try { await assert.rejects(library.request({ operation: 'remove', ids: [a.id] }), /canvas-delete-files-failed/); }
  finally { fs.rm = remove; }
  assert.equal(await fs.readFile(file, 'utf8'), 'actual owned media bytes');
  await fs.access(path.join(library.root, 'A', '.canvas-owner'));
  await fs.access(path.join(library.root, 'A', 'project.sqlite'));
  const pending = (await catalog(library, { operation: 'all' })).find(entry => entry.entry_id === a.id);
  assert.equal(pending.deleted, 1);
  await library.request({ operation: 'purgeDeleted' });
  await assert.rejects(fs.access(path.join(library.root, 'A')));
  await fs.access(path.join(library.root, 'B', 'project.sqlite'));
  smoke.check('磁盘失败明确拒绝且保存删除意图，后续清理真实完成，未选工程保留', true);
}

async function unsafeDelete(root, smoke) {
  const { library, a, b, file, outside } = await fixture(root, 'unsafe-delete');
  await fs.writeFile(path.join(library.root, 'B', '.canvas-owner'), 'wrong owner');
  await assert.rejects(library.request({ operation: 'remove', ids: [a.id, b.id] }));
  assert.equal((await catalog(library, { operation: 'list' })).entries.length, 2);
  await fs.access(file);
  await fs.writeFile(path.join(library.root, 'B', '.canvas-owner'), b.id);
  const link = path.join(library.root, 'A', 'outside-link');
  await fs.symlink(path.dirname(outside), link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(library.request({ operation: 'remove', ids: [a.id] }), /canvas-library-symlink/);
  await fs.unlink(link);
  await catalog(library, { operation: 'put', id: a.id, directory: '../escape', name: 'forged', folderId: null, updatedAt: Date.now(), nodeCount: 0 });
  // put 不更新旧 directory；用独立条目反证路径校验，避免测试只改了无效字段。
  const id = 'bc1512fa-d840-4779-89cb-e94330c9d47b';
  await catalog(library, { operation: 'put', id, directory: '../escape', name: 'forged', folderId: null, updatedAt: Date.now(), nodeCount: 0 });
  await assert.rejects(library.request({ operation: 'remove', ids: [id] }), /canvas-library-invalid-entry/);
  assert.equal(await fs.readFile(outside, 'utf8'), 'original stays');
  smoke.check('批量先验全部归属、链接和伪造越界目录拒绝，外部文件不删除', true);
}

async function checkCanvasDelete(root, smoke) {
  await sharedProtection(root, smoke);
  await batchAndLegacy(root, smoke);
  await failedDelete(root, smoke);
  await unsafeDelete(root, smoke);
  await separateWorkspace(root, smoke);
}

async function separateWorkspace(root, smoke) {
  const { library, a, b, file } = await fixture(root, 'separate-assets');
  const document = await library.request({ operation: 'load', id: b.id });
  const workspace = await require('../../apps/electron/src/main/modules/canvas/project-assets').allocateWorkspace(library.root, { name: 'imported-assets', files: [] });
  const asset = path.join(library.root, workspace.folder, 'media.png');
  await fs.writeFile(asset, 'imported media');
  document.workspace = workspace;
  document.nodes = [image('imported', asset)];
  await library.request({ operation: 'save', id: b.id, document });
  await library.request({ operation: 'remove', ids: [b.id] });
  await assert.rejects(fs.access(path.dirname(asset)));
  await assert.rejects(fs.access(path.join(library.root, 'B')));
  await fs.access(file);
  assert.equal((await library.request({ operation: 'load', id: a.id })).name, 'A');
  smoke.check('工程包另分配的独占素材目录也释放，其他工程与素材保留', true);
}

module.exports = { checkCanvasDelete };

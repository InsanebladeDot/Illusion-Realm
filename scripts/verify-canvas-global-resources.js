/** 独立反证：真实SQLite和临时文件，先证明有引用不能删，再测试明确删除；不碰用户数据。 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { app, shell } = require('electron');
const { createCanvasLibrary } = require('../apps/electron/src/main/modules/canvas/canvas-library');
const validation = require('../apps/electron/src/main/modules/canvas/library-validation');
const ledger = require('../apps/electron/src/main/modules/canvas/resource-ledger');
const files = require('../apps/electron/src/main/modules/canvas/resource-files');
const { importAssets } = require('../apps/electron/src/main/modules/canvas/project-assets');
const { SqliteClient } = require('../apps/electron/src/main/storage/sqlite/client');
const smoke = require('./lib/smoke-harness').createSmokeHarness({ name: 'canvas-global-resources', timeoutMs: 120000 });
smoke.installWatchdog(app);
let root;

const node = (media) => ({ id: 'reference', position: { x: 0, y: 0 }, data: { kind: 'image', title: 'Reference', prompt: '', content: '', ratio: '1/1', workflow: 'minimax-image-edit', inputImages: [media] } });
const selected = item => ({ path: item.media.path, identity: item.identity });
const exists = async file => Boolean(await files.inspect(file));

async function fixture(name) {
  const library = createCanvasLibrary(path.join(root, name));
  const entry = await library.request({ operation: 'create', name: 'Project', folderId: null });
  const document = await library.request({ operation: 'load', id: entry.id });
  const inputs = [];
  for (const [kind, extension] of [['image', 'png'], ['video', 'mp4'], ['audio', 'wav']]) {
    const file = path.join(root, `${name}.${extension}`);
    await fs.writeFile(file, `${kind} original`);
    inputs.push({ kind, path: file, name: path.basename(file), size: 0 });
  }
  assert.deepEqual(await library.request({ operation: 'importLibraryResources', files: inputs }), { imported: 3, rejected: [] });
  const snapshot = await library.request({ operation: 'libraryResources' });
  return { library, entry, document, inputs, items: snapshot.resourceItems };
}

/** 批量导入仅复制并保留，不建图；重启和超时清理也不能把全局素材当作工程孤儿。 */
async function globalPersistence() {
  const { library, entry, document, inputs, items } = await fixture('persistence');
  assert.equal(items.length, 3);
  assert.deepEqual(new Set(items.map(item => path.basename(path.dirname(item.media.path)))), new Set(['Picture', 'video', 'Audio']));
  for (const input of inputs) assert.ok(await exists(input.path));
  assert.equal((await library.request({ operation: 'load', id: entry.id })).nodes.length, 0);
  await library.request({ operation: 'save', id: entry.id, document });
  await library.request({ operation: 'close', id: entry.id });
  await library.sweep(Date.now() + 200000000);
  const restarted = createCanvasLibrary(path.dirname(library.root));
  const second = await restarted.request({ operation: 'create', name: 'Other', folderId: null });
  const other = await restarted.request({ operation: 'load', id: second.id });
  assert.deepEqual((await restarted.request({ operation: 'libraryResources' })).resourceItems.map(item => item.media.path).sort(), items.map(item => item.media.path).sort());
  assert.equal(other.nodes.length, 0);
  assert.equal(other.edges.length, 0);
  assert.equal((await restarted.request({ operation: 'list' })).entries.length, 2);
  smoke.check('三类批量复制、原件保留、跨画布和重启可见、24小时不回收、全局库不冒充工程', true);
}

/** 当前未保存的附件也算引用；不依赖连线，不要求用户先保存才能阻止误删。 */
async function draftAndSavedReferences() {
  const ctx = await fixture('references');
  const { library, entry, document, items } = ctx;
  const image = items.find(item => item.media.kind === 'image');
  const request = { operation: 'deleteResources', id: entry.id, scope: 'library', document, resources: [selected(image)] };
  document.nodes = [node(image.media)];
  await assert.rejects(library.request(request), /canvas-resource-in-use/);
  assert.ok(await exists(image.media.path));
  document.nodes = [];
  const second = await library.request({ operation: 'create', name: 'Other', folderId: null });
  const other = await library.request({ operation: 'load', id: second.id }, 2);
  other.nodes = [node(image.media)];
  await assert.rejects(library.request(request), /canvas-delete-open-sessions/);
  await library.request({ operation: 'save', id: second.id, document: other }, 2);
  await library.request({ operation: 'close', id: second.id }, 2);
  await assert.rejects(library.request(request), /canvas-resource-in-use/);
  assert.ok(await exists(image.media.path));
  smoke.check('无连线未保存引用、其他挂起工作区、其他已保存画布三种删除保护', true);
}

/** 重现旧稿误拦：先保存有引用的节点，再只在内存清空，不提前点保存。 */
async function clearedSavedReferences(scope) {
  const { library, entry, document, inputs, items } = await fixture(`cleared-${scope}`);
  let image = items.find(item => item.media.kind === 'image');
  if (scope === 'project') {
    await importAssets(library.root, { name: document.name, workspace: document.workspace, files: [inputs[0]] });
    image = (await library.request({ operation: 'resources', id: entry.id })).resourceItems[0];
  }
  document.nodes = [node(image.media)];
  await library.request({ operation: 'save', id: entry.id, document });
  document.nodes = [];
  const result = await library.request({ operation: 'deleteResources', id: entry.id, scope, document, resources: [selected(image)] });
  assert.deepEqual(result, { removed: [image.media.path], failed: [] });
  assert.equal(await exists(image.media.path), false);
  // 删除前必须保存清空后的图，重开不能复活指向已删文件的旧节点。
  const reopened = await library.request({ operation: 'load', id: entry.id });
  assert.deepEqual(reopened.nodes, []);
  assert.deepEqual(reopened.workspace, document.workspace);
  const catalog = await library.request({ operation: 'list' });
  assert.equal(catalog.entries.find(item => item.id === entry.id).nodeCount, 0);
  smoke.check(`${scope}：清空未保存节点可删除旧引用素材，重开为空且工程目录不变`, true);
}

/** 保存失败是明确注入；删除必须停在文件操作前，旧图和文件都保留。 */
async function failedSavePreservesMedia() {
  const { library, entry, document, items } = await fixture('failed-save');
  const image = items[0];
  document.nodes = [node(image.media)];
  await library.request({ operation: 'save', id: entry.id, document });
  document.nodes = [];
  const original = SqliteClient.prototype.request;
  SqliteClient.prototype.request = function (kind, input) {
    if (kind === 'document' && input?.operation === 'save') return Promise.reject(Error('SQLITE_OPERATION_FAILED'));
    return original.call(this, kind, input);
  };
  try {
    await assert.rejects(library.request({ operation: 'deleteResources', id: entry.id, scope: 'library', document, resources: [selected(image)] }), /SQLITE_OPERATION_FAILED/);
    assert.ok(await exists(image.media.path));
    assert.equal((await library.request({ operation: 'load', id: entry.id })).nodes.length, 1);
    smoke.check('保存失败注入：不删除文件，不覆盖已保存节点', true);
  } finally { SqliteClient.prototype.request = original; }
}

/** 路径和身份先整批预检：批量里一项有问题，其余文件也不能先被删除。 */
async function invalidTargets() {
  const { library, entry, document, items } = await fixture('invalid');
  document.nodes = [node(items[0].media)];
  await library.request({ operation: 'save', id: entry.id, document });
  document.nodes = [];
  const request = { operation: 'deleteResources', id: entry.id, scope: 'library', document, resources: items.slice(0, 2).map(selected) };
  await fs.writeFile(items[1].media.path, 'changed replacement');
  await assert.rejects(library.request(request), /canvas-resource-identity-changed/);
  assert.ok(await exists(items[0].media.path));
  assert.equal((await library.request({ operation: 'load', id: entry.id })).nodes.length, 1);
  request.resources = [selected(items[0]), selected(items[0])];
  await assert.rejects(library.request(request), /canvas-resource-invalid-path/);
  request.resources = [{ path: path.join(root, 'outside.png'), identity: items[0].identity }];
  await assert.rejects(library.request(request), /canvas-resource-identity-changed/);
  assert.ok(await exists(items[0].media.path));
  assert.equal(validation.request({ ...request, resources: [] }), false);
  assert.equal(validation.request({ ...request, unexpected: true }), false);
  assert.equal(validation.request({ operation: 'importLibraryResources', files: [] }), false);
  smoke.check('替换身份、批量预检、重复目标、越界路径与非法请求无副作用', true);
}

/** 明确选择可删未知文件，但同目录的未知文件不受牵连，也不被登记为自动清理对象。 */
async function manualUnknown() {
  const { library, entry, document } = await fixture('unknown-manual');
  const directory = path.join(library.root, document.workspace.folder);
  const targets = ['selected.png', 'untouched.png'].map(name => path.join(directory, name));
  for (const file of targets) await fs.writeFile(file, 'unknown owner');
  const snapshot = await library.request({ operation: 'resources', id: entry.id });
  const item = snapshot.resourceItems.find(item => item.media.path === targets[0]);
  assert.equal(item.ownership, 'unknown');
  const result = await library.request({ operation: 'deleteResources', id: entry.id, scope: 'project', document, resources: [selected(item)] });
  assert.deepEqual(result, { removed: [targets[0]], failed: [] });
  assert.equal(await exists(targets[0]), false);
  assert.ok(await exists(targets[1]));
  const rows = await ledger.database(library.root, client => ledger.select(client, 'resource.all'));
  assert.equal(rows.some(row => row.workspace_id === document.workspace.id), false);
  smoke.check('明确选中的未知文件真实进入系统回收站，其余未知文件保留且不获得自动删权', true);
}

/** 系统回收失败是明确注入；只验证部分失败反馈，不把注入分支称为真实系统权限验证。 */
async function partialFailure() {
  const { library, entry, document, items } = await fixture('partial');
  const original = shell.trashItem;
  shell.trashItem = async target => { if (target === items[1].media.path) throw Error('injected-trash-failure'); return original(target); };
  try {
    const result = await library.request({ operation: 'deleteResources', id: entry.id, scope: 'library', document, resources: items.map(selected) });
    assert.equal(result.removed.length, 2);
    assert.deepEqual(result.failed, [items[1].media.path]);
    assert.ok(await exists(items[1].media.path));
    const snapshot = await library.request({ operation: 'libraryResources' });
    assert.equal(snapshot.resourceItems.length, 1);
    smoke.check('回收失败注入：成功项真实回收、失败项保留并逐项返回', true);
  } finally { shell.trashItem = original; }
}

/** 目录链接不能把删除范围带出工程；Windows junction不需要管理员创建符号链接权限。 */
async function directoryLink() {
  const { library, entry, document } = await fixture('junction');
  const outside = path.join(root, 'outside');
  await fs.mkdir(outside);
  const file = path.join(outside, 'keep.png');
  await fs.writeFile(file, 'untouched');
  const link = path.join(library.root, document.workspace.folder, 'linked');
  await fs.symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  const snapshot = await library.request({ operation: 'resources', id: entry.id });
  assert.equal(snapshot.resourceItems.length, 0);
  await assert.rejects(library.request({ operation: 'deleteResources', id: entry.id, scope: 'project', document, resources: [{ path: path.join(link, 'keep.png'), identity: files.identity(await fs.stat(file)) }] }));
  assert.equal(await fs.readFile(file, 'utf8'), 'untouched');
  smoke.check('目录链接不列为候选、伪造链接路径拒绝删除，工程外文件保留', true);
}

async function main() {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ir-global-resources-'));
  smoke.setWorkDir(root);
  await globalPersistence();
  await draftAndSavedReferences();
  await clearedSavedReferences('project');
  await clearedSavedReferences('library');
  await failedSavePreservesMedia();
  await invalidTargets();
  await manualUnknown();
  await partialFailure();
  await directoryLink();
  await smoke.finish({ app, ok: smoke.allPassed() });
}
app.whenReady().then(main).catch(error => { console.error(error); smoke.finish({ app, ok: false }); });

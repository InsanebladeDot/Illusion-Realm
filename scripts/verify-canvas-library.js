/** 真实临时目录与 SQLite 回归；不操作用户作品，不把文件系统测试当成人工界面验收。 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');
const { createCanvasLibrary } = require('../apps/electron/src/main/modules/canvas/canvas-library');
const { allocateWorkspace } = require('../apps/electron/src/main/modules/canvas/project-assets');
const validation = require('../apps/electron/src/main/modules/canvas/library-validation');
const smoke = require('./lib/smoke-harness').createSmokeHarness({ name: 'canvas-library-storage', timeoutMs: 90000 });
smoke.installWatchdog(app);
let root;

async function isolation(library) {
  const a = await library.request({ operation: 'create', name: 'A', folderId: null });
  const b = await library.request({ operation: 'create', name: 'B', folderId: null });
  const document = await library.request({ operation: 'load', id: a.id });
  document.fixedSize = true;
  document.nodes = [{ id: 'a', position: { x: 21, y: 34 }, data: { kind: 'text', title: 'A', prompt: '', content: 'only A', ratio: '1/1', resizeLocked: true } }];
  document.nodes[0].data.media = undefined;
  await library.request({ operation: 'save', id: a.id, document });
  assert.deepEqual(await library.request({ operation: 'load', id: a.id }), JSON.parse(JSON.stringify(document)));
  assert.equal((await library.request({ operation: 'load', id: b.id })).nodes.length, 0);
  smoke.check('A/B 工程独立、尺寸锁与原节点完整往返', true);
  return { a, b, document };
}

async function classification(library, a, b) {
  const snapshot = await library.request({ operation: 'folder', name: '分类' });
  const folderId = snapshot.folders[0].id;
  await library.request({ operation: 'move', ids: [a.id, b.id], folderId });
  await assert.rejects(library.request({ operation: 'removeFolder', id: folderId }));
  assert.ok((await library.request({ operation: 'list' })).entries.every(entry => entry.folderId === folderId));
  // 正式删除应释放独占目录；跨工程引用保护由独立删除回归覆盖。
  await library.request({ operation: 'remove', ids: [a.id] });
  assert.equal((await library.request({ operation: 'list' })).entries.length, 1);
  await assert.rejects(library.request({ operation: 'load', id: a.id }));
  await assert.rejects(fs.access(path.join(library.root, 'A')));
  await library.request({ operation: 'move', ids: [b.id], folderId: null });
  await library.request({ operation: 'removeFolder', id: folderId });
  smoke.check('批量归类、非空分类保护、实际删除目录且不被发现复活', true);
}

async function legacy() {
  const base = path.join(root, 'legacy');
  const workspace = await allocateWorkspace(base, { name: '旧工程', files: [] });
  const source = path.join(base, workspace.folder, 'Picture', 'source.png');
  await fs.mkdir(path.dirname(source));
  await fs.writeFile(source, 'real original bytes');
  const document = { version: 1, name: '旧工程', workspace, edges: [], nodes: [{ id: 'image', position: { x: 0, y: 0 },
    data: { kind: 'image', title: 'source', prompt: '', content: '', ratio: '1/1', media: { kind: 'image', path: source, name: 'source.png', size: 19 } } }] };
  const library = createCanvasLibrary(base, async () => document);
  const first = await library.request({ operation: 'list' });
  const restored = await library.request({ operation: 'load', id: first.entries[0].id });
  assert.ok(restored.nodes[0].data.media.path.startsWith(library.root));
  assert.equal(await fs.readFile(restored.nodes[0].data.media.path, 'utf8'), await fs.readFile(source, 'utf8'));
  assert.equal(document.nodes[0].data.media.path, source);
  assert.equal((await createCanvasLibrary(base, async () => document).request({ operation: 'list' })).entries.length, 1);
  smoke.check('旧目录复制、引用回填、原文件保留、重启迁移幂等', true);
}

async function safety(library, b) {
  const { z } = require('../packages/shared/node_modules/zod');
  // 用 shared 实际依赖的规则反证主进程，不漏掉 uuid 的 NIL/MAX 合法形状。
  for (const id of [b.id, '00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '../escape', 'not-id']) {
    assert.equal(validation.request({ operation: 'load', id }), z.string().uuid().safeParse(id).success);
  }
  for (const request of [null, [], { operation: 'load', id: '../escape' }, { operation: 'create', name: ' ', folderId: null },
    { operation: 'list', root: 'arbitrary' }, { operation: 'move', ids: [], folderId: null }]) assert.equal(validation.request(request), false);
  const item = (await library.request({ operation: 'list' })).entries.find(entry => entry.id === b.id);
  const folders = await fs.readdir(library.root);
  const project = folders.find(name => name === 'B');
  await fs.writeFile(path.join(library.root, project, '.canvas-owner'), 'wrong owner');
  await assert.rejects(library.request({ operation: 'load', id: item.id }));
  smoke.check('路径逃逸、非法载荷和归属篡改拒绝', true);
}

async function interruptedMigration() {
  const base = path.join(root, 'interrupted');
  const workspace = await allocateWorkspace(base, { name: 'retry', files: [] });
  const source = path.join(base, workspace.folder);
  const outside = path.join(root, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'keep.txt'), 'keep');
  const link = path.join(source, 'external-link');
  await fs.symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  const original = { version: 1, name: 'retry', workspace, nodes: [], edges: [] };
  const library = createCanvasLibrary(base, async () => original);
  await assert.rejects(library.request({ operation: 'list' }));
  await assert.rejects(fs.access(path.join(library.root, '.legacy-imported')));
  await fs.unlink(link);
  assert.equal((await library.request({ operation: 'list' })).entries.length, 1);
  assert.equal((await fs.readdir(library.root, { withFileTypes: true })).filter(item => item.isDirectory()).length, 1);
  assert.equal(await fs.readFile(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
  smoke.check('符号链接拒绝、中断后原目录重试、外部文件保留', true);
}

async function missingLegacyDirectory() {
  const base = path.join(root, 'missing-legacy');
  const workspace = await allocateWorkspace(base, { name: 'missing', files: [] });
  // 模拟旧盘符或目录已丢失；原引用必须保留，不能删节点或拿新空目录冒充素材已恢复。
  const original = { version: 1, name: '旧作品', workspace, edges: [], nodes: [{ id: 'missing', position: { x: 0, y: 0 },
    data: { kind: 'image', title: 'missing', prompt: '', content: '', ratio: '1/1',
      media: { kind: 'image', path: path.join(base, workspace.folder, 'Picture', 'missing.png'), name: 'missing.png', size: 10 } } }] };
  const before = structuredClone(original);
  await fs.unlink(path.join(base, workspace.folder, '.canvas-owner'));
  await fs.rmdir(path.join(base, workspace.folder));
  const library = createCanvasLibrary(base, async () => original);
  const listed = await library.request({ operation: 'list' });
  assert.equal(listed.entries.length, 1);
  const restored = await library.request({ operation: 'load', id: listed.entries[0].id });
  assert.deepEqual(restored.nodes, original.nodes);
  assert.notEqual(restored.workspace.id, original.workspace.id);
  const created = await library.request({ operation: 'create', name: '测试', folderId: null });
  assert.equal((await library.request({ operation: 'load', id: created.id })).name, '测试');
  const reopened = createCanvasLibrary(base, async () => original);
  assert.equal((await reopened.request({ operation: 'list' })).entries.length, 2);
  assert.deepEqual(original, before);
  smoke.check('旧素材目录缺失仍保留引用，新建应用和重开可用，原草稿不变', true);
}

async function missingLegacyOwner() {
  const base = path.join(root, 'missing-owner');
  const workspace = await allocateWorkspace(base, { name: 'unowned', files: [] });
  const original = { version: 1, name: 'unowned', workspace, edges: [], nodes: [] };
  // 目录存在却没有归属不能按“素材丢失”放行，否则可能接管同名的其他用户目录。
  await fs.unlink(path.join(base, workspace.folder, '.canvas-owner'));
  const library = createCanvasLibrary(base, async () => original);
  await assert.rejects(library.request({ operation: 'list' }));
  await assert.rejects(fs.access(path.join(library.root, '.legacy-imported')));
  smoke.check('旧目录仍在但归属缺失时拒绝接管，不误报迁移完成', true);
}

/** 真实原子表重开后保留面积；A/B尺寸独立，缺省旧字段不被回填。 */
async function megapixels() {
  const base = path.join(root, 'megapixels');
  const library = createCanvasLibrary(base);
  const entry = await library.request({ operation: 'create', name: 'MP', folderId: null });
  const document = await library.request({ operation: 'load', id: entry.id });
  const data = { kind: 'video', title: 'A', prompt: '', content: '', workflow: 'minimax', ratio: '16/9' };
  document.nodes = [{ id: 'a', position: { x: 0, y: 0 }, data: { ...data, videoMegapixels: 0.1, videoOutput: { width: 416, height: 256 } } }, { id: 'b', position: { x: 600, y: 0 }, data }];
  await library.request({ operation: 'save', id: entry.id, document });
  const restored = await createCanvasLibrary(base).request({ operation: 'load', id: entry.id });
  assert.deepEqual(restored.nodes, document.nodes);
  smoke.check('MiniMax面积和实际宽高经SQLite保存重开不丢失，另一节点缺省不串值', true);
}

async function main() {
  await app.whenReady();
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ir-library-'));
  smoke.setWorkDir(root);
  const library = createCanvasLibrary(path.join(root, 'user'));
  await megapixels();
  const { a, b } = await isolation(library);
  await classification(library, a, b);
  const reopened = createCanvasLibrary(path.join(root, 'user'));
  assert.equal((await reopened.request({ operation: 'list' })).entries.length, 1);
  smoke.check('重开读取真实工程目录与目录表', true);
  await legacy();
  await interruptedMigration();
  await missingLegacyDirectory();
  await missingLegacyOwner();
  await safety(library, b);
  await require('./lib/check-canvas-delete').checkCanvasDelete(root, smoke);
  await require('./lib/check-canvas-library-retry').checkCanvasLibraryRetry(root, smoke);
  smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch(error => { console.error(error); smoke.finish({ app, ok: false }); });

/** 真实临时文件与生产 SQLite 回归；时间由主进程注入，不等待24小时，不操作用户资源。 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');
const { createCanvasLibrary } = require('../apps/electron/src/main/modules/canvas/canvas-library');
const { importAssets } = require('../apps/electron/src/main/modules/canvas/project-assets');
const ledger = require('../apps/electron/src/main/modules/canvas/resource-ledger');
const recycle = require('../apps/electron/src/main/modules/canvas/resource-recycle');
const files = require('../apps/electron/src/main/modules/canvas/resource-files');
const smoke = require('./lib/smoke-harness').createSmokeHarness({ name: 'canvas-resource-storage', timeoutMs: 120000 });
smoke.installWatchdog(app);
let root;

const node = (id, media) => ({ id, position: { x: 0, y: 0 }, data: { kind: media.kind, title: id, prompt: '', content: '', ratio: '1/1', media } });
const rows = library => ledger.database(library.root, client => ledger.select(client, 'resource.all'));
const exists = async file => Boolean(await files.inspect(file));

async function fixture(name) {
  const library = createCanvasLibrary(path.join(root, name));
  const entry = await library.request({ operation: 'create', name: 'Project', folderId: null });
  const document = await library.request({ operation: 'load', id: entry.id });
  const external = path.join(root, `${name}.png`);
  await fs.writeFile(external, 'original pixels');
  const imported = await importAssets(library.root, { name: document.name, workspace: document.workspace,
    files: [{ kind: 'image', path: external, name: 'source.png', size: 0 }] });
  return { library, entry, document, external, media: imported.media[0] };
}

/** 未登记文件既覆盖分类目录，也覆盖工程根和用户自建目录，不能靠扫描补删权。 */
async function unknownAndClose() {
  const { library, entry, document, external, media } = await fixture('unknown');
  const directory = path.join(library.root, document.workspace.folder);
  const unknown = [path.join(directory, 'manual.png'), path.join(directory, 'Picture', 'manual.png'),
    path.join(directory, 'video', 'manual.mp4'), path.join(directory, 'Audio', 'manual.wav')];
  for (const file of unknown) await fs.writeFile(file, 'manual');
  await importAssets(library.root, { name: 'Project', workspace: document.workspace,
    files: [{ kind: 'image', path: unknown[1], name: 'manual.png', size: 0 }] });
  assert.equal((await rows(library)).length, 1);
  document.nodes = [node('standalone', media)];
  await library.request({ operation: 'save', id: entry.id, document });
  await library.sweep(Date.now() + 100000000);
  assert.ok(await exists(media.path));
  document.nodes = [];
  await library.request({ operation: 'save', id: entry.id, document });
  await library.sweep();
  assert.ok(await exists(media.path));
  await library.request({ operation: 'close', id: entry.id });
  await library.sweep();
  assert.equal((await rows(library))[0].state, 'trashed');
  assert.equal(await exists(media.path), false);
  for (const file of [...unknown, external]) assert.ok(await exists(file));
  smoke.check('无连线节点仍引用；保存/挂起不回收；关闭才搬运；全部未登记文件与外部原件保留', true);
  return { library, entry, document, media };
}

/** 恢复必须回到原地址且计时归零；再次删除才重新开始24小时。 */
async function restoreAndExpiry(context) {
  const { library, entry, document, media } = context;
  document.nodes = [node('restored', media)];
  await library.request({ operation: 'save', id: entry.id, document });
  assert.ok(await exists(media.path));
  assert.equal((await rows(library))[0].entered_at, null);
  await library.request({ operation: 'load', id: entry.id });
  document.nodes = [];
  await library.request({ operation: 'save', id: entry.id, document });
  await library.request({ operation: 'close', id: entry.id });
  await library.sweep();
  const [row] = await rows(library);
  const trash = await files.trashPath(library.root, row);
  const restarted = createCanvasLibrary(path.dirname(library.root));
  await restarted.sweep(row.expires_at - 1);
  assert.ok(await exists(trash));
  await restarted.sweep(row.expires_at);
  assert.equal(await exists(trash), false);
  assert.equal((await rows(library)).length, 0);
  smoke.check('重新依赖自动恢复、24小时终点到期、重启补查与真实unlink', true);
}

/** 多工程和多实例不靠当前工作区猜测；坏工程会中止清理而非忽略依赖。 */
async function sharedReferences() {
  const { library, entry, document, media } = await fixture('shared');
  const second = await library.request({ operation: 'create', name: 'Other', folderId: null });
  const other = await library.request({ operation: 'load', id: second.id }, 2);
  other.nodes = [node('copy-a', media), node('copy-b', media)];
  await library.request({ operation: 'save', id: second.id, document: other }, 2);
  await library.request({ operation: 'save', id: entry.id, document });
  await library.request({ operation: 'close', id: entry.id });
  await library.sweep();
  assert.ok(await exists(media.path));
  await library.request({ operation: 'close', id: second.id }, 2);
  await library.sweep();
  assert.ok(await exists(media.path));
  // 关闭另一个工程前仍保留 undo/clipboard；断线不能把未保存删除写入工程。
  const opened = await library.request({ operation: 'load', id: second.id }, 3);
  opened.nodes = [];
  library.disconnect(3);
  await library.sweep(Date.now() + 100000000);
  assert.ok(await exists(media.path));
  smoke.check('同源两实例、跨工程引用、打开租约和异常断线保护', true);
}

/** 只登记明确生成的文件；原地址替换、重命名与恢复冲突分别验证，不能按文件名误删。 */
async function generatedAndReplaced() {
  const { library, entry, document } = await fixture('generated');
  const target = path.join(library.root, document.workspace.folder, 'Picture', 'generated.png');
  await fs.writeFile(target, 'generated pixels');
  await importAssets(library.root, { name: 'Project', workspace: document.workspace, origin: 'generated',
    files: [{ kind: 'image', path: target, name: 'generated.png', size: 0 }] });
  const next = path.join(path.dirname(target), 'renamed.png');
  await fs.rename(target, next);
  document.nodes = [node('result', { kind: 'image', path: next, name: 'renamed.png', size: 16 })];
  await library.request({ operation: 'save', id: entry.id, document });
  await library.request({ operation: 'close', id: entry.id });
  await library.sweep();
  assert.ok(await exists(next));
  // 内容覆盖后即使没有引用也只封存登记，永远不删除新内容。
  await fs.writeFile(next, 'replacement belongs to user');
  await library.request({ operation: 'load', id: entry.id });
  document.nodes = [];
  await library.request({ operation: 'save', id: entry.id, document });
  await library.request({ operation: 'close', id: entry.id });
  await library.sweep(Date.now() + 200000000);
  assert.equal(await fs.readFile(next, 'utf8'), 'replacement belongs to user');
  assert.ok((await rows(library)).some(row => row.state === 'blocked'));
  smoke.check('生成结果登记、真实改名身份追踪、用户替换文件不回收', true);
}

async function interruptedAndConflict() {
  const { library, entry, document, media } = await fixture('interrupted');
  await library.request({ operation: 'save', id: entry.id, document });
  await library.request({ operation: 'close', id: entry.id });
  await library.sweep();
  const [row] = await rows(library);
  const trash = await files.trashPath(library.root, row);
  await fs.writeFile(media.path, 'manual replacement');
  await assert.rejects(ledger.database(library.root, client => recycle.restore(library.root, client, row)));
  assert.equal(await fs.readFile(media.path, 'utf8'), 'manual replacement');
  assert.ok(await exists(trash));
  await fs.unlink(media.path);
  // 模拟恢复时已建目标硬链接，但进程在删旧入口前停止。
  await fs.link(trash, media.path);
  await library.sweep();
  assert.equal((await rows(library))[0].state, 'active');
  assert.equal(await exists(trash), false);
  smoke.check('同名冲突保留双方、硬链接中断状态恢复与不覆盖', true);
}

/** 参考、导演台和合成器直接持有素材也算依赖，不能只沿连线计算。 */
async function embeddedReferences() {
  const { library, entry, document, media } = await fixture('embedded');
  const scene = structuredClone(require('./fixtures/director/native-scene.json'));
  scene.previewPath = scene.panoramaUrl = media.path;
  scene.props.push({ id: 'picture-board', label: 'Board', category: 'media', imageUrl: media.path, position: { x: 0, y: 0, z: 0 } });
  const base = { title: 'dependency', prompt: '', content: '', ratio: '1/1' };
  document.nodes = [
    { id: 'reference', position: { x: 0, y: 0 }, data: { ...base, kind: 'image', workflow: 'minimax-image-edit', inputImages: [media] } },
    { id: 'scene', position: { x: 0, y: 0 }, data: { ...base, kind: 'scene', scene } },
    { id: 'composition', position: { x: 0, y: 0 }, data: { ...base, kind: 'composition', composition: { version: 1, state: { videoClips: [], audioClips: [] }, assets: [{ id: 'source', media }] } } },
  ];
  await library.request({ operation: 'save', id: entry.id, document });
  await library.request({ operation: 'close', id: entry.id });
  await library.sweep(Date.now() + 200000000);
  assert.ok(await exists(media.path));
  const catalog = await library.request({ operation: 'resources', id: entry.id });
  assert.equal(catalog.resourceItems.filter(item => item.ownership === 'managed').length, 1);
  await library.request({ operation: 'retainResource', id: entry.id, resourceId: catalog.resourceItems[0].id, retained: true });
  await library.request({ operation: 'load', id: entry.id });
  document.nodes = [];
  await library.request({ operation: 'save', id: entry.id, document });
  await library.request({ operation: 'close', id: entry.id });
  await library.sweep();
  assert.ok(await exists(media.path));
  smoke.check('参考图/导演台/合成器无连线依赖保留；闲置保留标记真实生效', true);
}

/** 无效保存不能触发关闭回收，损坏工程也不能因依赖检查失败被视作空图。 */
async function failedSaveAndRead() {
  const { library, entry, document, media } = await fixture('failed-save');
  document.nodes = [node('saved', media)];
  await library.request({ operation: 'save', id: entry.id, document });
  await library.request({ operation: 'load', id: entry.id });
  await assert.rejects(library.request({ operation: 'close', id: entry.id }));
  await assert.rejects(library.request({ operation: 'save', id: entry.id, document: { ...document, nodes: null } }));
  await library.sweep();
  assert.ok(await exists(media.path));
  library.disconnect(0);
  smoke.check('未成功保存不能关闭授权；保存失败与异常断线不误回收', true);
}

/** 替换工程包前后可切换素材归属，关闭释放两个抽屉；未知替代文件仍能安全展示。 */
async function workspaceSwitch() {
  const { library, entry, document, external } = await fixture('workspace-switch');
  const imported = await importAssets(library.root, { name: 'Imported archive', files: [{ kind: 'image', path: external, name: 'archive.png', size: 0 }] });
  const current = await library.request({ operation: 'resources', id: entry.id, workspace: imported.workspace });
  assert.equal(current.resourceItems.length, 1);
  assert.equal(current.resourceItems[0].media.path, imported.media[0].path);
  document.workspace = imported.workspace;
  await library.request({ operation: 'save', id: entry.id, document });
  await library.request({ operation: 'close', id: entry.id });
  await library.sweep();
  assert.equal((await rows(library)).filter(row => row.state === 'trashed').length, 2);
  await library.request({ operation: 'restoreResource', id: entry.id, workspace: imported.workspace, resourceId: current.resourceItems[0].id });
  await fs.writeFile(imported.media[0].path, 'user replacement');
  const replaced = await library.request({ operation: 'resources', id: entry.id, workspace: imported.workspace });
  assert.equal(replaced.resourceItems[0].ownership, 'unknown');
  const reserved = await library.request({ operation: 'create', name: 'temp', folderId: null });
  const named = await library.request({ operation: 'load', id: reserved.id });
  assert.notEqual(named.workspace.folder.toLowerCase(), 'temp');
  smoke.check('未保存工程包素材定位、切换归属后释放、替代文件未知归属、temp保留名', true);
}

/** 其他工程读坏时无法证明无引用，整轮清理拒绝执行并保留正文。 */
async function corruptedProjectProtects() {
  const { library, entry, document, media } = await fixture('corrupt-document');
  const second = await library.request({ operation: 'create', name: 'Broken', folderId: null });
  const other = await library.request({ operation: 'load', id: second.id }, 2);
  await library.request({ operation: 'save', id: entry.id, document });
  await library.request({ operation: 'close', id: entry.id });
  await library.sweep();
  const database = path.join(library.root, other.workspace.folder, 'project.sqlite');
  await fs.writeFile(database, 'not a sqlite database');
  library.disconnect(2);
  await assert.rejects(library.sweep(Date.now() + 100000000));
  assert.ok(await exists(media.path));
  assert.equal((await rows(library))[0].state, 'active');
  smoke.check('其他工程真实数据库损坏时中止回收，不把读取失败当成无引用', true);
}

async function main() {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ir-canvas-resources-'));
  smoke.setWorkDir(root);
  await restoreAndExpiry(await unknownAndClose());
  await sharedReferences();
  await generatedAndReplaced();
  await interruptedAndConflict();
  await embeddedReferences();
  await failedSaveAndRead();
  await workspaceSwitch();
  await corruptedProjectProtects();
  await smoke.finish({ app, ok: smoke.allPassed() });
}

app.whenReady().then(main).catch(error => { console.error(error); smoke.finish({ app, ok: false }); });

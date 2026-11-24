/** 本地工程库：目录存媒体和独立 SQLite，目录表只存分类、名称和计数，不存整张图。 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SqliteClient } = require('../../storage/sqlite/client');
const { allocateWorkspace } = require('./project-assets');
const { nodeReferences, digest } = require('./project-archive');
const validation = require('./project-validation');
const recycle = require('./resource-recycle');
const { createResourceSessions } = require('./resource-sessions');
/** @typedef {import('@illusion-realm/shared').UserDataInfiniteCanvas} Canvas */
/** @typedef {import('@illusion-realm/shared').CanvasLibraryRequest} Request */
/** @typedef {{entry_id:string,directory:string,name:string,folder_id:string|null,updated_at:number,node_count:number}} Entry */

/** @template T @param {string} file @param {(client:SqliteClient)=>Promise<T>} run */
async function database(file, run) {
  try { if ((await fs.lstat(file)).isSymbolicLink()) throw new Error('canvas-library-symlink'); }
  catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
  const client = new SqliteClient(file);
  try { return await run(client); }
  finally { await client.close(); }
}

/** @param {string} root @param {Entry} entry */
async function directory(root, entry) {
  // 目录表也按不可信输入处理；不能通过手改 SQLite 绕到其他用户文件夹。
  if (!validation.workspace({ id: entry.entry_id, folder: entry.directory })) throw new Error('canvas-library-invalid-entry');
  const target = path.join(root, entry.directory);
  if ((await fs.lstat(target)).isSymbolicLink() || await fs.readFile(path.join(target, '.canvas-owner'), 'utf8') !== entry.entry_id) throw new Error('canvas-workspace-unavailable');
  return target;
}

/** @param {string} target @returns {Promise<Canvas>} */
async function loadDocument(target) {
  const value = await database(path.join(target, 'project.sqlite'), client => client.request('document', { operation: 'load', document: {} }));
  const canvas = /** @type {{sections:{infiniteCanvas?:Canvas}}} */ (value).sections.infiniteCanvas;
  if (!canvas || !validation.document(canvas)) throw new Error('canvas-invalid-document');
  return canvas;
}

/** @param {string} target @param {Canvas} canvas */
async function saveDocument(target, canvas) {
  // IPC 保留 undefined，而磁盘契约只保存 JSON 字段；先归一化再做 SQL 反读对照。
  const document = JSON.parse(JSON.stringify(canvas));
  await database(path.join(target, 'project.sqlite'), client => client.request('document', { operation: 'save', document: { infiniteCanvas: document } }));
}

/** @param {SqliteClient} catalog @param {string} folder @param {Canvas} canvas @param {string|null} folderId */
async function register(catalog, folder, canvas, folderId) {
  if (!canvas.workspace) throw new Error('canvas-workspace-unavailable');
  await catalog.request('library', { operation: 'put', id: canvas.workspace.id, directory: folder,
    name: canvas.name, folderId, updatedAt: Date.now(), nodeCount: canvas.nodes.length });
}

/** @param {string} root @param {SqliteClient} catalog @param {NonNullable<Canvas['workspace']>} workspace */
async function rollbackCreated(root, catalog, workspace) {
  // 写入结果未知时先查稳定身份；已登记或无法核对都保留，不能因回执失败删掉已成功的工程。
  const registered = await catalog.request('library', { operation: 'get', id: workspace.id, includeDeleted: true });
  if (registered) return true;
  const target = await directory(root, { entry_id: workspace.id, directory: workspace.folder, name: '', folder_id: null, updated_at: 0, node_count: 0 });
  await fs.rm(target, { recursive: true, force: false });
  return false;
}

/** @param {string} root @param {SqliteClient} catalog @param {string} name @param {string|null} folderId */
async function create(root, catalog, name, folderId) {
  if (folderId) {
    const snapshot = /** @type {{folders:{id:string}[]}} */ (await catalog.request('library', { operation: 'list' }));
    if (!snapshot.folders.some(folder => folder.id === folderId)) throw new Error('canvas-library-folder-not-found');
  }
  const workspace = await allocateWorkspace(root, { name, files: [] });
  const document = { version: /** @type {const} */ (1), name, workspace, nodes: [], edges: [] };
  try {
    await saveDocument(path.join(root, workspace.folder), document);
    await register(catalog, workspace.folder, document, folderId);
  } catch (error) {
    // 新建失败只回收本次刚分配的空工程，不能留下重试时越来越多的半成品目录。
    let committed = false;
    try { committed = await rollbackCreated(root, catalog, workspace); }
    catch { /* 无法确认归属或写入结果时保留文件，后续目录发现可以找回完整工程。 */ }
    if (!committed) throw error;
  }
  return { id: workspace.id, name, folderId, updatedAt: Date.now(), nodeCount: 0 };
}

/** @param {string} root @param {SqliteClient} catalog */
async function discover(root, catalog) {
  // 工程目录相当于独立抽屉：只有归属和作品均有效才登记，不把普通文件夹当成工程。
  for (const item of await fs.readdir(root, { withFileTypes: true })) {
    if (!item.isDirectory() || item.isSymbolicLink()) continue;
    const target = path.join(root, item.name);
    try { await fs.access(path.join(target, 'project.sqlite')); }
    catch { continue; }
    let id;
    try { id = await fs.readFile(path.join(target, '.canvas-owner'), 'utf8'); }
    catch { continue; }
    if (!validation.workspace({ id, folder: item.name })) continue;
    const known = await catalog.request('library', { operation: 'get', id, includeDeleted: true });
    if (known) continue;
    let document;
    try { document = await loadDocument(await directory(root, { entry_id: id, directory: item.name, name: '', folder_id: null, updated_at: 0, node_count: 0 })); }
    catch { continue; }
    // 素材目录可能不同于工程目录；归档身份来自 owner，不能借素材归属重复建工程。
    await catalog.request('library', { operation: 'put', id, directory: item.name, name: document.name,
      folderId: null, updatedAt: Math.trunc((await fs.stat(path.join(target, 'project.sqlite'))).mtimeMs), nodeCount: document.nodes.length });
  }
}

/** @param {string} root @param {SqliteClient} catalog @param {Request} request @param {ReturnType<typeof createResourceSessions>} sessions @param {number} owner */
async function execute(root, catalog, request, sessions, owner) {
  if (request.operation === 'libraryResources') return require('./global-resources').list(root, catalog);
  if (request.operation === 'importLibraryResources') return require('./global-resources').importMedia(root, catalog, request.files);
  if (request.operation === 'deleteResources') return deleteResources(root, catalog, request, sessions, owner);
  if (request.operation === 'list') { await discover(root, catalog); return catalog.request('library', { operation: 'list' }); }
  if (request.operation === 'create') return create(root, catalog, request.name, request.folderId);
  if (request.operation === 'folder') return catalog.request('library', { ...request, id: randomUUID() });
  if (request.operation === 'remove' || request.operation === 'purgeDeleted') {
    await discover(root, catalog);
    // 先找回旧版登记失败的完整工程；坏残留目录不登记，也不成为删除目标。
    return require('./library-delete').deleteProjects(root, catalog, request.operation === 'remove' ? request.ids : null, loadDocument);
  }
  if (request.operation === 'move' || request.operation === 'removeFolder') return catalog.request('library', request);
  return executeProject(root, catalog, request, sessions, owner);
}

/** 单工程操作先核对目录归属；列表和分类不经过这条文件路径。 @param {string} root @param {SqliteClient} catalog @param {Exclude<Request,{operation:'list'|'create'|'folder'|'remove'|'purgeDeleted'|'move'|'removeFolder'|'libraryResources'|'importLibraryResources'|'deleteResources'}>} request @param {ReturnType<typeof createResourceSessions>} sessions @param {number} owner */
async function executeProject(root, catalog, request, sessions, owner) {
  const entry = /** @type {Entry|null} */ (await catalog.request('library', { operation: 'get', id: request.id }));
  if (!entry) throw new Error('canvas-library-not-found');
  const target = await directory(root, entry);
  // 工程包导入后尚未保存时，也要列当前编辑文档的素材归属，而非旧保存目录。
  if (request.operation === 'resources') return require('./resource-catalog').listResources(root, catalog, { ...await loadDocument(target), ...(request.workspace ? { workspace: request.workspace } : {}) });
  if (request.operation === 'restoreResource' || request.operation === 'retainResource') {
    return require('./resource-catalog').updateResource(root, catalog, { ...await loadDocument(target), ...(request.workspace ? { workspace: request.workspace } : {}) }, request.resourceId,
      request.operation === 'retainResource' ? request.retained : undefined);
  }
  if (request.operation === 'load') {
    const canvas = await loadDocument(target);
    await sessions.open(catalog, owner, request.id, canvas);
    await recycle.restoreReferences(root, catalog, canvas);
    return canvas;
  }
  if (request.operation === 'close') {
    await sessions.close(catalog, owner, request.id, await loadDocument(target));
    return null;
  }
  await recycle.restoreReferences(root, catalog, request.document);
  await saveDocument(target, request.document);
  await catalog.request('library', { operation: 'put', id: request.id, directory: entry.directory,
    name: request.document.name, folderId: entry.folder_id, updatedAt: Date.now(), nodeCount: request.document.nodes.length });
  sessions.saved(owner, request.id, request.document);
  return null;
}

/** 删除使用当前列表和文件身份双重核对，未被明确选中的文件不获得删权。 @param {string} root @param {SqliteClient} client @param {Extract<Request,{operation:'deleteResources'}>} request @param {ReturnType<typeof createResourceSessions>} sessions @param {number} owner */
async function deleteResources(root, client, request, sessions, owner) {
  if (sessions.hasOthers(owner, request.id)) throw Error('canvas-delete-open-sessions');
  const entry = /** @type {Entry|null} */ (await client.request('library', { operation: 'get', id: request.id }));
  if (!entry) throw Error('canvas-library-not-found');
  const target = await directory(root, entry);
  const workspace = request.scope === 'library' ? await require('./global-resources').workspace(root) : request.document.workspace;
  const document = { ...request.document, workspace };
  const snapshot = await require('./resource-catalog').listResources(root, client, document);
  const targets = new Map(snapshot.resourceItems.map(item => [recycle.key(item.media.path), item]));
  const items = request.resources.map(target => {
    const item = targets.get(recycle.key(target.path));
    if (!item || item.identity !== target.identity || item.state === 'blocked') throw Error('canvas-resource-identity-changed');
    return item;
  });
  if (new Set(items.map(item => recycle.key(item.media.path))).size !== items.length) throw Error('canvas-resource-invalid-path');
  // 当前工程像改过的清单，以本次草稿为准；其他工程仍查已保存内容，坏库照常中止。
  const read = async (/** @type {string} */ directory) => {
    const saved = await loadDocument(directory);
    return recycle.key(directory) === recycle.key(target) ? request.document : saved;
  };
  // 整批预检通过后才保存；复用原保存流程，不能把全局素材库的目录写成工程目录。
  const commit = () => executeProject(root, client, { operation: 'save', id: request.id, document: request.document }, sessions, owner);
  return require('./resource-delete').remove(root, client, document, items, read, commit);
}

/** @param {string} base @param {string} root @param {SqliteClient} catalog @param {()=>Promise<Canvas|undefined>} legacy */
async function migrateLegacy(base, root, catalog, legacy) {
  const marker = path.join(root, '.legacy-imported');
  try { await fs.access(marker); return; } catch { /* 首次打开才读取旧草稿。 */ }
  const original = await legacy();
  if (original && (original.nodes.length || original.name || original.workspace)) {
    const workspace = await legacyWorkspace(root, original.name || 'Canvas');
    const canvas = structuredClone(original);
    const registered = await catalog.request('library', { operation: 'get', id: workspace.id, includeDeleted: true });
    if (!registered) {
      if (original.workspace) await copyLegacyAssets(base, root, original.workspace, workspace, canvas);
      canvas.workspace = workspace;
      await saveDocument(path.join(root, workspace.folder), canvas);
      await register(catalog, workspace.folder, canvas, null);
    }
  }
  // 原 SQL/目录保留作备份；仅成功完整保存后写标记，失败不宣称旧工程已迁完。
  await fs.writeFile(marker, '1', { flag: 'wx' });
}

/** @param {string} root @param {string} name */
async function legacyWorkspace(root, name) {
  const pending = path.join(root, '.legacy-pending.json');
  try {
    const workspace = JSON.parse(await fs.readFile(pending, 'utf8'));
    await directory(root, { entry_id: workspace.id, directory: workspace.folder, name, folder_id: null, updated_at: 0, node_count: 0 });
    return /** @type {NonNullable<Canvas['workspace']>} */ (workspace);
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
    // 迁移未完成时保留柜号；重试继续使用同一归属，不反复复制出多个旧画布。
    const workspace = await allocateWorkspace(root, { name, files: [] });
    await fs.writeFile(pending, JSON.stringify(workspace), { flag: 'wx' });
    return workspace;
  }
}

/** @param {string} source @param {string} target */
async function safeLegacyCopy(source, target) {
  await fs.cp(source, target, { recursive: true, force: true, filter: async (from, to) => {
    if ((await fs.lstat(from)).isSymbolicLink()) throw new Error('canvas-library-symlink');
    try { if ((await fs.lstat(to)).isSymbolicLink()) throw new Error('canvas-library-symlink'); }
    catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
    return true;
  } });
  await verifyLegacyCopy(source, target);
}

/** @param {string} source @param {string} target */
async function verifyLegacyCopy(source, target) {
  if ((await fs.lstat(source)).isDirectory()) {
    for (const name of await fs.readdir(source)) await verifyLegacyCopy(path.join(source, name), path.join(target, name));
  } else if (await digest(source) !== await digest(target)) throw new Error('canvas-project-checksum-failed');
}

/** @param {string} base @param {string} root @param {NonNullable<Canvas['workspace']>} old @param {NonNullable<Canvas['workspace']>} next @param {Canvas} canvas */
async function copyLegacyAssets(base, root, old, next, canvas) {
  if (!validation.workspace(old)) throw new Error('canvas-library-invalid-entry');
  // 旧素材抽屉已丢失时，保留节点和原路径供找回；不能让缺图挡住整个工程库的新建。
  // 只容忍目录本身不存在；目录仍在但 owner 丢失、归属不符或符号链接仍拒绝迁移。
  try { await fs.lstat(path.join(base, old.folder)); }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
  const source = await directory(base, { entry_id: old.id, directory: old.folder, name: '', folder_id: null, updated_at: 0, node_count: 0 });
  const target = path.join(root, next.folder);
  for (const name of await fs.readdir(source)) {
    if (name === '.canvas-owner' || name.startsWith('project.sqlite')) continue;
    await safeLegacyCopy(path.join(source, name), path.join(target, name));
  }
  for (const node of canvas.nodes) for (const reference of nodeReferences(node)) {
    const relative = path.relative(source, reference.path);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) reference.set(path.join(target, relative));
  }
}

/** @param {string} base @param {()=>Promise<Canvas|undefined>} [legacy] */
function createCanvasLibrary(base, legacy = async () => undefined) {
  const root = path.join(base, 'Infinite Canvas');
  const run = createLibraryQueue(base, root, legacy);
  const sessions = createResourceSessions();
  /** 未关闭的工作台先全部保留；定时器只排一轮，不积压多份媒体扫描。 @param {number} [now] */
  const sweep = (now) => run(async catalog => {
    if (sessions.busy()) return { recycled: 0, failed: 0 };
    await discover(root, catalog);
    return recycle.collect(root, catalog, loadDocument, now);
  });
  /** @param {Request} request @param {number} [owner] */
  async function request(request, owner = 0) {
    const result = await run(catalog => execute(root, catalog, request, sessions, owner));
    if (request.operation === 'close') void sweep().catch(() => console.error({ module: 'canvas-resource', reason: 'recycle-failed' }));
    return result;
  }
  return { request, run, root, sweep, disconnect: sessions.disconnect };
}

/** 文件接收与回收用同一队列，像一把柜门钥匙，核对依赖时不能又塞进新素材。 @param {string} base @param {string} root @param {()=>Promise<Canvas|undefined>} legacy */
function createLibraryQueue(base, root, legacy) {
  /** @type {Promise<unknown>} */
  let pending = Promise.resolve();
  let initialized = false;
  /** 所有文件接收与回收共用队列，回收核对期间不能插入一次新导入。 @template T @param {(client:SqliteClient)=>Promise<T>} action */
  function run(action) {
    const operation = pending.catch(() => {}).then(async () => {
      await fs.mkdir(root, { recursive: true });
      if ((await fs.lstat(root)).isSymbolicLink()) throw new Error('canvas-library-symlink');
      return database(path.join(root, 'library.sqlite'), async catalog => {
        if (!initialized) { await migrateLegacy(base, root, catalog, legacy); initialized = true; }
        return action(catalog);
      });
    }).catch(error => {
      // 只记固定错误类别和动作，不把路径、工程名或原始堆栈写进诊断。
      const reason = error instanceof Error && /^(?:SQLITE_[A-Z_]+|canvas-[a-z-]+)$/.test(error.message)
        ? error.message : error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^E[A-Z]+$/.test(error.code) ? error.code : 'UNKNOWN';
      console.error({ module: 'canvas-library', reason });
      throw error;
    });
    pending = operation;
    return operation;
  }
  return run;
}

module.exports = { createCanvasLibrary, loadDocument, saveDocument };

/** 旧画布回归接入正式工程库；只替换测试前提和故障注入，读回始终查询真实原子表。 */
const fs = require('node:fs');
const path = require('node:path');
const { openConnection } = require('../../apps/electron/src/main/storage/sqlite/connection');
const { loadCanvas } = require('../../apps/electron/src/main/storage/sqlite/canvas-load');
const { createCanvasLibrary } = require('../../apps/electron/src/main/modules/canvas/canvas-library');

function project(ctx) {
  const base = path.join(path.dirname(ctx.documentPath), 'user');
  const root = path.join(base, 'Infinite Canvas');
  const catalog = openConnection(path.join(root, 'library.sqlite'));
  try {
    const row = catalog.prepare('SELECT entry_id,directory FROM canvas_library_entry WHERE deleted=0 ORDER BY updated_at DESC LIMIT 1').get();
    if (!row) throw Error('missing-smoke-project');
    return { base, root, id: row.entry_id, directory: row.directory };
  } finally { catalog.close(); }
}

function readCanvas(ctx) {
  const entry = project(ctx);
  const db = openConnection(path.join(entry.root, entry.directory, 'project.sqlite'));
  try { return loadCanvas(db); }
  finally { db.close(); }
}

async function writeCanvas(ctx, document) {
  const entry = project(ctx);
  await createCanvasLibrary(entry.base).request({ operation: 'save', id: entry.id, document });
}

async function openProject(ctx) {
  // 独立查询先排在初始化请求之后，避免初始空 DOM 被误当作已完成的空工程库。
  const snapshot = await ctx.run("window.electronAPI.canvasLibrary({operation:'list'})");
  if (!snapshot.success) throw Error('smoke-library-unavailable');
  await ctx.wait("!!document.querySelector('[data-canvas-library]') && !document.querySelector('[data-canvas-library] [aria-busy=true]')");
  await ctx.wait(`document.querySelectorAll('[data-library-entry]').length===${snapshot.data.entries.length}`);
  if (await ctx.run("!!document.querySelector('[data-library-entry]')")) {
    await ctx.click('[data-library-entry]');
  } else {
    await ctx.run("[...document.querySelectorAll('[data-canvas-library] header button')].find(e=>e.textContent.trim()==='新建画布').click()");
    await ctx.wait("!!document.querySelector('[data-canvas-library-form] input')");
    await ctx.run("document.querySelector('[data-canvas-library-form] input').value='自动回归画布'");
    await ctx.click('[data-canvas-library-form] button[type=submit]');
  }
  await ctx.wait("!!document.querySelector('[data-infinite-canvas]')");
}

function install(documentPath, shouldFail) {
  const { ipcMain } = require('electron');
  const { IPC_CHANNELS: channels } = require('../../apps/electron/src/common/ipc-channels');
  const { registerHandle } = require('../../apps/electron/src/main/ipc/result');
  // 只捕获启动前提；SQLite 水合可能先移除 JSON 中的旧段，不能让测试自己的读取顺序丢掉种子。
  const legacy = JSON.parse(fs.readFileSync(documentPath, 'utf8')).infiniteCanvas;
  const library = createCanvasLibrary(path.join(path.dirname(documentPath), 'user'), async () => legacy);
  ipcMain.removeHandler(channels.CANVAS_LIBRARY);
  registerHandle(channels.CANVAS_LIBRARY, (_event, request) => {
    if (request.operation === 'save' && shouldFail()) throw Error('intentional-canvas-save-failure');
    return library.request(request);
  }, args => args.length === 1 && require('../../apps/electron/src/main/modules/canvas/library-validation').request(args[0]) ? null : 'canvas-invalid-library-request');
}

module.exports = { readCanvas, writeCanvas, openProject, install };

/** 正式 Electron 工作区自动事件回归；截图来自运行页面，系统鼠标手感和人工操作另行验收。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const VISIBLE = '[data-canvas-session]:not([hidden])';

async function textClick(ctx, scope, text) {
  await ctx.wait(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(e=>e.textContent.trim()===${JSON.stringify(text)});return b&&!b.disabled})()`);
  await ctx.run(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('missing button');b.click()})()`);
  await delay(120);
}

async function fill(ctx, name, value) {
  await ctx.run(`(()=>{const e=document.querySelector(${JSON.stringify(name)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
}

async function newProject(ctx, name) {
  await ctx.wait("!document.querySelector('[data-canvas-library] [aria-busy=true]')");
  await textClick(ctx, '[data-canvas-library] header', '新建画布');
  await ctx.wait("!!document.querySelector('[data-canvas-library-form] input')");
  await fill(ctx, '[data-canvas-library-form] input', name);
  await ctx.click('[data-canvas-library-form] button[type=submit]');
  await ctx.wait(`document.querySelector('${VISIBLE} [data-canvas-save-status]')?.textContent.includes('已保存')`);
  return ctx.run(`document.querySelector('${VISIBLE}').dataset.canvasSession`);
}

async function projectAction(ctx, label) {
  await ctx.click(`${VISIBLE} [data-canvas-project-menu]`);
  await textClick(ctx, '[role=menu]', label);
  await delay(200);
}

async function resize(ctx, selector, dx, dy) {
  const start = await ctx.run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  ctx.win.webContents.sendInputEvent({ type: 'mouseMove', ...start });
  ctx.win.webContents.sendInputEvent({ type: 'mouseDown', ...start, button: 'left', clickCount: 1 });
  for (let step = 1; step <= 6; step++) {
    ctx.win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(start.x + dx * step / 6), y: Math.round(start.y + dy * step / 6), button: 'left' });
    await delay(30);
  }
  ctx.win.webContents.sendInputEvent({ type: 'mouseUp', x: start.x + dx, y: start.y + dy, button: 'left', clickCount: 1 });
  await delay(200);
}

async function addNode(ctx, kind, x, y) {
  await ctx.run(`(()=>{const e=document.querySelector('${VISIBLE} .react-flow__pane'),r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:r.left+${x},clientY:r.top+${y}}))})()`);
  await ctx.wait("document.querySelector('[data-canvas-menu]')");
  if (kind === "image") {
    await ctx.click('[data-canvas-image-category]');
    await ctx.click('[data-assistant-column="1"] [data-node-kind=image]');
  } else await ctx.click(`[data-canvas-menu] [data-node-kind="${kind}"]`);
  await ctx.wait(`document.querySelector('${VISIBLE} [data-kind="${kind}"]')`);
}

async function sizeControls(ctx) {
  await otherCardTypes(ctx);
  await addNode(ctx, 'image', 40, 180);
  await addNode(ctx, 'text', 650, 180);
  await ctx.pointer(`${VISIBLE} [data-kind=text] header>svg`);
  const node = `${VISIBLE} [data-kind=text]`;
  const before = await ctx.run(`document.querySelector('${node}').getBoundingClientRect().width`);
  await resize(ctx, `${node} .react-flow__resize-control.right`, 80, 0);
  const after = await ctx.run(`document.querySelector('${node}').getBoundingClientRect().width`);
  assert.ok(Math.abs(after - before - 80) < 3, `${before} -> ${after}`);
  assert.equal(await ctx.run(`getComputedStyle(document.querySelector('${node} .react-flow__resize-control.right')).borderRightWidth`), '0px');
  await ctx.shot('91-library-text-resize');
  await ctx.run(`document.querySelector('${node}').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:450,clientY:300}))`);
  await textClick(ctx, '[role=menu]', '固定尺寸');
  assert.equal(await ctx.run(`document.querySelectorAll('${node} [data-card-resizers]').length`), 0);
  await ctx.click(`${VISIBLE} [data-canvas-toolbar] button[aria-label=画布设置]`);
  await textClick(ctx, '.hy-settings nav', '节点与布局');
  await ctx.click('.hy-settings button[role=switch][aria-label=固定所有组件尺寸]');
  assert.equal(await ctx.run(`document.querySelector('${VISIBLE} [data-infinite-canvas]').dataset.fixedSize`), 'true');
  assert.equal(await ctx.run(`document.querySelectorAll('${VISIBLE} [data-canvas-node][data-card]').length`), 0);
  assert.ok(Math.abs(await ctx.run(`document.querySelector('${node}').getBoundingClientRect().width`) - before) < 3);
  await restoreFreeSizing(ctx);
  await ctx.shot('92-library-fixed-all');
  await ctx.click('.hy-settings button[aria-label=关闭画布设置]');
  ctx.smoke.check('文本自由缩放、透明边缘、右键单独锁定与全局默认尺寸', true);
}

async function restoreFreeSizing(ctx) {
  await ctx.click('.hy-settings button[role=switch][aria-label=固定所有组件尺寸]');
  await ctx.click('.hy-settings button[aria-label=关闭画布设置]');
  const node = `${VISIBLE} [data-kind=image]`;
  await ctx.run(`document.querySelector('${node}').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:500,clientY:300}))`);
  await ctx.key('Escape');
  assert.equal(await ctx.run(`getComputedStyle(document.querySelector('${node} [data-card-resizers]')).display!=='none'`), true);
  assert.equal(await ctx.run(`document.querySelectorAll('${VISIBLE} [data-kind=text] [data-card-resizers]').length`), 0);
  const width = await ctx.run(`document.querySelector('${node}').getBoundingClientRect().width`);
  await resize(ctx, `${node} .react-flow__resize-control.right`, 50, 0);
  assert.ok(Math.abs(await ctx.run(`document.querySelector('${node}').getBoundingClientRect().width`) - width - 50) < 3);
  await ctx.click(`${VISIBLE} [data-canvas-toolbar] button[aria-label=画布设置]`);
  await textClick(ctx, '.hy-settings nav', '节点与布局');
  await ctx.click('.hy-settings button[role=switch][aria-label=固定所有组件尺寸]');
  ctx.smoke.check('关闭全局固定后未锁节点恢复缩放，单独锁仍保持；重新固定回到默认尺寸', true);
}

async function otherCardTypes(ctx) {
  for (const kind of ['video', 'audio', 'note', 'scene', 'composition']) {
    await addNode(ctx, kind, 200, 150);
    const node = `${VISIBLE} [data-kind=${kind}]`;
    const geometry = () => ctx.run(`(()=>{const r=document.querySelector('${node}').getBoundingClientRect();return{w:r.width,h:r.height}})()`);
    const before = await geometry();
    await resize(ctx, `${node} .react-flow__resize-control.handle`, 50, 30);
    const after = await geometry();
    assert.ok(Math.abs(after.w - before.w - 50) < 3 && Math.abs(after.h - before.h - 30) < 3, kind);
    await ctx.run(`document.querySelector('${VISIBLE} [data-infinite-canvas]').focus()`);
    await ctx.key('z', ['control']);
    assert.ok(Math.abs((await geometry()).w - before.w) < 3, `${kind} undo`);
    // 撤销按既有契约清除选择；通过正式右键重新指定对象，空媒体按钮不负责节点选择。
    await ctx.run(`document.querySelector('${node}').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:600,clientY:400}))`);
    await textClick(ctx, '[role=menu]', '删除选中项');
    await ctx.wait(`!document.querySelector('${node}')`);
  }
  ctx.smoke.check('视频、音频、便签、导演台和合成节点均可缩放并撤销', true);
}

async function sessions(ctx, a) {
  await projectAction(ctx, '挂起并返回工作区');
  await ctx.wait("!document.querySelector('[data-canvas-library]').hidden");
  assert.equal(await ctx.run("document.querySelector('[data-suspended-canvases]')?.textContent.includes('挂起的画布')"), true);
  const count = await ctx.run("document.querySelectorAll('[data-canvas-node]').length");
  // 即使人为向隐藏 DOM 投递按键，宿主也必须拒绝，不能只依赖视觉遮挡。
  await ctx.run(`document.querySelector('[data-infinite-canvas]').dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}))`);
  assert.equal(await ctx.run("document.querySelectorAll('[data-canvas-node]').length"), count);
  const b = await newProject(ctx, '画布 B');
  await addNode(ctx, 'audio', 160, 180);
  await projectAction(ctx, '挂起并返回工作区');
  await textClick(ctx, '[data-app-nav] [data-suspended-canvases]', '画布 A');
  await ctx.wait(`document.querySelector('${VISIBLE}')?.dataset.canvasSession===${JSON.stringify(a)}`);
  assert.equal(await ctx.run(`document.querySelectorAll('${VISIBLE} [data-canvas-node]').length`), 2);
  await ctx.shot('93-library-resumed-a');
  await projectAction(ctx, '关闭并返回工作区');
  await ctx.wait(`!document.querySelector('[data-canvas-session="${a}"]')`);
  await ctx.click(`[data-library-entry="${a}"]`);
  await ctx.wait(`document.querySelector('${VISIBLE} [data-infinite-canvas]')?.dataset.fixedSize==='true'`);
  const saved = await ctx.run(`window.electronAPI.canvasLibrary({operation:'load',id:${JSON.stringify(a)}})`);
  assert.equal(saved.data.nodes.find(node => node.data.kind === 'text').data.resizeLocked, true);
  await crossPage(ctx);
  ctx.smoke.check('挂起/切回、A/B 状态隔离、隐藏键盘隔离、关闭重开和跨页面保留', true);
  return b;
}

async function crossPage(ctx) {
  await ctx.click('[data-app-nav] a[href="/"]');
  await ctx.wait("document.querySelector('[data-canvas-session-host]').style.display==='none'");
  await textClick(ctx, '[data-app-nav] [data-suspended-canvases]', '画布 A');
  await ctx.wait(`!!document.querySelector('${VISIBLE} [data-infinite-canvas]')`);
  await projectAction(ctx, '挂起并返回工作区');
}

async function libraryControls(ctx, a, b) {
  await textClick(ctx, '[data-canvas-library] header', '新建文件夹');
  await fill(ctx, '[data-canvas-library-form] input', '短片分类');
  await ctx.click('[data-canvas-library-form] button[type=submit]');
  await ctx.wait("[...document.querySelectorAll('[data-canvas-library] aside button')].some(e=>e.textContent.includes('短片分类'))");
  await textClick(ctx, '[data-canvas-library] header', '多选');
  await textClick(ctx, '[data-canvas-library] [role=toolbar]', '全选');
  await textClick(ctx, '[data-canvas-library] [role=toolbar]', '移动到分类');
  await ctx.run("(()=>{const e=document.querySelector('[data-canvas-library-form] select');e.value=e.options[1].value;e.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await ctx.click('[data-canvas-library-form] button[type=submit]');
  await ctx.wait("!document.querySelector('[data-canvas-library-form]')");
  await textClick(ctx, '[data-canvas-library] [role=toolbar]', '取消选择');
  await fill(ctx, '[data-canvas-library] input[aria-label=搜索画布]', '画布 A');
  assert.equal(await ctx.run("document.querySelectorAll('[data-library-entry]').length"), 1);
  await fill(ctx, '[data-canvas-library] input[aria-label=搜索画布]', '');
  await ctx.shot('94-library-dark-suspended');
  await deleteAndThemes(ctx, a, b);
}

async function deleteAndThemes(ctx, a, b) {
  await ctx.click(`[data-library-entry="${a}"]`);
  await projectAction(ctx, '关闭并返回工作区');
  const project = path.join(ctx.root, 'user', 'Infinite Canvas', '画布 B');
  fs.mkdirSync(path.join(project, 'Picture'));
  fs.writeFileSync(path.join(project, 'Picture', 'delete-proof.png'), 'owned media');
  await ctx.click(`[data-library-entry="${b}"]`);
  await projectAction(ctx, '删除画布');
  await ctx.wait("!!document.querySelector('[role=dialog] footer')");
  assert.ok(await ctx.run("document.querySelector('[role=dialog]').textContent.includes('永久删除')"));
  await ctx.shot('99-delete-project-confirmation');
  await textClick(ctx, '[role=dialog] footer', '删除选中项');
  await ctx.wait(`!document.querySelector('[data-library-entry="${b}"]')`);
  assert.equal((await ctx.run("window.electronAPI.canvasLibrary({operation:'list'})")).data.entries.length, 1);
  assert.equal(fs.existsSync(project), false);
  assert.equal(await ctx.run(`!!document.querySelector('[data-canvas-session="${b}"]')`), false);
  ctx.smoke.check('创建分类、批量移动、全选取消、搜索与实际删除工程目录/素材并卸载实例', true);
  await require('./check-canvas-card-resize').changeTheme(ctx, 'light');
  await ctx.shot('95-library-light');
  ctx.win.setSize(960, 720);
  await delay(250);
  await ctx.shot('96-library-narrow');
  assert.equal(await ctx.run("document.querySelector('[data-canvas-library]').scrollWidth<=document.querySelector('[data-canvas-library]').clientWidth"), true);
  await ctx.win.reload();
  await ctx.wait(`!!document.querySelector('[data-library-entry="${a}"]')`);
  await ctx.click(`[data-library-entry="${a}"]`);
  await ctx.wait(`document.querySelector('${VISIBLE} [data-infinite-canvas]')?.dataset.fixedSize==='true'`);
  ctx.smoke.check('深浅主题、窄窗口、整页重新加载后从 SQLite 恢复', true);
  await cleanupDeletedUI(ctx, a);
}

async function cleanupDeletedUI(ctx, a) {
  assert.equal(await ctx.run("[...document.querySelectorAll('[data-canvas-library] header button')].find(e=>e.textContent.includes('清理已删画布资源')).disabled"), true);
  await projectAction(ctx, '关闭并返回工作区');
  const result = await ctx.run("window.electronAPI.canvasLibrary({operation:'create',name:'旧删除残留',folderId:null})");
  assert.equal(result.success, true);
  const client = new (require('../../apps/electron/src/main/storage/sqlite/client').SqliteClient)(path.join(ctx.root, 'user', 'Infinite Canvas', 'library.sqlite'));
  // 只准备前版本软删状态；清理按钮仍经生产 preload 和磁盘删除，不用成功返回值代替目录断言。
  try { await client.request('library', { operation: 'remove', ids: [result.data.id] }); }
  finally { await client.close(); }
  const target = path.join(ctx.root, 'user', 'Infinite Canvas', '旧删除残留');
  assert.equal(fs.existsSync(target), true);
  await textClick(ctx, '[data-canvas-library] header', '清理已删画布资源');
  await ctx.wait("document.querySelector('[data-canvas-library-form]')");
  await textClick(ctx, '[data-canvas-library-form] footer', '取消');
  assert.equal(fs.existsSync(target), true);
  await textClick(ctx, '[data-canvas-library] header', '清理已删画布资源');
  await ctx.shot('100-clean-deleted-confirmation');
  await ctx.click('[data-canvas-library-form] button[type=submit]');
  await ctx.wait("!document.querySelector('[data-canvas-library-form]')");
  assert.equal(fs.existsSync(target), false);
  assert.equal((await ctx.run(`window.electronAPI.canvasLibrary({operation:'load',id:${JSON.stringify(a)}})`)).success, true);
  ctx.smoke.check('旧软删除清理入口、打开实例禁用、取消保留、确认实际删除且正常画布保留', true);
}

async function checkCanvasLibrary(ctx) {
  await ctx.wait("!document.querySelector('[data-canvas-library] [aria-busy=true]')");
  await ctx.shot('90-library-empty');
  const a = await newProject(ctx, '画布 A');
  await sizeControls(ctx);
  const b = await sessions(ctx, a);
  await libraryControls(ctx, a, b);
  await missingLegacyCreate(ctx);
  await require('./check-canvas-library-race-ui').checkCanvasLibraryRace(ctx, { textClick, fill, projectAction, reloadLibrary });
}

async function missingLegacyCreate(ctx) {
  // 仅旧草稿来源是夹具；按钮、IPC、实际数据库和重开均用正式实现，绝不触碰用户工程。
  const { registerHandle } = require('../../apps/electron/src/main/ipc/result');
  const { IPC_CHANNELS } = require('../../apps/electron/src/common/ipc-channels');
  const original = { version: 1, name: '目录已丢失的旧画布', nodes: [], edges: [],
    workspace: { id: '6657d15d-69d0-435c-839d-fc77e5d5afea', folder: 'missing-source' } };
  const library = require('../../apps/electron/src/main/modules/canvas/canvas-library')
    .createCanvasLibrary(path.join(ctx.root, 'missing-legacy-ui'), async () => original);
  registerHandle(IPC_CHANNELS.CANVAS_LIBRARY, (_event, request) => library.request(request),
    args => args.length === 1 && require('../../apps/electron/src/main/modules/canvas/library-validation').request(args[0]) ? null : 'invalid-library-request');
  try {
    await reloadLibrary(ctx);
    await ctx.wait("document.querySelectorAll('[data-library-entry]').length===1");
    const id = await newProject(ctx, '测试新建');
    await ctx.wait("!document.querySelector('[data-canvas-library-form]')");
    await ctx.shot('98-create-after-missing-legacy');
    const reopened = require('../../apps/electron/src/main/modules/canvas/canvas-library').createCanvasLibrary(path.join(ctx.root, 'missing-legacy-ui'));
    assert.equal((await reopened.request({ operation: 'load', id })).name, '测试新建');
    ctx.smoke.check('旧目录缺失时点击应用关闭表单并进入新画布，真实数据库重开保留名称', true);
  } finally {
    require('../../apps/electron/src/main/modules/canvas/canvas-project.handlers').registerCanvasProjectHandlers({ root: path.join(ctx.root, 'user') });
    await reloadLibrary(ctx);
  }
}

async function reloadLibrary(ctx) {
  await ctx.win.reload();
  await ctx.wait("!!document.querySelector('[data-canvas-library]')");
  // 公告异步读取且可能已读；短暂轮询只关闭实际出现的遮挡，不把“已读不弹”当作失败。
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await ctx.run("!!document.querySelector('[aria-labelledby=update-announcement-title]')")) {
      await ctx.click('[aria-labelledby=update-announcement-title] button');
      break;
    }
    await delay(50);
  }
}

module.exports = { checkCanvasLibrary };

/** 静态画布自动输入回归；使用真实文件、IPC和SQLite，系统选择框由CDP代选，不算人工验收。 */
const fs = require('node:fs/promises'), path = require('node:path');
const library = require('./canvas-library-fixture');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = '[data-canvas-menu] [data-assistant-column="0"]';
const child = '[data-canvas-menu] [data-assistant-column="1"]';
const resources = '[data-canvas-resources]';

async function hover(ctx, selector) {
  const point = await ctx.run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  ctx.win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
  await delay(160);
}

async function open(ctx, edge = false) {
  await ctx.run(`document.querySelector('.react-flow__pane').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:${edge ? 'innerWidth-10' : '500'},clientY:${edge ? 'innerHeight-10' : '180'}}))`);
  await ctx.wait(`document.querySelector('${root}')`);
}

async function textClick(ctx, container, text) {
  await ctx.wait(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(container + ' button')})].find(e=>e.textContent.trim()===${JSON.stringify(text)});return e&&!e.disabled})()`);
  await ctx.run(`[...document.querySelectorAll(${JSON.stringify(container + ' button')})].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`);
}

// 比较浏览器实际尺寸与颜色；源码中复用同一类名并不能证明宿主覆盖后仍然一致。
async function geometry(ctx, label) {
  const value = await ctx.run(`(()=>{const columns=[...document.querySelectorAll('[data-canvas-menu] [data-assistant-column]')];return columns.map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height,bg:s.backgroundColor,border:s.borderColor,color:s.color}})})()`);
  ctx.smoke.check(`${label} 两级菜单颜色和高度一致`, value.length === 2 && value[0].bg === value[1].bg && value[0].border === value[1].border && value[0].color === value[1].color && Math.abs(value[0].height - value[1].height) < 1 && Math.abs(value[0].y - value[1].y) < 1);
  ctx.smoke.check(`${label} 两列均在窗口内`, value.every(item => item.x >= 0 && item.y >= 44 && item.right <= 1600 && item.bottom <= 1000));
}

async function menus(ctx) {
  await open(ctx);
  ctx.smoke.check('空白右键直接显示节点菜单，不再经过添加入口', await ctx.run(`!!document.querySelector('[data-canvas-image-category]')&&!document.querySelector('[data-assistant-item=add]')`));
  await hover(ctx, '[data-canvas-image-category]');
  await ctx.wait(`document.querySelector('${child}')`);
  await geometry(ctx, '深色');
  ctx.smoke.check('批量导入中文标签单行完整显示', await ctx.run("[...document.querySelectorAll('[data-assistant-item^=batch-] > span > span:first-child')].every(e=>e.scrollWidth<=e.clientWidth&&getComputedStyle(e).whiteSpace==='nowrap')"));
  await ctx.pointer('[data-canvas-image-category]');
  await hover(ctx, `${child} [data-node-kind=compare]`);
  ctx.smoke.check('悬停展开、点击保留，移入子列仍可操作', await ctx.run(`document.querySelector('[data-canvas-image-category]').getAttribute('aria-expanded')==='true'&&document.querySelectorAll('${child} button').length===2`));
  await ctx.shot('140-add-menu-dark');
  await ctx.key('Escape');
  await open(ctx, true);
  await hover(ctx, '[data-assistant-item=batch-video]');
  await geometry(ctx, '右下边缘');
  ctx.smoke.check('右侧不足时二级菜单向左避让', await ctx.run("document.querySelector('[data-canvas-menu]').dataset.submenuDirection==='left'"));
  await ctx.shot('141-add-menu-edge');
  await ctx.key('Escape');
}

async function chooseSource(ctx, kind, source) {
  await open(ctx);
  await hover(ctx, `[data-assistant-item=batch-${kind}]`);
  await ctx.wait(`document.querySelector('[data-assistant-item=batch-${kind}-${source}]')`);
  await ctx.click(`[data-assistant-item=batch-${kind}-${source}]`);
  if (source !== 'local') await ctx.wait(`(()=>{const e=[...document.querySelectorAll('${resources} button')].find(e=>e.textContent.trim()==='全选');return e&&!e.disabled})()`);
}

// 先从真实样本复制两份，文件名不同；数量断言因此能发现“批量”只接入第一份的问题。
async function fixtures(ctx) {
  const media = [];
  for (const [kind, file] of [['image', 'image.png'], ['video', 'video.mp4']]) {
    for (let index = 1; index <= 2; index++) {
      const target = path.join(ctx.root, `batch-${index}-${file}`);
      await fs.copyFile(path.resolve('scripts/fixtures/video-composition', file), target);
      media.push({ kind, path: target, name: path.basename(target), size: (await fs.stat(target)).size });
    }
  }
  const result = await ctx.run(`window.electronAPI.canvasLibrary(${JSON.stringify({ operation: 'importLibraryResources', files: media })})`);
  if (!result.success) throw Error(result.error);
  return media;
}

async function save(ctx) {
  await ctx.click('.hy-project-header [aria-label="保存画布"]');
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  return library.readCanvas(ctx);
}

async function selection(ctx, kind, count) {
  await ctx.wait(`document.querySelectorAll('${resources} [data-library-card]').length===${count}`);
  ctx.smoke.check(`${kind} 来源只显示对应媒体`, await ctx.run(`!document.querySelector('${resources} [aria-label=全局资源库]')&&document.querySelectorAll('${resources} [data-canvas-resource-selected=true]').length===0`));
  await textClick(ctx, resources, '全选');
  await textClick(ctx, `${resources} footer`, '使用素材');
  await ctx.wait(`!document.querySelector('${resources}')`);
}

async function libraryBatch(ctx, kind) {
  const before = await save(ctx);
  await chooseSource(ctx, kind, 'library');
  await selection(ctx, kind, 2);
  const document = await save(ctx), added = document.nodes.slice(before.nodes.length);
  ctx.smoke.check(`${kind} 全局库批量创建两个独立节点并复制到工程`, added.length === 2 && added.every(node => node.data.media.kind === kind && node.data.media.path.includes(document.workspace.folder)) && document.edges.length === 0);
  for (const node of added) await fs.access(node.data.media.path);
  await ctx.key('z', ['control']);
  await ctx.wait(`document.querySelectorAll('[data-canvas-node]').length===${before.nodes.length}`);
  ctx.smoke.check(`${kind} 整批导入只占一步撤销`, true);
  await ctx.key('y', ['control']);
  await ctx.wait(`document.querySelectorAll('[data-canvas-node]').length===${document.nodes.length}`);
}

async function nodeBatch(ctx, kind) {
  const before = await save(ctx), paths = new Set(before.nodes.filter(node => node.data.media?.kind === kind).map(node => node.data.media.path));
  await chooseSource(ctx, kind, 'nodes');
  await selection(ctx, kind, paths.size);
  const document = await save(ctx), added = document.nodes.slice(before.nodes.length);
  ctx.smoke.check(`${kind} 现有节点资源只复用地址，不复制文件或连线`, added.length === paths.size && added.every(node => paths.has(node.data.media.path)) && document.edges.length === 0 && new Set(document.nodes.map(node => node.id)).size === document.nodes.length);
}

// CDP只代替系统文件框选文件；类型限制、复制/移动确认与节点回填使用产品代码。
async function localBatch(ctx, kind, media) {
  const before = await save(ctx);
  await chooseSource(ctx, kind, 'local');
  ctx.smoke.check(`${kind} 本地入口允许多选且限制类型`, await ctx.run(`(()=>{const e=document.querySelector('[data-canvas-file-input]');return e.multiple&&e.accept.includes('${kind === 'image' ? '.png' : '.mp4'}')&&!e.accept.includes('${kind === 'image' ? '.mp4' : '.png'}')})()`));
  const { root: dom } = await ctx.win.webContents.debugger.sendCommand('DOM.getDocument');
  const { nodeId } = await ctx.win.webContents.debugger.sendCommand('DOM.querySelector', { nodeId: dom.nodeId, selector: '[data-canvas-file-input]' });
  await ctx.win.webContents.debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files: media.filter(item => item.kind === kind).map(item => item.path) });
  if (kind === 'video') {
    await ctx.wait("document.querySelector('[data-canvas-import-choice]')");
    ctx.smoke.check('视频批量导入确认前未创建节点', await ctx.run(`document.querySelectorAll('[data-canvas-node]').length===${before.nodes.length}`));
    await textClick(ctx, '[data-canvas-import-choice]', '复制（默认）');
    await textClick(ctx, '[data-canvas-import-actions]', '应用');
  }
  await ctx.wait(`document.querySelectorAll('[data-canvas-node]').length===${before.nodes.length + 2}`);
  const document = await save(ctx);
  ctx.smoke.check(`${kind} 本地两份素材均已导入工程`, document.nodes.slice(before.nodes.length).every(node => node.data.media.kind === kind && node.data.media.path.includes(document.workspace.folder)));
  for (const item of media) await fs.access(item.path);
}

async function appearance(ctx) {
  await require('./check-minimax-image-edit').changeTheme(ctx, 'light');
  await ctx.wait("!document.documentElement.classList.contains('theme-ripple')");
  await ctx.click('[data-canvas-toolbar] [aria-label="添加节点"]');
  await hover(ctx, '[data-assistant-item=batch-image]');
  await geometry(ctx, '浅色加号入口');
  await ctx.shot('142-add-menu-light');
  await ctx.key('Escape');
  ctx.win.setSize(960, 720);
  await ctx.wait('innerWidth<=960');
  await open(ctx, true);
  await hover(ctx, '[data-assistant-item=batch-image]');
  ctx.smoke.check('窄窗两级菜单完整可见', await ctx.run("[...document.querySelectorAll('[data-canvas-menu] [data-assistant-column]')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=44&&r.bottom<=innerHeight})"));
  await ctx.shot('143-add-menu-light-narrow');
  await ctx.key('Escape');
}

async function checkCanvasAddMenu(ctx) {
  await menus(ctx);
  const media = await fixtures(ctx);
  for (const kind of ['image', 'video']) {
    await libraryBatch(ctx, kind);
    await nodeBatch(ctx, kind);
    await localBatch(ctx, kind, media);
  }
  await ctx.click('[data-canvas-viewport] [aria-label="适配全部"]');
  await ctx.shot('144-batch-image-video-nodes');
  const document = await save(ctx);
  await new Promise(resolve => { ctx.win.webContents.once('did-finish-load', resolve); ctx.win.webContents.reload(); });
  await library.openProject(ctx);
  await ctx.wait(`document.querySelectorAll('[data-canvas-node]').length===${document.nodes.length}`);
  ctx.smoke.check('重开恢复全部批量节点及地址', (await library.readCanvas(ctx)).nodes.length === document.nodes.length);
  await appearance(ctx);
  console.log('CANVAS_ADD_MENU_EVIDENCE', { automaticEvents: true, cdpFileSelection: true, realFilesAndSQLite: true, manual: false, inference: false });
}
module.exports = { checkCanvasAddMenu };

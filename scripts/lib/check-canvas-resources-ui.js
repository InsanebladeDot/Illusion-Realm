/** 正式页面自动事件：生产IPC、真实工程副本与SQLite，不代替人工系统选择框验收。 */
const path = require('node:path');
const fs = require('node:fs/promises');
const fixture = require('./canvas-library-fixture');

async function checkCanvasResources(ctx) {
  const document = await fixture.readCanvas(ctx);
  const entry = { root: path.join(path.dirname(ctx.documentPath), 'user', 'Infinite Canvas') };
  const source = path.resolve('scripts/fixtures/video-composition/image.png');
  const imported = await ctx.run(`window.electronAPI.canvasImportMedia(${JSON.stringify({ name: document.name, workspace: document.workspace, files: [{ kind: 'image', path: source, name: 'managed.png', size: 0 }] })})`);
  if (!imported.success) throw Error('resource-import-failed');
  const media = imported.data.media[0];
  await fs.copyFile(source, path.join(entry.root, document.workspace.folder, 'manual.png'));
  await ctx.click('.hy-canvas-dock button[aria-label="导入本地素材"]');
  await ctx.wait("document.querySelectorAll('[data-canvas-resources] [data-library-card]').length===2");
  ctx.smoke.check('当前工程受管与手放文件分开标记，列表本身不新建节点', await ctx.run("document.querySelector('[data-canvas-resources]').textContent.includes('未知归属')&&document.querySelector('[data-canvas-resources]').textContent.includes('受管')"));
  await ctx.shot('120-project-resources-dark');
  await ctx.click('[data-canvas-resources] [data-library-card] button');
  await ctx.run("[...document.querySelectorAll('[data-canvas-resources] footer button')].find(e=>e.textContent.includes('使用素材')).click()");
  await ctx.wait("!document.querySelector('[data-canvas-resources]')");
  await ctx.wait("document.querySelectorAll('[data-canvas-node] img').length>0");
  ctx.smoke.check('复用工程素材直接创建可解码节点，未复制第二份', (await fs.readdir(path.dirname(media.path))).length === 1);
  await require('./check-minimax-image-edit').changeTheme(ctx, 'light');
  // 外观窗口关闭后再打开素材；DOM click 不会自动聚焦，先模拟按钮获得焦点。
  await ctx.wait("!document.querySelector('[data-theme-dialog]')");
  ctx.win.setSize(960, 720);
  await ctx.wait('innerWidth<=960');
  await ctx.run("document.querySelector('.hy-canvas-dock button[aria-label=\"导入本地素材\"]').focus()");
  await ctx.click('.hy-canvas-dock button[aria-label="导入本地素材"]');
  await ctx.wait("document.querySelectorAll('[data-canvas-resources] [data-library-card]').length===2");
  ctx.smoke.check('素材使用状态单独展示，不再把引用中的文件标成未知归属', await ctx.run("document.querySelector('[data-canvas-resources] [data-library-card]').textContent.includes('画布使用中')"));
  await ctx.shot('121-project-resources-light-narrow');
  ctx.smoke.check('加载时忽略隐藏文件输入，素材窗口保留键盘焦点', await ctx.run("!!document.querySelector('[data-canvas-resources]')?.closest('[role=dialog]')?.contains(document.activeElement)"));
  await ctx.key('Escape');
  ctx.smoke.check('浅色窄窗口可关闭并返回原画布', await ctx.run("!document.querySelector('[data-canvas-resources]')"));
  await deleteAfterClearing(ctx);
}

/** 真实页面先存有图节点，再用 Delete 清空；刻意不点保存，复现旧引用误拦。 */
async function clearSavedNode(ctx) {
  await ctx.click('.hy-project-header [aria-label="保存画布"]');
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  const before = await fixture.readCanvas(ctx);
  const node = before.nodes.find(item => item.data.media);
  if (!node) throw Error('missing-saved-resource-node');
  await ctx.pointer(`[data-canvas-node="${node.id}"] img`);
  await ctx.run("document.querySelector('[data-infinite-canvas]').focus()");
  await ctx.key('Delete');
  await ctx.wait("document.querySelectorAll('[data-canvas-node]').length===0");
  ctx.smoke.check('节点清空仍未另行保存，磁盘保留旧引用以复现问题', (await fixture.readCanvas(ctx)).nodes.length === 1);
  return node.data.media;
}

/** 确认走原删除弹窗和真实系统回收站，随后重载页面检查没有复活的缺图节点。 */
async function deleteAfterClearing(ctx) {
  const media = await clearSavedNode(ctx);
  await ctx.click('.hy-canvas-dock button[aria-label="导入本地素材"]');
  await ctx.wait("document.querySelectorAll('[data-canvas-resources] [data-library-card]').length===2");
  await ctx.run(`[...document.querySelectorAll('[data-canvas-resources] [data-library-card]')].find(card=>card.querySelector('h3').textContent===${JSON.stringify(media.name)}).querySelector('button').click()`);
  await ctx.run("[...document.querySelectorAll('[data-canvas-resources] footer button')].find(e=>e.textContent.trim()==='删除选中项').click()");
  await ctx.wait("document.querySelector('[data-resource-delete-confirm]')");
  await ctx.run("[...document.querySelectorAll('[data-resource-delete-confirm] button')].find(e=>e.textContent.trim()==='确定').click()");
  await ctx.wait("!document.querySelector('[data-resource-delete-confirm]')&&document.querySelectorAll('[data-canvas-resources] [data-library-card]').length===1");
  const remains = await fs.access(media.path).then(() => true, () => false);
  ctx.smoke.check('清空后直接确认删除成功，真实文件消失且空画布已入库', !remains && (await fixture.readCanvas(ctx)).nodes.length === 0);
  await ctx.shot('122-project-resource-cleared-deleted');
  await ctx.win.loadURL('app://app/canvas');
  await fixture.openProject(ctx);
  await ctx.wait("document.querySelector('[data-canvas-save-status]')?.textContent.includes('已保存')");
  ctx.smoke.check('重新打开工程仍为空，没有引用已删文件的节点', await ctx.run("document.querySelectorAll('[data-canvas-node]').length===0"));
}

module.exports = { checkCanvasResources };

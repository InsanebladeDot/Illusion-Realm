/** 正式静态页面+真实IPC/SQLite/媒体；CDP选择文件和自动输入不冒充人工操作或真实模型推理。 */
const fs = require('node:fs/promises');
const path = require('node:path');
const library = require('./canvas-library-fixture');
const { seedPromptNode } = require('./check-canvas-prompt-preview');
const dialog = '[data-canvas-resources]';
const editor = '[data-canvas-node=target] [data-video-prompt]';
const panel = '[data-canvas-node=target] .hy-generation-panel';

async function textButton(ctx, container, text) {
  await ctx.run(`[...document.querySelectorAll(${JSON.stringify(container + ' button')})].find(button=>button.textContent.trim()===${JSON.stringify(text)})?.click()`);
}

/** 补全菜单只在编辑焦点内打开，不能复用会主动失焦的普通表单填值助手。 */
async function mention(ctx, value) {
  await ctx.run(`(()=>{const e=document.querySelector('${editor}');e.focus();e.textContent=${JSON.stringify(value)};const range=document.createRange();range.selectNodeContents(e);range.collapse(false);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}))})()`);
}

/** 只替代系统文件选择步骤，导入后的复制、台账和列表仍由生产代码执行。 */
async function upload(ctx) {
  const files = ['image.png', 'video.mp4', 'audio.wav'].map(file => path.resolve('scripts/fixtures/video-composition', file));
  const { root } = await ctx.win.webContents.debugger.sendCommand('DOM.getDocument');
  const { nodeId } = await ctx.win.webContents.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-global-resource-input]' });
  await ctx.win.webContents.debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files });
  await ctx.wait(`document.querySelectorAll('${dialog} [data-library-card]').length===3`);
  const result = await ctx.run("window.electronAPI.canvasLibrary({operation:'libraryResources'})");
  if (!result.success) throw Error(result.error);
  return result.data.resourceItems;
}

async function bulkSelection(ctx) {
  await textButton(ctx, dialog, '多选');
  await textButton(ctx, dialog, '全选');
  ctx.smoke.check('全选勾选当前列表全部三项', await ctx.run(`document.querySelectorAll('${dialog} [data-canvas-resource-selected=true]').length===3`));
  await ctx.shot('130-global-library-selected-dark');
  await textButton(ctx, dialog, '全选');
  ctx.smoke.check('再次全选取消全部，删除按钮禁用', await ctx.run(`document.querySelectorAll('${dialog} [data-canvas-resource-selected=true]').length===0&&[...document.querySelectorAll('${dialog} footer button')].find(e=>e.textContent.trim()==='删除选中项').disabled`));
  await textButton(ctx, dialog, '取消选择');
}

/** 单项删除走原确认控件；使用真实系统回收站，不以隐藏卡片代替文件删除。 */
async function deleteVideo(ctx, items) {
  await ctx.click(`${dialog} [aria-label="视频"]`);
  await ctx.wait(`document.querySelectorAll('${dialog} [data-library-card]').length===1`);
  await ctx.click(`${dialog} [data-library-card] button`);
  await textButton(ctx, `${dialog} footer`, '删除选中项');
  await ctx.wait("document.querySelector('[data-resource-delete-confirm]')");
  // 先取消，确认文件和选择都保留，再从同一入口执行真实删除。
  ctx.smoke.check('确认期间素材列表不可操作，未确认前文件保留', await ctx.run(`document.querySelector('${dialog}').inert`) && await exists(items.find(item => item.media.kind === 'video').media.path));
  await ctx.key('Escape');
  await ctx.wait("!document.querySelector('[data-resource-delete-confirm]')");
  ctx.smoke.check('Escape只关闭删除确认，保留素材窗口与文件', await ctx.run(`!!document.querySelector('${dialog}')&&!document.querySelector('${dialog}').inert`) && await exists(items.find(item => item.media.kind === 'video').media.path));
  await textButton(ctx, `${dialog} footer`, '删除选中项');
  await ctx.wait("document.querySelector('[data-resource-delete-confirm]')");
  await textButton(ctx, '[data-resource-delete-confirm]', '确定');
  await ctx.wait(`document.querySelectorAll('${dialog} [data-library-card]').length===0`);
  ctx.smoke.check('选中视频真实删除，其余图片和音频留在库内', !(await exists(items.find(item => item.media.kind === 'video').media.path)) && await exists(items.find(item => item.media.kind === 'image').media.path));
  await ctx.key('Escape');
}
const exists = async file => { try { await fs.access(file); return true; } catch { return false; } };

async function chooseGlobal(ctx, kind) {
  await seedPromptNode(ctx, { kind, workflow: kind === 'audio' ? undefined : kind === 'video' ? 'minimax-reference' : 'minimax-image-edit', prompt: '' });
  await mention(ctx, '@');
  await ctx.wait('[...document.querySelectorAll("[data-prompt-media-group]")].length===2');
  await ctx.click('[data-prompt-media-group=library]');
  await ctx.wait('document.querySelector("[data-prompt-media-option]")');
  await ctx.shot(`131-${kind}-global-mention`);
  await ctx.click('[data-prompt-media-option]');
  await ctx.wait(`document.querySelector('${editor}').textContent.includes('${kind === 'audio' ? '@audio1' : '@picture1'}')`);
  await ctx.click('.hy-project-header [aria-label="保存画布"]');
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  const document = await library.readCanvas(ctx);
  const data = document.nodes.find(node => node.id === 'target').data;
  ctx.smoke.check(`${kind}只引用选中资源，不建新节点或连线`, document.nodes.length === 1 && document.edges.length === 0 && (kind === 'audio' ? !!data.audioParameters.reference : data.inputImages.length === 1));
  await ctx.click(`${panel} [data-canvas-parameter=prompt-preview]>button`);
  await ctx.wait(`document.querySelector('${panel} [data-prompt-conversion-text]')`);
  ctx.smoke.check(`${kind}显示文件前缀，预览沿用官方标记`, await ctx.run(`document.querySelector('${panel} [data-prompt-conversion-text]').textContent.trim()==='${kind === 'audio' ? '<Slot 1>' : '<Picture 1>'}'&&!!document.querySelector('${editor} [data-reference-label]')`));
  await ctx.shot(`132-${kind}-direct-reference`);
}

/** 另一个画布节点可以直接引用；分类路径不进入正文，文生图零输入限制仍然生效。 */
async function localAndLimit(ctx, image) {
  const source = { id: 'source', position: { x: 850, y: 150 }, data: { kind: 'image', title: 'Source', content: '', prompt: '', ratio: '1/1', media: image } };
  await seedPromptNode(ctx, { kind: 'image', workflow: 'minimax-image-edit', prompt: '' }, undefined, [source]);
  await mention(ctx, '@/图片/');
  await ctx.wait('document.querySelector("[data-prompt-media-option]")');
  await ctx.click('[data-prompt-media-option]');
  await ctx.wait(`document.querySelector('${editor}').textContent.includes('@picture1')`);
  await ctx.click('.hy-project-header [aria-label="保存画布"]');
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  const document = await library.readCanvas(ctx);
  ctx.smoke.check('画布图片分类直接引用原地址，未创建连线或新节点', document.nodes.length === 2 && document.edges.length === 0 && document.nodes[0].data.inputImages[0].path === image.path);
  await seedPromptNode(ctx, { kind: 'image', workflow: 'sdxl', prompt: '' });
  await mention(ctx, '@/资源库/');
  await ctx.wait('document.querySelector("[data-prompt-media-option]")');
  await ctx.click('[data-prompt-media-option]');
  await ctx.wait(`document.querySelector('${panel} [role=alert]')`);
  ctx.smoke.check('文生图不能通过资源库绕过零图片约束', await ctx.run(`document.querySelector('${editor}').textContent==='@/资源库/'`));
}

async function checkCanvasGlobalResources(ctx) {
  await ctx.click('.hy-canvas-dock button[aria-label="导入本地素材"]');
  await ctx.wait(`document.querySelector('${dialog}')`);
  await ctx.wait(`!document.querySelector('${dialog} [aria-label="全局资源库"]').disabled`);
  await ctx.click(`${dialog} [aria-label="全局资源库"]`);
  await ctx.wait(`document.querySelector('${dialog}').dataset.resourceScope==='library'`);
  const items = await upload(ctx);
  ctx.smoke.check('批量导入三种真实可读取素材，导入不生成节点', (await library.readCanvas(ctx)).nodes.length === 0);
  await bulkSelection(ctx);
  await deleteVideo(ctx, items);
  await chooseGlobal(ctx, 'image');
  await chooseGlobal(ctx, 'video');
  await chooseGlobal(ctx, 'audio');
  await localAndLimit(ctx, items.find(item => item.media.kind === 'image').media);
  await require('./check-minimax-image-edit').changeTheme(ctx, 'light');
  ctx.win.setSize(960, 820);
  await ctx.wait("innerWidth===960&&!document.documentElement.classList.contains('theme-ripple')");
  await ctx.click('.hy-canvas-dock button[aria-label="导入本地素材"]');
  await ctx.wait(`document.querySelector('${dialog}')`);
  await ctx.wait(`!document.querySelector('${dialog} [aria-label="全局资源库"]').disabled`);
  await ctx.click(`${dialog} [aria-label="全局资源库"]`);
  await ctx.wait(`document.querySelector('${dialog}').dataset.resourceScope==='library'`);
  await ctx.wait(`document.querySelectorAll('${dialog} [data-library-card]').length===2`);
  await ctx.shot('133-global-library-light-narrow');
  ctx.smoke.check('浅色窄窗保留同一全局库，关闭恢复原编辑器', await ctx.run(`document.querySelector('${dialog}').getBoundingClientRect().right<=innerWidth`));
  await ctx.key('Escape');
  console.log('GLOBAL_RESOURCES_EVIDENCE', { automaticEvents: true, nativePickerManual: false, realInference: false, realSQLiteAndFiles: true });
}
module.exports = { checkCanvasGlobalResources };

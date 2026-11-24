/** 真实文件和生产资源列表回归；不请求模型，不使用用户素材。 */
const path = require('node:path');
const library = require('./canvas-library-fixture');
const dialog = '[data-canvas-resources]';

async function checkCover(ctx, scope) {
  const selector = `${dialog} [data-video-cover]`;
  await ctx.wait(`document.querySelector('${selector} img')?.naturalWidth>0`);
  // 不是影片图标或隐藏播放器：等待真实解码的小图，选择后封面仍保留。
  ctx.smoke.check(`${scope}视频封面真实解码，列表不保留播放器`, await ctx.run(`(()=>{const c=document.querySelector('${selector}'),i=c.querySelector('img');return i.src.startsWith('data:image/jpeg')&&i.naturalWidth<=192&&!c.querySelector('video')})()`));
  await ctx.click(`${dialog} [data-library-card] button`);
  ctx.smoke.check(`${scope}选择资源后保留首帧封面`, await ctx.run(`document.querySelector('${selector} img').naturalWidth>0&&document.querySelector('${dialog} [data-canvas-resource-selected=true]')!==null`));
  await ctx.shot(`140-video-cover-${scope}`);
}

async function openResources(ctx, scope) {
  await ctx.click('.hy-canvas-dock button[aria-label="导入本地素材"]');
  await ctx.wait(`document.querySelector('${dialog}')`);
  const label = scope === 'library' ? '全局资源库' : '工程素材';
  // 当前页默认工程素材；切到全局时等待工具条结束读取再操作。
  if (scope === 'library') {
    await ctx.wait(`!document.querySelector('${dialog} [aria-label="${label}"]').disabled`);
    await ctx.click(`${dialog} [aria-label="${label}"]`);
  }
  await ctx.wait(`document.querySelector('${dialog}').dataset.resourceScope==='${scope}'`);
  await checkCover(ctx, scope);
  await ctx.key('Escape');
  await ctx.wait(`!document.querySelector('${dialog}')`);
}

async function checkVideoResourceCovers(ctx) {
  const document = library.readCanvas(ctx);
  const media = { kind: 'video', path: path.resolve('scripts/fixtures/video-composition/video.mp4'), name: 'video.mp4', size: 0 };
  const imported = await ctx.run(`window.electronAPI.canvasImportMedia(${JSON.stringify({ name: document.name, workspace: document.workspace, files: [media] })})`);
  if (!imported.success) throw Error(imported.error);
  const global = await ctx.run(`window.electronAPI.canvasLibrary(${JSON.stringify({ operation: 'importLibraryResources', files: [media] })})`);
  if (!global.success) throw Error(global.error);
  // 同一公共卡片覆盖两种来源；关闭重开还需重新读出封面，不能依赖遗留DOM。
  await openResources(ctx, 'project');
  await openResources(ctx, 'library');
  await openResources(ctx, 'project');
}

module.exports = { checkVideoResourceCovers };

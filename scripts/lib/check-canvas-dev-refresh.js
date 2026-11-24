/** 仅开发专项临时改一条局部样式，复现“热更新后刷新”；finally 按原字节恢复。 */
const fs = require('node:fs');
const path = require('node:path');
const library = require('./canvas-library-fixture');

async function checkCanvasDevRefresh(ctx) {
  if (process.env.CANVAS_SMOKE_DEV !== '1') throw Error('hmr-regression-requires-development-server');
  const file = path.resolve('apps/next/src/view/infinite-canvas/canvas.module.css');
  const baseline = fs.readFileSync(file);
  const candidate = Buffer.concat([baseline, Buffer.from('\n.workspace { --canvas-hmr-check: 1; }\n')]);
  try {
    fs.writeFileSync(file, candidate);
    await ctx.wait("getComputedStyle(document.querySelector('[data-infinite-canvas]')).getPropertyValue('--canvas-hmr-check').trim()==='1'");
    await new Promise(resolve => { ctx.win.webContents.once('did-finish-load', resolve); ctx.win.webContents.reload(); });
    await library.openProject(ctx);
    await ctx.wait("!!document.querySelector('[data-canvas-node=video] video')");
    ctx.smoke.check('开发样式热更新后刷新，工程和视频仍恢复', true);
  } finally {
    // 像借用桌面后原样放回：仅撤销测试自己的字节，遇到其他改动时保留现场。
    if (!fs.readFileSync(file).equals(candidate)) throw Error('concurrent-css-edit-preserved: restore-test-marker-manually');
    fs.writeFileSync(file, baseline);
  }
  await ctx.wait("getComputedStyle(document.querySelector('[data-infinite-canvas]')).getPropertyValue('--canvas-hmr-check').trim()===''");
  await ctx.wait("getComputedStyle(document.querySelector('.react-flow__node')).position==='absolute'");
  ctx.smoke.check('热更新与刷新后保留图引擎定位样式', true);
}

module.exports = { checkCanvasDevRefresh };

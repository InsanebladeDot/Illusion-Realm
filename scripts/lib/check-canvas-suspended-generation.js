/** 挂起期间继续走生产生成与保存；HTTP 夹具提供固定像素，不证明真实模型推理。 */
const assert = require('node:assert/strict');
const { readCanvas } = require('./canvas-library-fixture');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForSavedResult(ctx, oldPath) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    const saved = readCanvas(ctx);
    if (saved.nodes[0].data.media.path !== oldPath) return saved;
    await delay(100);
  }
  throw Error('suspended-generation-not-saved');
}

async function waitForHeldRequest(state) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (state.requests.some(request => request.held && !request.cancelled)) return;
    await delay(50);
  }
  throw Error('generation-not-accepted');
}

async function checkSuspendedGeneration(ctx, state) {
  await ctx.pointer('[data-kind=image] img');
  await ctx.click('[data-kind=image][data-selected=true] [data-canvas-batch] > button');
  await ctx.click('[data-canvas-batch] button[aria-label="×1"]');
  const before = readCanvas(ctx).nodes[0].data.media.path;
  state.mode = 'hold';
  await ctx.click('[data-kind=image][data-selected=true] .hy-submit');
  await ctx.wait("!!document.querySelector('[data-infinite-canvas] [data-canvas-node-loading] button')");
  await waitForHeldRequest(state);
  await ctx.click('[data-canvas-project-menu]');
  await ctx.run("[...document.querySelectorAll('[role=menu] button')].find(e=>e.textContent.trim()==='挂起并返回工作区').click()");
  await ctx.wait("!document.querySelector('[data-canvas-library]').hidden");
  // 像让柜台暂存未取的订单：只放行服务端结果，产品自己接收、写文件并保存隐藏工程。
  state.mode = 'normal';
  state.requests.filter(request => request.held && !request.cancelled).forEach(request => { request.held = false; });
  const saved = await waitForSavedResult(ctx, before);
  assert.equal(saved.nodes.length, 6);
  await ctx.click('[data-app-nav] [data-suspended-canvases] button');
  await ctx.wait("!!document.querySelector('[data-canvas-session]:not([hidden]) [data-infinite-canvas]')");
  assert.equal(await ctx.run("document.querySelectorAll('[data-canvas-session]:not([hidden]) [data-canvas-media=image][data-media-status=ready]').length"), 6);
  await ctx.shot('97-generation-resumed-http-fixture');
  ctx.smoke.check('挂起期间 HTTP 生成完成、真实 PNG 回填与 SQLite 保存，切回保留六个节点', true);
}

module.exports = { checkSuspendedGeneration };

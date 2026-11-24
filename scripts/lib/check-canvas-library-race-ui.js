/** 连点与删后同名重建：自动事件走正式页面/IPC/磁盘；仅延迟和列表失败由隔离夹具注入。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCanvasLibrary } = require('../../apps/electron/src/main/modules/canvas/canvas-library');
const VISIBLE = '[data-canvas-session]:not([hidden])';

async function rapidCreate(ctx, helpers, counts) {
  await helpers.textClick(ctx, '[data-canvas-library] header', '新建画布');
  await ctx.wait("!!document.querySelector('[data-canvas-library-form] input')");
  await helpers.fill(ctx, '[data-canvas-library-form] input', '测试');
  // 同一轮事件中提交十次，专门覆盖 React 尚未来得及禁用按钮的间隙。
  await ctx.run("(()=>{const form=document.querySelector('[data-canvas-library-form]');for(let i=0;i<10;i++)form.requestSubmit()})()");
  await ctx.wait(`document.querySelector('${VISIBLE} [data-canvas-save-status]')?.textContent.includes('已保存')`);
  assert.equal(await ctx.run("!!document.querySelector('[data-canvas-library-form]')"), false);
  assert.equal(counts.create, 1);
  assert.equal(counts.failedList, 0, '创建回执之后不应再靠刷新列表判断创建是否成功');
  return ctx.run(`document.querySelector('${VISIBLE}').dataset.canvasSession`);
}

async function deleteCurrent(ctx, helpers, counts, library, id) {
  const target = path.join(library.root, '测试');
  assert.equal(fs.existsSync(target), true);
  await helpers.projectAction(ctx, '删除画布');
  await ctx.wait("!!document.querySelector('[role=dialog] footer')");
  // 删除服务刻意慢于界面渲染，确认等待期间不会重复发出删除请求。
  await ctx.run("(()=>{const button=[...document.querySelectorAll('[role=dialog] footer button')].find(e=>e.textContent.trim()==='删除选中项');for(let i=0;i<10;i++)button.click()})()");
  await ctx.wait(`!document.querySelector('[data-canvas-session="${id}"]')`);
  await ctx.wait("!document.querySelector('[data-canvas-library] [aria-busy=true]')");
  assert.equal(counts.remove, 1);
  assert.equal(fs.existsSync(target), false);
  assert.equal((await library.request({ operation: 'list' })).entries.length, 0);
}

function install(library, counts) {
  const { registerHandle } = require('../../apps/electron/src/main/ipc/result');
  const { IPC_CHANNELS } = require('../../apps/electron/src/common/ipc-channels');
  registerHandle(IPC_CHANNELS.CANVAS_LIBRARY, async (_event, request) => {
    if (request.operation === 'create' || request.operation === 'remove') {
      counts[request.operation]++;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (request.operation === 'list' && counts.failList) {
      counts.failedList++;
      throw Error('intentional-post-create-list-failure');
    }
    return library.request(request);
  }, args => args.length === 1 && require('../../apps/electron/src/main/modules/canvas/library-validation').request(args[0]) ? null : 'invalid-library-request');
}

async function checkCanvasLibraryRace(ctx, helpers) {
  const library = createCanvasLibrary(path.join(ctx.root, 'race-ui'));
  const counts = { create: 0, remove: 0, failList: false, failedList: 0 };
  install(library, counts);
  try {
    await helpers.reloadLibrary(ctx);
    for (let round = 0; round < 2; round++) {
      await ctx.wait("!document.querySelector('[data-canvas-library] [aria-busy=true]')");
      Object.assign(counts, { create: 0, remove: 0, failList: true, failedList: 0 });
      const id = await rapidCreate(ctx, helpers, counts);
      assert.equal((await library.request({ operation: 'list' })).entries.length, 1);
      await ctx.shot(`101-create-race-${round}`);
      counts.failList = false;
      await deleteCurrent(ctx, helpers, counts, library, id);
    }
    await ctx.shot('102-delete-recreate-complete');
    ctx.smoke.check('十连提交只创建一次，创建后列表故障不误报；画布内删除/同名重建两轮实际释放目录', true);
  } finally {
    require('../../apps/electron/src/main/modules/canvas/canvas-project.handlers').registerCanvasProjectHandlers({ root: path.join(ctx.root, 'user') });
    await helpers.reloadLibrary(ctx);
  }
}

module.exports = { checkCanvasLibraryRace };

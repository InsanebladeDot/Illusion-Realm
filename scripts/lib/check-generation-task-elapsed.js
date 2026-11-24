/** 复用画布的真实队列和HTTP等待任务，检查卡片计时；不运行GPU或读写用户工程。 */
const assert = require("node:assert/strict");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const ACTIVE = "#generation-active-panel [data-generation-task-status=generating] [data-generation-elapsed]";

async function seconds(ctx, selector) {
  const text = await ctx.run(`document.querySelector(${JSON.stringify(selector)})?.textContent`);
  return Number(/\d+(?:\.\d+)?/.exec(text ?? "")?.[0]);
}

async function checkRunningElapsed(ctx) {
  await ctx.click("[data-window-generation]");
  await ctx.wait(`!!document.querySelector('${ACTIVE}')`);
  const before = await seconds(ctx, ACTIVE);
  await ctx.wait(`Number(document.querySelector('${ACTIVE}').textContent.match(/[0-9]+(?:[.][0-9]+)?/)[0])>${before}`);
  assert.equal(await ctx.run("!!document.querySelector('#generation-active-panel [data-generation-task-status=queued] [data-generation-elapsed]')"), false);
  await ctx.shot("task-elapsed-running");
  await ctx.click("[data-window-generation]");
  // 关闭卡片再打开：真实任务继续执行，重建显示组件不能把计时归零。
  await delay(1200);
  await ctx.click("[data-window-generation]");
  assert.ok(await seconds(ctx, ACTIVE) > before);
  await ctx.shot("task-elapsed-reopened");
  await ctx.click("[data-window-generation]");
  ctx.smoke.check("运行卡片每秒更新耗时，排队不计时，关闭重开不归零", true);
}

async function checkFinishedElapsed(ctx) {
  await ctx.click("[data-window-generation]");
  await ctx.click("[data-generation-tab=history]");
  await ctx.wait("document.querySelector('#generation-history-panel [data-generation-task-status=completed] [data-generation-elapsed]')&&document.querySelector('#generation-history-panel [data-generation-task-status=cancelled] [data-generation-elapsed]')");
  const read = "[...document.querySelectorAll('#generation-history-panel [data-generation-elapsed]')].map(e=>e.textContent)";
  const before = await ctx.run(read);
  // 服务端固定 28.70 秒与本地实际等待明显不同，可抓住仍使用本地时钟的回归。
  const serverTimes = await ctx.run("[...document.querySelectorAll('#generation-history-panel [data-generation-timing-source=comfy]')].map(e=>e.textContent)");
  assert.equal(serverTimes.length, 2);
  assert.ok(serverTimes.every(text => text.includes("28.70")));
  assert.ok(await ctx.run("!!document.querySelector('#generation-history-panel [data-generation-task-status=cancelled] [data-generation-timing-source=local]')"));
  await delay(1200);
  assert.deepEqual(await ctx.run(read), before);
  assert.ok(await ctx.run("!!document.querySelector('#generation-history-panel [data-generation-task-status=cancelled] [data-generation-elapsed]')"));
  await ctx.shot("task-elapsed-finished");
  await ctx.click("[data-window-generation]");
  ctx.smoke.check("完成和取消后保留固定耗时，不继续增长", true);
}

module.exports = { checkRunningElapsed, checkFinishedElapsed };

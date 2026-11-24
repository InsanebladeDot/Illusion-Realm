/** 正式静态页面回归；HTTP只替代推理服务，实际IPC、队列、工程和媒体解码仍运行。 */
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const library = require("./canvas-library-fixture");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const node = (id) => `[data-canvas-node="${id}"]`;
async function select(ctx, id) {
  // 上一张卡的展开表单可能盖住下一张标题，先用用户可见的收起按钮结束编辑。
  await ctx.run(
    `document.querySelectorAll('[data-canvas-node]:not([data-canvas-node="${id}"]) > button[aria-expanded=true]').forEach(e=>e.click())`,
  );
  await ctx.pointer(`${node(id)} header>svg`);
  await ctx.run(
    `document.querySelector('${node(id)} > button[aria-expanded=false]')?.click()`,
  );
  await ctx.wait(
    `!!document.querySelector('${node(id)} [data-generation-panel-frame]')`,
  );
}
async function save(ctx) {
  await ctx.run("document.querySelector('[data-infinite-canvas]').focus()");
  await ctx.key("s", ["control"]);
  try {
    await ctx.wait(
      "document.querySelector('[data-canvas-save-status]')?.textContent.includes('已保存')",
    );
  } catch (error) {
    console.error(
      "TASK_SAVE_STATE",
      await ctx.run(
        "({focus:document.activeElement?.outerHTML.slice(0,500),status:document.querySelector('[data-canvas-save-status]')?.textContent,dialogs:[...document.querySelectorAll('[role=dialog]')].map(e=>e.getAttribute('aria-label'))})",
      ),
    );
    throw error;
  }
  return library.readCanvas(ctx);
}
async function checkModalAndKeyboard(ctx, state) {
  await select(ctx, "video-job");
  await ctx.click(`${node("video-job")} [data-assistant-options]`);
  await ctx.click("[data-assistant-item=history]");
  await ctx.wait(
    "!!document.querySelector('[data-resource-dialog=prompt-assistant-history]')",
  );
  await ctx.run(
    "document.querySelector('[data-resource-dialog=prompt-assistant-history]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:400,clientY:250}))",
  );
  assert.equal(await ctx.run("!!document.querySelector('[role=menu]')"), false);
  await ctx.shot("task-01-modal-context-isolated");
  await ctx.key("Escape");
  await ctx.wait(
    "!document.querySelector('[data-resource-dialog=prompt-assistant-history]')",
  );
  await select(ctx, "video-job");
  const prompt = `${node("video-job")} [contenteditable=true]`;
  await ctx.run(`document.querySelector('${prompt}').focus()`);
  const before = state.requests.length;
  await ctx.key("Return", ["shift"]);
  assert.equal(state.requests.length, before);
  assert.ok(
    await ctx.run(
      `document.querySelector('${prompt}').textContent.includes(${JSON.stringify("\n")})`,
    ),
  );
  ctx.smoke.check("弹窗右键不穿透；Shift+Enter换行且不发请求", true);
}
async function checkImageFit(ctx) {
  await ctx.pointer(`${node("fit-image")} header>svg`);
  await ctx.run(
    `Array.from(document.querySelectorAll('${node("fit-image")} button')).find(e=>e.textContent.trim()==='适应').click()`,
  );
  let document = await save(ctx);
  const fitted = document.nodes.find((item) => item.id === "fit-image").data
    .card;
  assert.equal(fitted.style, "fit");
  assert.ok(Math.abs(fitted.width / fitted.height - 180 / 320) < 0.01);
  await ctx.shot("task-03-image-fit");
}
async function checkFitLocks(ctx) {
  await ctx.run(
    `document.querySelector('${node("fit-image")}').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:300,clientY:300}))`,
  );
  await ctx.click('[role=menu] [data-assistant-item="lock-size"]');
  await assertFitDisabled(ctx, true);
  await ctx.run(
    `document.querySelector('${node("fit-image")}').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:300,clientY:300}))`,
  );
  await ctx.click('[role=menu] [data-assistant-item="lock-size"]');
  await assertFitDisabled(ctx, false);
  await ctx.click('button[aria-label="画布设置"]');
  await ctx.run(
    "[...document.querySelectorAll('.hy-settings nav button')].find(e=>e.textContent==='节点与布局').click()",
  );
  await ctx.click('[aria-label="固定所有组件尺寸"]');
  await ctx.click('button[aria-label="关闭画布设置"]');
  await assertFitDisabled(ctx, true);
  await ctx.click('button[aria-label="画布设置"]');
  await ctx.run(
    "[...document.querySelectorAll('.hy-settings nav button')].find(e=>e.textContent==='节点与布局').click()",
  );
  await ctx.click('[aria-label="固定所有组件尺寸"]');
  await ctx.click('button[aria-label="关闭画布设置"]');
  await assertFitDisabled(ctx, false);
  ctx.smoke.check("单节点和全局尺寸锁都禁用适应，解除后恢复", true);
}
async function assertFitDisabled(ctx, expected) {
  await ctx.pointer(`${node("fit-image")} header>svg`);
  assert.equal(
    await ctx.run(
      `Array.from(document.querySelectorAll('${node("fit-image")} button')).find(e=>e.textContent.trim()==='适应').disabled`,
    ),
    expected,
  );
}
async function checkFitReopen(ctx) {
  const before = await save(ctx);
  await ctx.win.reload();
  await library.openProject(ctx);
  await ctx.wait(
    `document.querySelector('${node("fit-image")} img')?.naturalWidth>0`,
  );
  const after = library.readCanvas(ctx);
  for (const id of ["fit-image", "video-job"]) {
    assert.deepEqual(
      after.nodes.find((n) => n.id === id).data.card,
      before.nodes.find((n) => n.id === id).data.card,
    );
  }
  await ctx.shot("task-03-fit-reopened");
  ctx.smoke.check("图片和视频适应尺寸经过SQLite保存、页面重开仍保留", true);
}
async function checkTextBackspace(ctx) {
  await select(ctx, "job-b");
  await ctx.run(
    `(()=>{const e=document.querySelector('${node("job-b")} [contenteditable=true]');e.focus();getSelection().selectAllChildren(e)})()`,
  );
  ctx.win.webContents.insertText("keepX");
  await ctx.key("Backspace");
  await ctx.wait(
    `document.querySelector('${node("job-b")} [contenteditable=true]')?.textContent==='keep'`,
  );
  assert.ok(await ctx.run(`!!document.querySelector('${node("job-b")}')`));
  ctx.smoke.check("输入中Backspace只删文字，不误删节点", true);
}
async function checkNodeBackspace(ctx) {
  await ctx.run("document.querySelector('[data-infinite-canvas]').focus()");
  await ctx.key("Backspace");
  await ctx.wait(`!document.querySelector('${node("job-b")}')`);
  ctx.smoke.check("离开输入区后Backspace能删除选中图片节点", true);
}
async function checkVideoGeneration(ctx, state) {
  await select(ctx, "video-job");
  await ctx.click(`${node("video-job")} .hy-submit`);
  await ctx.wait(
    `document.querySelector('${node("video-job")} video')?.videoWidth>0`,
  );
  checkVideoRequest(state);
  await checkVideoFit(ctx);
}
function checkVideoRequest(state) {
  const request = state.requests.find((item) =>
    Object.values(item.prompt).some(
      (value) => value.class_type === "MiniMaxH3ReferenceToVideo",
    ),
  );
  assert.ok(request);
  const graph = Object.values(request.prompt),
    video = graph.find(
      (item) => item.class_type === "MiniMaxH3ReferenceToVideo",
    );
  assert.equal(video.inputs.width, 384);
  assert.equal(video.inputs.height, 544);
  assert.equal(
    graph.find((item) => item.class_type === "CreateVideo").inputs.fps,
    20,
  );
  assert.match(video.inputs.prompt, /<Picture 1>/);
}
async function checkVideoFit(ctx) {
  await ctx.run(
    `Array.from(document.querySelectorAll('${node("video-job")} button')).find(e=>e.textContent.trim()==='适应').click()`,
  );
  const document = await save(ctx);
  const output = document.nodes.find((item) => item.id === "video-job").data;
  assert.equal(output.media.kind, "video");
  assert.equal(output.card.style, "fit");
  assert.ok(fs.existsSync(output.media.path));
  assert.equal(path.basename(path.dirname(output.media.path)), "video");
  await ctx.shot("task-06-video-generated-fit");
  ctx.smoke.check(
    "图片/视频适应保存；节点参数进入真实请求，视频工程内落盘并回填",
    true,
  );
}
async function queueIndependent(ctx, state) {
  state.mode = "hold";
  await select(ctx, "job-a");
  await ctx.click(`${node("job-a")} .hy-submit`);
  await ctx.wait(
    `!!document.querySelector('${node("job-a")} [data-canvas-node-loading]')`,
  );
  await select(ctx, "job-b");
  const prompt = `${node("job-b")} [contenteditable=true]`;
  assert.equal(
    await ctx.run(`document.querySelector('${prompt}').isContentEditable`),
    true,
  );
  await ctx.run(
    `(()=>{const e=document.querySelector('${prompt}');e.focus();getSelection().selectAllChildren(e)})()`,
  );
  ctx.win.webContents.insertText("independent queued request");
  await delay(100);
  await ctx.click(`${node("job-b")} .hy-submit`);
  await ctx.wait(
    `!!document.querySelector('${node("job-b")} [data-canvas-node-loading]')`,
  );
  assert.equal(
    state.requests.filter((item) => !item.cancelled && item.held).length,
    1,
  );
  await ctx.shot("task-05-two-nodes-independent");
}
async function deleteRunningNode(ctx, state) {
  state.mode = "normal";
  await ctx.run(
    `document.querySelector('${node("job-a")}').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:300,clientY:300}))`,
  );
  await ctx.key("Escape");
  await ctx.run("document.querySelector('[data-infinite-canvas]').focus()");
  await ctx.key("Delete");
  await ctx.wait(`!document.querySelector('${node("job-a")}')`);
  await ctx.wait(
    `document.querySelector('${node("job-b")} img')?.naturalWidth>0`,
  );
  await checkIndependentResult(ctx, state);
}
async function checkIndependentResult(ctx, state) {
  assert.ok(
    state.requests.some((item) =>
      Object.values(item.prompt).some(
        (value) => value.inputs.text === "independent queued request",
      ),
    ),
  );
  const document = await save(ctx);
  assert.equal(
    document.nodes.some((item) => item.id === "job-a"),
    false,
  );
  assert.ok(document.nodes.find((item) => item.id === "job-b").data.media);
  ctx.smoke.check(
    "生成中其他节点可输入/排队；Delete取消目标且迟到结果不复活",
    true,
  );
}
/** 两种节点都点击同一个创作页按钮；旁车来自磁盘，不能用固定按钮文案自证接通。 */
async function checkTriggers(ctx) {
  for (const id of ["video-job", "job-b"]) {
    await select(ctx, id);
    const button = `${node(id)} [data-apply-lora-triggers]`;
    await ctx.wait(`!!document.querySelector('${button}')`);
    await ctx.click(button);
    assert.ok(
      await ctx.run(
        `document.querySelector('${node(id)} [contenteditable=true]').textContent.includes('task_trigger')`,
      ),
    );
  }
  const document = await save(ctx);
  assert.ok(
    !document.nodes
      .find((item) => item.id === "job-a")
      .data.prompt.includes("task_trigger"),
  );
  ctx.smoke.check(
    "图片显式LoRA、视频模板LoRA复用触发词按钮，正文互不串值",
    true,
  );
}
/** 用真实任务卡验证两种媒体的计时，避免依赖无关的文字编辑操作。 */
async function checkTaskTiming(ctx, state) {
  const timing = require("./check-generation-task-elapsed");
  await checkVideoGeneration(ctx, state);
  state.mode = "hold";
  await select(ctx, "job-a");
  await ctx.click(`${node("job-a")} .hy-submit`);
  await ctx.wait(`!!document.querySelector('${node("job-a")} [data-canvas-node-loading]')`);
  await timing.checkRunningElapsed(ctx);
  await ctx.click("[data-window-generation]");
  await ctx.click("#generation-active-panel [data-generation-task-status=generating] [data-generation-cancel]");
  await ctx.wait(`!document.querySelector('${node("job-a")} [data-canvas-node-loading]')`);
  await ctx.click("[data-window-generation]");
  state.mode = "normal";
  await select(ctx, "job-b");
  await ctx.click(`${node("job-b")} .hy-submit`);
  await ctx.wait(`document.querySelector('${node("job-b")} img')?.naturalWidth>0`);
  await timing.checkFinishedElapsed(ctx);
}
async function checkCanvasTasks(ctx, state) {
  if (process.env.TASK_ELAPSED_SMOKE === "1") return checkTaskTiming(ctx, state);
  await checkModalAndKeyboard(ctx, state);
  await checkTriggers(ctx);
  await checkFitLocks(ctx);
  await checkImageFit(ctx);
  await checkVideoGeneration(ctx, state);
  await checkFitReopen(ctx);
  await checkTextBackspace(ctx);
  await queueIndependent(ctx, state);
  await deleteRunningNode(ctx, state);
  // 返回后的节点仍能右键，反证不是粗暴禁用所有菜单。
  await ctx.run(
    `document.querySelector('${node("job-b")}').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:500,clientY:300}))`,
  );
  await ctx.wait("!!document.querySelector('[role=menu]')");
  await ctx.key("Escape");
  ctx.smoke.check("关闭弹窗后画布右键菜单仍可用", true);
  await checkNodeBackspace(ctx);
}
module.exports = { checkCanvasTasks };

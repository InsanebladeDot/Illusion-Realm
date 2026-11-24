/** 缺模型时按钮真实禁用；在隔离目录补齐占位文件并扫描，只验证解锁机制，不运行推理。 */
const assert = require("node:assert/strict");
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../../packages/shared/src/data/setup-downloads.json');

/** 只在清单目标目录放占位文件；可以独立改某一项路径，验证不会按同名文件误解锁。 */
function placeMossFiles(root, suffix = '') {
  for (const asset of catalog.files.filter(file => file.id.startsWith('moss-'))) {
    const relative = suffix ? `${asset.relativePath.split('/')[0]}/${suffix}/${asset.fileName}` : asset.relativePath;
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'Moss model fixture');
  }
}

async function chooseMoss(ctx, blocked) {
  await ctx.click('[data-model-series] button[aria-haspopup=listbox]');
  const option = '[data-model-series-option=moss]';
  assert.equal(await ctx.run(`document.querySelector('${option}').getAttribute('aria-disabled')`), String(blocked));
  await ctx.click(option);
}

async function checkMossSetup(ctx) {
  await chooseMoss(ctx, true);
  await ctx.wait("document.querySelector('[data-image-model-tip]').textContent.includes('Moss')");
  await ctx.click('[data-image-model-tip] [data-open-model-checklist]');
  await ctx.wait("document.querySelector('[data-setup-group=moss][aria-pressed=true]')");
  await ctx.click('#window-setup-checklist header button:last-child');
  placeMossFiles(ctx.modelRoot, 'User_Moss');
  await chooseMoss(ctx, true);
  await ctx.click('[data-image-model-tip] [data-refresh-model-readiness]');
  await ctx.wait("document.querySelector('[data-image-model-issue=missing]')");
  await ctx.click('[data-image-model-configure]');
  for (const kind of ['unet_name', 'clip_name', 'vae_name']) {
    await ctx.click(`[data-image-model-slot=${kind}]`);
    await ctx.run("[...document.querySelectorAll('[data-simple-select-option]')].find(option=>option.textContent.includes('User_Moss')).click()");
  }
  await ctx.wait("!document.querySelector('[data-image-model-tip]')");
  await chooseMoss(ctx, false);
  await ctx.wait("document.querySelector('[data-image-model-verification=pending]') && !document.querySelector('[data-create-rail-scroll]').inert");
  await ctx.shot('moss-models-ready');
  ctx.smoke.check('Moss stays grey for misplaced files and unlocks after explicit relative model selections', true);
}


async function checkSubmittedModelPaths(ctx) {
  await ctx.run("document.getElementById('prompt-editor').textContent = 'Moss model path check'");
  await ctx.click('[data-generate-button]');
  // 等待队列走到提交边界，服务收到的三种加载路径都应保留用户的相对子目录。
  const deadline = Date.now() + 5000;
  while (!ctx.receivedPrompts.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(ctx.receivedPrompts.length, 1);
  const nodes = Object.values(ctx.receivedPrompts[0]);
  for (const asset of catalog.files.filter(file => file.id.startsWith('moss-'))) {
    const node = nodes.find(value => typeof value.inputs[asset.input] === 'string');
    assert.equal(node?.inputs[asset.input]?.replaceAll('\\', '/'), `User_Moss/${asset.fileName}`);
  }
  ctx.smoke.check('Moss submits all three selected model paths relative to their loader roots', true);
}

async function checkSavedMossSelection(ctx) {
  await ctx.wait("document.querySelector('[data-image-model-verification=verified]')");
  // 等持久化写入之后再离开页面，检查恢复来自序列化文档。
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline && !Object.values(ctx.readCreateForm()?.imageModelChecks ?? {}).includes('verified')) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(Object.values(ctx.readCreateForm()?.imageModelChecks ?? {}).includes('verified'));
  await ctx.load('/tools');
  await ctx.load('/create');
  await ctx.wait("document.querySelector('[data-image-model-verification=verified]') && !document.querySelector('[data-generate-button]').disabled");
  ctx.smoke.check('Custom Moss and its verified result survive loading from persisted user data', true);
}

async function checkMossRuntimeFailures(ctx) {
  // 普通故障发生在已通过的组合，不能把该组合改成不支持。
  await attemptMoss(ctx, 'COMFY_EXECUTION_FAILED');
  await ctx.wait("document.querySelector('[data-image-model-verification=verified]')");
  await attemptMoss(ctx, 'COMFY_UNET_LOAD_FAILED');
  await ctx.wait("document.querySelector('[data-image-model-verification=unsupported]') && document.body.textContent.includes('ComfyUI 无法加载所选主模型')");
  const model = catalog.files.find(file => file.id.startsWith('moss-') && file.input === 'unet_name');
  fs.appendFileSync(path.join(ctx.modelRoot, 'diffusion_models', 'User_Moss', model.fileName), 'new revision');
  // 使用实际扫描刷新，文件名没变，权重版本变化仍要恢复为待验证。
  await ctx.load('/create');
  await ctx.wait("document.querySelector('[data-image-model-verification=pending]') && !document.querySelector('[data-generate-button]').disabled");
  ctx.setGenerationError(undefined);
  ctx.smoke.check('UNet failure covers the tested version only, changed file can be tried', true);
}

async function attemptMoss(ctx, code) {
  const before = ctx.receivedPrompts.length;
  ctx.setGenerationError(code);
  await ctx.run("document.getElementById('prompt-editor').textContent = 'Moss verification'");
  await ctx.click('[data-generate-button]');
  const deadline = Date.now() + 5000;
  while (ctx.receivedPrompts.length === before && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(ctx.receivedPrompts.length, before + 1);
  await ctx.wait("!document.querySelector('[data-generate-button]').disabled");
}

async function checkMissingDirectory(ctx) {
  await ctx.wait("document.querySelector('[data-image-model-issue=directory]')");
  await ctx.click('[data-image-model-choose-dir]');
  await ctx.wait("document.querySelector('[data-image-model-issue=missing]')");
  ctx.smoke.check('Choosing the models folder changes the notice and keeps the entire input locked until models are ready', await ctx.run(`
    document.querySelector('[data-create-rail-scroll]').inert &&
    ['[data-generate-button]', '[data-image-count-trigger]', '[data-random-seed]'].every(selector => document.querySelector(selector).disabled)
  `));
}


async function checkImageEditSize(ctx) {
  await ctx.run("[...document.querySelectorAll('[data-create-mode-tabs] button')].find(button => button.textContent.trim() === '编辑').click()");
  await ctx.wait("document.querySelector('[data-edit-references] input[type=file]')");
  // 两张真实 PNG 大小不同；批量导入后的第二张不能覆盖首图决定的输出尺寸。
  await ctx.run(`(async () => {
    const input = document.querySelector('[data-edit-references] input[type=file]');
    const transfer = new DataTransfer();
    for (const [width, height] of [[65, 33], [96, 112]]) {
      const canvas = Object.assign(document.createElement('canvas'), { width, height });
      const blob = await new Promise(resolve => canvas.toBlob(resolve));
      transfer.items.add(new File([blob], width + '.png', { type: 'image/png' }));
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await ctx.wait("document.querySelectorAll('[data-edit-references] img').length === 2");
  await ctx.run("(()=>{const input=document.querySelector('[data-anima-instruction]');input.textContent='Combine both images';input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const before = ctx.receivedPrompts.length;
  await ctx.click('[data-anima-run]');
  const deadline = Date.now() + 5000;
  while (ctx.receivedPrompts.length === before && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  const prompt = ctx.receivedPrompts[before];
  assert.ok(prompt, await ctx.run("document.querySelector('[data-anima-status]').textContent"));
  assert.equal(prompt['26'].inputs.image, 'fixture/edit-1.png');
  assert.equal(prompt['h3-source-1'].inputs.image, 'fixture/edit-2.png');
  const { width, height } = prompt['edit-output-size'].inputs;
  assert.deepEqual({ width, height }, { width: 65, height: 33 });
  assert.deepEqual(prompt['16'].inputs.images, ['edit-output-size', 0]);
  ctx.smoke.check('Multi-image edit submits the original first-image dimensions and hides batch',
    await ctx.run("!document.querySelector('[data-anima-run]').textContent.includes('×')"));
}


module.exports = async (ctx) => {
  await ctx.load("/create");
  await checkMissingDirectory(ctx);
  for (const [index, selector] of [
    [0, "[data-generate-button]"],
    [1, "button[type=submit]"],
    [3, "[data-audio-create] [data-generate-button]"],
  ]) {
    await ctx.click(`[data-create-mode-tabs] button:nth-child(${index + 1})`);
    await ctx.wait("document.querySelector('[data-workflow-model-notice]')");
    assert.ok(
      await ctx.run(
        `document.querySelector(${JSON.stringify(selector)})?.disabled`,
      ),
    );
    await ctx.shot(`readiness-missing-${index}`);
  }
  await ctx.click("[data-create-mode-tabs] button:nth-child(1)");
  // 先有缺项，再写文件和点原扫描按钮；不能直接改Zustand的“已安装”状态。
  ctx.installModels();
  await ctx.click("[data-refresh-model-readiness]");
  await ctx.wait("!document.querySelector('[data-workflow-model-notice]')");
  assert.equal(
    await ctx.run("document.querySelector('[data-generate-button]').disabled"),
    false,
  );
  await ctx.shot("readiness-scanned-unlocked");
  await checkMossSetup(ctx);
  await checkSubmittedModelPaths(ctx);
  await checkSavedMossSelection(ctx);
  await checkMossRuntimeFailures(ctx);
  await checkImageEditSize(ctx);
  ctx.smoke.check(
    "创作图片/视频/音频缺模型禁用；补齐文件后原扫描自动解锁",
    true,
  );
};

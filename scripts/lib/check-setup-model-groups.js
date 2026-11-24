/** 清单读真实 Markdown；检查分组、图片返回、主题和语言，不用手工勾选冒充安装完成。 */
const assert = require("node:assert/strict");
const manifest = require("../../packages/shared/src/data/setup-downloads.json");

async function checkGroups(ctx) {
  await ctx.load("/tools");
  await ctx.click("[data-window-checklist]");
  await ctx.wait("document.querySelector('button[data-setup-group=anima]')?.textContent.includes('Anima')");
  const groupIds = await ctx.run("[...document.querySelectorAll('button[data-setup-group]')].map(entry => entry.dataset.setupGroup)");
  assert.deepEqual(groupIds, manifest.groups.map(group => group.id));
  await ctx.shot("checklist-two-columns-light");
  // 像用户点左栏一样逐组查看。右栏只挂载当前组，每个文件的路径必须来自清单。
  for (const group of manifest.groups) {
    await selectGroup(ctx, group.id);
    const rows = await ctx.run("[...document.querySelectorAll('[data-setup-file]')].map(row => [row.dataset.setupFile, row.querySelector('[data-setup-download-path]').textContent])");
    const expected = group.files.map(id => [id, manifest.files.find(file => file.id === id).relativePath]);
    assert.deepEqual(rows, expected);
    await ctx.shot(`guide-${group.id}`);
  }
  const geometry = await ctx.run("(()=>{const nav=document.querySelector('.setup-checklist-nav').getBoundingClientRect();const panel=document.querySelector('[data-setup-detail]').getBoundingClientRect();return nav.right <= panel.left && nav.top === panel.top})()");
  ctx.smoke.check("左栏列出全部工作流，右栏只显示当前组和工作流路径", geometry);
}

async function selectGroup(ctx, id) {
  await ctx.click(`[data-setup-group=${id}]`);
  await ctx.wait(`document.querySelector('[data-setup-group=${id}]').getAttribute('aria-pressed')==='true'&&document.querySelector('[data-setup-guide=${id}]')`);
}
async function checkPreview(ctx) {
  await checkGuideImages(ctx);
  await selectGroup(ctx, "anima");
  await ctx.run("document.querySelector('[data-setup-guide=anima] img').scrollIntoView({block:'center'})");
  await ctx.wait(
    "document.querySelector('[data-setup-guide=anima] img')?.complete",
  );
  assert.ok(
    await ctx.run(
      "document.querySelector('[data-setup-guide=anima] img').naturalWidth>0",
    ),
  );
  await ctx.run(
    "(()=>{const e=document.querySelector('[data-setup-detail]');e.scrollTop=250;window.__checklistReading={node:e,top:e.scrollTop}})()",
  );
  await ctx.click("[data-setup-guide=anima] img");
  await ctx.wait(
    "document.querySelector('[data-image-preview-overlay]')&&document.querySelector('#window-setup-checklist').hidden",
  );
  await ctx.shot("checklist-shared-image-preview");
  await ctx.run(
    "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))",
  );
  assert.ok(
    await ctx.run(
      "(()=>{const e=document.querySelector('[data-setup-detail]');return e===window.__checklistReading.node&&Math.abs(e.scrollTop-window.__checklistReading.top)<1&&document.querySelector('[data-setup-mode=manual]').getAttribute('aria-pressed')==='true'})()",
    ),
  );
  await checkFullscreen(ctx);
}
async function checkGuideImages(ctx) {
  // 每组都展开并解码随包图片，避免新增截图被路径白名单误拦后只剩文字。
  await ctx.click("[data-setup-mode=manual]");
  for (const group of manifest.groups) {
    await selectGroup(ctx, group.id);
    const selector = `[data-setup-guide=${group.id}] img`;
    const count = await ctx.run(
      `document.querySelectorAll('${selector}').length`,
    );
    if (group.id === "moss") {
      // Moss 的手动指南用清单内的相对路径逐项说明。
      assert.equal(await ctx.run("document.querySelector('[data-setup-guide=moss]').textContent.includes('diffusion_models/Moss/Moss_image/')"), true);
      continue;
    }
    assert.ok(count > 0);
    for (let index = 0; index < count; index++) {
      // 图片按可见区域懒加载；像用户向下阅读一样滚到图片处，再断言真实解码。
      await ctx.run(
        `document.querySelectorAll('${selector}')[${index}].scrollIntoView({block:'center'})`,
      );
      await ctx.wait(
        `document.querySelectorAll('${selector}')[${index}]?.naturalWidth>0`,
      );
    }
  }
  ctx.smoke.check("各组指南随包截图全部能解码显示", true);
}
async function checkFullscreen(ctx) {
  await ctx.click("[data-task-panel-expand]");
  await ctx.wait(
    "document.querySelector('#window-setup-checklist').dataset.expanded==='true'",
  );
  await ctx.wait(
    "(()=>{const r=document.querySelector('#window-setup-checklist').getBoundingClientRect();return Math.abs(r.left)<1&&Math.abs(r.right-innerWidth)<1&&Math.abs(r.top-44)<1&&Math.abs(r.bottom-innerHeight)<1})()",
  );
  await ctx.shot("checklist-fullscreen-light");
  await ctx.click("[data-task-panel-expand]");
  ctx.smoke.check("看图返回保留阅读位置，清单全屏只填满软件内部", true);
}

async function checkThemeAndLanguage(ctx) {
  await ctx.click("[data-theme-trigger]");
  await ctx.click("[data-theme-option=dark]");
  await require("./sidebar-menu-fixture").closeAppearance(ctx.run);
  await ctx.wait(
    "document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('theme-ripple')",
  );
  await ctx.click("[data-window-checklist]");
  await ctx.wait("document.querySelector('[data-setup-group=seedvr2]')");
  await ctx.shot("checklist-five-groups-dark");
  await ctx.click("[data-account-menu-trigger]");
  await ctx.click("[data-language-trigger]");
  await ctx.click("[data-language-option=en]");
  await ctx.click("#main-content");
  await ctx.click("[data-window-checklist]");
  await ctx.wait(
    "document.querySelector('[data-setup-guide=anima] h3')?.textContent.includes('Anima image generation')",
  );
  await ctx.shot("checklist-five-groups-english");
  ctx.smoke.check("各组 Markdown可切换深色和英文", true);
}

async function blockGuide(ctx) {
  await ctx.win.webContents.debugger.sendCommand("Network.enable");
  await ctx.win.webContents.debugger.sendCommand("Network.setCacheDisabled", {
    cacheDisabled: true,
  });
  await ctx.win.webContents.debugger.sendCommand("Network.setBlockedURLs", {
    urls: ["*guides/model-setup/en/model.md"],
  });
}
async function checkReadFailure(ctx) {
  await ctx.run(
    "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))",
  );
  await blockGuide(ctx);
  try {
    await ctx.click("[data-window-checklist]");
    await ctx.click("[data-setup-mode=manual]");
    await ctx.wait(
      "document.querySelector('[data-setup-detail] [role=alert]')",
    );
    await ctx.win.webContents.debugger.sendCommand("Network.setBlockedURLs", {
      urls: [],
    });
    await ctx.click("[data-setup-detail] [role=alert] button");
    await ctx.wait(
      "document.querySelector('[data-setup-guide=anima] h3')?.textContent.includes('Anima image generation')",
    );
    ctx.smoke.check("Markdown读取失败可见，原地重试恢复", true);
  } finally {
    await ctx.win.webContents.debugger.sendCommand("Network.setBlockedURLs", {
      urls: [],
    });
    await ctx.win.webContents.debugger.sendCommand("Network.setCacheDisabled", {
      cacheDisabled: false,
    });
  }
}

module.exports = async (ctx) => {
  await checkGroups(ctx);
  await checkPreview(ctx);
  await checkThemeAndLanguage(ctx);
  await checkReadFailure(ctx);
};

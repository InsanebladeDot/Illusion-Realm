/** 冒烟共用真实交互路径：主题在顶栏、语言在账户菜单，不注入产品状态。 */
async function revealSidebarPreference(run, selector) {
  if (!["[data-language-trigger]", "[data-theme-trigger]"].includes(selector)) return;
  if (await run(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
  await run("document.querySelector('[data-account-menu-trigger]').click()");
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await run(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Account menu preference entry did not appear");
}
async function closeAppearance(run) {
  await run("document.getElementById('appearance-title')?.closest('[role=dialog]')?.querySelector('button[aria-label]')?.click()");
}
module.exports = { revealSidebarPreference, closeAppearance };

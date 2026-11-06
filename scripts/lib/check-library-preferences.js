/** 资料库偏好集成回归：用真实构建页面和生产 preload 操作共享界面。 */
// 搜索回包及图片由外层夹具控制，不能据此声称线上资料服务已经验证。
// 收藏写入真正的临时 JSON，随后销毁页面重载，排除只保留内存的假通过。
// 每一步都走界面按钮，不直接调用 Zustand action 修改被测状态。
const fs = require("node:fs");
const path = require("node:path");

// 关闭的是当前资料库，不能用 Escape 一次关掉所有层掩盖监听冲突。
// 触发按钮仅指正式创建页入口，详情页和内部心形均在打开后定位。
async function open(context, library) {
  await context.click(library === "character" ? "[data-character-picker-trigger]" : `[data-${library}-library-trigger]`);
  if (!await context.waitFor(`document.querySelector('[data-${library}-card]')`)) throw new Error(`${library} did not open`);
}
async function close(context, library) {
  const title = library === "character" ? "character-picker-dialog-title" : `${library}-library-dialog-title`;
  await context.click(`[data-resource-dialog="${title}"] button[aria-label="关闭"]`);
}

// 单个库同时检查选择和收藏：两类状态不能互相代替。
// 切文本后检查完全没有图片节点，而非把图片藏在 CSS 下面继续请求。
// 文本卡仍带完整身份；回到卡片模式后选中与收藏必须都保持。
async function checkStaticLibrary(context, library) {
  const { run, click, check, waitFor } = context;
  await open(context, library);
  const id = await run(`document.querySelector('[data-${library}-card]').getAttribute('data-${library}-card')`);
  await click(`[data-${library}-favorite="${id}"]`);
  check(`${library}收藏不自动选择`, await run(`document.querySelector('[data-${library}-card]').getAttribute('data-${library}-selected')==='false'`));
  await click(`[data-${library}-card] button`);
  await click(`[data-${library}-display-mode="text"]`);
  check(`${library}文本模式保留选择且没有缩略图`, await run(`!!document.querySelector('[data-library-text][data-${library}-selected="true"]')&&!document.querySelector('[data-library-results] img')`));
  await click(`[data-${library}-favorites]`);
  check(`${library}完整收藏可筛选`, await waitFor(`document.querySelectorAll('[data-${library}-card]').length===1`));
  await context.screenshot(`favorites-${library}-text`);
  await close(context, library);
  return id;
}

// 两页角色是固定回包，证明第二页收藏不会受第一页结果集限制。
// 第一页选中角色后翻页，再收藏另一个，检查不会因为切页而丢失前者。
// 收藏视图必须同时展示两页的记录，不接受只显示当前网络页的实现。
async function checkCharacters(context) {
  const { click, run, waitFor, check } = context;
  await open(context, "character");
  await click('[data-character-favorite="character_1"]');
  await click('[data-character-card="character_1"] button');
  await click('[data-character-display-mode="text"]');
  check("角色与静态库共用文本卡且保留选择", await run(`!!document.querySelector('[data-library-text][data-character-selected="true"]')&&!document.querySelector('[data-character-grid] img')`));
  await click('[data-character-page="next"]');
  check("真实分页可进入另一组角色", await waitFor(`!!document.querySelector('[data-character-card="character_25"]')`));
  await click('[data-character-favorite="character_25"]');
  await click('[data-character-favorites]');
  check("角色收藏跨查询页完整显示", await waitFor(`document.querySelectorAll('[data-character-card]').length===2&&!!document.querySelector('[data-character-card="character_1"]')`));
  await context.screenshot("favorites-character-text-light");
  await close(context, "character");
}

// 保存与重载各有独立依据：磁盘有数据不代表 AppShell 确实恢复了 store。
// 先核对五库的文档段，再打开界面核对，避免仅靠一份导出 JSON 自证。
// 角色重载后也要能进入跨页收藏，不能退回仅有 slug 却不可浏览的状态。
async function checkPersistence(context, ids) {
  const { check, readDocument, click, waitFor } = context;
  check("五库收藏共存于统一用户文档", await readDocument(doc => doc.characterFavorites?.characters?.length === 2 && doc.artistLibrary?.favorites?.length === 1 && Object.entries(ids).every(([library, id]) => doc.libraryFavorites?.items[library]?.some(item => item.id === id))));
  await context.reload();
  await open(context, "character");
  await click("[data-character-favorites]");
  check("角色收藏快照在完整页面重载后恢复", await waitFor(`document.querySelectorAll('[data-character-card]').length===2`));
  await close(context, "character");
  for (const [library, id] of Object.entries(ids)) {
    await open(context, library);
    await click(`[data-${library}-favorites]`);
    check(`${library}重载恢复收藏`, await waitFor(`document.querySelectorAll('[data-${library}-card]').length===1&&document.querySelector('[data-${library}-favorite="${id}"]')?.getAttribute('aria-pressed')==='true'`));
    await close(context, library);
  }
}

// 使用真正的浏览器下载事件收集导出文件，不直接序列化 store 代替按钮。
// 测试只替系统选择一个临时保存位置，内容仍由产品生成的 Blob 决定。
// done 有十秒上限；失败和取消必须使测试失败，不能当作合法空导出。
// 监听在 finally 清理，后续菜单和其他测试不会继承下载拦截器。
async function checkExport(context) {
  const target = path.join(context.directory, "favorites-export.json");
  let listener;
  let timeout;
  const completed = new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error("Favorites download timed out")), 10000);
    listener = (_event, item) => {
      item.setSavePath(target);
      item.once("done", (_done, state) => { clearTimeout(timeout); state === "completed" ? resolve() : reject(new Error(state)); });
    };
    context.win.webContents.session.once("will-download", listener);
  });
  // 若打开弹窗先失败，下载 Promise 仍需有人消费拒绝，不能留下第二个未处理异常。
  // 正常路径继续 await 原 Promise，所以这里不会把下载失败改成通过。
  void completed.catch(() => undefined);
  try {
    await open(context, "background");
    await context.click("[data-library-favorites-export]");
    await completed;
    const json = JSON.parse(fs.readFileSync(target, "utf8"));
    context.check("真实导出 JSON 包含五库且排除用户设置", json.format === "illusion-realm-library-favorites" && json.version === 1 && json.libraries.character.items.length === 2 && json.libraries.artist.items.length === 1 && ["pose", "background", "expression"].every(key => json.libraries[key].length === 1) && !json.settings && !json.agentPreferences);
    await close(context, "background");
  } finally {
    clearTimeout(timeout);
    context.win.webContents.session.removeListener("will-download", listener);
  }
}

// 菜单 Escape 必须归还焦点，不能顺便关闭后面的弹窗。
// 使用 Chromium 的键盘输入，比给隐藏节点派发 click 更接近实际操作。
// 主题走正式外观菜单，截图不使用手工注入主题类。
async function checkMenuAndTheme(context) {
  await open(context, "character");
  await context.click('[data-character-reference-filters] [data-simple-select]>button');
  context.check("共享菜单展开并聚焦已选项", await context.run(`document.activeElement?.getAttribute('role')==='option'`));
  await context.screenshot("unified-select-light");
  context.win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  context.win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  context.check("Escape仅关闭菜单并归还触发焦点", await context.waitFor(`!document.querySelector('[data-simple-select-panel]')&&document.activeElement?.matches('[data-character-reference-filters] [data-simple-select]>button')&&!!document.querySelector('[data-character-grid]')`));
  await close(context, "character");
  await context.click("[data-theme-trigger]");
  await context.click('[data-theme-option="dark"]');
  await context.waitFor(`document.documentElement.dataset.theme==='dark'`);
  await require("./sidebar-menu-fixture").closeAppearance(context.run);
  await open(context, "character");
  await context.click('[data-character-display-mode="text"]');
  await context.screenshot("favorites-character-text-dark");
  await close(context, "character");
}

// 顺序运行，避免多个模态窗口叠在一起造成点击到错误库。
// 外层现有回归已经保留一个画师收藏，新增三库不依赖其 ID。
// 每个 helper 独立承担一个用户流程，失败继续由统一 harness 汇总。
module.exports = async context => {
  const ids = {};
  for (const library of ["pose", "background", "expression"]) ids[library] = await checkStaticLibrary(context, library);
  await checkCharacters(context);
  await checkPersistence(context, ids);
  await checkExport(context);
  await checkMenuAndTheme(context);
  await checkNarrow(context);
};

// 改真实测试窗口尺寸触发创建主区切换，不复制一份移动资料库页面。
// 先等待容器出现，再量取外壳和主滚动区，避免把加载帧当布局成功。
// 预览和收藏仍使用前面保存的数据，窄屏不能重建成空演示集合。
async function checkNarrow(context) {
  context.win.setSize(900, 900);
  await context.waitFor("innerWidth===900");
  await open(context, "character");
  await context.click("[data-character-favorites]");
  await context.click('[data-character-display-mode="text"]');
  context.check("窄窗资料库保留完整收藏且无横向溢出", await context.run(`(()=>{const root=document.querySelector('[data-character-grid]');return root.querySelectorAll('[data-character-card]').length===2&&root.scrollWidth<=root.clientWidth+1})()`));
  await context.screenshot("favorites-character-narrow-dark");
  await close(context, "character");
  context.win.setSize(1600, 1000);
}

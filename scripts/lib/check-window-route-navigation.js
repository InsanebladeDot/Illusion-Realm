/** 复用正式清单冒烟窗口和账号夹具；所有前进后退都移动真实浏览历史，不注入路由栈。 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForRoute(context, path) {
  try {
    await context.wait(`location.pathname===${JSON.stringify(path)}&&!!document.querySelector('[data-window-route-segment="${path}"] [aria-current=page]')&&!document.documentElement.classList.contains('page-transition')`);
  } catch (error) {
    console.log('NAVIGATION_FAILURE', await context.run("JSON.stringify({url:location.href,index:navigation.currentEntry.index,entries:navigation.entries().map(e=>e.url),probe:window.__historyProbe,buttons:[...document.querySelectorAll('[data-window-history]')].map(b=>({disabled:b.disabled,region:getComputedStyle(b).getPropertyValue('-webkit-app-region')}))})"));
    await context.shot('navigation-failure');
    throw error;
  }
}

function createActions(context) {
  const { run, win } = context;
  const current = path => waitForRoute(context, path);
  async function historyClick(direction) {
    // 页面快照退场后再点真实按钮，避免测试鼠标撞上转场中的透明顶层。
    await context.wait(`(()=>{const b=document.querySelector('[data-window-history=${direction}]'),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})()`);
    const point = await run(`(()=>{const b=document.querySelector('[data-window-history=${direction}]'),r=b.getBoundingClientRect();window.__historyProbe={direction:${JSON.stringify(direction)},clicked:false,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.outerHTML.slice(0,300)};b.addEventListener('click',()=>{window.__historyProbe.clicked=true},{once:true});return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
    win.webContents.focus();
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
  }
  return { ...context, current, historyClick };
}

async function checkHistory(context) {
  const { load, smoke, run, click, current, historyClick } = context;
  await load('/tools');
  await context.win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  smoke.check('First page has no back or forward target', await run("[...document.querySelectorAll('[data-window-history]')].length===2&&[...document.querySelectorAll('[data-window-history]')].every(b=>b.disabled)"));
  await click('[data-app-nav] a[href="/create"]'); await current('/create');
  await click('[data-app-nav] a[href="/inspect"]'); await current('/inspect');
  smoke.check('Ordinary route pushes enable only back', await run("!document.querySelector('[data-window-history=back]').disabled&&document.querySelector('[data-window-history=forward]').disabled"));
  await historyClick('back'); await current('/create');
  smoke.check('Real pointer back enables forward and restores the previous page', await run("!document.querySelector('[data-window-history=forward]').disabled&&!!document.querySelector('#prompt-editor')"));
  await historyClick('forward'); await current('/inspect');
  smoke.check('Forward reaches original page and disables at history end', await run("document.querySelector('[data-window-history=forward]').disabled"));
  await historyClick('back'); await current('/create');
  await click('[data-app-nav] a[href="/"]'); await current('/');
  smoke.check('A new navigation after back discards the old forward branch', await run("document.querySelector('[data-window-history=forward]').disabled&&!navigation.entries().some(e=>new URL(e.url).pathname==='/inspect')"));
  await run('history.back()'); await current('/create');
  smoke.check('Native browser back also updates both buttons', await run("!document.querySelector('[data-window-history=back]').disabled&&!document.querySelector('[data-window-history=forward]').disabled"));
  await checkReload(context);
}

/** 刷新与 replace 不应凭空多出一页；旧的前进目标也不应被刷新抹掉。 */
async function checkReload(context) {
  const { run, smoke, win, current, wait, click } = context;
  const count = await run('navigation.entries().length');
  await run("history.replaceState(history.state,'',location.pathname+'?history-check=1')");
  smoke.check('Replacing current query keeps native history length and forward target', await run(`navigation.entries().length===${count}&&!document.querySelector('[data-window-history=forward]').disabled`));
  await run("history.replaceState(history.state,'',location.pathname)");
  await new Promise((resolve, reject) => { win.webContents.once('did-finish-load', resolve); win.webContents.once('did-fail-load', reject); win.webContents.reload(); });
  await current('/create');
  await wait("document.querySelector('[aria-labelledby=update-announcement-title]')");
  await click('[aria-labelledby=update-announcement-title] button');
  smoke.check('Reload restores actual back and forward availability', await run(`navigation.entries().length===${count}&&!document.querySelector('[data-window-history=back]').disabled&&!document.querySelector('[data-window-history=forward]').disabled`));
  await run("document.querySelector('[data-window-history=forward]').focus()"); win.webContents.focus();
  for (const type of ['keyDown', 'char', 'keyUp']) win.webContents.sendInputEvent({ type, keyCode: type === 'char' ? '\r' : 'Return' });
  await current('/');
  smoke.check('Keyboard Enter activates the same real forward action', await run("document.querySelector('[data-window-history=forward]').disabled"));
}

async function checkBreadcrumbs(context) {
  const { click, current, smoke, run, shot, historyClick } = context;
  await click('[data-account-menu-trigger]'); await click('#sidebar-account-menu a[href="/tools"]');
  await current('/tools');
  await click('a[href="/tools/image/cartoon"]'); await current('/tools/image/cartoon');
  smoke.check('Metadata supplies the complete route hierarchy', await run("JSON.stringify([...document.querySelectorAll('[data-window-route-segment]')].map(e=>e.dataset.windowRouteSegment))===JSON.stringify(['/','/tools','/tools/image','/tools/image/cartoon'])"));
  smoke.check('Virtual category is plain text and ancestors are real links', await run("!document.querySelector('[data-window-route-segment=\"/tools/image\"] a')&&!!document.querySelector('[data-window-route-segment=\"/tools\"] a')"));
  await showPurpose(context); await shot('route-cartoon-light');
  await checkPurposeFocus(context);
  await click('[data-window-route-segment="/tools"] a'); await current('/tools');
  smoke.check('Breadcrumb ancestor opens its actual page and preserves a usable back target', await run("!document.querySelector('[data-window-history=back]').disabled&&!document.querySelector('[data-model-library-location]')"));
  await historyClick('back'); await current('/tools/image/cartoon');
  smoke.check('Back from ancestor restores the child route', await run("document.querySelector('[data-window-route-segment=\"/tools/image/cartoon\"]').textContent.includes('漫画对话框')"));
}

async function showPurpose(context) {
  const { run, wait, smoke, win } = context;
  win.webContents.focus();
  const point = await run("(()=>{const e=document.querySelector('[data-window-route-segment=\"/tools/image/cartoon\"] [aria-current=page]');e.focus();const r=e.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()");
  win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
  await wait("[...document.querySelectorAll('[data-hover-tip][data-visible=true]')].some(e=>e.textContent.includes('单击选中调整样式'))");
  smoke.check('Page purpose uses the original lightweight tooltip, with no native title', await run("!document.querySelector('[data-window-titlebar-content]').title&&!document.querySelector('[data-window-titlebar-content]').textContent.includes('单击选中调整样式')"));
}

/** 焦点仿真只用于离屏测试；不靠鼠标悬停冒充键盘聚焦提示。 */
async function checkPurposeFocus(context) {
  const { run, wait, win, smoke } = context;
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  win.webContents.focus();
  await run("document.activeElement.blur()");
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 600, y: 400 });
  await delay(100);
  await wait("!document.querySelector('[data-hover-tip][data-visible=true]')");
  await run("document.querySelector('[data-window-route-segment=\"/tools/image/cartoon\"] [aria-current=page]').focus()");
  await wait("[...document.querySelectorAll('[data-hover-tip][data-visible=true]')].some(e=>e.textContent.includes('单击选中调整样式'))");
  smoke.check('Keyboard focus independently opens the page purpose', true);
}

async function checkThemeAndWidths(context) {
  const { click, run, wait, shot, win, smoke } = context;
  await click('[data-theme-trigger]'); await click('[data-theme-option=dark]');
  await require('./sidebar-menu-fixture').closeAppearance(run);
  await wait("matchMedia('(prefers-color-scheme:dark)').matches&&!document.documentElement.classList.contains('theme-ripple')");
  await showPurpose(context); await shot('route-cartoon-dark');
  await checkPurposeFocus(context);
  for (const width of [820, 650, 390, 320]) {
    await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width, height: 700, deviceScaleFactor: 1, mobile: false });
    await delay(200);
    smoke.check(`Header ${width}px keeps arrows and window controls within the window`, await run("(()=>{const h=document.querySelector('[data-window-titlebar]'),b=[...h.querySelectorAll('[data-window-history],[data-window-controls] button')];return b.length===5&&b.every(e=>{const r=e.getBoundingClientRect();return r.width>=24&&r.left>=0&&r.right<=innerWidth})&&h.scrollWidth<=innerWidth})()"));
    smoke.check(`Tooltip ${width}px stays within the current viewport`, await run("[...document.querySelectorAll('[data-hover-tip][data-visible=true]')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})"));
    if (width === 390 || width === 320) await shot(`route-narrow-${width}`);
  }
  await win.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
  await click('[data-account-menu-trigger]'); await click('[data-language-trigger]'); await click('[data-language-option=en]');
  await click('#main-content');
  smoke.check('History and breadcrumb labels follow the app language', await run("document.querySelector('[data-window-history=back]').getAttribute('aria-label')==='Back'&&document.querySelector('[data-window-route-navigation] nav').getAttribute('aria-label')==='Page path'"));
  await shot('route-english');
}

/** 根地址直接显示首页；旧文件入口只映射门牌，不能多跳一次把历史弄乱。 */
async function checkHomeEntry(context) {
  const { load, run, smoke, shot, click, current, historyClick } = context;
  await load('/');
  smoke.check('Canonical home entry shows its name and icon without a file route', await run("location.pathname==='/'&&document.querySelector('[data-window-route-segment=\"/\"] [aria-current=page]').textContent==='首页'&&!document.querySelector('[data-window-route-segment=\"/index.html\"]')"));
  await shot('home-entry');
  await load('/index.html');
  smoke.check('Legacy entry shows home metadata without a redirect', await run("location.pathname==='/index.html'&&document.querySelector('[data-window-route-segment=\"/\"] [aria-current=page]').textContent==='首页'"));
  await click('[data-app-nav] a[href="/create"]'); await current('/create');
  await historyClick('back');
  await context.wait("location.pathname==='/index.html'&&!!document.querySelector('[data-window-route-segment=\"/\"] [aria-current=page]')");
  smoke.check('Back restores the legacy home entry with the correct breadcrumb', true);
}

module.exports = async function checkWindowRouteNavigation(context) {
  const actions = createActions(context);
  try {
    await checkHistory(actions);
    await checkHomeEntry(actions);
    await checkBreadcrumbs(actions);
    await checkThemeAndWidths(actions);
  } finally {
    await context.win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: false });
  }
};

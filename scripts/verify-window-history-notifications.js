/** 独立 React 开发版回归：运行生产历史订阅和真实浏览器事件，不替代 Next 静态页面冒烟。 */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const http = require('node:http'), { createRequire } = require('node:module');
const { app, BrowserWindow } = require('electron');
const smoke = require('./lib/smoke-harness').createSmokeHarness({ name: 'window-history-notifications', timeoutMs: 45000 });
const nextRequire = createRequire(path.resolve('apps/next/package.json'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-history-notifications-'));
let win, server;
app.disableHardwareAcceleration();
app.setPath('userData', path.join(root, 'browser'));
smoke.setWorkDir(root);
smoke.installWatchdog(app);

/** 加载项目正在使用的 React 开发包；生产压缩包不会报告这类生命周期错误。 */
function browserModules() {
  const reactDom = path.dirname(nextRequire.resolve('react-dom'));
  const dependencies = createRequire(nextRequire.resolve('react-dom/client'));
  const files = {
    react: path.join(path.dirname(nextRequire.resolve('react')), 'cjs/react.development.js'),
    'react-dom': path.join(reactDom, 'cjs/react-dom.development.js'),
    'react-dom/client': path.join(reactDom, 'cjs/react-dom-client.development.js'),
    scheduler: path.join(path.dirname(dependencies.resolve('scheduler')), 'cjs/scheduler.development.js'),
  };
  const modules = Object.fromEntries(Object.entries(files).map(([id, file]) => [id, fs.readFileSync(file, 'utf8')]));
  const ts = nextRequire('typescript');
  modules.history = ts.transpileModule(fs.readFileSync('apps/next/src/utils/window-route-history.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return modules;
}

/** Next 的 HistoryUpdater 也在插入阶段调用 push/replace；这里用同样操作稳定复现。 */
function mountProbe(modules) {
  const cache = {};
  const require = id => {
    if (cache[id]) return cache[id].exports;
    const module = cache[id] = { exports: {} };
    new Function('module', 'exports', 'require', 'process', modules[id])(module, module.exports, require, { env: { NODE_ENV: 'development' } });
    return module.exports;
  };
  const React = require('react'), { createRoot } = require('react-dom/client');
  const { subscribeWindowHistory, windowHistorySnapshot } = require('history');
  window.__historyErrors = [];
  const report = console.error;
  console.error = (...args) => { window.__historyErrors.push(args.map(String).join(' ')); report(...args); };
  function Reader() {
    const value = React.useSyncExternalStore(subscribeWindowHistory, windowHistorySnapshot, () => 0);
    return React.createElement('output', { 'data-history': value }, String(value));
  }
  function Writer({ href, method }) {
    React.useInsertionEffect(() => { if (href) history[method](history.state, '', href); }, [href, method]);
    return null;
  }
  const root = createRoot(document.getElementById('root'));
  window.__setRoute = (href, method = 'pushState') => root.render(React.createElement(React.Fragment, null, React.createElement(Reader), React.createElement(Writer, { href, method })));
  window.__subscribeHistory = subscribeWindowHistory;
  window.__setRoute(null);
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = source => win.webContents.executeJavaScript(source, true);
async function wait(source) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if (await run(`Boolean(${source})`)) return;
    await delay(20);
  }
  throw Error('History condition timed out: ' + source);
}

async function checkRoutes() {
  await wait("document.querySelector('[data-history=\"0\"]')");
  await run("window.__setRoute('/first')");
  await wait("location.pathname==='/first'&&document.querySelector('[data-history=\"1\"]')");
  smoke.check('Push from insertion phase updates Back without React lifecycle warnings', await run('window.__historyErrors.length===0'));
  await run("window.__setRoute('/second')");
  await wait("location.pathname==='/second'");
  await run('history.back()');
  await wait("location.pathname==='/first'&&document.querySelector('[data-history=\"3\"]')");
  smoke.check('Native Back enables Forward', true);
  await run("window.__setRoute('/first?replaced=1','replaceState')");
  await wait("location.search==='?replaced=1'");
  smoke.check('Replace from insertion phase preserves Forward without warnings', await run("window.__historyErrors.length===0&&document.querySelector('[data-history]').dataset.history==='3'"));
  await run('history.forward()');
  await wait("location.pathname==='/second'&&document.querySelector('[data-history=\"1\"]')");
  smoke.check('Native Forward reaches the end and disables Forward', true);
}

/** 同一轮通知合并一次；退订后即使已经排队也不能再调用旧组件。 */
async function checkSubscription() {
  const result = await run(`new Promise(resolve => {
    let count = 0;
    const stop = window.__subscribeHistory(() => { count++; });
    for (let i = 0; i < 3; i++) history.replaceState(history.state, '', '/second?change=' + i);
    const synchronous = count;
    setTimeout(() => { stop(); resolve({ synchronous, count }); }, 0);
  })`);
  smoke.check('Native events defer notification and coalesce one synchronous burst', result.synchronous === 0 && result.count === 1);
  const count = await run(`new Promise(resolve => {
    let count = 0;
    const stop = window.__subscribeHistory(() => { count++; });
    history.replaceState(history.state, '', '/second?unmount=1');
    stop();
    setTimeout(() => resolve(count), 0);
  })`);
  smoke.check('Unsubscribe suppresses a notification already queued', count === 0);
}

async function main() {
  await app.whenReady();
  server = http.createServer((_request, response) => { response.end('<!doctype html><html><body><div id="root"></div></body></html>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  smoke.attachWebContents(win.webContents);
  await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
  await run(`(${mountProbe.toString()})(${JSON.stringify(browserModules())})`);
  await checkRoutes();
  await checkSubscription();
  console.log('REACT_DEVELOPMENT_ERRORS', await run('window.__historyErrors'));
  smoke.check('No React warnings after navigation and cleanup', await run('window.__historyErrors.length===0'));
}

main().then(() => finish(true)).catch(error => { console.error(error); finish(false); });
function finish(ok) {
  win?.destroy();
  server?.closeAllConnections();
  server?.close();
  smoke.finish({ app, ok: ok && smoke.allPassed() });
}

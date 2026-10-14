/** Hidden renderer with temporary settings, real nativeTheme and bounded CDP operations. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { app, BrowserWindow, nativeTheme } = require('electron');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.disableHardwareAcceleration();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ir-comic-workbench-')));
app.on('window-all-closed', () => {});
const watchdog = setTimeout(() => { console.error('Workbench regression timeout'); app.exit(124); }, 180000);
async function startBrowser() {
  await app.whenReady(); nativeTheme.themeSource = 'light';
  const win = new BrowserWindow({ show: false, width: 1600, height: 1000, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true } });
  await win.loadURL('about:blank'); win.webContents.debugger.attach('1.3');
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('CDP timeout: ' + method)), 15000);
    win.webContents.debugger.sendCommand(method, params).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
  await send('Page.enable'); await send('Runtime.enable'); await send('Runtime.addBinding', { name: 'irSetTheme' });
  await send('Page.setInterceptFileChooserDialog', { enabled: true });
  let fileChoosers = 0;
  win.webContents.debugger.on('message', (_event, method, params) => {
    if (method === 'Page.fileChooserOpened') fileChoosers++;
    if (method === 'Runtime.bindingCalled' && params.name === 'irSetTheme' && ['light', 'dark', 'system'].includes(params.payload)) nativeTheme.themeSource = params.payload;
  });
  return {
    send,
    fileChooserRequests: () => fileChoosers,
    evaluate: async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    },
    close: async () => { clearTimeout(watchdog); win.destroy(); },
  };
}
module.exports = { startBrowser, pause };

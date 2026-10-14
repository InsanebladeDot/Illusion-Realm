/** Isolated hidden Electron window for detail interaction checks; never load application user data. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.disableHardwareAcceleration();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ir-create-detail-')));
const watchdog = setTimeout(() => { console.error('Detail regression timed out'); app.exit(124); }, 90000);
async function startBrowser() {
  await app.whenReady();
  const win = new BrowserWindow({ show: false, width: 1920, height: 900, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true } });
  await win.loadURL('about:blank');
  win.webContents.debugger.attach('1.3');
  const send = (method, params = {}) => Promise.race([
    win.webContents.debugger.sendCommand(method, params),
    pause(15000).then(() => { throw Error('CDP timeout: ' + method); }),
  ]);
  await send('Page.enable');
  return {
    send,
    evaluate: async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    },
    close: async () => { clearTimeout(watchdog); win.destroy(); },
  };
}
// Closing the owned window must not end the process before verification reports errors.
app.on('window-all-closed', () => {});
process.on('beforeExit', () => app.exit(process.exitCode || 0));
module.exports = { startBrowser, pause };

/** Isolated Electron renderer on the dev URL: no application data, no Node access in the renderer. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.disableHardwareAcceleration();
const watchdog = setTimeout(() => { console.error("Electron image test exceeded 90 seconds"); app.exit(124); }, 90000);
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "ir-comic-image-test-")));
async function startBrowser() {
  console.log("Electron image test: waiting for app readiness");
  await app.whenReady();
  console.log("Electron image test: creating isolated renderer");
  const win = new BrowserWindow({ show: true, width: 1440, height: 1000, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  await win.loadURL("about:blank");
  win.webContents.debugger.attach("1.3");
  let fileChoosers = 0;
  win.webContents.debugger.on("message", (_event, method) => { if (method === "Page.fileChooserOpened") fileChoosers++; });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("Electron CDP timeout: " + method)), 15000);
    win.webContents.debugger.sendCommand(method, params).then(result => { clearTimeout(timer); resolve(result); }, error => { clearTimeout(timer); reject(error); });
  });
  await send("Page.enable");
  return {
    send,
    fileChooserRequests: () => fileChoosers,
    evaluate: async expression => {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    },
    close: async () => { clearTimeout(watchdog); win.destroy(); app.exit(process.exitCode || 0); },
  };
}
module.exports = { startBrowser, pause };

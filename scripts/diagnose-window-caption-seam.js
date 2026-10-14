/** Capture the real Windows caption seam; renderer screenshots omit native controls. */
const { app, BrowserWindow, nativeImage, nativeTheme, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/window-chrome");
const { IPC_CHANNELS: C } = require("../apps/electron/ipcChannels");
const { registerHandle } = require("../apps/electron/ipcHandlers");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "ir-caption-seam-"));
if (process.env.CAPTION_SOFTWARE === "1") app.disableHardwareAcceleration();
app.setPath("userData", path.join(output, "browser"));
require("../apps/electron/appProtocol").registerAppProtocol();
require("../apps/electron/ipc-handlers/window.handlers").registerThemeHandlers();
registerHandle(C.USER_DATA_READ, () => ({ data: { settings: { theme: "light", locale: "zh-CN" } }, filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, () => undefined);
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => "");
registerHandle(C.CHANGELOG_READ, () => "");
registerHandle(C.MODELS_DOWNLOAD_LIST, () => ({ revision: 0, tasks: [] }));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function capture(win, name) {
  const bounds = win.getBounds();
  const physical = screen.dipToScreenRect(win, bounds);
  const target = path.join(output, name + ".png");
  const script = `Add-Type -AssemblyName System.Drawing; $image = New-Object System.Drawing.Bitmap 240,48; $graphics = [System.Drawing.Graphics]::FromImage($image); $graphics.CopyFromScreen(${physical.x + physical.width - 240},${physical.y},0,0,$image.Size); $image.Save('${target}',[System.Drawing.Imaging.ImageFormat]::Png); $graphics.Dispose(); $image.Dispose()`;
  execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true });
  return target;
}
function assertSeam(file, geometry) {
  const image = nativeImage.createFromPath(file);
  const bitmap = image.toBitmap();
  const width = image.getSize().width;
  const seam = Math.round(width - (geometry.width - geometry.header.right) * geometry.dpr);
  for (let x = seam - 3; x <= seam + 3; x++) {
    for (let y = 8; y < 28; y++) {
      const offset = (y * width + x) * 4;
      if (bitmap[offset] !== 245 || bitmap[offset + 1] !== 244 || bitmap[offset + 2] !== 244) {
        throw new Error("Native caption seam contains a visible line");
      }
    }
  }
  console.log("PASS Native caption seam has continuous gray pixels at DPR " + geometry.dpr);
}
async function main() {
  await app.whenReady();
  nativeTheme.themeSource = "light";
  const css = fs.readFileSync(path.join(__dirname, "../apps/next/src/app/globals.css"), "utf8").match(/\.window-titlebar \{[\s\S]*?\n\}/)[0];
  const win = new BrowserWindow({ ...windowChromeOptions(), width: 900, height: 600, x: 100, y: 100, show: false, alwaysOnTop: true, webPreferences: { additionalArguments: windowChromeArguments(), preload: path.join(__dirname, "../apps/electron/preload.js"), sandbox: false, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  try {
    await win.loadURL(process.env.CAPTION_DEV === "1" ? "http://localhost:3000/tools" : "app://app/tools");
    await win.webContents.insertCSS(css);
    win.show(); await delay(500);
    const geometry = await win.webContents.executeJavaScript("({dpr:devicePixelRatio,width:innerWidth,header:document.querySelector('.window-titlebar').getBoundingClientRect().toJSON()})");
    await win.webContents.executeJavaScript("document.querySelector('.window-titlebar').style.boxShadow='none'");
    await delay(200); capture(win, "before");
    await win.webContents.executeJavaScript("document.querySelector('.window-titlebar').style.removeProperty('box-shadow')");
    await delay(200); assertSeam(capture(win, "after"), geometry);
    console.log(output);
  } finally { win.destroy(); }
  app.exit(0);
}
main().catch((error) => { console.error(error.message); app.exit(1); });

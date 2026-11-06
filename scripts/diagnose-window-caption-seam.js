/**
 * window-chrome：复用同一份窗口装饰配置与启动参数。
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * protocol：使用客户端的 app:// 与 localfile:// 协议实现。
 * window.handlers：窗口和主题 IPC 隶属 core 的系统交互边界。
 * index：窗口加载迁移后的真实 preload 桥接文件。
 * window-chrome：窗口样式和传给 preload 的标记必须配套，不能各自猜测当前装饰模式。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * protocol：Next 静态资源含绝对 URL，必须保持应用同源加载。
 * window.handlers：handler 仍通过统一结果封装注册，不因移动改变参数和错误码。
 * index：contextIsolation 保持启用，CommonJS 本地依赖仍需要 sandbox 为 false。
 * window-chrome：标题栏参数仍由主进程传入，渲染层不直接调用 Electron。
 */
/** Capture the real Windows caption seam; renderer screenshots omit native controls. */
const { app, BrowserWindow, nativeImage, nativeTheme, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/src/main/core/windows/window-chrome");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "ir-caption-seam-"));
if (process.env.CAPTION_SOFTWARE === "1") app.disableHardwareAcceleration();
app.setPath("userData", path.join(output, "browser"));
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
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
  const win = new BrowserWindow({ ...windowChromeOptions(), width: 900, height: 600, x: 100, y: 100, show: false, alwaysOnTop: true, webPreferences: { additionalArguments: windowChromeArguments(), preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), sandbox: false, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
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

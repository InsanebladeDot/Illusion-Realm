const { app, BrowserWindow } = require("electron");
const path = require("path");
const { registerAppProtocol } = require("./appProtocol");
const { registerAllIpcHandlers } = require("./ipc-handlers");
const { readUserData } = require("./userData");
const { initialLocaleArguments } = require("./initialLocale");

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const PORT = process.env.PORT || 3000;
const DEV_SERVER_URL = `http://localhost:${PORT}`;
const iconPath = path.join(__dirname, "icon.png");
const preloadPath = path.join(__dirname, "preload.js");

// 自定义 app:// 协议：解决静态导出绝对路径在 file:// 下失效的问题
registerAppProtocol();

/**
 * 创建主窗口。
 * dev 加载 Next dev server，生产环境走 app:// 协议加载静态导出。
 * @returns {void}
 */
function createWindow() {
  /**
   * 启动语言注入：把用户文档里的语言值**原样**交给渲染层（见 initialLocale.js 的注释）。
   *
   * 这里刻意不做任何校验：main 不 import 允许集、不调 resolveLocale —— 判决权在渲染层，
   * 否则 `reason` 恒为 stored、missing/invalid 两格在正式窗口上永远测不到。
   * 同步读一次（`readJsonFile` 是 readFileSync），异常语义由 readUserData 自己定义：
   * 文件不存在 / JSON 损坏 / 权限失败都返回 `data: null`，不抛 —— 所以这里不会把应用带崩。
   *
   * 注意 missing 这一档从此**只能由 harness 覆盖**：正式窗口只要文档可读就一定有值
   * （合法或非法），「不传参数 → undefined → zh-CN」只在自建窗口里跑得通。
   */
  const additionalArguments = initialLocaleArguments(readUserData());

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // 显式声明：本项目的 preload 是手写 CommonJS（require electron 内置模块），
      // 需要 Node 环境；Electron 当前默认即 false，写出来避免将来默认值变化导致 preload 静默失效
      sandbox: false,
      preload: preloadPath,
      additionalArguments,
    },
    show: false,
  });

  win.once("ready-to-show", () => win.show());

  if (isDev) {
    // 开发环境：加载 Next dev server
    void win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    // 生产环境：必须用 app:// 协议加载，否则 /_next/... 绝对路径在 file:// 下全部 404
    void win.loadURL("app://app/index.html");
  }
}

app.whenReady().then(() => {
  // 先注册 IPC，再创建窗口：窗口一旦加载就可能有 invoke 调用
  try {
    registerAllIpcHandlers();
  } catch (error) {
    console.error("[IPC] 注册失败，渲染进程将拿不到任何 handler：", error);
  }

  if (process.platform === "darwin") {
    // app.dock 只在 macOS 存在；类型上可能是 undefined，用可选链保持原行为
    app.dock?.setIcon(iconPath);
  }
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

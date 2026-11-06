/**
 * 入口只协调应用生命周期，业务 IPC 的实现集中在各功能域。
 * 协议必须在创建窗口前声明，静态页面才能使用 app:// 的绝对资源路径。
 * 注册表保持原调用时机，窗口加载之前完成各域 handler 注册。
 * 窗口装饰与启动标记来自同一 core/windows 模块，避免主题切换时配置分裂。
 * 用户文档继续由 storage 读取，入口不加入 schema 默认值或版本迁移。
 * 初始语言只构造参数，不代替渲染层判断合法语言。
 * Agent 环境加载仍是第一条可执行语句，保证依赖模块读取到相同环境。
 * 模块层级变深后，图标定位需回到 electron/assets，不能落到 src/assets。
 * PNG 是窗口图标的源资源，构建生成的 ICO 不用于 BrowserWindow 图标路径。
 * preload 位于 src/preload，路径必须指向实际文件，不能依赖工作目录。
 * preload 与主进程共享通道常量，保持 renderer 既有 API 名称。
 * CommonJS preload 仍可加载本地模块，因此继续显式使用 sandbox: false。
 * contextIsolation 与 nodeIntegration 的安全边界不随文件分类改变。
 * 退出时仍挂起同一下载管理器，等待传输关闭和队列快照保存。
 * 不创建旧入口代理文件，避免后续业务代码继续新增到过期目录。
 */
/**
 * 共用 `.env`（工作区根 / exe 同目录）必须在**其它模块 require 之前**载入：
 * `agent/runner.js` 在 require 期就读 `ILLUSION_AGENT_TIMEOUT_MS`，晚一步就永远拿不到。
 * 只报键名不报值（见 agent/env.js）。
 */
require("./modules/agent/env").loadWorkspaceEnv();

const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { registerAppProtocol } = require("./core/protocol");
const { registerAllIpcHandlers } = require("./ipc/register.js");
const { readUserData } = require("./storage/user-data");
const { initialLocaleArguments } = require("../common/initial-locale");
const { windowChromeOptions, registerWindowChrome, windowChromeArguments } = require("./core/windows/window-chrome");
// 下载状态只由主进程保存，退出时等待传输关闭和磁盘快照，不依赖页面卸载事件。
// 关闭窗口后渲染进程可能已经销毁，仍应保留临时文件和队列记录供下次继续。
// 该入口不会删除用户模型、清空下载列表或保存当前认证凭据。
const { suspendDownloads } = require("./modules/models/downloads/model-download-manager");

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const PORT = process.env.PORT || 3000;
const DEV_SERVER_URL = `http://localhost:${PORT}`;
const iconPath = path.join(__dirname, "../../assets/icon.png");
const preloadPath = path.join(__dirname, "../preload/index.js");

// 自定义 app:// 协议：解决静态导出绝对路径在 file:// 下失效的问题
registerAppProtocol();

/** Reuse renderer target=_blank links; open HTTP(S) in the system browser instead of a child app window.
 * @param {import("electron").BrowserWindow} win
 */
function registerExternalLinks(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url).catch(() => {
        console.error({ level: "error", module: "external-links", message: "Failed to open the external browser" });
      });
    }
    return { action: "deny" };
  });
}

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
  const additionalArguments = [...initialLocaleArguments(readUserData()), ...windowChromeArguments()];

  const win = new BrowserWindow({
    // 界面：下载入口位于原生最小化按钮左侧。
    ...windowChromeOptions(),
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

  registerExternalLinks(win);
  registerWindowChrome(win);
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

/**
 * 下载收尾由before-quit管理，不能只依赖window-all-closed中立即app.quit。
 * 用户从窗口按钮、任务栏或应用菜单退出都会经过这条正常生命周期。
 * 等待中的重复退出请求继续preventDefault，不提前跳过文件句柄关闭。
 * 最终ready标记只由同一次收尾Promise设置，避免形成无限递归quit。
 * 异步catch仍进入finally放行退出，磁盘不可写时不会永久阻止关闭。
 * 正常退出先挂起下载并等待持久化，再重新发起一次真正退出。
 * waiting阻止重复quit请求绕过尚未完成的保存，ready只在收尾完成后放行。
 * 不直接app.exit，保留Electron既有窗口关闭与其它资源的退出生命周期。
 * 任务控制器取消会让传输finally关闭文件，磁盘快照随后记录最终断点状态。
 * 异常只记录固定模块io错误，不把模型位置、请求URL或账户信息写进日志。
 * 保存失败也允许应用退出，已有原子快照与.part仍可用于下一次恢复。
 * Electron正常退出覆盖此路径，系统强杀则依靠传输前及状态变化时的检查点。
 * 未启动下载时Promise立即结束，不为普通关闭增加人为等待时间。
 * 不设置无限计时器或等待页面确认，退出流程完全在主进程完成。
 */
let downloadsReadyToQuit = false, downloadsWaitingToQuit = false;
app.on("before-quit", (event) => {
  if (downloadsReadyToQuit) return; event.preventDefault(); if (downloadsWaitingToQuit) return;
  downloadsWaitingToQuit = true;
  void suspendDownloads().catch(() => console.error({ level: "error", module: "model-downloads", message: "queue shutdown failed", code: "io" })).finally(() => { downloadsReadyToQuit = true; app.quit(); });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

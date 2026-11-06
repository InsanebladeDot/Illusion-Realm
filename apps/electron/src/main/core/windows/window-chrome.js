/**
 * 统一桌面窗口的自定义 head：窗口按钮由 React 绘制，系统仍负责窗口尺寸与关闭。
 * Windows 的 titleBarOverlay 会单独重绘原生按钮，无法与页面主题一起提交。
 * 因而 Windows/Linux 采用无边框窗口，避免切换主题时残留旧颜色的原生控件。
 * macOS 保留系统 traffic lights，不向渲染层声明自定义标题栏支持。
 * 本模块只管理窗口配置与通知；权限受限的控制操作在 window.handlers 注册。
 */
const { IPC_CHANNELS } = require("../../../common/ipc-channels");
const CUSTOM_CHROME_ARGUMENT = "--illusion-custom-titlebar";
const supported = process.platform === "win32" || process.platform === "linux";
/**
 * 主题 handler 仍可传入已校验的 shellColor，保持现有调用契约。
 * 自定义控件直接读取页面 CSS 变量，不再维护一份独立的原生 caption 调色板。
 * 更新窗口背景仅用于首次绘制、缩放边缘及导航加载间隙，不参与按钮绘制。
 * 关闭中的窗口不再接受背景更新，避免主题异步回调访问已销毁的原生句柄。
 * 未支持自定义 head 的平台保持原来的系统标题栏行为。
 * @param {Electron.BrowserWindow | null} win 主题请求来源窗口。
 * @param {string} color 主进程主题 handler 已验证的六位十六进制颜色。
 * @returns {void}
 */
function setWindowChromeColor(win, color) { if (supported && win && !win.isDestroyed()) win.setBackgroundColor(color); }
/**
 * frame:false 移除原生标题栏及其按钮，不能同时启用 titleBarOverlay。
 * 拖动区域由页面 -webkit-app-region:drag 声明，按钮必须显式 no-drag。
 * 不改变 webPreferences；contextIsolation 与 preload 由主窗口工厂负责。
 * 系统仍保留窗口缩放、最小化、最大化和任务栏等原生生命周期。
 * @returns {Electron.BrowserWindowConstructorOptions} 支持平台的无边框配置。
 */
function windowChromeOptions() { return supported ? { frame: false, autoHideMenuBar: true } : {}; }
/**
 * 最大化状态必须读取 BrowserWindow，不能由按钮点击次数在前端推测。
 * 系统快捷键、双击拖动区域及任务栏都可能改变窗口状态。
 * 监听这些真实事件后只推送布尔值，不暴露窗口实例或任意原生配置。
 * 全屏继续隐藏整条 head，避免 3D 预览上方残留按钮与54px占位。
 * 窗口关闭时 Electron 会释放窗口自身监听器，无额外全局 nativeTheme 订阅。
 * @param {Electron.BrowserWindow} win 需要接入自定义 head 的窗口。
 * @returns {void}
 */
function registerWindowChrome(win) {
  if (!supported) return;
  // destroyed 检查覆盖系统事件与退出同时发生的边界，不向已销毁 WebContents 发消息。
  // 事件只作为状态变化通知，渲染层挂载时仍通过 IPC 查询一次初始状态。
  // 这保证窗口先最大化、后完成页面加载时也能显示「还原」图标。
  const updateMaximized = () => { if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED, win.isMaximized()); };
  const updateVisibility = () => { if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.WINDOW_CHROME_VISIBILITY, !win.isFullScreen()); };
  // 最大化和还原共享同一个状态读取，外部操作与自定义按钮不会出现两套判据。
  // 不监听 resize 来推断最大化，手动拉到屏幕大小不等同于系统最大化。
  // enter/leave-full-screen 保留既有 visibility 契约，DOM 全屏仍由页面补充处理。
  win.on("maximize", updateMaximized); win.on("unmaximize", updateMaximized);
  win.on("enter-full-screen", updateVisibility); win.on("leave-full-screen", updateVisibility);
}
/**
 * 启动参数是 preload 与页面之间的能力标记，不是 renderer 可以自行调用的 Node API。
 * 支持平台才预留 head 高度，普通浏览器预览与 macOS 不会出现无效的窗口控制按钮。
 * @returns {string[]} 随 BrowserWindow.webPreferences.additionalArguments 注入的能力参数。
 */
function windowChromeArguments() { return supported ? [CUSTOM_CHROME_ARGUMENT] : []; }
module.exports = { windowChromeOptions, registerWindowChrome, windowChromeArguments, setWindowChromeColor };

/** Add renderer content beside native caption buttons; synchronize caption colors and fullscreen visibility. */
const { nativeTheme } = require("electron");
const { IPC_CHANNELS } = require("./ipcChannels");
const WINDOW_CHROME_HEIGHT = 32;
const CUSTOM_CHROME_ARGUMENT = "--illusion-custom-titlebar";
const supported = process.platform === "win32" || process.platform === "linux";
/** @type {WeakMap<Electron.BrowserWindow, { color: string, dark: boolean }>} */
const windowShellColors = new WeakMap();
/** @param {Electron.BrowserWindow} [win]
 * @returns {Electron.TitleBarOverlayOptions} */
function overlayColors(win) {
  const dark = nativeTheme.shouldUseDarkColors;
  const palette = win && windowShellColors.get(win);
  return { color: palette && palette.dark === dark ? palette.color : dark ? "#1c1c1c" : "#f4f4f5", symbolColor: dark ? "#ededed" : "#52525b", height: WINDOW_CHROME_HEIGHT };
}
/** 颜色已由主题 handler 校验；保留原生窗口按钮，只同步按钮背后的外壳颜色。
 * @param {Electron.BrowserWindow | null} win
 * @param {string} color */
function setWindowChromeColor(win, color) {
  if (!supported || !win || win.isDestroyed()) return;
  windowShellColors.set(win, { color, dark: nativeTheme.shouldUseDarkColors });
  win.setTitleBarOverlay(overlayColors(win));
}
/** @returns {Electron.BrowserWindowConstructorOptions} */
function windowChromeOptions() {
  return supported ? { titleBarStyle: "hidden", titleBarOverlay: overlayColors(), autoHideMenuBar: true } : {};
}
/** @param {Electron.BrowserWindow} win */
function registerWindowChrome(win) {
  if (!supported) return;
  const updateTheme = () => { if (!win.isDestroyed()) win.setTitleBarOverlay(overlayColors(win)); };
  const updateVisibility = () => { if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.WINDOW_CHROME_VISIBILITY, !win.isFullScreen()); };
  nativeTheme.on("updated", updateTheme);
  win.on("enter-full-screen", updateVisibility);
  win.on("leave-full-screen", updateVisibility);
  win.once("closed", () => nativeTheme.removeListener("updated", updateTheme));
}
function windowChromeArguments() { return supported ? [CUSTOM_CHROME_ARGUMENT] : []; }
module.exports = { windowChromeOptions, registerWindowChrome, windowChromeArguments, setWindowChromeColor };

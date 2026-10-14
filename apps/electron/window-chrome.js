/** Add renderer content beside native caption buttons; synchronize caption colors and fullscreen visibility. */
const { nativeTheme } = require("electron");
const { IPC_CHANNELS } = require("./ipcChannels");
const WINDOW_CHROME_HEIGHT = 32;
const CUSTOM_CHROME_ARGUMENT = "--illusion-custom-titlebar";
const supported = process.platform === "win32" || process.platform === "linux";
/** @returns {Electron.TitleBarOverlayOptions} */
function overlayColors() {
  return { color: nativeTheme.shouldUseDarkColors ? "#27272a" : "#f4f4f5", symbolColor: nativeTheme.shouldUseDarkColors ? "#ededed" : "#52525b", height: WINDOW_CHROME_HEIGHT };
}
/** @returns {Electron.BrowserWindowConstructorOptions} */
function windowChromeOptions() {
  return supported ? { titleBarStyle: "hidden", titleBarOverlay: overlayColors(), autoHideMenuBar: true } : {};
}
/** @param {Electron.BrowserWindow} win */
function registerWindowChrome(win) {
  if (!supported) return;
  const updateTheme = () => { if (!win.isDestroyed()) win.setTitleBarOverlay(overlayColors()); };
  const updateVisibility = () => { if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.WINDOW_CHROME_VISIBILITY, !win.isFullScreen()); };
  nativeTheme.on("updated", updateTheme);
  win.on("enter-full-screen", updateVisibility);
  win.on("leave-full-screen", updateVisibility);
  win.once("closed", () => nativeTheme.removeListener("updated", updateTheme));
}
function windowChromeArguments() { return supported ? [CUSTOM_CHROME_ARGUMENT] : []; }
module.exports = { windowChromeOptions, registerWindowChrome, windowChromeArguments };

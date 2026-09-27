const { BrowserWindow, dialog, nativeTheme } = require("electron");

const { IPC_CHANNELS } = require("../ipcChannels");
const { registerHandle } = require("../ipcHandlers");

/**
 * 无边框化全屏的回退实现（3D 视窗优先用 DOM Fullscreen API）：把当前窗口切到系统全屏
 * @returns {void}
 */
function registerWindowHandlers() {
  registerHandle(
    IPC_CHANNELS.WINDOW_SET_FULL_SCREEN,
    /**
     * @param {Electron.IpcMainInvokeEvent} event
     * @param {boolean} flag
     * @returns {Promise<boolean>} 切换后的全屏状态
     */
    async (event, flag) => {
      const target = BrowserWindow.fromWebContents(event.sender);
      if (!target) return false;
      target.setFullScreen(Boolean(flag));
      return target.isFullScreen();
    },
    /** @param {unknown[]} args @returns {string | null} */
    (args) => (typeof args[0] === "boolean" ? null : "flag 必须是布尔值")
  );
}

/**
 * 深色 / 浅色 / 跟随系统：`nativeTheme.themeSource` 是 Electron 官方的
 * 「应用级覆盖 prefers-color-scheme」入口，渲染进程据此完全不需要知道主题是怎么生效的。
 *
 * 入参只接受三个字面量：脏值（渲染进程被改坏、或旧版本传了别的字符串）一律拒绝，
 * 而不是「猜一个」—— 主题猜错的症状是整屏发白/发黑，很难联想到是参数校验放水。
 *
 * @returns {void}
 */
function registerThemeHandlers() {
  registerHandle(
    IPC_CHANNELS.THEME_SET_THEME_SOURCE,
    /**
     * @param {Electron.IpcMainInvokeEvent} _event
     * @param {"system" | "light" | "dark"} source
     * @returns {Promise<string>} 生效后的 themeSource
     */
    async (_event, source) => {
      nativeTheme.themeSource = source;
      return nativeTheme.themeSource;
    },
    /** @param {unknown[]} args @returns {string | null} */
    (args) =>
      args[0] === "system" || args[0] === "light" || args[0] === "dark"
        ? null
        : "themeSource 必须是 system / light / dark"
  );
}

/**
 * 系统目录选择对话框
 * @returns {void}
 */
function registerDialogHandlers() {
  registerHandle(IPC_CHANNELS.DIALOG_SELECT_FOLDER, async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
}

module.exports = {
  registerWindowHandlers,
  registerThemeHandlers,
  registerDialogHandlers,
};

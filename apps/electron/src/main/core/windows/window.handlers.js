/**
 * 窗口主题依赖继续由 core 管理，读取 storage 不使窗口模块掌握用户文档 schema。
 */
/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 * result：业务错误不跨进程抛出，目录迁移不能改变失败形状。
 */
const { BrowserWindow, dialog, nativeTheme } = require("electron");

const { IPC_CHANNELS } = require("../../../common/ipc-channels");
const { registerHandle } = require("../../ipc/result");
const { setWindowChromeColor } = require("./window-chrome");

/** 与 shared/appearance.schema.ts 的主题请求约束保持一致。
 * @param {unknown[]} args
 * @returns {string | null} */
function validateThemeArguments(args) {
  if (args[0] !== "system" && args[0] !== "light" && args[0] !== "dark") return "themeSource 必须是 system / light / dark";
  return args[1] === undefined || (typeof args[1] === "string" && /^#[\da-f]{6}$/i.test(args[1]))
    ? null : "shellColor 必须是十六进制颜色";
}

/**
 * 无边框化全屏的回退实现（3D 视窗优先用 DOM Fullscreen API）：把当前窗口切到系统全屏
 * @returns {void}
 */
function registerWindowHandlers() {
  // 自定义 head 与既有全屏使用同一注册入口，生产启动和校验入口都会安装。
  // 独立帮助函数隔离动作校验，避免全屏布尔契约被窗口动作字符串污染。
  // 注册助手统一包装 IpcResult，异常不会泄露 Electron 堆栈到页面。
  registerWindowControl();
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
 * 自定义 head 的运行时白名单，与 shared WindowControlArgsSchema 保持同值。
 * 恰好接受一个参数，多余窗口编号、对象和拼错的动作全部拒绝。
 * state 与其他动作共用一条通道，读取状态不需要新增任意窗口查询接口。
 * 渲染层仍需处理 INVALID_ARGUMENT，静态类型无法阻止被篡改的页面调用。
 * 失败信息只说明动作非法，不包含路径、窗口标识或原生堆栈。
 * @param {unknown[]} args IPC 收到的原始参数。
 * @returns {string | null} null 表示合法，否则由注册助手返回 INVALID_ARGUMENT。
 */
function validateWindowControl(args) {
  return args.length === 1 && ["state", "minimize", "toggle-maximize", "close"].includes(/** @type {string} */ (args[0])) ? null : "窗口操作参数无效";
}

/**
 * 执行有限窗口操作；目标必须来自调用者 sender，禁止跨窗口控制。
 * 不允许页面提供窗口编号，避免工具页控制其他独立窗口。
 * BrowserWindow 查找失败说明 sender 已失去宿主，按无效目标返回结构化错误。
 * 最小化、最大化和还原均调用系统方法，保持任务栏与系统快捷键行为。
 * 返回值是执行后的实际最大化状态，而非对点击次数的推测。
 * 关闭安排到下一个任务，让本次 invoke 有机会先交还成功结果。
 * 延迟关闭前再次检查销毁状态，避免主程序退出期间重复访问句柄。
 * close() 保留既有关闭确认和资源释放；不得改为 destroy() 或 app.exit()。
 * 该延迟仅跨一个事件循环，不等待动画或页面侧 rAF。
 * @param {Electron.IpcMainInvokeEvent} event 桥接调用的真实发送者。
 * @param {string} action 已通过白名单校验的动作。
 * @returns {boolean} 目标窗口当前是否最大化。
 */
function controlWindow(event, action) {
  const target = BrowserWindow.fromWebContents(event.sender);
  if (!target || target.isDestroyed()) throw new Error("窗口不可用");
  // 最大化切换读取实时状态，连续操作或系统快捷键不会把前端缓存当事实来源。
  // state 分支故意无副作用，首次挂载也不会意外还原窗口。
  // 最小化后 isMaximized 仍可为 true，这是系统的还原目标状态，应原样返回。
  if (action === "minimize") target.minimize();
  if (action === "toggle-maximize") { if (target.isMaximized()) target.unmaximize(); else target.maximize(); }
  // 已销毁的窗口无需再次 close；关闭被用户取消时仍保留原窗口。
  // 这里不 await renderer，也不在 IPC 中等待退出，所以关闭不会形成相互等待。
  // 页面收到成功并不意味着窗口已关闭，真正结果由 Electron close 生命周期决定。
  if (action === "close") setTimeout(() => { if (!target.isDestroyed()) target.close(); }, 0);
  return target.isMaximized();
}

/**
 * 单独注册受限窗口动作，便于模块校验复用完整生产入口。
 * registerHandle 负责校验失败和原生异常的统一序列化。
 * 业务 handler 无需手动 catch 后误返回成功，也不暴露原生对象。
 * @returns {void}
 */
function registerWindowControl() { registerHandle(IPC_CHANNELS.WINDOW_CONTROL, controlWindow, validateWindowControl); }

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
     * @param {Electron.IpcMainInvokeEvent} event
     * @param {"system" | "light" | "dark"} source
     * @param {string | undefined} shellColor
     * @returns {Promise<string>} 生效后的 themeSource
     */
    async (event, source, shellColor) => {
      nativeTheme.themeSource = source;
      if (shellColor) setWindowChromeColor(BrowserWindow.fromWebContents(event.sender), shellColor);
      return nativeTheme.themeSource;
    },
    /** @param {unknown[]} args @returns {string | null} */
    validateThemeArguments
  );
}

/**
 * 系统目录选择对话框
 * @returns {void}
 */
function registerDialogHandlers() {
  registerHandle(
    IPC_CHANNELS.DIALOG_SELECT_FOLDER,
    async (_event, defaultPath) => {
      const result = await dialog.showOpenDialog({
        defaultPath: typeof defaultPath === "string" && defaultPath.trim()
          ? defaultPath.trim()
          : undefined,
        properties: ["openDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths[0];
    },
    (args) =>
      args.length === 0 ||
      args[0] === undefined ||
      (typeof args[0] === "string" && args[0].trim().length > 0)
        ? null
        : "defaultPath 必须是非空字符串"
  );
}

module.exports = {
  registerWindowHandlers,
  registerThemeHandlers,
  registerDialogHandlers,
};

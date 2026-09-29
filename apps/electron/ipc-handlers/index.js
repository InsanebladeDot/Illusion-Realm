/**
 * IPC handler 汇总注册入口。
 *
 * 分工：
 * - 本目录（ipc-handlers/*.handlers.js）承载原先散落在 main.js 里的 handler；
 * - video / view3d 仍在 ../ffmpeg 内注册，animadex 仍在 ../animadex 内注册
 *   （这两个文件本身就是按域聚合的，且被 scripts/ 下的 verify / smoke 脚本直接引用，
 *    迁移它们会改变既有调用约定，收益为零）。
 */
const {
  registerWindowHandlers,
  registerThemeHandlers,
  registerDialogHandlers,
} = require("./window.handlers");
const { registerModelHandlers } = require("./models.handlers");
const { registerFileHandlers } = require("./files.handlers");
const { registerComfyHandlers } = require("./comfy.handlers");
const { registerPathHandlers } = require("./paths.handlers");
const { registerShellHandlers } = require("./shell.handlers");
const {
  registerUserDataHandlers,
  registerChangelogHandlers,
} = require("./user-data.handlers");
const { registerVideoToolIpc } = require("../ffmpeg");
const { registerAnimadexIpc } = require("../animadex");
const { registerAgentHandlers } = require("./agent.handlers");

const { ipcMain } = require("electron");

/**
 * 域 → 注册函数。显式标注为元组数组：否则 TS 会推断成 (string | Function)[]，
 * 解构出的 name / register 都是联合类型，`register()` 会报「表达式不可调用」。
 * @type {Array<[string, () => void]>}
 */
const REGISTRATIONS = [
  ["window", registerWindowHandlers],
  ["theme", registerThemeHandlers],
  ["dialog", registerDialogHandlers],
  ["models", registerModelHandlers],
  ["files", registerFileHandlers],
  ["comfy", registerComfyHandlers],
  ["paths", registerPathHandlers],
  ["shell", registerShellHandlers],
  ["userData", registerUserDataHandlers],
  ["changelog", registerChangelogHandlers],
  ["video", () => registerVideoToolIpc()],
  ["animadex", () => registerAnimadexIpc()],
  ["agent", registerAgentHandlers],
];

/**
 * 按域注册全部 IPC handler
 * @returns {void}
 */
function registerAllIpcHandlers() {
  /** @type {string[]} */
  const failed = [];

  for (const [name, register] of REGISTRATIONS) {
    try {
      register();
      console.log(`[IPC] ✅ ${name} handlers registered`);
    } catch (error) {
      failed.push(name);
      console.error(`[IPC] ❌ ${name} handlers failed:`, error);
    }
  }

  if (failed.length > 0) {
    throw new Error(`[IPC] 以下域注册失败: ${failed.join(", ")}`);
  }

  console.log("[IPC] 🎉 All handlers registered");
}

module.exports = { registerAllIpcHandlers, REGISTRATIONS };

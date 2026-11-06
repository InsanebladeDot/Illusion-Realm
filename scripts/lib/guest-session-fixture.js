/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 */
// 业务页面夹具只隔离游客的本地凭据清理，不触碰用户真实账户文件。
// helper 在 Electron 主进程内使用；各冒烟单独进程执行，注册互不影响。
// 只安装一次，重复读取用户文档不会重新覆盖后续测试自定义 handler。
let guestEntryInstalled = false;
/**
 * 为复用游客文档的业务冒烟安装无副作用的清理替身。
 * 这些用例测试生成、编辑或布局，不验证真实账户令牌文件的删除。
 * 登录专项和契约回归单独验证生产清理 handler，不能用此替身代替。
 * 返回值继续由 registerHandle 包装成 IpcResult<void>，与真实契约一致。
 * 不提供假账户资料或访问令牌，也不请求账户服务器。
 */
function installGuestEntryFixture() {
  // 某些用例在 USER_DATA_READ 回调中重复调用 withGuestSession，此时仍只注册一次。
  // registerHandle 会移除同名旧 handler，避免反复调用而覆盖本用例后续的负向替身。
  // 已安装标志只有注册成功才置位，模块加载异常不会制造假安装状态。
  // 本 helper 必须由 Electron 执行，不向普通 Node 暴露一个伪 ipcMain。
  // 每条冒烟是独立进程，不需要持久化该标志或在用户文档中写测试字段。
  // 只覆盖游客清理通道，不覆盖账户资料、登录、模型或 ComfyUI 通道。
  if (guestEntryInstalled) return;
  const { IPC_CHANNELS } = require("../../apps/electron/src/common/ipc-channels");
  require("../../apps/electron/src/main/ipc/result").registerHandle(IPC_CHANNELS.ACCOUNT_ENTER_GUEST, () => undefined);
  guestEntryInstalled = true;
}
/**
 * 业务页面统一使用 v2 长期游客格式，登录专项仍自行构造旧记录和空入口。
 * 生成 fixture 时同时准备本地清理 IPC，避免新认证前置条件使旧冒烟失效。
 * 此处不声称完成真实清理，只保证测试不碰用户凭据且能挂载本地页面。
 * 覆盖 entrySession 的行为与旧 helper 一致，不覆盖传入的其他 section。
 */
function withGuestSession(data = {}) {
  // 先准备认证前置条件再返回数据，避免 renderer 在清理通道未就绪时开始水合。
  // 调用者仍负责自己的 USER_DATA_READ/WRITE，已有夹具的文档语义不改变。
  // v2 是正式新格式，旧记录迁移必须由登录专项测试单独覆盖，不能在此混测。
  installGuestEntryFixture();
  const startedAt = Date.now();
  return { ...data, entrySession: { guest: { version: 2, startedAt } } };
}
/** Agent suites keep an isolated in-memory document instead of writing a guest into the user's real settings. */
function installGuestDocumentFixture() {
  const { ipcMain } = require("electron");
  const { IPC_CHANNELS } = require("../../apps/electron/src/common/ipc-channels");
  const { registerHandle } = require("../../apps/electron/src/main/ipc/result");
  let data = withGuestSession({ version: 1, settings: { paths: {}, locale: "zh-CN", theme: "light" } });
  ipcMain.removeHandler(IPC_CHANNELS.USER_DATA_READ);
  ipcMain.removeHandler(IPC_CHANNELS.USER_DATA_WRITE);
  registerHandle(IPC_CHANNELS.USER_DATA_READ, () => ({ data, filePath: "", isNew: false }));
  registerHandle(IPC_CHANNELS.USER_DATA_WRITE, (_event, next) => { data = next; });
}
module.exports = { withGuestSession, installGuestDocumentFixture };

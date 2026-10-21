/** Business-page smoke fixtures enter as a valid guest; login-specific tests supply their own expired/empty records. */
function withGuestSession(data = {}) {
  const startedAt = Date.now();
  return { ...data, entrySession: { guest: { startedAt, expiresAt: startedAt + 3600000 } } };
}
/** Agent suites keep an isolated in-memory document instead of writing a guest into the user's real settings. */
function installGuestDocumentFixture() {
  const { ipcMain } = require("electron");
  const { IPC_CHANNELS } = require("../../apps/electron/ipcChannels");
  const { registerHandle } = require("../../apps/electron/ipcHandlers");
  let data = withGuestSession({ version: 1, settings: { paths: {}, locale: "zh-CN", theme: "light" } });
  ipcMain.removeHandler(IPC_CHANNELS.USER_DATA_READ);
  ipcMain.removeHandler(IPC_CHANNELS.USER_DATA_WRITE);
  registerHandle(IPC_CHANNELS.USER_DATA_READ, () => ({ data, filePath: "", isNew: false }));
  registerHandle(IPC_CHANNELS.USER_DATA_WRITE, (_event, next) => { data = next; });
}
module.exports = { withGuestSession, installGuestDocumentFixture };

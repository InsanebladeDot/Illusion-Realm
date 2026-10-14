/** Register native download, category lookup and logo replacement through the standard IPC boundary. */
const { IPC_CHANNELS } = require("../ipcChannels");
const { registerHandle } = require("../ipcHandlers");
const { downloadTarget } = require("../services/model-download-paths");
const { startDownload, listDownloads, cancelDownload, retryDownload, removeDownload, changeLogo } = require("../services/model-download-manager");
const { validateDownload, validateLocation, validateString, validateCategoryMove, validateModelBatch } = require("../services/model-download-validation");
const { categoryTarget, moveCategory, operateModels } = require("../services/model-category-manager");
function registerModelDownloadHandlers() {
  registerHandle(IPC_CHANNELS.MODELS_DOWNLOAD_TARGET, (_event, location) => {
    try { return downloadTarget(location); } catch { throw new Error("configuration"); }
  }, validateLocation);
  registerHandle(IPC_CHANNELS.MODELS_DOWNLOAD_START, (event, request) => startDownload(event.sender, request), validateDownload);
  registerHandle(IPC_CHANNELS.MODELS_DOWNLOAD_LIST, (event) => listDownloads(event.sender.id), (args) => args.length ? "invalid" : null);
  registerHandle(IPC_CHANNELS.MODELS_DOWNLOAD_CANCEL, (event, id) => cancelDownload(event.sender.id, id), validateString);
  registerHandle(IPC_CHANNELS.MODELS_DOWNLOAD_RETRY, (event, id) => retryDownload(event.sender.id, id), validateString);
  registerHandle(IPC_CHANNELS.MODELS_DOWNLOAD_REMOVE, (event, id) => removeDownload(event.sender.id, id), validateString);
  registerHandle(IPC_CHANNELS.MODELS_CHANGE_LOGO, (event, folder) => changeLogo(event.sender, folder), validateString);
  registerHandle(IPC_CHANNELS.MODELS_CATEGORY_TARGET, (_event, folder) => {
    try { return categoryTarget(folder); } catch (error) { throw new Error(error instanceof Error && ["invalid", "layout", "configuration"].includes(error.message) ? error.message : "io"); }
  }, validateString);
  registerHandle(IPC_CHANNELS.MODELS_MOVE_CATEGORY, (_event, request) => moveCategory(request), validateCategoryMove);
  registerHandle(IPC_CHANNELS.MODELS_BATCH, (_event, request) => operateModels(request), validateModelBatch);
}
module.exports = { registerModelDownloadHandlers };

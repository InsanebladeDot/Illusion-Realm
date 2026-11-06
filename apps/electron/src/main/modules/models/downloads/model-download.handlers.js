/**
 * 下载 handler 的本地依赖指向唯一管理器实例，避免页面订阅一份状态而任务写另一份。
 * 分类移动实现位于 models 父域，路径输入仍由下载校验器先检查。
 * 网络传输和磁盘目录的校验保持原有先后顺序。
 * 下载事件的消息结构保持不变，不要求 renderer 随主进程目录同时迁移。
 */
/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 * result：业务错误不跨进程抛出，目录迁移不能改变失败形状。
 */
/** Register native download, category lookup and logo replacement through the standard IPC boundary. */
const { IPC_CHANNELS } = require("../../../../common/ipc-channels");
const { registerHandle } = require("../../../ipc/result");
const { downloadTarget } = require("./model-download-paths");
// 下载开始与列表读取都等待旧队列恢复，不能让新任务先覆盖上次退出的清单。
// 恢复绑定当前sender，后续取消、重试、移除仍沿用现有owner校验。
// I/O错误由registerHandle统一转换成IpcResult，不跨边界泄露磁盘错误堆栈。
const { restoreDownloads, startDownload, listDownloads, cancelDownload, retryDownload, removeDownload, changeLogo } = require("./model-download-manager");
const { validateDownload, validateLocation, validateString, validateCategoryMove, validateModelBatch } = require("./model-download-validation");
const { categoryTarget, moveCategory, operateModels } = require("../model-category-manager");
function registerModelDownloadHandlers() {
  registerHandle(IPC_CHANNELS.MODELS_DOWNLOAD_TARGET, (_event, location) => {
    try { return downloadTarget(location); } catch { throw new Error("configuration"); }
  }, validateLocation);
  // 参数校验仍先于handler执行，非法请求不会触发队列认领或任何网络传输。
  // 首次启动是异步磁盘恢复；同一窗口并发调用共享一个恢复Promise。
  // 新任务注册仍由主进程管理，渲染层不用再保存一份可能失真的断点状态。
  registerHandle(IPC_CHANNELS.MODELS_DOWNLOAD_START, async (event, request) => { await restoreDownloads(event.sender); return startDownload(event.sender, request); }, validateDownload);
  // 列表在全部记录校正后返回，界面不会先显示空队列再丢失后续恢复事件。
  // 上次下载中任务会成为已有可继续状态，速度清零，已完成记录继续保留。
  // 空参数约束保持原契约，不新增可以由页面指定任意目录的恢复入口。
  registerHandle(IPC_CHANNELS.MODELS_DOWNLOAD_LIST, async (event) => { await restoreDownloads(event.sender); return listDownloads(event.sender.id); }, (args) => args.length ? "invalid" : null);
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

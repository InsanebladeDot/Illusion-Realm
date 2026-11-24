/** 安装清单复用原下载中心：先保存 models 配置，再提交预设编号并合并真实队列快照。 */
import { SetupCheckModeSchema, SetupDownloadIdsSchema, type SetupCheckMode, type SetupDownloadId } from "@illusion-realm/shared";
import { getElectronAPI } from "@/utils/electronBridge";
import { flushUserDataSave } from "@/utils/userDataStorage";
import { unwrapIpc } from "@/utils/ipcResult";
import { useModelDownloadStore } from "@/stores/useModelDownloadStore";

export async function downloadSetupModels(ids: SetupDownloadId[]) {
  const api = getElectronAPI();
  if (!api?.downloadSetupModels) throw new Error("desktop");
  const selection = SetupDownloadIdsSchema.parse(ids);
  await flushUserDataSave();
  const result = unwrapIpc(await api.downloadSetupModels(selection));
  for (const item of result.items) if (item.task) useModelDownloadStore.getState().update(item.task);
  return result;
}

/** 只传清单编号，主进程从已保存的 models 设置取目标目录。 */
export async function checkSetupModels(ids: SetupDownloadId[], mode: SetupCheckMode) {
  const api = getElectronAPI();
  if (!api?.checkSetupModels) throw new Error("desktop");
  await flushUserDataSave();
  return unwrapIpc(await api.checkSetupModels(SetupDownloadIdsSchema.parse(ids), SetupCheckModeSchema.parse(mode)));
}

/** Move local model folders through validated IPC; persist configured paths first and translate stable native errors. */
import { LocalModelBatchRequestSchema, MoveModelCategoryRequestSchema, type LocalModelBatchRequest, type MoveModelCategoryRequest } from "@illusion-realm/shared";
import { t } from "@/i18n";
import { getModelDownloadAPI } from "@/utils/electronBridge";
import { unwrapIpc } from "@/utils/ipcResult";
import { flushUserDataSave } from "@/utils/userDataStorage";
import { downloadErrorMessage } from "@/utils/model-downloads";

export async function getLocalModelCategoryTarget(folderPath: string) {
  const api = getModelDownloadAPI();
  if (typeof api.localModelCategoryTarget !== "function") throw new Error("desktop");
  await flushUserDataSave();
  return unwrapIpc(await api.localModelCategoryTarget(folderPath));
}
export async function moveLocalModelCategory(request: MoveModelCategoryRequest) {
  if (!MoveModelCategoryRequestSchema.safeParse(request).success) throw new Error("invalid");
  const api = getModelDownloadAPI();
  if (typeof api.moveModelCategory !== "function") throw new Error("desktop");
  await flushUserDataSave();
  return unwrapIpc(await api.moveModelCategory(request));
}
export function modelCategoryError(error: unknown) {
  switch (error instanceof Error ? error.message : error) {
    case "layout": return t("toolBox.civitai.categoryMove.layout");
    case "crossRoot": return t("toolBox.civitai.categoryMove.crossRoot");
    case "busy": return t("toolBox.civitai.categoryMove.busy");
    case "exists": return t("toolBox.civitai.categoryMove.exists");
    case "io": return t("toolBox.civitai.categoryMove.io");
    default: return downloadErrorMessage(error);
  }
}
export async function operateLocalModels(request: LocalModelBatchRequest) {
  if (!LocalModelBatchRequestSchema.safeParse(request).success) throw new Error("invalid");
  const api = getModelDownloadAPI();
  if (typeof api.operateLocalModels !== "function") throw new Error("desktop");
  await flushUserDataSave();
  return unwrapIpc(await api.operateLocalModels(request));
}

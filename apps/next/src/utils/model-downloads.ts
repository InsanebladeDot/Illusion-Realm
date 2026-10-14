/** Native download bridge: validate requests, flush settings, and translate stable native errors. */
import { ModelDownloadRequestSchema, type ModelDownloadLocation, type ModelDownloadError, type ModelDownloadRequest } from "@illusion-realm/shared";
import { t } from "@/i18n";
import { unwrapIpc } from "@/utils/ipcResult";
import { flushUserDataSave } from "@/utils/userDataStorage";
import { getModelDownloadAPI } from "@/utils/electronBridge";

export function modelDownloadApi() {
  return getModelDownloadAPI();
}
export async function getModelDownloadTarget(location: ModelDownloadLocation) {
  await flushUserDataSave();
  return unwrapIpc(await modelDownloadApi().modelDownloadTarget(location));
}
export async function startModelDownload(request: ModelDownloadRequest) {
  if (!ModelDownloadRequestSchema.safeParse(request).success) throw new Error("invalid");
  await flushUserDataSave();
  return unwrapIpc(await modelDownloadApi().startModelDownload(request));
}
export function downloadErrorMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : error;
  switch (value as ModelDownloadError | "desktop") {
    case "configuration": return t("toolBox.civitai.transfer.errors.configuration");
    case "invalid": return t("toolBox.civitai.transfer.errors.invalid");
    case "exists": return t("toolBox.civitai.transfer.errors.exists");
    case "auth": return t("toolBox.civitai.transfer.errors.auth");
    case "redirect": return t("toolBox.civitai.transfer.errors.redirect");
    case "timeout": return t("toolBox.civitai.transfer.errors.timeout");
    case "response": return t("toolBox.civitai.transfer.errors.response");
    case "integrity": return t("toolBox.civitai.transfer.errors.integrity");
    case "io": return t("toolBox.civitai.transfer.errors.io");
    case "desktop": return t("toolBox.civitai.transfer.errors.desktop");
    default: return t("toolBox.civitai.transfer.errors.network");
  }
}
export function readLogoFile(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) return Promise.reject(new Error("invalid"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("invalid"));
    reader.onerror = () => reject(new Error("io"));
    reader.onabort = () => reject(new Error("io"));
    reader.readAsDataURL(file);
  });
}

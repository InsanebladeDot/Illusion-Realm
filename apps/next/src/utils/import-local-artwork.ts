/** 导入原始图片：保留图片字节与元数据，通过现有保存 IPC 写到当前浏览目录，随机后缀避免重名覆盖。 */
import { unwrapIpc } from "@/utils/ipcResult";
import { t } from "@/i18n";

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result.split(",")[1]) : reject(new Error(t("create.workspace.importFailed")));
    reader.onerror = () => reject(new Error(t("create.workspace.importFailed")));
    reader.onabort = () => reject(new Error(t("create.workspace.importFailed")));
    reader.readAsDataURL(file);
  });
}

export async function importLocalArtwork(files: File[], directory: string): Promise<number> {
  const api = window.electronAPI;
  if (!api?.saveGeneratedImages || !directory) throw new Error(t("create.workspace.importFailed"));
  if (files.some(file => !/\.(png|jpe?g|webp)$/i.test(file.name) || file.size > 50 * 1024 * 1024)) throw new Error(t("create.workspace.importInvalid"));
  let count = 0;
  for (const file of files) {
    const suffix = file.name.match(/\.[^.]+$/)?.[0] ?? ".png";
    const filename = `${file.name.slice(0, -suffix.length).replace(/[^\p{L}\p{N}_-]/gu, "_").slice(0, 80)}-${crypto.randomUUID()}${suffix}`;
    const dataBase64 = await readImage(file);
    count += unwrapIpc(await api.saveGeneratedImages(directory, [{ filename, dataBase64 }])).length;
  }
  return count;
}

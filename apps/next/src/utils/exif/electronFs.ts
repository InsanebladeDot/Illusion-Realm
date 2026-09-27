/**
 * EXIF 工具的 Electron 文件系统封装：选择文件夹、列出图片、读取字节、批量写出。
 * 仅 Electron 环境可用，浏览器环境下安全返回空结果。
 */
import {
  isElectronEnvironment,
  readLocalImage,
  selectLocalFolder,
} from "@/utils/electronBridge";
import { unwrapIpcOr } from "@/utils/ipcResult";

export type ImageFileEntry = {
  filePath: string;
  fileName: string;
};

export async function pickFolder(): Promise<string | null> {
  return selectLocalFolder();
}

export async function listImageFiles(
  folderPath: string
): Promise<ImageFileEntry[]> {
  if (!isElectronEnvironment() || !window.electronAPI?.listImageFiles) {
    return [];
  }
  if (!folderPath?.trim()) return [];
  return unwrapIpcOr(
    await window.electronAPI.listImageFiles(folderPath.trim()),
    [],
    "listImageFiles"
  );
}

export async function readFileAsArrayBuffer(
  filePath: string
): Promise<ArrayBuffer | null> {
  const dataUrl = await readLocalImage(filePath);
  if (!dataUrl) return null;

  const commaIndex = dataUrl.indexOf(",");
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export async function writeFilesToFolder(
  folderPath: string,
  files: Array<{ filename: string; dataBase64: string }>
): Promise<string[]> {
  if (
    !isElectronEnvironment() ||
    !window.electronAPI?.saveGeneratedImages ||
    files.length === 0
  ) {
    return [];
  }
  return unwrapIpcOr(
    await window.electronAPI.saveGeneratedImages(folderPath, files),
    [],
    "saveGeneratedImages"
  );
}

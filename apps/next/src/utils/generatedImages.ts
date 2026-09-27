/**
 * 生成图与输出目录文件夹的读写封装（列表 / 删除 / 重命名 / 移动 / 建删文件夹）。
 *
 * 怎么做：全部走 `files:*` IPC，先做能力探测（旧主进程缺通道时给可读失败）；
 * 返回形状见各 `XxxResult` 类型定义。
 */
import type {
  GeneratedImageFile,
  OutputFolderEntry,
} from "@/types/historyFolder";
import {
  hasDeleteFolderSupport,
  hasDeleteImagesSupport,
  hasRenameGeneratedImageSupport,
  hasSaveImageAsSupport,
  isElectronEnvironment,
} from "@/utils/electronBridge";
import { unwrapIpc, unwrapIpcOr } from "@/utils/ipcResult";
import { t } from "@/i18n";

/** 与主进程返回、shared 声明的条目**同一个类型**（别名只为保留历史调用点） */
export type OutputFolderDiskEntry = OutputFolderEntry;

export type DeleteFolderPreview = {
  imageCount: number;
  sidecarCount: number;
  subfolderCount: number;
};

export type DeleteFolderResult = {
  deletedImageCount: number;
  deletedSidecarCount: number;
  deletedSubfolderCount: number;
};

export type DeleteImagesResult = {
  deletedImageCount: number;
  deletedSidecarCount: number;
  skippedCount: number;
};

export type RenameGeneratedImageResult = {
  oldPath: string;
  filePath: string;
  fileName: string;
  modifiedAt: number;
};

export async function listGeneratedImages(
  outputPath: string,
  folderDirPath: string | null = null
): Promise<GeneratedImageFile[]> {
  if (isElectronEnvironment() && window.electronAPI?.listGeneratedImages) {
    return unwrapIpcOr(
      await window.electronAPI.listGeneratedImages(outputPath, folderDirPath),
      [],
      "listGeneratedImages"
    );
  }
  return [];
}

export async function listOutputFoldersOnDisk(
  outputPath: string
): Promise<OutputFolderDiskEntry[]> {
  if (isElectronEnvironment() && window.electronAPI?.listOutputFolders) {
    return unwrapIpcOr(
      await window.electronAPI.listOutputFolders(outputPath),
      [],
      "listOutputFolders"
    );
  }
  return [];
}

export async function createHistoryFolderOnDisk(
  outputPath: string,
  folderName: string,
  parentDirPath: string | null = null
): Promise<{
  dirPath: string;
  name: string;
  parentDirPath: string | null;
  depth: number;
}> {
  if (!isElectronEnvironment() || !window.electronAPI?.createHistoryFolder) {
    throw new Error(t("errors.desktopOnly.createFolder"));
  }
  return unwrapIpc(
    await window.electronAPI.createHistoryFolder(outputPath, folderName, parentDirPath)
  );
}

export async function previewDeleteHistoryFolderOnDisk(
  outputPath: string,
  folderDirPath: string
): Promise<DeleteFolderPreview> {
  if (!hasDeleteFolderSupport()) {
    throw new Error(
      isElectronEnvironment()
        ? t("errors.desktopOnly.bridgeMissing")
        : t("errors.desktopOnly.deleteFolder")
    );
  }

  return unwrapIpc(
    await window.electronAPI!.previewDeleteHistoryFolder!(outputPath, folderDirPath)
  );
}

export async function deleteHistoryFolderOnDisk(
  outputPath: string,
  folderDirPath: string
): Promise<DeleteFolderResult> {
  if (!hasDeleteFolderSupport()) {
    throw new Error(
      isElectronEnvironment()
        ? t("errors.desktopOnly.bridgeMissing")
        : t("errors.desktopOnly.deleteFolder")
    );
  }

  return unwrapIpc(
    await window.electronAPI!.deleteHistoryFolder!(outputPath, folderDirPath)
  );
}

export async function deleteGeneratedImagesOnDisk(
  outputPath: string,
  filePaths: string[]
): Promise<DeleteImagesResult> {
  if (!hasDeleteImagesSupport()) {
    throw new Error(
      isElectronEnvironment()
        ? t("errors.desktopOnly.bridgeMissing")
        : t("errors.desktopOnly.deleteImages")
    );
  }

  return unwrapIpc(
    await window.electronAPI!.deleteGeneratedImages!(outputPath, filePaths)
  );
}

export async function saveGeneratedImageAsOnDisk(
  outputPath: string,
  filePath: string
): Promise<string | null> {
  if (!hasSaveImageAsSupport()) {
    throw new Error(t("errors.desktopOnly.saveImageAs"));
  }

  return unwrapIpc(
    await window.electronAPI!.saveImageAs!(outputPath, filePath)
  );
}

export async function renameGeneratedImageOnDisk(
  outputPath: string,
  filePath: string,
  newFileName: string
): Promise<RenameGeneratedImageResult> {
  if (!hasRenameGeneratedImageSupport()) {
    throw new Error(t("errors.desktopOnly.renameImage"));
  }

  return unwrapIpc(
    await window.electronAPI!.renameGeneratedImage!(
      outputPath,
      filePath,
      newFileName
    )
  );
}

export function resolveSaveOutputPath(
  baseOutputPath: string,
  folderDirPath: string | null
): string {
  return folderDirPath ?? baseOutputPath;
}

export async function moveImagesToFolderOnDisk(
  outputPath: string,
  targetFolderDirPath: string,
  filePaths: string[]
): Promise<string[]> {
  if (!isElectronEnvironment() || !window.electronAPI?.moveImagesToFolder) {
    throw new Error(t("errors.desktopOnly.addImages"));
  }
  return unwrapIpc(
    await window.electronAPI.moveImagesToFolder(
      outputPath,
      targetFolderDirPath,
      filePaths
    )
  );
}

export function isImageInFolder(
  filePath: string,
  folderDirPath: string
): boolean {
  const normalizedFolder = folderDirPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedFile = filePath.replace(/\\/g, "/");
  const folderPrefix = `${normalizedFolder}/`;
  return (
    normalizedFile.startsWith(folderPrefix) &&
    !normalizedFile.slice(folderPrefix.length).includes("/")
  );
}

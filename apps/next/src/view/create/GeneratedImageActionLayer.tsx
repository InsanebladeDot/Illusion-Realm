"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useHistoryFolderStore } from "@/stores/useHistoryFolderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
// 右键与批量整理使用同一个移动流程，取消/失败/重名处理不能各写一份。
import { useMoveGeneratedImages } from "@/hooks/use-move-generated-images";
import {
  saveGeneratedImageAsOnDisk,
} from "@/utils/generatedImages";
import {
  hasDeleteImagesSupport,
  hasRenameGeneratedImageSupport,
  hasSaveImageAsSupport,
} from "@/utils/electronBridge";
import { DeleteImagesDialog } from "@/view/create/DeleteImagesDialog";
import { GeneratedImageContextMenu } from "@/view/create/GeneratedImageContextMenu";
import { RenameImageDialog } from "@/view/create/RenameImageDialog";
import type { GeneratedImageFile } from "@/types/historyFolder";

export type GeneratedImageActionHandle = {
  openContextMenu: (
    clientX: number,
    clientY: number,
    image: GeneratedImageFile
  ) => void;
};

type GeneratedImageActionLayerProps = {
  onRenamed?: (oldPath: string, image: GeneratedImageFile) => void;
  onDeleted?: (filePaths: string[]) => void;
  // 移动后的旧路径失效；调用方只清对应预览，不能把整理当成删除文件。
  onMoved?: (filePaths: string[]) => void;
};

/**
 * 图片文件操作层：把右键菜单、在线改名、删除确认收在一处。
 *
 * 缩略图和详情大图共用同一个实例，避免「图片网格里能删、详情里不能删」这类行为分叉。
 */
export const GeneratedImageActionLayer = forwardRef<
  GeneratedImageActionHandle,
  GeneratedImageActionLayerProps
>(function GeneratedImageActionLayer({ onRenamed, onDeleted, onMoved }, ref) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const outputPath = useSettingsStore((state) => state.outputPath);
  const refreshGeneratedImages = useHistoryFolderStore(
    (state) => state.refreshGeneratedImages
  );
  const refreshFolders = useHistoryFolderStore((state) => state.refreshFolders);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    image: GeneratedImageFile;
  } | null>(null);
  const [renameTarget, setRenameTarget] =
    useState<GeneratedImageFile | null>(null);
  const [pendingDeletePaths, setPendingDeletePaths] = useState<string[]>([]);
  // 目标路径来自当前右键图片快照，不根据批量勾选或可见页序号寻找源文件。
  // 成功刷新在共用 Hook 完成，此处只通知旧预览可以关闭；取消不触发回调。
  // 右键图片参数随菜单打开时固定，批量选中数不是单图移动的输入。
  // 菜单关闭后本操作层仍挂载，目录框结果不会因为菜单DOM消失而丢失。
  // moving只控制本层再次提交，保存与删除仍走各自原来的确认边界。
  // onMoved是可选通知，非创建页调用方没有stage也能使用相同文件整理能力。
  // 不把新目录路径写进renameTarget，移动与在线改名仍是不同业务操作。
  // pendingDeletePaths不会因移动菜单点击被填充，避免出现第二次删除原文件的请求。
  // 真实移动失败只显示hook的错误，不主动将当前菜单目标从图库列表移除。
  // 列表重读由统一刷新触发，菜单层不维护另一套生成图片数组。
  // 同一详情大图和缩略图通过原imperativeHandle打开菜单，入口没有复制文件操作UI。
  // 这里不注册另一个全局contextmenu监听，原页面的文本输入菜单不受影响。
  // 生成图名称仅用于显示，传给移动流程的仍是image.filePath完整身份。
  // 避免按当前图库序号取图，分页或排序之后也能搬运最初右键的那一张。
  const imageMove = useMoveGeneratedImages(paths => onMoved?.(paths));

  useImperativeHandle(
    ref,
    () => ({
      openContextMenu: (clientX, clientY, image) => {
        setMenu({ x: clientX, y: clientY, image });
      },
    }),
    []
  );

  const handleSaveAs = async (image: GeneratedImageFile) => {
    if (!hasSaveImageAsSupport()) {
      showToast(t("create.generatedImageContextMenu.saveUnsupported"));
      return;
    }

    try {
      const savedPath = await saveGeneratedImageAsOnDisk(
        outputPath,
        image.filePath
      );
      showToast(
        savedPath
          ? t("create.generatedImageContextMenu.saved")
          : t("create.generatedImageContextMenu.saveCanceled")
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("create.generatedImageContextMenu.saveFailed");
      showToast(message);
    }
  };

  const handleRequestRename = (image: GeneratedImageFile) => {
    if (!hasRenameGeneratedImageSupport()) {
      showToast(t("create.generatedImageContextMenu.renameUnsupported"));
      return;
    }
    setRenameTarget(image);
  };

  const handleRequestDelete = (image: GeneratedImageFile) => {
    if (!hasDeleteImagesSupport()) {
      showToast(t("create.createHistorySidebar.deleteUnsupported"));
      return;
    }
    setPendingDeletePaths([image.filePath]);
  };

  return (
    <>
      {menu ? (
        <GeneratedImageContextMenu
          x={menu.x}
          y={menu.y}
          imageName={menu.image.fileName}
          onSaveAs={() => void handleSaveAs(menu.image)}
          onRename={() => handleRequestRename(menu.image)}
          onMove={() => void imageMove.move([menu.image.filePath])}
          moving={imageMove.moving}
          onDelete={() => handleRequestDelete(menu.image)}
          onClose={() => setMenu(null)}
        />
      ) : null}

      <RenameImageDialog
        open={Boolean(renameTarget)}
        image={renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        onRenamed={(oldPath, image) => {
          refreshGeneratedImages();
          refreshFolders();
          onRenamed?.(oldPath, image);
        }}
      />

      <DeleteImagesDialog
        open={pendingDeletePaths.length > 0}
        filePaths={pendingDeletePaths}
        onOpenChange={(open) => {
          if (!open) setPendingDeletePaths([]);
        }}
        onDeleted={() => {
          onDeleted?.(pendingDeletePaths);
          setPendingDeletePaths([]);
        }}
      />
    </>
  );
});

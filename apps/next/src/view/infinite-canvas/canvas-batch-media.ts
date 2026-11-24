/** 已有节点只复用地址；全局库素材按200份分批复制到工程，再一次创建节点和撤销记录。 */
import { t } from "@/i18n";
import { unwrapIpc } from "@/utils/ipcResult";
import type { XYPosition } from "@xyflow/react";
import type { useCanvasEditor } from "./use-canvas-editor";
import { createMediaNode, type CanvasMedia } from "./canvas-media-import";

export async function addBatchCanvasMedia(editor: ReturnType<typeof useCanvasEditor>, media: CanvasMedia[], position: XYPosition, copy: boolean, active: () => boolean) {
  let workspace = editor.workspace;
  let complete = true;
  const imported: CanvasMedia[] = [];
  for (let offset = 0; offset < media.length; offset += 200) {
    if (!active()) return false;
    const files = media.slice(offset, offset + 200);
    if (!copy) { imported.push(...files); continue; }
    const response = unwrapIpc(await window.electronAPI!.canvasImportMedia({ name: editor.name, workspace, mode: "copy", files }));
    workspace = response.workspace; imported.push(...response.media);
    complete = complete && response.rejected.length === 0;
  }
  // 关闭选择页后不把迟到的文件复制结果塞回另一个工程。
  if (!active()) return false;
  if (workspace) editor.setWorkspace(workspace);
  editor.importMedia(imported.map((item, index) => createMediaNode(item, position, index)));
  editor.notify(
    t(complete ? "canvas.imported" : "canvas.resourcePartialFailure", { count: imported.length }),
    complete ? "success" : "error",
  );
  return complete;
}

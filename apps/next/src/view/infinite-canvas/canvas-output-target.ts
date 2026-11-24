/** 画布生成只接收主进程给出的工程分类目录，不按标题或外部设置拼接磁盘路径。 */
import { unwrapIpc } from "@/utils/ipcResult";
import type { CanvasDocument } from "./canvas-model";
import type { GenerationOutputTarget } from "@/utils/image-generation-queue";

export async function canvasOutputTarget(document: Pick<CanvasDocument, "name" | "workspace">, kind: "image" | "video" | "audio") {
  const api = window.electronAPI;
  if (!api) throw Error("canvas-output-unavailable");
  // 空导入只准备/校验归属，不复制素材；同一接口也确保三类目录没有被换成链接。
  const result = unwrapIpc(await api.canvasImportMedia({ name: document.name, workspace: document.workspace, files: [] }));
  const path = result.outputDirectories[kind];
  if (!path) throw Error("canvas-output-unavailable");
  const target: GenerationOutputTarget = { path, folderId: path };
  return { workspace: result.workspace, target };
}

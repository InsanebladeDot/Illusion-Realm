/** 正式工程按编号读写独立数据库；旧单草稿适配器仅保留给兼容调用方。 */
import type { CanvasLibraryEntry, CanvasLibraryRequest, CanvasLibrarySnapshot } from "@illusion-realm/shared/schemas/canvas-library.schema";
import { unwrapIpc } from "@/utils/ipcResult";
import { parseCanvasDocument } from "./canvas-document";

/** 删除失败类别共用一处映射，列表和工作区确认框给出相同的可操作提示。 */
export function canvasLibraryErrorKey(error: unknown) {
  const reason = error instanceof Error ? error.message : "";
  if (reason === "canvas-resource-in-use") return "canvas.resourceInUse" as const;
  if (reason === "canvas-resource-identity-changed") return "canvas.resourceChanged" as const;
  if (reason === "canvas-delete-open-sessions") return "canvas.closeBeforeDelete" as const;
  if (reason === "canvas-delete-shared-assets") return "canvas.deleteSharedAssets" as const;
  if (reason === "canvas-delete-files-failed") return "canvas.deleteFilesFailed" as const;
  if (reason === "canvas-delete-reference-check-failed") return "canvas.deleteReferenceFailed" as const;
  if (reason === "canvas-workspace-unavailable") return "canvas.workspaceUnavailable" as const;
  if (reason === "SQLITE_CONSTRAINT") return "canvas.databaseConflict" as const;
  if (reason === "SQLITE_BUSY" || reason === "SQLITE_OUTCOME_UNKNOWN") return "canvas.databaseBusy" as const;
  return "canvas.libraryError" as const;
}

export async function canvasLibrary(request: CanvasLibraryRequest) {
  if (!window.electronAPI?.canvasLibrary) throw new Error("canvas-library-unavailable");
  return unwrapIpc(await window.electronAPI.canvasLibrary(request));
}

export async function listCanvases(): Promise<CanvasLibrarySnapshot> {
  const result = await canvasLibrary({ operation: "list" });
  if (!result || !("entries" in result)) throw new Error("canvas-library-invalid-result");
  return result;
}

export async function createCanvas(name: string, folderId: string | null): Promise<CanvasLibraryEntry> {
  const result = await canvasLibrary({ operation: "create", name, folderId });
  if (!result || !("id" in result)) throw new Error("canvas-library-invalid-result");
  return result;
}

export async function loadCanvasProject(id: string) {
  return parseCanvasDocument(await canvasLibrary({ operation: "load", id }));
}

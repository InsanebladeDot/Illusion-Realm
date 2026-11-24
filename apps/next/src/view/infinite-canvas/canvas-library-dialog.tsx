"use client";

/** 新建、归类和删除共用已有主区浮层；表单草稿只在确认时提交。 */
import { useTranslation } from "@/i18n";
import type { CanvasLibraryFolder, CanvasLibraryRequest } from "@illusion-realm/shared/schemas/canvas-library.schema";
import { CanvasOverlay } from "./canvas-overlay";
import { CanvasChip } from "./reference-ui/components";
import styles from "./canvas.module.css";
import type { canvasLibraryErrorKey } from "./canvas-library-api";

export type LibraryDialog = "create" | "folder" | "remove" | "move" | "purgeDeleted" | null;
interface DialogProps {
  mode: Exclude<LibraryDialog, null>;
  folderId: string | null;
  folders: CanvasLibraryFolder[];
  selected: string[];
  busy: boolean;
  error: ReturnType<typeof canvasLibraryErrorKey> | null;
  run: (request: CanvasLibraryRequest) => Promise<boolean>;
  close: () => void;
}

export function CanvasLibraryDialog({ mode, folderId, folders, selected, busy, error, run, close }: DialogProps) {
  const { t } = useTranslation();
  const labels = { create: "canvas.newProject", folder: "canvas.newFolder", move: "canvas.moveToFolder", remove: "canvas.removeProject", purgeDeleted: "canvas.purgeDeleted" } as const;
  return <CanvasOverlay label={t(labels[mode])} onClose={() => { if (!busy) close(); }}>
    <form className={styles.dialog} data-canvas-library-form onSubmit={event => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity() || busy) return;
      const fields = new FormData(event.currentTarget);
      const name = String(fields.get("name") ?? "").trim();
      if ((mode === "create" || mode === "folder") && !name) return;
      const request: CanvasLibraryRequest = mode === "create" ? { operation: mode, name, folderId }
        : mode === "folder" ? { operation: mode, name }
          : mode === "move" ? { operation: mode, ids: selected, folderId: String(fields.get("folder") || "") || null }
            : mode === "purgeDeleted" ? { operation: mode } : { operation: mode, ids: selected };
      void run(request).then(ok => { if (ok) close(); });
    }}>
      <h2>{t(labels[mode])}</h2>
      {(mode === "create" || mode === "folder") && <input autoFocus name="name" aria-label={t("canvas.titleLabel")} placeholder={t(mode === "create" ? "canvas.untitled" : "canvas.newFolder")} maxLength={80} required />}
      {mode === "move" && <select autoFocus name="folder" aria-label={t("canvas.moveToFolder")} defaultValue={folderId ?? ""}><option value="">{t("canvas.allProjects")}</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>}
      {mode === "remove" && <p>{t("canvas.projectDeleteNotice")}</p>}
      {mode === "purgeDeleted" && <p>{t("canvas.purgeDeletedNotice")}</p>}
      {error && <p role="alert">{t(error)}</p>}
      <footer><CanvasChip disabled={busy} onClick={close}>{t("canvas.cancel")}</CanvasChip><button className="hy-chip" type="submit" disabled={busy}>{t(mode === "remove" || mode === "purgeDeleted" ? "canvas.remove" : "canvas.apply")}</button></footer>
    </form>
  </CanvasOverlay>;
}

"use client";

import { HoverTip } from "@/components/hover-tip";

/** 正式入口先列真实工程；编辑器由常驻会话宿主承载，切换列表不会卸载挂起任务。 */
import { useCallback, useState } from "react";
import { Folder, FolderPlus, Plus, Search, Trash2, LayoutGrid, RefreshCw, X, CheckSquare, FolderInput } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useCanvasSessionsStore } from "@/stores/use-canvas-sessions-store";
import { CanvasChip } from "./reference-ui/components";
import { useCanvasLibrary } from "./use-canvas-library";
import { CanvasLibraryDialog, type LibraryDialog } from "./canvas-library-dialog";
import { SuspendedCanvases } from "./suspended-canvases";
import styles from "./canvas-library.module.css";

export function CanvasLibraryPage() {
  const { t } = useTranslation();
  const library = useCanvasLibrary();
  const { sessions, activeId } = useCanvasSessionsStore();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [dialog, setDialog] = useState<LibraryDialog>(null);
  const target = useCallback((element: HTMLElement | null) => useCanvasSessionsStore.setState({ target: element }), []);
  const entries = library.entries.filter(entry => (!folderId || entry.folderId === folderId) && entry.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const hasOpen = sessions.length > 0;
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const cancel = () => { setSelected([]); setSelecting(false); };
  return <section ref={target} className="relative h-full w-full"><section className={`${styles.library} hy-canvas-ui`} data-canvas-library hidden={!!activeId} aria-label={t("canvas.library")}>
    <aside className={styles.folders} inert={!!dialog}>
      <h2>{t("canvas.library")}</h2>
      <button type="button" aria-pressed={!folderId} onClick={() => { setFolderId(null); cancel(); }}><LayoutGrid size={16} />{t("canvas.allProjects")}<small>{library.entries.length}</small></button>
      <div className={styles.folderHeading}><span>{t("canvas.folders")}</span><button type="button" disabled={library.busy} aria-label={t("canvas.newFolder")} onClick={() => setDialog("folder")}><FolderPlus size={16} /></button></div>
      {library.folders.map(folder => <div key={folder.id} className={styles.folderRow}><HoverTip asChild label={(folder.name) || ""}><button type="button" aria-pressed={folderId === folder.id} onClick={() => { setFolderId(folder.id); cancel(); }}><Folder size={16} /><span>{folder.name}</span><small>{library.entries.filter(entry => entry.folderId === folder.id).length}</small></button></HoverTip><HoverTip asChild label={(t("canvas.emptyFolderOnly")) || ""}><button type="button" disabled={library.busy || library.entries.some(entry => entry.folderId === folder.id)} aria-label={t("canvas.removeFolder")} onClick={() => { void library.run({ operation: "removeFolder", id: folder.id }).then(ok => { if (ok && folderId === folder.id) setFolderId(null); }); }}><X size={12} /></button></HoverTip></div>)}
      <div className={styles.mobileSessions}><SuspendedCanvases expanded /></div>
      <small className={styles.storage}>{t("canvas.libraryStorage")}</small>
    </aside>
    <div className={styles.main} inert={!!dialog}>
      <header><h1>{library.folders.find(folder => folder.id === folderId)?.name ?? t("canvas.allProjects")}</h1><div className={styles.actions}>
        <CanvasChip disabled={library.busy} onClick={() => setDialog("create")}><Plus size={14} />{t("canvas.newProject")}</CanvasChip>
        <CanvasChip disabled={library.busy} onClick={() => setDialog("folder")}><FolderPlus size={14} />{t("canvas.newFolder")}</CanvasChip>
        <CanvasChip disabled={library.busy || sessions.length > 0} reason={sessions.length ? t("canvas.closeBeforeDelete") : undefined} onClick={() => setDialog("purgeDeleted")}><Trash2 size={14} />{t("canvas.purgeDeleted")}</CanvasChip>
        <CanvasChip active={selecting} onClick={() => selecting ? cancel() : setSelecting(true)}><CheckSquare size={14} />{t(selecting ? "canvas.cancelSelection" : "canvas.multiSelect")}</CanvasChip>
        <button type="button" disabled={library.busy} aria-label={t("canvas.reload")} onClick={() => { void library.refresh(); }}><RefreshCw size={16} /></button>
      </div></header>
      <div className={styles.search}><Search size={16} /><input aria-label={t("canvas.searchProjects")} placeholder={t("canvas.searchProjects")} value={search} onChange={event => { setSearch(event.target.value); setSelected([]); }} /><small>{t("canvas.recentUpdated")}</small></div>
      {library.error && <p role="alert">{t(library.error)}</p>}
      {library.busy && <p role="status">{t("canvas.persistenceLoading")}</p>}
      <div className={styles.grid} aria-busy={library.busy}>
        {!selecting && !search && <button type="button" className={styles.newCard} disabled={library.busy} onClick={() => setDialog("create")}><Plus size={30} /><span>{t("canvas.newProject")}</span></button>}
        {entries.map(entry => <button type="button" key={entry.id} data-library-entry={entry.id} className={styles.card} aria-pressed={selected.includes(entry.id)} disabled={library.busy} onClick={() => selecting ? toggle(entry.id) : useCanvasSessionsStore.getState().open(entry.id, entry.name)}>
          <div className={styles.thumbnail}><LayoutGrid size={36} /><small>{t("canvas.projectNodeCount", { count: entry.nodeCount })}</small>{sessions.some(session => session.id === entry.id) && <span>{t("canvas.suspended")}</span>}</div>
          <HoverTip asChild label={(entry.name) || ""}><strong>{entry.name || t("canvas.untitled")}</strong></HoverTip><small>{new Date(entry.updatedAt).toLocaleString()}</small>
          {selecting && <span className={styles.check}>{selected.includes(entry.id) ? "✓" : "○"}</span>}
        </button>)}
      </div>
      {!entries.length && !library.busy && <p className={styles.empty}>{t(search ? "canvas.noMatchingProjects" : "canvas.noProjects")}</p>}
      {selecting && <div className={styles.selection} role="toolbar" aria-label={t("canvas.multiSelect")}>
        <span>{t("canvas.selectedProjects", { count: selected.length })}</span><CanvasChip onClick={() => setSelected(entries.map(entry => entry.id))}>{t("canvas.selectAll")}</CanvasChip><CanvasChip onClick={cancel}>{t("canvas.cancelSelection")}</CanvasChip>
        <CanvasChip disabled={!selected.length || library.busy} onClick={() => setDialog("move")}><FolderInput size={14} />{t("canvas.moveToFolder")}</CanvasChip>
        <CanvasChip disabled={!selected.length || hasOpen || library.busy} reason={hasOpen ? t("canvas.closeBeforeDelete") : undefined} onClick={() => setDialog("remove")}><Trash2 size={14} />{t("canvas.remove")}</CanvasChip>
      </div>}
    </div>
    {dialog && <CanvasLibraryDialog mode={dialog} folderId={folderId} folders={library.folders} selected={selected} busy={library.busy} error={library.error} run={library.run} close={() => { setDialog(null); setSelected([]); }} />}
  </section></section>;
}

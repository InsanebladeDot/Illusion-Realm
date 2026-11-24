"use client";

/** 两个来源共用原素材卡片与选择操作；列表不产生节点或连线，确认使用才通知宿主。 */
import { useRef, useState } from "react";
import { Music } from "lucide-react";
import type { CanvasResourceItem, UserDataInfiniteCanvas } from "@illusion-realm/shared";
import { useTranslation } from "@/i18n";
import { LibraryCard } from "@/components/library/library-card";
import { HoverTip } from "@/components/hover-tip";
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import { canvasLibrary } from "./canvas-library-api";
import { CanvasOverlay } from "./canvas-overlay";
import { CanvasChip, SegmentedControl } from "./reference-ui/components";
import { mediaAccept, readCanvasMedia, type CanvasMedia } from "./canvas-media-import";
import { importLibraryMedia, useCanvasResources, type ResourceScope } from "./use-canvas-resources";
import styles from "./canvas-project-resources.module.css";
import canvasStyles from "./canvas.module.css";
import { canvasResourceKey, canvasResourceReferences } from "./canvas-resource-references";

interface Props {
  projectId?: string; workspace?: UserDataInfiniteCanvas["workspace"]; kind?: CanvasMedia["kind"];
  readDocument: () => UserDataInfiniteCanvas;
  onUse: (media: CanvasMedia) => void; onLocal: () => void; onClose: () => void;
  initialScope?: ResourceScope; nodeOnly?: boolean; selectionOnly?: boolean; onUseBatch?: (media: CanvasMedia[], scope: ResourceScope) => Promise<boolean>;
}
const itemKey = (item: CanvasResourceItem) => item.media.path;

export default function CanvasProjectResources({ projectId, workspace, kind, readDocument, onUse, onLocal, onClose, initialScope = "project", nodeOnly = false, selectionOnly = false, onUseBatch }: Props) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<ResourceScope>(initialScope), [filter, setFilter] = useState("all");
  const [selecting, setSelecting] = useState(!!onUseBatch), [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const resources = useCanvasResources({ projectId, workspace, scope });
  const references = canvasResourceReferences(readDocument());
  const usedPaths = new Set(references.map(item => canvasResourceKey(item.path)));
  const items = nodeOnly ? nodeResources(references, resources.items) : resources.items;
  const visible = items.filter(item => (filter !== "unknown" || item.ownership === "unknown") && (!kind || item.media.kind === kind) && (filter === "trash" ? item.state === "trashed" : item.state !== "trashed") && (!["image", "video", "audio"].includes(filter) || item.media.kind === filter));
  const selected = visible.filter(item => selectedIds.includes(itemKey(item)));
  const allSelected = visible.length > 0 && selected.length === visible.length;
  const single = selected.length === 1 ? selected[0] : undefined;
  const clear = () => { setSelectedIds([]); setConfirmDelete(false); };
  const choose = (item: CanvasResourceItem) => {
    if (resources.busy) return;
    setConfirmDelete(false);
    const key = itemKey(item);
    setSelectedIds(previous => selecting ? previous.includes(key) ? previous.filter(id => id !== key) : [...previous, key] : [key]);
  };
  const remove = async () => {
    if (!projectId) return false;
    const result = await canvasLibrary({ operation: "deleteResources", id: projectId, scope, document: readDocument(), resources: selected.map(item => ({ path: item.media.path, identity: item.identity })) });
    if (!result || !("removed" in result)) throw Error("canvas-resource-invalid-result");
    return result.failed.length === 0;
  };
  const update = async () => {
    if (!projectId || !single?.id) return false;
    const base = { id: projectId, workspace, resourceId: single.id };
    await canvasLibrary(single.state === "trashed" ? { ...base, operation: "restoreResource" } : { ...base, operation: "retainResource", retained: !single.retained });
    return true;
  };
  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    await resources.run(async () => {
      const media = Array.from(files).map(readCanvasMedia);
      const valid = media.filter((item): item is CanvasMedia => item !== null);
      if (!valid.length) throw Error("canvas-invalid-media");
      return await importLibraryMedia(valid) && valid.length === media.length;
    }, () => { if (input.current) input.current.value = ""; clear(); });
  };
  const confirm = () => { void resources.run(remove, clear); };
  return <><div className={styles.panel} data-canvas-resources data-resource-scope={scope} inert={confirmDelete}>
    {/* 工程素材与全局资源库共用同一窗口、卡片、过滤和批量删除入口。 */}
    <h2>{t(scope === "library" ? "canvas.globalResources" : "canvas.projectResources")}</h2>
    <div className={styles.toolbar}>
      {(!onUseBatch || selectionOnly) && <SegmentedControl disabled={resources.busy} label={t("canvas.resourceSource")} value={scope} onChange={value => { clear(); setFilter("all"); setScope(value as ResourceScope); }} items={[{ id: "project", label: t("canvas.projectResources") }, { id: "library", label: t("canvas.globalResources") }]} />}
      <CanvasChip disabled={resources.busy} active={selecting} onClick={() => { clear(); setSelecting(value => !value); }}>{t(selecting ? "canvas.cancelSelection" : "canvas.multiSelect")}</CanvasChip>
      {selecting && <><CanvasChip active={allSelected} disabled={resources.busy || !visible.length} reason={t("canvas.resourceSelectAllHint")} onClick={() => { setConfirmDelete(false); setSelectedIds(allSelected ? [] : visible.map(itemKey)); }}>{t("canvas.selectAll")}</CanvasChip><span role="status">{t("canvas.selectedProjects", { count: selected.length })}</span></>}
    </div>
    <SegmentedControl disabled={resources.busy} label={t("canvas.projectResources")} value={filter} onChange={value => { clear(); setFilter(value); }} items={["all", "image", "video", "audio", "unknown", "trash"].map(id => ({ id, label: t(id === "unknown" ? "canvas.resourceUnknown" : id === "all" ? "canvas.resourceAll" : id === "trash" ? "canvas.resourceTrash" : id === "image" ? "canvas.image" : id === "video" ? "canvas.video" : "canvas.audio") }))} />
    <p>{t(scope === "library" ? "canvas.globalResourcePolicy" : "canvas.resourcePolicy")}</p>
    {resources.truncated && <p role="status">{t("canvas.resourceTruncated")}</p>}
    {resources.error && <p role="alert">{t(resources.error)}</p>}
    <div className={styles.grid}>{visible.map(item => <LibraryCard key={itemKey(item)} previewFallback={item.media.kind === "audio" ? <Music className="size-10" aria-hidden /> : undefined} prefix="canvas-resource" id={item.id ?? item.media.path} title={item.media.name} preview={item.media.kind === "image" ? buildLocalFileUrl(item.media.path) ?? "" : ""} previewVideoSrc={item.media.kind === "video" ? buildLocalFileUrl(item.media.path) ?? undefined : undefined} selected={selectedIds.includes(itemKey(item))} onSelect={() => choose(item)} badge={item.media.kind} tooltip metric={<HoverTip asChild label={item.ownership === "unknown" ? t("canvas.resourceUnregisteredHint") : t("canvas.resourcePolicy")}><span tabIndex={0}>{t(usedPaths.has(canvasResourceKey(item.media.path)) ? "canvas.resourceUsedInCanvas" : item.ownership === "unknown" ? "canvas.resourceUnregistered" : item.state === "blocked" ? "canvas.resourceBlocked" : item.retained ? "canvas.resourceRetained" : "canvas.resourceManaged")}</span></HoverTip>} />)}</div>
    {resources.loading ? <p role="status">{t("canvas.resourceLoading")}</p> : !visible.length && <p>{t("canvas.resourceEmpty")}</p>}
    <input ref={input} hidden type="file" multiple accept={mediaAccept()} data-global-resource-input onChange={event => { void importFiles(event.target.files); }} />
    <footer><CanvasChip disabled={resources.busy} onClick={onClose}>{t("canvas.close")}</CanvasChip><CanvasChip disabled={resources.busy} onClick={() => !selectionOnly && scope === "library" ? input.current?.click() : onLocal()}>{t("canvas.importMedia")}</CanvasChip>
      {!nodeOnly && !selectionOnly && <CanvasChip ref={deleteTrigger} disabled={resources.busy || !projectId || !selected.length || selected.length > 2000 || selected.some(item => item.state === "blocked")} onClick={() => setConfirmDelete(true)}>{t("canvas.remove")}</CanvasChip>}
      {!nodeOnly && !selectionOnly && scope === "project" && single?.id && single.state !== "blocked" && <CanvasChip disabled={resources.busy} onClick={() => { void resources.run(update, clear); }}>{t(single.state === "trashed" ? "canvas.resourceRestore" : single.retained ? "canvas.resourceUnretain" : "canvas.resourceRetain")}</CanvasChip>}
      <CanvasChip disabled={resources.busy || (onUseBatch ? !selected.length || selected.some(item => item.state !== "active") : !single || single.state !== "active")} onClick={() => {
        if (onUseBatch) void resources.run(() => onUseBatch(selected.map(item => item.media), scope));
        else if (single) onUse(single.media);
      }}>{t("canvas.resourceUse")}</CanvasChip>
    </footer>
  </div>
    {/* 删除确认：暂时禁用后面的素材列表，避免确认期间改变选项。 */}
    {confirmDelete && <CanvasOverlay label={t("canvas.remove")} returnFocus={deleteTrigger} onClose={() => { if (!resources.busy) setConfirmDelete(false); }}>
      <div className={`${canvasStyles.dialog} ${styles.confirmDialog}`} data-resource-delete-confirm>
        <h2>{t("canvas.remove")}</h2>
        <p>{t("canvas.resourceDeleteConfirm", { count: selected.length })}</p>
        {resources.error && <p role="alert">{t(resources.error)}</p>}
        <footer><CanvasChip disabled={resources.busy || !selected.length} className={styles.danger} onClick={confirm}>{t("common.confirm")}</CanvasChip><CanvasChip disabled={resources.busy} onClick={() => setConfirmDelete(false)}>{t("canvas.cancel")}</CanvasChip></footer>
      </div>
    </CanvasOverlay>}
  </>;
}

/** 从当前节点取素材，旧画布引用的外部地址也可用；同一路径只列一次，不据此允许删源文件。 */
function nodeResources(references: CanvasMedia[], catalog: CanvasResourceItem[]): CanvasResourceItem[] {
  const items = new Map<string, CanvasResourceItem>();
  const registered = new Map(catalog.map(item => [canvasResourceKey(item.media.path), item]));
  for (const media of references) {
    const key = canvasResourceKey(media.path);
    items.set(key, registered.get(key) ?? { id: null, identity: "", media, ownership: "unknown", state: "active", retained: false, expiresAt: null });
  }
  return [...items.values()];
}

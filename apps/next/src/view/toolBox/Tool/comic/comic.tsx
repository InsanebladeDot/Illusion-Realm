"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Edit3, ImagePlus, LayoutTemplate, Minus, Plus, Undo2 } from "lucide-react";
import { useTranslation, type InterpolationParams, type MessageKey } from "@/i18n";
import { exportStoryboardImage } from "@/utils/comic/export-storyboard-image";
import { downloadBlob } from "@/utils/cartoon/exportBubbleImage";
import { useToastStore } from "@/stores/useToastStore";
import type { ComicTemplate } from "@/data/comic-templates";
import ComicSaveTemplateDialog from "./comic-save-template-dialog";
import { useComicTemplateStore } from "@/stores/useComicTemplateStore";
import { geometryOnly, placeholderImage, readBackgroundColor } from "@/utils/comic/custom-templates";
import ComicTemplateDialog from "./comic-template-dialog";
import ComicPageSizeControls from "./comic-page-size-controls";
import ComicCanvasStage from "./comic-canvas-stage";
import ComicHeader from "./comic-header";
import ComicViewPin, { type ComicCompactView } from "./comic-view-pin";
import ComicImageTools from "./comic-image-tools";
import ComicImageMenu from "./comic-image-menu";
import { DEFAULT_COMIC_PAGE_SIZE, readComicPageSize, type ComicPageSize } from "@/utils/comic/page-size";
import imageOne from "@/assets/cartoon/1.png";
import imageTwo from "@/assets/cartoon/2.png";
import imageThree from "@/assets/cartoon/3.png";
import imageFour from "@/assets/cartoon/4.png";
import imageFive from "@/assets/cartoon/5.png";

interface Point { x: number; y: number }
interface Panel { id: string; title: string; description: string; src: string; blur: number; imageRemoved: boolean; x: number; y: number; width: number; height: number; vertices: Point[] }
interface DragState { id: string; kind: "move" | "resize" | "vertex"; startX: number; startY: number; initial: Panel; vertex: number }
interface TemplateSnapshot { panels: Panel[]; selectedId: string; customMode: boolean; pageSize: ComicPageSize; backgroundColor: string }
interface ImageContextMenu { panelId: string; x: number; y: number }
type ComicTranslator = (key: MessageKey, params?: InterpolationParams) => string;

const imageSources = [imageOne.src, imageTwo.src, imageThree.src, imageFour.src, imageFive.src];
const rectangle = (): Point[] => [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const initialPanels = (t: ComicTranslator): Panel[] => [
  { id: "p1", title: t("toolBox.comic.defaults.sceneTitle"), description: t("toolBox.comic.defaults.sceneDescription"), src: imageSources[0], blur: 0, imageRemoved: false, x: 4, y: 3, width: 92, height: 38, vertices: rectangle() },
  { id: "p2", title: t("toolBox.comic.defaults.reactionTitle"), description: t("toolBox.comic.defaults.reactionDescription"), src: imageSources[1], blur: 0, imageRemoved: false, x: 4, y: 43, width: 28, height: 24, vertices: rectangle() },
  { id: "p3", title: t("toolBox.comic.defaults.closeupTitle"), description: t("toolBox.comic.defaults.closeupDescription"), src: imageSources[2], blur: 0, imageRemoved: false, x: 34, y: 43, width: 28, height: 24, vertices: [{ x: 0, y: 8 }, { x: 48, y: 0 }, { x: 100, y: 10 }, { x: 94, y: 100 }, { x: 8, y: 92 }] },
  { id: "p4", title: t("toolBox.comic.defaults.depthTitle"), description: t("toolBox.comic.defaults.depthDescription"), src: imageSources[3], blur: 0, imageRemoved: false, x: 64, y: 43, width: 32, height: 54, vertices: rectangle() },
  { id: "p5", title: t("toolBox.comic.defaults.revealTitle"), description: t("toolBox.comic.defaults.revealDescription"), src: imageSources[4], blur: 0, imageRemoved: false, x: 4, y: 69, width: 58, height: 28, vertices: rectangle() },
];

function pointsToCss(points: Point[]): string { return `polygon(${points.map(point => `${point.x}% ${point.y}%`).join(",")})`; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }

function PanelCanvas({ panel, selected, customMode, shapeEditing, removedLabel, onSelect, onDoubleClick, onContextMenu, onDrag, onVertexDrag, onAddVertex }: {
  panel: Panel; selected: boolean; customMode: boolean; shapeEditing: boolean; onSelect: () => void;
  removedLabel: string;
  onDoubleClick: () => void; onContextMenu: (event: React.MouseEvent<Element>) => void;
  onDrag: (event: React.PointerEvent<Element>, kind: "move" | "resize", id: string) => void;
  onVertexDrag: (event: React.PointerEvent<HTMLButtonElement>, index: number, id: string) => void; onAddVertex: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div data-comic-panel={panel.id} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu} className="pointer-events-none absolute" style={{ left: `${panel.x}%`, top: `${panel.y}%`, width: `${panel.width}%`, height: `${panel.height}%` }}>
      <div className={`pointer-events-auto absolute inset-0 overflow-hidden bg-[#f1f5f9] ${selected ? "ring-2 ring-primary" : "ring-1 ring-slate-300"}`} style={{ clipPath: pointsToCss(panel.vertices), touchAction: customMode ? "none" : "auto" }} onClick={onSelect} onPointerDown={event => customMode && onDrag(event, "move", panel.id)}>
        {panel.imageRemoved ? <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">{removedLabel}</div> : <img src={panel.src} alt={panel.title} style={{ filter: panel.blur ? `blur(calc(${panel.blur}px * var(--comic-preview-scale, 1)))` : undefined }} className="h-full w-full select-none object-cover" draggable={false} />}
      </div>
      {selected && <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-primary" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points={panel.vertices.map(point => `${point.x},${point.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="0.8" vectorEffect="non-scaling-stroke" /></svg>}
      {selected && shapeEditing && panel.vertices.map((point, index) => <button key={`${panel.id}-${index}`} type="button" aria-label={`vertex-${index + 1}`} className="pointer-events-auto absolute z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-white bg-rose-600 p-0 shadow" style={{ left: `${point.x}%`, top: `${point.y}%` }} onPointerDown={event => onVertexDrag(event, index, panel.id)} />)}
      {selected && customMode && <button type="button" aria-label="resize-panel" className="pointer-events-auto absolute bottom-0 right-0 z-20 h-5 w-5 touch-none cursor-nwse-resize rounded-sm border border-white bg-primary p-0" onPointerDown={event => onDrag(event, "resize", panel.id)} />}
      {selected && shapeEditing && <div className="pointer-events-auto absolute inset-0 z-10" onPointerDown={onAddVertex} />}
    </div>
  );
}

export default function ComicGeneratorPage() {
  const { t } = useTranslation();
  const [panels, setPanels] = useState<Panel[]>(() => initialPanels(t));
  const [selectedId, setSelectedId] = useState("p1");
  const [customMode, setCustomMode] = useState(false);
  const [shapeEditing, setShapeEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const customTemplates = useComicTemplateStore(state => state.templates);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [sideTab, setSideTab] = useState<"layout" | "outline">("layout");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateHistory, setTemplateHistory] = useState<TemplateSnapshot[]>([]);
  const [pageSize, setPageSize] = useState<ComicPageSize>({ ...DEFAULT_COMIC_PAGE_SIZE });
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [fitCanvas, setFitCanvas] = useState(true);
  const [compactView, setCompactView] = useState<ComicCompactView>("stage");
  const [imageContextMenu, setImageContextMenu] = useState<ImageContextMenu | null>(null);
  const [imageToolsOpen, setImageToolsOpen] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replacementPanelRef = useRef<string | null>(null);
  const exportBusy = useRef(false);
  const showToast = useToastStore(state => state.show);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const selected = useMemo(() => panels.find(panel => panel.id === selectedId) ?? panels[0], [panels, selectedId]);

  useEffect(() => { void useComicTemplateStore.getState().load().catch(() => showToast(t("toolBox.comic.templates.loadFailed"), "error")); }, [showToast, t]);
  useEffect(() => {
    if (!shapeEditing) return;
    const finish = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.isComposing || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable=true],dialog")) return;
      event.preventDefault(); event.stopPropagation(); dragRef.current = null; setShapeEditing(false); setSaved(false);
    };
    window.addEventListener("keydown", finish, true); return () => window.removeEventListener("keydown", finish, true);
  }, [shapeEditing]);

  useEffect(() => {
    const close = (event: Event) => { if (!(event.target instanceof Element) || !event.target.closest("[data-image-context-menu]")) setImageContextMenu(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setImageContextMenu(null); setImageToolsOpen(false); } };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = localStorage.getItem("illusion-realm-comic-template-v1");
      if (!stored) return;
      try {
        const value = JSON.parse(stored) as { panels: Panel[]; customMode: boolean; pageSize?: unknown; backgroundColor?: unknown };
        if (Array.isArray(value.panels) && value.panels.length) setPanels(value.panels.map(panel => ({ ...panel, blur: Number.isFinite(panel.blur) ? Math.max(0, Math.min(40, panel.blur)) : 0, imageRemoved: Boolean(panel.imageRemoved) })));
        setCustomMode(Boolean(value.customMode)); setPageSize(readComicPageSize(value.pageSize)); setBackgroundColor(readBackgroundColor(value.backgroundColor));
      } catch { /* Ignore a stale browser draft. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current; const canvas = canvasRef.current; if (!drag || !canvas) return;
      const rect = canvas.getBoundingClientRect(); const dx = (event.clientX - drag.startX) / rect.width * 100; const dy = (event.clientY - drag.startY) / rect.height * 100;
      setPanels(current => current.map(panel => {
        if (panel.id !== drag.id) return panel;
        const next = { ...drag.initial, vertices: drag.initial.vertices.map(point => ({ ...point })) };
        if (drag.kind === "move") { next.x = clamp(drag.initial.x + dx, 0, 100 - next.width); next.y = clamp(drag.initial.y + dy, 0, 100 - next.height); }
        if (drag.kind === "resize") { next.width = clamp(drag.initial.width + dx, 8, 100 - next.x); next.height = clamp(drag.initial.height + dy, 8, 100 - next.y); }
        if (drag.kind === "vertex") { const x = clamp((event.clientX - rect.left) / rect.width * 100, 0, 100); const y = clamp((event.clientY - rect.top) / rect.height * 100, 0, 100); next.vertices[drag.vertex] = { x: clamp((x - next.x) / next.width * 100, 0, 100), y: clamp((y - next.y) / next.height * 100, 0, 100) }; }
        return next;
      }));
    };
    const up = () => { if (dragRef.current) { dragRef.current = null; setSaved(false); } };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  function beginDrag(event: React.PointerEvent<Element>, kind: "move" | "resize", id: string) { if (!customMode || event.button !== 0) return; event.stopPropagation(); setSelectedId(id); const current = panels.find(panel => panel.id === id) ?? selected; dragRef.current = { id, kind, startX: event.clientX, startY: event.clientY, initial: { ...current, vertices: current.vertices.map(point => ({ ...point })) }, vertex: -1 }; }
  function beginVertexDrag(event: React.PointerEvent<HTMLButtonElement>, index: number, id: string) { event.stopPropagation(); const current = panels.find(panel => panel.id === id) ?? selected; dragRef.current = { id, kind: "vertex", startX: event.clientX, startY: event.clientY, initial: { ...current, vertices: current.vertices.map(point => ({ ...point })) }, vertex: index }; }
  function addVertex(event: React.PointerEvent<HTMLDivElement>) {
    if (!shapeEditing || event.button !== 0 || event.detail > 1) return;
    event.stopPropagation(); const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect(); const x = clamp((event.clientX - rect.left) / rect.width * 100, 0, 100); const y = clamp((event.clientY - rect.top) / rect.height * 100, 0, 100);
    const localX = clamp((x - selected.x) / selected.width * 100, 0, 100); const localY = clamp((y - selected.y) / selected.height * 100, 0, 100);
    setPanels(current => current.map(panel => panel.id === selectedId ? { ...panel, vertices: [...panel.vertices, { x: localX, y: localY }] } : panel));
  }
  function updateSelected(field: "title" | "description", value: string) { setPanels(current => current.map(panel => panel.id === selectedId ? { ...panel, [field]: value } : panel)); setSaved(false); }
  function removeVertex() { if (selected.vertices.length <= 3) return; setPanels(current => current.map(panel => panel.id === selectedId ? { ...panel, vertices: panel.vertices.slice(0, -1) } : panel)); }
  function resetShape() { setPanels(current => current.map(panel => panel.id === selectedId ? { ...panel, vertices: rectangle() } : panel)); setShapeEditing(false); }
  function selectOutlinePanel(id: string) { setSelectedId(id); setShapeEditing(false); setSideTab("layout"); setCompactView("side"); }
  function toggleShapeEditing() { setShapeEditing(current => !current); if (!shapeEditing) setCompactView("stage"); }
  function openCustomLayout() { setCustomMode(true); setCompactView("stage"); }
  function updatePageDimension(axis: "width" | "height", value: number) {
    if (pageSize.locked) return;
    setPageSize(current => current.locked ? current : { ...current, [axis]: value }); setSaved(false);
  }
  function togglePageSizeLock() { setPageSize(current => ({ ...current, locked: !current.locked })); setSaved(false); }
  function resizePage(width: number, height: number) {
    setPageSize(current => current.locked ? current : { ...current, width, height }); setSaved(false);
  }
  function resetTemplate() { setPanels(initialPanels(t)); setSelectedId("p1"); setCustomMode(false); setShapeEditing(false); setTemplateHistory([]); setBackgroundColor("#ffffff"); setSaved(false); localStorage.removeItem("illusion-realm-comic-template-v1"); }
  function applyTemplate(template: ComicTemplate) {
    setTemplateHistory(history => [...history.slice(-19), structuredClone({ panels, selectedId, customMode, pageSize, backgroundColor })]);
    const next = template.frames.map((frame, index): Panel => ({
      ...(panels[index] ?? { id: crypto.randomUUID(), title: t("toolBox.comic.emptyPanel"), description: "", src: imageSources[index % imageSources.length], blur: 0, imageRemoved: false }),
      ...structuredClone(frame),
      ...(template.pageSize ? { src: placeholderImage(index), title: t("toolBox.comic.templates.panelLabel", { index: index + 1 }), description: "", blur: 0, imageRemoved: false } : {}),
    }));
    setBackgroundColor(readBackgroundColor(template.backgroundColor));
    if (template.pageSize) setPageSize(current => ({ ...current, ...template.pageSize }));
    setPanels(next); setSelectedId(next[0].id); setCustomMode(true); setShapeEditing(false); setSaved(false); setTemplateDialogOpen(false);
    setCompactView("stage");
  }
  function undoTemplate() {
    const previous = templateHistory.at(-1); if (!previous) return;
    setBackgroundColor(previous.backgroundColor); setPageSize(previous.pageSize); setPanels(previous.panels); setSelectedId(previous.selectedId); setCustomMode(previous.customMode);
    setTemplateHistory(history => history.slice(0, -1)); setShapeEditing(false); setSaved(false);
  }
  async function saveCustomTemplate(name: string, category: string): Promise<void> {
    const template = { id: crypto.randomUUID(), name, category, frames: geometryOnly(panels), pageSize: { width: pageSize.width, height: pageSize.height }, backgroundColor };
    await useComicTemplateStore.getState().save(template);
    setPanels(current => current.map((panel, index) => ({ ...panel, src: placeholderImage(index), blur: 0, imageRemoved: false })));
    dragRef.current = null; setShapeEditing(false); setCustomMode(false); setSaved(false); setSaveTemplateOpen(false);
    showToast(t("toolBox.comic.templates.savedToLibrary"), "success");
  }
  function switchCompactView(view: ComicCompactView) { if (view !== "stage") setSideTab(view === "outline" ? "outline" : "layout"); setCompactView(view); }
  function exportProject() { const blob = new Blob([JSON.stringify({ format: "illusion-realm-comic-template", version: 3, pageSize, backgroundColor, panels }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "comic-storyboard-template.json"; link.click(); URL.revokeObjectURL(url); }
  async function exportPng(): Promise<void> {
    if (exportBusy.current) return;
    exportBusy.current = true;
    setExportingPng(true);
    try {
      const size = { ...pageSize, backgroundColor };
      const blob = await exportStoryboardImage(structuredClone(panels), size);
      downloadBlob(blob, "comic-storyboard.png");
      showToast(t("toolBox.comic.pngExported", { width: size.width, height: size.height }), "success");
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : t("toolBox.comic.exportFailed"), "error");
    } finally {
      exportBusy.current = false;
      setExportingPng(false);
    }
  }
  function saveDraft() { localStorage.setItem("illusion-realm-comic-template-v1", JSON.stringify({ version: 3, panels, customMode, pageSize, backgroundColor })); setSaved(true); }
  function requestImageReplacement(panelId: string) { replacementPanelRef.current = panelId; setSelectedId(panelId); setImageContextMenu(null); replaceInputRef.current?.click(); }
  function uploadImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const targetId = event.currentTarget === replaceInputRef.current ? replacementPanelRef.current ?? selectedId : selectedId;
    replacementPanelRef.current = null; event.currentTarget.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024) { showToast(t("toolBox.comic.imageTools.invalidFile"), "error"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result; if (typeof src !== "string") return;
      setPanels(current => current.map(panel => panel.id === targetId ? { ...panel, src, imageRemoved: false } : panel)); setSaved(false);
    };
    reader.onerror = () => showToast(t("toolBox.comic.uploadFailed"), "error");
    try { reader.readAsDataURL(file); } catch { showToast(t("toolBox.comic.uploadFailed"), "error"); }
  }
  function updateImage(patch: Partial<Pick<Panel, "blur" | "imageRemoved">>) { setPanels(current => current.map(panel => panel.id === selectedId ? { ...panel, ...patch } : panel)); setSaved(false); }
  function openImageTools() { setImageToolsOpen(true); setImageContextMenu(null); }
  function openImageMenu(event: React.MouseEvent<Element>, panelId: string) { event.preventDefault(); event.stopPropagation(); setSelectedId(panelId); setImageContextMenu({ panelId, x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 150) }); }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-2 pr-12 text-foreground xl:pr-0">
      {/* pin：窄屏右上角的漫画工作视图切换固钉 */}
      <ComicViewPin view={compactView} onChange={switchCompactView} />
      {/* 界面：保存、PNG 导出与更多操作 */}
      <ComicHeader saved={saved} exporting={exportingPng} canUndo={Boolean(templateHistory.length)} onSave={saveDraft} onExportPng={() => { void exportPng(); }} onExportJson={exportProject} onReset={resetTemplate} onTemplates={() => setTemplateDialogOpen(true)} onUndo={undoTemplate} />
      {/* 界面：模板选择与排版撤销 */}
      <div data-comic-toolbar className="grid shrink-0 grid-cols-1 items-center gap-2 bg-background xl:grid-cols-[minmax(0,1fr)_360px_minmax(0,1fr)]">
        <div className="hidden items-center gap-2 justify-self-start xl:flex">
        <button type="button" data-open-templates onClick={() => setTemplateDialogOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"><LayoutTemplate size={16} />{t("toolBox.comic.templates.open")}</button>
        <button type="button" onClick={undoTemplate} disabled={!templateHistory.length} title={t("toolBox.comic.templates.undo")} aria-label={t("toolBox.comic.templates.undo")} className="flex h-9 w-9 items-center justify-center rounded border border-border bg-background disabled:opacity-40"><Undo2 size={16} /></button>
        </div>
        {/* 界面：顶部白色工具栏中的画布宽高、锁定与按比例显示 */}
        <ComicPageSizeControls size={pageSize} fit={fitCanvas} onChange={updatePageDimension} onToggleLock={togglePageSizeLock} onToggleFit={() => setFitCanvas(current => !current)} />
        {/* 界面：模板纸张背景色，纯色与点阵工作区相互独立。 */}
        <label className="flex items-center justify-center gap-2 text-xs text-muted-foreground xl:justify-self-end"><span>{t("toolBox.comic.templates.backgroundColor")}</span><input data-template-background type="color" value={backgroundColor} onChange={event => { setBackgroundColor(event.target.value); setSaved(false); }} className="h-8 w-10 cursor-pointer rounded border border-border bg-background p-0.5" /><output className="font-mono uppercase">{backgroundColor}</output></label>
      </div>
      <div data-comic-workspace className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_286px]">
        {/* stage：漫画画布预览与整体尺寸拖拽 */}
        <ComicCanvasStage size={pageSize} backgroundColor={backgroundColor} fit={fitCanvas} compactVisible={compactView === "stage"} canvasRef={canvasRef} onResize={resizePage} onFitChange={setFitCanvas}
          tools={dock => <ComicImageTools dock={dock} title={selected.title} effects={{ blur: selected.blur, imageRemoved: selected.imageRemoved }} open={imageToolsOpen} onOpen={openImageTools} onClose={() => setImageToolsOpen(false)} onReplace={() => requestImageReplacement(selected.id)} onChange={updateImage} />}>
          {panels.map(panel => <PanelCanvas key={panel.id} panel={panel} selected={panel.id === selectedId} customMode={customMode} shapeEditing={shapeEditing && panel.id === selectedId} removedLabel={t("toolBox.comic.imageRemoved")} onSelect={() => setSelectedId(panel.id)} onDoubleClick={() => requestImageReplacement(panel.id)} onContextMenu={event => openImageMenu(event, panel.id)} onDrag={beginDrag} onVertexDrag={beginVertexDrag} onAddVertex={addVertex} />)}
        </ComicCanvasStage>
        {/* side：右侧顶部切换排版／分镜目录，底部完成并保存排版。 */}
        <aside data-comic-pane="side" className={`${compactView !== "stage" ? "flex" : "hidden xl:flex"} min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background`}>
          <header role="tablist" aria-label={t("toolBox.comic.views.switch")} className="flex shrink-0 gap-1 border-b border-border p-2">
            {(["layout", "outline"] as const).map(tab => <button key={tab} role="tab" id={`comic-tab-${tab}`} aria-controls={`comic-tabpanel-${tab}`} aria-selected={sideTab === tab} data-comic-side-tab={tab} onClick={() => setSideTab(tab)} className={`flex-1 rounded px-2 py-2 text-xs font-medium ${sideTab === tab ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>{t(tab === "layout" ? "toolBox.comic.layout" : "toolBox.comic.outline")}</button>)}
          </header>
          <div id="comic-tabpanel-outline" role="tabpanel" aria-labelledby="comic-tab-outline" hidden={sideTab !== "outline"} className="min-h-0 flex-1 overflow-auto">{sideTab === "outline" && (<div data-comic-pane="outline" className="min-h-0 flex-1 overflow-auto p-3"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">{t("toolBox.comic.outline")}</h3><span className="text-xs text-muted-foreground">{t("toolBox.comic.panelCount", { count: panels.length })}</span></div><div className="space-y-1">{panels.map((panel, index) => <button type="button" key={panel.id} data-outline-panel={panel.id} onClick={() => selectOutlinePanel(panel.id)} className={`flex w-full items-center gap-2 rounded-md border p-2 text-left ${selectedId === panel.id ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted/50"}`}><span className="w-5 text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><img src={panel.src} alt="" className="h-10 w-8 rounded object-cover" /><span className="min-w-0 flex-1 truncate text-xs">{panel.title}</span></button>)}</div></div>)}</div>
          <div id="comic-tabpanel-layout" role="tabpanel" aria-labelledby="comic-tab-layout" hidden={sideTab !== "layout"} className="min-h-0 flex-1 overflow-auto">{sideTab === "layout" && <div className="p-3"><div className="mb-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => setTemplateDialogOpen(true)} className={`rounded-md border px-2 py-2 text-xs ${!customMode ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{t("toolBox.comic.templates.open")}</button><button type="button" onClick={openCustomLayout} className={`rounded-md border px-2 py-2 text-xs ${customMode ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{t("toolBox.comic.customTemplate")}</button></div>{customMode && <p className="mb-4 text-xs leading-5 text-muted-foreground">{t("toolBox.comic.customModeHint")}</p>}<label className="mb-1 block text-xs text-muted-foreground" htmlFor="comic-title">{t("toolBox.comic.titleLabel")}</label><input id="comic-title" value={selected.title} onChange={event => updateSelected("title", event.target.value)} className="mb-3 w-full rounded-md border border-border bg-background px-2 py-2 text-sm" /><label className="mb-1 block text-xs text-muted-foreground" htmlFor="comic-description">{t("toolBox.comic.descriptionLabel")}</label><textarea id="comic-description" value={selected.description} onChange={event => updateSelected("description", event.target.value)} rows={3} className="mb-4 w-full resize-y rounded-md border border-border bg-background px-2 py-2 text-sm" /><div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold">{t("toolBox.comic.image")}</h3><label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"><ImagePlus size={14} />{t("toolBox.comic.upload")}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadImage} /></label></div><div className="mb-4 overflow-hidden rounded-md border border-border bg-muted/50">{selected.imageRemoved ? <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">{t("toolBox.comic.imageRemoved")}</div> : <img src={selected.src} alt={selected.title} className="h-28 w-full object-cover" />}</div><div className="border-t border-border pt-4"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">{t("toolBox.comic.shape")}</h3><span className="text-xs text-muted-foreground">{t("toolBox.comic.vertexCount", { count: selected.vertices.length })}</span></div><div className="grid grid-cols-2 gap-2"><button type="button" data-edit-polygon onClick={toggleShapeEditing} className="inline-flex items-center justify-center gap-1 rounded-md border border-border px-2 py-2 text-xs"><Edit3 size={14} />{shapeEditing ? t("toolBox.comic.finishShape") : t("toolBox.comic.editShape")}</button><button type="button" onClick={() => setPanels(current => current.map(panel => panel.id === selectedId ? { ...panel, vertices: [...panel.vertices, { x: 50, y: 50 }] } : panel))} className="inline-flex items-center justify-center gap-1 rounded-md border border-border px-2 py-2 text-xs"><Plus size={14} />{t("toolBox.comic.addVertex")}</button><button type="button" onClick={removeVertex} disabled={selected.vertices.length <= 3} className="inline-flex items-center justify-center gap-1 rounded-md border border-border px-2 py-2 text-xs disabled:opacity-40"><Minus size={14} />{t("toolBox.comic.removeVertex")}</button><button type="button" onClick={resetShape} className="rounded-md border border-border px-2 py-2 text-xs">{t("toolBox.comic.resetShape")}</button></div>{shapeEditing && <p className="mt-2 text-xs text-muted-foreground">{t("toolBox.comic.polygonEnterHint")}</p>}</div></div>}</div>
          <footer className="shrink-0 border-t border-border p-3">
            <button data-finish-layout type="button" disabled={!customMode} onClick={() => setSaveTemplateOpen(true)} className="w-full rounded bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-40">{t("toolBox.comic.templates.finishLayout")}</button>
          </footer>
        </aside>
      </div>
      {imageContextMenu && <ComicImageMenu x={imageContextMenu.x} y={imageContextMenu.y} removed={panels.find(panel => panel.id === imageContextMenu.panelId)?.imageRemoved ?? false} onReplace={() => requestImageReplacement(imageContextMenu.panelId)} onRemove={() => { setPanels(current => current.map(panel => panel.id === imageContextMenu.panelId ? { ...panel, imageRemoved: true } : panel)); setSaved(false); }} onRestore={() => { setPanels(current => current.map(panel => panel.id === imageContextMenu.panelId ? { ...panel, imageRemoved: false, blur: 0 } : panel)); setSaved(false); }} onBlur={() => { setSelectedId(imageContextMenu.panelId); openImageTools(); }} onClose={() => setImageContextMenu(null)} />}
      <input ref={replaceInputRef} data-replace-panel-image type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={uploadImage} tabIndex={-1} aria-label={t("toolBox.comic.imageTools.replace")} />
      {saveTemplateOpen && <ComicSaveTemplateDialog categories={customTemplates.map(item => item.category)} onSave={saveCustomTemplate} onClose={() => setSaveTemplateOpen(false)} />}
      {templateDialogOpen && <ComicTemplateDialog panelCount={panels.length} onApply={applyTemplate} onClose={() => setTemplateDialogOpen(false)} />}
    </div>
  );
}

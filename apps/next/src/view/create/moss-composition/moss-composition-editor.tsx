"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Braces, ChevronDown, Grid2X2, ImagePlus, Scan, Trash2, Upload } from "lucide-react";
import { useTranslation } from "@/i18n";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { SimpleSelect } from "@/components/SimpleSelect";
import { ContextMenuShell } from "@/components/context-menu-shell";
import { PromptInput } from "@/components/prompt-input";
import { ANNOTATION_COLORS } from "@/view/infinite-canvas/canvas-annotations";
import type { ImageSizeSelection } from "@/utils/imageSize";
import { CreationSizeSelector } from "../creation-size-selector";
import { INPUT_BORDER_CLASS, PRIMARY_BUTTON_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
import { CompositionCanvas } from "./composition-canvas";
import { CompositionImageLibrary, CompositionTextLibrary, type TextLibrary } from "./composition-assets";
import { nextRegionColor, REGION_TYPES, serializeMossComposition, type CompositionDraft, type CompositionRect, type CompositionRegion, type CompositionSize } from "./composition-draft";
import { deserializeMossComposition } from "./composition-json";

const JSON_FIELD = "min-h-72 font-mono text-xs";
const BUTTON = "inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition hover:bg-accent active:scale-95 focus-visible:outline-2 focus-visible:outline-accent-fill motion-reduce:transition-none";
const FIELD = "w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent-fill";
const TEXT_LIBRARIES = ["character", "background"] as const;
type Layer = { type: "base" | "json" | "import-json" } | { type: "text"; library: TextLibrary; region?: string };

interface CompositionPopup {
  kind: "size" | "color";
  x: number;
  y: number;
}

interface PopupProps {
  popup: CompositionPopup | null;
  setPopup: (popup: CompositionPopup | null) => void;
}

function CompositionPopover({ kind, popup, setPopup, label, className, children, content }: PopupProps & {
  kind: CompositionPopup["kind"];
  label: string;
  className: string;
  children: ReactNode;
  content: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const anchor = popup?.kind === kind ? popup : null;

  function close() {
    // 外部按下会先关闭浮层，让尺寸输入先失焦，提交手输的宽高。
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && panel.current?.contains(focused)) focused.blur();
    setPopup(null);
  }

  function toggle() {
    const rect = trigger.current?.getBoundingClientRect();
    if (anchor) close();
    else if (rect) setPopup({ kind, x: rect.left, y: rect.bottom + 6 });
  }

  return <>
    <button type="button" ref={trigger} data-moss-size={kind === "size" ? "" : undefined}
      data-moss-color={kind === "color" ? "" : undefined} aria-label={label} aria-haspopup="dialog"
      aria-expanded={Boolean(anchor)} aria-controls={anchor ? id : undefined} className={className}
      onPointerDown={event => event.stopPropagation()} onClick={toggle}>{children}</button>
    {/* 像贴在按钮旁的面板：共享浮层绕过画布裁切，不参与页面排版。 */}
    {anchor && <ContextMenuShell x={anchor.x} y={anchor.y} label={label} role="dialog" onClose={close}
      className={kind === "size" ? "w-[26rem] p-3" : "w-48 p-3"}>
      <div id={id} ref={panel} data-moss-popover={kind} onKeyDown={event => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        close();
        trigger.current?.focus({ preventScroll: true });
      }}>{content}</div>
    </ContextMenuShell>}
  </>;
}

function DescriptionLibraries({ onChoose }: { onChoose: (library: TextLibrary) => void }) {
  const { t } = useTranslation();
  return <div className="mt-2 flex flex-wrap gap-1.5">
    {TEXT_LIBRARIES.map(library => <button key={library} type="button" className={cn(BUTTON, INPUT_BORDER_CLASS)} onClick={() => onChoose(library)}>
      {t(`create.mossComposition.library_${library}`)}
    </button>)}
  </div>;
}

function CompositionPromptField({ label, value, onChange, className }: {
  label: string; value: string; onChange: (value: string) => void; className?: string;
}) {
  const id = useId();
  return <div className={cn("grid gap-1", className)}>
    <span id={`${id}-label`}>{label}</span>
    {/* 构图描述：转译结果和手动输入都只写入这块描述。 */}
    <PromptInput id={id} aria-labelledby={`${id}-label`} value={value} onValueChange={onChange}
      minHeight="min-h-20" className="font-normal text-foreground" />
  </div>;
}

function RegionSettings({ region, openLibrary, onUpdate, onDelete, popup, setPopup }: PopupProps & {
  region: CompositionRegion;
  openLibrary: (library: TextLibrary) => void;
  onUpdate: (patch: Partial<Omit<CompositionRegion, "id">>) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return <section className="space-y-2.5 border-t border-border p-4">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{t("create.mossComposition.regionSettings")}</h3>
      <button type="button" className={cn(BUTTON, "text-destructive")} onClick={onDelete}><Trash2 className="size-3.5" aria-hidden />{t("create.mossComposition.removeRegion")}</button>
    </div>
    {/* 区域类型的菜单浮出滚动区，避免被构图页边缘裁切。 */}
    <div className="grid gap-1 text-xs text-muted-foreground">
      <span>{t("create.mossComposition.type")}</span>
      <SimpleSelect value={region.kind} ariaLabel={t("create.mossComposition.type")} portal
        options={REGION_TYPES.map(kind => ({ value: kind, label: t(`create.mossComposition.${kind}`) }))}
        triggerClassName="text-foreground"
        onChange={value => {
          const kind = REGION_TYPES.find(item => item === value);
          if (kind) onUpdate({ kind });
        }} />
    </div>
    {/* 区域颜色：入口显示当前色，点击展开与节点标签一致的基础色。 */}
    <div className="flex items-center justify-between gap-2 text-xs">
      <span>{t("create.mossComposition.regionColor")}</span>
      <CompositionPopover kind="color" popup={popup} setPopup={setPopup} label={t("create.mossComposition.regionColor")}
        className={cn(BUTTON, INPUT_BORDER_CLASS)} content={<div className="grid grid-cols-6 justify-items-center gap-2">
          {ANNOTATION_COLORS.map(color => <button key={color} type="button" data-moss-swatch={color}
            aria-label={t("canvas.annotationColorValue", { color })} aria-pressed={region.color.toLowerCase() === color}
            className="size-5 rounded-full border border-foreground/25 transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-foreground motion-reduce:transition-none"
            style={{ backgroundColor: color }} onClick={() => onUpdate({ color })} />)}
        </div>}>
        <span aria-hidden className="size-4 rounded-full border border-foreground/25" style={{ backgroundColor: region.color }} />
        <ChevronDown aria-hidden className="size-3.5" />
      </CompositionPopover>
    </div>
    {region.kind === "text" && <label className="grid gap-1 text-xs text-muted-foreground">{t("create.mossComposition.literalText")}
      <input value={region.text} onChange={event => onUpdate({ text: event.target.value })} className={cn(FIELD, "text-foreground")} />
    </label>}
    <CompositionPromptField className="text-xs text-muted-foreground" label={t("create.mossComposition.regionCaption")}
      value={region.caption} onChange={caption => onUpdate({ caption })} />
    <DescriptionLibraries onChoose={openLibrary} />
  </section>;
}

function JsonPreview({ draft, size, onClose }: { draft: CompositionDraft; size: CompositionSize; onClose: () => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const json = serializeMossComposition(draft, size);
  // 复制紧凑原文；只在只读预览里排版，便于比对生成的字段。
  const [copyStatus, setCopyStatus] = useState<"copied" | "copyFailed">();
  async function copy() {
    try { await navigator.clipboard.writeText(json); setCopyStatus("copied"); }
    catch { setCopyStatus("copyFailed"); }
  }
  return <ResourceDialogShell open title={t("create.mossComposition.preview")} titleId={titleId} onOpenChange={onClose}
    footer={<div className="flex w-full items-center justify-end gap-3"><span role="status" className="text-xs text-muted-foreground">{copyStatus && t(`create.mossComposition.${copyStatus}`)}</span><button type="button" className={cn(BUTTON, PRIMARY_BUTTON_CLASS)} onClick={() => void copy()}>{t("create.mossComposition.copy")}</button></div>}>
    <textarea aria-label={t("create.mossComposition.preview")} data-moss-json readOnly spellCheck={false} className={cn(FIELD, JSON_FIELD)} value={JSON.stringify(JSON.parse(json), null, 2)} />
  </ResourceDialogShell>;
}

function JsonImport({ size, onImport, onClose }: {
  size: CompositionSize;
  onImport: (draft: CompositionDraft) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);

  function apply() {
    const imported = deserializeMossComposition(text, size);
    if (!imported?.regions.length) {
      setInvalid(true);
      return;
    }
    onImport(imported);
  }

  return <ResourceDialogShell open title={t("create.mossComposition.importJson")} titleId={titleId} onOpenChange={onClose}
    footer={<div className="flex w-full items-center justify-end gap-2">
      <button type="button" className={BUTTON} onClick={onClose}>{t("common.cancel")}</button>
      <button type="button" data-moss-json-import-apply className={cn(BUTTON, PRIMARY_BUTTON_CLASS, "disabled:opacity-40")}
        disabled={!text.trim()} onClick={apply}>{t("create.mossComposition.importJsonApply")}</button>
    </div>}>
    <div className="grid gap-2">
      <p id={`${titleId}-hint`} className="text-xs text-muted-foreground">
        {t("create.mossComposition.importJsonHint", { width: size.width, height: size.height })}
      </p>
      {/* 导入窗口：校验失败时留住粘贴内容，方便就地修改。 */}
      <textarea autoFocus aria-label={t("create.mossComposition.importJson")} aria-invalid={invalid}
        aria-describedby={invalid ? `${titleId}-hint ${titleId}-error` : `${titleId}-hint`}
        data-moss-json-import-input spellCheck={false} className={cn(FIELD, JSON_FIELD)} value={text}
        onChange={event => { setText(event.target.value); setInvalid(false); }} />
      {invalid && <p id={`${titleId}-error`} role="alert" className="text-xs text-destructive">{t("create.mossComposition.importJsonInvalid")}</p>}
    </div>
  </ResourceDialogShell>;
}

/** 编辑中的草稿独立于已应用的版本，取消只关掉编辑器。 */
export function MossCompositionEditor({ initial, initialSize, onApply, onClose }: {
  initial: CompositionDraft;
  initialSize: ImageSizeSelection;
  onApply: (draft: CompositionDraft, size?: ImageSizeSelection) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const [draft, setDraft] = useState(initial);
  const importButton = useRef<HTMLButtonElement>(null);
  const [popup, setPopup] = useState<CompositionPopup | null>(null);
  const [editedSize, setEditedSize] = useState<ImageSizeSelection>();
  const size = editedSize ?? initialSize;
  const [selectedId, setSelected] = useState<string | null>(initial.regions[0]?.id ?? null);
  const [drawing, setDrawing] = useState(false);
  const [grid, setGrid] = useState(false);
  const [layer, setLayer] = useState<Layer>();
  const region = draft.regions.find(item => item.id === selectedId);
  const canApply = Boolean(draft.regions.length) && draft.regions.every(item => item.kind !== "text" || item.text.trim());
  const closeLayer = () => setLayer(undefined);
  const canApplyHint = !draft.regions.length ? "addRequired" : "textRequired";

  function closeImport() {
    closeLayer();
    requestAnimationFrame(() => importButton.current?.focus({ preventScroll: true }));
  }

  function importComposition(imported: CompositionDraft) {
    // JSON 只描述构图，先替换编辑中的区域和描述，描框用的底图照常保留。
    setDraft(current => ({ ...imported, base: current.base }));
    setSelected(imported.regions[0]?.id ?? null);
    setDrawing(false);
    closeImport();
  }

  function updateRegion(id: string, patch: Partial<Omit<CompositionRegion, "id">>) {
    setDraft(current => ({ ...current, regions: current.regions.map(item => item.id === id ? { ...item, ...patch } : item) }));
  }

  function addRegion(rect: CompositionRect) {
    const id = crypto.randomUUID();
    setDraft(current => ({
      ...current,
      regions: [...current.regions, { ...rect, id, kind: "object", caption: "", text: "", color: nextRegionColor(current.regions) }],
    }));
    setSelected(id);
    setDrawing(false);
  }

  function removeRegion(id: string) {
    const regions = draft.regions.filter(item => item.id !== id);
    setDraft({ ...draft, regions });
    setSelected(regions[0]?.id ?? null);
  }

  /** 打开库时记住写入位置，避免选中的素材落到另一个区域。 */
  function insertText(text: string, id?: string) {
    const append = (current: string) => [current.trim(), text.trim()].filter(Boolean).join(", ");
    setDraft(current => id
      ? { ...current, regions: current.regions.map(item => item.id === id ? { ...item, caption: append(item.caption) } : item) }
      : { ...current, summary: append(current.summary) });
  }

  return <ResourceDialogShell open presentation="page" dismissOnEscape={!layer && !popup} title={t("create.mossComposition.title")} titleId={titleId}
    onOpenChange={onClose} bodyPadded={false}
    footer={<div className="flex w-full flex-wrap items-center justify-end gap-2">
      {!canApply && <span className="mr-auto text-xs text-muted-foreground">{t(`create.mossComposition.${canApplyHint}`)}</span>}
      <button type="button" ref={importButton} data-moss-import-json className={cn(BUTTON, INPUT_BORDER_CLASS)} onClick={() => setLayer({ type: "import-json" })}>
        <Upload className="size-3.5" aria-hidden />{t("create.mossComposition.importJson")}
      </button>
      <button type="button" className={cn(BUTTON, INPUT_BORDER_CLASS)} onClick={() => setLayer({ type: "json" })}><Braces className="size-3.5" aria-hidden />{t("create.mossComposition.preview")}</button>
      <button type="button" className={BUTTON} onClick={onClose}>{t("common.cancel")}</button>
      <button type="button" data-moss-apply className={cn(BUTTON, PRIMARY_BUTTON_CLASS, "disabled:opacity-40")} disabled={!canApply} onClick={() => onApply(draft, editedSize)}>{t("create.mossComposition.apply")}</button>
    </div>}>
    <div className="@container h-full p-3 sm:p-5">
      <div className="grid gap-4 @min-[760px]:h-full @min-[760px]:min-h-60 @min-[760px]:grid-cols-[minmax(0,1fr)_clamp(240px,23%,300px)] @min-[760px]:grid-rows-[minmax(0,1fr)]">
        {/* 左侧绘图区占满主区可用高度，窄窗口保留画框空间并在下方显示属性。 */}
        <section className="grid h-[clamp(320px,70dvh,720px)] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-border bg-background/75 @min-[760px]:h-full">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-2.5">
            <button type="button" className={cn(BUTTON, INPUT_BORDER_CLASS)} data-moss-pick-base onClick={() => setLayer({ type: "base" })}><ImagePlus className="size-3.5" aria-hidden />{t("create.mossComposition.pickBase")}</button>
            <button type="button" className={cn(BUTTON, INPUT_BORDER_CLASS, drawing && "bg-accent")} aria-pressed={drawing} data-moss-draw onClick={() => setDrawing(!drawing)}><Scan className="size-3.5" aria-hidden />{t("create.mossComposition.draw")}</button>
            {/* 画框工具条：复用创作页尺寸选择器，应用构图时才回写创作页。 */}
            <CompositionPopover kind="size" popup={popup} setPopup={setPopup} label={t("create.imageSizeSection.title")}
              className={cn(BUTTON, INPUT_BORDER_CLASS, "tabular-nums", popup?.kind === "size" && "bg-accent")}
              content={<CreationSizeSelector value={size} onChange={setEditedSize} />}>
              <span>{size.width} × {size.height}</span>
              <ChevronDown aria-hidden className={cn("size-3.5", popup?.kind === "size" && "rotate-180")} />
            </CompositionPopover>
            <button type="button" className={cn(BUTTON, "ml-auto", grid && "bg-accent")} aria-pressed={grid} onClick={() => setGrid(!grid)}><Grid2X2 className="size-3.5" aria-hidden />{t("create.mossComposition.grid")}</button>
          </div>
          <CompositionCanvas draft={draft} size={size} selectedId={selectedId} drawing={drawing} grid={grid} onSelect={setSelected} onAdd={addRegion} onChange={updateRegion} />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            {draft.base ? <div className="flex min-w-0 items-center gap-1"><span className="truncate">{draft.base.name}</span><button type="button" className={BUTTON} onClick={() => setDraft(current => ({ ...current, base: undefined }))}>{t("create.mossComposition.removeBase")}</button></div> : <span>{t("create.mossComposition.baseHint")}</span>}
            <span>{t(drawing ? "create.mossComposition.drawHint" : "create.mossComposition.moveHint")}</span>
          </div>
        </section>
        {/* 右侧属性，窄窗口按画布、整体描述、区域属性的顺序堆叠。 */}
        <aside className="min-w-0 self-start rounded-xl border border-border bg-background/75 @min-[760px]:max-h-full @min-[760px]:overflow-y-auto">
          <section className="p-4">
            <CompositionPromptField className="gap-2 text-sm font-semibold" label={t("create.mossComposition.summary")}
              value={draft.summary} onChange={summary => setDraft(current => ({ ...current, summary }))} />
            <DescriptionLibraries onChoose={library => setLayer({ type: "text", library })} />
          </section>
          <section className="border-t border-border p-4">
            <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{t("create.mossComposition.regions")}</h3><span className="text-xs text-muted-foreground">{t("create.mossComposition.count", { count: draft.regions.length })}</span></div>
            <div className="mt-2 grid max-h-36 gap-1 overflow-y-auto">
              {draft.regions.map((item, index) => <button type="button" key={item.id} aria-pressed={item.id === selectedId} onClick={() => setSelected(item.id)} className={cn(BUTTON, "min-w-0 justify-start", item.id === selectedId && "bg-accent")}>
                <span aria-hidden className="size-2.5 shrink-0 rounded-full border border-foreground/20" style={{ backgroundColor: item.color }} />
                <span className="truncate">{item.kind === "text" && item.text.trim() ? item.text.trim() : `${t(`create.mossComposition.${item.kind}`)} ${index + 1}`}</span>
              </button>)}
              {!draft.regions.length && <p className="py-1 text-xs text-muted-foreground">{t("create.mossComposition.addRequired")}</p>}
            </div>
          </section>
          {region && <RegionSettings key={region.id} region={region} popup={popup} setPopup={setPopup} onUpdate={patch => updateRegion(region.id, patch)} onDelete={() => removeRegion(region.id)} openLibrary={library => setLayer({ type: "text", library, region: region.id })} />}
        </aside>
      </div>
    </div>
    {layer?.type === "base" && <CompositionImageLibrary selected={draft.base?.path} onClose={closeLayer} onPick={base => { setDraft(current => ({ ...current, base })); closeLayer(); }} />}
    {layer?.type === "text" && <CompositionTextLibrary library={layer.library} onOpenChange={open => { if (!open) closeLayer(); }} onInsert={text => insertText(text, layer.region)} />}
    {layer?.type === "import-json" && <JsonImport size={size} onImport={importComposition} onClose={closeImport} />}
    {layer?.type === "json" && <JsonPreview draft={draft} size={size} onClose={closeLayer} />}
  </ResourceDialogShell>;
}

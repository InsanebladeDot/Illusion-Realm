"use client";

// 界面：Edit 快速验证面板；只负责涂抹 / mask 导出 / 上传验证，不拼装尚未提供的重绘工作流。
import { useEffect, useRef } from "react";
import { Brush, Eraser, Undo2, Redo2, Trash2, Upload } from "lucide-react";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import { downloadMaskImage, type MaskExports } from "@/utils/mask-image";
import { MaskSketchSurface } from "./mask-sketch-surface";
import { useMaskEditor, type MaskEditorState } from "./use-mask-editor";

const BUTTON = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted disabled:opacity-40";
function MaskPreviewImage({ blob, name, kind }: { blob: Blob; name: string; kind: string }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    if (image.current) image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  // eslint-disable-next-line @next/next/no-img-element -- 显示用户生成的本地 Blob
  return <img ref={image} data-mask-preview={kind} alt={name} className="h-40 w-full object-contain bg-muted" />;
}
function MaskExportPreview({ exports, name }: { exports: MaskExports; name: string }) {
  const { t } = useTranslation();
  return <div data-mask-results className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {(["mask", "image"] as const).map((kind) => <div key={kind} className="space-y-2 rounded-xl border border-border p-3">
      <div className="text-sm font-medium">{t(kind === "mask" ? "create.maskEditor.mask" : "create.maskEditor.alphaImage")}</div>
      {/* 界面：验证实际导出的 PNG，而非编辑中的 SVG */}
      <MaskPreviewImage blob={exports[kind]} name={name} kind={kind} />
      <button type="button" className={BUTTON} data-mask-download={kind} onClick={() => downloadMaskImage(exports[kind], `${name.replace(/\.[^.]+$/, "")}_${kind}.png`)}>{t("create.maskEditor.download")}</button>
    </div>)}
  </div>;
}

function MaskToolbar({ editor }: { editor: MaskEditorState }) {
  const { t } = useTranslation();
  const { sketch, erasing, setErase, brush, setBrush, color, setColor, busy } = editor;
  return <div className="flex flex-wrap items-center gap-2">
          {([false, true] as const).map((erase) => { const Icon = erase ? Eraser : Brush; return <button key={String(erase)} type="button" data-mask-mode={erase ? "erase" : "draw"} aria-pressed={erasing === erase} disabled={busy}
            className={cn(BUTTON, erasing === erase && "bg-muted text-foreground")} onClick={() => setErase(erase)}><Icon className="h-3.5 w-3.5" />{t(erase ? "create.maskEditor.erase" : "create.maskEditor.draw")}</button>; })}
          <label className="flex items-center gap-2 text-xs">{t("create.maskEditor.brush")}<input data-mask-brush type="range" min="1" max="256" value={brush} disabled={busy} onChange={(event) => setBrush(Number(event.target.value))} className="w-24" />{brush}px</label>
          <label className="flex items-center gap-2 text-xs">{t("create.maskEditor.color")}<input data-mask-color type="color" value={color} disabled={busy} onChange={(event) => setColor(event.target.value)} className="h-7 w-8 cursor-pointer rounded border border-border bg-transparent" /></label>
          {([{ action: "undo", Icon: Undo2 }, { action: "redo", Icon: Redo2 }, { action: "clearCanvas", Icon: Trash2 }] as const).map(({ action, Icon }) => <button key={action} type="button" data-mask-action={action} disabled={busy} className={BUTTON} title={t(action === "undo" ? "create.maskEditor.undo" : action === "redo" ? "create.maskEditor.redo" : "create.maskEditor.clear")} onClick={() => sketch.current?.[action]()}><Icon className="h-3.5 w-3.5" /><span className="sr-only">{t(action === "undo" ? "create.maskEditor.undo" : action === "redo" ? "create.maskEditor.redo" : "create.maskEditor.clear")}</span></button>)}
    </div>;
}
function MaskWorkspace({ editor }: { editor: MaskEditorState }) {
  const { t } = useTranslation();
  const { source, sketch, color, brush, busy, changed, exports, generate } = editor;
  if (!source) return null;
  return <>
        <MaskToolbar editor={editor} />
        <div className={busy ? "pointer-events-none" : ""}>
          {/* 界面：原图上的半透明涂抹层，导出时只读取笔迹覆盖率。 */}
          <MaskSketchSurface key={source.url} source={source} sketchRef={sketch} color={color} brush={brush} onChange={changed} />
        </div>
        <div className="flex flex-wrap items-center gap-2"><span data-mask-size className="mr-auto text-xs text-muted-foreground">{source.width} × {source.height} px</span>
          <button type="button" data-mask-export className={BUTTON} disabled={busy} onClick={() => { void generate(false); }}>{t(busy ? "create.maskEditor.busy" : "create.maskEditor.export")}</button>
          <button type="button" data-mask-upload className={BUTTON} disabled={busy} onClick={() => { void generate(true); }}>{t("create.maskEditor.upload")}</button>
        </div>
        {exports && <><MaskExportPreview exports={exports} name={source.name} /><p className="text-xs leading-relaxed text-muted-foreground">{t("create.maskEditor.exportHint")}</p></>}
      </>;
}
export function MaskEditorPanel() {
  const { t } = useTranslation(), editor = useMaskEditor();
  const { source, busy, importImage, error, uploadJson } = editor;
  return <div data-mask-editor className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pr-14 xl:pr-0"><h2 className="text-sm font-semibold">{t("create.maskEditor.title")}</h2>
        <label className={cn(BUTTON, "cursor-pointer")}><Upload className="h-3.5 w-3.5" />{t("create.maskEditor.import")}
          <input data-mask-import className="hidden" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { void importImage(event); }} />
        </label>
      </div>
      <p className="pr-12 text-xs leading-relaxed text-muted-foreground xl:pr-0">{t("create.maskEditor.hint")}</p>
      {/* 界面：Edit 的原图画布、导出预览和验证结果 */}
      {source ? <MaskWorkspace editor={editor} /> : <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">{t("create.maskEditor.empty")}</div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {uploadJson && <div className="space-y-2"><p className="text-xs text-muted-foreground">{t("create.maskEditor.uploaded")}</p><pre data-mask-upload-result className="overflow-x-auto rounded-xl bg-muted p-3 text-xs">{uploadJson}</pre></div>}
    </div>
  </div>;
}

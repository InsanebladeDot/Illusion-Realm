"use client";

import { useRef } from "react";
import {
  AlignVerticalJustifyCenter,
  ArrowLeft,
  Download,
  FlipHorizontal,
  FlipVertical,
  ImagePlus,
  Redo2,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import {
  CARTOON_SYSTEM_FONTS,
  CARTOON_TEXT_COLOR_PRESETS,
  CARTOON_WEB_FONTS,
  resolveCartoonFont,
} from "@/data/cartoonFonts";
import type {
  CartoonBackground,
  CartoonBubbleAsset,
  CartoonBubblePlacement,
  CartoonComposeTextItem,
  CartoonCustomFont,
  CartoonExportFormat,
  CartoonPlacedBubble,
  CartoonTextAlign,
  CartoonTextDirection,
} from "@/types/cartoonBubble";
import { boxSizePercent, patchTextItemBoxSize } from "@/utils/cartoon/composeTextLayout";
import {
  downloadComposeDraftFile,
  parseComposeDraftFile,
  type ComposeEditorSnapshot,
} from "@/utils/cartoon/composeDraft";
import { dialogueLengthHint } from "@/utils/cartoon/normalizeTextItem";
import { directionLabel } from "@/utils/cartoon/textLayout";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import { ACCENT_TOGGLE_ON_CLASS, THIN_BORDER_CLASS } from "@/utils/layout";

type CartoonComposeSidebarProps = {
  bubbles: CartoonPlacedBubble[];
  resolveAsset: (assetId: string) => CartoonBubbleAsset | undefined;
  selectedBubble: CartoonPlacedBubble | null;
  selectedBubbleAsset: CartoonBubbleAsset | null;
  selectedText: CartoonComposeTextItem | null;
  background: CartoonBackground | null;
  exporting: boolean;
  exportFormat: CartoonExportFormat;
  canUndo: boolean;
  canRedo: boolean;
  customFonts: CartoonCustomFont[];
  fontSizeMin: number;
  fontSizeMax: number;
  onBubbleSelect: (id: string) => void;
  onBubbleDelete: () => void;
  onTextItemChange: (id: string, patch: Partial<CartoonComposeTextItem>) => void;
  onTextItemSelect: (id: string) => void;
  onTextItemDelete: () => void;
  onBackgroundChange: (background: CartoonBackground) => void;
  onExportFormatChange: (format: CartoonExportFormat) => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onLoadDraft: (snapshot: ComposeEditorSnapshot) => void;
  getSnapshot: () => ComposeEditorSnapshot;
  onAddCustomFont: (file: File) => Promise<CartoonCustomFont | null>;
  onPlacementChange: (patch: Partial<CartoonBubblePlacement>) => void;
  onPlacementEditStart?: () => void;
  onPlacementEditEnd?: () => void;
  onBack: () => void;
};

export function CartoonComposeSidebar({
  bubbles,
  resolveAsset,
  selectedBubble,
  selectedBubbleAsset,
  selectedText,
  background,
  exporting,
  exportFormat,
  canUndo,
  canRedo,
  customFonts,
  fontSizeMin,
  fontSizeMax,
  onBubbleSelect,
  onBubbleDelete,
  onTextItemChange,
  onTextItemSelect,
  onTextItemDelete,
  onBackgroundChange,
  onExportFormatChange,
  onExport,
  onUndo,
  onRedo,
  onLoadDraft,
  getSnapshot,
  onAddCustomFont,
  onPlacementChange,
  onPlacementEditStart,
  onPlacementEditEnd,
  onBack,
}: CartoonComposeSidebarProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);
  const placement = selectedBubble?.placement;
  const textItems = selectedBubble?.textItems ?? [];
  const boxPercent = selectedText ? boxSizePercent(selectedText.box) : null;
  const dialogueHint = selectedText ? dialogueLengthHint(selectedText.text) : null;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => {
        onBackgroundChange({
          src,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleFontUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await onAddCustomFont(file);
    event.target.value = "";
  };

  const handleDraftImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const draft = parseComposeDraftFile(reader.result as string);
      if (!draft) return;
      onLoadDraft(draft);
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const patchSelected = (patch: Partial<CartoonComposeTextItem>) => {
    if (!selectedText) return;
    onTextItemChange(selectedText.id, patch);
  };

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background/80",
        THIN_BORDER_CLASS
      )}
    >
      <div className="shrink-0 border-b border-border/60 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("cartoon.compose.back")}
        </button>
        <h2 className="text-sm font-medium">
          {selectedText
            ? t("cartoon.compose.textItemSection")
            : selectedBubble
              ? t("cartoon.compose.bubbleSection")
              : t("cartoon.compose.defaultSection")}
        </h2>
        <div className="mt-2 flex gap-1">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title={t("cartoon.compose.undo")}
            className="rounded-md border border-border p-1.5 disabled:opacity-40"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            title={t("cartoon.compose.redo")}
            className="rounded-md border border-border p-1.5 disabled:opacity-40"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 [scrollbar-gutter:stable]">
        <div>
          <p className="mb-2 text-xs font-medium">{t("cartoon.compose.backgroundSection")}</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs font-medium transition-colors hover:bg-muted/50"
          >
            <ImagePlus className="h-4 w-4" />
            {background
              ? t("cartoon.compose.changeBackground")
              : t("cartoon.compose.uploadBackground")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={handleFileChange}
          />
        </div>

        <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-xs font-medium">{t("cartoon.compose.projectSection")}</p>
          <p className="text-[11px] text-muted-foreground">
            {t("cartoon.compose.projectHint")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadComposeDraftFile(getSnapshot())}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/50"
            >
              {t("cartoon.compose.exportProject")}
            </button>
            <button
              type="button"
              onClick={() => draftInputRef.current?.click()}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/50"
            >
              {t("cartoon.compose.importProject")}
            </button>
          </div>
          <input
            ref={draftInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={handleDraftImport}
          />
        </div>

        {bubbles.length > 0 ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium">
                {t("cartoon.compose.bubbleListTitle")}
                {bubbles.length})
              </p>
              {selectedBubble ? (
                <button
                  type="button"
                  onClick={onBubbleDelete}
                  title={t("cartoon.compose.bubbleListDeleteTitle")}
                  className="inline-flex items-center gap-1 rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-700 dark:text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="h-3 w-3" />
                  {t("common.delete")}
                </button>
              ) : null}
            </div>
            <ul className="space-y-1">
              {bubbles.map((bubble, index) => {
                const asset = resolveAsset(bubble.assetId);
                return (
                  <li key={bubble.id}>
                    <button
                      type="button"
                      onClick={() => onBubbleSelect(bubble.id)}
                      className={cn(
                        "w-full rounded-lg border px-2 py-1.5 text-left text-xs transition-colors",
                        selectedBubble?.id === bubble.id
                          ? "border-sky-500/50 bg-sky-500/10"
                          : "border-border hover:bg-muted/40"
                      )}
                    >
                      <span className="text-muted-foreground">#{index + 1} </span>
                      {asset?.name ?? t("cartoon.compose.unknownAsset")}
                      {bubble.textItems.length > 0
                        ? t("cartoon.compose.bubbleTextCount", {
                            count: bubble.textItems.length,
                          })
                        : ""}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {textItems.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium">
              {t("cartoon.compose.textLayerTitle")}
              {textItems.length})
            </p>
            <ul className="space-y-1">
              {textItems.map((item, index) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onTextItemSelect(item.id)}
                    className={cn(
                      "w-full rounded-lg border px-2 py-1.5 text-left text-xs transition-colors",
                      selectedText?.id === item.id
                        ? "border-sky-500/50 bg-sky-500/10"
                        : "border-border hover:bg-muted/40"
                    )}
                  >
                    <span className="text-muted-foreground">#{index + 1} </span>
                    {item.text.trim() || t("cartoon.compose.emptyTextBox")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {selectedBubble && placement && !selectedText ? (
          <div className="space-y-4 rounded-lg border border-border/70 bg-muted/20 p-3">
            <div>
              <p className="mb-1 text-xs font-medium text-foreground">
                {t("cartoon.compose.bubbleSection")}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedBubbleAsset?.name ?? t("cartoon.compose.unknownAsset")}
                {t("cartoon.compose.metaRotation")}{" "}
                {Math.round(placement.rotation)}
                {t("cartoon.compose.metaWidth")}{" "}
                {Math.round(placement.scaleX * 100)}
                {t("cartoon.compose.metaHeight")}{" "}
                {Math.round(placement.scaleY * 100)}%
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium">
                {t("cartoon.compose.flipSection")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onPlacementEditStart?.();
                    onPlacementChange({ flipX: !placement.flipX });
                    onPlacementEditEnd?.();
                  }}
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    placement.flipX ? ACCENT_TOGGLE_ON_CLASS : "border-border hover:bg-muted/50"
                  )}
                >
                  <FlipHorizontal className="h-3.5 w-3.5" />
                  {t("cartoon.compose.flipHorizontal")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onPlacementEditStart?.();
                    onPlacementChange({ flipY: !placement.flipY });
                    onPlacementEditEnd?.();
                  }}
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    placement.flipY ? ACCENT_TOGGLE_ON_CLASS : "border-border hover:bg-muted/50"
                  )}
                >
                  <FlipVertical className="h-3.5 w-3.5" />
                  {t("cartoon.compose.flipVertical")}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {t("cartoon.compose.flipHint")}
              </p>
            </div>

            <div>
              <div className="mb-2 flex justify-between text-xs">
                <span className="font-medium">{t("cartoon.compose.opacity")}</span>
                <span className="text-muted-foreground">
                  {Math.round(placement.opacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(placement.opacity * 100)}
                onPointerDown={() => onPlacementEditStart?.()}
                onPointerUp={() => onPlacementEditEnd?.()}
                onPointerCancel={() => onPlacementEditEnd?.()}
                onChange={(event) =>
                  onPlacementChange({ opacity: Number(event.target.value) / 100 })
                }
                className="w-full accent-sky-600"
              />
            </div>
          </div>
        ) : null}

        {selectedText && boxPercent ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">{t("cartoon.compose.textContent")}</p>
              <button
                type="button"
                onClick={onTextItemDelete}
                title={t("cartoon.compose.textDeleteTitle")}
                className="inline-flex items-center gap-1 rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-700 dark:text-red-300 hover:bg-red-500/10"
              >
                <Trash2 className="h-3 w-3" />
                {t("common.delete")}
              </button>
            </div>
            <textarea
              value={selectedText.text}
              onChange={(event) => patchSelected({ text: event.target.value })}
              rows={4}
              placeholder={t("cartoon.compose.textPlaceholder")}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
            />
            {dialogueHint ? (
              <p
                className={cn(
                  "text-[11px]",
                  dialogueHint.level === "ok" && "text-muted-foreground",
                  dialogueHint.level === "warn" && "text-amber-700 dark:text-amber-300",
                  dialogueHint.level === "over" && "text-red-700 dark:text-red-300"
                )}
              >
                {t("cartoon.compose.charCount")} {dialogueHint.count}
                {dialogueHint.level === "warn" ? t("cartoon.compose.charCountWarn") : ""}
                {dialogueHint.level === "over" ? t("cartoon.compose.charCountOver") : ""}
              </p>
            ) : null}

            <div>
              <p className="mb-2 text-xs font-medium">{t("cartoon.compose.alignSection")}</p>
              <div className="grid grid-cols-3 gap-1">
                {(["left", "center", "right"] as CartoonTextAlign[]).map((align) => (
                  <button
                    key={align}
                    type="button"
                    onClick={() => patchSelected({ textAlign: align })}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs",
                      selectedText.textAlign === align
                        ? ACCENT_TOGGLE_ON_CLASS
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    {align === "left"
                      ? t("cartoon.compose.alignLeft")
                      : align === "center"
                        ? t("cartoon.compose.alignCenter")
                        : t("cartoon.compose.alignRight")}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium">
                {t("cartoon.compose.directionSection")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(["horizontal", "vertical"] as const).map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    onClick={() => patchSelected({ direction })}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                      selectedText.direction === direction
                        ? ACCENT_TOGGLE_ON_CLASS
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />
                      {directionLabel(direction)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="text-font-family" className="mb-2 block text-xs font-medium">
                {t("cartoon.compose.fontLabel")}
              </label>
              <select
                id="text-font-family"
                value={selectedText.fontFamilyId}
                onChange={(event) =>
                  patchSelected({ fontFamilyId: event.target.value })
                }
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                style={{
                  fontFamily: resolveCartoonFont(
                    selectedText.fontFamilyId,
                    customFonts
                  ).family,
                }}
              >
                <optgroup label={t("cartoon.compose.fontGroupSystem")}>
                  {CARTOON_SYSTEM_FONTS.map((font) => (
                    <option key={font.id} value={font.id} style={{ fontFamily: font.family }}>
                      {font.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t("cartoon.compose.fontGroupWeb")}>
                  {CARTOON_WEB_FONTS.map((font) => (
                    <option key={font.id} value={font.id} style={{ fontFamily: font.family }}>
                      {font.label}
                    </option>
                  ))}
                </optgroup>
                {customFonts.length > 0 ? (
                  <optgroup label={t("cartoon.compose.fontGroupCustom")}>
                    {customFonts.map((font) => (
                      <option key={font.id} value={font.id} style={{ fontFamily: font.family }}>
                        {font.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              <button
                type="button"
                onClick={() => fontInputRef.current?.click()}
                className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border px-2 py-1.5 text-xs hover:bg-muted/40"
              >
                <Upload className="h-3.5 w-3.5" />
                {t("cartoon.compose.uploadFont")}
              </button>
              <input
                ref={fontInputRef}
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                className="sr-only"
                onChange={(event) => void handleFontUpload(event)}
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium">{t("cartoon.compose.colorSection")}</p>
              <div className="mb-2 grid grid-cols-7 gap-1.5">
                {CARTOON_TEXT_COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={t("cartoon.compose.colorPresetLabel", { color })}
                    onClick={() => patchSelected({ color })}
                    className={cn(
                      "h-6 w-6 rounded border border-border/80",
                      selectedText.color.toLowerCase() === color.toLowerCase() &&
                        "ring-2 ring-sky-500 ring-offset-1"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <input
                type="color"
                value={selectedText.color}
                onChange={(event) => patchSelected({ color: event.target.value })}
                className="h-9 w-full cursor-pointer rounded border border-input"
              />
            </div>

            <div>
              <div className="mb-2 flex justify-between text-xs">
                <span className="font-medium">{t("cartoon.compose.fontSize")}</span>
                <span className="text-muted-foreground">{selectedText.fontSize}px</span>
              </div>
              <input
                type="range"
                min={fontSizeMin}
                max={fontSizeMax}
                value={selectedText.fontSize}
                onChange={(event) =>
                  patchSelected({ fontSize: Number(event.target.value) })
                }
                className="w-full accent-foreground"
              />
            </div>

            <div>
              <div className="mb-2 flex justify-between text-xs">
                <span className="font-medium">{t("cartoon.compose.lineHeight")}</span>
                <span className="text-muted-foreground">
                  {selectedText.lineHeightScale.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.8}
                max={2}
                step={0.05}
                value={selectedText.lineHeightScale}
                onChange={(event) =>
                  patchSelected({ lineHeightScale: Number(event.target.value) })
                }
                className="w-full accent-sky-600"
              />
            </div>

            <div>
              <div className="mb-2 flex justify-between text-xs">
                <span className="font-medium">{t("cartoon.compose.letterSpacing")}</span>
                <span className="text-muted-foreground">{selectedText.letterSpacing}px</span>
              </div>
              <input
                type="range"
                min={-2}
                max={12}
                step={0.5}
                value={selectedText.letterSpacing}
                onChange={(event) =>
                  patchSelected({ letterSpacing: Number(event.target.value) })
                }
                className="w-full accent-sky-600"
              />
            </div>

            <div>
              <div className="mb-2 flex justify-between text-xs">
                <span className="font-medium">{t("cartoon.compose.strokeWidth")}</span>
                <span className="text-muted-foreground">{selectedText.strokeWidth}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={8}
                step={0.5}
                value={selectedText.strokeWidth}
                onChange={(event) =>
                  patchSelected({ strokeWidth: Number(event.target.value) })
                }
                className="w-full accent-sky-600"
              />
              {selectedText.strokeWidth > 0 ? (
                <input
                  type="color"
                  value={selectedText.strokeColor}
                  onChange={(event) =>
                    patchSelected({ strokeColor: event.target.value })
                  }
                  className="mt-2 h-8 w-full cursor-pointer rounded border border-input"
                />
              ) : null}
            </div>

            <div>
              <div className="mb-2 flex justify-between text-xs">
                <span className="font-medium">{t("cartoon.compose.textRotation")}</span>
                <span className="text-muted-foreground">
                  {Math.round(selectedText.textRotation)}°
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={180}
                value={selectedText.textRotation}
                onChange={(event) =>
                  patchSelected({ textRotation: Number(event.target.value) })
                }
                className="w-full accent-sky-600"
              />
            </div>

            <div className="space-y-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
              <p className="text-xs font-medium text-sky-700 dark:text-sky-300">
                {t("cartoon.compose.textBoxSection")}
              </p>
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span>{t("cartoon.compose.boxWidth")}</span>
                  <span>{boxPercent.width}%</span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={95}
                  value={boxPercent.width}
                  onChange={(event) =>
                    patchSelected({
                      box: patchTextItemBoxSize(
                        selectedText.box,
                        Number(event.target.value),
                        boxPercent.height
                      ),
                    })
                  }
                  className="w-full accent-sky-600"
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span>{t("cartoon.compose.boxHeight")}</span>
                  <span>{boxPercent.height}%</span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={95}
                  value={boxPercent.height}
                  onChange={(event) =>
                    patchSelected({
                      box: patchTextItemBoxSize(
                        selectedText.box,
                        boxPercent.width,
                        Number(event.target.value)
                      ),
                    })
                  }
                  className="w-full accent-sky-600"
                />
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="shrink-0 space-y-2 border-t border-border/60 p-4">
        <div className="flex gap-2">
          {(["png", "jpeg"] as const).map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => onExportFormatChange(format)}
              className={cn(
                "flex-1 rounded-md border px-2 py-1 text-xs uppercase",
                exportFormat === format
                  ? ACCENT_TOGGLE_ON_CLASS
                  : "border-border hover:bg-muted/50"
              )}
            >
              {format}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={exporting || !background || bubbles.length === 0}
          onClick={onExport}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-40"
        >
          <Download className="h-4 w-4" />
          {exporting
            ? t("cartoon.compose.exporting")
            : t("cartoon.compose.export", {
                format: exportFormat.toUpperCase(),
              })}
        </button>
      </div>
    </aside>
  );
}

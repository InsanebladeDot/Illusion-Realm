"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "@/assets/cartoon/cartoon-fonts.css";
import { BUILTIN_CARTOON_ASSETS } from "@/data/cartoonAssets";
import { useToastStore } from "@/stores/useToastStore";
import { useCartoonBubbleStore } from "@/stores/useCartoonBubbleStore";
import type {
  CartoonBubbleAsset,
  CartoonBubblePlacement,
  CartoonExportFormat,
  CartoonSetupConfig,
} from "@/types/cartoonBubble";
import { CARTOON_FONT_SIZE_MAX, CARTOON_FONT_SIZE_MIN } from "@/types/cartoonBubble";
import { findTextItemAt } from "@/utils/cartoon/composeTextLayout";
import { loadCustomCartoonFonts } from "@/utils/cartoon/customFontLoad";
import {
  downloadBlob,
  exportComposeImage,
} from "@/utils/cartoon/exportComposeImage";
import { useComposeEditor } from "@/hooks/useComposeEditor";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { CartoonAssetPicker } from "@/view/cartoon/CartoonAssetPicker";
import { CartoonComposeCanvas } from "@/view/cartoon/CartoonComposeCanvas";
import { CartoonComposeSidebar } from "@/view/cartoon/CartoonComposeSidebar";
import { CustomAssetDialog } from "@/view/cartoon/CustomAssetDialog";

const DEFAULT_PLACEMENT: Partial<CartoonBubblePlacement> = {
  scaleX: 0.32,
  scaleY: 0.32,
  rotation: 0,
  flipX: false,
  flipY: false,
  opacity: 1,
};

type CartoonComposeViewProps = {
  initialConfig: CartoonSetupConfig;
  onBack: () => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function CartoonComposeView({
  initialConfig,
  onBack,
}: CartoonComposeViewProps) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const customAssets = useCartoonBubbleStore((state) => state.customAssets);
  const addCustomAsset = useCartoonBubbleStore((state) => state.addCustomAsset);
  const removeCustomAsset = useCartoonBubbleStore((state) => state.removeCustomAsset);
  const customFonts = useCartoonBubbleStore((state) => state.customFonts);
  const addCustomFont = useCartoonBubbleStore((state) => state.addCustomFont);

  const allAssets = useMemo(
    () => [...BUILTIN_CARTOON_ASSETS, ...customAssets],
    [customAssets]
  );

  const [brushAssetId, setBrushAssetId] = useState(initialConfig.asset.id);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<CartoonExportFormat>("png");
  const [previewCanvasWidth, setPreviewCanvasWidth] = useState<number | null>(null);

  const editor = useComposeEditor({
    initialAssetId: initialConfig.asset.id,
    defaultPlacement: DEFAULT_PLACEMENT,
  });

  const selectedBubble =
    editor.bubbles.find((bubble) => bubble.id === selectedBubbleId) ?? null;

  const selectedText =
    selectedBubble?.textItems.find((item) => item.id === selectedTextId) ?? null;

  const brushAsset =
    allAssets.find((asset) => asset.id === brushAssetId) ?? allAssets[0];

  const bubbleIdsKey = editor.bubbles.map((bubble) => bubble.id).join(",");

  /**
   * 渲染期同步：气泡列表变化后保证选中项仍然有效。
   * 注意这不是纯派生 —— 选中项由用户交互（点选气泡）驱动，
   * 本段只在「列表变了」时校正，因此必须保留 state。
   * 用「记录前值 + 渲染期比较」替代 effect 内 setState，语义等价且少一次级联渲染。
   */
  const [previousBubbleIdsKey, setPreviousBubbleIdsKey] = useState<string | null>(null);
  if (bubbleIdsKey !== previousBubbleIdsKey) {
    setPreviousBubbleIdsKey(bubbleIdsKey);
    if (editor.bubbles.length === 0) {
      setSelectedBubbleId(null);
      setSelectedTextId(null);
    } else {
      setSelectedBubbleId((current) => {
        if (current && editor.bubbles.some((bubble) => bubble.id === current)) {
          return current;
        }
        return editor.bubbles[editor.bubbles.length - 1].id;
      });
    }
  }

  useEffect(() => {
    void loadCustomCartoonFonts(customFonts);
  }, [customFonts]);

  const resolveAsset = useCallback(
    (assetId: string): CartoonBubbleAsset | undefined =>
      allAssets.find((asset) => asset.id === assetId),
    [allAssets]
  );

  const handleSelectAsset = useCallback(
    (asset: CartoonBubbleAsset) => {
      setBrushAssetId(asset.id);
      if (selectedBubbleId) {
        editor.setBubbleAsset(selectedBubbleId, asset.id);
        showToast(t("cartoon.compose.assetSwitched", { name: asset.name }));
        return;
      }
      showToast(t("cartoon.compose.assetSelected", { name: asset.name }));
    },
    [editor, selectedBubbleId, showToast, t]
  );

  const handleRemoveCustomAsset = useCallback(
    (id: string) => {
      removeCustomAsset(id);
      const affected = editor.bubbles.filter((bubble) => bubble.assetId === id);
      const fallback = BUILTIN_CARTOON_ASSETS[0];
      for (const bubble of affected) {
        editor.setBubbleAsset(bubble.id, fallback.id);
      }
      if (brushAssetId === id) setBrushAssetId(fallback.id);
      showToast(
        affected.length > 0
          ? t("cartoon.compose.assetRemoved")
          : t("cartoon.compose.customAssetRemoved")
      );
    },
    [brushAssetId, editor, removeCustomAsset, showToast, t]
  );

  const handleAddBubble = useCallback(
    (canvasX: number, canvasY: number) => {
      const assetId = brushAsset?.id ?? initialConfig.asset.id;
      const bubble = editor.addBubble(assetId, canvasX, canvasY);
      setSelectedBubbleId(bubble.id);
      setSelectedTextId(null);
    },
    [brushAsset?.id, editor, initialConfig.asset.id]
  );

  const handleDoubleClickBubble = useCallback(
    (bubbleId: string, relX: number, relY: number) => {
      const bubble = editor.bubbles.find((item) => item.id === bubbleId);
      if (!bubble) return;

      const hit = findTextItemAt(bubble.textItems, relX, relY);
      if (hit) {
        setSelectedBubbleId(bubbleId);
        setSelectedTextId(hit.id);
        return;
      }
      const item = editor.addTextItem(bubbleId, relX, relY);
      setSelectedBubbleId(bubbleId);
      setSelectedTextId(item.id);
    },
    [editor]
  );

  const handleExport = async () => {
    if (!editor.background || editor.bubbles.length === 0) return;
    setExporting(true);
    try {
      const blob = await exportComposeImage({
        bubbles: editor.bubbles,
        assets: allAssets,
        background: editor.background,
        previewCanvasWidth: previewCanvasWidth ?? undefined,
        format: exportFormat,
        customFonts,
      });
      const ext = exportFormat === "jpeg" ? "jpg" : "png";
      downloadBlob(blob, t("cartoon.compose.exportFileName", { ext }));
      showToast(t("cartoon.compose.exported", { format: ext.toUpperCase() }));
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("cartoon.export.failed"));
    } finally {
      setExporting(false);
    }
  };

  const deleteSelectedBubble = useCallback(() => {
    if (!selectedBubbleId) return;
    editor.deleteBubble(selectedBubbleId);
    setSelectedBubbleId(null);
    setSelectedTextId(null);
    showToast(t("cartoon.compose.bubbleDeleted"));
  }, [editor, selectedBubbleId, showToast, t]);

  const deleteSelectedText = useCallback(() => {
    if (!selectedBubbleId || !selectedTextId) return;
    editor.deleteTextItem(selectedBubbleId, selectedTextId);
    setSelectedTextId(null);
  }, [editor, selectedBubbleId, selectedTextId]);

  const editorRef = useRef(editor);
  const selectedBubbleIdRef = useRef(selectedBubbleId);
  const selectedTextIdRef = useRef(selectedTextId);

  /**
   * latest-ref：键盘快捷键处理器只订阅一次，但要读到最新的 editor 与选中项。
   * 赋值必须放在 layout effect 里 —— 渲染期写 ref 是不纯操作（react-hooks/refs 会拦），
   * 而 useLayoutEffect 在 DOM 提交后、浏览器绘制前执行，
   * 键盘事件一定晚于它，因此读到的始终是最新值。
   */
  useLayoutEffect(() => {
    editorRef.current = editor;
    selectedBubbleIdRef.current = selectedBubbleId;
    selectedTextIdRef.current = selectedTextId;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const ed = editorRef.current;
      const bubbleId = selectedBubbleIdRef.current;
      const textId = selectedTextIdRef.current;

      if (event.key === "Escape") {
        setSelectedTextId(null);
        setSelectedBubbleId(null);
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (textId && bubbleId) {
          event.preventDefault();
          ed.deleteTextItem(bubbleId, textId);
          setSelectedTextId(null);
          return;
        }
        if (bubbleId) {
          event.preventDefault();
          ed.deleteBubble(bubbleId);
          setSelectedBubbleId(null);
          setSelectedTextId(null);
          showToast(t("cartoon.compose.bubbleDeleted"));
          return;
        }
      }

      if (event.ctrlKey && event.key === "z") {
        event.preventDefault();
        ed.undo();
        return;
      }
      if (event.ctrlKey && event.key === "y") {
        event.preventDefault();
        ed.redo();
        return;
      }

      if (
        bubbleId &&
        textId &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 0.02 : 0.005;
        const dx =
          event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy =
          event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        ed.nudgeTextItem(bubbleId, textId, dx, dy);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showToast, t]);

  const selectedBubbleAsset = selectedBubble
    ? resolveAsset(selectedBubble.assetId)
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border/60 px-4 py-4 md:px-6">
        <h1 className="text-lg font-semibold">{t("cartoon.compose.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("cartoon.compose.hint")}
        </p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 md:p-6 lg:grid-cols-[220px_minmax(0,1fr)_280px] xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        <CartoonAssetPicker
          assets={allAssets}
          selectedId={brushAssetId}
          onSelect={handleSelectAsset}
          onAddCustom={() => setCustomDialogOpen(true)}
          onRemoveCustom={handleRemoveCustomAsset}
        />

        <section
          className={cn(
            "flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-xl border bg-background/80 lg:min-h-0",
            THIN_BORDER_CLASS
          )}
        >
          <CartoonComposeCanvas
            bubbles={editor.bubbles}
            assets={allAssets}
            selectedBubbleId={selectedBubbleId}
            selectedTextId={selectedTextId}
            brushAssetId={brushAssetId}
            customFonts={customFonts}
            backgroundSrc={editor.background?.src ?? null}
            backgroundSize={{
              width: editor.background?.width ?? 1920,
              height: editor.background?.height ?? 1080,
            }}
            onSelectBubble={(id) => {
              setSelectedBubbleId(id);
              setSelectedTextId(null);
            }}
            onAddBubble={handleAddBubble}
            onDoubleClickBubble={handleDoubleClickBubble}
            onBubblePlacementChange={editor.setBubblePlacement}
            onPlacementEditStart={editor.beginPlacementEdit}
            onPlacementEditEnd={editor.endPlacementEdit}
            onSelectText={(bubbleId, textId) => {
              setSelectedBubbleId(bubbleId);
              setSelectedTextId(textId);
            }}
            onTextBoxEditStart={editor.beginTextBoxEdit}
            onTextBoxEditEnd={editor.endTextBoxEdit}
            onTextBoxChange={editor.setTextBox}
            onDisplaySizeChange={({ width }) => setPreviewCanvasWidth(width)}
          />
        </section>

        <CartoonComposeSidebar
          bubbles={editor.bubbles}
          resolveAsset={resolveAsset}
          selectedBubble={selectedBubble}
          selectedBubbleAsset={selectedBubbleAsset ?? null}
          selectedText={selectedText}
          background={editor.background}
          exporting={exporting}
          exportFormat={exportFormat}
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          customFonts={customFonts}
          fontSizeMin={CARTOON_FONT_SIZE_MIN}
          fontSizeMax={CARTOON_FONT_SIZE_MAX}
          onBubbleSelect={setSelectedBubbleId}
          onBubbleDelete={deleteSelectedBubble}
          onTextItemChange={(textId, patch) => {
            if (!selectedBubbleId) return;
            editor.updateTextItem(selectedBubbleId, textId, patch);
          }}
          onTextItemSelect={setSelectedTextId}
          onTextItemDelete={deleteSelectedText}
          onBackgroundChange={editor.setBackground}
          onExportFormatChange={setExportFormat}
          onExport={() => void handleExport()}
          onUndo={editor.undo}
          onRedo={editor.redo}
          onLoadDraft={editor.loadDraftSnapshot}
          getSnapshot={editor.getSnapshotForExport}
          onAddCustomFont={addCustomFont}
          onPlacementChange={(patch) => {
            if (!selectedBubbleId) return;
            editor.setBubblePlacement(selectedBubbleId, patch);
          }}
          onPlacementEditStart={editor.beginPlacementEdit}
          onPlacementEditEnd={editor.endPlacementEdit}
          onBack={onBack}
        />
      </div>

      <CustomAssetDialog
        open={customDialogOpen}
        onOpenChange={setCustomDialogOpen}
        onSave={(input) => {
          const asset = addCustomAsset(input);
          setBrushAssetId(asset.id);
          showToast(t("cartoon.compose.customAssetSaved"));
        }}
      />
    </div>
  );
}

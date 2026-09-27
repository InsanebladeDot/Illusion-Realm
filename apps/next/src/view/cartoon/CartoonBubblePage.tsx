"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import "@/assets/cartoon/cartoon-fonts.css";
import {
  BUILTIN_CARTOON_ASSETS,
  DEFAULT_BUILTIN_CARTOON_ASSET_ID,
} from "@/data/cartoonAssets";
import { useCartoonBubbleStore } from "@/stores/useCartoonBubbleStore";
import { useToastStore } from "@/stores/useToastStore";
import type { CartoonBubbleAsset, CartoonSetupConfig } from "@/types/cartoonBubble";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { CartoonAssetPicker } from "@/view/cartoon/CartoonAssetPicker";
import { CartoonAssetPreview } from "@/view/cartoon/CartoonAssetPreview";
import { CartoonComposeView } from "@/view/cartoon/CartoonComposeView";
import { CustomAssetDialog } from "@/view/cartoon/CustomAssetDialog";

type CartoonStep = "setup" | "compose";

export function CartoonBubblePage() {
  const { t } = useTranslation();
  const customAssets = useCartoonBubbleStore((state) => state.customAssets);
  const addCustomAsset = useCartoonBubbleStore((state) => state.addCustomAsset);
  const removeCustomAsset = useCartoonBubbleStore(
    (state) => state.removeCustomAsset
  );
  const showToast = useToastStore((state) => state.show);

  const allAssets = useMemo(
    () => [...BUILTIN_CARTOON_ASSETS, ...customAssets],
    [customAssets]
  );

  const [step, setStep] = useState<CartoonStep>("setup");
  const [composeConfig, setComposeConfig] = useState<CartoonSetupConfig | null>(
    null
  );

  const [selectedAssetId, setSelectedAssetId] = useState(
    DEFAULT_BUILTIN_CARTOON_ASSET_ID
  );
  const [customDialogOpen, setCustomDialogOpen] = useState(false);

  const selectedAsset = useMemo(
    () => allAssets.find((item) => item.id === selectedAssetId) ?? allAssets[0],
    [allAssets, selectedAssetId]
  );

  const handleSelectAsset = useCallback((asset: CartoonBubbleAsset) => {
    setSelectedAssetId(asset.id);
  }, []);

  const handleRemoveCustom = useCallback(
    (id: string) => {
      removeCustomAsset(id);
      if (selectedAssetId === id) {
        setSelectedAssetId(DEFAULT_BUILTIN_CARTOON_ASSET_ID);
      }
    },
    [removeCustomAsset, selectedAssetId]
  );

  const handleEnterCompose = () => {
    if (!selectedAsset) return;
    setComposeConfig({ asset: selectedAsset });
    setStep("compose");
  };

  if (step === "compose" && composeConfig) {
    return (
      <CartoonComposeView
        initialConfig={composeConfig}
        onBack={() => setStep("setup")}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border/60 px-4 py-4 md:px-6">
        <h1 className="text-lg font-semibold">{t("cartoon.page.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("cartoon.page.description")}
        </p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 md:p-6 lg:grid-cols-[240px_minmax(0,1fr)_260px] xl:grid-cols-[260px_minmax(0,1fr)_280px]">
        <CartoonAssetPicker
          assets={allAssets}
          selectedId={selectedAsset?.id ?? null}
          onSelect={handleSelectAsset}
          onAddCustom={() => setCustomDialogOpen(true)}
          onRemoveCustom={handleRemoveCustom}
        />

        <section
          className={cn(
            "flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-xl border bg-background/80 lg:min-h-0",
            THIN_BORDER_CLASS
          )}
        >
          {selectedAsset ? <CartoonAssetPreview asset={selectedAsset} /> : null}
        </section>

        <aside
          className={cn(
            "flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background/80",
            THIN_BORDER_CLASS
          )}
        >
          <div className="shrink-0 border-b border-border/60 px-4 py-3">
            <h2 className="text-sm font-medium">{t("cartoon.page.assetSettings")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("cartoon.page.assetSettingsHint")}
            </p>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 [scrollbar-gutter:stable]">
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
              {t("cartoon.page.currentAsset")}
              <span className="font-medium text-foreground">{selectedAsset?.name}</span>
            </div>
          </div>

          <div className="shrink-0 border-t border-border/60 p-4">
            <button
              type="button"
              disabled={!selectedAsset}
              onClick={handleEnterCompose}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("cartoon.page.enterCompose")}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </aside>
      </div>

      <CustomAssetDialog
        open={customDialogOpen}
        onOpenChange={setCustomDialogOpen}
        onSave={(input) => {
          const asset = addCustomAsset(input);
          setSelectedAssetId(asset.id);
          showToast(t("cartoon.page.customAssetSaved"));
        }}
      />
    </div>
  );
}

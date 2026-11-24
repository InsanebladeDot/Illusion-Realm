"use client";

import { useId } from "react";
import dynamic from "next/dynamic";
import { useTranslation } from "@/i18n";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { LibraryCard } from "@/components/library/library-card";
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import { useCanvasResources } from "@/view/infinite-canvas/use-canvas-resources";
import { getTagLibrary } from "@/data/tagLibraries";
import { CharacterPickerDialog } from "../CharacterPickerDialog";
import type { CompositionDraft } from "./composition-draft";

const TagLibraryDialog = dynamic(() => import("../tagLibrary/TagLibraryDialog").then(module => module.TagLibraryDialog));
export type TextLibrary = "character" | "background";

/** 全局素材与画布读取同一份目录，构图只选择图片，不修改库文件。 */
export function CompositionImageLibrary({ selected, onPick, onClose }: {
  selected?: string;
  onPick: (asset: NonNullable<CompositionDraft["base"]>) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const { items, loading, error, truncated } = useCanvasResources({ scope: "library" });
  const images = items.filter(item => item.media.kind === "image" && item.state !== "blocked");
  return <ResourceDialogShell open title={t("canvas.globalResources")} titleId={titleId} onOpenChange={onClose} description={t("create.mossComposition.baseHint")}>
    {loading || error || !images.length ? <p role="status" className="p-4 text-sm text-muted-foreground">{t(loading ? "create.mossComposition.loading" : error || "create.mossComposition.noImages")}</p> : null}
    {truncated && <p className="pb-3 text-sm text-muted-foreground">{t("create.mossComposition.truncated")}</p>}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {images.map(({ media, id }) => <LibraryCard key={id ?? media.path} prefix="composition-image" id={id ?? media.path} title={media.name}
        badge={t("create.mossComposition.image")} preview={buildLocalFileUrl(media.path) ?? ""} selected={media.path === selected} onSelect={() => onPick(media)} />)}
    </div>
  </ResourceDialogShell>;
}

/** 现有提示词库只返回文字，由调用方决定写整体描述还是某个区域。 */
export function CompositionTextLibrary({ library, onInsert, onOpenChange }: {
  library: TextLibrary;
  onInsert: (text: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  if (library === "character") return <CharacterPickerDialog open onOpenChange={onOpenChange} onApply={onInsert} />;
  return <TagLibraryDialog open onOpenChange={onOpenChange} onApply={onInsert} library={getTagLibrary("background")} />;
}

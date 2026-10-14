"use client";

import { ListOrdered, PanelsTopLeft, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "@/i18n";

export type ComicCompactView = "side" | "stage" | "outline";
interface ComicViewPinProps { view: ComicCompactView; onChange: (view: ComicCompactView) => void }
const VIEW_OPTIONS = [
  { view: "side", Icon: SlidersHorizontal },
  { view: "stage", Icon: PanelsTopLeft },
  { view: "outline", Icon: ListOrdered },
] as const;

export default function ComicViewPin({ view, onChange }: ComicViewPinProps) {
  const { t } = useTranslation();
  return (
    <div data-comic-view-pin className="absolute right-0 top-0 z-40 flex flex-col items-end gap-1 xl:hidden">
      <span className="pointer-events-none rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] leading-4 text-muted-foreground backdrop-blur">{t(`toolBox.comic.views.${view}`)}</span>
      <div role="toolbar" aria-label={t("toolBox.comic.views.switch")} aria-orientation="vertical" className="flex flex-col gap-0.5 rounded-2xl border border-border bg-background/80 p-1 shadow-md backdrop-blur">
        {VIEW_OPTIONS.map(({ view: option, Icon }) => <button key={option} type="button" data-comic-view={option} aria-pressed={view === option}
          title={t(`toolBox.comic.views.${option}`)} aria-label={t(`toolBox.comic.views.${option}`)} onClick={() => onChange(option)}
          className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${view === option ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon size={15} /></button>)}
      </div>
    </div>
  );
}

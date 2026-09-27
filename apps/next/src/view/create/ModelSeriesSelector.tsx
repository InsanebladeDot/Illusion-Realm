"use client";

import { useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  DEFAULT_MODEL_SERIES_ID,
  MODEL_SERIES,
} from "@/data/modelSeries";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";

type ModelSeriesSelectorProps = {
  value: string;
  onChange: (id: string) => void;
};

export function ModelSeriesSelector({ value, onChange }: ModelSeriesSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [activeTipId, setActiveTipId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeSeries =
    MODEL_SERIES.find((item) => item.id === value) ?? MODEL_SERIES[0];

  /**
   * 渲染期同步：关闭时清掉当前展开的提示气泡。
   * 记录前值到 state、渲染期比较后立即 set，替代 effect 内 setState。
   */
  const [previousOpen, setPreviousOpen] = useState<boolean | null>(null);
  if (!open && open !== previousOpen) {
    setPreviousOpen(open);
    setActiveTipId(null);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex items-center gap-2 px-2 pt-2 sm:px-3">
      <span className="shrink-0 text-xs text-muted-foreground">
        {t("create.modelSeriesSelector.seriesLabel")}
      </span>
      <div className="relative flex-1">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg bg-background px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent/50",
            THIN_BORDER_CLASS
          )}
        >
          <NextImage
            src={activeSeries.icon}
            alt=""
            width={18}
            height={18}
            className="shrink-0 rounded-sm"
          />
          <span className="font-medium">{activeSeries.label}</span>
          <span className="flex-1" />
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>

        {open && (
          <div
            role="listbox"
            className={cn(
              "absolute left-0 right-0 top-full z-30 mt-1 overflow-visible rounded-lg bg-background p-1 shadow-md",
              THIN_BORDER_CLASS
            )}
          >
            {MODEL_SERIES.map((series) => (
              <div key={series.id} className="group relative">
                <button
                  type="button"
                  role="option"
                  aria-selected={series.id === value}
                  onMouseEnter={() => setActiveTipId(series.id)}
                  onFocus={() => setActiveTipId(series.id)}
                  onTouchStart={() => setActiveTipId(series.id)}
                  onClick={() => {
                    onChange(series.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50",
                    series.id === value && "bg-muted/60"
                  )}
                >
                  <NextImage
                    src={series.icon}
                    alt=""
                    width={18}
                    height={18}
                    className="mt-0.5 shrink-0 rounded-sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{series.label}</span>
                      {series.id === value && (
                        <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-foreground" />
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {t(series.description)}
                    </p>
                    {activeTipId === series.id && (
                      <div className="mt-2 space-y-1 border-t border-border pt-2 md:hidden">
                        <p className="font-medium text-foreground">
                          {t(series.tipsTitle)}
                        </p>
                        {series.tips.map((tip) => (
                          <p
                            key={tip}
                            className="flex items-start gap-1.5 text-muted-foreground"
                          >
                            <span className="mt-px">•</span>
                            <span>{t(tip)}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </button>

                <div
                  className={cn(
                    "pointer-events-none absolute left-full top-0 z-50 ml-1 hidden w-56 rounded-lg bg-popover p-2.5 text-xs shadow-md md:group-hover:block",
                    THIN_BORDER_CLASS,
                    activeTipId === series.id && "md:block"
                  )}
                >
                  <p className="mb-1.5 font-medium text-foreground">
                    {t(series.tipsTitle)}
                  </p>
                  <div className="space-y-1">
                    {series.tips.map((tip) => (
                      <p
                        key={tip}
                        className="flex items-start gap-1.5 text-muted-foreground"
                      >
                        <span className="mt-px">•</span>
                        <span>{t(tip)}</span>
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export { DEFAULT_MODEL_SERIES_ID };

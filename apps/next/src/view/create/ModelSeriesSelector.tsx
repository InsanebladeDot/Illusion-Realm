"use client";

import { useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import { ChevronsUpDown } from "lucide-react";
import {
  DEFAULT_MODEL_SERIES_ID,
  MODEL_SERIES,
} from "@/data/modelSeries";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import { ModelSeriesOption } from "./model-series-option";

type ModelSeriesSelectorProps = {
  value: string;
  onChange: (id: string) => void;
  unavailable?: string[];
  onUnavailable?: (id: string) => void;
};

export function ModelSeriesSelector({ value, onChange, unavailable = [], onUnavailable }: ModelSeriesSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeSeries =
    MODEL_SERIES.find((item) => item.id === value) ?? MODEL_SERIES[0];

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
            {MODEL_SERIES.map(series => {
              const blocked = unavailable.includes(series.id);
              return <ModelSeriesOption key={series.id} series={series} selected={series.id === value} blocked={blocked}
                onSelect={() => {
                  // 灰色项只打开补齐提示，不改变当前系列或草稿。
                  if (blocked) onUnavailable?.(series.id);
                  else onChange(series.id);
                  setOpen(false);
                }} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export { DEFAULT_MODEL_SERIES_ID };

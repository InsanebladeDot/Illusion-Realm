"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { SamplerOption } from "@/data/createForm";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type OptionSelectProps = {
  value: string;
  options: readonly SamplerOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
};

/**
 * 通用枚举下拉（采样器 / 调度器共用）：
 * 选项 value 原样写入工作流 JSON，label 仅用于展示。
 */
export function OptionSelect({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: OptionSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selectedOption = options.find((option) => option.value === value);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        data-option-value={value}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-lg bg-background px-3 text-sm shadow-none transition-colors hover:bg-accent/40 focus:outline-none focus:ring-1 focus:ring-ring",
          INPUT_BORDER_CLASS
        )}
      >
        <span className="min-w-0 text-left">{selectedOption?.label ?? value}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          className={cn(
            "absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg bg-background p-1 shadow-md",
            INPUT_BORDER_CLASS
          )}
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                data-value={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent/50",
                  selected && "bg-muted/60"
                )}
              >
                <span className="min-w-0 whitespace-normal break-words">
                  {option.label}
                </span>
                {selected && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

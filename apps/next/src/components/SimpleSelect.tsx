"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { INPUT_BORDER_CLASS, THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

export type SimpleSelectOption = {
  value: string;
  label: string;
};

type SimpleSelectProps = {
  value: string;
  options: SimpleSelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
  optionClassName?: string;
  chevronClassName?: string;
  checkClassName?: string;
  panelClassName?: string;
  variant?: "default" | "pill";
  portal?: boolean;
};

export function SimpleSelect({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  triggerClassName,
  optionClassName,
  chevronClassName,
  checkClassName,
  panelClassName,
  variant = "default",
  portal = false,
}: SimpleSelectProps) {
  const [open, setOpen] = useState(false);
  const [panelRect, setPanelRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  const selected = options.find((option) => option.value === value);

  const updatePanelRect = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPanelRect({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
  };

  useLayoutEffect(() => {
    if (!open || !portal) return;
    updatePanelRect();
    window.addEventListener("resize", updatePanelRect);
    window.addEventListener("scroll", updatePanelRect, true);
    return () => {
      window.removeEventListener("resize", updatePanelRect);
      window.removeEventListener("scroll", updatePanelRect, true);
    };
  }, [open, portal]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current?.contains(target) ||
        (portal &&
          (event.target as Element).closest?.("[data-simple-select-panel]"))
      ) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, portal]);

  const panel = open ? (
    <div
      data-simple-select-panel
      role="listbox"
      id={listboxId}
      className={cn(
        "overflow-hidden rounded-xl bg-background/95 p-1 shadow-lg backdrop-blur-sm",
        portal ? "fixed z-[100]" : "absolute left-0 right-0 top-full z-50 mt-1.5",
        THIN_BORDER_CLASS,
        panelClassName
      )}
      style={
        portal && panelRect
          ? {
              top: panelRect.top,
              left: panelRect.left,
              width: panelRect.width,
            }
          : undefined
      }
    >
      <div className="max-h-52 overflow-y-auto [scrollbar-width:thin]">
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <button
              key={option.value || "__empty__"}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left font-medium transition-colors hover:bg-accent/50",
                variant === "pill" ? "text-xs" : "text-sm",
                optionClassName,
                isSelected && "bg-muted/70 text-foreground"
              )}
            >
              <span className="min-w-0 truncate">{option.label}</span>
              {isSelected && (
                <Check
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-foreground/80",
                    checkClassName
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        onClick={() => setOpen((previous) => !previous)}
        className={cn(
          "flex w-full items-center justify-between gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 dark:focus-visible:ring-zinc-100/20",
          variant === "pill"
            ? "min-w-[120px] max-w-[min(100%,220px)] shrink rounded-full border-0 bg-muted px-3 font-medium text-foreground hover:bg-muted/80 dark:bg-gray-700 dark:hover:bg-gray-600/90"
            : cn(
                "rounded-lg bg-background px-3 text-sm shadow-none hover:bg-accent/40 focus:ring-1 focus:ring-ring",
                INPUT_BORDER_CLASS,
                "h-8"
              ),
          triggerClassName
        )}
      >
        <span className="min-w-0 truncate text-left">
          {selected?.label ?? options[0]?.label ?? ""}
        </span>
        <ChevronDown
          className={cn(
            "shrink-0 text-muted-foreground transition-transform duration-200",
            chevronClassName ?? "h-3.5 w-3.5",
            open && "rotate-180"
          )}
        />
      </button>

      {!portal && panel}
      {portal &&
        typeof document !== "undefined" &&
        panel &&
        createPortal(panel, document.body)}
    </div>
  );
}

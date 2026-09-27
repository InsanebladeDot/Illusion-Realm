"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { IMAGE_COUNT_OPTIONS } from "@/data/createForm";
import { useTranslation } from "@/i18n";
import { INPUT_BORDER_CLASS, THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type ImageCountDropdownProps = {
  value: number;
  onChange: (count: number) => void;
};

export function ImageCountDropdown({ value, onChange }: ImageCountDropdownProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePlacement = useCallback(() => {
    const trigger = containerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const triggerRect = trigger.getBoundingClientRect();
    const menuHeight = menu.offsetHeight;
    const gap = 4;
    const spaceBelow = window.innerHeight - triggerRect.bottom - gap;
    const spaceAbove = triggerRect.top - gap;

    if (spaceBelow < menuHeight && spaceAbove >= menuHeight) {
      setPlacement("top");
      return;
    }

    setPlacement("bottom");
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePlacement();
  }, [open, updatePlacement]);

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

    const handleReposition = () => updatePlacement();

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, updatePlacement]);

  return (
    <div ref={containerRef} className="relative w-fit max-w-full">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-foreground transition-colors hover:bg-muted dark:text-zinc-100",
          INPUT_BORDER_CLASS
        )}
      >
        <span className="font-normal text-primary">
          {t("create.imageCountDropdown.imageLabel")}
        </span>
        <X className="h-3 w-3" />
        {value}
        <ChevronDown
          className={cn(
            "ml-0.5 h-3 w-3 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          className={cn(
            "absolute left-0 z-[9999] min-w-[75px] overflow-hidden rounded-md bg-popover p-1 text-foreground shadow-md",
            THIN_BORDER_CLASS,
            placement === "bottom" ? "top-full mt-1" : "bottom-full mb-1"
          )}
        >
          {IMAGE_COUNT_OPTIONS.map((option) => {
            const selected = option.count === value;

            return (
              <button
                key={option.count}
                type="button"
                role="menuitem"
                onClick={() => {
                  onChange(option.count);
                  setOpen(false);
                }}
                className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <div className="flex w-full items-start gap-2">
                  <div className="w-3.5 pt-0.5">
                    {selected && (
                      <Check
                        className="h-3 w-3 text-foreground dark:text-zinc-100"
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-1 text-left">
                    <span className="font-semibold">{option.label}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type SegmentItem<T extends string> = {
  id: T;
  label: string;
};

type SegmentMenuProps<T extends string> = {
  items: SegmentItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

export function SegmentMenu<T extends string>({
  items,
  value,
  onChange,
  className,
}: SegmentMenuProps<T>) {
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<Partial<Record<T, HTMLLIElement>>>({});
  const [slider, setSlider] = useState({ width: 0, left: 0 });

  useLayoutEffect(() => {
    const updateSlider = () => {
      const activeEl = itemRefs.current[value];
      const listEl = listRef.current;
      if (!activeEl || !listEl) return;

      const listRect = listEl.getBoundingClientRect();
      const activeRect = activeEl.getBoundingClientRect();

      setSlider({
        width: activeRect.width,
        left: activeRect.left - listRect.left,
      });
    };

    updateSlider();
    window.addEventListener("resize", updateSlider);
    return () => window.removeEventListener("resize", updateSlider);
  }, [value, items]);

  return (
    <div
      className={cn(
        "h-[60px] shrink-0 rounded-2xl bg-muted/60 p-2 dark:bg-muted/30",
        THIN_BORDER_CLASS,
        className
      )}
    >
      <ul ref={listRef} className="relative flex h-full items-center gap-0.5">
        <li
          aria-hidden
          className="pointer-events-none absolute top-0 h-full rounded-xl bg-background shadow-sm transition-[left,width] duration-200 ease-out dark:bg-zinc-900"
          style={{
            width: slider.width,
            left: slider.left,
            opacity: slider.width > 0 ? 1 : 0,
          }}
        />
        {items.map((item) => {
          const active = item.id === value;

          return (
            <li
              key={item.id}
              ref={(node) => {
                if (node) itemRefs.current[item.id] = node;
              }}
              className="relative z-[1] h-full"
            >
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onChange(item.id)}
                className={cn(
                  "flex h-full items-center whitespace-nowrap rounded-xl px-3 text-sm transition-colors",
                  active
                    ? "font-medium text-foreground dark:text-zinc-100"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

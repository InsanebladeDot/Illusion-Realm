"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type TruncatedTextPopoverProps = {
  text: string;
  className?: string;
  popoverClassName?: string;
};

export function TruncatedTextPopover({
  text,
  className,
  popoverClassName,
}: TruncatedTextPopoverProps) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [open, setOpen] = useState(false);

  const measure = useCallback(() => {
    const element = textRef.current;
    if (!element) return;
    setOverflows(element.scrollWidth > element.clientWidth + 1);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text, measure]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const handleActivate = (event: React.MouseEvent | React.TouchEvent) => {
    if (!overflows) return;
    event.stopPropagation();
    event.preventDefault();
    setOpen((previous) => !previous);
  };

  return (
    <span ref={wrapperRef} className="relative block min-w-0">
      <span
        ref={textRef}
        className={cn(
          "block truncate",
          overflows && "cursor-pointer touch-manipulation",
          className
        )}
        title={!overflows ? text : undefined}
        onPointerDown={(event) => {
          if (overflows) event.stopPropagation();
        }}
        onClick={handleActivate}
      >
        {text}
      </span>
      {open && overflows ? (
        <span
          role="tooltip"
          className={cn(
            "absolute bottom-full left-0 z-[110] mb-1 max-w-[min(100vw-2rem,320px)] break-all rounded-md bg-background px-2 py-1.5 text-xs text-foreground shadow-md",
            THIN_BORDER_CLASS,
            popoverClassName
          )}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

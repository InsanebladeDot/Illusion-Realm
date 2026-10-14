"use client";

import { cn } from "@/utils/cn";

type RangeSliderProps = {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
  /** 以 0 为原点双向填充（适用于含负值的范围） */
  bipolar?: boolean;
  className?: string;
  trackClassName?: string;
  fillClassName?: string;
  thumbClassName?: string;
};

export function RangeSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  ariaLabel,
  bipolar = false,
  className,
  trackClassName,
  fillClassName,
  thumbClassName,
}: RangeSliderProps) {
  const percent = ((value - min) / (max - min)) * 100;
  const originPercent = bipolar && min < 0 && max > 0 ? (0 - min) / (max - min) * 100 : 0;
  const fillStyle =
    bipolar && min < 0 && max > 0
      ? value >= 0
        ? { left: `${originPercent}%`, right: `${100 - percent}%` }
        : { left: `${percent}%`, right: `${100 - originPercent}%` }
      : { left: "0%", right: `${100 - percent}%` };

  return (
    <span
      dir="ltr"
      className={cn(
        "relative flex w-full touch-none select-none items-center flex-1",
        className
      )}
    >
      <span
        className={cn(
          "relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20",
          trackClassName
        )}
      >
        <span
          className={cn("absolute h-full bg-primary", fillClassName)}
          style={fillStyle}
        />
      </span>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={ariaLabel}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        className="absolute inset-0 z-10 h-4 w-full cursor-pointer opacity-0"
      />

      <span
        className="pointer-events-none absolute top-1/2 z-0 -translate-y-1/2"
        style={{ left: `calc(${percent}% )` }}
      >
        <span
          aria-hidden
          className={cn(
            "block h-4 w-4 -translate-x-1/2 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            thumbClassName
          )}
        />
      </span>
    </span>
  );
}

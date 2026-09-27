"use client";

import { displayModelFileName } from "@/utils/buildGeneratedImageMeta";
import { getExtensionWeightBarFill } from "@/utils/extensionWeight";
import { cn } from "@/utils/cn";

type LoraStrengthRowProps = {
  name: string;
  strength: number;
};

export function LoraStrengthRow({ name, strength }: LoraStrengthRowProps) {
  const { ratio, direction } = getExtensionWeightBarFill(strength);
  const label = displayModelFileName(name);

  return (
    <div className="relative overflow-hidden rounded-lg bg-muted/40">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-1.5 left-1/2 w-px -translate-x-1/2 bg-border/40"
      />
      {direction === "left" ? (
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500/25 via-emerald-500/12 to-transparent"
          style={{ width: `${ratio * 100}%` }}
        />
      ) : null}
      {direction === "right" ? (
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 bg-gradient-to-l from-rose-500/25 via-rose-500/12 to-transparent"
          style={{ width: `${ratio * 100}%` }}
        />
      ) : null}

      <div className="relative flex items-center justify-between gap-3 px-3 py-2">
        <span className="min-w-0 truncate text-xs font-medium" title={label}>
          {label}
        </span>
        <span
          className={cn(
            "shrink-0 tabular-nums text-xs font-medium",
            direction === "left" && "text-emerald-700/90 dark:text-emerald-400/90",
            direction === "right" && "text-rose-700/90 dark:text-rose-400/90",
            direction === "none" && "text-muted-foreground"
          )}
        >
          {strength.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

type ChangelogSectionBodyProps = {
  lines: string[];
  className?: string;
};

export function ChangelogSectionBody({
  lines,
  className,
}: ChangelogSectionBodyProps) {
  const items: ReactNode[] = [];
  let bulletGroup: string[] = [];

  const flushBullets = () => {
    if (bulletGroup.length === 0) return;
    items.push(
      <ul
        key={`ul-${items.length}`}
        className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground"
      >
        {bulletGroup.map((line) => (
          <li key={line}>{line.replace(/^\-\s+/, "")}</li>
        ))}
      </ul>
    );
    bulletGroup = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      bulletGroup.push(trimmed);
      continue;
    }
    flushBullets();
    items.push(
      <p
        key={`p-${items.length}-${trimmed}`}
        className="text-sm leading-relaxed text-muted-foreground"
      >
        {trimmed}
      </p>
    );
  }
  flushBullets();

  return <div className={cn("space-y-3", className)}>{items}</div>;
}

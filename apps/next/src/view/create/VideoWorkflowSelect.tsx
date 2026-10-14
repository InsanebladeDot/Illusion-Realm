"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "@/i18n";
import {
  DEFAULT_VIDEO_WORKFLOW_ID,
  getVideoWorkflowById,
  getVideoWorkflowCategories,
  getVideoWorkflowsByCategory,
} from "@/data/videoForm";
import {
  ACCENT_CHECK_CLASS,
  INPUT_BORDER_CLASS,
} from "@/utils/layout";
import { cn } from "@/utils/cn";

type VideoWorkflowSelectProps = {
  value: string;
  onChange: (value: string) => void;
};

/** 视频工作流选择：分类式（抽屉/树形）交互，层级展示「大分类 / 工作流.json」 */
export function VideoWorkflowSelect({
  value,
  onChange,
}: VideoWorkflowSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(
    () => getVideoWorkflowById(value)?.category ?? null
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = getVideoWorkflowById(value) ?? getVideoWorkflowById(DEFAULT_VIDEO_WORKFLOW_ID)!;
  const categories = useMemo(() => getVideoWorkflowCategories(), []);

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
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const toggleCategory = (category: string) => {
    setExpandedCategory((prev) => (prev === category ? null : category));
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border bg-background px-3 text-xs shadow-none",
          INPUT_BORDER_CLASS
        )}
      >
        <span className="shrink-0 text-muted-foreground">{t("create.videoWorkflowSelect.workflowLabel")}</span>
<span className="min-w-0 flex-1 truncate text-left font-medium" title={selected.file}>{selected.nameKey ? t(selected.nameKey) : selected.name}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            "absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg bg-background p-1 shadow-md",
            INPUT_BORDER_CLASS
          )}
        >
          {categories.map((category) => {
            const expanded = expandedCategory === category;
            const workflows = getVideoWorkflowsByCategory(category);
            return (
              <div key={category}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => toggleCategory(category)}
                  className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-accent/50"
                >
                  <ChevronRight
                    className={cn(
                      "h-3.5 w-3.5 text-muted-foreground transition-transform",
                      expanded && "rotate-90"
                    )}
                  />
                  {category}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {workflows.length}
                  </span>
                </button>
                {expanded &&
                  workflows.map((workflow) => (
                    <button
                      key={workflow.id}
                      type="button"
                      role="option"
                      data-video-workflow-option={workflow.id}
                      aria-selected={workflow.id === value}
                      onClick={() => {
                        onChange(workflow.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-start justify-between gap-2 rounded-md py-1.5 pl-7 pr-2.5 text-left text-sm transition-colors hover:bg-accent/50",
                        workflow.id === value && "bg-muted/60"
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {workflow.nameKey ? t(workflow.nameKey) : workflow.name}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {workflow.file.split("/").pop()}
                        </span>
                      </span>
                      {workflow.id === value && (
                        <Check className={cn("mt-0.5 h-4 w-4 shrink-0", ACCENT_CHECK_CLASS)} />
                      )}
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

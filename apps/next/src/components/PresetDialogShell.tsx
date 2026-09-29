"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import NextImage from "next/image";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Plus,
  Settings2,
  X,
} from "lucide-react";
import type { ImageAsset } from "@/types/common";
import { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from "@/data/navigation";
import { useIsHydrated } from "@/hooks/useIsHydrated";
import { useMediaQueryAfterHydration } from "@/hooks/useMediaQuery";
import { useTranslation } from "@/i18n";
import { useSidebarStore } from "@/stores/useSidebarStore";
import { INPUT_BORDER_CLASS, THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

/** 新建预设时的一个字段（名称之外的正文） */
export type PresetFieldDef = {
  key: string;
  label: string;
  placeholder: string;
  hint?: string;
  tone?: "positive" | "negative" | "neutral";
};

/** 预设卡片上展示的一行摘要 */
export type PresetSummaryRow = {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
};

export type PresetDialogItem = {
  id: string;
  name: string;
  isDefault?: boolean;
};

export type PresetDialogGroup = {
  id: string;
  label: string;
  icon?: ImageAsset;
  description?: string;
};

type PresetDialogShellProps<T extends PresetDialogItem> = {
  title: string;
  description: string;
  groups: PresetDialogGroup[];
  activeGroupId: string;
  onActiveGroupChange: (groupId: string) => void;
  /** 当前分组下的条目（内置 + 自定义） */
  items: T[];
  selectedId: string;
  onSelectedIdChange: (id: string) => void;
  /** 卡片摘要：由调用方决定展示哪些字段 */
  summaryOf: (item: T) => PresetSummaryRow[];
  /** 新建表单字段 */
  fields: PresetFieldDef[];
  /** 新建：由调用方生成 id/持久化；返回新条目用于自动选中 */
  onCreate?: (
    activeGroupId: string,
    values: Record<string, string>
  ) => { id: string } | void;
  /** 自定义条目上的删除按钮（可选） */
  onDeleteItem?: (id: string) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  emptyText?: string;
  titleId?: string;
};

const toneClass = (tone: PresetSummaryRow["tone"]) =>
  tone === "positive"
    ? "text-green-600 dark:text-green-400"
    : tone === "negative"
      ? "text-red-600 dark:text-red-400"
      : "text-muted-foreground";

const textareaClassName = cn(
  "flex min-h-[60px] h-20 w-full rounded-md bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  INPUT_BORDER_CLASS
);

/**
 * 预设 选择 / 新建 弹框（预设提示词与反向提示词预设共用）：
 * 只有「字段定义 + 条目数据」不同，交互与样式完全一致。
 * 调用方在关闭时不要渲染本组件（内部状态随卸载重置）。
 * Portal 到 body 以越过创建页 stage / side 的堆叠上下文；弹框在 nav 右侧主区居中。
 */
export function PresetDialogShell<T extends PresetDialogItem>({
  title,
  description,
  groups,
  activeGroupId,
  onActiveGroupChange,
  items,
  selectedId,
  onSelectedIdChange,
  summaryOf,
  fields,
  onCreate,
  onDeleteItem,
  onOpenChange,
  onSave,
  emptyText,
  titleId = "preset-dialog-title",
}: PresetDialogShellProps<T>) {
  const { t } = useTranslation();
  const isHydrated = useIsHydrated();
  const hasDesktopNav = useMediaQueryAfterHydration("(min-width: 768px)");
  const navExpanded = useSidebarStore((state) => state.expanded);
  const navOffset = hasDesktopNav
    ? navExpanded
      ? SIDEBAR_WIDTH_EXPANDED
      : SIDEBAR_WIDTH_COLLAPSED
    : 0;
  // 可选文案的回退值放在这里而不是解构默认值：默认值在 hook 之外求值，拿不到 t
  const emptyTextValue = emptyText ?? t("components.presetShell.empty");
  const [creating, setCreating] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0];

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (creating) {
        setCreating(false);
        return;
      }
      onOpenChange(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [creating, onOpenChange]);

  const canCreate = draftName.trim().length > 0;

  const handleCreate = () => {
    if (!canCreate || !onCreate) return;
    const created = onCreate(activeGroupId, {
      name: draftName.trim(),
      ...draftValues,
    });
    if (created?.id) onSelectedIdChange(created.id);
    setCreating(false);
    setDraftName("");
    setDraftValues({});
  };

  if (!isHydrated) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[89] bg-black/50"
        aria-hidden
        onClick={() => onOpenChange(false)}
      />

      <div
        data-preset-dialog-positioner
        className="pointer-events-none fixed inset-y-0 right-0 z-[90] flex items-center justify-center"
        style={{ left: navOffset }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            "pointer-events-auto relative flex h-[85dvh] max-h-[720px] w-full max-w-lg flex-col overflow-hidden border bg-background shadow-lg outline-none duration-200 sm:rounded-xl",
            THIN_BORDER_CLASS
          )}
        >
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 z-[200] rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 max-sm:left-4 max-sm:right-auto sm:left-auto"
          >
            <X className="h-5 w-5 sm:h-4 sm:w-4" />
          </button>

        <header
          data-preset-dialog-header
          className="shrink-0 space-y-1.5 border-b border-border/60 px-6 pb-4 pt-6 text-center sm:text-left"
        >
          <h2
            id={titleId}
            className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight"
          >
            <Settings2 className="h-5 w-5" aria-hidden />
            {title}
          </h2>
          <div className="text-sm text-muted-foreground">
            <button
              type="button"
              onClick={() => setInfoExpanded((prev) => !prev)}
              className="w-full rounded-md bg-muted/50 px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/70"
            >
              <div className="flex items-center gap-1.5">
                <span className="flex-1">{description}</span>
                <ChevronDown
                  className={cn(
                    "h-3 w-3 shrink-0 transition-transform",
                    infoExpanded && "rotate-180"
                  )}
                />
              </div>
            </button>
          </div>
        </header>

        <main
          data-preset-dialog-main
          className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
        >
          {creating ? (
            <div>
              {activeGroup && (
                <p className="mb-4 text-xs text-muted-foreground">
                  {t("components.presetShell.creatingFor", {
                    group: activeGroup.label,
                  })}
                </p>
              )}
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t("components.presetShell.backToList")}
                </button>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium leading-none" htmlFor="preset-name">
                      {t("components.presetShell.nameLabel")}
                    </label>
                    <input
                      id="preset-name"
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      placeholder={t("components.presetShell.namePlaceholder")}
                      className={cn(
                        "flex h-9 w-full rounded-md bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        INPUT_BORDER_CLASS
                      )}
                    />
                  </div>

                  {fields.map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <label
                        className={cn(
                          "text-sm font-medium leading-none",
                          field.tone === "positive" && "text-green-600 dark:text-green-400",
                          field.tone === "negative" && "text-red-600 dark:text-red-400"
                        )}
                        htmlFor={`preset-field-${field.key}`}
                      >
                        {field.label}
                      </label>
                      <textarea
                        id={`preset-field-${field.key}`}
                        value={draftValues[field.key] ?? ""}
                        onChange={(event) =>
                          setDraftValues((prev) => ({
                            ...prev,
                            [field.key]: event.target.value,
                          }))
                        }
                        placeholder={field.placeholder}
                        className={textareaClassName}
                      />
                      {field.hint && (
                        <p className="text-[11px] text-muted-foreground">{field.hint}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div>
              {groups.length > 1 && (
                <div
                  role="tablist"
                  aria-orientation="horizontal"
                  className="grid h-9 w-full items-center justify-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground"
                  style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}
                >
                  {groups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      role="tab"
                      aria-selected={group.id === activeGroupId}
                      onClick={() => onActiveGroupChange(group.id)}
                      className={cn(
                        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        group.id === activeGroupId
                          ? "bg-background text-foreground shadow"
                          : "hover:text-foreground"
                      )}
                    >
                      {group.icon && (
                        <NextImage
                          src={group.icon}
                          alt=""
                          width={14}
                          height={14}
                          className="shrink-0 rounded-sm"
                        />
                      )}
                      {group.label}
                    </button>
                  ))}
                </div>
              )}

              <div role="tabpanel" className="mt-4 space-y-2">
                {items.length > 0 && activeGroup?.description && (
                  <p className="text-xs text-muted-foreground">{activeGroup.description}</p>
                )}

                {items.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">{emptyTextValue}</p>
                ) : (
                  <div role="radiogroup" className="grid gap-2 space-y-2">
                    {items.map((item) => {
                      const selected = selectedId === item.id;
                      return (
                        <div
                          key={item.id}
                          role="radio"
                          aria-checked={selected}
                          tabIndex={0}
                          data-preset-id={item.id}
                          onClick={() => onSelectedIdChange(item.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onSelectedIdChange(item.id);
                            }
                          }}
                          className={cn(
                            "group relative flex cursor-pointer items-start space-x-3 rounded-lg border p-3 transition-colors",
                            selected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          )}
                        >
                          <span
                            className={cn(
                              "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary shadow",
                              selected && "bg-primary text-primary-foreground"
                            )}
                          >
                            {selected && <Check className="h-3 w-3" />}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="cursor-pointer text-sm font-medium">
                                {item.name}
                              </span>
                              {item.isDefault && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  {t("components.presetShell.defaultBadge")}
                                </span>
                              )}
                            </div>
                            <div className="space-y-0.5 text-[11px] text-muted-foreground">
                              {summaryOf(item).map((row) => (
                                <p key={row.label} className="break-words whitespace-pre-line">
                                  <span className={cn("font-medium", toneClass(row.tone))}>
                                    {row.label}
                                  </span>{" "}
                                  {row.value}
                                </p>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {onDeleteItem && !item.isDefault && (
                              <button
                                type="button"
                                aria-label={t("components.presetShell.deleteLabel", {
                                  name: item.name,
                                })}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onDeleteItem(item.id);
                                }}
                                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {selected && <Check className="h-4 w-4 text-primary" aria-hidden />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {onCreate && (
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className={cn(
                      "inline-flex h-8 w-full items-center justify-center gap-2 rounded-md bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                      INPUT_BORDER_CLASS
                    )}
                  >
                    <Plus className="h-4 w-4" />
                    {t("components.presetShell.addCustom")}
                  </button>
                )}
              </div>
            </div>
          )}
        </main>

        <footer
          data-preset-dialog-footer
          className="shrink-0 border-t border-border/60 bg-background px-6 py-4"
        >
          {creating ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className={cn(
                  "inline-flex h-9 items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                  INPUT_BORDER_CLASS
                )}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={!canCreate}
                onClick={handleCreate}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {t("components.presetShell.create")}
              </button>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className={cn(
                  "inline-flex h-9 items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                  INPUT_BORDER_CLASS
                )}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={onSave}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
              >
                {t("components.presetShell.saveChanges")}
              </button>
            </div>
          )}
        </footer>
        </div>
      </div>
    </>,
    document.body
  );
}

export type { ReactNode };

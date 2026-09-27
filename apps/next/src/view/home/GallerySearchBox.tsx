"use client";

import { Search } from "lucide-react";
import type { GallerySearchScope } from "@/types/gallery";
import { useTranslation, type MessageKey } from "@/i18n";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

/** 模块作用域拿不到 hook：标签存**词条 key**，渲染时再 `t()` 取文案 */
const SCOPE_LABEL: Record<GallerySearchScope, MessageKey> = {
  all: "home.searchBox.scopeAll",
  name: "home.searchBox.scopeName",
};

type GallerySearchBoxProps = {
  query: string;
  scope: GallerySearchScope;
  onQueryChange: (value: string) => void;
  onScopeChange: (value: GallerySearchScope) => void;
  className?: string;
};

export function GallerySearchBox({
  query,
  scope,
  onQueryChange,
  onScopeChange,
  className,
}: GallerySearchBoxProps) {
  const { t } = useTranslation();

  const toggleScope = () => {
    onScopeChange(scope === "all" ? "name" : "all");
  };

  return (
    <div
      className={cn(
        "relative flex h-[60px] min-w-0 flex-1 items-center rounded-full bg-muted/60 px-2 dark:bg-muted/30",
        THIN_BORDER_CLASS,
        className
      )}
    >
      <button
        type="button"
        aria-label={t("home.searchBox.scopeSwitchLabel", {
          scope: t(SCOPE_LABEL[scope]),
        })}
        onClick={toggleScope}
        className={cn(
          "flex h-10 w-[130px] shrink-0 items-center justify-center rounded-full bg-background text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50",
          THIN_BORDER_CLASS
        )}
      >
        {t(SCOPE_LABEL[scope])}
      </button>

      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Blender-YYDS"
        className="min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />

      <Search className="mr-3 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </div>
  );
}

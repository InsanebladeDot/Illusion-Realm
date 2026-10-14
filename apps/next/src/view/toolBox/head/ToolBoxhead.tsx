"use client";

import { FileEdit, Film, Puzzle, Search, Sparkles } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useToolBoxStore } from "@/stores/useToolBoxStore";
import { ThemeToggle } from "@/components/theme-toggle";

export function ToolBoxHead() {
  const { t } = useTranslation();
  const { category, query, setCategory, setQuery } = useToolBoxStore();

  const categories = [
    { id: "all", name: t("toolBox.head.tabs.all"), icon: Sparkles },
    { id: "image", name: t("toolBox.head.tabs.image"), icon: FileEdit },
    { id: "video", name: t("toolBox.head.tabs.video"), icon: Film },
    { id: "models", name: t("toolBox.head.tabs.models"), icon: Puzzle },
  ] as const;
  const activeCategory = category;

  return (
    <div>
      {/* 界面：工具箱标题与搜索 */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {t("toolBox.head.title")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("toolBox.head.description")}
          </p>
        </div>

        {/* Search Bar */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            placeholder={t("toolBox.head.searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-background text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <ThemeToggle />
        </div>
      </div>

      {/* 界面：工具分类 */}
      <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label={t("toolBox.head.title")}>
        {categories.map(({ id, name, icon: Icon }) => <button key={id} type="button" role="tab" data-tool-category={id} aria-selected={activeCategory === id} onClick={() => setCategory(id)} className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-sky-500 ${activeCategory === id ? "border-sky-500 text-sky-600 dark:text-sky-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="h-4 w-4" />{name}</button>)}
      </div>
    </div>
  );
}

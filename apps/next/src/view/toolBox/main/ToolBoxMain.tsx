"use client";

import {
  FileEdit,
  Film,
  Images,
  MessageSquare,
  PanelsTopLeft,
  Puzzle,
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/i18n";
import { useToolBoxStore } from "@/stores/useToolBoxStore";

// 建议改名为 ToolBoxHome，因为它渲染的是"全部工具"这个子路由的内容
export function ToolBoxMain() {
  const { t } = useTranslation();
  const { category, query } = useToolBoxStore();
  const tools = [
    {
      name: t("toolBox.main.exifName"),
      description: t("toolBox.main.exifDescription"),
      icon: FileEdit,
      badge: t("toolBox.main.exifBadge"),
      href: "/tools/image/exif", // 添加路由路径
      category: "image",
    },
    {
      name: t("toolBox.main.videoName"),
      description: t("toolBox.main.videoDescription"),
      icon: Film,
      badge: null,
      href: "/tools/video/editor", // 添加路由路径
      category: "video",
    },
    {
      name: t("toolBox.main.gifName"),
      description: t("toolBox.main.gifDescription"),
      icon: Images,
      badge: t("toolBox.main.gifBadge"),
      href: "/tools/video/gif", // 添加路由路径
      category: "video",
    },
    {
      name: t("nav.comic"),
      description: t("toolBox.comic.description"),
      icon: PanelsTopLeft,
      badge: t("toolBox.main.comicBadge"),
      href: "/tools/image/comic",
      category: "image",
    },
    {
      name: t("nav.cartoon"),
      description: t("toolBox.main.cartoonDescription"),
      icon: MessageSquare,
      badge: null,
      href: "/tools/image/cartoon",
      category: "image",
    },
    {
      name: t("toolBox.civitai.title"),
      description: t("toolBox.civitai.description"),
      icon: Puzzle,
      badge: null,
      href: "/tools/models/civitai",
      category: "models",
    },
  ];
  const filteredTools = tools.filter((tool) => (category === "all" || tool.category === category) && `${tool.name} ${tool.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return (
    <>
      {/* 界面：工具箱工具入口 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {filteredTools.map((tool) => {
          const IconComponent = tool.icon;
          return (
            <Link
              key={tool.name}
              href={tool.href}
              data-tool-entry={tool.href}
              className="group relative p-6 bg-background border border-border rounded-xl hover:shadow-lg hover:border-sky-500/50 transition-all duration-200"
            >
              {tool.badge && (
                <span className="absolute top-4 right-4 px-2 py-0.5 text-xs font-medium bg-sky-500/10 text-sky-700 dark:text-sky-300 rounded-full">
                  {tool.badge}
                </span>
              )}

              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300">
                  <IconComponent className="h-6 w-6" />
                </div>
              </div>

              <h3 className="text-lg font-semibold text-foreground mb-1 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                {tool.name}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {tool.description}
              </p>

              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("toolBox.main.openHint")}</span>
                <svg
                  className="h-4 w-4 text-muted-foreground group-hover:text-sky-600 dark:group-hover:text-sky-400 group-hover:translate-x-1 transition-all"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>
          );
        })}
      </div>
      {filteredTools.length === 0 && <p role="status" className="py-12 text-center text-sm text-muted-foreground">{t("toolBox.main.empty")}</p>}
    </>
  );
}

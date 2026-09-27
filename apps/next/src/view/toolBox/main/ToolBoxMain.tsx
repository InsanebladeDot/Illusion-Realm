"use client";

import {
  FileEdit,
  Film,
  Images,
  PenTool,
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/i18n";

// 建议改名为 ToolBoxHome，因为它渲染的是"全部工具"这个子路由的内容
export function ToolBoxMain() {
  const { t } = useTranslation();
  const tools = [
    {
      name: t("toolBox.main.exifName"),
      description: t("toolBox.main.exifDescription"),
      icon: FileEdit,
      color: "bg-rose-50 text-rose-600",
      badge: t("toolBox.main.exifBadge"),
      href: "/toolBox/exif", // 添加路由路径
    },
    {
      name: t("toolBox.main.videoName"),
      description: t("toolBox.main.videoDescription"),
      icon: Film,
      color: "bg-blue-50 text-blue-600",
      badge: null,
      href: "/toolBox/video", // 添加路由路径
    },
    {
      name: t("toolBox.main.gifName"),
      description: t("toolBox.main.gifDescription"),
      icon: Images,
      color: "bg-amber-50 text-amber-600",
      badge: t("toolBox.main.gifBadge"),
      href: "/toolBox/gif", // 添加路由路径
    },
    {
      name: t("toolBox.main.comicName"),
      description: t("toolBox.comic.description"),
      icon: PenTool,
      color: "bg-violet-50 text-violet-600",
      badge: t("toolBox.main.comicBadge"),
      href: "/toolBox/comic", // 添加路由路径
    },
  ];

  return (
    <>
      {/* 工具网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {tools.map((tool) => {
          const IconComponent = tool.icon;
          return (
            <Link
              key={tool.name}
              href={tool.href}
              className="group relative p-6 bg-white border border-gray-200 rounded-xl hover:shadow-lg hover:border-gray-300 transition-all duration-200"
            >
              {tool.badge && (
                <span className="absolute top-4 right-4 px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-600 rounded-full">
                  {tool.badge}
                </span>
              )}

              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-lg ${tool.color}`}>
                  <IconComponent className="h-6 w-6" />
                </div>
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                {tool.name}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                {tool.description}
              </p>

              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">{t("toolBox.main.openHint")}</span>
                <svg
                  className="h-4 w-4 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all"
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
    </>
  );
}
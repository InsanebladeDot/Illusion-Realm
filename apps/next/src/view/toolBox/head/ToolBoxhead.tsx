"use client";

import {
  FileEdit,
  Film,
  PenTool,
  Search,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";

export function ToolBoxHead() {
  const pathname = usePathname();
  const { t } = useTranslation();
  
  // 1. 创建 ref 数组来存储每个 Tab 按钮的 DOM 引用
  const tabsRef = useRef<(HTMLAnchorElement | null)[]>([]);
  
  // 2. 状态：记录滑动指示器的 left 偏移量和 width 宽度
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const categories = [
    { name: t("toolBox.head.tabs.all"), icon: Sparkles, path: "/toolBox" },
    { name: t("toolBox.head.tabs.image"), icon: FileEdit, path: "/toolBox/exif" },
    { name: t("toolBox.head.tabs.video"), icon: Film, path: "/toolBox/video" },
    { name: t("toolBox.head.tabs.ai"), icon: PenTool, path: "/toolBox/comic" },
  ];

  // 3. 当路由 (pathname) 改变时，计算并更新指示器的位置和宽度
  useEffect(() => {
    const activeIndex = categories.findIndex((cat) => cat.path === pathname);
    const activeTab = tabsRef.current[activeIndex];
    
    if (activeTab) {
      setIndicatorStyle({
        left: activeTab.offsetLeft,
        width: activeTab.offsetWidth,
      });
    }
  }, [pathname]); // 依赖 pathname，路由变化时触发

  return (
    <div>
      {/* Header Section */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            {t("toolBox.head.title")}
          </h1>
          <p className="text-gray-500 mt-1">
            {t("toolBox.head.description")}
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={t("toolBox.head.searchPlaceholder")}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />
        </div>
      </div>

      {/* Category Tabs */}
      {/* 4. 父容器改为 relative，以便绝对定位指示器 */}
      <div className="relative flex gap-1 border-b border-gray-200">
        
        {/* 5. 动画滑动指示器 */}
        <div 
          className="absolute bottom-0 h-0.5 bg-blue-600 transition-all duration-300 ease-out"
          style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
        />
        
        {categories.map((category, index) => {
          const Icon = category.icon;
          const isActive = pathname === category.path;
          
          return (
            <Link
              key={category.name}
              href={category.path}
              // 6. 将当前 DOM 元素存入 ref 数组
              ref={(el) => { tabsRef.current[index] = el; }}
              // 7. 移除了原来的 border-b-2，改为用 z-10 确保文字在指示器上方
              className={`relative flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors z-10 ${
                isActive
                  ? "text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {category.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
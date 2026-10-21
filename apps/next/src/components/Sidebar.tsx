"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BOTTOM_NAV_ITEMS, MAIN_NAV_ITEMS, SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from "@/data/navigation";
import { showNotImplementedToast } from "@/stores/useToastStore";
import { useSidebarStore } from "@/stores/useSidebarStore";
import { useTranslation } from "@/i18n";
import { resolvePageDirection, startPageNavigation } from "@/utils/pageTransition";
import { cn } from "@/utils/cn";
import { SidebarAccountMenu } from "@/components/sidebar-account-menu";

// 界面：nav 底部常驻设置；工具箱、更新和语言由账户菜单提供，外观由全局顶栏提供。
export function Sidebar() {
  const pathname = usePathname(), router = useRouter();
  const { t } = useTranslation();
  const expanded = useSidebarStore((state) => state.expanded);
  const navigate = (event: React.MouseEvent, href: string, label: string, implemented: boolean) => {
    event.preventDefault();
    if (!implemented) { showNotImplementedToast(label); return; }
    if (href !== pathname) startPageNavigation({ href, push: () => router.push(href), direction: resolvePageDirection(pathname, href) });
  };
  return <nav className="fixed left-0 top-[var(--window-chrome-height)] z-50 hidden h-[calc(100dvh-var(--window-chrome-height))] flex-col bg-shell transition-[width] duration-300 ease-in-out md:flex" style={{ width: expanded ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED }} aria-expanded={expanded}>
    <div className={cn("flex h-full flex-col items-center justify-between gap-2 p-2 pb-4", expanded ? "overflow-hidden" : "overflow-visible")}>
      <div className="flex min-h-0 w-full flex-col items-center gap-0.5">
        {/* nav：直接展示业务导航，项目名统一保留在顶部标题栏。 */}
        {MAIN_NAV_ITEMS.map(item => {
          const Icon = item.icon;
          return <div key={item.id} className="group relative w-full">
            <Link href={item.href} title={!expanded ? t(item.label) : undefined} aria-current={pathname === item.href ? "page" : undefined} onClick={event => navigate(event, item.href, t(item.label), item.implemented)} className={cn("flex h-9 items-center gap-2 rounded-xl px-3 text-sm transition-all active:scale-[0.98]", expanded ? "w-full min-w-0" : "w-10 justify-center", pathname === item.href ? "bg-accent-soft text-accent-text" : "hover:bg-foreground/5")}><Icon className="h-4 w-4 shrink-0" />{expanded && <span className="truncate whitespace-nowrap">{t(item.label)}</span>}</Link>
          </div>;
        })}
      </div>
      <div className="flex w-full shrink-0 flex-col items-center gap-2">
        {BOTTOM_NAV_ITEMS.filter(item => item.id === "settings").map(item => {
          const Icon = item.icon;
          return <div key={item.id} className={cn("group relative w-full", item.id === "updates" && "group/updates")}>
            <Link href={item.href!} aria-current={pathname === item.href ? "page" : undefined} title={!expanded ? t(item.label) : undefined} onClick={event => navigate(event, item.href!, t(item.label), item.implemented)} className={cn("relative flex h-9 items-center rounded-xl px-3 text-sm transition-all active:scale-[0.98]", pathname === item.href ? "bg-accent-soft text-accent-text" : "hover:bg-muted", expanded ? "w-full" : "w-10 justify-center")}><Icon className="h-4 w-4 shrink-0" />{expanded && <span className="ml-2 truncate whitespace-nowrap text-sm">{t(item.label)}</span>}{item.badge && <span className="ml-auto rounded bg-red-500/10 px-1 text-[8px] text-red-600">{item.badge}</span>}</Link>
          </div>;
        })}
        {/* 界面：点击头像打开账户菜单，展开 / 收起侧栏共用一份入口。 */}
        <SidebarAccountMenu expanded={expanded} />
      </div>
    </div>
  </nav>;
}

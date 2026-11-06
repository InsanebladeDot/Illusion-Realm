"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MAIN_NAV_ITEMS } from "@/data/navigation";
import { showNotImplementedToast } from "@/stores/useToastStore";
import { useSidebarStore } from "@/stores/useSidebarStore";
import { useTranslation } from "@/i18n";
import { resolvePageDirection, startPageNavigation } from "@/utils/pageTransition";
import { cn } from "@/utils/cn";
// 导航与主区留白共享同一伸缩节奏，模型库也复用此配置。
// 只抽取动画参数，原有导航 store 与主区布局仍各司其职。
// duration-300 与 ease-in-out 的实际值保持原样，本次不调整全局导航的手感。
// 属性清单仍在各调用点声明，避免共享参数把无关颜色或尺寸也变成动画。
// 新增模型库调用方只复用动画配置，不订阅或写入应用导航的 expanded 状态。
import { PANEL_RESIZE_MOTION } from "@/utils/panel-resize-motion";
import { SidebarAccountMenu } from "@/components/sidebar-account-menu";
import sidebarRole from "@/assets/icon/Nav/sidebar.webp";

// 界面：nav 仅显示业务导航，展开与收起时都不重复显示设置入口。
// 设置统一放到账户菜单，侧栏展开与收起都不再单列该入口。
// 账户菜单保留无自定义顶栏时的回退；工具箱、更新、语言仍使用原菜单。
export function Sidebar() {
  const pathname = usePathname(), router = useRouter();
  const { t } = useTranslation();
  const expanded = useSidebarStore((state) => state.expanded);
  const navigate = (event: React.MouseEvent, href: string, label: string, implemented: boolean) => {
    event.preventDefault();
    if (!implemented) { showNotImplementedToast(label); return; }
    if (href !== pathname) startPageNavigation({ href, push: () => router.push(href), direction: resolvePageDirection(pathname, href) });
  };
  return <nav data-app-nav className={cn("fixed left-0 top-[var(--window-chrome-height)] z-50 hidden h-[calc(100dvh-var(--window-chrome-height))] flex-col bg-shell transition-[width] md:flex", PANEL_RESIZE_MOTION)} aria-expanded={expanded}>
    <div className={cn("flex h-full flex-col items-center justify-between gap-2 p-2 pb-4", expanded ? "overflow-hidden" : "overflow-visible")}>
      <div className="flex min-h-0 w-full flex-col items-center gap-0.5">
        {/* nav：直接展示业务导航，项目名统一保留在顶部标题栏。 */}
        {/** 首页和创建采用导航表原始顺序，与移动导航及转场方向保持一致。 */}
        {/** 不再在渲染时把创建排到首位，其他业务入口仍沿用配置中的顺序。 */}
        {/** 只改变展示顺序，选中状态继续按 href 匹配，不把首项当作默认当前页。 */}
        {MAIN_NAV_ITEMS.map(item => {
          const Icon = item.icon;
          return <div key={item.id} className="group relative w-full">
            <Link href={item.href} title={!expanded ? t(item.label) : undefined} aria-current={pathname === item.href ? "page" : undefined} onClick={event => navigate(event, item.href, t(item.label), item.implemented)} className={cn("flex h-9 items-center gap-2 rounded-xl px-3 text-sm transition-all active:scale-[0.98]", expanded ? "w-full min-w-0" : "w-10 justify-center", pathname === item.href ? "bg-accent-soft text-accent-text" : "hover:bg-foreground/5")}><Icon className="h-4 w-4 shrink-0" />{expanded && <span className="truncate whitespace-nowrap">{t(item.label)}</span>}</Link>
          </div>;
        })}
      </div>
      {/* nav：原始透明角色插画；仅在展开且有足够空间时显示。 */}
      {expanded && <img data-sidebar-art src={sidebarRole.src} alt="" className="pointer-events-none mt-auto min-h-0 w-full object-contain object-bottom" />}
      <div className="flex w-full shrink-0 flex-col items-center gap-2">
        {/* 界面：点击头像打开账户菜单，展开 / 收起侧栏共用一份入口。 */}
        <div data-nav-account className="w-full"><SidebarAccountMenu expanded={expanded} /></div>
      </div>
    </div>
  </nav>;
}

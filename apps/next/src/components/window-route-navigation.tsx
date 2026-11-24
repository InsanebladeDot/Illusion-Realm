"use client";
/** head：前进后退使用原生历史；面包屑和悬浮用途共用路由元数据与 HoverTip。 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FolderTree, PanelLeft } from "lucide-react";
import type { MouseEvent } from "react";
import { useTranslation } from "@/i18n";
import { routeBreadcrumbs, type RouteMetadata } from "@/data/route-metadata";
import { useWindowRouteHistory } from "@/hooks/use-window-route-history";
import { useModelLibraryLocationStore } from "@/stores/use-model-library-location-store";
import { useSidebarStore } from "@/stores/useSidebarStore";
import { resolvePageDirection, startPageNavigation } from "@/utils/pageTransition";
import { HoverTip } from "./hover-tip";
import { WindowTitlebarContent } from "./window-titlebar-content";

interface HistoryButtonProps { direction: -1 | 1; enabled: boolean; go: (direction: -1 | 1) => void }
/** head：侧栏开关紧跟前进按钮；只移动入口，沿用原状态、提示和点击边界。 */
function SidebarToggle() {
  const { t } = useTranslation();
  const expanded = useSidebarStore(state => state.expanded);
  const toggle = useSidebarStore(state => state.toggle);
  const label = t(expanded ? "nav.sidebar.collapse" : "nav.sidebar.expand");
  return <HoverTip asChild layer="window" label={label}><button type="button" data-sidebar-toggle aria-label={label} aria-expanded={expanded} onClick={toggle} className="window-caption-action ml-1 hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stroke min-[821px]:flex"><PanelLeft size={16} aria-hidden="true" /></button></HoverTip>;
}

function HistoryButton({ direction, enabled, go }: HistoryButtonProps) {
  const { t } = useTranslation();
  const back = direction < 0;
  const label = t(back ? "nav.history.back" : "nav.history.forward");
  const hint = enabled ? label : t(back ? "nav.history.noBack" : "nav.history.noForward");
  const Icon = back ? ChevronLeft : ChevronRight;
  return <HoverTip label={hint} layer="window" asChild><button type="button" data-window-history={back ? "back" : "forward"} aria-label={label} disabled={!enabled} onClick={() => go(direction)} className="window-caption-action flex h-7 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stroke disabled:cursor-default disabled:opacity-30 sm:w-7"><Icon size={17} aria-hidden="true" /></button></HoverTip>;
}

/** 分类没有实际页面时只显示说明；祖先链接仍走项目原有页面转场。 */
function RouteCrumb({ route, current }: { route: RouteMetadata; current: boolean }) {
  const { t } = useTranslation(), router = useRouter(), pathname = usePathname();
  const label = route.title ? t(route.title) : route.path;
  const Icon = route.icon;
  const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    startPageNavigation({ href: route.path, direction: resolvePageDirection(pathname, route.path), push: () => router.push(route.path) });
  };
  const content = <>{current && <Icon size={14} className="shrink-0" aria-hidden="true" />}<span className="truncate">{label}</span></>;
  const className = "window-caption-action inline-flex min-w-0 items-center gap-1.5 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stroke";
  return <li data-window-route-segment={route.path} className="flex min-w-0 items-center gap-1.5 last:max-w-full last:shrink-0">
    {route.parent && <ChevronRight data-route-separator size={11} className="shrink-0 text-muted-foreground/60" aria-hidden="true" />}
    <HoverTip label={t(route.description)} layer="window" asChild>{!current && route.navigable !== false
      ? <Link href={route.path} onClick={navigate} className={className}>{content}</Link>
      : <span tabIndex={0} aria-current={current ? "page" : undefined} className={`${className} ${current ? "font-medium text-foreground" : ""}`}>{content}</span>}
    </HoverTip>
  </li>;
}

/** 保留本地库原有的相对目录门牌，不将磁盘根路径混进路由元数据。 */
function ModelLibraryPath() {
  const { t } = useTranslation();
  const location = useModelLibraryLocationStore();
  if (!location.owner) return null;
  const label = [t("toolBox.civitai.localTitle"), ...location.segments].join(" / ");
  return <HoverTip label={label} layer="window" asChild><span data-model-library-location tabIndex={0} className="window-caption-action ml-2 inline-flex min-w-0 max-w-[24vw] items-center gap-1.5 text-muted-foreground"><FolderTree size={14} className="shrink-0" aria-hidden="true" /><span className="truncate">{label}</span></span></HoverTip>;
}

export function WindowRouteNavigation() {
  const { t } = useTranslation(), pathname = usePathname();
  const history = useWindowRouteHistory();
  const trail = routeBreadcrumbs(pathname);
  return <div data-window-route-navigation className="flex h-full min-w-0 flex-1 items-center gap-2 pl-3">
    <div className="flex shrink-0 items-center"><HistoryButton direction={-1} enabled={history.canGoBack} go={history.go} /><HistoryButton direction={1} enabled={history.canGoForward} go={history.go} /><SidebarToggle /></div>
    {/* head：此区域只显示路由层级，用途通过共用的轻量提示框呈现。 */}
    <WindowTitlebarContent marker="route"><nav aria-label={t("nav.history.breadcrumb")} className="min-w-0"><ol className="flex min-w-0 items-center gap-1.5">{trail.map((route, index) => <RouteCrumb key={`${route.path}:${index === trail.length - 1}`} route={route} current={index === trail.length - 1} />)}</ol></nav>{pathname.replace(/\/+$/, "") === "/tools/models/civitai" && <ModelLibraryPath />}</WindowTitlebarContent>
  </div>;
}

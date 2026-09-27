"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Globe,
  History,
  Menu,
  User,
  WandSparkles,
} from "lucide-react";
import { showNotImplementedToast } from "@/stores/useToastStore";
import { useTranslation, type MessageKey } from "@/i18n";
import { cn } from "@/utils/cn";
import {
  resolvePageDirection,
  startPageNavigation,
} from "@/utils/pageTransition";

/** `label` 存词条 key，渲染时用 t(label) 取文案 */
const MOBILE_NAV_ITEMS = [
  { id: "menu", label: "nav.mobile.menu", type: "button" as const, icon: Menu },
  {
    id: "explore",
    label: "nav.mobile.explore",
    type: "link" as const,
    href: "/explore",
    icon: Globe,
    implemented: false,
  },
  {
    id: "create",
    label: "nav.create",
    type: "link" as const,
    href: "/create",
    icon: WandSparkles,
    implemented: true,
  },
  {
    id: "history",
    label: "nav.mobile.history",
    type: "link" as const,
    href: "/history",
    icon: History,
    implemented: false,
  },
  { id: "notifications", label: "nav.mobile.notifications", type: "button" as const, icon: Bell },
  {
    id: "profile",
    label: "nav.mobile.you",
    type: "link" as const,
    href: "/profile",
    icon: User,
    implemented: true,
  },
] satisfies ReadonlyArray<{
  id: string;
  label: MessageKey;
  type: "button" | "link";
  href?: string;
  icon: typeof Menu;
  implemented?: boolean;
}>;

export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();

  const handleClick = (
    event: React.MouseEvent,
    item: (typeof MOBILE_NAV_ITEMS)[number]
  ) => {
    event.preventDefault();

    if (item.type === "button") {
      showNotImplementedToast(t(item.label));
      return;
    }

    if (item.type === "link" && !item.implemented) {
      showNotImplementedToast(t(item.label));
      return;
    }

    if (item.type === "link" && item.href && item.href !== pathname) {
      /** 与侧边栏同一套页面切换动画（窄屏下没有侧栏，这里是唯一入口） */
      startPageNavigation({
        href: item.href,
        push: () => router.push(item.href as string),
        direction: resolvePageDirection(pathname, item.href),
      });
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[60] flex h-[52px] items-center justify-around border-t border-border bg-background px-2 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] transition-transform duration-300 ease-in-out md:hidden">
      {MOBILE_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.type === "link" && item.href === pathname;
        const className = cn(
          "group flex flex-col items-center rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
          active
            ? "text-foreground dark:text-zinc-100"
            : "text-muted-foreground hover:text-foreground"
        );

        if (item.type === "link") {
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={(event) => handleClick(event, item)}
              className={className}
            >
              <Icon className="mb-0.5 h-5 w-5" />
              <span className="mt-0.5">{t(item.label)}</span>
            </Link>
          );
        }

        return (
          <button
            key={item.id}
            type="button"
            aria-label={t(item.label)}
            onClick={(event) => handleClick(event, item)}
            className={className}
          >
            <Icon className="mb-0.5 h-5 w-5" />
            <span className="mt-0.5 transition-colors group-hover:text-foreground">
              {t(item.label)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

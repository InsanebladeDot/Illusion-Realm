"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftFromLine,
  ArrowRightFromLine,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";
import { AppLogo } from "@/assets/AppLogo";
import {
  APP_NAME,
  BOTTOM_NAV_ITEMS,
  MAIN_NAV_ITEMS,
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
} from "@/data/navigation";
import { useProfileStore } from "@/stores/useProfileStore";
import { showNotImplementedToast } from "@/stores/useToastStore";
import { useSidebarStore } from "@/stores/useSidebarStore";
import {
  useTranslation,
  AVAILABLE_LOCALES,
  LOCALES,
  useLocaleStore,
  type MessageKey,
} from "@/i18n";
import { applyLocaleSignals } from "@/utils/localeSignals";
import { getProfileInitials } from "@/utils/profile";
import { useSettingsStore } from "@/stores/useSettingsStore";
import {
  AVAILABLE_THEME_PREFERENCES,
  type ThemePreference,
} from "@/utils/themeResolution";
import { startThemeRippleTransition } from "@/utils/themeTransition";
import {
  resolvePageDirection,
  startPageNavigation,
} from "@/utils/pageTransition";
import { cn } from "@/utils/cn";

/**
 * 主题三态的图标：与 `AVAILABLE_THEME_PREFERENCES` 一一对应。
 * 用 Record 而不是数组下标 —— 将来加第四态（例如「高对比」）会在这里编译失败，
 * 而不是悄悄少一个图标。
 */
const THEME_OPTION_ICONS: Record<ThemePreference, typeof Monitor> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

/** 三态的文案 key：写成 Record 而不是拼字符串 —— 拼错了 typecheck 直接报错 */
const THEME_OPTION_LABELS: Record<ThemePreference, MessageKey> = {
  system: "settings.theme.system",
  light: "settings.theme.light",
  dark: "settings.theme.dark",
};

/**
 * 侧边栏底部入口共用的弹框外壳（语言 / 主题）。
 *
 * 位置：展开态挂按钮**正上方**，图标态挂**右侧**（40px 宽的图标列挂上面会被挤出屏幕）。
 * 外部点击关闭靠一层**透明**捕获层 —— 暗化遮罩正是「popover 看起来像 modal」的成因。
 */
function SidebarPopover({
  expanded,
  variant,
  onClose,
  children,
}: {
  expanded: boolean;
  variant: "language" | "theme";
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        data-sidebar-popover-backdrop={variant}
        className="fixed inset-0 z-[998]"
        aria-hidden
        onClick={onClose}
      />
      <div
        data-language-dialog={variant === "language" ? "" : undefined}
        data-theme-dialog={variant === "theme" ? "" : undefined}
        role="menu"
        className={cn(
          "absolute z-[999] min-w-[168px] rounded-xl border border-border bg-background p-1.5 shadow-xl",
          expanded ? "bottom-full left-0 mb-2" : "bottom-0 left-full ml-2"
        )}
      >
        {children}
      </div>
    </>
  );
}

export function Sidebar() {
  /** 语言切换弹框（侧边栏「语言」入口触发）。 */
  const [languageDialogOpen, setLanguageDialogOpen] = useState(false);
  /** 主题弹框（侧边栏「主题」入口触发，位于左下角）。 */
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  const themePreference = useSettingsStore((state) => state.theme);
  const setThemePreference = useSettingsStore((state) => state.setTheme);
  /** 波纹的圆心取这个按钮（左下角那个）。用 ref 而不是 `document.querySelector`：
   *  「主题按钮在哪」是组件自己的知识，不该让组件去 DOM 里找自己。 */
  const themeTriggerRef = useRef<HTMLButtonElement | null>(null);

  /**
   * 切换语言：**Store 与 DOM 信号同一次更新**（`applyLocaleSignals` 是唯一写点，见 utils/localeSignals）。
   * 界面文案由 `useTranslation()` 订阅 store 自动重渲染，不需要刷新页面。
   */
  const switchLocale = (next: (typeof AVAILABLE_LOCALES)[number]) => {
    setLocale(next);
    applyLocaleSignals(next);
    setLanguageDialogOpen(false);
  };

  /**
   * 切换主题：波纹动效 + 写 store。落到 `<html data-theme>` 与主进程 `themeSource` 那一步
   * 由 AppShell 的订阅统一做（唯一写点），这里不碰主题本身。
   *
   * 关弹框放在 `apply` 里面（即动画的 callback 里）：这样**旧快照里弹框还是打开的**、
   * 新快照里已经收起，波纹扫过去时弹框与配色一起换掉，而不是先「啪」地收起再开始动画。
   */
  const switchTheme = (next: ThemePreference) => {
    const rect = themeTriggerRef.current?.getBoundingClientRect();
    startThemeRippleTransition({
      preference: next,
      origin: rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : null,
      apply: () => {
        setThemeDialogOpen(false);
        setThemePreference(next);
      },
    });
  };

  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();
  const expanded = useSidebarStore((state) => state.expanded);
  const toggle = useSidebarStore((state) => state.toggle);
  const username = useProfileStore((state) => state.username);
  const avatarDataUrl = useProfileStore((state) => state.avatarDataUrl);

  /** 底部非链接入口：语言 / 主题各开各的 popover，其余仍是「未实现」提示 */
  const handleBottomItemClick = (itemId: string, label: string) => {
    if (itemId === "language") {
      setLanguageDialogOpen(true);
      return;
    }
    if (itemId === "theme") {
      setThemeDialogOpen(true);
      return;
    }
    showNotImplementedToast(label);
  };

  const handleNavClick = (
    e: React.MouseEvent,
    href: string,
    label: string,
    implemented: boolean
  ) => {
    e.preventDefault();

    if (!implemented) {
      showNotImplementedToast(label);
      return;
    }

    if (href !== pathname) {
      /** 带方向地跳：向前 = 内容右抽 / 新内容从右进；向后镜像（见 utils/pageTransition） */
      startPageNavigation({
        href,
        push: () => router.push(href),
        direction: resolvePageDirection(pathname, href),
      });
    }
  };

  const width = expanded ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED;

  return (
    <nav
      className="fixed left-0 top-0 z-50 hidden h-[100dvh] flex-col border-r border-border bg-background transition-[width] duration-300 ease-in-out md:flex"
      style={{ width }}
      aria-expanded={expanded}
    >
      {/**
       * 语言切换弹框：选项来自 AVAILABLE_LOCALES，文案取各语言的**自称**
       * （`common.localeNameSelf`）—— 因此新增语言时这里不需要改一行代码。
       * 切换后由 useTranslation 订阅 store 自动重渲染，无需刷新页面。
       */}
      {/**
       * 语言弹框已改为**锚定在「语言」按钮上**的 popover，渲染在被点击的那一项内部
       * （见下方 BOTTOM_NAV_ITEMS 的 language 分支）——
       * 原来它是屏幕居中的 modal：按钮在侧栏最底部、弹框出现在屏幕中央，
       * 用户视线要跨半屏、因果关联断裂（「不知道这框从哪来的」）。
       */}
      {/**
       * 展开态必须 `overflow-hidden`：宽度过渡期间标签会跟着按钮宽度被 `truncate`，
       * 但布局盒仍在变，裁掉边缘更稳。
       *
       * 收边态反过来必须 `overflow-visible`：语言 / 主题弹框与悬浮提示都挂在按钮**右侧**
       * （`left-full ml-2`），而它们是这个容器的后代 —— 容器一裁，弹出物整块不可见，
       * 表现就是「点了没反应」（用户实测：收边后点主题无弹出、点语言也不弹）。
       * 收边态没有标签会被挤出去（标签本来就只在展开态渲染），所以放开裁剪是安全的。
       */}
      <div
        className={cn(
          "flex h-full flex-col items-center justify-between gap-2 p-2 pb-4",
          expanded ? "overflow-hidden" : "overflow-visible"
        )}
      >
        <div className="flex w-full flex-col items-center gap-0.5">
          <div
            className={cn(
              "relative flex w-full items-center gap-1 pb-2",
              !expanded && "justify-center"
            )}
          >
            {expanded && (
              <Link
                href="/"
                className="flex min-w-0 flex-1 items-center gap-2 px-1 active:scale-95 transition-transform"
              >
                <AppLogo className="h-9 w-9 shrink-0 rounded-xl" />
                <span className="truncate text-sm font-bold whitespace-nowrap">
                  {APP_NAME}
                </span>
              </Link>
            )}
            <button
              type="button"
              aria-label={expanded ? t("nav.sidebar.collapse") : t("nav.sidebar.expand")}
              onClick={toggle}
              className="flex h-9 w-10 shrink-0 items-center justify-center rounded-xl transition-all hover:bg-muted active:scale-90"
            >
              {expanded ? (
                <ArrowLeftFromLine className="h-4 w-4" />
              ) : (
                <ArrowRightFromLine className="h-4 w-4" />
              )}
            </button>
          </div>

          {MAIN_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;

            return (
              <div key={item.id} className="group relative w-full">
                <Link
                  href={item.href}
                  onClick={(e) =>
                    handleNavClick(e, item.href, t(item.label), item.implemented)
                  }
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-xl px-3 text-sm transition-all active:scale-[0.98]",
                    expanded ? "w-full min-w-0" : "w-10 justify-center",
                    active ? "bg-muted" : "hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {expanded && (
                    <span className="truncate whitespace-nowrap">{t(item.label)}</span>
                  )}
                </Link>
                {!expanded && (
                  <div className="pointer-events-none invisible absolute left-full top-1/2 z-[999] ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-foreground/90 px-2 py-1 text-xs text-background opacity-0 shadow-md transition-all duration-150 group-hover:visible group-hover:opacity-100">
                    {t(item.label)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex w-full flex-col items-center gap-2 transition-all duration-300">
          {BOTTOM_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const content = (
              <>
                <Icon className="h-4 w-4 shrink-0" />
                {expanded && (
                  <>
                    <span className="ml-2 truncate whitespace-nowrap text-sm">
                      {t(item.label)}
                    </span>
                    {item.badge && (
                      <span className="ml-auto rounded bg-red-500/10 px-1 text-[8px] font-bold leading-normal text-red-600 dark:text-red-400">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
                {!expanded && item.badge && (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
                )}
              </>
            );

            const className = cn(
              "relative flex h-9 items-center rounded-xl px-3 text-sm transition-all hover:bg-muted active:scale-[0.98]",
              expanded ? "w-full" : "w-10 justify-center"
            );

            return (
              <div key={item.id} className={cn("group relative w-full", item.id === "settings" && "group/settings", item.id === "language" && "group/language", item.id === "referrals" && "group/referrals", item.id === "updates" && "group/updates")}>
                {item.href ? (
                  <Link
                    href={item.href}
                    onClick={(e) =>
                      handleNavClick(e, item.href!, t(item.label), item.implemented)
                    }
                    className={className}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    ref={item.id === "theme" ? themeTriggerRef : undefined}
                    type="button"
                    aria-label={t(item.label)}
                    data-language-trigger={item.id === "language" ? "" : undefined}
                    data-theme-trigger={item.id === "theme" ? "" : undefined}
                    onClick={() => handleBottomItemClick(item.id, t(item.label))}
                    className={className}
                  >
                    {content}
                  </button>
                )}
                {!expanded && (
                  <div className="pointer-events-none invisible absolute left-full top-1/2 z-[999] ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-foreground/90 px-3 py-1.5 text-xs text-background opacity-0 shadow-md transition-all duration-150 group-hover:visible group-hover:opacity-100">
                    {t(item.label)}
                  </div>
                )}

                {/**
                 * 语言 / 主题弹框：**锚定在本项（relative 包裹层）之上**，而不是屏幕居中。
                 * 动线因此是「点按钮 → 框从按钮上方长出 → 选完收起」，眼睛不用移动。
                 * 展开态挂按钮**正上方**（`bottom-full mb-2`）；图标态挂**右侧**（`left-full ml-2`），
                 * 否则 40px 宽的图标列会把它挤出屏幕。
                 *
                 * 外部点击关闭靠一层**透明**捕获层（`fixed inset-0`，但**不居中也不暗化**）——
                 * 暗化遮罩正是「像 modal」的元凶，popover 不该有。
                 */}
                {item.id === "language" && languageDialogOpen ? (
                  <SidebarPopover
                    expanded={expanded}
                    variant="language"
                    onClose={() => setLanguageDialogOpen(false)}
                  >
                    {AVAILABLE_LOCALES.filter((localeId) => {
                        /**
                         * 守卫：某语言漏填 `common.localeNameSelf`（或空串）时**跳过并 warn**。
                         * 这是本设计唯一没被类型兜住的地方 —— `common` 是每语言各自的对象，
                         * 缺字段只会在运行时表现为「空白选项」。
                         */
                        const selfName = LOCALES[localeId].common.localeNameSelf;
                        if (!selfName) {
                          // 开发者日志用英文：它不是界面文案，中文会撞 check:i18n 的硬编码基线。
                          console.warn(
                            `[locale] ${localeId} is missing common.localeNameSelf — skipped in the language menu`
                          );
                          return false;
                        }
                        return true;
                      }).map((localeId) => (
                      <button
                        key={localeId}
                        type="button"
                        role="menuitemradio"
                        aria-checked={localeId === locale}
                        data-language-option={localeId}
                        onClick={() => switchLocale(localeId)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                          localeId === locale && "bg-muted font-medium"
                        )}
                      >
                        <span>{LOCALES[localeId].common.localeNameSelf}</span>
                      </button>
                    ))}
                  </SidebarPopover>
                ) : null}

                {item.id === "theme" && themeDialogOpen ? (
                  <SidebarPopover
                    expanded={expanded}
                    variant="theme"
                    onClose={() => setThemeDialogOpen(false)}
                  >
                    {AVAILABLE_THEME_PREFERENCES.map((preference) => {
                      const Icon = THEME_OPTION_ICONS[preference];
                      return (
                        <button
                          key={preference}
                          type="button"
                          role="menuitemradio"
                          aria-checked={preference === themePreference}
                          data-theme-option={preference}
                          onClick={() => switchTheme(preference)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                            preference === themePreference && "bg-muted font-medium"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span>{t(THEME_OPTION_LABELS[preference])}</span>
                        </button>
                      );
                    })}
                  </SidebarPopover>
                ) : null}
              </div>
            );
          })}

          <div className="group relative w-full">
            <Link
              href="/profile"
              onClick={(e) => handleNavClick(e, "/profile", t("nav.profile"), true)}
              className={cn(
                "flex h-9 w-full items-center rounded-xl px-2 transition-all hover:bg-muted active:scale-[0.98]",
                !expanded && "justify-center",
                pathname === "/profile" && "bg-muted"
              )}
            >
              <span className="relative flex h-6 w-6 shrink-0 overflow-hidden rounded-full bg-muted">
                {avatarDataUrl ? (
                  <img
                    src={avatarDataUrl}
                    alt={username}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[10px] font-medium">
                    {getProfileInitials(username)}
                  </span>
                )}
              </span>
              {expanded && (
                <span className="ml-2 truncate whitespace-nowrap text-sm">
                  {username}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

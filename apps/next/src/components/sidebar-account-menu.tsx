"use client";

// 界面：账户、设置、工具箱、更新与语言入口；外观设置继续位于全局顶栏。
// 设置使用 BOTTOM_NAV_ITEMS 的同一配置，导航配置改名时菜单也会同步。
// 筛选保留配置顺序，避免这里另写一份链接清单后出现路由漂移。
// 工具箱与更新原入口继续由相同的菜单行生成。
// 菜单行共用16px图标与 ROW 的点击区域，设置不需要独立尺寸。
// 链接同时保留 href 和 navigate，沿用原来的路由与转场机制。
// navigate 收起菜单后才开始跳转，避免新页面上覆盖旧浮层。
// 账户未登录时也显示设置，因为本地配置无需账号服务。
// caption 与侧栏回退共用本组件，两个宿主会获得相同的设置入口。
// 菜单锚点和视口边界仍由本组件原有定位逻辑处理。
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Languages, LogOut, User } from "lucide-react";
import { BOTTOM_NAV_ITEMS } from "@/data/navigation";
import { AVAILABLE_LOCALES, LOCALES, useLocaleStore, useTranslation } from "@/i18n";
import { useProfileStore } from "@/stores/useProfileStore";
import { useAccountStore } from "@/stores/useAccountStore";
import { useGuestSessionStore } from "@/stores/useGuestSessionStore";
import { useToastStore } from "@/stores/useToastStore";
import { getProfileInitials } from "@/utils/profile";
import { applyLocaleSignals } from "@/utils/localeSignals";
import { resolvePageDirection, startPageNavigation } from "@/utils/pageTransition";
import { cn } from "@/utils/cn";

const ROW = "flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stroke";
type View = "account" | "language";
interface MenuProps { anchor: RefObject<HTMLButtonElement | null>; expanded: boolean; onClose: () => void }

function AccountAvatar({ name, source }: { name: string; source: string | null }) {
  return <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-medium">{source ? <img src={source} alt="" className="h-full w-full object-cover" /> : getProfileInitials(name)}</span>;
}

/** Portal 脱离侧栏裁剪；窗口变化时重读按钮位置，保证菜单不越过顶栏和屏幕。 */
function useMenuPosition(anchor: MenuProps["anchor"], expanded: boolean) {
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const update = () => {
      if (!anchor.current || !panel.current) return;
      const rect = anchor.current.getBoundingClientRect();
      panel.current.style.display = rect.width ? "" : "none";
      const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--window-chrome-height")) || 0;
      if (rect.top < chrome) {
        panel.current.style.left = `${Math.max(8, Math.min(rect.right - 248, innerWidth - 256))}px`;
        panel.current.style.top = `${rect.bottom + 8}px`;
        panel.current.style.bottom = "auto";
        panel.current.style.maxHeight = `${Math.max(0, innerHeight - rect.bottom - 16)}px`;
        return;
      }
      const bottom = Math.max(8, expanded ? innerHeight - rect.top + 8 : innerHeight - rect.bottom);
      panel.current.style.left = `${Math.max(8, Math.min(expanded ? rect.left : rect.right + 8, innerWidth - 256))}px`;
      panel.current.style.bottom = `${bottom}px`;
      panel.current.style.maxHeight = `${Math.max(0, innerHeight - bottom - chrome - 8)}px`;
    };
    update();
    window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    const observer = new ResizeObserver(update); if (anchor.current) observer.observe(anchor.current);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); observer.disconnect(); };
  }, [anchor, panel, expanded]);
  return panel;
}

function useMenuDismiss(anchor: MenuProps["anchor"], panel: RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); anchor.current?.focus(); } };
    const focus = (event: FocusEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) onClose(); };
    document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", key, true); document.addEventListener("focusin", focus);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", key, true); document.removeEventListener("focusin", focus); };
  }, [anchor, panel, onClose]);
}

/** 语言子页复用原来的 locale 配置及持久化，选完关闭菜单。 */
function Preferences({ onBack, onClose, anchor }: { onBack: () => void; onClose: () => void; anchor: MenuProps["anchor"] }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const chooseLocale = (next: typeof locale) => { useLocaleStore.getState().setLocale(next); applyLocaleSignals(next); onClose(); anchor.current?.focus(); };
  return <div data-language-dialog>
    <button type="button" className={cn(ROW, "mb-1 font-medium")} onClick={onBack}><ChevronLeft size={16} />{t("nav.language")}</button>
    <div className="mx-2 my-1 border-t border-border" />
    {AVAILABLE_LOCALES.filter(id => LOCALES[id].common.localeNameSelf).map(id => <button type="button" key={id} data-language-option={id} aria-pressed={locale === id} className={cn(ROW, locale === id && "bg-muted")} onClick={() => chooseLocale(id)}><span className="flex-1">{LOCALES[id].common.localeNameSelf}</span>{locale === id && <Check size={14} />}</button>)}
  </div>;
}

function AccountMenuItems({ onClose, onView }: { onClose: () => void; onView: (view: View) => void }) {
  const { t } = useTranslation(), router = useRouter(), pathname = usePathname();
  const account = useAccountStore(state => state.profile), busy = useAccountStore(state => state.loading);
  const localName = useProfileStore(state => state.username), avatar = useProfileStore(state => state.avatarDataUrl);
  const name = account?.displayName ?? localName;
  const navigate = (href: string) => { onClose(); if (pathname !== href) startPageNavigation({ href, direction: resolvePageDirection(pathname, href), push: () => router.push(href) }); };
  const logout = async () => {
    try { useGuestSessionStore.getState().leaveGuest(); if (account) await useAccountStore.getState().logout(); onClose(); }
    catch { useToastStore.getState().show(t("auth.authUnavailable"), "error"); }
  };
  return <>
    {/* 界面：账户资料入口，头像、昵称和邮箱统一沿用当前账户状态。 */}
    <Link href="/profile" onClick={event => { event.preventDefault(); navigate("/profile"); }} className={cn(ROW, "mb-1 py-3")}><AccountAvatar name={name} source={avatar} /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{name}</span><span className="block truncate text-xs text-muted-foreground">{account?.email ?? t("auth.guestStatus")}</span></span><ChevronRight size={14} className="text-muted-foreground" /></Link>
    <div className="mx-2 my-1 border-t border-border" />
    <Link href="/profile" className={ROW} onClick={event => { event.preventDefault(); navigate("/profile"); }}><User size={16} />{t("nav.profile")}</Link>
    {/* 界面：设置与更新、工具箱共用同一菜单行，保持截图中的账户菜单密度。 */}
    {/* 设置复用导航配置中的图标、词条与真实 /settings 路由，不新增平行入口。 */}
    {/* 统一 navigate 会先关闭菜单再切页，避免设置页打开后仍残留账户浮层。 */}
    {BOTTOM_NAV_ITEMS.filter(item => item.id === "settings" || item.id === "toolBox" || item.id === "updates").map(item => {
      const Icon = item.icon;
      return <Link key={item.id} href={item.href!} className={ROW} onClick={event => { event.preventDefault(); navigate(item.href!); }}><Icon size={16} />{t(item.label)}</Link>;
    })}
    <button type="button" data-language-trigger className={ROW} onClick={() => onView("language")}><Languages size={16} /><span className="flex-1">{t("nav.language")}</span><ChevronRight size={14} /></button>
    <div className="mx-2 my-1 border-t border-border" />
    <button type="button" data-auth-logout disabled={busy} className={cn(ROW, "disabled:opacity-50")} onClick={() => { void logout(); }}><LogOut size={16} />{t(account ? "auth.logoutAccount" : "auth.logout")}</button>
  </>;
}

function AccountMenu({ anchor, expanded, onClose }: MenuProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>("account");
  const panel = useMenuPosition(anchor, expanded);
  useMenuDismiss(anchor, panel, onClose);
  useEffect(() => { panel.current?.querySelector<HTMLElement>("button,a[href]")?.focus(); }, [view, panel]);
  return createPortal(<div ref={panel} id="sidebar-account-menu" data-sidebar-account-menu role="dialog" aria-label={t("auth.accountMenu")} className="fixed z-[1090] w-[248px] max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-background p-2 text-foreground shadow-xl" onKeyDown={event => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),a[href]"));
    const current = elements.indexOf(document.activeElement as HTMLElement), step = event.key === "ArrowUp" ? -1 : 1;
    event.preventDefault(); elements[event.key === "Home" ? 0 : event.key === "End" ? elements.length - 1 : (current + step + elements.length) % elements.length]?.focus();
  }}>
    {view === "account" ? <AccountMenuItems onClose={onClose} onView={setView} /> : <Preferences anchor={anchor} onClose={onClose} onBack={() => setView("account")} />}
  </div>, document.body);
}

export function SidebarAccountMenu({ expanded, caption = false }: { expanded: boolean; caption?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false), anchor = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const account = useAccountStore(state => state.profile), localName = useProfileStore(state => state.username), avatar = useProfileStore(state => state.avatarDataUrl);
  const name = account?.displayName ?? localName;
  return <div data-caption-account={caption || undefined} className={caption ? "window-caption-action flex w-32 max-w-[26vw] items-center" : "w-full"}>
    <button ref={anchor} type="button" data-account-menu-trigger aria-label={t("auth.accountMenu")} title={name} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? "sidebar-account-menu" : undefined} onClick={() => setOpen(value => !value)} className={cn("flex min-h-10 w-full items-center gap-2 rounded-xl px-1.5 py-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stroke", !expanded && "justify-center", open && "bg-muted")}><AccountAvatar name={name} source={avatar} />{expanded && <><span className="min-w-0 flex-1"><span className="block truncate text-sm">{name}</span>{account && <span className="block truncate text-[11px] text-muted-foreground">{account.email}</span>}</span><ChevronRight size={14} className="shrink-0 text-muted-foreground" /></>}</button>
    {/* 弹窗：账户菜单通过 Portal 显示，侧栏收起时也不会被裁掉。 */}
    {open && <AccountMenu anchor={anchor} expanded={expanded} onClose={close} />}
  </div>;
}

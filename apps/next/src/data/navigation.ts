import {
  Bot,
  Home,
  Languages,
  Megaphone,
  MessageSquare,
  ScanSearch,
  Settings,
  SunMoon,
  Tag,
  User,
  WandSparkles,
  Box
} from "lucide-react";
import type { MessageKey } from "@/i18n";
import type { BottomNavItem, NavItem } from "@/types/navigation";

/**
 * 导航项在渲染进程侧的形状：`label` 存的是**词条 key**（如 `"nav.home"`），
 * 渲染时用 `t(item.label)` 取文案。
 *
 * 为什么不直接把中文写在这里：文案一旦集中在词条表里，切换语言就只需要
 * 换一份词条；而 `MessageKey` 是字符串联合类型，
 * 写错 key（`"nav.hom"`）会被 `pnpm typecheck` 当场拦住。
 */
export type LocalizedNavItem = Omit<NavItem, "label"> & { label: MessageKey };
export type LocalizedBottomNavItem = Omit<BottomNavItem, "label"> & { label: MessageKey };

export const APP_NAME = "Illusion Realm";

export const MAIN_NAV_ITEMS: LocalizedNavItem[] = [
  { id: "home", label: "nav.home", href: "/", icon: Home, implemented: true },
  { id: "create", label: "nav.create", href: "/create", icon: WandSparkles, implemented: true },
  { id: "agent", label: "nav.agent", href: "/agent", icon: Bot, implemented: true },
  {
    id: "inspect",
    label: "nav.inspect",
    href: "/inspect",
    icon: ScanSearch,
    implemented: true,
  },
  {
    id: "cartoon",
    label: "nav.cartoon",
    href: "/cartoon",
    icon: MessageSquare,
    implemented: true,
  },
  { id: "tags", label: "nav.tags", href: "/tags", icon: Tag, implemented: false },
  { id: "profile", label: "nav.profile", href: "/profile", icon: User, implemented: true },
];

export const BOTTOM_NAV_ITEMS: LocalizedBottomNavItem[] = [
  { id: "updates", label: "nav.updates", href: "/updates", icon: Megaphone, implemented: true },
  { id: "settings", label: "nav.settings", href: "/settings", icon: Settings, implemented: true },
  { id: "language", label: "nav.language", icon: Languages, implemented: false },
  { id: "toolBox", label: "nav.toolBox", href: "/toolBox", icon: Box, implemented: true },
  { id: "theme", label: "nav.theme", icon: SunMoon, implemented: false },
];

export const SIDEBAR_WIDTH_EXPANDED = 220;
export const SIDEBAR_WIDTH_COLLAPSED = 56;

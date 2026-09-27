import type { IconComponent } from "./common";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: IconComponent;
  implemented: boolean;
  badge?: string;
};

export type BottomNavItem = {
  id: string;
  label: string;
  href?: string;
  icon: IconComponent;
  implemented: boolean;
  badge?: string;
  external?: boolean;
};

/**
 * 资源类弹窗（模型 / 扩展 / 角色 / 标签库）的字号档与控件高度映射。
 *
 * 怎么做：按用户偏好的 `sm | md | lg` 返回一组 Tailwind 类名字符串；
 * 字号是**持久化偏好**，版式（如紧凑形态）只能在此基础上抬下限、不能覆盖它。
 */
import type { ResourceDialogFontSize } from "@/types/resourceDialog";

export type ResourceDialogTypography = {
  categoryTab: string;
  cardTitle: string;
  cardMeta: string;
  coverTag: string;
  action: string;
  toolbar: string;
  empty: string;
  selectedBadge: string;
  actionHeight: string;
  toolbarHeight: string;
  searchIcon: string;
};

export function getResourceDialogTypography(
  size: ResourceDialogFontSize
): ResourceDialogTypography {
  switch (size) {
    case "md":
      return {
        categoryTab: "text-base",
        cardTitle: "text-base leading-7",
        cardMeta: "text-sm",
        coverTag: "text-sm",
        action: "text-base",
        toolbar: "text-sm",
        empty: "text-base",
        selectedBadge: "text-xs",
        actionHeight: "h-10",
        toolbarHeight: "h-8",
        searchIcon: "h-4 w-4",
      };
    case "lg":
      return {
        categoryTab: "text-lg",
        cardTitle: "text-lg leading-8",
        cardMeta: "text-base",
        coverTag: "text-base",
        action: "text-lg",
        toolbar: "text-base",
        empty: "text-lg",
        selectedBadge: "text-sm",
        actionHeight: "h-11",
        toolbarHeight: "h-9",
        searchIcon: "h-4 w-4",
      };
    default:
      return {
        categoryTab: "text-sm",
        cardTitle: "text-sm leading-6",
        cardMeta: "text-xs",
        coverTag: "text-xs",
        action: "text-sm",
        toolbar: "text-xs",
        empty: "text-sm",
        selectedBadge: "text-[10px]",
        actionHeight: "h-9",
        toolbarHeight: "h-7",
        searchIcon: "h-3.5 w-3.5",
      };
  }
}

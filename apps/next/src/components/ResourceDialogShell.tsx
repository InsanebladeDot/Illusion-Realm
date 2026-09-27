"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, X } from "lucide-react";
import { useIsHydrated } from "@/hooks/useIsHydrated";
import { useMediaQueryAfterHydration } from "@/hooks/useMediaQuery";
import { useTranslation } from "@/i18n";
import { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from "@/data/navigation";
import { useSidebarStore } from "@/stores/useSidebarStore";
import { THIN_BORDER_CLASS, THIN_DIVIDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type ResourceDialogShellProps = {
  open: boolean;
  /** 弹框标题（必填，用于 aria-labelledby） */
  title: ReactNode;
  /** 标题元素 id，便于测试与无障碍 */
  titleId: string;
  /** 标题下方说明文案 */
  description?: ReactNode;
  /** 标题右侧的附加控件（例如「显示描述」开关） */
  titleAccessory?: ReactNode;
  /** 标题下方、内容上方的工具条（例如搜索框与筛选） */
  toolbar?: ReactNode;
  /** 主体内容（网格 / 列表） */
  children: ReactNode;
  /** 底部固定操作区 */
  footer?: ReactNode;
  onOpenChange: (open: boolean) => void;
  /** 关闭按钮的 aria-label（默认「关闭」） */
  closeLabel?: string;
  /** 主体额外的类名 */
  bodyClassName?: string;
  /** 主体是否自带内边距（网格类内容通常自带） */
  bodyPadded?: boolean;
  /**
   * 主体是否由外壳负责滚动（默认 true）。
   * 设为 false 时外壳只做 overflow-hidden，让内部自行划分固定区与滚动区
   * （例如左侧固定导航 + 右侧独立滚动的卡片区）。
   */
  bodyScroll?: boolean;
};

/**
 * 资源类弹框的统一外壳（模型选择器 / 扩展选择器 / 角色库详情共用）：
 * 遮罩 + 居中大圆角容器 + 关闭按钮 + 标题区 + 可选工具条 + 可滚动主体 + 可选底部操作区。
 * 之前模型弹窗与扩展弹窗各自复制了一份同样的骨架，这里收敛为一个父组件。
 *
 * **必须 portal 到 body**：本外壳常从左侧创建栏内部打开，留在创建栏 DOM 里时，
 * 会被后续渲染的中间图片显示区 / 右侧图片集合区按 DOM 顺序压在下面；
 * 固定定位与 z-index 只有在顶层（body 直下）才按预期覆盖整个应用。
 */
export function ResourceDialogShell({
  open,
  title,
  titleId,
  description,
  titleAccessory,
  toolbar,
  children,
  footer,
  onOpenChange,
  closeLabel,
  bodyClassName,
  bodyPadded = true,
  bodyScroll = true,
}: ResourceDialogShellProps) {
  const { t } = useTranslation();
  const isHydrated = useIsHydrated();
  /**
   * 与图片详情页一致：< xl 时占右侧主区，>= xl 才是居中弹窗。
   *
   * 这里用「首帧就取值」的变体：本外壳只在 `open && isHydrated` 时渲染，
   * 用 `useMediaQuery` 会白渲染一帧**满屏的紧凑变体**再翻成居中弹窗
   * （且入场动画只在居中变体上，观感就是「先满屏后缩放」，见 hook 注释）。
   */
  const isCompact = !useMediaQueryAfterHydration("(min-width: 1280px)");
  const navExpanded = useSidebarStore((state) => state.expanded);
  const hasDesktopNav = useMediaQueryAfterHydration("(min-width: 768px)");
  const navOffset = hasDesktopNav
    ? navExpanded
      ? SIDEBAR_WIDTH_EXPANDED
      : SIDEBAR_WIDTH_COLLAPSED
    : 0;
  // 可选文案的回退值放在这里而不是解构默认值：默认值在 hook 之外求值，拿不到 t
  const closeLabelText = closeLabel ?? t("common.close");

  // Esc 关闭 + 锁定页面滚动
  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onOpenChange, open]);

  if (!open || !isHydrated) return null;

  return createPortal(
    <>
      {/** 主区子页形态不需要遮罩：左侧导航本来就该保持可用且可见 */}
      {isCompact ? null : (
        <div
          className="fixed inset-0 z-[89] bg-black/50"
          aria-hidden
          onClick={() => onOpenChange(false)}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-resource-dialog={titleId}
        className={cn(
          /**
           * 窄屏（< xl，与右侧图库栏同一个断点）占右侧主区，保留左侧导航，
           * 用标题栏的返回箭头退出；宽屏才缩成居中的大圆角弹窗。
           */
          "z-[90] flex flex-col gap-0 overflow-hidden bg-background outline-none dark:bg-muted",
          isCompact
            ? "fixed inset-y-0 right-0 motion-none"
            : cn(
                "fixed left-1/2 top-1/2 h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)] w-[calc(100vw-6rem)] max-w-[calc(100vw-6rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border px-0 pb-0 pt-6 shadow-lg duration-200",
                THIN_BORDER_CLASS
              )
        )}
        style={
          isCompact
            ? {
                left: navOffset,
                paddingTop: "max(1rem, env(safe-area-inset-top))",
                paddingBottom: "env(safe-area-inset-bottom)",
              }
            : {
                paddingTop: "max(1rem, env(safe-area-inset-top))",
                paddingBottom: "env(safe-area-inset-bottom)",
              }
        }
      >
        {isCompact ? (
          <div
            className={cn(
              "flex shrink-0 items-center gap-2 border-b px-2 py-2",
              THIN_DIVIDER_CLASS
            )}
          >
            <button
              type="button"
              data-resource-dialog-back
              aria-label={closeLabelText}
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h2
                id={titleId}
                className="min-w-0 truncate text-sm font-semibold leading-tight"
              >
                {title}
              </h2>
              {description ? (
                <p className="truncate text-[11px] text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
            {titleAccessory}
          </div>
        ) : (
          <>
            <button
              type="button"
              aria-label={closeLabelText}
              onClick={() => onOpenChange(false)}
              className="absolute right-4 top-4 z-[200] rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex shrink-0 flex-col space-y-1.5 px-6 pb-2 text-left">
              <div className="flex items-center gap-4">
                <h2
                  id={titleId}
                  className="min-w-0 text-lg font-semibold leading-none tracking-tight"
                >
                  {title}
                </h2>
                {titleAccessory}
              </div>
              {description ? (
                <div className="text-xs text-muted-foreground">{description}</div>
              ) : null}
            </div>
          </>
        )}

        {toolbar ? (
          <div
            className={cn(
              "shrink-0 border-b px-3 xl:px-6",
              THIN_DIVIDER_CLASS,
              "dark:border-gray-700",
              /**
               * 紧凑形态给控件抬一个**最小高度**：字号档 `sm` 那一档是 `h-7`（28px），
               * 而紧凑形态下工具栏就是整块面板的顶栏（还常常是主操作），28px 偏小。
               * 只抬下限、不改字体：字号档是用户的持久化偏好
               * （`userData.resourceDialogFontSize`），不该被版式覆盖。
               */
              isCompact && "[&_button]:min-h-9 [&_input]:min-h-9"
            )}
          >
            {toolbar}
          </div>
        ) : null}

        <div
          className={cn(
            "min-h-0 flex-1",
            bodyScroll ? "overflow-y-auto" : "overflow-hidden",
            bodyPadded && "px-3 pb-3 pt-6 xl:px-6",
            bodyClassName
          )}
        >
          {children}
        </div>

        {footer ? (
          <div
            className={cn(
              "shrink-0 border-t px-3 py-3 xl:px-6",
              THIN_DIVIDER_CLASS,
              "dark:border-gray-700"
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </>,
    document.body
  );
}

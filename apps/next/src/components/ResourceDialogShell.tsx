"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, X } from "lucide-react";
import { useIsHydrated } from "@/hooks/useIsHydrated";
import { useMediaQueryAfterHydration } from "@/hooks/useMediaQuery";
import { useTranslation } from "@/i18n";
// 创建页主区宿主由路由父组件提供；共享外壳不直接依赖 CreatePage 的局部状态。
// 这个依赖仅改变挂载位置和可见性，不改变资源页的 children、toolbar 或 footer 契约。
import { useCreateMainPage } from "@/hooks/use-create-main-page";
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
  /**
   * 可选的 main 实测左边界：使用新版窄导航的页面可修正历史固定导航宽度。
   * 仅影响紧凑 body 分支，创建页宿主和宽屏居中弹窗继续由原容器决定几何。
   * 调用方须订阅真实布局变化，不能把首次读到的宽度当作永久值。
   */
  compactLeft?: number;
};

/**
 * 资源类弹框的统一外壳（模型选择器 / 扩展选择器 / 角色库详情共用）：
 * 遮罩 + 居中大圆角容器 + 关闭按钮 + 标题区 + 可选工具条 + 可滚动主体 + 可选底部操作区。
 * 之前模型弹窗与扩展弹窗各自复制了一份同样的骨架，这里收敛为一个父组件。
 *
 * 创建单栏通过父容器宿主替换 main 内容；两栏及以上恢复原 body 弹窗。
 * 宿主在隐藏的工作区之外，避免左侧创建栏的裁切与层级影响工具页面。
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
  // 未传时保持原有非创建页面的导航宽度回退，不强制改动全部资源工具。
  // Agent 传入当前 main 的实际边界，防止 CSS 缩窄 nav 后仍留下旧宽度空白。
  // 宽屏分支不读取该值，避免偏移居中对话框。
  compactLeft,
}: ResourceDialogShellProps) {
  const { t } = useTranslation();
  const isHydrated = useIsHydrated();
  // 等 hydration 后再登记主区页面，与原外壳允许 portal 渲染的条件保持一致。
  // 否则 SSR 尚未绘制工具内容时就隐藏工作区，会留下空白 main。
  // 同一外壳可来自创建页表单或其嵌套资源页，因此宿主判断必须由统一 hook 提供。
  // host 为空时继续走原 body 弹窗路径，避免改变角色管理等非创建页面。
  const mainPage = useCreateMainPage(open && isHydrated);
  /**
   * 创建单栏由主容器决定几何，使用带返回按钮的紧凑页头。
   * 创建页外与图片详情一致：< xl 占右侧主区，>= xl 使用居中弹窗。
   *
   * 这里用「首帧就取值」的变体：本外壳只在 `open && isHydrated` 时渲染，
   * 用 `useMediaQuery` 会白渲染一帧**满屏的紧凑变体**再翻成居中弹窗
   * （且入场动画只在居中变体上，观感就是「先满屏后缩放」，见 hook 注释）。
   */
  const isNarrowViewport = !useMediaQueryAfterHydration("(min-width: 1280px)");
  // 媒体查询 hook 必须无条件执行，不能藏在 host 的短路表达式后。
  // 宿主出现或卸载会改变分支，但 React hook 的调用顺序必须始终相同。
  // 创建页的宽度规则优先：达到两栏即使用居中弹窗，不能再按窗口 1280px 强制换页。
  // 非创建页面继续沿用既有视口分支，避免改变角色管理等共享入口。
  // 读取 hook 的能力标记，不再用路由字符串或独立窗口宽度重复推算可用空间。
  const isCompact = Boolean(mainPage.host) || (!mainPage.inCreate && isNarrowViewport);
  const navExpanded = useSidebarStore((state) => state.expanded);
  const hasDesktopNav = useMediaQueryAfterHydration("(min-width: 768px)");
  const navOffset = hasDesktopNav
    ? navExpanded
      ? SIDEBAR_WIDTH_EXPANDED
      : SIDEBAR_WIDTH_COLLAPSED
    : 0;
  // 可选文案的回退值放在这里而不是解构默认值：默认值在 hook 之外求值，拿不到 t
  const closeLabelText = closeLabel ?? t("common.close");

  // Esc 只由当前可见的资源页处理，隐藏的分类页不应同时响应详情页的退出操作。
  // 嵌套页入栈后 active 改变，effect 先卸载旧监听，再由新的栈顶接管键盘事件。
  // 关闭仍经原 onOpenChange 回到调用者，外壳不直接提交或重置选择草稿。
  // 保留旧 body 弹窗的滚动锁；栈顶切换时恢复之前的 overflow，避免锁叠加泄漏。
  // 路由离开或组件卸载也走 cleanup，而不依赖用户一定点击返回按钮。
  // active 和 host 都纳入依赖，保证打开中的页面从 body 转入宿主时同步更新监听。
  // 主区页仍复用原键盘关闭回调，但不设置 aria-modal，应用导航不属于被禁用背景。
  // 资源版本页使用捕获阶段处理 Escape，确保它能优先消费内层返回操作。
  // 数据加载失败不会触发关闭，错误态继续由 children 在同一主区展示。
  // 主区切换不创建新的资源实例，因此外层搜索词和选择草稿仍在来源组件中。
  // host 分支保留 footer 的原回调，布局变化不会把取消误变成确认。
  // 创建单栏页头使用紧凑分支的返回按钮，不同时显示居中弹窗的绝对定位 X。
  // 横向边界从宿主继承，不再叠加 navOffset，避免左侧出现双倍导航留白。
  // 纵向也继承 main，不能再加窗口标题栏偏移，否则下边缘会越过状态栏。
  // 主体原有 overflow-y-auto 继续处理长列表，页头和确认区域不随列表滚出。
  // 非创建页的遮罩点击仍调用同一关闭回调，兼容路径不改资源选择协议。
  useEffect(() => {
    if (!open || (mainPage.host && !mainPage.active)) return;

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
  }, [mainPage.active, mainPage.host, onOpenChange, open]);

  if (!open || !isHydrated) return null;

  return createPortal(
    <>
      {/** 主区子页形态不需要遮罩：左侧导航本来就该保持可用且可见 */}
      {isCompact ? null : (
        <div
          data-resource-backdrop
          className="fixed inset-0 z-[89] bg-black/50"
          aria-hidden
          onClick={() => onOpenChange(false)}
        />
      )}

      <div
        role="dialog"
        aria-modal={mainPage.host ? undefined : true}
        aria-labelledby={titleId}
        data-resource-dialog={titleId}
        data-resource-main-page={Boolean(mainPage.host) || undefined}
        hidden={Boolean(mainPage.host) && !mainPage.active}
        className={cn(
          /**
           * 主区页是正常文档流节点，百分比尺寸继承父级，不保留 fixed 的窗口坐标。
           * z-index 仅对 body 弹窗有意义；主区页由父组件切换内容，而不是靠层级盖住表单。
           * min-h-0/min-w-0 允许内部网格缩小，超出的资源卡片交给主体滚动区处理。
           * hidden 属性配合 hidden 类移除非栈顶页，防止 flex 类覆盖浏览器的 hidden 默认规则。
           * 原选择器仍挂载，因此返回嵌套页面时筛选、滚动位置和未确认选择不丢失。
           * body 回退保留原先的两种几何：窄屏右侧主区、宽屏居中资源弹窗。
           * 两条回退分支仍使用原有 navOffset，不将创建页父容器的边距硬编码到共享外壳。
           * 主区页不增加独立边框与阴影，页面背景填满宿主且不会露出创建表单的边缘。
           */
          "flex flex-col gap-0 overflow-hidden bg-background outline-none dark:bg-muted",
          // 主区替换没有浮层入场缩放，避免动画改变父容器的几何边界。
          // 全局 role=dialog 动画会短暂应用 scale；真实主区测量因此必须明确退出该规则。
          // motion-none 只用于有宿主的页面，非创建路由保留原弹窗入场效果。
          mainPage.host && "motion-none",
          mainPage.host && !mainPage.active && "hidden",
          mainPage.host ? "h-full w-full min-h-0 min-w-0" : isCompact
            ? "fixed z-[90] inset-y-0 right-0 motion-none"
            : cn(
                "fixed z-[90] left-1/2 top-1/2 h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)] w-[calc(100vw-6rem)] max-w-[calc(100vw-6rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border px-0 pb-0 pt-6 shadow-lg duration-200",
                THIN_BORDER_CLASS
              )
        )}
        style={
          mainPage.host ? undefined : isCompact
            ? {
                // 实测 main 优先，仅影响紧凑布局，不额外叠加 nav 的历史常量。
                // 零是移动端有效边界，因此必须用 ?? 而不是 ||。
                // navOffset 保留给没有新几何信息的旧调用者。
                left: compactLeft ?? navOffset,
                top: "var(--window-chrome-height)",
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
    // Portal 改变 DOM 位置但保留 React 所有权，原组件的回调和选择状态仍然有效。
    // 宿主是隐藏工作区的兄弟节点，不能把 portal 放回隐藏的表单子树。
    // body 只作为非创建路由的兼容回退，不再是创建页资源工具的默认目标。
    mainPage.host ?? document.body
  );
}

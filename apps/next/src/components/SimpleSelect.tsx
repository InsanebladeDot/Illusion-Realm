"use client";

/** 统一下拉外观与交互，调用方只提供选项和值，不再依赖系统原生菜单样式。 */
// Portal 像把菜单放到柜台外侧，避免被滚动容器的边框裁掉；数据仍属于当前控件。
// 原业务的值转换、保存和请求由 onChange 负责，本组件只通知用户选择。
import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { INPUT_BORDER_CLASS, THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

export type SimpleSelectOption = {
  value: string;
  label: string;
  // 字体选择保留原字体预览；分类标题由数据声明，不单独复制一份菜单。
  group?: string;
  style?: CSSProperties;
  disabled?: boolean;
};

// 额外按钮属性保留原 id、数据定位、焦点和标题；不伪造原生 select 的 change 事件。
// className 继续控制外层布局，triggerClassName 只控制按钮表面。
// disabled 与自动聚焦是旧原生控件的真实能力，迁移不能只保留颜色。
type SimpleSelectProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value" | "onChange" | "children"> & {
  value: string;
  options: SimpleSelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
  optionClassName?: string;
  chevronClassName?: string;
  checkClassName?: string;
  panelClassName?: string;
  variant?: "default" | "pill";
  portal?: boolean;
};

export function SimpleSelect({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  triggerClassName,
  optionClassName,
  chevronClassName,
  checkClassName,
  panelClassName,
  variant = "default",
  portal = false,
  disabled = false,
  ...triggerProps
}: SimpleSelectProps) {
  const [open, setOpen] = useState(false);
  // 挂载目标是展示状态，在打开事件中读取，而不在渲染阶段读取 ref。
  // 同一个实例若从普通页移到原生弹窗，下一次打开会重新确认所在层。
  const [portalHost, setPortalHost] = useState<Element | null>(null);
  const [panelRect, setPanelRect] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // 操作中途被外部锁定时关闭菜单，解锁后不能突然恢复旧浮层。
  // 这是同一组件内部的同步状态纠正，不等待一个卸载后的异步回调。
  if (disabled && open) setOpen(false);

  const selected = options.find((option) => option.value === value);

  const updatePanelRect = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    // 上下空间择优，长菜单在窗口底部向上展开；边缘留白防止描边被裁掉。
    // 高度是当前可用空间，不硬套一个比窗口还高的列表。
    // 左边界按实际窗口夹住；缩窄以后也不能把整个菜单推出屏幕。
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const height = Math.max(32, Math.min(216, panelRef.current?.scrollHeight ?? 216, Math.max(below, above)));
    const down = below >= Math.min(216, above);
    setPanelRect({
      top: down ? rect.bottom + 6 : Math.max(6, rect.top - height - 6),
      left: Math.max(6, Math.min(rect.left, window.innerWidth - rect.width - 6)),
      width: Math.min(rect.width, window.innerWidth - 12),
      maxHeight: height,
    });
  };

  useLayoutEffect(() => {
    if (!open || !portal) return;
    updatePanelRect();
    window.addEventListener("resize", updatePanelRect);
    window.addEventListener("scroll", updatePanelRect, true);
    return () => {
      window.removeEventListener("resize", updatePanelRect);
      window.removeEventListener("scroll", updatePanelRect, true);
    };
  }, [open, portal]);

  // 菜单打开后把焦点放到已选项，键盘用户可立刻继续上下移动。
  // 没有已选值时从首个可用选项开始；禁用项不成为导航落点。
  // 关闭只结束本控件，不触发外层表单提交或清空已有值。
  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)') ?? panel?.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus();
  }, [open]);

  // 原生 select 的方向键能力在自定义菜单中要明确保留。
  // 菜单内只改变焦点，回车/空格由原生按钮确认，浏览选项不会提前写入业务值。
  // Home/End 到达两端，Tab 退出时关菜单，Escape 由下面捕获监听处理。
  // 不使用 document 的第一个 listbox，多实例只能移动自己的选项。
  const handleKeys = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Tab") { setOpen(false); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    if (!open) {
      setPortalHost(event.currentTarget.closest("dialog[open]") ?? document.body);
      setOpen(true);
      return;
    }
    const buttons = [...(panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const index = buttons.findIndex(button => button === document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
    buttons[next]?.focus();
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current?.contains(target) ||
        (portal &&
          panelRef.current?.contains(target))
      ) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // 捕获 Escape 后仅关闭菜单，不让同一按键顺便关闭背后的资源弹窗。
      // 焦点回到原按钮，用户不用重新从页面顶部寻找刚才的控件。
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, portal]);

  // 显式禁用时即使之前已打开也不呈现可点菜单，生成锁不留下可写入的 Portal。
  // 外部点击只接受本实例的 panelRef，点击另一个下拉不会被当成本菜单内部。
  // 每次重新打开都测量矩形，滚动和尺寸变化继续沿用原有订阅及清理。
  const panel = open && !disabled ? (
    <div
      ref={panelRef}
      onKeyDown={handleKeys}
      data-simple-select-panel
      role="listbox"
      id={listboxId}
      className={cn(
        "overflow-hidden rounded-xl bg-background/95 p-1 shadow-lg backdrop-blur-sm",
        portal ? "fixed z-[100]" : "absolute left-0 right-0 top-full z-50 mt-1.5",
        THIN_BORDER_CLASS,
        panelClassName
      )}
      style={
        portal && panelRect
          ? {
              top: panelRect.top,
              left: panelRect.left,
              width: panelRect.width,
            }
          : undefined
      }
    >
      <div style={portal && panelRect ? { maxHeight: panelRect.maxHeight - 8 } : undefined} className="max-h-52 overflow-y-auto [scrollbar-width:thin]">
        {options.map((option, index) => {
          const isSelected = option.value === value;
          return <div key={option.value || "__empty__"}>
            {/* 下拉菜单：同一分类只在首个选项前显示标题，字体组不会丢失原分区。 */}
            {option.group && option.group !== options[index - 1]?.group && <p className="px-2 py-1 text-[11px] text-muted-foreground">{option.group}</p>}
            <button
              key={option.value || "__empty__"}
              type="button"
              role="option"
              data-simple-select-option={option.value}
              aria-selected={isSelected}
              disabled={option.disabled}
              style={option.style}
              onClick={() => {
                // 状态变化只回传真实选项值，不补造 event.target 或调用原生 setter。
                // 选择后回到当前按钮，长列表 Portal 不留下不可见焦点。
                if (disabled || option.disabled) return;
                onChange(option.value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left font-medium transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none disabled:opacity-40",
                variant === "pill" ? "text-xs" : "text-sm",
                optionClassName,
                isSelected && "bg-muted/70 text-foreground"
              )}
            >
              <span className="min-w-0 truncate">{option.label}</span>
              {isSelected && (
                <Check
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-foreground/80",
                    checkClassName
                  )}
                />
              )}
            </button>
          </div>;
        })}
      </div>
    </div>
  ) : null;

  return (
    <div data-simple-select ref={containerRef} className={cn("relative", className)}>
      <button
        {...triggerProps}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onKeyDown={handleKeys}
        data-simple-select-value={value}
        aria-haspopup="listbox"
        aria-expanded={open && !disabled}
        aria-controls={listboxId}
        aria-label={ariaLabel ?? triggerProps["aria-label"]}
        onClick={(event) => {
          // 用实际触发节点寻找顶层容器，Portal 后代不能误作下一次定位来源。
          // 仅操作当前控件的状态，另一个实例的挂载目标与开关保持独立。
          setPortalHost(event.currentTarget.closest("dialog[open]") ?? document.body);
          setOpen((previous) => !previous);
        }}
        className={cn(
          "flex w-full min-w-0 items-center justify-between gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:cursor-not-allowed disabled:opacity-40",
          variant === "pill"
            ? "min-w-[120px] max-w-[min(100%,220px)] shrink rounded-full border-0 bg-muted px-3 font-medium text-foreground hover:bg-muted/80 dark:bg-gray-700 dark:hover:bg-gray-600/90"
            : cn(
                "rounded-lg bg-background px-3 text-sm shadow-none hover:bg-accent/40 focus:ring-1 focus:ring-ring",
                INPUT_BORDER_CLASS,
                "h-8"
              ),
          triggerClassName
        )}
      >
        <span className="min-w-0 truncate text-left">
          {selected?.label ?? options[0]?.label ?? ""}
        </span>
        <ChevronDown
          className={cn(
            "shrink-0 text-muted-foreground transition-transform duration-200",
            chevronClassName ?? "h-3.5 w-3.5",
            open && "rotate-180"
          )}
        />
      </button>

      {!portal && panel}
      {portal &&
        typeof document !== "undefined" &&
        panel &&
        // 原生 dialog 的顶层显示会遮住 body 上的浮层，菜单必须留在该 dialog 内。
        // 像在同一个玻璃展柜里展开说明页，不能把说明页放到展柜背面。
        // 普通资源外壳仍挂 body；坐标依旧来自触发器的实际窗口位置。
        createPortal(panel, portalHost ?? document.body)}
    </div>
  );
}

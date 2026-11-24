"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { IMAGE_COUNT_OPTIONS } from "@/data/createForm";
import { useTranslation } from "@/i18n";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type ImageCountDropdownProps = {
  value: number;
  disabled?: boolean;
  onChange: (count: number) => void;
  // 音频复用数量菜单时只更换媒介名称，选项仍使用原有 ×N。
  // 未传入时继续使用图片词条，旧调用不改变可访问名称。
  // 参数不参与菜单状态或生成执行，避免把展示控件耦合到某个 store。
  quantityLabel?: string;
  // 只注入合法数量目录；列表定位、选中、关闭和原菜单按钮均不复制。
  // 创建页仍用原1/2/3/4，画布用自身契约的1/2/4/6，不能只过滤回调却展示不可保存选项。
  options?: readonly { count: number; label: string }[];
};

// 公开可选媒介标签，使同一数量菜单能用于图片和音频生成。
// 标签按当前语言从宿主传入，不根据任务数据猜测媒体类型。
// 当前数量、展开位置、关闭机制和回传值均保持原实现。
// options 用于表达当前业务允许的数量，不是根据媒体名自动猜的范围。
// 普通创建页仍保留一二三四，不能因画布有六张就扩大全局合法选项。
// 画布只允许一二四六，不能展示三张后再在确认回调静默拒绝保存。
// label 是已准备的显示内容，count 才是交回宿主的业务数值。
// readonly 表示本菜单不能通过排序或插入修改调用方共享的选项目录。
// 菜单继续使用原 count 作为稳定项身份，文案切换不会错用上一项选中态。
// 当前 value 不在目录时不能自动写回第一项，读取不是一次用户确认。
// 原定位函数仍按真实触发器与菜单几何决定上下展开，不复制画布专属坐标。
// 父级原生成底栏不裁剪溢出，向上展开的菜单不会被按钮圆角截掉。
// 外部点击和 Escape 的关闭机制沿用同一实现，不增加全局重复监听。
// 本组件只回传选择，不触发生成请求，也不创建一张空结果卡。
// 数量文字不作为文件名或工作流身份，展示和运行参数保持分离。
export function ImageCountDropdown({ value, onChange, quantityLabel, options = IMAGE_COUNT_OPTIONS, disabled = false }: ImageCountDropdownProps) {
  const { t } = useTranslation();
  const [expanded, setOpen] = useState(false);
  // 锁定时立即撤下已打开的选项，解锁后仍需由用户重新打开。
  if (disabled && expanded) setOpen(false);
  const open = expanded && !disabled;
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePlacement = useCallback(() => {
    const trigger = containerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const triggerRect = trigger.getBoundingClientRect();
    const menuHeight = menu.offsetHeight;
    const gap = 4;
    const spaceBelow = window.innerHeight - triggerRect.bottom - gap;
    const spaceAbove = triggerRect.top - gap;

    if (spaceBelow < menuHeight && spaceAbove >= menuHeight) {
      setPlacement("top");
      return;
    }

    setPlacement("bottom");
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePlacement();
  }, [open, updatePlacement]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleReposition = () => updatePlacement();

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, updatePlacement]);

  return (
    // 数量入口是渐变按钮组的独立右段，根节点随主按钮拉伸到同一高度。
    // 竖线使用20px伪元素垂直居中，只作装饰，不占据可点击内容或整条高度。
    // 不裁剪根容器；菜单继续按原测量结果向上或向下展开。
    <div ref={containerRef} data-image-count-control className="relative flex shrink-0 self-stretch before:pointer-events-none before:absolute before:left-0 before:top-1/2 before:h-5 before:w-px before:-translate-y-1/2 before:bg-white/35 before:content-['']">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        // 视觉只保留×N，读屏使用宿主媒介名，默认保持原有“图片”词条。
        // aria-label 包含当前值，选完后即反映新数量，无需引入重复状态。
        // 标记供回归明确点击右段，不能以整个生成组替代数量选择。
        // 乘号保留标准文本字符，避免原X图标被误认为关闭任务的操作。
        // 可见文案省去媒介名，语义名称仍解释本控件当前调整的对象。
        // 右段不绑定生成回调，选择四个选项之一只更新父组件的数量状态。
        // trigger仍是普通button，键盘Enter和Space沿用浏览器默认激活行为。
        // 根节点定位菜单，按钮自身无需绝对定位，因此高度随左侧操作自然一致。
        // 声音任务不能被读成图片数量，省略标签的图片模式仍走原词条。
        // 可见区域继续只显示 ×N，媒介名称只用于读屏。
        // 选项更新后 aria-label 与真实 value 同步，不维护额外标签缓存。
        aria-label={`${quantityLabel ?? t("create.imageCountDropdown.imageLabel")} × ${value}`}
        data-image-count-trigger
        onClick={() => setOpen((prev) => !prev)}
        // 右段继承公共渐变，不再绘制原胶囊描边、独立底色或“图片”标签。
        // 独立焦点轮廓留在组内，键盘能够区分生成和数量这两个动作。
        // 保持足够的水平点击余量，同时让左侧生成文案使用剩余宽度。
        className="flex items-center justify-center gap-1 rounded-r-xl px-4 text-sm disabled:opacity-50 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white"
      >
        {/* 界面：右段「× N」保留数量选择功能；乘号不是关闭按钮。 */}
        <span className="whitespace-nowrap tabular-nums">× {value}</span>
        <ChevronDown
          className={cn(
            "ml-0.5 h-3 w-3 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          className={cn(
            // 菜单右边缘与数量段对齐，窄屏不会从按钮右侧伸出展示区。
            // 菜单仍使用popover主题，不能继承按钮白字造成浅色菜单不可读。
            // 仅改变锚点，原有选项、选中标记和点击外部关闭机制保持不变。
            "absolute right-0 z-[9999] min-w-[75px] overflow-hidden rounded-md bg-popover p-1 text-foreground shadow-md",
            THIN_BORDER_CLASS,
            placement === "bottom" ? "top-full mt-1" : "bottom-full mb-1"
          )}
        >
          {options.map((option) => {
            const selected = option.count === value;

            return (
              <button
                key={option.count}
                // 用真实数量标识选项，布局回归不依赖英文x1等显示字符串。
                // 选择仍回传原option.count，不能从格式化后的文本再解析数字。
                // 此标记只用于定位，不改变既有menuitem角色或点击处理。
                data-image-count-option={option.count}
                type="button"
                role="menuitem"
                onClick={() => {
                  onChange(option.count);
                  setOpen(false);
                }}
                className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <div className="flex w-full items-start gap-2">
                  <div className="w-3.5 pt-0.5">
                    {selected && (
                      <Check
                        className="h-3 w-3 text-foreground dark:text-zinc-100"
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-1 text-left">
                    <span className="font-semibold">{option.label}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import { THIN_BORDER_CLASS } from "@/utils/layout";

type SimpleNumberComboboxProps = {
  value: number;
  /** 预设值（下拉列表） */
  options: readonly number[];
  /** 推荐值：下拉中标注「推荐」 */
  recommended?: number;
  min: number;
  max: number;
  /** 单位后缀，如「帧/秒」 */
  unit?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  onChange: (value: number) => void;
};

/**
 * 可输入的数字下拉框（简约风格）：
 * - 左侧是**输入框**，可直接键入自定义数值（超出范围自动夹取到 min–max，失焦/回车提交）
 * - 右侧 **↓** 图标展开预设列表，点选即生效
 * - 点击外部或按 Esc 关闭
 */
export function SimpleNumberCombobox({
  value,
  options,
  recommended,
  min,
  max,
  unit,
  ariaLabel,
  disabled = false,
  className,
  onChange,
}: SimpleNumberComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  /** 输入中的原始文本；null 表示未编辑，直接展示外部值 */
  const [draft, setDraft] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const display = draft ?? String(value);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const clamp = (input: number) => Math.min(max, Math.max(min, Math.round(input)));

  /** 提交输入框内容：非法则回退，超范围则夹取 */
  const commit = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    setDraft(null);
    if (!Number.isFinite(parsed)) return;
    const next = clamp(parsed);
    if (next !== value) onChange(next);
  };

  const selectOption = (option: number) => {
    setDraft(null);
    onChange(option);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex h-10 items-stretch overflow-hidden rounded-lg border bg-white transition-colors focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20",
          "border-gray-300",
          disabled && "opacity-60"
        )}
      >
        <input
          id="gif-fps"
          type="text"
          inputMode="numeric"
          role="combobox"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={ariaLabel}
          disabled={disabled}
          value={display}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ""))}
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-3 text-sm focus:outline-none"
        />
        {unit && (
          <span className="flex items-center pr-1 text-xs text-gray-400">{unit}</span>
        )}
        <button
          type="button"
          aria-label={t("components.simpleNumberCombobox.expandPresets")}
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((previous) => !previous)}
          className="flex w-9 shrink-0 items-center justify-center border-l border-gray-200 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      </div>

      {open && (
        <div
          id={panelId}
          role="listbox"
          className={cn(
            "absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl bg-white p-1 shadow-lg",
            THIN_BORDER_CLASS
          )}
        >
          <div className="max-h-56 overflow-y-auto">
            {options.map((option) => {
              const isSelected = option === value;
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => selectOption(option)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-gray-100",
                    isSelected && "bg-gray-100 font-medium"
                  )}
                >
                  <span className="tabular-nums">{option}</span>
                  <span className="flex items-center gap-2">
                    {option === recommended && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                        {t("components.simpleNumberCombobox.recommended")}
                      </span>
                    )}
                    {isSelected && <Check className="h-3.5 w-3.5 text-gray-700" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

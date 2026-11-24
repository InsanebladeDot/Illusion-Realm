"use client";

/** 工作流枚举复用公共下拉；悬浮层脱离滚动容器，值仍原样交给调用方保存。 */
import { SimpleSelect } from "@/components/SimpleSelect";
import type { SamplerOption } from "@/data/createForm";

interface OptionSelectProps {
  value: string;
  options: readonly SamplerOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}

export function OptionSelect({ value, options, onChange, ariaLabel, className }: OptionSelectProps) {
  // 兼容旧工程里清单外的值，不静默替换成当前清单首项。
  // 定位、窗口边界、键盘和关闭清理都由同一个 SimpleSelect 负责。
  return <SimpleSelect
    value={value}
    fallbackLabel={value}
    options={[...options]}
    onChange={onChange}
    ariaLabel={ariaLabel}
    className={className}
    data-option-value={value}
    chevronClassName="h-4 w-4"
    portal
  />;
}

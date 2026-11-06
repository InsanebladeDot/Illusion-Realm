"use client";

/** 资料库展示切换：只改变布局，选择、收藏和分页仍由外层管理。 */
// 角色和静态标签库传入同一组参数，不能分别维护两套图标和激活态。
// 就像换相册的排版，不会因为换成文字目录就丢掉已经夹好的书签。
import { Grid2X2, List } from "lucide-react";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";

// 仅声明两个已经存在的视图，不用任意字符串掩盖非法展示模式。
// 此类型可被卡片和工具栏共同使用，名称不依赖角色或画师业务。
export type LibraryDisplayMode = "card" | "text";

interface LibraryDisplaySwitchProps {
  prefix: string;
  value: LibraryDisplayMode;
  onChange: (mode: LibraryDisplayMode) => void;
}

// value 受控：切换后卡片表面与按钮的 aria-pressed 使用同一来源。
// prefix 保留原 data-pose-display-mode 等定位入口，多个弹窗不会串状态。
// 按钮均为 type=button，放在任何表单里也不会意外提交生成。
// 文字和图标都来自原静态库工具栏，只把共性移到公共层。
// 不在这里持久化，关闭再打开的默认模式由各资料库原有规则决定。
export function LibraryDisplaySwitch({ prefix, value, onChange }: LibraryDisplaySwitchProps) {
  const { t } = useTranslation();
  return <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label={t("characters.tagLibrary.displayModeLabel")}>
    {/* modal：卡片/文本开关与排序、多选同排，窄窗口跟随公共工具栏换行。 */}
    {(["card", "text"] as const).map(mode => <button type="button" key={mode} {...{ [`data-${prefix}-display-mode`]: mode }} aria-pressed={value === mode} onClick={() => onChange(mode)} className={cn("flex h-8 items-center gap-1 px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent-stroke", value === mode ? "bg-muted text-foreground" : "bg-background text-muted-foreground hover:bg-muted")}>
      {mode === "card" ? <Grid2X2 size={14} /> : <List size={14} />}{t(mode === "card" ? "characters.tagLibrary.cardMode" : "characters.tagLibrary.textMode")}
    </button>)}
  </div>;
}

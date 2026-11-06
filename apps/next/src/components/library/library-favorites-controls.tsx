"use client";

/** 各资料库共用收藏入口与 JSON 导出，筛选状态仍从当前弹窗参数注入。 */
// 查看收藏不等于只看已选，取消整个选择弹窗也不会撤回已保存收藏。
// 所有库点击导出均汇总同一份收藏，不按当前页悄悄截断导出内容。
import { Download, Heart } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { exportLibraryFavorites } from "@/utils/export-library-favorites";
import { cn } from "@/utils/cn";

interface LibraryFavoritesControlsProps {
  prefix: string;
  count: number;
  active: boolean;
  onToggle: () => void;
}

// 收藏数来自完整本库集合，不能只计算当前网格的心形图标数量。
// 导出是显式同步操作，异常就地提示，不把下载请求当成系统写盘已完成的证明。
// 读写权限或磁盘问题仍由系统下载流程报告，这里不显示“已保存到某路径”。
// 可用的空收藏依然能导出一个合法空文件，用户可核对备份格式。
// 收藏过滤按钮使用 aria-pressed，键盘和读屏都能知道当前浏览状态。
export function LibraryFavoritesControls({ prefix, count, active, onToggle }: LibraryFavoritesControlsProps) {
  const { t } = useTranslation();
  const showToast = useToastStore(state => state.show);
  const handleExport = () => {
    try { exportLibraryFavorites(); }
    catch { showToast(t("characters.favorites.exportFailed"), "error"); }
  };
  return <div className="flex items-center gap-2">
    {/* modal：收藏与导出在每个资料库相同位置，状态由各自弹窗控制。 */}
    <button type="button" {...{ [`data-${prefix}-favorites`]: true }} aria-pressed={active} onClick={onToggle} className={cn("flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs hover:bg-muted focus-visible:ring-1 focus-visible:ring-accent-stroke", active && "bg-accent/40 text-accent-text")}><Heart size={14} />{t("characters.favorites.view", { count })}</button>
    <button type="button" data-library-favorites-export onClick={handleExport} title={t("characters.favorites.exportHint")} className="flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs hover:bg-muted focus-visible:ring-1 focus-visible:ring-accent-stroke"><Download size={14} />{t("characters.favorites.export")}</button>
  </div>;
}

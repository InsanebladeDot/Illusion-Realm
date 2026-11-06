"use client";

// 分类下的模型卡片沿用原选择逻辑；创建单栏作为栈顶主区页，两栏及以上恢复原版居中弹窗。
// Portal 避免创建栏裁切，Esc 只关闭版本选择这一层并恢复原分类入口焦点。
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useCreateMainPage } from "@/hooks/use-create-main-page";
// 单栏版本页使用返回箭头；宽屏弹窗沿用关闭图标，两者都只退回分类层。
// 同一回调不提交扩展草稿，确认仍由原分类选择器负责。
// 图标不作为额外焦点入口，键盘返回继续使用现有Escape捕获监听。
import { ChevronLeft, X } from "lucide-react";
import { ResourceSelectionCard } from "./resource-selection-card";
import { getResourceDialogTypography } from "@/utils/resourceDialogFontSize";
import { useCreateFormStore } from "@/stores/useCreateFormStore";
import { useTranslation } from "@/i18n";
import { PRIMARY_BUTTON_CLASS, THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
import type { ModelCover } from "@/types/model";

interface ModelOption { key: string; name: string; label: string; cover: ModelCover }
interface Props {
  title: string; options: ModelOption[]; selectedKeys: string[];
  multiple: boolean;
  onOpenChange: (open: boolean) => void; onSelect: (key: string) => void;
}
function useNestedDialog(close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    // 页面滚动由外层 ResourceDialogShell 锁定；内层重复锁定会在同时关闭时遗留 hidden。
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key !== "Tab") return;
      const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>("button, [tabindex='0']") ?? []);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [close]);
  return ref;
}
function ModelOptionCard({ option, selected, choose }: { option: ModelOption; selected: boolean; choose: () => void }) {
  const { t } = useTranslation();
  const size = useCreateFormStore((state) => state.resourceDialogFontSize);
  const typography = getResourceDialogTypography(size);
  return <ResourceSelectionCard name={option.name} cover={option.cover} selected={selected} typography={typography}
    optionId={option.key} onPick={choose} meta={option.label !== option.name ? <span title={option.label} className="block truncate">{option.label}</span> : undefined}>
      <button type="button" data-resource-model-select className={cn("mt-3 inline-flex w-full items-center justify-center rounded-xl px-3 font-medium", typography.action, typography.actionHeight, PRIMARY_BUTTON_CLASS)}>
        {t(selected ? "create.extensionSelectDialog.selected" : "create.extensionSelectDialog.select")}
      </button>
  </ResourceSelectionCard>;
}
export function ModelVersionDialog({ title, options, selectedKeys, multiple, onOpenChange, onSelect }: Props) {
  const { t } = useTranslation();
  // 分类选择器仍挂载以保留草稿；版本页成为创建主区栈顶，返回后恢复分类筛选。
  // 此组件由 activeGroup 条件挂载，因此 true 表示当前实例在其整个生命周期内都已打开。
  // hook 在卸载时只移除本实例 id，不把仍然打开的外层资源分类页一起清空。
  // 分类页收到 active=false 后隐藏并停用 Escape，版本页捕获监听仍只关闭这一层。
  // 单选点击卡片后关闭版本页；多选保留页面，继续通过底部确认返回分类库。
  // 版本页的确认仍不是最终提交，最后由外层 resource-confirm 一次提交整个草稿。
  // 不在这里改动 options 或 selectedKeys，主区替换只改变 DOM 宿主和几何。
  // 主区宿主不增加遮罩，nav 和窗口标题栏仍可使用，不把局部选择流程标为全局模态。
  // 固定定位留给宽屏及非创建路由弹窗；主区页百分比尺寸继承 main，避免残留左侧创建栏条带。
  // motion-none 关闭通用 dialog 缩放入场，确保嵌套页面与宿主四边始终一致。
  // 外层类同时移除 max-w、居中位移和 max-h，否则即使 portal 正确仍会像居中弹窗。
  // 模型卡片网格和底部确认保持原来的 flex/scroll 分区，长版本列表只滚动主体。
  // 原 focus trap 只作用本页 ref；关闭后分类页恢复显示并恢复之前的入口焦点。
  // 页面返回不重新构造分类选择器，所以其 search、draftVersions 与滚动区域可以原样保留。
  // 没有宿主时使用原 z95 遮罩与 z96 对话框，兼容创建页外的既有资源选择场景。
  // 顶栏关闭仍调用同一个 onOpenChange(false)，主区栈不另设一条提交或取消回调。
  // 卡片封面继续由 ResourceSelectionCard 读取，版本页不复制资源图片或另造预览数据。
  // 无论按钮关闭还是路由卸载，useNestedDialog 都移除捕获监听，防止 Escape 回调泄漏。
  const mainPage = useCreateMainPage(true);
  const ref = useNestedDialog(() => onOpenChange(false));
  return createPortal(<>
    {!mainPage.host && <div data-lora-model-backdrop className="fixed inset-0 z-[95] bg-black/50" aria-hidden onClick={() => onOpenChange(false)} />}
    {/* 弹窗：分类内的主模型 / LoRA 卡片，层级高于分类库，窗口标题栏仍在最上方 */}
    <div ref={ref} role="dialog" aria-modal={mainPage.host ? undefined : true} aria-labelledby="model-version-dialog-title"
      data-model-version-main-page={Boolean(mainPage.host) || undefined}
      style={mainPage.host ? undefined : { top: "calc((100dvh + var(--window-chrome-height, 0px)) / 2)" }}
      className={cn(mainPage.host ? "motion-none flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground" : "fixed left-1/2 z-[96] flex max-h-[calc(100dvh-var(--window-chrome-height,0px)-2rem)] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-background text-foreground shadow-xl", THIN_BORDER_CLASS)}>
      {/* 界面：版本页页头；替换模式压至40px并让返回与标题共用垂直中线。 */}
      {/* 宽屏继续保留原弹窗的标题、关闭位置与内边距，不受窄屏页头规则影响。 */}
      {/* 返回只关闭本层，不清理父分类搜索、多选草稿或滚动位置。 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        {mainPage.host && <button type="button" data-resource-model-back aria-label={t("common.close")} onClick={() => onOpenChange(false)} className="inline-flex shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>}
        <h2 id="model-version-dialog-title" className="min-w-0 flex-1 truncate text-base font-semibold" title={title}>{title}</h2>
        {!mainPage.host && <button type="button" aria-label={t("common.close")} onClick={() => onOpenChange(false)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>}
      </div>
      <div data-resource-model-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {/* 界面：分类下模型网格按原版约 200px 卡片自动增列，不按窗口强制三列拉伸。 */}
      {/* 弹窗与单栏替换页共用此网格，确认/多选/返回仍由原有版本草稿控制。 */}
      {/* 卡片封面保持原比例；窄容器下仅缩小列宽，不用裁切整张卡片。 */}
      <div data-resource-version-grid className="grid auto-rows-max items-start gap-x-3 gap-y-7 p-4 pt-7">
        {options.map((option) => <ModelOptionCard key={option.key} option={option} selected={selectedKeys.includes(option.key)} choose={() => { onSelect(option.key); if (!multiple) onOpenChange(false); }} />)}
      </div>
      </div>
      {/* 界面：分类内确认只返回分类库，所有模型数据最后由外层 footer 统一提交。 */}
      <div className="shrink-0 border-t border-border px-4 py-3">
        <button type="button" data-resource-model-done onClick={() => onOpenChange(false)} className={cn("ml-auto block h-9 rounded-xl px-4 text-sm font-medium", PRIMARY_BUTTON_CLASS)}>{t("common.confirm")}</button>
      </div>
    </div>
  </>, mainPage.host ?? document.body);
}

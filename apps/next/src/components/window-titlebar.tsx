"use client";

import { useCallback, useRef, useState, useSyncExternalStore, type RefObject } from "react";
// 顶栏只直接提供外观与任务工具；通用设置统一收进账户菜单。
// 账户组件内部继续负责菜单定位和路由，顶栏无需再持有独立设置链接。
// 保留外观面板的锚点，迁移通用设置不会改变主题按钮的点击行为。
// Palette 只打开现有外观浮层；完整配置页通过账户菜单进入。
// Images 和 Download 仍分别绑定生成任务与模型下载状态。
// PanelLeft 继续控制全局导航开合，删除设置链接不改变导航状态。
// 自定义窗口控件由独立组件提供，账户菜单不能挤占右侧按钮区域。
// caption 模式保留交互区的 no-drag，账户按钮仍可正常点击。
// 菜单使用 Portal 离开标题栏裁切区域，缩窄窗口时仍能显示完整。
// 菜单内的设置复用现有路由，顶栏无需新增页面跳转副作用。
// 外观、生成、下载面板仍使用各自锚点，移除齿轮不迁移这些面板。
// 标题栏回归会从账户菜单实际进入设置页，并继续检查主区几何。
import { Download, Images, Palette, PanelLeft, RotateCw, Sparkles, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useModelLibraryLocationStore } from "@/stores/use-model-library-location-store";
import { ChevronRight, FolderTree } from "lucide-react";
// head：目录和工具说明共用门牌外壳，业务内容仍由各自组件提供。
// 漫画门牌按路由显示静态说明，不让窗口标题栏订阅画布的高频拖动状态。
// 该插槽只在现有标题栏中装配，不复制 AppShell 或窗口控制按钮。
import { WindowTitlebarContent } from "./window-titlebar-content";
import { MessageSquare } from "lucide-react";
import { AppearanceDialog } from "@/components/appearance-dialog";
import { SidebarAccountMenu } from "@/components/sidebar-account-menu";
import { ModelDownloadList } from "@/components/model-download-list";
import { WindowTaskPanel } from "@/components/window-task-panel";
import { GenerationTaskList } from "@/components/generation-task-list";
import { useGenerationTaskStore, isGenerationTaskActive } from "@/stores/useGenerationTaskStore";
import { useModelDownloadStore } from "@/stores/useModelDownloadStore";
import { useTranslation } from "@/i18n";
import { subscribeWindowChrome, windowChromeVisible } from "@/utils/window-chrome";
import { useSidebarStore } from "@/stores/useSidebarStore";
// 界面：窗口控制属于全局 head，路由切换不会创建另一套按钮。
// 独立组件负责系统订阅，任务浮层不承担窗口控制副作用。
// 与外观主题共用 DOM 绘制，避免原生 overlay 颜色更新不同步。
import { WindowCaptionControls } from "@/components/window-caption-controls";
// head：缓存入口放在外观按钮左侧，沿用原工具组的布局和拖拽边界。
// 独立按钮持有请求状态，切换路由不依赖创建页是否挂载。
// 不向标题栏引入 HTTP 或文件删除逻辑，生成和下载面板继续独立工作。
import { ComfyFreeMemoryButton } from "@/components/comfy-free-memory-button";

// 界面：将原侧栏伸缩能力移到 head，避免删除 nav 箭头后无法恢复展开状态。
function SidebarToggle() {
  const { t } = useTranslation();
  const expanded = useSidebarStore(state => state.expanded);
  const toggle = useSidebarStore(state => state.toggle);
  const label = t(expanded ? "nav.sidebar.collapse" : "nav.sidebar.expand");
  // 界面：head 的 nav 伸缩按钮；按钮状态与 nav、主内容布局共用同一个 store。
  // 与侧栏 821px 显示断点一致，768–820px 不再出现点击后看不到变化的入口。
  // 保留 window-caption-action 的 no-drag，原生鼠标点击不会变成窗口拖动。
  // 稳定的 data 标记供真实指针回归定位，不依赖中文标题或无关弹窗按钮。
  return <button type="button" data-sidebar-toggle aria-label={label} title={label} aria-expanded={expanded} onClick={toggle} className="window-caption-action ml-2 hidden h-7 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 min-[821px]:inline-flex"><PanelLeft size={16} aria-hidden="true" /></button>;
}

interface CenterProps { anchor: RefObject<HTMLButtonElement | null>; onClose: () => void }
function DownloadCenter({ anchor, onClose }: CenterProps) {
  const { t } = useTranslation();
  const tasks = useModelDownloadStore((state) => state.tasks);
  const active = tasks.filter((task) => ["downloading", "saving"].includes(task.status)).length;
  return <WindowTaskPanel id="window-download-center" title={t("toolBox.civitai.transfer.centerTitle")} description={t("toolBox.civitai.transfer.tasks", { count: active })} anchor={anchor} onClose={onClose}>
    {tasks.length ? <ModelDownloadList className="min-h-0 overflow-y-auto p-3" /> : <div className="flex flex-col items-center gap-3 px-4 py-10 text-xs text-muted-foreground"><Download size={28} aria-hidden="true" />{t("toolBox.civitai.transfer.empty")}</div>}
  </WindowTaskPanel>;
}
interface CaptionActionProps { anchor: RefObject<HTMLButtonElement | null>; kind: "download" | "generation"; label: string; count: number; open: boolean; onClick: () => void; Icon: LucideIcon }
function CaptionAction({ anchor, kind, label, count, open, onClick, Icon }: CaptionActionProps) {
  return <button ref={anchor} type="button" {...{ [`data-window-${kind}`]: true }} aria-label={label} title={label} aria-expanded={open} aria-controls={`window-${kind}-center`} aria-haspopup="dialog" onClick={onClick} className={`window-caption-action relative flex h-full w-8 shrink-0 items-center justify-center hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-stroke sm:w-[46px] ${count ? "text-foreground" : "text-muted-foreground"}`}><Icon size={17} aria-hidden="true" />{count > 0 && <span {...{ [`data-window-${kind}-count`]: true }} className="absolute right-1 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent-fill px-0.5 text-[9px] font-medium leading-none text-accent-fill-foreground">{count}</span>}</button>;
}
// head：目录门牌复用当前本地库的位置，不复制导航树或读取完整扫描索引。
// 标题栏与业务页不在同一组件分支，通过会话 store 同步最小路径段。
// 只在本地库拥有发布者时显示；切到在线库、其他工具后立刻移除。
// 路由再做一层限制，快速切换时也不让旧 effect 的目录出现在无关页面。
// 长目录整体省略但 title 完整保留，系统按钮始终获得各自固定宽度。
// 标题栏仍属于窗口拖拽区，这里没有可点击的第二套目录导航。
// 真正进入目录由主内容面包屑和左侧树负责，避免两个来源抢选中状态。
// 路径不含磁盘根，截图与窗口门牌不会显示用户的绝对模型目录。
// 宣传语在所有页面移除，本地模型库的位置仅在对应页面有实际内容。
// 窄窗隐藏门牌保留全局导航开关、账户和窗口控制，不压缩关闭按钮。
// 门牌不带按钮或链接，避免在系统拖拽区域里生成不可点击的假导航。
// head 本身不修改路由，也不反向写回页面的目录过滤条件。
// 库切换后 owner 为空时无需等待扫描，门牌可以即时消失。
// 目录层级由发布数组的顺序决定，不能按字母顺序再次排序。
// 本地模型库四字随语言状态翻译，用户自己的文件夹名保持原文。
// 嵌套目录特别长时优先保留前面的库名称，再截断后面的实际层级。
// 图标为装饰性的文件树提示，路径文本才是门牌可读内容。
// 现有 nav 开合按钮仍保留在品牌后，新增目录不创建第二个开关。
// 账户菜单和系统控件依旧在 header 末端，门牌最多占可用窗口宽度的一部分。
// 返回其他页面后只剩品牌和导航开关，不留下宣传语空槽或固定路径占位。
function ModelLibraryLocation() {
  const { t } = useTranslation(), pathname = usePathname();
  const location = useModelLibraryLocationStore();
  if (pathname !== "/tools/models/civitai" || !location.owner) return null;
  return <WindowTitlebarContent marker="model-library" title={[t("toolBox.civitai.localTitle"), ...location.segments].join(" / ")}><span data-model-library-location className="contents"><FolderTree size={15} className="shrink-0 text-primary" /><span className="shrink-0 font-medium text-primary">{t("toolBox.civitai.localTitle")}</span>{location.segments.length > 0 && <><ChevronRight size={12} className="shrink-0" /><span className="truncate text-muted-foreground">{location.segments.join(" / ")}</span></>}</span></WindowTitlebarContent>;
}
// 该组件没有订阅全体模型，扫描进度变化不会让整个窗口头反复重排。
// theme 继续由已有语义色驱动，不为目录增加浅色专用图标或背景。
// aria 采用普通文字而不是不可操作的面包屑链接，避免误导键盘用户。
// 卸载清理由发布者负责，标题栏仅消费数据，不反向清理当前页面状态。

function noWindowChrome() { return false; }
// 漫画工具没有目录扫描发布者，路由是它是否显示说明的唯一条件。
// 跳转后组件自然返回空值，无需全局注册或异步清理文字。
// 说明与页面内提示使用同一词条，语言切换时同步更新。
// 长说明在共同外壳内省略，完整文本通过 title 保留。
// 此处只展示文字，返回工具箱仍由页面上的正式链接负责。
// 不把图层数量、加载状态或文件名写入标题栏，避免隐私与高频更新。
// 图标为装饰，读屏名称由实际文本提供。
// 静态导出可以预渲染该分支，不读取浏览器文件或 Electron API。
function ToolLocation() {
  const { t } = useTranslation(), pathname = usePathname();
  if (pathname !== "/tools/image/cartoon") return null;
  return <WindowTitlebarContent marker="cartoon" title={t("dialogue.hint")}><MessageSquare size={15} className="shrink-0 text-primary" /><strong className="shrink-0 text-primary">{t("dialogue.title")}</strong><span className="truncate text-muted-foreground">{t("dialogue.hint")}</span></WindowTitlebarContent>;
}
export function WindowTitlebar() {
  const { t } = useTranslation();
  const visible = useSyncExternalStore(subscribeWindowChrome, windowChromeVisible, noWindowChrome);
  const tasks = useModelDownloadStore((state) => state.tasks);
  const active = tasks.filter((task) => ["downloading", "saving"].includes(task.status)).length;
  const generationTasks = useGenerationTaskStore((state) => state.tasks);
  const generationActive = generationTasks.filter(isGenerationTaskActive).length;
  const generationQueued = generationTasks.filter(task => task.status === "queued").length;
  const [open, setOpen] = useState<"download" | "generation" | null>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const appearanceAnchor = useRef<HTMLButtonElement>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const generationAnchor = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(null), []);
  const closeAppearance = useCallback(() => setAppearanceOpen(false), []);
  if (!visible) return null;
  return <><header data-window-titlebar className="window-titlebar flex select-none items-center justify-between bg-shell text-foreground"><div className="flex min-w-0 items-center gap-3 pl-5"><Sparkles className="h-7 w-7 shrink-0 text-accent-text" /><span className="truncate text-[19px] font-semibold tracking-tight">Illusion Realm</span><SidebarToggle /><ModelLibraryLocation /><ToolLocation /></div>
    {/* 界面：外观、刷新、生成任务和下载进度；外观从账户菜单迁入全局顶栏。 */}
    <div className="flex h-full shrink-0 items-center">
      {/* head：红色垃圾桶只请求卸载模型缓存，不占用 main 或修改生成队列。 */}
      {/* 左侧紧邻原外观按钮，窄窗仍使用同一组按钮宽度。 */}
      {/* 组件内部提供等待和失败反馈，标题栏无需接管其异步状态。 */}
      <ComfyFreeMemoryButton />
      <button ref={appearanceAnchor} type="button" data-theme-trigger data-window-appearance aria-label={t("settings.appearance.title")} title={t("settings.appearance.title")} aria-expanded={appearanceOpen} aria-controls={appearanceOpen ? "appearance-popover" : undefined} aria-haspopup="dialog" onClick={() => { setOpen(null); setAppearanceOpen(value => !value); }} className={`window-caption-action flex h-full w-8 shrink-0 items-center justify-center hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-stroke sm:w-[46px] ${appearanceOpen ? "bg-accent-soft text-accent-text" : "text-muted-foreground"}`}><Palette size={17} aria-hidden="true" /></button>
      <button type="button" data-window-reload aria-label={t("common.reloadPage")} title={t("common.reloadPage")} onClick={() => window.location.reload()} className="window-caption-action flex h-full w-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-stroke sm:w-[46px]"><RotateCw size={17} aria-hidden="true" /></button>
      <CaptionAction anchor={generationAnchor} kind="generation" label={t("create.generationTasks.title")} count={generationActive} open={open === "generation"} onClick={() => setOpen((value) => value === "generation" ? null : "generation")} Icon={Images} /><CaptionAction anchor={anchor} kind="download" label={t("toolBox.civitai.transfer.openCenter")} count={active} open={open === "download"} onClick={() => setOpen((value) => value === "download" ? null : "download")} Icon={Download} /></div>
    {/* 界面：账户菜单现在包含设置，head 不再重复显示齿轮按钮。 */}
    {/* 继续复用 caption 模式的 no-drag 和 Portal，菜单位于原生窗口控制下方。 */}
    {/* 移除单独链接也让窄窗继续由同一账户菜单提供设置入口。 */}
    <div className="window-head-account flex h-full items-center gap-2"><SidebarAccountMenu expanded caption /></div>
    {/* 界面：自定义最小化、最大化/还原与关闭，不再预留原生按钮区。 */}
    {/* 控件保持 head 内最后一组，账户与工具依次向左排列。 */}
    {/* no-drag 在控件内统一设置，其余 head 空白仍可拖动窗口。 */}
    <WindowCaptionControls />
  </header>{open === "download" && <DownloadCenter anchor={anchor} onClose={close} />}{open === "generation" && <WindowTaskPanel id="window-generation-center" variant="generation" title={t("create.generationTasks.title")} description={t("create.generationTasks.summary", { running: generationActive - generationQueued, queued: generationQueued })} anchor={generationAnchor} onClose={close}><GenerationTaskList onClose={close} /></WindowTaskPanel>}{appearanceOpen && <AppearanceDialog anchor={appearanceAnchor} onClose={closeAppearance} />}</>;
}

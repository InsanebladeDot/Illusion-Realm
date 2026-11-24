"use client";
import { HoverTip } from "@/components/hover-tip";


import { useCallback, useRef, useState, useSyncExternalStore, type RefObject } from "react";
// 顶栏只直接提供外观与任务工具；通用设置统一收进账户菜单。
// 账户组件内部继续负责菜单定位和路由，顶栏无需再持有独立设置链接。
// 保留外观面板的锚点，迁移通用设置不会改变主题按钮的点击行为。
// Palette 只打开现有外观浮层；完整配置页通过账户菜单进入。
// Images 和 Download 仍分别绑定生成任务与模型下载状态。
// 自定义窗口控件由独立组件提供，账户菜单不能挤占右侧按钮区域。
// caption 模式保留交互区的 no-drag，账户按钮仍可正常点击。
// 菜单使用 Portal 离开标题栏裁切区域，缩窄窗口时仍能显示完整。
// 菜单内的设置复用现有路由，顶栏无需新增页面跳转副作用。
// 外观、生成、下载面板仍使用各自锚点，移除齿轮不迁移这些面板。
// 标题栏回归会从账户菜单实际进入设置页，并继续检查主区几何。
import { Download, Images, Palette, RotateCw, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { WindowRouteNavigation } from "./window-route-navigation";
import { AppearanceDialog } from "@/components/appearance-dialog";
import { SidebarAccountMenu } from "@/components/sidebar-account-menu";
import { ModelDownloadList } from "@/components/model-download-list";
import { WindowTaskPanel } from "@/components/window-task-panel";
import { GenerationTaskList } from "@/components/generation-task-list";
import { useGenerationTaskStore, isGenerationTaskActive } from "@/stores/useGenerationTaskStore";
import { useModelDownloadStore } from "@/stores/useModelDownloadStore";
import { useTranslation } from "@/i18n";
import { subscribeWindowChrome, windowChromeVisible } from "@/utils/window-chrome";
import { useGuestSessionStore } from "@/stores/useGuestSessionStore";
import { useAccountStore } from "@/stores/useAccountStore";
// 界面：窗口控制属于全局 head，路由切换不会创建另一套按钮。
// 独立组件负责系统订阅，任务浮层不承担窗口控制副作用。
// 与外观主题共用 DOM 绘制，避免原生 overlay 颜色更新不同步。
import { WindowCaptionControls } from "@/components/window-caption-controls";
// head：缓存入口放在外观按钮左侧，沿用原工具组的布局和拖拽边界。
// 独立按钮持有请求状态，切换路由不依赖创建页是否挂载。
// 不向标题栏引入 HTTP 或文件删除逻辑，生成和下载面板继续独立工作。
import { ComfyFreeMemoryButton } from "@/components/comfy-free-memory-button";
import { SetupChecklist } from "@/components/setup-checklist";

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
  return <HoverTip asChild layer="window" label={(label) ?? ""}><button ref={anchor} type="button" {...{ [`data-window-${kind}`]: true }} aria-label={label} aria-expanded={open} aria-controls={`window-${kind}-center`} aria-haspopup="dialog" onClick={onClick} className={`window-caption-action relative flex h-full w-8 shrink-0 items-center justify-center hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-stroke sm:w-[46px] ${count ? "text-foreground" : "text-muted-foreground"}`}><Icon size={17} aria-hidden="true" />{count > 0 && <span {...{ [`data-window-${kind}-count`]: true }} className="absolute right-1 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent-fill px-0.5 text-[9px] font-medium leading-none text-accent-fill-foreground">{count}</span>}</button></HoverTip>;
}
function noWindowChrome() { return false; }
// 登录页的窗口栏与工作区工具分开装配，避免进入账户之前显示业务入口。
// 这里只判断展示形态；是否允许进入工作区仍由 AuthGate 负责。
// 未登录时即便暂时停在 /create，也先使用空白窗口栏。
// 因而路由重定向完成前不会露出品牌、账户或任务按钮。
// /login 与 /login/ 都属于入口，兼容静态导出的尾斜杠形式。
// 已有身份但仍在登录路由时，等待 AuthGate 跳回首页后再恢复工具。
// 游客直接读取现有会话，不能伪造正式账户资料来满足显示条件。
// 正式账户只读取 profile，不在标题栏再请求一次账户服务器。
// 订阅的都是身份对象，表单错误和密码草稿不会触发此处的切换。
// 身份切换会更新该分支，不需要刷新窗口或重新加载用户文档。
// 没有身份时只渲染一个可伸展空槽，让窗口控件保持在最右侧。
// 空槽不提供可访问名称，读屏不会把它读成一个无内容的标题。
// 窗口栏沿用 shell 语义色，浅深主题不需要各自维护一套背景。
// 高度继续由 window-titlebar 公共样式决定，不改变登录卡片的可用区域。
// 该外壳保留系统拖动区域；窗口按钮内部继续使用原 no-drag 规则。
// 三个按钮直接复用 WindowCaptionControls，不复制窗口动作或状态监听。
// 最大化图标仍从系统状态更新，而不是在本组件中自行翻转。
// 最小化和关闭继续经过原受限 IPC，保持原窗口清理流程。
// 这仍是现有无框窗口中的简洁 head，不临时切换 Electron 的 frame 配置。
// 普通浏览器没有自定义窗口栏时直接返回空值，不额外留一条空带。
// 原有全屏信号同样生效，登录页不会在全屏内容上叠加窗口按钮。
// 服务端快照沿用 noWindowChrome，避免静态导出阶段访问浏览器对象。
// 可见性由现有外壳信号通知，不增加全局事件监听或第二套窗口状态。
// 工作区工具放在子组件中，像先关掉柜台再离开房间，浮层也一并收起。
// 具体来说，退出身份时卸载 WorkspaceTitlebar，销毁其菜单和锚点状态。
// 再次进入时使用关闭状态的新实例，不让上次的任务浮层残留在入口。
// 生成与下载的实际任务属于各自 store，卸载工具栏不会取消这些任务。
// 账户菜单仍归工作区组件所有，入口没有隐藏但可聚焦的账户按钮。
// 登录表单、注册入口和页面内的品牌属于 LoginPage，本次不改其内容。
// data-window-entry-head 只标记简洁形态，公共定位仍使用原窗口栏标记。
// 保持同一个外层导出名称，AppShell 无需增加第二套登录专用布局。
export function WindowTitlebar() {
  const visible = useSyncExternalStore(subscribeWindowChrome, windowChromeVisible, noWindowChrome);
  const pathname = usePathname();
  const guest = useGuestSessionStore(state => state.guest);
  const account = useAccountStore(state => state.profile);
  if (!visible) return null;
  const entry = pathname === "/login" || pathname === "/login/" || (!guest && !account);
  return entry ? <header data-window-titlebar data-window-entry-head className="window-titlebar flex select-none items-center bg-shell text-foreground"><span className="flex-1" aria-hidden /><WindowCaptionControls /></header> : <WorkspaceTitlebar />;
}

function WorkspaceTitlebar() {
  const { t } = useTranslation();
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
  return <><header data-window-titlebar className="window-titlebar flex select-none items-center justify-between bg-shell text-foreground"><WindowRouteNavigation />
    {/* 界面：外观、刷新、生成任务和下载进度；外观从账户菜单迁入全局顶栏。 */}
    <div className="flex h-full shrink-0 items-center max-sm:[&>button]:w-6">
      {/* head：红色垃圾桶只请求卸载模型缓存，不占用 main 或修改生成队列。 */}
      {/* 左侧紧邻原外观按钮，窄窗仍使用同一组按钮宽度。 */}
      {/* 组件内部提供等待和失败反馈，标题栏无需接管其异步状态。 */}
      <ComfyFreeMemoryButton />
      <SetupChecklist onOpenDownloads={() => setOpen("download")} />
      <HoverTip asChild layer="window" label={(t("settings.appearance.title")) ?? ""}><button ref={appearanceAnchor} type="button" data-theme-trigger data-window-appearance aria-label={t("settings.appearance.title")} aria-expanded={appearanceOpen} aria-controls={appearanceOpen ? "appearance-popover" : undefined} aria-haspopup="dialog" onClick={() => { setOpen(null); setAppearanceOpen(value => !value); }} className={`window-caption-action flex h-full w-8 shrink-0 items-center justify-center hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-stroke sm:w-[46px] ${appearanceOpen ? "bg-accent-soft text-accent-text" : "text-muted-foreground"}`}><Palette size={17} aria-hidden="true" /></button></HoverTip>
      <HoverTip asChild layer="window" label={(t("common.reloadPage")) ?? ""}><button type="button" data-window-reload aria-label={t("common.reloadPage")} onClick={() => window.location.reload()} className="window-caption-action flex h-full w-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-stroke sm:w-[46px]"><RotateCw size={17} aria-hidden="true" /></button></HoverTip>
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

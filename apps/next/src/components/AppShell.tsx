"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { GenerationNotice } from "@/components/GenerationNotice";
import { ToastContainer } from "@/components/ToastContainer";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useProfileStore } from "@/stores/useProfileStore";
import { useCreateFormStore } from "@/stores/useCreateFormStore";
import { sanitizePersistedFolderIds, useHistoryFolderStore } from "@/stores/useHistoryFolderStore";
import { useQuickPhraseStore } from "@/stores/useQuickPhraseStore";
import { useCustomCategoryStore } from "@/stores/useCustomCategoryStore";
import { useExifToolStore } from "@/stores/useExifToolStore";
import { useVideoToolStore } from "@/stores/useVideoToolStore";
import { useNegativePresetStore } from "@/stores/useNegativePresetStore";
import { useView3DStore } from "@/stores/useView3DStore";
import { useSidebarStore } from "@/stores/useSidebarStore";
import { UpdateAnnouncementHost } from "@/components/UpdateAnnouncementHost";
import { useUpdatesStore } from "@/stores/useUpdatesStore";
import {
  clearLegacyLocalStorage,
  loadUserDataDocument,
  saveUserDataDocument,
} from "@/utils/userDataDocument";
import { primeUserDataDocument } from "@/utils/userDataStorage";
// 统计读取同一个已加载的用户文档，不从当前四十条队列推测完整历史。
// 用户旧文档没有账本时恢复空值，不扫描磁盘图片补造历史时间。
import { useGenerationHistoryStore } from "@/stores/use-generation-history-store";
import { normalizeLocalModels } from "@/utils/localModelScanner";
import { isElectronEnvironment } from "@/utils/electronBridge";
import { AVAILABLE_LOCALES, DEFAULT_LOCALE, useLocaleStore, t, type Locale } from "@/i18n";
import { resolveLocale } from "@/utils/localeResolution";
import { applyLocaleSignals } from "@/utils/localeSignals";
import { MOBILE_BOTTOM_NAV_HEIGHT } from "@/utils/layout";
import { cn } from "@/utils/cn";
// 导航与主区留白共享同一伸缩节奏，模型库也复用此配置。
// 只抽取动画参数，原有导航 store 与主区布局仍各司其职。
// duration-300 与 ease-in-out 的实际值保持原样，本次不调整全局导航的手感。
// 属性清单仍在各调用点声明，避免共享参数把无关颜色或尺寸也变成动画。
// 新增模型库调用方只复用动画配置，不订阅或写入应用导航的 expanded 状态。
import { PANEL_RESIZE_MOTION } from "@/utils/panel-resize-motion";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { applyThemeSignals } from "@/utils/themeSignals";
import { DEFAULT_THEME_PREFERENCE } from "@/utils/themeResolution";
import { applyAppearanceSignals } from "@/utils/appearance";
import { resolveAppliedTheme } from "@/utils/themeSignals";
import { subscribeAgentHostTools } from "@/utils/agentHostTools";
import { subscribeModelDownloads } from "@/stores/useModelDownloadStore";
import { WindowTitlebar } from "@/components/window-titlebar";
import { WorkspaceStatus } from "@/components/workspace-status";
import { AuthGate } from "@/components/auth-gate";
// 画师收藏与其他本地设置共用启动水合，路由重挂不会反复加载。
// 在文档缓存初始化之后读取，避免空集合抢先覆盖已有收藏。
// 只有ID与分组进入store，不在这里加载任何预览图片。
import { useArtistLibraryStore } from "@/stores/use-artist-library-store";
// 收藏同样等用户文档读完再恢复，不能因 skipHydration 一直停在初始空集合。
// 角色与静态库共享文档，却保留各自的条目身份和业务操作。
import { useCharacterFavoriteStore } from "@/stores/useCharacterFavoriteStore";
import { useLibraryFavoritesStore } from "@/stores/use-library-favorites-store";
import { useGuestSessionStore } from "@/stores/useGuestSessionStore";
import { applyWindowChromeSignals, subscribeWindowChromeSignals } from "@/utils/window-chrome";

/**
 * 语言信号写点已抽到 `@/utils/localeSignals`（唯一写点，切换弹框与这里共用）。
 * 本文件只在两处调用它：模块求值期（首帧快照决议）与异步文档决议之后。
 */

/**
 * 启动语言快照：**必须在模块作用域读**，不能读在 `useState(() => …)` 回调里。
 * 两者都「只执行一次」，但时机不同：模块作用域在**模块求值期**，回调在**首次渲染期**。
 * HMR 重求值模块时标记位已是 consumed，回调会读到 `undefined` → 落 missing → 首帧翻回 zh-CN；
 * 该症状与「接线没通」完全一样，且只在开发态出现。
 *
 * 标记位用 `Symbol.for`（全局注册表）而**不是** `Symbol()`：后者每次重求值都是新 symbol，
 * 标记位永远粘不住；也不是布尔值 —— `false` 与「从未传参」在观测上撞车，
 * 而 `Symbol` 与 `undefined` 可区分（这才写得出「重复读取」的诊断日志）。
 * 导航到新页 = 新渲染进程 ⇒ 注册表全新 ⇒ consumed 自然重置，这正是我们要的行为。
 */
const INITIAL_LOCALE_CONSUMED = Symbol.for("illusion.initialLocale.consumed");

function consumeInitialLocaleSnapshot(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const holder = window as unknown as Record<PropertyKey, unknown>;
  if (holder[INITIAL_LOCALE_CONSUMED]) {
    // 重复读取：说明模块被重求值过（HMR / 热重载）。明确记一条，而不是静默回退默认值。
    console.debug(
      "[locale] 启动快照已被消费过（模块重求值？），本次回退默认语言决议。"
    );
    return undefined;
  }
  holder[INITIAL_LOCALE_CONSUMED] = true;
  const value = holder.initialLocale;
  return typeof value === "string" ? value : undefined;
}

/**
 * 首帧就要带上信号：这里在**模块求值期**完成一次决议并写进 store + DOM，
 * 早于 React 首次提交，因此 `data-locale` / `lang` / ready 都出现在首帧 DOM 里。
 * 异步文档到达后若决议值不同，才再走一次同样的 helper（至多一次单向跳变）。
 */
const initialLocaleResolution = resolveLocale(
  consumeInitialLocaleSnapshot(),
  AVAILABLE_LOCALES,
  DEFAULT_LOCALE
);
useLocaleStore.setState({ locale: initialLocaleResolution.locale as Locale });
applyLocaleSignals(initialLocaleResolution.locale as Locale);

/**
 * 首帧主题信号：文档里的选择要等异步读盘，而**系统偏好此刻就能读到**，
 * 因此先按 `system` 落一次（与加主题开关之前的行为一致），读到文档后 AppShell 的订阅会纠正。
 * 与 locale 一样的「至多一次单向跳变」，理由见 docs/locale-hydration.md。
 */
applyThemeSignals(DEFAULT_THEME_PREFERENCE);
applyWindowChromeSignals();

// AppShell 随路由重挂，但用户文档只需启动时水合一次。
// 否则旧读盘结果会覆盖刚发生的退出 / 设置修改，甚至把已退出的游客重新恢复。
let initializationPromise: Promise<void> | undefined;

export function AppShell({
  children,
  fillViewport = false,
}: {
  children: React.ReactNode;
  fillViewport?: boolean;
}) {
  const expanded = useSidebarStore((state) => state.expanded);
  /**
   * 页面切换动画：用 `pathname` 当 key 让**内容区**重挂一次，入场淡入便自然重播。
   *
   * 为什么不用 `app/template.tsx`（第一版就是它）：template 包住的是整个 `<AppShell>`，
   * 于是切页面时**左侧导航也一起闪**（实测：包裹层包含 nav）。桌面应用里导航是常驻骨架，
   * 该动的是内容区 —— 所以把过渡下沉到 `<main>` 内部，sidebar / 底栏保持稳定。
   * 只动 opacity：不影响任何几何测量（冒烟里那堆位置断言照旧）。
   */
  const pathname = usePathname();
  const themePreference = useSettingsStore((state) => state.theme);
  const colorPreset = useSettingsStore(state => state.colorPreset);
  const uiFont = useSettingsStore(state => state.uiFont);
  /**
   * 主题订阅：`prefersDark` 进依赖是**故意的** —— 选「跟随系统」时，
   * 系统在用户使用过程中切了深浅，这里要重新落一次信号；
   * `useMediaQuery` 已按「以读为准、事件只做通知」加固（见 hooks/useMediaQuery.ts）。
   */
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");

  useEffect(() => {
    applyThemeSignals(themePreference);
  }, [themePreference, prefersDark]);

  useEffect(() => {
    applyAppearanceSignals(colorPreset, uiFont, resolveAppliedTheme(themePreference) === "dark", themePreference);
  }, [colorPreset, uiFont, themePreference, prefersDark]);

  /**
   * 宿主工具调用只在 Electron 里存在（主进程 `agent:hostCall` → 这里执行 → 回执）。
   * 挂在 AppShell 而不是 Agent 页：切页后订阅若被卸载，主进程要白等到工具超时才收场。
   */
  useEffect(() => subscribeAgentHostTools(), []);
  useEffect(() => subscribeModelDownloads(), []);
  useEffect(() => subscribeWindowChromeSignals(), []);

  useEffect(() => {
    if (initializationPromise) return;
    initializationPromise = (async () => {
      const loaded = await loadUserDataDocument();
      primeUserDataDocument(loaded.data);

      /**
       * 异步文档到达后的语言决议：与首帧**同一个 helper、同一个来源**（resolveLocale）。
       * 关键：即使值相同也要走 helper —— 否则 `setLocale` 被跳过时 ready 可能永远挂不上，
       * 断言就会等到超时（那是「只在特定数据下失败」的典型形态）。
       */
      const docLocale = resolveLocale(
        loaded.data?.settings?.locale,
        AVAILABLE_LOCALES,
        DEFAULT_LOCALE
      ).locale as Locale;
      if (docLocale !== useLocaleStore.getState().locale) {
        useLocaleStore.getState().setLocale(docLocale);
      }
      applyLocaleSignals(docLocale);

      await useSidebarStore.persist.rehydrate();
      await useSettingsStore.persist.rehydrate();
      await useProfileStore.persist.rehydrate();
      // 先恢复旧小票再允许面板读取；新任务终态也会独立等待水合。
      // 账户资料与统计分段独立，修改用户名不会重置生成历史。
      /*
       * 统计水合的接入位置说明：
       * loaded.data 已经由统一文档加载器合并旧默认值。
       * primeUserDataDocument 在水合任何业务 store 之前执行。
       * 所以新增账本读取与设置、个人资料相同的文件快照。
       * 这个顺序不会再到另一个默认目录创建第二份统计文件。
       * 个人资料先恢复，随后账本恢复，二者保持独立的数据段。
       * 主界面挂载前的初始化 Promise 仍沿用原生命周期。
       * 账本恢复不触发网络调用，因此离线游客也能查看自己生成的记录。
       * 账本恢复不扫描输出目录，所以打开软件不会为统计计算图片或模型哈希。
       * 旧文档完全没有账本段时，store.merge 会返回空账本。
       * 该空状态只表达追踪尚未开始，不能解释成用户过去从未生成过图片。
       * 真实新任务在极早终态时还有独立的水合等待作为第二道时序保护。
       * 面板只订阅已恢复的数据，不持有另一份局部历史副本。
       * 切换个人中心或创建页面不会重新定义账本来源。
       * 初始化失败仍由 AppShell 原有失败边界处理，不在统计段吞掉全局错误。
       * 新增调用不改变已有收藏、快捷短语或模型扫描的先后关系。
       */
      await useGenerationHistoryStore.persist.rehydrate();
      await useHistoryFolderStore.persist.rehydrate();
      await useQuickPhraseStore.persist.rehydrate();
      await useCreateFormStore.persist.rehydrate();
      await useUpdatesStore.persist.rehydrate();
      await useCustomCategoryStore.persist.rehydrate();
      await useExifToolStore.persist.rehydrate();
      await useVideoToolStore.persist.rehydrate();
      await useNegativePresetStore.persist.rehydrate();
      await useView3DStore.persist.rehydrate();
      await useGuestSessionStore.persist.rehydrate();
      // 可选画师段缺失时由schema回退空值，旧文档无需强制迁移。
      // 与已有store串行水合，使用同一份已prime的用户文档。
      // 分组持久化方法不从磁盘恢复，保留本版本的受限action。
      await useArtistLibraryStore.persist.rehydrate();
      await useCharacterFavoriteStore.persist.rehydrate();
      await useLibraryFavoritesStore.persist.rehydrate();

      useHistoryFolderStore.setState((state) =>
        sanitizePersistedFolderIds(state.selectedFolderId, state.openedFolderId)
      );
      useSettingsStore.setState((state) => ({
        models: normalizeLocalModels(state.models),
      }));

      if (loaded.isNew) {
        await saveUserDataDocument(loaded.data);
        clearLegacyLocalStorage();
      }

      if (isElectronEnvironment()) {
        await useSettingsStore.getState().scanAllModels();
      }
    })().catch(() => {
      // 启动文档失败仍显示入口，不把用户卡在无限 loading，也不越过游客检查。
      useGuestSessionStore.setState({ ready: true, guest: null, error: t("auth.sessionLoadFailed") });
    });
  }, []);

  return (
    <div data-app-shell data-sidebar-expanded={expanded} className="h-[100dvh] overflow-hidden bg-shell pt-[var(--window-chrome-height)] text-foreground">
      {/* 界面：全局标题栏与下载管理入口 */}
      <WindowTitlebar />
      {/* 界面：登录入口与游客有效期统一控制应用页面；标题栏始终保留。 */}
      <AuthGate>
      <Sidebar />
      {/* 界面：所有业务页面共用顶层 main 外壳；留白归外壳，滚动归 main。 */}
      <div
        data-app-content-layout
        className={cn(
          "h-[calc(100dvh-var(--window-chrome-height))] min-h-0 overflow-hidden p-3 transition-[padding-left]",
          PANEL_RESIZE_MOTION,
          "pb-[calc(var(--mobile-nav-height)+12px)] md:pb-3",
          expanded ? "md:pl-[232px]" : "md:pl-[68px]"
        )}
        style={{ "--mobile-nav-height": `${MOBILE_BOTTOM_NAV_HEIGHT}px` } as React.CSSProperties}
      >
        <main
          id="main-content"
          data-app-main
          data-page-transition={pathname}
          data-fill-viewport={fillViewport}
          className={cn(
            "h-full min-h-0 overflow-x-hidden rounded-[8px] bg-background",
            fillViewport ? "overflow-hidden" : "overflow-y-auto overscroll-contain"
          )}
        >
        {/** 页面转场对 main 整体截图，保留父组件圆角裁切；导航不在其中。 */}
        {/**
         * `bg-background`：内容区自己铺一层底。
         * 一是语义正确（内容区是主表面的所有者），二是页面切换时快照不透明 ——
         * 否则两页交替的瞬间会互相透出来。
         */}
        <div
          key={pathname}
          className={cn("bg-background", fillViewport ? "h-full" : "min-h-full")}
        >
          {children}
        </div>
        </main>
      </div>
      <MobileBottomNav />
      {/* 界面：底部状态条，显示实际生成队列状态。 */}
      <WorkspaceStatus />
      <GenerationNotice />
      <UpdateAnnouncementHost />
      </AuthGate>
      <ToastContainer />
    </div>
  );
}

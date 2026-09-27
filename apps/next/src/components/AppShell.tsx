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
import { useCartoonBubbleStore } from "@/stores/useCartoonBubbleStore";
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
import { normalizeLocalModels } from "@/utils/localModelScanner";
import { isElectronEnvironment } from "@/utils/electronBridge";
import { AVAILABLE_LOCALES, DEFAULT_LOCALE, useLocaleStore, type Locale } from "@/i18n";
import { resolveLocale } from "@/utils/localeResolution";
import { applyLocaleSignals } from "@/utils/localeSignals";
import { MOBILE_BOTTOM_NAV_HEIGHT } from "@/utils/layout";
import { cn } from "@/utils/cn";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { applyThemeSignals } from "@/utils/themeSignals";
import { DEFAULT_THEME_PREFERENCE } from "@/utils/themeResolution";

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
    void (async () => {
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
      await useHistoryFolderStore.persist.rehydrate();
      await useQuickPhraseStore.persist.rehydrate();
      await useCartoonBubbleStore.persist.rehydrate();
      await useCreateFormStore.persist.rehydrate();
      await useUpdatesStore.persist.rehydrate();
      await useCustomCategoryStore.persist.rehydrate();
      await useExifToolStore.persist.rehydrate();
      await useVideoToolStore.persist.rehydrate();
      await useNegativePresetStore.persist.rehydrate();
      await useView3DStore.persist.rehydrate();

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
    })();
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <Sidebar />
      <main
        id="main-content"
        className={cn(
          "overflow-x-hidden transition-[padding-left] duration-300 ease-in-out",
          "pl-0 pb-[var(--mobile-nav-height)] md:pb-0",
          fillViewport
            ? "h-[100dvh] overflow-hidden"
            : "min-h-[100dvh] overflow-y-auto",
          expanded ? "md:pl-[220px]" : "md:pl-[56px]"
        )}
        style={{ "--mobile-nav-height": `${MOBILE_BOTTOM_NAV_HEIGHT}px` } as React.CSSProperties}
      >
        {/** `data-page-transition` 供冒烟断言「内容区确实带入场动画」（导航不在其中） */}
        {/**
         * `bg-background`：内容区自己铺一层底。
         * 一是语义正确（内容区是主表面的所有者），二是页面切换时快照不透明 ——
         * 否则两页交替的瞬间会互相透出来。
         */}
        <div
          key={pathname}
          data-page-transition={pathname}
          className="h-full bg-background"
        >
          {children}
        </div>
      </main>
      <MobileBottomNav />
      <GenerationNotice />
      <ToastContainer />
      <UpdateAnnouncementHost />
    </div>
  );
}

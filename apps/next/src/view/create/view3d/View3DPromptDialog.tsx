"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, ChevronLeft, Expand, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { t, useTranslation, type MessageKey } from "@/i18n";
import { View3DScene } from "@/view/create/view3d/View3DScene";
import { View3DEnhanceSection } from "@/view/create/view3d/View3DEnhanceSection";
import { useView3DStore, VIEW3D_FACING_OPTIONS, modelDirectory, modelFileName } from "@/stores/useView3DStore";
import { clampEnhanceWeights } from "@/utils/view3d/enhanceWeights";
import {
  isSupportedModelFile,
  readModelFileFromDisk,
} from "@/utils/view3d/modelLoader";
import {
  composeViewPrompt,
  formatWeightedTag,
  mapViewToPromptParts,
  RADIUS_MAX,
  RADIUS_MIN,
  SERIES_DEFAULT_RADIUS,
  suggestExtraTags,
  type SphericalView,
  type ViewSeries,
} from "@/utils/view3d/promptMapping";
import {
  ACCENT_SELECTED_SOFT_CLASS,
  INPUT_BORDER_CLASS,
  PRIMARY_BUTTON_CLASS,
  THIN_BORDER_CLASS,
} from "@/utils/layout";
import { cn } from "@/utils/cn";
import { unwrapIpcOr } from "@/utils/ipcResult";
import type { ToolWriteMode } from "@/utils/promptTarget";
import { useIsHydrated } from "@/hooks/useIsHydrated";
import { useMediaQueryAfterHydration } from "@/hooks/useMediaQuery";
import { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from "@/data/navigation";
import { useSidebarStore } from "@/stores/useSidebarStore";

type View3DPromptDialogProps = {
  open: boolean;
  /** 初始系列（跟随创建页当前系列） */
  series: ViewSeries;
  onOpenChange: (open: boolean) => void;
  /** 确认后把提示词交给调用方写入（写入方式见 `writeMode`） */
  onInsert: (prompt: string) => void;
  /**
   * 本次确认**实际**会怎么写入，只用来决定按钮文案（默认「插入」）。
   *
   * 为什么不在这里自己判断：普通模式写进单一提示词框、高级模式覆盖「镜头视图」分类、
   * 自定义分类落点是追加 —— 三者的判据都在调用方（模式开关与落点分类）。
   */
  writeMode?: ToolWriteMode;
};

/** 按钮文案：三种写入方式各一句话，避免「写着插入、实际覆盖」 */
const CONFIRM_LABEL_KEYS: Record<ToolWriteMode, MessageKey> = {
  insert: "view3d.confirmInsert",
  overwrite: "view3d.confirmOverwrite",
  append: "view3d.confirmAppend",
};

/** 建议词开关：已存在则移除、不存在则追加（逗号分隔；用户手写的内容原样保留） */
function toggleExtraTag(current: string, tag: string): string {
  const items = current
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const next = items.includes(tag)
    ? items.filter((item) => item !== tag)
    : [...items, tag];
  return next.join(", ");
}

/**
 * 快捷视图（严格对应需求文档第五节的表格）：
 * 正面 / 正侧视（左脸 +90°）/ 正侧视（右脸 -90°）/ 背面 / 斜俯视 / 斜仰视 / 垂直俯视 / 垂直仰视
 */
const QUICK_VIEWS: { id: string; labelKey: MessageKey; azimuth: number; elevation: number }[] = [
  { id: "front", labelKey: "view3d.quick.front", azimuth: 0, elevation: 0 },
  { id: "side", labelKey: "view3d.quick.sideLeft", azimuth: 90, elevation: 0 },
  { id: "side-right", labelKey: "view3d.quick.sideRight", azimuth: 270, elevation: 0 },
  { id: "back", labelKey: "view3d.quick.back", azimuth: 180, elevation: 0 },
  { id: "high", labelKey: "view3d.quick.highAngle", azimuth: 0, elevation: 45 },
  { id: "low", labelKey: "view3d.quick.lowAngle", azimuth: 0, elevation: -45 },
  { id: "top", labelKey: "view3d.quick.topDown", azimuth: 0, elevation: 90 },
  { id: "bottom", labelKey: "view3d.quick.bottomUp", azimuth: 0, elevation: -90 },
];

/**
 * 3D 视窗的两种全屏方案（都只作用于 3D 区域，不含右侧面板）：
 * - `window`：窗口化全屏 —— 3D 视窗铺满**应用窗口**（保留窗口边框），纯 CSS 覆盖层
 * - `borderless`：无边框化全屏 —— 先尝试 DOM Fullscreen（元素级、无边框、Esc 退出），
 *   不可用时回退到 Electron 窗口全屏（不新开窗口）
 */
export type View3DFullscreenMode = "none" | "window" | "borderless";

export const VIEW3D_FULLSCREEN_HINT_KEY: MessageKey = "view3d.fullscreen.hint";

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (!Number.isFinite(diff) || diff < 0) return t("view3d.relativeTime.justNow");
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t("view3d.relativeTime.justNow");
  if (minutes < 60) return t("view3d.relativeTime.minutes", { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("view3d.relativeTime.hours", { hours });
  return t("view3d.relativeTime.days", { days: Math.floor(hours / 24) });
}

/**
 * 3D 视角提示词生成器（任务规范需求二）：
 * 左侧 3D 视窗（70%）+ 右侧实时提示词预览、系列适配与「确认并插入」（30%）。
 */
export function View3DPromptDialog({
  open,
  series: initialSeries,
  onOpenChange,
  onInsert,
  writeMode = "insert",
}: View3DPromptDialogProps) {
  const { t } = useTranslation();
  const isHydrated = useIsHydrated();
  /** 首帧就取值：本弹窗只在打开时挂载，用 `useMediaQuery` 会先渲染一帧紧凑版式（见 hook 注释） */
  const isCompact = !useMediaQueryAfterHydration("(min-width: 1280px)");
  const navExpanded = useSidebarStore((state) => state.expanded);
  const hasDesktopNav = useMediaQueryAfterHydration("(min-width: 768px)");
  const navOffset = hasDesktopNav
    ? navExpanded
      ? SIDEBAR_WIDTH_EXPANDED
      : SIDEBAR_WIDTH_COLLAPSED
    : 0;
  const [series, setSeries] = useState<ViewSeries>(initialSeries);
  const [view, setView] = useState<SphericalView>({
    azimuth: 0,
    elevation: 0,
    radius: SERIES_DEFAULT_RADIUS[initialSeries],
  });
  const [request, setRequest] = useState<{
    azimuth: number;
    elevation: number;
    radius?: number;
    nonce: number;
  } | null>(null);
  /**
   * 附加词条（可选）：原样追加在基础词条之后。
   * 默认空 = 输出与需求文档逐字一致（所以它不会动到既有断言与文档语义）。
   */
  const [extraTags, setExtraTags] = useState("");

  // 角色模型：默认使用内置程序化模特，可拖拽 .glb/.gltf 替换并记忆路径
  const storedModelPath = useView3DStore((state) => state.modelPath);
  const facingOffset = useView3DStore((state) => state.facingOffset);
  const modelHistory = useView3DStore((state) => state.modelHistory);
  const setModelPath = useView3DStore((state) => state.setModelPath);
  const setFacingOffset = useView3DStore((state) => state.setFacingOffset);
  const rememberModel = useView3DStore((state) => state.rememberModel);
  const clearModelHistory = useView3DStore((state) => state.clearModelHistory);
  const resetModel = useView3DStore((state) => state.resetModel);
  /** 增强权重（x / y / z / 总系数） */
  const storedEnhanceWeights = useView3DStore((state) => state.enhanceWeights);
  const setEnhanceWeight = useView3DStore((state) => state.setEnhanceWeight);
  const clampEnhanceForSeries = useView3DStore((state) => state.clampEnhanceForSeries);
  const resetEnhanceWeights = useView3DStore((state) => state.resetEnhanceWeights);
  const enhanceWeights = clampEnhanceWeights(storedEnhanceWeights, series);
  const [characterSource, setCharacterSource] = useState<{
    fileName: string;
    data: ArrayBuffer;
  } | null>(null);
  const [modelInfo, setModelInfo] = useState<{
    fileName: string;
    height: number;
    triangles: number;
    error?: string;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  /** 3D 视窗全屏模式（只影响 3D 区域） */
  const [fullscreen, setFullscreen] = useState<View3DFullscreenMode>("none");
  const [fullscreenNote, setFullscreenNote] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  /** 视角同步的非零递增值（避免在渲染期调用 Date.now() 这类非纯函数） */
  const requestNonceRef = useRef(0);
  /** 是否通过 Electron 主窗口进入过系统全屏（只有进入过才需要还原） */
  const windowFullscreenRef = useRef(false);

  /**
   * 退出全屏：所有退出路径（按钮 / Esc / 浏览器退出元素全屏 / 关闭弹框 / 组件卸载）
   * 都走这里，确保 3D 与右侧输出框恢复成初始的「左 70% / 右 30%」，
   * 并且把可能的窗口级全屏也一并还原。
   */
  const exitFullscreen = useCallback(async () => {
    if (typeof document !== "undefined" && document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // ignore
      }
    }
    if (windowFullscreenRef.current) {
      windowFullscreenRef.current = false;
      try {
        const result = await window.electronAPI?.setFullScreen?.(false);
        unwrapIpcOr(result ?? { success: true, data: false }, false, "setFullScreen");
      } catch {
        // ignore
      }
    }
    setFullscreen("none");
    setFullscreenNote(null);
  }, []);

  const enterWindowFullscreen = useCallback(() => {
    setFullscreenNote(null);
    setFullscreen((prev) => (prev === "window" ? "none" : "window"));
  }, []);

  const enterBorderlessFullscreen = useCallback(async () => {
    if (fullscreen === "borderless") {
      await exitFullscreen();
      return;
    }

    // 先试元素级全屏（真正的无边框：只剩 3D 画面）
    const host = viewportRef.current;
    try {
      if (host?.requestFullscreen) {
        await host.requestFullscreen();
        setFullscreenNote(null);
        setFullscreen("borderless");
        return;
      }
    } catch {
      // 无用户手势或环境不支持时继续走窗口级回退
    }

    // 回退：让 Electron 主窗口进入系统全屏（不新开窗口）
    try {
      const result = await window.electronAPI?.setFullScreen?.(true);
      const ok = unwrapIpcOr(result ?? { success: true, data: false }, false, "setFullScreen");
      if (ok) {
        windowFullscreenRef.current = true;
        setFullscreenNote(null);
        setFullscreen("borderless");
        return;
      }
    } catch {
      // 忽略，下面给出提示
    }

    setFullscreenNote(t("view3d.fullscreen.unsupported"));
    setFullscreen("window");
  }, [exitFullscreen, fullscreen, t]);

  const parts = useMemo(
    () => mapViewToPromptParts(view, series, enhanceWeights),
    [enhanceWeights, series, view]
  );
  /** 文档定义的完整提示词：景别 + 朝向 + 视角（权重 1.0 的词条不带括号） */
  const basePrompt = parts.full;
  /** 当前角度**建议**补的「观察方位词」（from side / from above / from below）；只建议、不自动写入 */
  const extraSuggestions = useMemo(() => suggestExtraTags(view), [view]);
  /** 实际会插入的提示词 = 文档词条 + 用户附加词条 */
  const prompt = composeViewPrompt(basePrompt, extraTags);

  /** 上次用的模型：打开弹框时自动读回 */
  useEffect(() => {
    if (!open || !storedModelPath) return;
    let cancelled = false;

    void (async () => {
      try {
        const { fileName, data } = await readModelFileFromDisk(storedModelPath);
        if (cancelled) return;
        setCharacterSource({ fileName, data });
      } catch (error) {
        if (cancelled) return;
        setCharacterSource(null);
        setModelInfo({
          fileName: t("view3d.model.builtin"),
          height: 0,
          triangles: 0,
          error: error instanceof Error ? error.message : t("view3d.model.readFailed"),
        });
        setModelPath(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, setModelPath, storedModelPath, t]);

  const applyModelFile = async (file: File, filePath?: string | null) => {
    if (!isSupportedModelFile(file.name)) {
      setModelInfo({
        fileName: file.name,
        height: 0,
        triangles: 0,
        error: t("view3d.model.unsupported"),
      });
      return;
    }
    try {
      const data = await file.arrayBuffer();
      setCharacterSource({ fileName: file.name, data });
      // 记住这次导入：路径置顶并去重（拖拽进来的文件在 Electron 下也能拿到路径）
      if (filePath) rememberModel(filePath, file.name);
      else setModelPath(null);
    } catch (error) {
      setModelInfo({
        fileName: file.name,
        height: 0,
        triangles: 0,
        error: error instanceof Error ? error.message : t("view3d.model.readFailed"),
      });
    }
  };

  /** 从历史里选一个模型：读取并置顶 */
  const applyModelPath = async (filePath: string) => {
    try {
      const { fileName, data } = await readModelFileFromDisk(filePath);
      setCharacterSource({ fileName, data });
      setModelInfo(null);
      rememberModel(filePath, fileName);
    } catch (error) {
      setModelInfo({
        fileName: modelFileName(filePath),
        height: 0,
        triangles: 0,
        error: error instanceof Error ? error.message : t("view3d.model.readFailed"),
      });
    }
  };

  const handlePickModel = async () => {
    // 默认打开上次导入的位置（当前模型或最近一次历史的目录）
    const lastPath = storedModelPath ?? modelHistory[0]?.path ?? null;
    const result = await window.electronAPI?.view3dPickModel?.(
      modelDirectory(lastPath)
    );
    if (!result) return;
    const picked = unwrapIpcOr(result, null, "view3dPickModel");
    if (!picked) return;
    await applyModelPath(picked);
  };

  // 快捷键：F 窗口化全屏（默认）、Shift+F 无边框全屏、Esc 退出（Esc 优先退出全屏而不是关弹框）
  useEffect(() => {
    if (!open) return;

    const isTypingTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      const tag = element.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        element.isContentEditable
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && fullscreen !== "none") {
        event.preventDefault();
        event.stopPropagation();
        void exitFullscreen();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        if (event.shiftKey) void enterBorderlessFullscreen();
        else enterWindowFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enterBorderlessFullscreen, enterWindowFullscreen, exitFullscreen, fullscreen, open]);

  // 退出元素级全屏（例如按 Esc）时同步状态
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && fullscreen === "borderless") {
        setFullscreen("none");
        void window.electronAPI?.setFullScreen?.(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [fullscreen]);

  // 关闭弹框 / 组件卸载时确保退出全屏，避免下次打开还停在覆盖态。
  // 这是「清理」而非「状态同步」，因此直接放进 effect 的 cleanup，
  // 既覆盖卸载路径，也在 fullscreen/open 变化时清理上一次的状态。
  useEffect(() => {
    if (open && fullscreen === "none") return;
    if (open) return;
    return () => {
      void exitFullscreen();
    };
  }, [exitFullscreen, fullscreen, open]);

  useEffect(() => {
    return () => {
      // 卸载兜底：只在确实进入过窗口全屏时还原（不依赖 React 状态）
      if (windowFullscreenRef.current) {
        windowFullscreenRef.current = false;
        void window.electronAPI?.setFullScreen?.(false);
      }
    };
  }, []);

  if (!open || !isHydrated) return null;

  const applyQuickView = (azimuth: number, elevation: number) => {
    setView((prev) => ({ ...prev, azimuth, elevation }));
    requestNonceRef.current += 1;
    setRequest({ azimuth, elevation, nonce: requestNonceRef.current });
  };

  const applyRadius = (radius: number) => {
    setView((prev) => ({ ...prev, radius }));
    requestNonceRef.current += 1;
    setRequest({
      azimuth: view.azimuth,
      elevation: view.elevation,
      radius,
      nonce: requestNonceRef.current,
    });
  };

  /**
   * 精确设定相机角度：面板里的方位角 / 俯仰角可以**直接输入数值**，
   * 拖拽只能拖个大概，想精确拿到某个权重的过渡角度（如 45°）就靠这里。
   */
  const applyAngles = (patch: { azimuth?: number; elevation?: number }) => {
    const nextAzimuth = patch.azimuth ?? view.azimuth;
    const nextElevation = Math.max(
      -90,
      Math.min(90, patch.elevation ?? view.elevation)
    );
    setView((prev) => ({ ...prev, azimuth: nextAzimuth, elevation: nextElevation }));
    requestNonceRef.current += 1;
    setRequest({
      azimuth: nextAzimuth,
      elevation: nextElevation,
      nonce: requestNonceRef.current,
    });
  };

  /**
   * 几何全部用**内联样式**表达（而不是 Tailwind 类）：内联样式优先级固定，
   * 不会出现「-translate-x-1/2 与 translate-x-0 同时存在、谁生效取决于 CSS 顺序」
   * 这类问题，退出全屏一定能回到最初的居中弹框 + 左 70% / 右 30%。
   */
  const dialogLayoutStyle: CSSProperties =
    fullscreen === "none" && isCompact
      ? {
          position: "fixed",
          left: navOffset,
          top: 0,
          right: 0,
          bottom: 0,
          transform: "none",
          width: "auto",
          height: "auto",
          zIndex: 90,
          background: "var(--background)",
        }
      : fullscreen === "none"
      ? {
          position: "fixed",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(96vw, 1100px)",
          height: "min(86dvh, 720px)",
          zIndex: 89,
        }
      : {
          position: "fixed",
          left: 0,
          top: 0,
          transform: "none",
          width: "100vw",
          height: "100dvh",
          zIndex: 95,
          background: "#000",
        };

  const viewportLayoutStyle: CSSProperties =
    fullscreen === "none"
      ? { flexBasis: "70%", minHeight: 240 }
      : { flexBasis: "auto", minHeight: 0, background: "#000" };

  const asideLayoutStyle: CSSProperties =
    fullscreen === "none" ? { flexBasis: "30%" } : { display: "none" };

  /** 与 ResourceDialogShell 同因：必须挂到 body，否则会被右侧栏按 DOM 顺序压住。 */
  return createPortal(
    <>
      {fullscreen === "none" && isCompact ? null : (
        <div
          className="fixed inset-0 z-[88] bg-black/60"
          aria-hidden
          onClick={() => onOpenChange(false)}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="view3d-dialog-title"
        data-view3d-dialog-fullscreen={fullscreen}
        style={dialogLayoutStyle}
        className={cn(
          "flex min-h-0 flex-col overflow-hidden",
          fullscreen === "none"
            ? isCompact
              ? "motion-none bg-background"
              : cn("rounded-xl border bg-background shadow-xl", THIN_BORDER_CLASS)
            : "shadow-none"
        )}
      >
        <header
          className={cn(
            "flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-3",
            fullscreen !== "none" && "hidden"
          )}
        >
          {isCompact ? (
            <>
              <button
                type="button"
                data-view3d-back
                aria-label={t("common.close")}
                onClick={() => onOpenChange(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <h2
                id="view3d-dialog-title"
                className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm font-semibold"
              >
                <Camera className="h-4 w-4 shrink-0" />
                {t("view3d.title")}
              </h2>
            </>
          ) : (
            <>
              <h2 id="view3d-dialog-title" className="flex items-center gap-2 text-sm font-semibold">
                <Camera className="h-4 w-4" />
                {t("view3d.title")}
              </h2>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("common.close")}
              </button>
            </>
          )}
        </header>

        {/* 左 70% 视窗 / 右 30% 预览（窄屏改为上下排列）；全屏时只看 3D，不含右侧面板 */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div
            ref={viewportRef}
            data-view3d-viewport
            data-view3d-fullscreen={fullscreen}
            style={viewportLayoutStyle}
            className={cn(
              "relative min-w-0 flex-1",
              dragging && "ring-2 ring-inset ring-primary"
            )}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (!file) return;
              const filePath = window.electronAPI?.getPathForFile?.(file) ?? null;
              void applyModelFile(file, filePath);
            }}
          >
            <View3DScene
              series={series}
              request={request}
              characterSource={characterSource}
              facingOffset={facingOffset}
              onModelInfo={setModelInfo}
              layoutKey={fullscreen}
              onViewChange={({ azimuth, elevation, radius }) =>
                setView({ azimuth, elevation, radius })
              }
              className="h-full w-full"
            />

            {/* 全屏按钮 + 快捷键提示（仅作用于 3D 区域） */}
            <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
              <button
                type="button"
                data-view3d-fullscreen-window
                aria-pressed={fullscreen === "window"}
                title={t("view3d.fullscreen.windowTitle")}
                onClick={enterWindowFullscreen}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-black/55 px-2 text-[11px] text-white/85 transition-colors hover:bg-black/75"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                {t("view3d.fullscreen.window")}
              </button>
              <button
                type="button"
                data-view3d-fullscreen-borderless
                aria-pressed={fullscreen === "borderless"}
                title={t("view3d.fullscreen.borderlessTitle")}
                onClick={() => void enterBorderlessFullscreen()}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-black/55 px-2 text-[11px] text-white/85 transition-colors hover:bg-black/75"
              >
                <Expand className="h-3.5 w-3.5" />
                {t("view3d.fullscreen.borderless")}
              </button>
              {fullscreen !== "none" && (
                <button
                  type="button"
                  data-view3d-fullscreen-exit
                  onClick={() => void exitFullscreen()}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-black/55 px-2 text-[11px] text-white/85 transition-colors hover:bg-black/75"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                  {t("view3d.fullscreen.exit")}
                </button>
              )}
            </div>

            <p
              data-view3d-fullscreen-hint
              className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/50 px-2 py-1 text-[11px] text-white/70"
            >
              {fullscreen === "window"
                ? t("view3d.fullscreen.windowActive")
                : fullscreen === "borderless"
                  ? t("view3d.fullscreen.borderlessActive")
                  : t("view3d.fullscreen.idleHint", { hint: t(VIEW3D_FULLSCREEN_HINT_KEY) })}
              {fullscreenNote ? `（${fullscreenNote}）` : ""}
            </p>
          </div>

          <aside
            style={asideLayoutStyle}
            className={cn(
              /**
               * 上下堆叠（窄窗口）时留白给足：视窗占了 70% 高度，这一块被压扁，
               * 而它本身有八段内容 —— `p-3`（12px）比标题栏的 `px-4`（16px）还窄，
               * 看起来就是「贴边」。宽窗口是 30% 侧栏、纵向本来有空间，维持 12px。
               */
              "flex min-h-0 shrink-0 flex-col gap-4 overflow-y-auto border-t p-4 lg:gap-3 lg:border-l lg:border-t-0 lg:p-3",
              THIN_BORDER_CLASS
            )}
          >
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">{t("view3d.model.fit")}</p>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5">
                {(["anima", "sdxl"] as ViewSeries[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    data-view3d-series={item}
                    aria-pressed={series === item}
                    onClick={() => {
                      setSeries(item);
                      applyRadius(SERIES_DEFAULT_RADIUS[item]);
                      // 换系列时把增强权重收敛到该系列上限（Anima 3 / SDXL 2）
                      clampEnhanceForSeries(item);
                    }}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                      series === item
                        ? cn("bg-background shadow-sm", ACCENT_SELECTED_SOFT_CLASS)
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {item === "anima" ? "Anima" : "SDXL"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-medium">{t("view3d.model.title")}</span>
                <span data-view3d-model-name className="max-w-[55%] truncate text-foreground">
                  {modelInfo?.fileName ?? t("view3d.model.builtin")}
                </span>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  data-view3d-pick-model
                  onClick={() => void handlePickModel()}
                  className={cn(
                    "inline-flex h-7 flex-1 items-center justify-center rounded-md bg-background text-[11px] transition-colors hover:bg-accent",
                    INPUT_BORDER_CLASS
                  )}
                >
                  {t("view3d.model.pick")}
                </button>
                <button
                  type="button"
                  data-view3d-reset-model
                  onClick={() => {
                    resetModel();
                    setCharacterSource(null);
                    setModelInfo(null);
                  }}
                  className={cn(
                    "inline-flex h-7 items-center justify-center rounded-md bg-background px-2 text-[11px] transition-colors hover:bg-accent",
                    INPUT_BORDER_CLASS
                  )}
                >
                  {t("view3d.model.reset")}
                </button>
              </div>

              {modelHistory.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {t("view3d.model.historyPrefix")}{modelHistory.length}）
                    </span>
                    <button
                      type="button"
                      data-view3d-clear-history
                      onClick={clearModelHistory}
                      className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {t("view3d.model.clearHistory")}
                    </button>
                  </div>
                  <ul
                    data-view3d-model-history
                    className={cn(
                      "max-h-28 space-y-0.5 overflow-y-auto rounded-md bg-muted/40 p-1",
                      INPUT_BORDER_CLASS
                    )}
                  >
                    {modelHistory.map((item) => (
                      <li key={item.path}>
                        <button
                          type="button"
                          data-view3d-history-item={item.path}
                          aria-current={storedModelPath === item.path}
                          title={item.path}
                          onClick={() => void applyModelPath(item.path)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-accent",
                            storedModelPath === item.path && cn("bg-background", ACCENT_SELECTED_SOFT_CLASS)
                          )}
                        >
                          <span className="min-w-0 truncate">{item.name}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatRelativeTime(item.at)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] text-muted-foreground">{t("view3d.facing.title")}</span>
                <div className="flex gap-0.5">
                  {VIEW3D_FACING_OPTIONS.map((angle) => (
                    <button
                      key={angle}
                      type="button"
                      data-view3d-facing={angle}
                      aria-pressed={facingOffset === angle}
                      onClick={() => setFacingOffset(angle)}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] transition-colors",
                        facingOffset === angle
                          ? cn("bg-background shadow-sm", ACCENT_SELECTED_SOFT_CLASS)
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {angle}°
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                {modelInfo?.error
                  ? `⚠ ${modelInfo.error}`
                  : modelInfo && modelInfo.height > 0
                    ? t("view3d.model.normalized", {
                      height: modelInfo.height.toFixed(2),
                      triangles: modelInfo.triangles.toLocaleString(),
                    })
                    : t("view3d.model.dropHint")}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">
                {t("view3d.preview.title")}
              </p>
              <p
                data-view3d-prompt
                className={cn(
                  "rounded-lg bg-muted/50 px-2.5 py-2 text-xs leading-relaxed break-words",
                  INPUT_BORDER_CLASS
                )}
              >
                {prompt}
              </p>
              <div className="space-y-0.5 text-[10px] text-muted-foreground">
                <p>
                  {t("view3d.preview.shot")}
                  <span data-view3d-part-shot className="font-mono text-foreground/80">
                    {formatWeightedTag(parts.shotTag)}
                  </span>
                </p>
                <p>
                  {t("view3d.preview.toward")}
                  <span data-view3d-part-toward className="font-mono text-foreground/80">
                    {parts.toward.map(formatWeightedTag).join(" ") || "—"}
                  </span>
                </p>
                <p>
                  {t("view3d.preview.angle")}
                  <span data-view3d-part-angle className="font-mono text-foreground/80">
                    {parts.angle.map(formatWeightedTag).join(" ") || t("view3d.preview.level")}
                  </span>
                </p>
              </div>
            </div>

            {/*
              附加词条（可选）：基础词表是「相机行为词」，这里补的是「观察方位词」。
              默认空 → 输出与需求文档逐字一致；建议词只做一键追加，不自动写入。
            */}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-muted-foreground">
                  {t("view3d.extra.title")}
                </p>
                {extraTags.trim() ? (
                  <button
                    type="button"
                    data-view3d-extra-clear
                    onClick={() => setExtraTags("")}
                    className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t("view3d.extra.clear")}
                  </button>
                ) : null}
              </div>
              <input
                type="text"
                data-view3d-extra
                aria-label={t("view3d.extra.title")}
                value={extraTags}
                onChange={(event) => setExtraTags(event.target.value)}
                placeholder={t("view3d.extra.placeholder")}
                className={cn(
                  "w-full rounded-lg bg-background px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground",
                  INPUT_BORDER_CLASS
                )}
              />
              {extraSuggestions.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                  <span>{t("view3d.extra.suggest")}</span>
                  {extraSuggestions.map((tag) => {
                    const active = extraTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        data-view3d-extra-suggest={tag}
                        data-view3d-extra-active={active ? "true" : "false"}
                        onClick={() =>
                          setExtraTags((previous) => toggleExtraTag(previous, tag))
                        }
                        className={cn(
                          "rounded px-1.5 py-0.5 font-mono transition-colors",
                          active
                            ? ACCENT_SELECTED_SOFT_CLASS
                            : cn("bg-muted hover:bg-accent", INPUT_BORDER_CLASS)
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <dl className="grid grid-cols-3 gap-1 text-[11px] text-muted-foreground">
              <div className="rounded bg-muted/40 px-2 py-1">
                <dt>{t("view3d.angle.azimuth")}</dt>
                <dd>
                  <input
                    type="number"
                    aria-label={t("view3d.angle.azimuth")}
                    data-view3d-azimuth
                    value={Number(view.azimuth.toFixed(0))}
                    onChange={(event) =>
                      applyAngles({ azimuth: Number(event.target.value) })
                    }
                    className="w-full bg-transparent font-mono text-foreground outline-none"
                  />
                </dd>
              </div>
              <div className="rounded bg-muted/40 px-2 py-1">
                <dt>{t("view3d.angle.elevation")}</dt>
                <dd>
                  <input
                    type="number"
                    aria-label={t("view3d.angle.elevation")}
                    data-view3d-elevation
                    min={-90}
                    max={90}
                    value={Number(view.elevation.toFixed(0))}
                    onChange={(event) =>
                      applyAngles({ elevation: Number(event.target.value) })
                    }
                    className="w-full bg-transparent font-mono text-foreground outline-none"
                  />
                </dd>
              </div>
              <div className="rounded bg-muted/40 px-2 py-1">
                <dt>{t("view3d.angle.radius")}</dt>
                <dd data-view3d-radius className="font-mono text-foreground">
                  {view.radius.toFixed(1)}
                </dd>
              </div>
            </dl>

            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">{t("view3d.quick.title")}</p>
              <div className="grid grid-cols-2 gap-1">
                {QUICK_VIEWS.map((quick) => (
                  <button
                    key={quick.id}
                    type="button"
                    data-view3d-quick={quick.id}
                    onClick={() => applyQuickView(quick.azimuth, quick.elevation)}
                    className={cn(
                      "rounded-md bg-background px-2 py-1 text-[11px] transition-colors hover:bg-accent",
                      INPUT_BORDER_CLASS
                    )}
                  >
                    {t(quick.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-medium">{t("view3d.radius.title")}</span>
                <span className="font-mono">{view.radius.toFixed(1)}</span>
              </div>
              <input
                type="range"
                aria-label={t("view3d.radius.label")}
                min={RADIUS_MIN}
                max={RADIUS_MAX}
                step={0.1}
                value={Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, view.radius))}
                onChange={(event) => applyRadius(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground"
              />
              <p className="text-[10px] text-muted-foreground">
                {t("view3d.radius.seriesDefault")}{SERIES_DEFAULT_RADIUS[series]}{t("view3d.radius.shotSuffix")} {parts.shot}
              </p>
            </div>

            <View3DEnhanceSection
              series={series}
              weights={enhanceWeights}
              shotTag={parts.shotTag}
              toward={parts.toward}
              angle={parts.angle}
              onChange={(axis, value) => setEnhanceWeight(axis, value, series)}
              onReset={resetEnhanceWeights}
            />

            <div className="mt-auto flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => applyQuickView(0, 0)}
                className={cn(
                  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-background text-xs transition-colors hover:bg-accent",
                  INPUT_BORDER_CLASS
                )}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("view3d.resetView")}
              </button>
              <button
                type="button"
                data-view3d-confirm
                onClick={() => {
                  onInsert(prompt);
                  onOpenChange(false);
                }}
                className={cn(
                  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-medium shadow transition-colors",
                  PRIMARY_BUTTON_CLASS
                )}
              >
                <Check className="h-4 w-4" />
                {t(CONFIRM_LABEL_KEYS[writeMode])}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </>,
    document.body
  );
}

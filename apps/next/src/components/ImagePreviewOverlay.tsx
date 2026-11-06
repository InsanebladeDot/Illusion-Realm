"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useIsHydrated } from "@/hooks/useIsHydrated";
import { useLocalImageSrc } from "@/hooks/useLocalImageSrc";
import { useTranslation } from "@/i18n";
import {
  getCachedLocalImageSrc,
  prefetchLocalImages,
} from "@/utils/localImageSrcCache";
import { cn } from "@/utils/cn";

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const SCALE_STEP = 0.2;

export type ImagePreviewItem = {
  key: string;
  src?: string | null;
  filePath?: string | null;
  alt?: string;
};

type ImagePreviewOverlayProps = {
  items: ImagePreviewItem[];
  index: number;
  onIndexChange?: (index: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 打开预览时已加载的缩略图地址，避免首帧空白 */
  seedSrc?: string | null;
  onItemContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    item: ImagePreviewItem
  ) => void;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
  moved: boolean;
};

const DRAG_CLICK_THRESHOLD_PX = 6;

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return (index + length) % length;
}

function resolveItemSrc(item: ImagePreviewItem): string | null {
  return item.src ?? getCachedLocalImageSrc(item.filePath) ?? null;
}

function PreviewGalleryImage({
  item,
  fallbackSrc,
  dragging,
  scale,
  translate,
  onDoubleClick,
  onResolved,
  onContextMenu,
}: {
  item: ImagePreviewItem;
  fallbackSrc: string | null;
  dragging: boolean;
  scale: number;
  translate: { x: number; y: number };
  onDoubleClick: () => void;
  onResolved: (src: string) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
}) {
  const cachedSrc = resolveItemSrc(item);
  // 已有生成预览地址时直接复用，不再为同图读取一份本地 base64。
  // filePath 仍留作文件身份和右键动作，不能为省读取而丢掉。
  // Hook 继续每次调用，传 null 只是禁用这次不需要的磁盘读取。
  const fileSrc = useLocalImageSrc(item.src ? null : item.filePath ?? null);
  const src = item.src ?? cachedSrc ?? fileSrc ?? fallbackSrc;
  const isResolved = Boolean(item.src ?? cachedSrc ?? fileSrc);
  const { t } = useTranslation();
  const alt = item.alt ?? t("components.imagePreviewOverlay.label");

  useEffect(() => {
    const resolved = item.src ?? cachedSrc ?? fileSrc;
    if (resolved) onResolved(resolved);
  }, [cachedSrc, fileSrc, item.src, onResolved]);

  if (!src) return null;

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={cn(
        "max-h-full max-w-full select-none object-contain transition-[opacity,transform] duration-150 ease-out",
        dragging ? "cursor-grabbing" : scale > 1 ? "cursor-grab" : "cursor-zoom-in",
        !isResolved && fallbackSrc ? "opacity-90" : "opacity-100"
      )}
      style={{
        transform: `translate3d(${translate.x}px, ${translate.y}px, 0) scale(${scale})`,
      }}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    />
  );
}

export function ImagePreviewOverlay({
  items,
  index,
  onIndexChange,
  open,
  onOpenChange,
  seedSrc = null,
  onItemContextMenu,
}: ImagePreviewOverlayProps) {
  const { t } = useTranslation();
  const isHydrated = useIsHydrated();
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [lastResolvedSrc, setLastResolvedSrc] = useState<string | null>(seedSrc);
  const dragRef = useRef<DragState | null>(null);
  const suppressBackdropClickRef = useRef(false);

  const hasGallery = items.length > 1;
  const currentItem = items[index] ?? items[0];

  useEffect(() => {
    if (!open || items.length === 0) return;

    const neighborPaths = [
      items[wrapIndex(index - 1, items.length)],
      items[wrapIndex(index + 1, items.length)],
      currentItem,
    ].map((item) => item?.src ? null : item?.filePath);
    // 邻图预取也跳过已有 src 的项，否则会绕开上方的读取去重。
    // 纯磁盘历史仍按路径预取，不牺牲原来的左右切图体验。
    // null 被原预取函数忽略，空列表边界无需新建加载器。
    // 此处只减少无用读盘，不提前释放任务队列持有的 Blob。
    // 不比较 URL 内容，相同文件的关联已由调用方用保存路径完成。
    // 预取不会改变作品列表或选中索引，加载与展示身份仍分开。
    // 上下文菜单继续收到完整 item，保留其可操作的文件路径。
    // 取消订阅和缓存清理沿用原 Hook 与缓存，不增加永久监听器。
    // 关闭浮层时原 effect 的 open 条件仍阻止后台预取。
    // 当前图和邻图遵守同一规则，避免放大后又出现重复读取。
    // src 为空字符串时仍允许磁盘回落，与加载条件一致。
    // 路径不存在时继续由原读取错误回落处理，不伪造成功图片。
    prefetchLocalImages(neighborPaths);
  // 当前项的 src 从无到有时也要刷新预取策略，不能只监听路径。
  // 使用完整当前项依赖，确保已有源时及时停止不必要的读盘。
  // items 已由调用方管理身份，此处不创建用于 effect 的镜像状态。
  }, [open, index, items, currentItem]);

  /**
   * 渲染期同步：当前图片变了就把「已解析的 src」切到新图可取到的值。
   * 用「记录前值 + 渲染期比较」替代 useEffect 里的 setState
   * （react-hooks/set-state-in-effect 会拦后者）——这是 React 官方推荐的
   * "adjusting state when a prop changes" 写法，语义等价且少一次级联渲染。
   */
  const [previousSrcKey, setPreviousSrcKey] = useState<string | null>(null);
  const srcKey = `${currentItem?.filePath ?? ""}|${seedSrc ?? ""}`;
  const immediateSrc = resolveItemSrc(currentItem) ?? seedSrc;
  if (immediateSrc && srcKey !== previousSrcKey) {
    setPreviousSrcKey(srcKey);
    setLastResolvedSrc(immediateSrc);
  }

  const handleResolved = useCallback((src: string) => {
    setLastResolvedSrc(src);
  }, []);

  /** 双击 / 点击「重置缩放」按钮：复位缩放与平移（事件处理器，非渲染期） */
  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  /**
   * 渲染期同步：切换图片或重新打开时把缩放/平移复位（原实现放在 effect 里）。
   * 打开与关闭都要复位，因此把 open 也纳入 key。
   */
  const [previousViewKey, setPreviousViewKey] = useState<string | null>(null);
  const viewKey = `${index}|${open}`;
  if (viewKey !== previousViewKey) {
    setPreviousViewKey(viewKey);
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }

  const goPrev = useCallback(() => {
    if (!hasGallery || !onIndexChange) return;
    onIndexChange(wrapIndex(index - 1, items.length));
  }, [hasGallery, index, items.length, onIndexChange]);

  const goNext = useCallback(() => {
    if (!hasGallery || !onIndexChange) return;
    onIndexChange(wrapIndex(index + 1, items.length));
  }, [hasGallery, index, items.length, onIndexChange]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange, goPrev, goNext]);

  const zoomBy = useCallback((delta: number) => {
    setScale((current) => clampScale(Number((current + delta).toFixed(2))));
  }, []);

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      zoomBy(event.deltaY > 0 ? -SCALE_STEP : SCALE_STEP);
    },
    [zoomBy]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        baseX: translate.x,
        baseY: translate.y,
        moved: false,
      };
      setDragging(true);
    },
    [translate.x, translate.y]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (
        !drag.moved &&
        Math.hypot(deltaX, deltaY) >= DRAG_CLICK_THRESHOLD_PX
      ) {
        drag.moved = true;
      }

      setTranslate({
        x: drag.baseX + deltaX,
        y: drag.baseY + deltaY,
      });
    },
    []
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      if (drag.moved) {
        suppressBackdropClickRef.current = true;
        window.setTimeout(() => {
          suppressBackdropClickRef.current = false;
        }, 0);
      }

      dragRef.current = null;
      setDragging(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    []
  );

  const closeIfBackdrop = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (suppressBackdropClickRef.current || dragging) return;
      if (event.target === event.currentTarget) {
        onOpenChange(false);
      }
    },
    [dragging, onOpenChange]
  );

  if (!open || !isHydrated || !currentItem) return null;

  const fallbackSrc =
    resolveItemSrc(currentItem) ?? seedSrc ?? lastResolvedSrc;

  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 top-[var(--window-chrome-height)] z-[100] flex flex-col bg-black/80 backdrop-blur-[1px]"
      data-image-preview-overlay
      onClick={closeIfBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={t("components.imagePreviewOverlay.label")}
    >
      <button
        type="button"
        aria-label={t("components.imagePreviewOverlay.close")}
        onClick={() => onOpenChange(false)}
        className="absolute right-4 top-4 z-[101] inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
      >
        <X className="h-5 w-5" />
      </button>

      {hasGallery ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-[101] -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs tabular-nums text-white">
          {index + 1} / {items.length}
        </div>
      ) : null}

      <div
        className="relative flex min-h-0 flex-1 cursor-zoom-out items-center justify-center overflow-hidden p-6 pt-14"
        onClick={closeIfBackdrop}
      >
        {hasGallery ? (
          <button
            type="button"
            aria-label={t("components.imagePreviewOverlay.previous")}
            onClick={goPrev}
            className="absolute left-4 top-1/2 z-[101] inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : null}

        <div
          className="flex h-full w-full cursor-zoom-out items-center justify-center overflow-hidden"
          onClick={closeIfBackdrop}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div
            className="inline-flex max-h-full max-w-full"
            onClick={(event) => event.stopPropagation()}
          >
            <PreviewGalleryImage
              key={currentItem.key}
              item={currentItem}
              fallbackSrc={fallbackSrc}
              dragging={dragging}
              scale={scale}
              translate={translate}
              onDoubleClick={resetView}
              onResolved={handleResolved}
              onContextMenu={(event) => {
                event.preventDefault();
                onItemContextMenu?.(event, currentItem);
              }}
            />
          </div>
        </div>

        {hasGallery ? (
          <button
            type="button"
            aria-label={t("components.imagePreviewOverlay.next")}
            onClick={goNext}
            className="absolute right-4 top-1/2 z-[101] inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        ) : null}
      </div>

      <div
        className="pointer-events-auto absolute bottom-6 left-1/2 z-[101] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-2 py-1.5 text-white shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label={t("components.imagePreviewOverlay.zoomOut")}
          onClick={() => zoomBy(-SCALE_STEP)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/15"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-12 px-1 text-center text-xs tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          aria-label={t("components.imagePreviewOverlay.zoomIn")}
          onClick={() => zoomBy(SCALE_STEP)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/15"
        >
          <Plus className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-white/20" aria-hidden />
        <button
          type="button"
          aria-label={t("components.imagePreviewOverlay.resetZoom")}
          onClick={resetView}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/15"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body
  );
}

type ImagePreviewTriggerProps = {
  items: ImagePreviewItem[];
  index: number;
  onIndexChange?: (index: number) => void;
  className?: string;
  imageClassName?: string;
  /** 复用调用方已经加载的图片节点，避免触发器再渲染一张缩略图 */
  children?: ReactNode;
  disabled?: boolean;
  onItemContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    item: ImagePreviewItem
  ) => void;
};

function PreviewTriggerImage({
  item,
  imageClassName,
}: {
  item: ImagePreviewItem;
  imageClassName?: string;
}) {
  const { t } = useTranslation();
  const cachedSrc = getCachedLocalImageSrc(item.filePath);
  // 内嵌主图使用与放大图相同的取源策略，已有预览不重复读本地文件。
  // 仍使用同一 Hook，纯历史图片继续受缓存与并发读取去重保护。
  // 传空路径不会改变 item 本身，文件右键能力保持完整。
  const fileSrc = useLocalImageSrc(item.src ? null : item.filePath ?? null);
  const src = item.src ?? cachedSrc ?? fileSrc;

  if (!src) return null;

  return (
    <img
      src={src}
      alt={item.alt ?? t("components.imagePreviewOverlay.label")}
      loading="lazy"
      className={cn("pointer-events-none h-full w-full object-contain", imageClassName)}
    />
  );
}

export function ImagePreviewTrigger({
  items,
  index,
  onIndexChange,
  className,
  imageClassName,
  children,
  disabled = false,
  onItemContextMenu,
}: ImagePreviewTriggerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [localIndex, setLocalIndex] = useState(index);
  const activeIndex = onIndexChange ? index : localIndex;
  const changeIndex = onIndexChange ?? setLocalIndex;
  const currentItem = items[activeIndex] ?? items[0];

  const cachedSrc = currentItem
    ? getCachedLocalImageSrc(currentItem.filePath)
    : null;
  // 触发器的首帧种子也优先复用 src，避免父组件偷偷再加载一份。
  // 图片子组件与大图层虽然各自订阅，但不会为预览发出冗余读盘请求。
  // 普通图库条目没有 src，仍走原先的路径缓存。
  const fileSrc = useLocalImageSrc(currentItem?.src ? null : currentItem?.filePath ?? null);
  const seedSrc = currentItem?.src ?? cachedSrc ?? fileSrc;

  useEffect(() => {
    if (items.length === 0) return;
    prefetchLocalImages([
      items[activeIndex],
      items[wrapIndex(activeIndex - 1, items.length)],
      items[wrapIndex(activeIndex + 1, items.length)],
    ].map((item) => item?.src ? null : item?.filePath));
    // 内嵌预取与弹层预取配套，否则不用打开弹层也会重复读取最新图。
    // 相邻的旧作品仍按需预取，修复不扩大为禁用整个历史缓存。
    // 外部传入的 src 由调用者负责生命周期，此组件不自行 revoke。
    // 去重仅针对同一个 item 已有可用源，不删除其他相似图片。
    // 当前最新结果、filmstrip 和结果卡可因此共用任务预览地址。
    // Chromium 的解码内存由浏览器管理，不能据此保证固定节省字节数。
    // 缓存里原已读取的历史数据不在这里强制清空，避免影响其他页面。
    // 数组与索引变化仍触发原 effect，不需要新增全局图片状态。
  }, [activeIndex, items]);

  if (!currentItem) return null;

  return (
    <>
      <button
        type="button"
        data-image-preview-trigger
        disabled={disabled}
        aria-label={t("components.imagePreviewOverlay.triggerLabel")}
        onClick={() => setOpen(true)}
        onContextMenu={(event) => {
          event.preventDefault();
          onItemContextMenu?.(event, currentItem);
        }}
        className={cn(
          "block h-full w-full cursor-zoom-in disabled:cursor-default",
          className
        )}
      >
        {children ?? <PreviewTriggerImage item={currentItem} imageClassName={imageClassName} />}
      </button>

      <ImagePreviewOverlay
        items={items}
        index={activeIndex}
        onIndexChange={changeIndex}
        open={open}
        onOpenChange={setOpen}
        seedSrc={seedSrc}
        onItemContextMenu={onItemContextMenu}
      />
    </>
  );
}

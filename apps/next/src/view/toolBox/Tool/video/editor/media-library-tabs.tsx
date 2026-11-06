"use client";

// 分类条沿用素材面板的类别状态，只替换紧凑布局，不创建另一份资源或工程。
// 像一排固定宽度的书脊：窗口变宽能看到更多项，窄时移动窗口而不压缩每项。
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Film, Music2, Type, Sparkles, Blend, Captions, Sticker, WandSparkles, SlidersHorizontal, Clapperboard, ContactRound, CircleDot, ChevronsRight, ChevronsLeft } from "lucide-react";
import { useTranslation } from "@/i18n";
import styles from "./editor.module.css";

// 固定身份与业务能力分开：能进入分类查看原因，不表示该类的导入或生成已经接通。
// 保留六个原有ID，历史素材选择与搜索不会因为顶栏改版被重置。
// 新类别没有填充演示卡片，继续由原面板显示未接通的真实说明。
const CATEGORIES = [
  { id: "media", icon: Film }, { id: "audio", icon: Music2 }, { id: "text", icon: Type },
  { id: "stickers", icon: Sticker }, { id: "effects", icon: Sparkles }, { id: "transitions", icon: Blend },
  { id: "subtitles", icon: Captions }, { id: "branding", icon: WandSparkles }, { id: "filters", icon: CircleDot },
  { id: "adjustments", icon: SlidersHorizontal }, { id: "templates", icon: Clapperboard }, { id: "avatars", icon: ContactRound },
] as const;
export type LibraryCategory = typeof CATEGORIES[number]["id"];

// 位置来自真实scrollLeft，箭头只在相应方向仍有内容时出现。
// 一像素余量吸收分数像素，不让最右边的箭头因为浮点尾数永远留着。
// ResizeObserver覆盖导航开合和面板宽度变化，不只监听系统窗口resize。
// 每个库实例单独持有ref与滚动范围，A库翻页不会移动B库。
export function MediaLibraryTabs({ value, onChange }: { value: LibraryCategory; onChange: (value: LibraryCategory) => void }) {
  const { t } = useTranslation(), viewport = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const node = viewport.current;
    if (node) setEdges({ left: node.scrollLeft > 1, right: node.scrollLeft + node.clientWidth < node.scrollWidth - 1 });
  }, []);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node); measure();
    return () => observer.disconnect();
  }, [measure]);
  const page = (direction: number) => {
    const node = viewport.current;
    node?.scrollBy({ left: direction * Math.max(48, node.clientWidth - 48), behavior: "instant" });
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = CATEGORIES.findIndex(item => item.id === value);
    const next = event.key === "Home" ? 0 : event.key === "End" ? CATEGORIES.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + CATEGORIES.length) % CATEGORIES.length;
    onChange(CATEGORIES[next].id);
    viewport.current?.querySelectorAll<HTMLButtonElement>("[data-library-category]")[next]?.focus({ preventScroll: true });
    viewport.current?.querySelectorAll<HTMLButtonElement>("[data-library-category]")[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  return <nav data-media-library-tabs className={styles.libraryTabs} aria-label={t("toolBox.editorUi.libraryCategories")}>
    {/* 固定分类：选中只变青色图标和文字，不使用大块底色、下划线或均分宽度。 */}
    <div ref={viewport} className={styles.libraryTabViewport} onScroll={measure} onKeyDown={key}>
      {CATEGORIES.map(({ id, icon: Icon }) => <button data-library-category={id} key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}><Icon size={17} aria-hidden="true" /><span>{t(`toolBox.editorUi.library_${id}`)}</span></button>)}
    </div>
    {/* 翻页箭头不属于类别集合，键盘首尾选择不会把它错当成一种资源。 */}
    {edges.left && <button data-library-page="left" className={styles.libraryPageLeft} type="button" aria-label={t("toolBox.editorUi.previousCategories")} onClick={() => page(-1)}><ChevronsLeft size={19} aria-hidden="true" /></button>}
    {edges.right && <button data-library-page="right" className={styles.libraryPageRight} type="button" aria-label={t("toolBox.editorUi.nextCategories")} onClick={() => page(1)}><ChevronsRight size={19} aria-hidden="true" /></button>}
  </nav>;
}

"use client";
import { HoverTip } from "@/components/hover-tip";


// 原提示词帮助按钮与原资源弹窗整体复用；这里只注入目标正文和表面配色。
// 资源库状态继续各自独立，画布不能因为打开画师库就改写创建页提示词。
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslation } from "@/i18n";
import { PROMPT_TOOLS, getPromptTool } from "@/data/promptTools";
import { TAG_LIBRARY_LIST, getTagLibraryByTool, type TagLibraryId } from "@/data/tagLibraries";
import type { PromptTabToolId } from "@/types/promptTabs";
import type { ImageWorkflowSeries } from "@/utils/comfy/imageWorkflow";
import { resolveToolWriteMode } from "@/utils/promptTarget";
import { cn } from "@/utils/cn";
import { DeferredDialog } from "@/components/deferred-dialog";
import { PromptCategoryButton } from "./prompt-category-button";
import categoryStyles from "./prompt-category-button.module.css";
import { CharacterPickerDialog } from "./CharacterPickerDialog";
const TagLibraryDialog = dynamic(() => import("./tagLibrary/TagLibraryDialog").then(module => module.TagLibraryDialog));
const View3DPromptDialog = dynamic(() => import("./view3d/View3DPromptDialog").then(module => module.View3DPromptDialog));
const PRIMARY_TOOLS: readonly PromptTabToolId[] = ["background", "view3d", "pose"];
const MEDIA_TOOLS = PROMPT_TOOLS.slice(0, 3).map(tool => tool.id);
const ALL_TOOLS = PROMPT_TOOLS.map(tool => tool.id);
const SHORT_LABELS = { background: "canvas.promptToolsScene", view3d: "canvas.promptTools3D", pose: "canvas.promptToolsAction" } as const;

interface Props {
  series: ImageWorkflowSeries;
  advancedPrompt: boolean;
  tone?: "default" | "neutral";
  mediaLayout?: boolean;
  onApply: (text: string, tool: PromptTabToolId) => void;
}

function toolLabel(id: PromptTabToolId) {
  if (id === "background" || id === "view3d" || id === "pose") return SHORT_LABELS[id];
  return getPromptTool(id).label;
}

/** 工具栏收起和展开都用同一个单行滚动区。 */
function ToolStrip({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const viewport = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const readEdges = useCallback(() => {
    const element = viewport.current;
    if (!element) return;
    const left = element.scrollLeft > 1;
    const right = element.scrollWidth - element.clientWidth - element.scrollLeft > 1;
    setEdges(previous => previous.left === left && previous.right === right ? previous : { left, right });
  }, []);
  useEffect(() => {
    const element = viewport.current;
    if (!element || !row.current) return;
    // 像量抽屉和里面的工具，窗口变窄或增删按钮都要重新判断溢出。
    const observer = new ResizeObserver(readEdges);
    observer.observe(element);
    observer.observe(row.current);
    return () => observer.disconnect();
  }, [readEdges]);
  function move(direction: -1 | 1) {
    const element = viewport.current;
    if (!element) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollBy({ left: direction * Math.max(48, element.clientWidth - 28), behavior: reduceMotion ? "instant" : "smooth" });
  }
  return <div data-prompt-tool-strip className="relative min-w-0 max-w-full">
    {/* 滚动时只移动标签，加减按钮始终留在工具栏外侧。 */}
    <div ref={viewport} data-prompt-tool-scroll onScroll={readEdges} className="overflow-x-auto [scrollbar-width:none]">
      <div ref={row} className="flex w-max items-center gap-1 px-1 py-1 whitespace-nowrap">{children}</div>
    </div>
    {edges.left && <StripArrow direction="left" label={t("canvas.promptToolsScrollLeft")} onClick={() => move(-1)} />}
    {edges.right && <StripArrow direction="right" label={t("canvas.promptToolsScrollRight")} onClick={() => move(1)} />}
  </div>;
}

function StripArrow({ direction, label, onClick }: { direction: "left" | "right"; label: string; onClick: () => void }) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;
  return <button type="button" data-prompt-tool-scroll-to={direction} aria-label={label} onClick={onClick}
    className={cn("absolute inset-y-1 z-20 flex w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-fill", direction === "left" ? "left-0" : "right-0")}>
    <Icon className="size-3.5" aria-hidden />
  </button>;
}

interface ToolbarItemProps {
  id: PromptTabToolId;
  listed: boolean;
  customizable: boolean;
  onOpen: (id: PromptTabToolId) => void;
  onToggle: (id: PromptTabToolId) => void;
}

function ToolbarItem({ id, listed, customizable, onOpen, onToggle }: ToolbarItemProps) {
  const { t } = useTranslation();
  const tool = getPromptTool(id);
  const label = t(toolLabel(id));
  return <div data-prompt-tool={id} data-prompt-tool-listed={listed} className={cn("relative shrink-0", customizable && "pr-2")}>
    {listed ? <HoverTip asChild layer="window" label={t(tool.rowTitle)}>
      <PromptCategoryButton {...{ [`data-${tool.rowTestId}-trigger`]: true }} aria-label={label}
        onClick={() => onOpen(id)}>{label}</PromptCategoryButton>
    </HoverTip> : <span className={categoryStyles.label}>{label}</span>}
    {/* 文字打开工具；角标独立操作，移出时不会顺带打开资源弹窗。 */}
    {customizable && <button type="button" data-prompt-tool-add={listed ? undefined : id} data-prompt-tool-remove={listed ? id : undefined}
      aria-label={t(listed ? "canvas.promptToolsRemove" : "canvas.promptToolsAdd", { label })}
      className="group/tool-mark absolute -top-0.5 right-0 z-10 inline-flex size-4 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-current"
      onClick={() => onToggle(id)}>
      {/* 圆底画在符号层，画布按钮的背景重置就不会盖住反馈。 */}
      <span aria-hidden className={cn("grid size-full place-items-center rounded-full text-xs font-bold leading-none transition-colors",
        "group-hover/tool-mark:bg-current/12 group-focus-visible/tool-mark:bg-current/12 group-active/tool-mark:bg-current/22 motion-reduce:transition-none",
        listed ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300")}>{listed ? "×" : "✓"}</span>
    </button>}
  </div>;
}

export function PromptTools({ series, advancedPrompt, tone = "default", mediaLayout = false, onApply }: Props) {
  const { t } = useTranslation();
  const [view3DOpen, setView3DOpen] = useState(false);
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false);
  const [openLibrary, setOpenLibrary] = useState<TagLibraryId | null>(null);
  const [byLayout, setByLayout] = useState<Partial<Record<ImageWorkflowSeries | "media", PromptTabToolId[]>>>({});
  const layout = mediaLayout ? "media" : series;
  const [editingLayout, setEditingLayout] = useState<typeof layout | null>(null);
  const editing = editingLayout === layout;
  const primary = mediaLayout ? MEDIA_TOOLS : PRIMARY_TOOLS;
  const extras = ALL_TOOLS.filter(id => !primary.includes(id));
  const selected = byLayout[layout] ?? (layout === "anima" ? extras : []);
  const order = layout === "anima" ? ALL_TOOLS : [...primary, ...extras];
  const listed = order.filter(id => primary.includes(id) || selected.includes(id));
  const unlisted = extras.filter(id => !selected.includes(id));
  const displayed = editing ? [...listed, ...unlisted] : listed;
  const toolbar = useRef<HTMLDivElement>(null);
  const toggleButton = useRef<HTMLButtonElement>(null);
  const openedByKeyboard = useRef(false);
  const toggleLabel = t(editing ? "canvas.promptToolsDone" : unlisted.length ? "canvas.promptToolsMore" : "canvas.promptToolsLess");
  useEffect(() => {
    if (!editing || !openedByKeyboard.current) return;
    openedByKeyboard.current = false;
    toolbar.current?.querySelector<HTMLButtonElement>("[data-prompt-tool-add], [data-prompt-tool-remove]")?.focus();
  }, [editing]);
  function closeEditor() {
    setEditingLayout(null);
    toggleButton.current?.focus({ preventScroll: true });
  }
  function toggleTool(id: PromptTabToolId) {
    // 和便签上的勾叉一样，一个角标立即改一项；下一次展开继续用已保存的本次选择。
    setByLayout(current => ({ ...current, [layout]: selected.includes(id)
      ? selected.filter(item => item !== id) : [...selected, id] }));
    closeEditor();
  }
  const openToolDialog = (toolId: PromptTabToolId) => {
    const tool = getPromptTool(toolId);
    if (tool.dialog === "character") setCharacterPickerOpen(true);
    else if (tool.dialog === "view3d") setView3DOpen(true);
    else {
      const library = getTagLibraryByTool(toolId);
      if (library) setOpenLibrary(library.id);
    }
  };
  return <>
      {/* 提示词工具栏：常显文字和待添加文字同排，开关留在滚动区之外。 */}
      <div ref={toolbar} data-create-prompt-tools data-canvas-popover={editing ? "" : undefined}
        className={cn("flex w-fit min-w-0 max-w-full items-center gap-2", tone === "neutral" ? "text-[var(--hy-text)]" : "text-foreground")}
        onKeyDown={event => {
          if (!editing || event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          closeEditor();
        }}>
        <ToolStrip>{displayed.map(id => <ToolbarItem key={id} id={id} listed={listed.includes(id)}
          customizable={editing && extras.includes(id)} onOpen={openToolDialog} onToggle={toggleTool} />)}</ToolStrip>
        <PromptCategoryButton ref={toggleButton} data-prompt-tools-more aria-expanded={editing}
          aria-label={unlisted.length && !editing ? `${toggleLabel} (+${unlisted.length})` : toggleLabel}
          className="shrink-0 tabular-nums"
          onClick={event => {
            if (editing) closeEditor();
            else {
              openedByKeyboard.current = event.detail === 0;
              setEditingLayout(layout);
            }
          }}>
          {editing || !unlisted.length ? toggleLabel : <span aria-hidden>+<span data-prompt-tools-count>{unlisted.length}</span></span>}
        </PromptCategoryButton>
      </div>

      {TAG_LIBRARY_LIST.map((library) => (
        <DeferredDialog key={library.id} open={openLibrary === library.id}>
        <TagLibraryDialog
          key={library.id}
          open={openLibrary === library.id}
          library={library}
          onOpenChange={(next) => setOpenLibrary(next ? library.id : null)}
          onApply={(text) => {
            onApply(text, library.tool);
          }}
        />
        </DeferredDialog>
      ))}

      <CharacterPickerDialog
        open={characterPickerOpen}
        onOpenChange={setCharacterPickerOpen}
        onApply={(text) => {
          // 高级组装模式下覆盖「角色」分类；普通模式下插入提示词框末尾
          onApply(text, "character");
        }}
      />

      <DeferredDialog open={view3DOpen}>
      <View3DPromptDialog
        open={view3DOpen}
        series={series === "sdxl" ? "sdxl" : "anima"}
        onOpenChange={setView3DOpen}
        writeMode={resolveToolWriteMode({ advancedPrompt, hasCustomTarget: false })}
        onInsert={(prompt) => onApply(prompt, "view3d")}
      />
      </DeferredDialog>

  </>;
}

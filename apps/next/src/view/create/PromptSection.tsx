"use client";

import { useState } from "react";
import {
  Camera,
  Info,
  Layers,
  Mountain,
  Palette,
  PersonStanding,
  Plus,
  Smile,
  Users,
} from "lucide-react";
import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import { useTranslation } from "@/i18n";
import { PROMPT_TOOLS, getPromptTool } from "@/data/promptTools";
import {
  TAG_LIBRARY_LIST,
  getTagLibraryByTool,
  type TagLibraryId,
} from "@/data/tagLibraries";
import { QuickPhraseDialog } from "@/view/create/QuickPhraseDialog";
import { PromptCollapseButton } from "@/view/create/PromptCollapseButton";
import { CharacterPickerDialog } from "@/view/create/CharacterPickerDialog";
import { PromptAssemblyPanel } from "@/view/create/promptAssembly/PromptAssemblyPanel";
import { TagLibraryDialog } from "@/view/create/tagLibrary/TagLibraryDialog";
import { View3DPromptDialog } from "@/view/create/view3d/View3DPromptDialog";
import { useCreateFormStore } from "@/stores/useCreateFormStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { applyToolPromptText, resolveToolWriteMode } from "@/utils/promptTarget";
import type { ViewSeries } from "@/utils/view3d/promptMapping";
import {
  ACCENT_FOCUS_RING_CLASS,
  ACCENT_SWITCH_ON_CLASS,
  INPUT_BORDER_CLASS,
  PROMPT_EDITOR_SCROLL_CLASS,
} from "@/utils/layout";
import { cn } from "@/utils/cn";
import type { PromptTabToolId } from "@/types/promptTabs";

/**
 * 工具 id → 图标（**表现层**，不进数据层）；
 * 按钮的文字、title、数据钩子、确认后写进哪个分类都在 `data/promptTools.ts` 的注册表里。
 */
const ROW_TOOL_ICONS: Record<PromptTabToolId, typeof Users> = {
  character: Users,
  pose: PersonStanding,
  background: Mountain,
  expression: Smile,
  view3d: Camera,
};

export function PromptSection({
  series = "anima",
}: {
  series?: ViewSeries;
}) {
  const { t } = useTranslation();
  const [autocomplete, setAutocomplete] = useState(true);
  const [quickPhraseDialogOpen, setQuickPhraseDialogOpen] = useState(false);
  const [view3DOpen, setView3DOpen] = useState(false);
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false);
  /** 静态标签库（动作 / 背景 / 表情）共用一份打开状态：同一时刻只会开一个 */
  const [openLibrary, setOpenLibrary] = useState<TagLibraryId | null>(null);
  /** 抽屉：收起后只保留标题行，减少空间占用 */
  const [collapsed, setCollapsed] = useState(false);
  /** 高级提示词组装（任务规范 v2.1）：开启后右侧面板切换为组装面板 */
  const advancedPrompt = useCreateFormStore((state) => state.advancedPrompt);
  const setAdvancedPrompt = useCreateFormStore((state) => state.setAdvancedPrompt);
  /** 宽屏（xl 及以上）右侧面板可见，组装面板挂到右栏；窄屏就地展开 */
  const isWideViewport = useMediaQuery("(min-width: 1280px)");

  const openQuickPhraseDialog = () => setQuickPhraseDialogOpen(true);

  /** 打开某个工具的弹窗：弹窗类型由工具注册表决定、库由库自己声明（加工具 / 加库都不用改这里） */
  const openToolDialog = (toolId: PromptTabToolId) => {
    const tool = getPromptTool(toolId);
    if (tool.dialog === "character") setCharacterPickerOpen(true);
    else if (tool.dialog === "view3d") setView3DOpen(true);
    else {
      const library = getTagLibraryByTool(toolId);
      if (library) setOpenLibrary(library.id);
    }
  };

  return (
    <>
      <div className="relative space-y-1.5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <label className="text-sm font-semibold" htmlFor="prompt-editor">
                {t("promptAssembly.editor.label")}
              </label>
              <button type="button" className="focus:outline-none" aria-label={t("promptAssembly.editor.helpLabel")}>
                <Info className="h-4 w-4 cursor-pointer text-muted-foreground opacity-80 hover:text-primary hover:opacity-100 md:h-4 md:w-4" />
              </button>
              <div className="flex items-center">
                <button
                  type="button"
                  role="switch"
                  aria-checked={autocomplete}
                  id="anima-autocomplete-toggle"
                  onClick={() => setAutocomplete((prev) => !prev)}
                  className={cn(
                    "peer inline-flex h-5 w-9 shrink-0 scale-[0.6] cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    autocomplete ? ACCENT_SWITCH_ON_CLASS : "bg-gray-300 dark:bg-gray-700"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform",
                      autocomplete ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </button>
                <label
                  className="cursor-pointer text-[10px] font-medium text-muted-foreground/60"
                  htmlFor="anima-autocomplete-toggle"
                >
                  {t("promptAssembly.editor.autocomplete")}
                </label>
              </div>

              {/* 高级提示词组装开关（关闭 = 单一输入框） */}
              <div className="flex items-center">
                <button
                  type="button"
                  role="switch"
                  aria-checked={advancedPrompt}
                  id="advanced-prompt-toggle"
                  data-advanced-prompt-toggle
                  onClick={() => setAdvancedPrompt(!advancedPrompt)}
                  className={cn(
                    "peer inline-flex h-5 w-9 shrink-0 scale-[0.6] cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    advancedPrompt ? ACCENT_SWITCH_ON_CLASS : "bg-gray-300 dark:bg-gray-700"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform",
                      advancedPrompt ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </button>
                <label
                  className="cursor-pointer text-[10px] font-medium text-muted-foreground/60"
                  htmlFor="advanced-prompt-toggle"
                >
                  {t("promptAssembly.editor.advanced")}
                </label>
                <button
                  type="button"
                  data-prompt-assemble-trigger
                  title={t("promptAssembly.editor.assembleTitle")}
                  aria-label={t("promptAssembly.title")}
                  aria-pressed={advancedPrompt}
                  onClick={() => setAdvancedPrompt(true)}
                  className={cn(
                    "ml-1 inline-flex h-6 items-center gap-1 rounded-md bg-background px-2 text-xs font-medium text-muted-foreground shadow-none transition-colors hover:bg-accent hover:text-foreground",
                    INPUT_BORDER_CLASS,
                    advancedPrompt && "text-[#6D28D9]"
                  )}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>{t("promptAssembly.editor.assemble")}</span>
                </button>
              </div>
            </div>
            <div className="inline-flex overflow-hidden rounded-md border md:hidden">
              <button
                type="button"
                onClick={openQuickPhraseDialog}
                className="inline-flex h-6 items-center justify-center rounded-none px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {t("promptAssembly.editor.phrases")}
              </button>
            </div>
            <div className="hidden overflow-hidden rounded-md border md:inline-flex">
              <button
                type="button"
                onClick={openQuickPhraseDialog}
                className="inline-flex h-6 items-center justify-center rounded-none px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {t("promptAssembly.editor.phrases")}
              </button>
              <div className="h-6 w-px bg-border" />
              <button
                type="button"
                aria-label={t("promptAssembly.editor.createPhrase")}
                onClick={openQuickPhraseDialog}
                className="inline-flex h-6 w-6 items-center justify-center rounded-none p-0 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <PromptCollapseButton
              collapsed={collapsed}
              onToggle={() => setCollapsed((prev) => !prev)}
              label={t("promptAssembly.editor.label")}
            />
          </div>

          {/* 收起 / 展开：内容不卸载（contentEditable 内容不随 React 状态保存），
              用 CollapsiblePanel 做「抽出来 / 收回去」的自然过渡 */}
          <CollapsiblePanel
            open={collapsed}
            stateAttribute="data-prompt-collapsed-hint"
            durationMs={260}
            contentClassName="pb-1.5"
          >
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="w-full rounded-lg bg-muted/40 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60"
            >
              {t("promptAssembly.editor.collapsedHint")}
            </button>
          </CollapsiblePanel>

          <CollapsiblePanel
            open={!collapsed}
            stateAttribute="data-prompt-editor-panel"
            className="relative"
          >
            <div
              id="prompt-editor"
              contentEditable={!advancedPrompt}
              suppressContentEditableWarning
              spellCheck={false}
              data-placeholder={
                advancedPrompt
                  ? t("promptAssembly.editor.placeholderAdvanced")
                  : t("promptAssembly.editor.placeholder")
              }
              className={cn(
                /**
                 * 这里原来还挂了一个 `dark:bg-primary-foreground` —— 那是**深色下写成了浅色**：
                 * `--primary-foreground` 是「主色上的文字色」（#fafafa），拿它当输入框底色，
                 * 深色模式下输入框会整块发白、正文变成浅字压白底。输入框的底色本来就该跟
                 * `--background` 走，深色下的层次由 `INPUT_BORDER_CLASS` 的描边给（与浅色一致）。
                 */
                "min-h-32 whitespace-pre-wrap break-words rounded-lg bg-background px-3 pb-10 pt-2 text-sm outline-none focus-visible:ring-1",
                PROMPT_EDITOR_SCROLL_CLASS,
                ACCENT_FOCUS_RING_CLASS,
                INPUT_BORDER_CLASS,
                advancedPrompt && "bg-muted/30 text-muted-foreground"
              )}
            />
          </CollapsiblePanel>

        </div>

        <div className="flex items-center gap-1">
          {/* 画师：占位入口（功能未开放，保持原样） */}
          <button
            type="button"
            className={cn(
              "inline-flex h-6 items-center justify-center gap-1.5 rounded-md bg-background px-2 text-xs font-medium text-muted-foreground shadow-none transition-colors hover:bg-accent hover:text-foreground",
              INPUT_BORDER_CLASS
            )}
          >
            <Palette className="h-3.5 w-3.5" />
            <span>{t("promptAssembly.tools.painter")}</span>
          </button>
          {/**
           * 既有功能入口：按钮由工具注册表生成（角色 / 动作库 / 背景库 / 表情库 / 3D 视角），
           * 顺序、文字、title 与数据钩子都在 `data/promptTools.ts` 里，加工具只改那一处。
           */}
          {PROMPT_TOOLS.map((tool) => {
            const Icon = ROW_TOOL_ICONS[tool.id];
            return (
              <button
                key={tool.id}
                type="button"
                {...{ [`data-${tool.rowTestId}-trigger`]: true }}
                title={t(tool.rowTitle)}
                aria-label={t(tool.label)}
                onClick={() => openToolDialog(tool.id)}
                className={cn(
                  "inline-flex h-6 items-center justify-center gap-1.5 rounded-md bg-background px-2 text-xs font-medium text-muted-foreground shadow-none transition-colors hover:bg-accent hover:text-foreground",
                  INPUT_BORDER_CLASS
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t(tool.label)}</span>
              </button>
            );
          })}
        </div>

        {/**
         * 窄屏（右侧面板被隐藏）时就地展开组装面板，避免高级模式下没有入口。
         *
         * 顺序刻意放在工具行**之后**：高级模式下组装面板本身很高，若仍夹在
         * 提示词框与「画师 / 角色 / 动作库 / 背景库 / 3D 视角」之间，会把工具行
         * 挤到滚动区下方，用户必须关闭高级才能看到入口。
         */}
        {advancedPrompt && !isWideViewport ? (
          <PromptAssemblyPanel
            variant="inline"
            series={series}
            onClose={() => setAdvancedPrompt(false)}
          />
        ) : null}
      </div>

      {/**
       * 静态标签库（动作库 / 背景库 / 表情库）：**同一条渲染路径**，
       * 有几个库、叫什么、确认后写进哪个分类都由 `data/tagLibraries.ts` 的声明表决定。
       * 高级组装模式下覆盖对应默认分类，普通模式下插入提示词框末尾（见 `applyToolPromptText`）。
       */}
      {TAG_LIBRARY_LIST.map((library) => (
        <TagLibraryDialog
          key={library.id}
          open={openLibrary === library.id}
          library={library}
          onOpenChange={(next) => setOpenLibrary(next ? library.id : null)}
          onApply={(text) => {
            applyToolPromptText(text, library.tool);
            setCollapsed(false);
          }}
        />
      ))}

      <CharacterPickerDialog
        open={characterPickerOpen}
        onOpenChange={setCharacterPickerOpen}
        onApply={(text) => {
          // 高级组装模式下覆盖「角色」分类；普通模式下插入提示词框末尾
          applyToolPromptText(text, "character");
          setCollapsed(false);
        }}
      />

      <View3DPromptDialog
        open={view3DOpen}
        series={series}
        onOpenChange={setView3DOpen}
        writeMode={resolveToolWriteMode({ advancedPrompt, hasCustomTarget: false })}
        onInsert={(prompt) => applyToolPromptText(prompt, "view3d")}
      />

      <QuickPhraseDialog
        open={quickPhraseDialogOpen}
        onOpenChange={setQuickPhraseDialogOpen}
      />
    </>
  );
}

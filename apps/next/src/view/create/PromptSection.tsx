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
  ACCENT_SWITCH_ON_CLASS,
  INPUT_BORDER_CLASS,
} from "@/utils/layout";
import { cn } from "@/utils/cn";
import type { PromptTabToolId } from "@/types/promptTabs";
// 正向输入与编辑器共用表面和助手，保留按 id 命令式读写的原有工具契约。
// 无 value 模式不接管正文，普通 React 重绘不能擦除工具填入的提示词。
// 高级组装使用只读表面，真实分类编辑仍由原组装面板承载。
import { PromptInput } from "@/components/prompt-input";
import { LoraTriggerWordsButton } from "./lora-trigger-words-button";

/**
 * 工具 id → 图标（**表现层**，不进数据层）；
 * 按钮的文字、title、数据钩子、确认后写进哪个分类都在 `data/promptTools.ts` 的注册表里。
 */
const ROW_TOOL_ICONS: Record<PromptTabToolId, typeof Users> = {
  // 画师同样由注册表驱动，图标只作为表现层映射。
  artist: Palette,
  character: Users,
  pose: PersonStanding,
  background: Mountain,
  expression: Smile,
  view3d: Camera,
};

export function PromptSection({
  series = "anima",
  loraIds = [],
  sideVisible,
}: {
  series?: ViewSeries;
  loraIds?: string[];
  sideVisible?: boolean;
}) {
  const { t } = useTranslation();
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
  const fallbackWide = useMediaQuery("(min-width: 1280px)");
  const isWideViewport = sideVisible ?? fallbackWide;

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
      <div data-create-prompt className="relative space-y-3">
        <div className="space-y-2">
          {/* 提示词标题栏：左侧标题、帮助、高级和组装保持一行，右侧留给触发词操作。 */}
          {/* 删除的自动补全仅有局部开关状态，没有输入处理或订阅需要清理。 */}
          {/* nowrap 防止高级开关掉到第二行，把右侧触发词按钮挤到垂直居中。 */}
          {/* 标题栏和正文的生命周期分离，重新排版不卸载已有 contentEditable。 */}
          {/* 高级开关继续修改原 store；组装按钮仍切换原来的侧边组装面板。 */}
          {/* LoRA 操作继续读取已选模型旁车文件，位置调整不改变触发词去重规则。 */}
          {/* 无 LoRA 时原按钮自行隐藏，腾出的空间直接交给左侧，不留下占位。 */}
          {/* 收起仍用原 PromptCollapseButton，不新增另一份展开状态或点击监听。 */}
          {/* 左侧整组禁止缩小，较窄 rail 也不把“提示词”“高级”拆成竖排文本。 */}
          {/* 缩小组间距而非缩放整块 UI，保留原按钮命中高度和焦点样式。 */}
          {/* 标题 label 仍关联 prompt-editor，鼠标点击标题可以定位原输入表面。 */}
          {/* 帮助按钮保留原辅助名称，紧凑布局不将它改成不可聚焦装饰。 */}
          {/* 所有文案继续使用已有翻译词条，删除开关不清理其他编辑器共用的词条。 */}
          {/* 开合按钮与触发词按钮都用原生 button，Tab 和 Enter 的路径保持有效。 */}
          {/* 自动补全状态未持久化，删除不会修改用户保存的提示词或设置文档。 */}
          <div data-create-prompt-header className="flex items-center justify-between gap-1 whitespace-nowrap">
            <div className="flex shrink-0 items-center gap-1">
              <label className="text-sm font-semibold" htmlFor="prompt-editor">
                {t("promptAssembly.editor.label")}
              </label>
              <button type="button" className="focus:outline-none" aria-label={t("promptAssembly.editor.helpLabel")}>
                <Info className="h-4 w-4 cursor-pointer text-muted-foreground opacity-80 hover:text-primary hover:opacity-100 md:h-4 md:w-4" />
              </button>
              {/* 高级提示词组装开关（关闭 = 单一输入框） */}
              <div className="flex min-h-8 items-center gap-1.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={advancedPrompt}
                  id="advanced-prompt-toggle"
                  data-advanced-prompt-toggle
                  onClick={() => setAdvancedPrompt(!advancedPrompt)}
                  className={cn(
                    "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
                  className="flex min-h-8 cursor-pointer items-center text-xs font-medium text-muted-foreground"
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
                    "ml-1 inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-md bg-background px-2 text-xs font-medium text-muted-foreground shadow-none transition-colors hover:bg-accent hover:text-foreground",
                    INPUT_BORDER_CLASS,
                    advancedPrompt && "text-[#6D28D9]"
                  )}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>{t("promptAssembly.editor.assemble")}</span>
                </button>
              </div>
            </div>
            {/* 界面：已选 LoRA 的 JSON 触发词，普通与高级模式复用同一写入入口。 */}
            {/* 右侧操作区：自动左边距将应用触发词推到标题栏右侧，不受左侧标签长度影响。 */}
            {/* 两个入口共用这一个行内容器，折叠箭头不会单独挤占额外一行。 */}
            <div className="ml-auto flex shrink-0 items-center gap-1">
            <LoraTriggerWordsButton ids={loraIds} onApplied={() => setCollapsed(false)} />
            <PromptCollapseButton
              collapsed={collapsed}
              onToggle={() => setCollapsed((prev) => !prev)}
              label={t("promptAssembly.editor.label")}
            />
            </div>
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
            {/* 界面：统一提示词输入；保留原 id，片段、LoRA 触发词和生成继续读取同一 DOM。
                组装模式只锁住表面并隐藏助手，不创建另一份提示词状态。
                主题底色统一走 background，避免深色模式复用文字色而整块发白。
                展开收起仍保留原 CollapsiblePanel，提示词不随折叠卸载。
                输入组件不提供 value，既有工具直接写 DOM 的内容不会被覆盖。
                禁用只影响交互，原有已组装文本仍可从相同 id 读取。 */}
            <PromptInput id="prompt-editor" disabled={advancedPrompt} assistant={!advancedPrompt} data-placeholder={advancedPrompt ? t("promptAssembly.editor.placeholderAdvanced") : t("promptAssembly.editor.placeholder")} className={cn(advancedPrompt && "bg-muted/30 text-muted-foreground")} />
          </CollapsiblePanel>

        </div>

        <div data-create-prompt-tools className="grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-2">
          {/* 界面：「片段」沿用原来的快捷片段编辑弹窗。 */}
          <button type="button" title={t("promptAssembly.editor.createPhrase")} onClick={openQuickPhraseDialog} className="inline-flex min-h-8 items-center justify-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground"><Plus className="h-3.5 w-3.5" />{t("promptAssembly.editor.phrases")}</button>
          {/* 界面：画师与其他库统一从工具注册表生成，不再手写占位入口。 */}
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
                  "inline-flex min-h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-background px-2 text-xs font-medium text-muted-foreground shadow-none transition-colors hover:bg-accent hover:text-foreground",
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

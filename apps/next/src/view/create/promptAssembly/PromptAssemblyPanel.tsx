"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  Check,
  Copy,
  Layers,
  Mountain,
  Plus,
  RotateCcw,
  Save,
  Smile,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { PROMPT_TAB_MAX } from "@/data/promptTabs";
import { PROMPT_TOOL_IDS, getPromptTool, promptToolsForTab } from "@/data/promptTools";
import {
  TAG_LIBRARY_LIST,
  getTagLibraryByTool,
  type TagLibraryId,
} from "@/data/tagLibraries";
import { useCreateFormStore } from "@/stores/useCreateFormStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import { CharacterPickerDialog } from "@/view/create/CharacterPickerDialog";
import { TagLibraryDialog } from "@/view/create/tagLibrary/TagLibraryDialog";
import { View3DPromptDialog } from "@/view/create/view3d/View3DPromptDialog";
import { copyText } from "@/utils/charactersFormat";
import { assemblePrompt, countFilledTabs, isTabFilled } from "@/utils/promptTabs";
import { setEditableText } from "@/utils/promptEditor";
import {
  PROMPT_EDITOR_ID,
  applyToolPromptText,
  resolveToolWriteMode,
} from "@/utils/promptTarget";
import type { ViewSeries } from "@/utils/view3d/promptMapping";
import {
  ACCENT_FOCUS_RING_CLASS,
  ACCENT_SELECTED_SOFT_CLASS,
  INPUT_BORDER_CLASS,
  THIN_BORDER_CLASS,
  THIN_DIVIDER_CLASS,
} from "@/utils/layout";
import { cn } from "@/utils/cn";
import type { PromptTab, PromptTabToolId } from "@/types/promptTabs";

/**
 * 工具 id → 图标。文案与数据钩子都在 `data/promptTools.ts` 的注册表里，
 * 这里只放**表现层**的东西（图标是组件，不进数据层）。
 */
const TOOL_ICONS: Record<PromptTabToolId, typeof Users> = {
  character: Users,
  pose: Tag,
  background: Mountain,
  expression: Smile,
  view3d: Camera,
};

/**
 * 自定义分类的「工具」区：挂载开关（可多选）+ 已挂载工具的调用按钮。
 *
 * 为什么自定义分类需要这一块：默认 8 大分类与工具是**写死一对一**的（角色库 → 角色分类…），
 * 而自定义分类（例如「1」）本身没有内容来源 —— 用户要的是「让它也能用这些既有功能，
 * 而且能用好几个」，调用的结果就写进这个分类。
 */
function CustomTabTools({
  tab,
  onOpenTool,
  onToggleTool,
}: {
  tab: PromptTab;
  onOpenTool: (tabId: string, toolId: PromptTabToolId) => void;
  onToggleTool: (tabId: string, toolId: PromptTabToolId) => void;
}) {
  const { t } = useTranslation();
  const attached = tab.tools ?? [];

  return (
    <div data-prompt-tab-tools={tab.id} className="space-y-1.5">
      {attached.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {attached.map((toolId) => {
            const tool = getPromptTool(toolId);
            const Icon = TOOL_ICONS[tool.id];
            return (
              <button
                key={tool.id}
                type="button"
                data-prompt-tool={tool.panelTestId}
                onClick={() => onOpenTool(tab.id, tool.id)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md bg-background px-2 text-[11px] font-medium transition-colors hover:bg-accent",
                  INPUT_BORDER_CLASS
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(tool.label)}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground">
          {t("promptAssembly.customTab.toolsEmpty")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] text-muted-foreground">
          {t("promptAssembly.customTab.toolsLabel")}
        </span>
        {PROMPT_TOOL_IDS.map((toolId) => {
          const tool = getPromptTool(toolId);
          const selected = attached.includes(tool.id);
          return (
            <button
              key={tool.id}
              type="button"
              data-prompt-tab-tool-toggle={tool.id}
              aria-pressed={selected}
              onClick={() => onToggleTool(tab.id, tool.id)}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] transition-colors",
                selected
                  ? cn("font-medium", ACCENT_SELECTED_SOFT_CLASS)
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {selected ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              {t(tool.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 提示词组装面板（任务规范 v2.1 · 方案 A）：
 * 宽屏时占用创作页右侧原本的图库位置（`variant="panel"`），
 * 窄屏（右栏被隐藏）时就地展开在提示词框下方（`variant="inline"`），
 * 保证任何窗口尺寸下都只有一份面板实例在 DOM 中。
 *
 * 合并结果会实时同步回中间的提示词框（`#prompt-editor`），
 * 因此生成、二创、角色/3D 插入等既有链路完全不用改。
 */
export function PromptAssemblyPanel({
  onClose,
  variant = "panel",
  series = "anima",
}: {
  onClose: () => void;
  variant?: "panel" | "inline";
  /** 3D 视角生成器按当前模型系列取景别阈值 */
  series?: ViewSeries;
}) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const tabs = useCreateFormStore((state) => state.promptTabs);
  const activeTabId = useCreateFormStore((state) => state.activePromptTabId);
  const templates = useCreateFormStore((state) => state.promptTemplates);
  const setActiveTab = useCreateFormStore((state) => state.setActivePromptTab);
  const setTabContent = useCreateFormStore((state) => state.setPromptTabContent);
  const appendToTab = useCreateFormStore((state) => state.appendToPromptTab);
  const addTab = useCreateFormStore((state) => state.addPromptTab);
  const removeTab = useCreateFormStore((state) => state.removePromptTab);
  const setQuickWords = useCreateFormStore(
    (state) => state.setPromptTabQuickWords
  );
  const saveTemplate = useCreateFormStore((state) => state.savePromptTemplate);
  const deleteTemplate = useCreateFormStore(
    (state) => state.deletePromptTemplate
  );
  const applyTemplate = useCreateFormStore((state) => state.applyPromptTemplate);
  const toggleTabTool = useCreateFormStore((state) => state.togglePromptTabTool);

  const [newTabLabel, setNewTabLabel] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [editingQuickWords, setEditingQuickWords] = useState(false);
  const [newQuickWord, setNewQuickWord] = useState("");
  /**
   * 已有功能入口：3D 视角、角色选择器，以及**静态标签库**（动作 / 背景 / 表情 —— 三者同一套弹窗，
   * 由声明表 `TAG_LIBRARY_LIST` 决定有几个、叫什么、数据从哪来）。
   */
  const [view3DOpen, setView3DOpen] = useState(false);
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false);
  const [openLibrary, setOpenLibrary] = useState<TagLibraryId | null>(null);
  /**
   * 工具结果的落点分类：**从自定义分类里发起**时记下那个分类的 id，
   * 工具的确认结果就写进它；默认分类保持原有的固定绑定（传 undefined）。
   */
  const [toolTargetTabId, setToolTargetTabId] = useState<string | null>(null);

  const activeTab =
    tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null;
  const merged = useMemo(() => assemblePrompt(tabs), [tabs]);
  const filled = countFilledTabs(tabs);
  /** 当前分类（默认分类）固定绑定的工具：由注册表的 `defaultTab` 反查 */
  const tabTools =
    activeTab && !activeTab.custom ? promptToolsForTab(activeTab.id) : [];

  /** 合并结果实时同步到中间提示词框（生成/二创走的是同一个框） */
  useEffect(() => {
    setEditableText(PROMPT_EDITOR_ID, merged);
  }, [merged]);

  const handleCopy = async () => {
    if (!merged) {
      showToast(t("promptAssembly.merged.empty"), "error");
      return;
    }
    const ok = await copyText(merged);
    showToast(ok ? t("promptAssembly.merged.copied") : t("common.copyFailed"), ok ? "success" : "error");
  };

  /** 打开某个工具对话框（落点由调用方先设好）：弹窗类型由工具注册表决定，库由库自己声明 */
  const openToolDialog = (toolId: PromptTabToolId) => {
    const tool = getPromptTool(toolId);
    if (tool.dialog === "character") setCharacterPickerOpen(true);
    else if (tool.dialog === "view3d") setView3DOpen(true);
    else {
      const library = getTagLibraryByTool(toolId);
      if (library) setOpenLibrary(library.id);
    }
  };

  /** 从**自定义分类**里发起工具：先记下落点分类，再开对话框 */
  const openToolFromTab = (tabId: string, toolId: PromptTabToolId) => {
    setToolTargetTabId(tabId);
    openToolDialog(toolId);
  };

  /** 工具确认：写进落点分类；没有落点（默认分类那条路径）就按固定绑定 */
  const applyToolResult = (toolId: PromptTabToolId, text: string) => {
    const targetTab = toolTargetTabId
      ? tabs.find((tab) => tab.id === toolTargetTabId) ?? null
      : null;
    if (targetTab) {
      /**
       * 自定义分类上**追加**而不是替换：它可能同时挂了好几个工具，
       * 替换会让「后调用的那个」把前一个的结果清掉 —— 那正是这个功能要解决的问题。
       */
      appendToTab(text, targetTab.id);
      showToast(t("promptAssembly.tools.coveredCustom", { label: targetTab.label }));
    } else {
      applyToolPromptText(text, toolId);
      showToast(t(getPromptTool(toolId).covered));
    }
    setToolTargetTabId(null);
  };

  const handleAddTab = () => {
    const label = newTabLabel.trim();
    if (!label) {
      showToast(t("promptAssembly.customTab.nameRequired"), "error");
      return;
    }
    if (!addTab(label)) {
      showToast(t("promptAssembly.customTab.limit", { max: PROMPT_TAB_MAX }), "error");
      return;
    }
    setNewTabLabel("");
    showToast(t("promptAssembly.customTab.added", { label }));
  };

  const handleSaveTemplate = () => {
    const name = templateName.trim();
    if (!name) {
      showToast(t("promptAssembly.template.nameRequired"), "error");
      return;
    }
    saveTemplate(name);
    setTemplateName("");
    showToast(t("promptAssembly.template.saved", { name }));
  };

  return (
    <div
      data-prompt-assembly
      data-prompt-assembly-variant={variant}
      className={cn(
        "flex min-h-0 w-full flex-col overflow-hidden bg-background",
        variant === "panel"
          ? "h-full"
          : cn("max-h-[70vh] rounded-xl", THIN_BORDER_CLASS)
      )}
    >
      <header
        className={cn(
          "flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2",
          THIN_DIVIDER_CLASS
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Layers className="h-4 w-4 shrink-0 text-[#8B5CF6]" />
          <span className="truncate text-sm font-semibold">{t("promptAssembly.title")}</span>
          <span
            data-prompt-assembly-filled
            className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
          >
            {filled}/{tabs.length} {t("promptAssembly.filled")}
          </span>
        </div>
        <button
          type="button"
          data-prompt-assembly-close
          onClick={onClose}
          title={variant === "panel" ? t("promptAssembly.close.title") : t("promptAssembly.close.inlineTitle")}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {variant === "panel" ? t("promptAssembly.close.back") : t("promptAssembly.close.collapse")}
        </button>
      </header>

      {/* 分类 Tab（带已填角标） */}
      <div
        data-prompt-tab-bar
        className={cn(
          "flex shrink-0 flex-wrap gap-1 border-b px-2 py-2",
          THIN_DIVIDER_CLASS
        )}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTab?.id;
          return (
            <span key={tab.id} className="inline-flex items-center">
              <button
                type="button"
                data-prompt-tab={tab.id}
                aria-pressed={active}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-l-md px-2 text-[11px] transition-colors",
                  tab.custom && "rounded-l-md",
                  active
                    ? cn("bg-background shadow-sm", ACCENT_SELECTED_SOFT_CLASS)
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {tab.label}
                {isTabFilled(tab) ? (
                  <span
                    data-prompt-tab-badge={tab.id}
                    className="h-1.5 w-1.5 rounded-full bg-[#A78BFA]"
                  />
                ) : null}
              </button>
              {tab.custom ? (
                <button
                  type="button"
                  data-prompt-tab-remove={tab.id}
                  aria-label={t("promptAssembly.tab.removeLabel", { label: tab.label })}
                  onClick={() => removeTab(tab.id)}
                  className={cn(
                    "inline-flex h-7 items-center rounded-r-md px-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    active && "bg-background"
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 [scrollbar-width:thin]">
        {/* 当前分类输入框 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">
              {activeTab?.label ?? t("promptAssembly.tab.fallback")} {t("promptAssembly.tab.contentSuffix")}
            </span>
            <button
              type="button"
              data-prompt-quick-edit
              onClick={() => setEditingQuickWords((prev) => !prev)}
              className={cn(
                "text-[10px] transition-colors",
                editingQuickWords
                  ? "font-medium text-[#6D28D9]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {editingQuickWords ? t("promptAssembly.quickWords.doneEditing") : t("promptAssembly.quickWords.edit")}
            </button>
          </div>
          <textarea
            data-prompt-tab-input
            aria-label={t("promptAssembly.tab.inputLabel", {
              label: activeTab?.label ?? t("promptAssembly.tab.fallback"),
            })}
            value={activeTab?.content ?? ""}
            onChange={(event) =>
              activeTab && setTabContent(activeTab.id, event.target.value)
            }
            rows={5}
            placeholder={t("promptAssembly.tab.placeholder", { label: activeTab?.label ?? "" })}
            className={cn(
              "w-full resize-y rounded-lg bg-background px-2.5 py-2 text-xs leading-relaxed outline-none",
              ACCENT_FOCUS_RING_CLASS,
              INPUT_BORDER_CLASS
            )}
          />
        </div>

        {/**
         * 自定义分类的「工具」区：可挂多个既有工具，调用结果写进**本分类**。
         * 默认分类不需要（它们的工具是固定绑定，见下面那段）。
         */}
        {activeTab?.custom ? (
          <CustomTabTools
            tab={activeTab}
            onOpenTool={openToolFromTab}
            onToggleTool={toggleTabTool}
          />
        ) : null}

        {/**
         * 分类对应的既有工具（默认分类与工具是固定一对一，写在 `data/promptTools.ts` 的 `defaultTab`）。
         * 这里**按注册表渲染**：加工具/加库都不用改这段。
         */}
        {activeTab && tabTools.length > 0 ? (
          <div
            data-prompt-tab-tools={activeTab.id}
            className="flex flex-wrap items-center gap-1"
          >
            {tabTools.map((tool) => {
              const Icon = TOOL_ICONS[tool.id];
              return (
                <button
                  key={tool.id}
                  type="button"
                  data-prompt-tool={tool.panelTestId}
                  title={t(tool.panelTitle)}
                  onClick={() => {
                    setToolTargetTabId(null);
                    openToolDialog(tool.id);
                  }}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md bg-background px-2 text-[11px] font-medium transition-colors hover:bg-accent",
                    INPUT_BORDER_CLASS
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(tool.label)}
                </button>
              );
            })}
            <span className="text-[10px] text-muted-foreground">
              {t("promptAssembly.tools.coverPrefix")}{activeTab.label}{t("promptAssembly.tools.coverSuffix")}
            </span>
          </div>
        ) : null}

        {/* 快捷插入词 */}
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            {t("promptAssembly.quickWords.title")}
          </span>
          <div
            data-prompt-quick-words
            className="flex flex-wrap gap-1"
          >
            {(activeTab?.quickWords ?? []).map((word) => (
              <span key={word} className="inline-flex items-center">
                <button
                  type="button"
                  data-prompt-quick-word={word}
                  onClick={() => appendToTab(word, activeTab?.id)}
                  className={cn(
                    "inline-flex h-6 items-center rounded-md bg-background px-2 text-[11px] transition-colors hover:bg-accent",
                    INPUT_BORDER_CLASS
                  )}
                >
                  {word}
                </button>
                {editingQuickWords ? (
                  <button
                    type="button"
                    aria-label={t("promptAssembly.quickWords.removeLabel", { word })}
                    onClick={() =>
                      activeTab &&
                      setQuickWords(
                        activeTab.id,
                        activeTab.quickWords.filter((item) => item !== word)
                      )
                    }
                    className="inline-flex h-6 items-center px-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            ))}
            {editingQuickWords ? (
              <span className="inline-flex items-center gap-1">
                <input
                  data-prompt-quick-word-input
                  value={newQuickWord}
                  onChange={(event) => setNewQuickWord(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    const word = newQuickWord.trim();
                    if (!word || !activeTab) return;
                    if (!activeTab.quickWords.includes(word)) {
                      setQuickWords(activeTab.id, [...activeTab.quickWords, word]);
                    }
                    setNewQuickWord("");
                  }}
                  placeholder={t("promptAssembly.quickWords.inputPlaceholder")}
                  className={cn(
                    "h-6 w-32 rounded-md bg-background px-2 text-[11px] outline-none",
                    INPUT_BORDER_CLASS
                  )}
                />
              </span>
            ) : null}
          </div>
        </div>

        {/* 自定义分类 */}
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            {t("promptAssembly.customTab.titlePrefix")} {PROMPT_TAB_MAX} {t("promptAssembly.customTab.titleSuffix")}
          </span>
          <div className="flex items-center gap-1">
            <input
              data-prompt-new-tab
              value={newTabLabel}
              onChange={(event) => setNewTabLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddTab();
                }
              }}
              placeholder={t("promptAssembly.customTab.placeholder")}
              className={cn(
                "h-7 min-w-0 flex-1 rounded-md bg-background px-2 text-[11px] outline-none",
                INPUT_BORDER_CLASS
              )}
            />
            <button
              type="button"
              data-prompt-add-tab
              onClick={handleAddTab}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-background px-2 text-[11px] transition-colors hover:bg-accent",
                INPUT_BORDER_CLASS
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("promptAssembly.customTab.add")}
            </button>
          </div>
        </div>

        {/* 模板管理 */}
        <div className={cn("space-y-1 rounded-lg p-2", THIN_BORDER_CLASS)}>
          <span className="text-[11px] font-medium text-muted-foreground">
            {t("promptAssembly.template.title")}
          </span>
          <div className="flex items-center gap-1">
            <input
              data-prompt-template-name
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSaveTemplate();
                }
              }}
              placeholder={t("promptAssembly.template.namePlaceholder")}
              className={cn(
                "h-7 min-w-0 flex-1 rounded-md bg-background px-2 text-[11px] outline-none",
                INPUT_BORDER_CLASS
              )}
            />
            <button
              type="button"
              data-prompt-template-save
              onClick={handleSaveTemplate}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-background px-2 text-[11px] transition-colors hover:bg-accent",
                INPUT_BORDER_CLASS
              )}
            >
              <Save className="h-3.5 w-3.5" />
              {t("promptAssembly.template.save")}
            </button>
          </div>
          {templates.length > 0 ? (
            <div className="flex items-center gap-1">
              <select
                data-prompt-template-select
                aria-label={t("promptAssembly.template.selectLabel")}
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                className={cn(
                  "h-7 min-w-0 flex-1 rounded-md bg-background px-2 text-[11px] outline-none",
                  INPUT_BORDER_CLASS
                )}
              >
                <option value="">{t("promptAssembly.template.selectPlaceholder")}</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-prompt-template-apply
                disabled={!selectedTemplateId}
                onClick={() => {
                  if (!selectedTemplateId) return;
                  applyTemplate(selectedTemplateId);
                  const name =
                    templates.find((item) => item.id === selectedTemplateId)?.name ??
                    t("promptAssembly.template.fallbackName");
                  showToast(t("promptAssembly.template.loaded", { name }));
                }}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center rounded-md bg-background px-2 text-[11px] transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45",
                  INPUT_BORDER_CLASS
                )}
              >
                {t("promptAssembly.template.load")}
              </button>
              <button
                type="button"
                data-prompt-template-delete
                disabled={!selectedTemplateId}
                onClick={() => {
                  if (!selectedTemplateId) return;
                  deleteTemplate(selectedTemplateId);
                  setSelectedTemplateId("");
                  showToast(t("promptAssembly.template.deleted"));
                }}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center rounded-md bg-background px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45",
                  INPUT_BORDER_CLASS
                )}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              {t("promptAssembly.template.empty")}
            </p>
          )}
        </div>

        {/* 合并预览 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">
              {t("promptAssembly.merged.title")}
            </span>
            <button
              type="button"
              data-prompt-merged-copy
              onClick={() => void handleCopy()}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Copy className="h-3 w-3" />
              {t("common.copy")}
            </button>
          </div>
          <p
            data-prompt-merged
            className={cn(
              "min-h-16 whitespace-pre-wrap break-words rounded-lg bg-muted/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed",
              INPUT_BORDER_CLASS
            )}
          >
            {merged || t("promptAssembly.merged.allEmpty")}
          </p>
        </div>
      </div>

      {/* 复用创作页既有的 3D 视角生成器：高级模式下覆盖「镜头视图」分类 */}
      <View3DPromptDialog
        open={view3DOpen}
        series={series}
        onOpenChange={setView3DOpen}
        writeMode={resolveToolWriteMode({
          advancedPrompt: true,
          hasCustomTarget: Boolean(toolTargetTabId),
        })}
        onInsert={(prompt) => applyToolResult("view3d", prompt)}
      />

      {/* 复用创作页既有的角色选择器：高级模式下覆盖「角色」分类 */}
      <CharacterPickerDialog
        open={characterPickerOpen}
        onOpenChange={setCharacterPickerOpen}
        onApply={(text) => applyToolResult("character", text)}
      />

      {/**
       * 静态标签库：动作库 / 背景库 / 表情库 —— **同一条渲染路径**，
       * 有几个库、叫什么、数据从哪来、确认后写进哪个分类，全由声明表决定。
       */}
      {TAG_LIBRARY_LIST.map((library) => (
        <TagLibraryDialog
          key={library.id}
          open={openLibrary === library.id}
          library={library}
          onOpenChange={(next) => setOpenLibrary(next ? library.id : null)}
          onApply={(text) => applyToolResult(library.tool, text)}
        />
      ))}
    </div>
  );
}

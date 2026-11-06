"use client";

// 下拉选项沿用原业务值，菜单外观、滚动与键盘操作统一复用采样器组件。
import { SimpleSelect } from "@/components/SimpleSelect";
// 复用本地模型触发词的标签按钮，只注入本分类追加和删除的真实动作。
// 拆词只作用于快捷区，不把正在编辑的 textarea 动态改写成另一段文本。
import { PromptTag } from "@/components/prompt-tag";
import { removeQuickWord, splitQuickWords } from "@/utils/prompt-quick-words";

import { useEffect, useMemo, useRef, useState } from "react";
// 排序编辑态复用原拖拽容器，普通标签栏继续只负责选择分组。
import { PromptGroupOrderEditor } from "./prompt-group-order-editor";
// StoreApi 注入只改变数据来源，既有组装 UI 与各功能弹窗继续共用。
// 无注入时图片页行为保持原样，编辑页不再回写 #prompt-editor。
// 窄契约由原图片 store 类型派生，两端字段更名会在类型检查时报错。
import { useStore, type StoreApi } from 'zustand';
import type { PromptAssemblyState } from '@/stores/use-mask-prompt-store';
import { TOOL_DEFAULT_TAB } from '@/data/promptTools';
import { PromptAssistantToolbar } from "@/components/prompt-assistant/prompt-assistant-toolbar";
import {
  Camera,
  Check,
  Copy,
  Layers,
  Mountain,
  Palette,
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
/**
 * 画师与已有工具沿用同一图标注册契约，自定义分类的挂载选择也能识别。
 * 卡片确认后的文字由既有工具落点逻辑写入，不新建另一份画师输入框。
 */
const TOOL_ICONS: Record<PromptTabToolId, typeof Users> = {
  // 默认风格分类可直接打开画师库，自定义分类也可挂载相同工具。
  artist: Palette,
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
  assemblyStore, disabled = false, backLabel,
}: {
  onClose: () => void;
  variant?: "panel" | "inline";
  /** 3D 视角生成器按当前模型系列取景别阈值 */
  series?: ViewSeries;
  // 蒙版页注入独立分类与模板，普通图片省略时沿用原有全局草稿。
  // disabled 传给 Portal 回写边界，原生 fieldset 无法禁用 Portal 里的按钮。
  // 订阅 StoreApi 不引入 Context，全局状态继续遵守 Zustand 约定。
  assemblyStore?: StoreApi<PromptAssemblyState>;
  disabled?: boolean;
  // 参数区复用时返回对象是生成参数；图片页省略后仍显示原来的返回图库。
  // 调用方提供已翻译文本，不能把蒙版术语硬编码到公共组件。
  // 仅改变按钮名称，关闭行为继续由各自父容器决定。
  // 同时用于 title，避免按钮显示返回参数而悬停提示仍说返回图库。
  // 不传覆盖文案时保持原来的 panel/inline 两种标签和提示。
  // 该文本不作为路由路径，点击不会触发导航或销毁生成队列。
  // 返回按钮仍采用原有尺寸和图标，新增调用方不复制头部布局。
  backLabel?: string;
}) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  // 注入独立草稿时复用同一套分类、工具、模板和助手界面。
  // 未传 store 的图片页仍订阅原 useCreateFormStore，原调用方式保持兼容。
  // 一次订阅保留原动作引用，切换活动分类不会创建第二份工具状态。
  // 注入契约只包含组装字段，不允许面板修改编辑采样或文生图模型。
  // 所有 Portal 确认仍调用当前草稿的动作，不通过全局焦点猜测目标。
  // useStore 泛型要求 StoreApi 而非数据形状，确保 getState/subscribe 均可用。
  // 普通完整 store 在结构上满足窄接口，不需要复制或转换其动作集合。
  // 蒙版 store 和普通 store 的状态对象各自稳定，只在实际 set 时更新。
  // 使用完整窄状态订阅使 tabs、templates 和动作属于同一次快照。
  // 草稿变化触发重绘，未改变的原分类 UI 与工具注册表仍可直接复用。
  // 组件本地状态仅负责当前弹窗和临时名称，真正分类草稿由注入 store 持有。
  // 关闭面板会丢弃未确认的弹窗选择，已确认内容不依赖组件继续挂载。
  // 默认参数保持原调用点兼容，图片页无需添加无意义的 store 属性。
  // 此边界没有持久化迁移，也不改变普通图片的分类模板文件格式。
  const state = useStore<StoreApi<PromptAssemblyState>, PromptAssemblyState>(assemblyStore ?? useCreateFormStore, value => value);
  const { promptTabs: tabs, activePromptTabId: activeTabId, promptTemplates: templates, setActivePromptTab: setActiveTab, setPromptTabContent: setTabContent, appendToPromptTab: appendToTab, addPromptTab: addTab, removePromptTab: removeTab, setPromptTabQuickWords: setQuickWords, savePromptTemplate: saveTemplate, deletePromptTemplate: deleteTemplate, applyPromptTemplate: applyTemplate, togglePromptTabTool: toggleTabTool } = state;

  const [newTabLabel, setNewTabLabel] = useState("");
  // 手动排序是独立查看状态，未完成的顺序只放在子组件草稿里。
  // 正常输入仍实时写入原 store，进入排序不会丢失刚刚填写的正文。
  // 两种模式保留同一个正常输入 DOM，后台翻译和撤销状态不因排序入口而重建。
  // 完成才调用原 store 的整队提交动作；取消、关闭面板或离开都不自动保存顺序。
  // 图片与蒙版的 state 来自上面的注入边界，提交不能硬编码到图片全局 store。
  const [sorting, setSorting] = useState(false);
  // 普通分类栏与排序列表使用两套展示结构，但它们并不持有两份业务内容。
  // 分类栏的对象来自 store，排序列表只在本轮保存 id 便签。
  // 正文、快捷词、工具绑定仍只有 promptTabs 这一个事实来源。
  // 普通文本框保留挂载，因此用户进入排序前刚完成的受控输入不会重置。
  // 排序期间输入区设 inert，键盘不能继续 Tab 到看不见的翻译或删除按钮。
  // hidden 只用于本地常规区域，不隐藏整个工作区或改变创建页的宿主实例。
  // 外层不把 sorting 放进全局持久化，重启软件不会直接停在未完成会话。
  // 如果面板因为关闭高级或切换版式卸载，未确认的便签随之丢弃。
  // 这等同取消本轮排列，已经确认的队列仍在原业务 store 中。
  // 生成按钮不读取本地 sorting 或临时 ids，预览与生成不会分别采用两种队列。
  // 后台翻译可能在排序期间完成，保留输入 DOM 与 hook 让它继续执行原冲突保护。
  // 译文更新原分类内容，子排序页从最新 tabs 派生项数，避免显示旧的内容统计。
  // 完成只传 id，不能顺带把打开排序前的旧 tabs 对象写回去。
  // 取消不需要回滚 store，因为草稿阶段根本没有提交过顺序。
  // 这样也不会为了取消排列而把用户刚得到的译文或新快捷词一起回滚。
  // 模式栏取消与页头返回图库是不同动作，前者回到本面板浏览态，后者关闭高级组装。
  // 两者均不会自动保存未确认的排序便签，但返回图库仍保留原来的确认结果。
  // 自定义分组删除入口只在普通态出现，排序期间不会误把拖动当成删除。
  // 标签库和模板按钮同样只在普通态可交互，不混入行列表干扰拖拽目标。
  // 组件默认图片调用与 assemblyStore 注入调用都使用同一个模式条件，没有第二套蒙版 JSX。
  const orderEntry = useRef<HTMLButtonElement>(null);
  // 焦点引用指向本面板的入口，不用全局 querySelector 寻找第一个同名按钮。
  // 蒙版与普通图片都可能保留 DOM，按引用定位可避免焦点落到另一个隐藏实例。
  // previous 标记只追踪模式变化，不保存正文、顺序或远端工具请求结果。
  // 用户首次打开高级面板时保持原有自动焦点策略，不能因为新增排序就选中入口。
  // React 提交完成后才处理 focus，此时取消和完成按钮已不再是可聚焦目标。
  // 完成时若入口因业务锁禁用，浏览器不会绕过 disabled 强制激活它。
  const wasSorting = useRef(false);
  // 模式结束后恢复键盘焦点到“调整顺序”，首次进入面板不主动抢走文本焦点。
  // effect 在 DOM 已恢复普通模式后执行，避免对仍然 hidden 的入口调用 focus。
  // 只关注本实例的切换，另一个组装面板不会收到这里的焦点。
  useEffect(() => {
    if (wasSorting.current && !sorting) orderEntry.current?.focus();
    wasSorting.current = sorting;
  }, [sorting]);
  const confirmOrder = (ids: string[]) => {
    // 完成时再读 disabled，不能因为进入排序时尚未生成就允许任务锁后继续提交。
    // store 接口接收完整最终队列，一次 set 就能通知原合并预览与持久化订阅。
    // 不通过连点前移/后移模拟批量确认，以免监听方看到多次中间顺序。
    // 活动分组仍按 id 定位，返回普通态后即使其位置变了，输入内容也不会跟着下标错配。
    // 关闭模式发生在提交之后，普通标签栏的下一次绘制能直接使用最终顺序。
    // 没有网络或系统写盘 await，这里不添加假加载动画或“全部保存成功”的云端提示。
    // 图片文档的实际保存沿用 Zustand 原 persist，蒙版仍沿用内存会话范围。
    // 下次打开排序时重新建立子实例，默认号码牌即是这次确认后的新队列。
    // ids 不是文件路径、模型名或提示词正文，不跨 IPC 传递可执行内容。
    // 这个回调不调用 setActiveTab，所以确认不会把编辑焦点切到被拖动的另一组。
    if (disabled) return;
    state.setPromptTabOrder(ids);
    setSorting(false);
  };
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
    // 独立草稿的订阅负责同步 instruction，面板不能同时写普通图片输入。
    // 未注入时保留图片页既有 DOM 目标，避免影响原生成与二创链路。
    // 不依赖可见性或 rAF，切页后的分类更新仍可由各自 store 完成。
    if (!assemblyStore) setEditableText(PROMPT_EDITOR_ID, merged);
  }, [merged, assemblyStore]);

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
    // 弹窗可能在任务开始前打开，确认时以当前禁用值再次检查。
    // 业务草稿动作另有同步门闩，无法通过旧 Portal 闭包改动活动任务。
    // 普通图片默认不传 disabled，继续沿用其原有交互行为。
    if (disabled) return;
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
      // 默认分类工具覆盖它绑定的类别，自定义分类仍走上方追加分支。
      // 有注入时直接调用对应动作，不能再走只认图片全局 store 的写入口。
      // 角色、动作、背景和 3D 共享注册表的默认分类，不复制映射常量。
      // 切换活动分类只影响观察位置，实际合并按分类原顺序生成。
      if (assemblyStore) { setTabContent(TOOL_DEFAULT_TAB[toolId], text); setActiveTab(TOOL_DEFAULT_TAB[toolId]); }
      else applyToolPromptText(text, toolId);
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
          title={backLabel ?? (variant === "panel" ? t("promptAssembly.close.title") : t("promptAssembly.close.inlineTitle"))}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {backLabel ?? (variant === "panel" ? t("promptAssembly.close.back") : t("promptAssembly.close.collapse"))}
        </button>
      </header>

      {/* side：排序模式替换普通分组区，顶栏固定的返回图库仍由原宿主管理。 */}
      {/* 正常区域只隐藏不卸载，尚未返回的翻译继续更新原分组，取消也不会丢输入。 */}
      {sorting && <PromptGroupOrderEditor tabs={tabs} activeId={activeTabId} disabled={disabled} onCancel={() => setSorting(false)} onConfirm={confirmOrder} />}
      <div className={sorting ? "hidden" : "contents"} inert={sorting}>
        {/* 普通态用 contents 保留原 flex 子项关系，页头、分类栏和正文仍各管原来的高度。 */}
        {/* 排序态改用 hidden 而非透明度，原内容不占布局高度，也不会挡住新列表。 */}
        {/* 同时设 inert 是交互边界，不能只把看不见的输入框留给键盘和辅助技术。 */}
        {/* 这一层不创建新的滚动区，正文仍由下面原有 overflow-y-auto 容器滚动。 */}
        {/* 顶部标题与按钮同排，窄栏只省略说明，关键“调整顺序”动作不被挤走。 */}
        {/* 分组工具栏：明确文字入口和标题同排，不再让孤立箭头占一整行。 */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <span className="shrink-0 text-xs font-medium">{t("promptAssembly.sort.groups")}</span>
          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{t("promptAssembly.sort.currentOrder")}</span>
          <button ref={orderEntry} type="button" data-prompt-sort-toggle disabled={disabled} onClick={() => setSorting(true)} className={cn("h-7 shrink-0 rounded-md bg-background px-2 text-[11px] hover:bg-accent disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-stroke", INPUT_BORDER_CLASS)}>{t("promptAssembly.sort.toggle")}</button>
        </div>
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
            <span key={tab.id} className="inline-flex min-w-0 items-center">
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
          <div className="relative">
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
              "block w-full resize-y rounded-lg bg-background px-2.5 pb-10 pt-2 text-xs leading-relaxed outline-none",
              ACCENT_FOCUS_RING_CLASS,
              INPUT_BORDER_CLASS
            )}
          />
          {/* 界面：当前分类内的提示词助手，写回该分类而非合并结果 */}
          {/* 蒙版助手使用独立上下文，避免撤销记录与图片页同名分类串用。 */}
          {/* 忙碌时卸载助手入口；已打开结果的写入仍由草稿动作再次检查锁。 */}
          {activeTab && !disabled && <PromptAssistantToolbar contextId={assemblyStore ? `mask-${activeTab.id}` : activeTab.id} read={() => (assemblyStore ?? useCreateFormStore).getState().promptTabs.find(tab => tab.id === activeTab.id)?.content ?? ""} write={value => setTabContent(activeTab.id, value)} />}
          </div>
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
          <div className="flex min-w-0 items-start justify-between gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">{t("promptAssembly.quickWords.title")}</span>
            {/* 清空只针对活动分类的词卡，已经写入的正文和其他分组保持原值。 */}
            {/* 无词或忙碌时原生禁用，编辑页的 store 还会再次检查任务锁。 */}
            <button type="button" data-prompt-quick-clear disabled={disabled || !activeTab?.quickWords.length} onClick={() => activeTab && setQuickWords(activeTab.id, [])} className="shrink-0 rounded text-[10px] text-muted-foreground hover:text-destructive disabled:opacity-40">{t("promptAssembly.quickWords.clearAll")}</button>
          </div>
          <div
            data-prompt-quick-words
            className="flex min-w-0 flex-wrap items-start gap-1"
          >
            {/* 快捷词区只把当前分类传给共享tag，不把组装正文当作待拆快捷词。 */}
            {/* 点击一颗tag仅追加这一颗，不能把旧存储里整段逗号内容一起追加。 */}
            {/* 展示去重沿用模型触发词规则，大小写重复不会产生多个相同按钮。 */}
            {/* 排列顺序仍按原数组和段内顺序，不改变用户手动排好的分类次序。 */}
            {/* 清空入口只调用当前分类的setQuickWords，其他分类与模板不参与清空。 */}
            {/* 清空后的空数组必须写盘，不能把它解释成用户尚未设置而恢复预设。 */}
            {/* 编辑开关只控制移除与新增入口，普通状态仍能逐颗追加快捷词。 */}
            {/* 删除的回调捕获当前分类身份，切换分类后新按钮会绑定新对象。 */}
            {/* 词卡自身处理长词折行，外层flex-wrap只负责卡片之间换行。 */}
            {/* 外层min-w-0允许它收缩到窄side宽度，不把父级创建布局撑成横滚。 */}
            {/* 正文里的训练语法不由此区域重新格式化，快捷词只是可选输入来源。 */}
            {/* 主体和移除按钮分别获得焦点，屏幕阅读名称来自对应业务翻译。 */}
            {/* 只在编辑模式提供移除回调，不渲染一个隐藏但仍可Tab的删除键。 */}
            {/* 模型详情的复制功能继续由模型调用方注入，这里不会触发剪贴板写入。 */}
            {/* 旧长段按真实分隔符逐词呈现，单标签追加不会带入旁边所有词。 */}
            {/* 删除先回到原条目中移除目标，避免拆平后被旧24条上限截掉其他标签。 */}
            {splitQuickWords(activeTab?.quickWords ?? []).map(word => <PromptTag key={word} label={word} data-prompt-quick-word={word} disabled={disabled} onClick={() => appendToTab(word, activeTab?.id)} removeLabel={t("promptAssembly.quickWords.removeLabel", { word })} onRemove={editingQuickWords && activeTab ? () => setQuickWords(activeTab.id, removeQuickWord(activeTab.quickWords, word)) : undefined} />)}
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
              <SimpleSelect
 data-prompt-template-select
 ariaLabel={t("promptAssembly.template.selectLabel")}
 value={String(selectedTemplateId)}
 onChange={(value) => setSelectedTemplateId(value)}
 className="min-w-0 flex-1" portal
 options={[{ value: String(""), label: t("promptAssembly.template.selectPlaceholder") }, ...templates.map((template) => ({ value: String(template.id), label: template.name }))]}
 />
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

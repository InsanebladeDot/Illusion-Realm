"use client";
import { HoverTip } from "@/components/hover-tip";


import { useState, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";
import { Info, Layers } from "lucide-react";
import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import { useTranslation } from "@/i18n";
import { PromptCollapseButton } from "@/view/create/PromptCollapseButton";
import { PromptTools } from "./prompt-tools";
import { PromptAssemblyPanel } from "@/view/create/promptAssembly/PromptAssemblyPanel";
import { useCreateFormStore, type CreateFormState } from "@/stores/useCreateFormStore";
import { appendToTabContent, assemblePrompt } from "@/utils/promptTabs";
import { readEditableText } from "@/utils/promptEditor";
import { TOOL_DEFAULT_TAB } from "@/data/promptTools";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { applyToolPromptText } from "@/utils/promptTarget";
import type { ImageWorkflowSeries } from "@/utils/comfy/imageWorkflow";
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
import type { CompositionSize } from "./moss-composition/composition-draft";
import { LoraTriggerWordsButton } from "./lora-trigger-words-button";

/**
 * 工具 id → 图标（**表现层**，不进数据层）；
 * 按钮的文字、title、数据钩子、确认后写进哪个分类都在 `data/promptTools.ts` 的注册表里。
 */
export interface ImagePromptScope {
  store: StoreApi<CreateFormState>;
  editorId: string;
  value: string;
  onValueChange: (value: string) => void;
}

export function PromptSection({
  series = "anima",
  loraIds = [],
  sideVisible,
  scope,
  renderHeaderAction,
  toolSeries,
  compositionSize,
}: {
  series?: ViewSeries;
  loraIds?: string[];
  sideVisible?: boolean;
  scope?: ImagePromptScope;
  renderHeaderAction?: (revealPrompt: () => void) => ReactNode;
  toolSeries?: ImageWorkflowSeries;
  compositionSize?: CompositionSize;
}) {
  const { t } = useTranslation();
  /** 静态标签库（动作 / 背景 / 表情）共用一份打开状态：同一时刻只会开一个 */
  /** 抽屉：收起后只保留标题行，减少空间占用 */
  const [collapsed, setCollapsed] = useState(false);
  /** 高级提示词组装（任务规范 v2.1）：开启后右侧面板切换为组装面板 */
  const advancedPrompt = useStore(scope?.store ?? useCreateFormStore, (state) => state.advancedPrompt);
  const setAdvancedPrompt = useStore(scope?.store ?? useCreateFormStore, (state) => state.setAdvancedPrompt);
  /** 宽屏（xl 及以上）右侧面板可见，组装面板挂到右栏；窄屏就地展开 */
  const fallbackWide = useMediaQuery("(min-width: 1280px)");
  const isWideViewport = sideVisible ?? fallbackWide;

  // 普通模式使用原 PromptInput 的助手能力，局部回调只是换写入目标。
  // 助手的翻译记录与撤销按输入 id 区分，不能复用创建页固定上下文名。
  // 高级开启时主输入只读并隐藏助手，真实编辑入口仍是原分类 textarea。
  // 分类工具和顶层工具分别由原组件处理，不能把两套确认回调同时调用。
  // 侧栏传 sideVisible=false 是原 inline 形态，不是另写一个抽屉版组装器。
  // 窄创建布局仍由原 sideVisible 覆盖媒体查询，导航开合不会挂错组装面板。
  // scope 的 store 与正向正文需来自同一节点，不能一处读取 A、一处回写 B。
  // 节点切换通过外层 key 重建 PromptSection，折叠和弹窗临时状态不会串值。
  // 切主题不改变该 key，所以不会因为颜色变化丢掉当前分类草稿。
  // 卸载后的门户由原组件 open 清理，不用全局“当前节点”接收迟到工具结果。
  // 标签 htmlFor 使用相同 editorId，点击“提示词”仍可把焦点交给真实编辑面。
  // 高级开关 id 也附加当前输入前缀，两个实例的 label 不会切换对方的开关。
  // 普通创建调用保持原 advanced-prompt-toggle，兼容已有自动键盘回归。
  // 资料库按钮保留原 aria-label 和 title，局部适配不把它们替换为无名图标。
  // 工具 registry 的 rowTestId 继续用于自动定位，不能按本地化文字猜测身份。
  // 受控 maxLength 仅交给本地节点框，原全局表单的文本容量规则保持原样。
  // 写入函数在事件时读 state，不能把渲染时的 advancedPrompt 当作异步确认真相。
  // 这使用户打开资料库后切换高级模式时，确认仍落到当前实际模式。
  // 对应的提示文案仍由原 writeMode 解析，业务写入不由按钮文字决定。
  // LoRA trigger target 传 read 和 append，两者必须一起使用局部或一起使用全局。
  // 字段选择和资源过滤没有迁移到这个 scope，避免一个注入口扩成通用页面引擎。
  const editorId = scope?.editorId ?? "prompt-editor";
  // 普通正文可能在上次组装后被手改，开启前以当前框里的文字为准。
  // 像重新装订笔记：正文一致就保留原章节，不一致则放进首章，不凭逗号猜分类。
  // 分类身份与工具绑定保持原样；只有旧章节正文被替换，避免旧词覆盖新输入。
  // 创建页没有局部 scope，仍走原来的开关动作，不改变它的全局草稿习惯。
  // 普通模式切高级前读取 DOM，可包含工具刚刚追加但尚未经历下一次重绘的内容。
  // 内容与已组装结果相同则保留各分类，不需要每次开启都打散用户结构。
  // 文本不同才把当前正文置入首分类，其余旧正文清空，避免重复拼接。
  // map 保留 quickWords 和 tools 等其他属性，用户的分类配置不因一次切换丢失。
  // 高级关闭不重新读取旧普通正文，分类修改已通过局部订阅回写到节点。
  // 原创建页没有 scope，不执行本段种子准备，避免改变其既有分类恢复规则。
  // 开关动作仍调用原 setAdvancedPrompt，所以所有同实例订阅会看到同一确认状态。
  // 组装按钮和小开关走同一个函数，两种开启方式不能出现不同的正文来源。
  // 点击已开启的组装入口不会创建另一个面板或另一份分类 store。
  // 该准备只发生在用户动作中，不在渲染期间写 store 触发 React 状态错误。
  const changeAdvanced = (enabled: boolean) => {
    if (scope && enabled) {
      const state = scope.store.getState();
      const text = readEditableText(editorId);
      if (assemblePrompt(state.promptTabs) !== text.trim()) {
        scope.store.setState({ promptTabs: state.promptTabs.map((tab, index) => ({ ...tab, content: index === 0 ? text : "" })) });
      }
    }
    setAdvancedPrompt(enabled);
  };
  // 普通输入从本框读最新正文，避免工具弹窗打开后又编辑过文字时追加到旧闭包。
  // 高级输入按原注册表定位分类；自定义工具仍由原组装面板负责。
  // 非局部调用不走新分支，创建页原工具语义与主输入编号保持不变。
  // 带 tool 的结果继续遵守原分类覆盖语义，不能变成普通的末尾追加。
  // TOOL_DEFAULT_TAB 是原注册表，不能按中文标题去查分类身份。
  // 更新活动分类使确认后能看见刚写入的目标，和原创建页工具行为一致。
  // 没有 tool 的 LoRA 文本按原 appendToPromptTab 追加到当前分类。
  // 追加保留原分隔规则，不能直接覆盖掉用户已经写好的分类正文。
  // 普通模式则使用 appendToTabContent 统一处理已有末尾逗号和空白。
  // 不从 scope.value 旧闭包追加，因为资料库打开后用户可能又修改过正文。
  // readEditableText 读取本实例，不读 document.activeElement 这样的不稳定焦点。
  // 结果通过 scope 回调交回节点，输入表面的更新继续由原受控组件完成。
  // 不在这里创建 HTML，资料库文字按纯文本插入，不成为可执行标记。
  // 弹窗确认后的 setCollapsed(false) 只调整观察状态，不决定参数如何保存。
  // 当前没有 scope 的旧入口仍调用 applyToolPromptText，保留旧全局高级目标规则。
  // LoRA 默认路径由原按钮处理，只有局部 target 才显式进入这个回调。
  // 该函数不读取模型文件内容，元数据请求和错误处理仍归原触发词按钮。
  // 3D 工具的写入说明仍使用 resolveToolWriteMode，文字提示和真实动作保持一致。
  // 工具确认不会顺带关闭高级模式，用户可继续在其他分类组织文本。
  // 自定义分类挂载工具的特殊追加语义继续由原组装面板自身维护。
  // 本函数只处理提示词区顶层工具行，不能替代组装面板的自定义目标逻辑。
  // 当整个侧栏卸载时，当前 PromptSection 也卸载，不留下可写向下一节点的监听器。
  const applyText = (text: string, tool?: PromptTabToolId) => {
    if (!scope) { if (tool) applyToolPromptText(text, tool); return; }
    const state = scope.store.getState();
    if (state.advancedPrompt) {
      if (tool) {
        state.setPromptTabContent(TOOL_DEFAULT_TAB[tool], text);
        state.setActivePromptTab(TOOL_DEFAULT_TAB[tool]);
      }
      else state.appendToPromptTab(text);
      return;
    }
    scope.onValueChange(appendToTabContent(readEditableText(editorId), text));
  };

  return (
    <>
      <div data-create-prompt className="relative space-y-3">
        <div>
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
          <div data-create-prompt-header className={cn("flex items-center justify-between gap-1 whitespace-nowrap", renderHeaderAction && "flex-wrap")}>
            <div className="flex shrink-0 items-center gap-1">
              <label className="text-sm font-semibold" htmlFor={editorId}>
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
                  id={scope ? `${editorId}-advanced` : "advanced-prompt-toggle"}
                  data-advanced-prompt-toggle
                  onClick={() => changeAdvanced(!advancedPrompt)}
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
                  htmlFor={scope ? `${editorId}-advanced` : "advanced-prompt-toggle"}
                >
                  {t("promptAssembly.editor.advanced")}
                </label>
                <HoverTip asChild layer="window" label={(t("promptAssembly.editor.assembleTitle")) ?? ""}><button
                  type="button"
                  data-prompt-assemble-trigger

                  aria-label={t("promptAssembly.title")}
                  aria-pressed={advancedPrompt}
                  onClick={() => changeAdvanced(true)}
                  className={cn(
                    "ml-1 inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-md bg-background px-2 text-xs font-medium text-muted-foreground shadow-none transition-colors hover:bg-accent hover:text-foreground",
                    INPUT_BORDER_CLASS,
                    advancedPrompt && "text-[#6D28D9]"
                  )}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>{t("promptAssembly.editor.assemble")}</span>
                </button></HoverTip>
              </div>
            </div>
            {/* 界面：已选 LoRA 的 JSON 触发词，普通与高级模式复用同一写入入口。 */}
            {/* 右侧操作区：自动左边距将应用触发词推到标题栏右侧，不受左侧标签长度影响。 */}
            {/* 两个入口共用这一个行内容器，折叠箭头不会单独挤占额外一行。 */}
            <div className="ml-auto flex shrink-0 items-center gap-1">
            <LoraTriggerWordsButton ids={loraIds} onApplied={() => setCollapsed(false)} target={scope ? { read: () => readEditableText(editorId), append: text => applyText(text) } : undefined} />
            {/* 标题栏右侧：构图确认后展开输入，让回填的结果立即可见。 */}
            {renderHeaderAction?.(() => setCollapsed(false))}
            <PromptCollapseButton
              collapsed={collapsed}
              onToggle={() => setCollapsed((prev) => !prev)}
              label={t("promptAssembly.editor.label")}
            />
            </div>
          </div>

          <CollapsiblePanel
            open={!collapsed}
            stateAttribute="data-prompt-editor-panel"
            contentClassName="pt-1.5"
            className="relative"
          >
            {/* 界面：统一提示词输入；保留原 id，片段、LoRA 触发词和生成继续读取同一 DOM。
                组装模式只锁住表面并隐藏助手，不创建另一份提示词状态。
                主题底色统一走 background，避免深色模式复用文字色而整块发白。
                展开收起仍保留原 CollapsiblePanel，提示词不随折叠卸载。
                输入组件不提供 value，既有工具直接写 DOM 的内容不会被覆盖。
                禁用只影响交互，原有已组装文本仍可从相同 id 读取。 */}
            <PromptInput id={editorId} compositionSize={compositionSize} value={scope?.value} onValueChange={scope?.onValueChange} maxLength={scope ? 4000 : undefined} disabled={advancedPrompt} assistant={!advancedPrompt} data-placeholder={advancedPrompt ? t("promptAssembly.editor.placeholderAdvanced") : t("promptAssembly.editor.placeholder")} className={cn(advancedPrompt && "bg-muted/30 text-muted-foreground")} />
            {/* 提示词工具栏跟正文一起收起，展开后保留原来的工具显示状态。 */}
            <div className="mt-3">
              <PromptTools series={toolSeries ?? series} advancedPrompt={advancedPrompt} onApply={(text, tool) => { applyText(text, tool); setCollapsed(false); }} />
            </div>
          </CollapsiblePanel>
        </div>

        {advancedPrompt && !isWideViewport ? (
          <PromptAssemblyPanel
            variant="inline"
            assemblyStore={scope?.store}
            series={series}
            onClose={() => changeAdvanced(false)}
          />
        ) : null}
      </div>

      {/**
       * 静态标签库（动作库 / 背景库 / 表情库）：**同一条渲染路径**，
       * 有几个库、叫什么、确认后写进哪个分类都由 `data/tagLibraries.ts` 的声明表决定。
       * 高级组装模式下覆盖对应默认分类，普通模式下插入提示词框末尾（见 `applyToolPromptText`）。
       */}

    </>
  );
}

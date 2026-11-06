"use client";

/**
 * 创建页表单的**单一事实源**：尺寸 / 采样参数 / 提示词组装 / 资源弹窗偏好。
 *
 * 怎么用：读 `useCreateFormStore((s) => s.aspectRatio)`；写用对应的 setter；
 * 非组件模块（utils、事件回调）用 `useCreateFormStore.getState()`。
 * 拿到什么（按域分组，完整签名见下方 `CreateFormState` 类型）：
 * - 尺寸：`sizeMode`（preset / custom）、`aspectRatio`、`customWidth`、`customHeight`
 * - 生成参数：`steps`、`cfg`、`sampler`、`scheduler`（**null = 用工作流模板自带值**）、
 *   `seedMode` + `customSeed`（真正要用的种子用 `getResolvedSeedFromStore()` 取）
 * - 生成上下文：`generationKind`（text2img / img2img / video）、`sourceImagePath`
 * - 高级组装：`advancedPrompt`、`promptTabs`（默认 8 分类 + 自定义）、`activePromptTabId`、
 *   `promptTemplates`，以及增删改分类 / 模板、给分类挂工具（`togglePromptTabTool`）
 * - 资源弹窗：`resourceDialogFontSize`、`resourceCategoryUiMode`
 * 注意：**不要在渲染期间调它的 setter** —— 会触发 React
 * 「Cannot update a component while rendering a different component」（CreatePage 踩过那次），
 * 该同步就放进 effect 或事件回调。
 * 持久化：用户数据文档 `createForm` 段（默认分类的文案在进 store 时已翻译成当前语言）。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { t } from "@/i18n";
import { DEFAULT_CFG, DEFAULT_STEPS } from "@/data/createForm";
import { DEFAULT_PROMPT_TABS, PROMPT_TAB_MAX } from "@/data/promptTabs";
import {
  DEFAULT_ASPECT_RATIO,
  sanitizeAspectRatio,
  type AspectRatioLabel,
} from "@/data/imageSizes";
import {
  clampImageSide,
  clampSizeScale,
  type ImageSizeSelection,
  type ImageSizeMode,
} from "@/utils/imageSize";
import {
  appendToTabContent,
  applyTemplateToTabs,
  createPromptTabId,
  createPromptTemplateId,
  movePromptTab,
  reorderPromptTab,
  orderPromptTabs,
  sanitizePromptTabs,
  sanitizePromptTemplates,
  snapshotTabValues,
} from "@/utils/promptTabs";
import type { GenerationKind } from "@/types/generatedImageMeta";
import type {
  PromptTab,
  PromptTabToolId,
  PromptTemplate,
} from "@/types/promptTabs";
import type { UserDataCreateForm } from "@/types/userData";
import {
  DEFAULT_RESOURCE_CATEGORY_UI_MODE,
  DEFAULT_RESOURCE_DIALOG_FONT_SIZE,
  type ResourceCategoryUiMode,
  type ResourceDialogFontSize,
} from "@/types/resourceDialog";
import { generateRandomSeed } from "@/utils/seed";
import { createUserDataSectionPersistStorage } from "@/utils/userDataStorage";

type SeedMode = "random" | "custom";

type CreateFormState = {
  /** preset：按比例使用训练友好分辨率；custom：自定义宽高 */
  sizeMode: ImageSizeMode;
  aspectRatio: AspectRatioLabel;
  customWidth: number;
  customHeight: number;
  sizeScale: number;
  resourceDialogFontSize: ResourceDialogFontSize;
  resourceCategoryUiMode: ResourceCategoryUiMode;
  steps: number;
  cfg: number;
  /** 采样器：null = 未自定义，使用当前系列工作流模板自带值 */
  sampler: string | null;
  /** 调度器：null = 未自定义，使用当前系列工作流模板自带值 */
  scheduler: string | null;
  seedMode: SeedMode;
  customSeed: number;
  generationKind: GenerationKind;
  sourceImagePath: string | null;
  /** 高级提示词组装开关（关闭时恢复单一输入框） */
  advancedPrompt: boolean;
  /** 分类 Tab（默认 8 大分类 + 自定义分类） */
  promptTabs: PromptTab[];
  /** 当前编辑中的分类 */
  activePromptTabId: string;
  /** 已保存的模板 */
  promptTemplates: PromptTemplate[];
  setAspectRatio: (ratio: AspectRatioLabel) => void;
  setCustomSize: (patch: { width?: number; height?: number }) => void;
  setSizeMode: (mode: ImageSizeMode) => void;
  setSizeSelection: (selection: ImageSizeSelection) => void;
  setResourceDialogFontSize: (size: ResourceDialogFontSize) => void;
  setResourceCategoryUiMode: (mode: ResourceCategoryUiMode) => void;
  setAdvancedPrompt: (enabled: boolean) => void;
  setActivePromptTab: (tabId: string) => void;
  /** 调整分类队列；合并预览与生成都直接遵循此持久化顺序。 */
  movePromptTab: (tabId: string, direction: -1 | 1) => void;
  /** 拖拽只传起止身份，最新队列的正文与原有持久化仍由本 store 负责。 */
  reorderPromptTab: (activeId: string, overId: string) => void;
  // 完成手动排序时一次提交全部 id，不逐次挪动而产生多笔中间持久化。
  // 只接收号码牌顺序，文本、模板和活动分组都从当前 store 继承。
  setPromptTabOrder: (ids: string[]) => void;
  setPromptTabContent: (tabId: string, content: string) => void;
  /** 追加到指定分类（默认当前分类）：快捷插入词、角色、3D 视角都走这里 */
  appendToPromptTab: (text: string, tabId?: string) => void;
  addPromptTab: (label: string) => boolean;
  removePromptTab: (tabId: string) => void;
  renamePromptTab: (tabId: string, label: string) => void;
  setPromptTabQuickWords: (tabId: string, words: string[]) => void;
  /** 给自定义分类挂 / 摘一个工具（可多个；见 PromptTab.tools） */
  togglePromptTabTool: (tabId: string, toolId: PromptTabToolId) => void;
  savePromptTemplate: (name: string) => void;
  deletePromptTemplate: (templateId: string) => void;
  applyPromptTemplate: (templateId: string) => void;
  setAdvancedSettings: (patch: {
    steps?: number;
    cfg?: number;
    /** null = 取消自定义，回到当前系列工作流模板自带值 */
    sampler?: string | null;
    scheduler?: string | null;
    seedMode?: SeedMode;
    customSeed?: number;
  }) => void;
  setGenerationContext: (patch: {
    generationKind?: GenerationKind;
    sourceImagePath?: string | null;
  }) => void;
};

/**
 * 默认分类的文案在 data 层存的是**词条 key**，进 store 时解析成当前语言的显示文本
 * （store 里的 `PromptTab.label` 始终是可以直接渲染的字符串，自定义分类另有用户输入）。
 */
function localizedDefaultPromptTabs(): PromptTab[] {
  return DEFAULT_PROMPT_TABS.map((tab) => ({ ...tab, label: t(tab.label) }));
}

export const useCreateFormStore = create<CreateFormState>()(
  persist<CreateFormState, [], [], UserDataCreateForm>(
    (set) => ({
      sizeMode: "preset",
      aspectRatio: DEFAULT_ASPECT_RATIO,
      customWidth: 1024,
      customHeight: 1024,
      sizeScale: 1,
      resourceDialogFontSize: DEFAULT_RESOURCE_DIALOG_FONT_SIZE,
      resourceCategoryUiMode: DEFAULT_RESOURCE_CATEGORY_UI_MODE,
      steps: DEFAULT_STEPS,
      cfg: DEFAULT_CFG,
      sampler: null,
      scheduler: null,
      seedMode: "random",
      customSeed: generateRandomSeed(),
      generationKind: "text2img",
      sourceImagePath: null,
      advancedPrompt: false,
      promptTabs: localizedDefaultPromptTabs(),
      activePromptTabId: DEFAULT_PROMPT_TABS[0].id,
      promptTemplates: [],
      setAspectRatio: (ratio) => set({ aspectRatio: ratio, sizeMode: "preset", sizeScale: 1 }),
      setCustomSize: (patch) =>
        set((state) => ({
          sizeMode: "custom",
          sizeScale: 1,
          customWidth:
            patch.width !== undefined
              ? clampImageSide(patch.width)
              : state.customWidth,
          customHeight:
            patch.height !== undefined
              ? clampImageSide(patch.height)
              : state.customHeight,
        })),
      setSizeMode: (mode) => set({ sizeMode: mode, sizeScale: 1 }),
      // 原始宽高与倍率一并更新，防止先改尺寸再改倍率造成额外渲染或缩放跳变。
      setSizeSelection: (selection) => set({
        sizeMode: selection.mode, aspectRatio: sanitizeAspectRatio(selection.aspectRatio),
        customWidth: clampImageSide(selection.customWidth), customHeight: clampImageSide(selection.customHeight),
        sizeScale: clampSizeScale(selection.scale),
      }),
      setResourceDialogFontSize: (size) => set({ resourceDialogFontSize: size }),
      setResourceCategoryUiMode: (mode) => set({ resourceCategoryUiMode: mode }),
      setAdvancedSettings: (patch) => set((state) => ({ ...state, ...patch })),
      setAdvancedPrompt: (enabled) => set({ advancedPrompt: enabled }),
      setActivePromptTab: (tabId) => set({ activePromptTabId: tabId }),
      // 队列和分类内容保存在同一个数组，移动整个对象不会错配其提示词或工具。
      // 只借用纯函数，普通图片的落盘仍由本 store 的 persist 负责。
      // 数组顺序就是唯一生成顺序，不再保存一份可能失配的 rank 数组。
      // 活动分类仍按 id 指向原对象，移动后 textarea 不会切成邻居的内容。
      // 新增自定义分类继续排在末尾，用户可用相同操作把它提到任意位置。
      // 删除分类只删原对象，其他成员自然补位，不需要重新编号。
      // 模板按 id 应用正文，不会因为队列变化把角色词写到背景组。
      // 保存模板仍只保存内容，排序是工作区偏好，加载旧模板不撤销本次排列。
      // 本动作不提交生成请求；生成按钮仍由原创建流程统一处理。
      // 关闭高级模式也不清队列，下一次打开可继续使用已整理的分类。
      // 文档恢复由 sanitizePromptTabs 保留位置，不能仅在当前挂载里看起来正确。
      // 预览订阅 promptTabs 引用，调序后与可见分类栏在同一轮更新。
      movePromptTab: (tabId, direction) =>
        set((state) => ({ promptTabs: movePromptTab(state.promptTabs, tabId, direction) })),
      // set 回调取得提交瞬间的队列，避免拖拽开始后的编辑被旧数组覆盖。
      // 不改 activePromptTabId，跨多组移动也不会切走正在输入的分类。
      // persist 仍只保存原 promptTabs 字段，不新增重复的排序状态。
      // 图片队列的提交边界：
      // 拿到的是两个人的号码牌，不是他们刚进队时的旧座位表。
      // 回调使用当前 state，操作开始后改过的正文也会原样保留。
      // 用户添加的新组仍留在队列里，不会被拖动前的快照覆盖。
      // 删除后的旧 id 由纯函数拒绝，不会为满足拖动事件重新造组。
      // 不替换整个 createForm，尺寸、主模型和其他生成参数保持原值。
      // 仍通知原 promptTabs 订阅，合并预览和生成输入在同一路径更新。
      // 此动作不清空模板，不改变当前正在应用的正文来源。
      // 排序结束不会自动触发远端提示词助手，用户不会因此产生 API 消费。
      reorderPromptTab: (activeId, overId) =>
        set(state => ({ promptTabs: reorderPromptTab(state.promptTabs, activeId, overId) })),
      // 完成才提交：拖动中的顺序只存在编辑面板，生成仍读取已确认的队列。
      // 原持久化订阅只收到一次最终数组，不把每次拖动误存成用户已经确认。
      // 使用 set 回调读取最新正文，避免未结束的翻译更新被排序旧快照覆盖。
      // 不替换 activePromptTabId，回普通视图后继续编辑原来的那一组。
      // 同一个纯函数负责草稿和提交的成员合并，图片页不复制另一条排序算法。
      // 其他生成参数没有出现在 patch 中，尺寸、模型和 seed 均不受影响。
      setPromptTabOrder: ids => set(state => ({ promptTabs: orderPromptTabs(state.promptTabs, ids) })),
      setPromptTabContent: (tabId, content) =>
        set((state) => ({
          promptTabs: state.promptTabs.map((tab) =>
            tab.id === tabId ? { ...tab, content } : tab
          ),
        })),
      appendToPromptTab: (text, tabId) =>
        set((state) => {
          const targetId = tabId ?? state.activePromptTabId;
          return {
            promptTabs: state.promptTabs.map((tab) =>
              tab.id === targetId
                ? { ...tab, content: appendToTabContent(tab.content, text) }
                : tab
            ),
          };
        }),
      addPromptTab: (label) => {
        let added = false;
        set((state) => {
          if (state.promptTabs.length >= PROMPT_TAB_MAX) return state;
          const name = label.trim();
          if (!name) return state;
          added = true;
          const tab: PromptTab = {
            id: createPromptTabId(),
            label: name.slice(0, 12),
            content: "",
            quickWords: [],
            custom: true,
          };
          return {
            promptTabs: [...state.promptTabs, tab],
            activePromptTabId: tab.id,
          };
        });
        return added;
      },
      removePromptTab: (tabId) =>
        set((state) => {
          const target = state.promptTabs.find((tab) => tab.id === tabId);
          // 默认 8 大分类不可删除
          if (!target || !target.custom) return state;
          const promptTabs = state.promptTabs.filter((tab) => tab.id !== tabId);
          return {
            promptTabs,
            activePromptTabId:
              state.activePromptTabId === tabId
                ? (promptTabs[0]?.id ?? DEFAULT_PROMPT_TABS[0].id)
                : state.activePromptTabId,
          };
        }),
      renamePromptTab: (tabId, label) =>
        set((state) => ({
          promptTabs: state.promptTabs.map((tab) =>
            tab.id === tabId ? { ...tab, label: label.trim().slice(0, 12) || tab.label } : tab
          ),
        })),
      setPromptTabQuickWords: (tabId, words) =>
        set((state) => ({
          promptTabs: state.promptTabs.map((tab) =>
            tab.id === tabId
              ? { ...tab, quickWords: words.map((word) => word.trim()).filter(Boolean).slice(0, 24) }
              : tab
          ),
        })),
      togglePromptTabTool: (tabId, toolId) =>
        set((state) => ({
          promptTabs: state.promptTabs.map((tab) => {
            if (tab.id !== tabId) return tab;
            const current = tab.tools ?? [];
            return {
              ...tab,
              tools: current.includes(toolId)
                ? current.filter((id) => id !== toolId)
                : [...current, toolId],
            };
          }),
        })),
      savePromptTemplate: (name) =>
        set((state) => {
          const templateName = name.trim();
          if (!templateName) return state;
          const template: PromptTemplate = {
            id: createPromptTemplateId(),
            name: templateName.slice(0, 24),
            values: snapshotTabValues(state.promptTabs),
            createdAt: Date.now(),
          };
          return { promptTemplates: [template, ...state.promptTemplates].slice(0, 50) };
        }),
      deletePromptTemplate: (templateId) =>
        set((state) => ({
          promptTemplates: state.promptTemplates.filter((item) => item.id !== templateId),
        })),
      applyPromptTemplate: (templateId) =>
        set((state) => {
          const template = state.promptTemplates.find((item) => item.id === templateId);
          if (!template) return state;
          return { promptTabs: applyTemplateToTabs(state.promptTabs, template) };
        }),
      setGenerationContext: (patch) =>
        set((state) => ({
          generationKind: patch.generationKind ?? state.generationKind,
          sourceImagePath:
            patch.sourceImagePath !== undefined
              ? patch.sourceImagePath
              : state.sourceImagePath,
        })),
    }),
    {
      name: "illusion-realm-create-form",
      storage: createUserDataSectionPersistStorage<UserDataCreateForm>("createForm"),
      partialize: (state): UserDataCreateForm => ({
        aspectRatio: state.aspectRatio,
        sizeMode: state.sizeMode,
        customWidth: state.customWidth,
        customHeight: state.customHeight,
        sizeScale: state.sizeScale,
        resourceDialogFontSize: state.resourceDialogFontSize,
        resourceCategoryUiMode: state.resourceCategoryUiMode,
        advancedPrompt: state.advancedPrompt,
        promptTabs: state.promptTabs,
        promptTemplates: state.promptTemplates,
      }),
      // 旧数据可能存有已下线的比例（如 4:5），加载时兜底成合法值
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<UserDataCreateForm>;
        return {
          ...current,
          ...saved,
          aspectRatio: sanitizeAspectRatio(saved.aspectRatio),
          sizeScale: clampSizeScale(saved.sizeScale),
          // 恢复时沿用图片的无上限规则，不能只放开表单而在重启后截断。
          // 旧草稿仍经统一对齐，非法数值由 clampImageSide 回落。
          // 这里不读取视频约束，两个创作模式各自保存参数。
          // 宽高分别规范化，恢复竖图时也不会漏掉高度的旧上限。
          // 模型、提示词与采样参数继续由原合并逻辑恢复，不迁移其他字段。
          customWidth: clampImageSide(saved.customWidth ?? current.customWidth),
          customHeight: clampImageSide(
            saved.customHeight ?? current.customHeight
          ),
          advancedPrompt: saved.advancedPrompt === true,
          promptTabs: sanitizePromptTabs(saved.promptTabs),
          promptTemplates: sanitizePromptTemplates(saved.promptTemplates),
        };
      },
      skipHydration: true,
    }
  )
);

export function getResolvedSeedFromStore(state: CreateFormState): number {
  return state.seedMode === "custom" ? state.customSeed : -1;
}

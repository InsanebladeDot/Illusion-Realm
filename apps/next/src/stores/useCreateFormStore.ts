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
  IMAGE_SIZE_MAX,
  clampImageSide,
  type ImageSizeMode,
} from "@/utils/imageSize";
import {
  appendToTabContent,
  applyTemplateToTabs,
  createPromptTabId,
  createPromptTemplateId,
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
  setResourceDialogFontSize: (size: ResourceDialogFontSize) => void;
  setResourceCategoryUiMode: (mode: ResourceCategoryUiMode) => void;
  setAdvancedPrompt: (enabled: boolean) => void;
  setActivePromptTab: (tabId: string) => void;
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
      setAspectRatio: (ratio) => set({ aspectRatio: ratio, sizeMode: "preset" }),
      setCustomSize: (patch) =>
        set((state) => ({
          sizeMode: "custom",
          customWidth:
            patch.width !== undefined
              ? clampImageSide(patch.width)
              : state.customWidth,
          customHeight:
            patch.height !== undefined
              ? clampImageSide(patch.height)
              : state.customHeight,
        })),
      setSizeMode: (mode) => set({ sizeMode: mode }),
      setResourceDialogFontSize: (size) => set({ resourceDialogFontSize: size }),
      setResourceCategoryUiMode: (mode) => set({ resourceCategoryUiMode: mode }),
      setAdvancedSettings: (patch) => set((state) => ({ ...state, ...patch })),
      setAdvancedPrompt: (enabled) => set({ advancedPrompt: enabled }),
      setActivePromptTab: (tabId) => set({ activePromptTabId: tabId }),
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
          customWidth: clampImageSide(saved.customWidth ?? current.customWidth, IMAGE_SIZE_MAX),
          customHeight: clampImageSide(
            saved.customHeight ?? current.customHeight,
            IMAGE_SIZE_MAX
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

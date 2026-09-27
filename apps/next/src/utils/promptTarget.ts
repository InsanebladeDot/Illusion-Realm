/**
 * 提示词写入的**唯一入口**：普通模式 → 单一输入框；高级组装模式 → 写进分类 Tab。
 *
 * 怎么做：读 store 的当前模式与落点分类，实际写入交给 `promptEditor` / `promptTabs`；
 * 工具弹窗「实际会怎么写入」（插入 / 覆盖 / 追加）由 `resolveToolWriteMode` 单点推导，
 * 弹窗的确认按钮文案也取它（避免「写着插入、实际覆盖」）。
 */
import { useCreateFormStore } from "@/stores/useCreateFormStore";
import { appendEditableText, setEditableText } from "@/utils/promptEditor";

/**
 * 提示词写入的唯一入口：
 * - 普通模式：写进中间那个单一输入框 `#prompt-editor`；
 * - 高级组装模式：写进「当前选中的分类 Tab」，由 `assemblePrompt` 自动拼接。
 *
 * 角色选择器、3D 视角、片段、二创都走这里，保证高级模式下不会写进看不见的框里。
 */
export const PROMPT_EDITOR_ID = "prompt-editor";

export function appendPromptText(text: string): void {
  const store = useCreateFormStore.getState();
  if (store.advancedPrompt) {
    store.appendToPromptTab(text);
    return;
  }
  appendEditableText(PROMPT_EDITOR_ID, text);
}

export function setPromptText(text: string): void {
  const store = useCreateFormStore.getState();
  if (store.advancedPrompt) {
    store.setPromptTabContent(store.activePromptTabId, text);
    return;
  }
  setEditableText(PROMPT_EDITOR_ID, text);
}

import type { PromptTabToolId } from "@/types/promptTabs";
import { TOOL_DEFAULT_TAB } from "@/data/promptTools";

/** 工具 → 默认落点分类（默认 8 大分类的固定绑定），实现在 `data/promptTools.ts` */
export { TOOL_DEFAULT_TAB };

/**
 * 工具型弹框确认时**实际**会怎么写入。
 *
 * 为什么单独拎出来：这三个词不止是内部实现细节 —— 弹框的确认按钮必须照它取文案。
 * 曾经的坑是 3D 视角弹窗在高级模式下固定写着「确认并插入」，
 * 而实际动作是**覆盖**「镜头视图」分类（事后才由 toast 告知「已覆盖…」）：
 * 用户按「插入」理解，结果自己的分类内容被换掉了。
 */
export type ToolWriteMode = "insert" | "overwrite" | "append";

/** 写入方式只有一个出处：普通模式一律插入；高级模式下自定义分类落点追加、默认分类落点覆盖 */
export function resolveToolWriteMode(options: {
  advancedPrompt: boolean;
  hasCustomTarget: boolean;
}): ToolWriteMode {
  if (!options.advancedPrompt) return "insert";
  return options.hasCustomTarget ? "append" : "overwrite";
}

/**
 * 工具型弹框（角色选择器 / 3D 视角 / 动作库 / 背景库）应用提示词时的写入规则：
 * - **高级组装模式：覆盖对应分类**（角色 → 角色、3D → 镜头视图、动作库 → 姿势、背景库 → 背景）；
 * - 普通模式：插入到单一提示词框末尾。
 */
export function applyToolPromptText(
  text: string,
  tool: PromptTabToolId,
  /** 落点分类覆盖：自定义分类挂了工具时传**该分类**的 id */
  targetTabId?: string
): void {
  const store = useCreateFormStore.getState();
  if (store.advancedPrompt) {
    const tabId = targetTabId ?? TOOL_DEFAULT_TAB[tool];
    store.setPromptTabContent(tabId, text);
    store.setActivePromptTab(tabId);
    return;
  }
  appendEditableText(PROMPT_EDITOR_ID, text);
}

/** 当前模式下实际用于生成的提示词 */
export function readPromptText(): string {
  const store = useCreateFormStore.getState();
  if (store.advancedPrompt) {
    return store.promptTabs
      .map((tab) => (tab.content ?? "").trim())
      .filter(Boolean)
      .join(", ");
  }
  if (typeof document === "undefined") return "";
  return document.getElementById(PROMPT_EDITOR_ID)?.textContent?.trim() ?? "";
}

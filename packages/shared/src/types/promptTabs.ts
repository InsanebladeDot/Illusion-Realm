/** 高级提示词组装：分类 Tab 与模板（任务规范 v2.1） */

/**
 * 可挂到分类上的「既有工具」——都是弹框型功能（角色库 / 动作库 / 背景库 / 表情库 / 3D 视角）。
 *
 * 与「分类」不是一回事：工具是入口，分类是内容落点。
 * 默认 8 大分类各绑定一个（见 `data/promptTools.ts` 的 `TOOL_DEFAULT_TAB`），自定义分类则可以**挂多个**。
 *
 * 新增工具时先加这里（跨进程共享的稳定 id），再在 `apps/next/src/data/promptTools.ts` 里补一条声明。
 */
export type PromptTabToolId =
  | "character"
  | "pose"
  | "background"
  | "expression"
  | "view3d";

export type PromptTab = {
  /** 稳定 id：默认 8 个用固定 id，自定义分类用 tab_xxx */
  id: string;
  /** Tab 显示名，如「质量词」「光效」 */
  label: string;
  /** 该分类的输入内容（多行） */
  content: string;
  /** 快捷插入词：点击即追加到该分类输入框 */
  quickWords: string[];
  /** 用户自定义分类（可删除；默认 8 个不可删） */
  custom?: boolean;
  /**
   * 挂到该分类的工具（可多个）。调用后结果写进**本分类**。
   * 只在自定义分类上用：默认分类的工具是固定绑定，不需要用户配置。
   */
  tools?: PromptTabToolId[];
};

export type PromptTemplate = {
  id: string;
  name: string;
  /** 各分类内容的快照：{ [tabId]: content } */
  values: Record<string, string>;
  createdAt: number;
};

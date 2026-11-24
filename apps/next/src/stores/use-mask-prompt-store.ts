"use client";

/** 蒙版独立保存组装草稿，复用图片页的类型和拼接规则；最终正文写回 instruction，仅驻留内存。 */
import { create } from 'zustand';
import { useAnimaEditStore } from './use-anima-edit-store';
import type { useCreateFormStore } from './useCreateFormStore';
import { sanitizePromptTabs, assemblePrompt, appendToTabContent, applyTemplateToTabs, snapshotTabValues, createPromptTabId, createPromptTemplateId, movePromptTab, reorderPromptTab, orderPromptTabs } from '@/utils/promptTabs';
import { PROMPT_TAB_MAX } from '@/data/promptTabs';
import type { PromptTab } from '@/types/promptTabs';

// 只取原面板需要的组装契约，不引入图片尺寸、采样或种子状态。
export type PromptAssemblyState = Pick<ReturnType<typeof useCreateFormStore.getState>, 'promptTabs' | 'activePromptTabId' | 'promptTemplates' | 'setActivePromptTab' | 'movePromptTab' | 'reorderPromptTab' | 'setPromptTabOrder' | 'setPromptTabContent' | 'appendToPromptTab' | 'addPromptTab' | 'removePromptTab' | 'setPromptTabQuickWords' | 'togglePromptTabTool' | 'savePromptTemplate' | 'deletePromptTemplate' | 'applyPromptTemplate'>;
// 蒙版高级开关独立，关闭后保留已拼接正文供普通输入继续编辑。
interface MaskPromptState extends PromptAssemblyState { advanced: boolean; setAdvanced: (enabled: boolean) => void }
// 每次内容动作都重查导入和任务锁，旧弹窗回执也不能绕过。
const locked = () => { const state = useAnimaEditStore.getState(); return Boolean(state.taskId || state.importing); };

/** 正文与分类不一致时保留分类结构，把整段新正文放入质量组，不按逗号猜分类。 */
function seedTabs(tabs: PromptTab[], text: string): PromptTab[] {
  return assemblePrompt(tabs) === text.trim() ? tabs : tabs.map((tab, index) => ({ ...tab, content: index === 0 ? text : '' }));
}

/** 所有内容修改统一限 3000 字符，分隔符也算；超出部分截断，保留分类结构。 */
function updateTabs(change: (tabs: PromptTab[]) => PromptTab[]): void {
  if (locked()) return;
  const tabs: PromptTab[] = [];
  for (const tab of change(useMaskPromptStore.getState().promptTabs)) { const used = assemblePrompt(tabs).length, content = tab.content.slice(0, Math.max(0, 3000 - used - (used ? 2 : 0))); tabs.push({ ...tab, content }); }
  useMaskPromptStore.setState({ promptTabs: tabs });
}

// 每个动作只改蒙版草稿，模板只存分类；内容写入经过统一限长和任务锁。
export const useMaskPromptStore = create<MaskPromptState>((set, get) => ({
  advanced: false, promptTabs: sanitizePromptTabs([]), activePromptTabId: 'quality', promptTemplates: [],
  setAdvanced: advanced => { if (locked()) return; if (advanced) updateTabs(tabs => seedTabs(tabs, useAnimaEditStore.getState().settings.instruction)); set({ advanced }); },
  setActivePromptTab: activePromptTabId => set({ activePromptTabId }),
  // 调序只换排列，不走正文截短入口；放手时重查任务锁，防止迟到拖动改写忙碌会话。
  reorderPromptTab: (activeId, overId) => {
    if (!locked()) set(state => ({ promptTabs: reorderPromptTab(state.promptTabs, activeId, overId) }));
  },
  // 只提交蒙版自己的队列，既有订阅负责同步正文，取消时无需回滚。
  setPromptTabOrder: ids => {
    if (!locked()) set(state => ({ promptTabs: orderPromptTabs(state.promptTabs, ids) }));
  },
  movePromptTab: (id, direction) => { if (!locked()) set(state => ({ promptTabs: movePromptTab(state.promptTabs, id, direction) })); },
  setPromptTabContent: (id, content) => updateTabs(tabs => tabs.map(tab => tab.id === id ? { ...tab, content } : tab)),
  appendToPromptTab: (text, id) => updateTabs(tabs => tabs.map(tab => tab.id === (id ?? get().activePromptTabId) ? { ...tab, content: appendToTabContent(tab.content, text) } : tab)),
  addPromptTab: label => { if (locked() || !label.trim() || get().promptTabs.length >= PROMPT_TAB_MAX) return false; const id = createPromptTabId(); updateTabs(tabs => [...tabs, { id, label: label.trim().slice(0, 12), content: '', quickWords: [], custom: true }]); set({ activePromptTabId: id }); return true; },
  removePromptTab: id => { updateTabs(tabs => tabs.filter(tab => tab.id !== id || !tab.custom)); if (!get().promptTabs.some(tab => tab.id === get().activePromptTabId)) set({ activePromptTabId: get().promptTabs[0].id }); },
  setPromptTabQuickWords: (id, words) => updateTabs(tabs => tabs.map(tab => tab.id === id ? { ...tab, quickWords: words.map(word => word.trim()).filter(Boolean).slice(0, 24) } : tab)),
  togglePromptTabTool: (id, tool) => updateTabs(tabs => tabs.map(tab => tab.id === id ? { ...tab, tools: (tab.tools ?? []).includes(tool) ? tab.tools?.filter(item => item !== tool) : [...(tab.tools ?? []), tool] } : tab)),
  savePromptTemplate: name => { if (!locked() && name.trim()) set(state => ({ promptTemplates: [{ id: createPromptTemplateId(), name: name.trim().slice(0, 24), values: snapshotTabValues(state.promptTabs), createdAt: Date.now() }, ...state.promptTemplates].slice(0, 50) })); },
  deletePromptTemplate: id => { if (!locked()) set(state => ({ promptTemplates: state.promptTemplates.filter(item => item.id !== id) })); },
  applyPromptTemplate: id => { const template = get().promptTemplates.find(item => item.id === id); if (template) updateTabs(tabs => applyTemplateToTabs(tabs, template)); },
}));

// 分类确认后同步 instruction；仅观察分类或正文相同不写回，防止两份 store 互相循环通知。
useMaskPromptStore.subscribe((state, previous) => {
  if (!state.advanced || (state.promptTabs === previous.promptTabs && state.advanced === previous.advanced)) return;
  const instruction = assemblePrompt(state.promptTabs), edit = useAnimaEditStore.getState();
  if (instruction !== edit.settings.instruction) edit.setSettings(value => ({ ...value, instruction }));
});

// 其他编辑页改了公共正文时，按首次开启规则重建分类内容；只在高级模式且正文不同时同步。
useAnimaEditStore.subscribe((edit, previous) => {
  const state = useMaskPromptStore.getState();
  if (state.advanced && edit.settings.instruction !== previous.settings.instruction && edit.settings.instruction.trim() !== assemblePrompt(state.promptTabs)) updateTabs(tabs => seedTabs(tabs, edit.settings.instruction));
});

"use client";

/**
 * 蒙版正向提示词的独立高级组装草稿，复用图片页的分类模型与拼接函数。
 * 只保存分类和模板，实际生成仍读取原编辑会话的 instruction。
 * 不写图片页的分类与提示词 DOM，也不新增用户文档格式。
 * 路由切换保留内存草稿；原始图片和任务继续由既有领域 store 管理。
 * 数据所有权：普通图片分类属于 useCreateFormStore，本文件不借用其内容。
 * 共享的只有类型与纯函数；图片页高级开关不决定蒙版页显示状态。
 * 文本模型：普通输入与高级分类最终都写 settings.instruction。
 * negative 保持右侧独立管理，模板不包含负向预设。
 * 模型选择、LoRA 和控制补丁参数属于各自编辑模式，不放入分类模板。
 * 会话终止于渲染进程退出，不向用户 JSON 新增未版本化字段。
 * 订阅只发布文本，没有 IPC、文件读写或上传副作用。
 * 静态导出预渲染也可初始化空分类，不访问 document 或 window。
 * 内容上限沿用普通编辑输入的 3000 字符，按 JS UTF-16 长度计算。
 * 未提供 token 计数；显示的字符数不能作为模型上下文容量判断。
 */
import { create } from 'zustand';
import { useAnimaEditStore } from './use-anima-edit-store';
import type { useCreateFormStore } from './useCreateFormStore';
import { sanitizePromptTabs, assemblePrompt, appendToTabContent, applyTemplateToTabs, snapshotTabValues, createPromptTabId, createPromptTemplateId, movePromptTab, reorderPromptTab, orderPromptTabs } from '@/utils/promptTabs';
import { PROMPT_TAB_MAX } from '@/data/promptTabs';
import type { PromptTab } from '@/types/promptTabs';

// 复用面板只要求图片页组装字段和动作，不依赖图片尺寸、采样或 seed。
// 以现有 store 类型派生接口，原面板契约变更时由 typecheck 检查两端。
// 可选注入此窄契约，图片页默认仍使用原来的完整 store。
// 类型导入不会初始化图片页草稿或触发其持久化读取。
export type PromptAssemblyState = Pick<ReturnType<typeof useCreateFormStore.getState>, 'promptTabs' | 'activePromptTabId' | 'promptTemplates' | 'setActivePromptTab' | 'movePromptTab' | 'reorderPromptTab' | 'setPromptTabOrder' | 'setPromptTabContent' | 'appendToPromptTab' | 'addPromptTab' | 'removePromptTab' | 'setPromptTabQuickWords' | 'togglePromptTabTool' | 'savePromptTemplate' | 'deletePromptTemplate' | 'applyPromptTemplate'>;
// advanced 仅影响蒙版表面，不借用普通图片的高级开关。
// 开启前保存普通正文，取消高级后保留当前拼接结果供继续手动编辑。
// 分类、快捷词和工具绑定都存在本草稿，切换负面词预设不影响它们。
// setter 在忙碌时由同一个检查器拒绝，已经打开的 Portal 也不能越界写入。
interface MaskPromptState extends PromptAssemblyState { advanced: boolean; setAdvanced: (enabled: boolean) => void }
// importing 和 taskId 来自公共会话，不创建另一份过期的禁用状态。
// 即使弹窗在生成前已打开，返回结果时也必须重新检查最新任务门闩。
// 纯切换分类不改正文，可继续观察；实际内容动作均执行该检查。
// 没有文档也允许先整理提示词，图片前置仍由原生成按钮判断。
const locked = () => { const state = useAnimaEditStore.getState(); return Boolean(state.taskId || state.importing); };

/**
 * 初次或普通文本被修改后进入高级，将已有正文放入质量分类而不猜测语义。
 * 已有分类拼接与正文一致时直接恢复，不能每次切换都清空用户分类。
 * 手动正文与上次分类不同，保留分类结构和工具绑定，仅清其旧内容。
 * 这避免旧分类重新覆盖最新输入，也避免把同一段正文重复拼接两次。
 * 初始正文允许为空，分类依旧存在供角色、动作与背景工具使用。
 * 使用原 sanitizePromptTabs 生成本地化默认类别，不复制默认词清单。
 * 比较时使用普通正文的 trim，与实际提交时去除首尾空白的约定一致。
 * 已有分类包含多段内容时，不通过逗号拆分普通正文反推原分类。
 * 原因是自然语言和加权标签本身也可以包含逗号，拆分会破坏语义。
 * 默认质量分类承担无法自动归类的整段正文，不代表系统评估过质量。
 * 映射保留每个分类对象的其他属性，自定义工具绑定和快捷词不丢失。
 * 返回相同数组允许保留恢复信息，但调用方仍统一执行限长规则。
 */
function seedTabs(tabs: PromptTab[], text: string): PromptTab[] {
  return assemblePrompt(tabs) === text.trim() ? tabs : tabs.map((tab, index) => ({ ...tab, content: index === 0 ? text : '' }));
}

/**
 * 共用分类更新入口，限制拼接后的总长度为编辑器现有三千字符上限。
 * 所有快捷词、模板和工具最终经过该入口，不能只限制手动 textarea。
 * 内容按原分类顺序保留，长度预算计入分类间的逗号和空格。
 * 如果一个分类已耗尽预算，后续分类保留结构但清空超额内容。
 * 拼接仍使用原纯函数，避免显示预览和真正提交采用不同分隔规则。
 * 生成期间直接拒绝，不修改草稿也不伪装工具已成功写入任务。
 * 更新 source、mask 或结果 URL 都不属于本入口的职责。
 * 对每个非空历史片段预留两字符分隔预算，允许保守地少用一字符。
 * 末尾已有逗号时原算法只补空格，因此这里不会突破实际拼接上限。
 * 预算耗尽后的类别仍可选择和编辑，不因正文被截断删除类别结构。
 * 后续缩短前面类别不会自动恢复曾截去的文本，限制行为与普通输入一致。
 * 顺序是标签栏顺序，不能按最近编辑时间重排，否则生成正文会漂移。
 * 更新函数同步执行，先检查任务锁再计算内容，没有跨 await 的竞态窗口。
 * 导入图片期间也拒绝内容修改，避免文件解码完成时覆盖准备中的参数。
 * 该入口不抛业务错误，锁定时保留旧草稿，界面以禁用态说明不可编辑。
 */
function updateTabs(change: (tabs: PromptTab[]) => PromptTab[]): void {
  if (locked()) return;
  const tabs: PromptTab[] = [];
  for (const tab of change(useMaskPromptStore.getState().promptTabs)) { const used = assemblePrompt(tabs).length, content = tab.content.slice(0, Math.max(0, 3000 - used - (used ? 2 : 0))); tabs.push({ ...tab, content }); }
  useMaskPromptStore.setState({ promptTabs: tabs });
}

// 标准面板的全部行为在本草稿独立保存，只复用原来的纯数据算法。
// 分类默认上限、名称长度、快捷词数量和模板数量沿用图片页约定。
// 不复制 UI；角色、标签库、3D、模板与助手都由原面板渲染。
// setActivePromptTab 只改变观察分类，不主动改写实际生成正文。
// 动作保持同步，分类改变后可立即读取准确的 instruction 提交公共队列。
// 没有 persist，避免本轮 UI 改动扩展落盘契约或影响既有账户数据。
// 以下动作不访问 Node/Electron，模板仅是当前编辑会话内的纯对象。
// 删除默认分类被拒绝，自定义分类移除后选中状态回到第一项。
// 追加内容复用 appendToTabContent，已有末尾逗号不会重复追加。
// 修改快捷词只改变按钮清单，不会把快捷词列表误当作正文发送。
// 自定义分类可挂多个工具，确认结果由面板按现有规则追加。
// 模板保存只快照当前分类，不包含输入图片、模型路径或生成参数。
// 删除模板不更改当前正文，应用模板才通过 updateTabs 产生内容更新。
// setAdvanced 的写回通知由底部订阅统一处理，不依赖可见窗口的 effect。
// 生成已开始时不能切换开关，界面与 frozen prompt 不会出现解释冲突。
// 开启前取最新原文，避免使用页面上次渲染时的旧提示词闭包。
// 停用高级保留拼接正文，继续用普通助手编辑不丢失已有内容。
// 两种输入模式只改变同一个 instruction，不引入第二套任务参数。
// 默认分类从 sanitizePromptTabs 获取独立数组，不修改导入的默认对象。
// setAdvanced 重复开启时仍以当前实际正文为准，不能把组件旧闭包作为源。
// 活动分类 id 不参与生成拼接；删去自定义活动分类后只修正观察焦点。
// addPromptTab 返回布尔值，面板借此区分创建成功与已达分类上限。
// 自定义名称去首尾空白并限制十二字符，沿用原组装面板的名称约束。
// 默认类别不允许删除，过滤逻辑保留 custom=false 的匹配项。
// 快捷词最多二十四项，空白按钮被过滤，但不会主动插入正文。
// 工具绑定以工具 id 数组表示；再次点击同项是取消绑定，不重复注册。
// 保存模板的新项放在最前，最多保留五十份，避免无限扩大内存草稿。
// 模板 id 用原生成器创建，重名模板可共存，不以名称当对象身份。
// 应用不存在的模板不执行更新，避免删除后迟到的下拉事件清空正文。
// 应用模板通过 updateTabs，因此模板旧内容也必须接受长度和任务锁检查。
// save/delete 不调用 updateTabs，因为它们不改变任何当前分类正文。
// 观察分类变化无需同步 instruction，订阅只关注 promptTabs 引用与开关。
// 这些方法不创建异步 Promise，调用完成后正文与分类即处于一致状态。
export const useMaskPromptStore = create<MaskPromptState>((set, get) => ({
  advanced: false, promptTabs: sanitizePromptTabs([]), activePromptTabId: 'quality', promptTemplates: [],
  setAdvanced: advanced => { if (locked()) return; if (advanced) updateTabs(tabs => seedTabs(tabs, useAnimaEditStore.getState().settings.instruction)); set({ advanced }); },
  setActivePromptTab: activePromptTabId => set({ activePromptTabId }),
  // 蒙版分类遵循自身队列；重排只换位置，不改各组内容。
  // 复用同一个移动算法，但不调用图片 store，两个编辑草稿不会互相排序。
  // 此处直接换队列，不经过内容截短入口，避免排序顺带删除长提示词。
  // 正文订阅仍取完整分类结果；用户没有输入新内容，不能因为移动重新切词。
  // 当前任务或导入锁生效时拒绝改动，旧 Portal 和延迟按钮事件也无法绕过。
  // 动作同步完成，用户随后立即提交可读到新的拼接顺序。
  // advanced 关闭时只保留队列，普通手动正文仍由原编辑会话负责。
  // 重新开启时 seedTabs 比较的也是这个队列，不按默认分类反向推断文本。
  // 该会话原本只在内存保存，排序没有擅自新增另一份持久化文件。
  // 图片页仍有自己的落盘策略，复用计算不代表合并两种数据所有权。
  // 边界移动返回相同数组，底部订阅不会因为无效操作重新发布 instruction。
  // 蒙版的任务锁在放手时再判断，生成过程中不会接受晚到的拖拽事件。
  // 直接更新完整分类队列，不走会截短文本的 updateTabs 内容编辑通道。
  // 图片页的 persist 不参与本动作，两处同名分类保持各自的正文与顺序。
  // 蒙版提交边界：
  // 图片和蒙版可以同时存在同名分组，但它们不是同一个草稿。
  // 共用计算函数不会共用 Zustand 实例，也不会共用图片的持久化写入。
  // 锁的判断放在动作内部，不能只依靠界面上一帧的 disabled 值。
  // 例如手柄刚提起时可操作，放手前任务开始，就必须拒绝这次移动。
  // 拒绝时队列保留原样，不先修改再安排异步回滚。
  // 不走 updateTabs 是因为该通道服务正文编辑，有自身长度处理规则。
  // 调序只改变排列，不能顺便把已有长文本截掉。
  // 高级模式开关和蒙版图像本身均不由这个动作修改。
  reorderPromptTab: (activeId, overId) => {
    if (!locked()) set(state => ({ promptTabs: reorderPromptTab(state.promptTabs, activeId, overId) }));
  },
  // 同一完成入口接到蒙版自己的草稿，不调用图片页的 setState 或持久化。
  // 任务锁在动作边界再检查，不能只相信按钮渲染时的 disabled 快照。
  // 完成时若已经生成中，忽略这次提交；解锁以后用户可继续确认或取消。
  // 原订阅负责把已确认队列合并到 instruction，不在这里复制 DOM 写回路径。
  // 空组同样参与结构排序，但不会因此向最终指令插入多余空逗号。
  // 图片页和蒙版共用计算规则，保存范围仍分别属于各自业务。
  // 这里的 set 属于蒙版 store，不会触发图片草稿的用户文档写入。
  // 已确认的分类顺序通过既有订阅发布为蒙版正向提示词，不添加第二条同步链。
  // 回调只替换数组排列，其他 advanced 开关和当前分组身份仍由原 state 保留。
  // 不把取消旧排列做成一个 store 动作，取消阶段完全没有需要回滚的业务写入。
  // 这个动作不创建新的提示词模板，蒙版排序结果仍随当前编辑会话结束。
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

// 订阅属于常驻草稿，不依赖组装面板是否可见或已经卸载。
// 分类更新同步发布 instruction，用户确认工具后立即生成也能取得新正文。
// 关闭高级时不再发布分类结果，普通助手手动修改不会被旧分类覆盖。
// 仅分类或开关变化才写回，切换活动分类不触发无关表单更新。
// 相同正文不写回，避免 Zustand 之间重复通知形成渲染循环。
// 只改 instruction，负面词、控制区间、采样与资源选择保持当前值。
// 这不提交网络请求，也不创建新的生成队列或结果资源。
useMaskPromptStore.subscribe((state, previous) => {
  if (!state.advanced || (state.promptTabs === previous.promptTabs && state.advanced === previous.advanced)) return;
  const instruction = assemblePrompt(state.promptTabs), edit = useAnimaEditStore.getState();
  if (instruction !== edit.settings.instruction) edit.setSettings(value => ({ ...value, instruction }));
});

// 编辑工具继续共用正向正文，用户也可能先切到文字或边缘页修改它。
// 监听公共正文的外部变化，防止返回蒙版时仍显示上一份分类快照。
// 本 store 自己发布的合并结果已经相等，不反向重新归类。
// 因此两端订阅不会互相 set 形成无限递归或不断重复正文。
// 外部新正文沿用首次开启规则，保留分类结构与工具绑定，重置旧内容。
// 这种情况下无法推断新文本中哪些词原属角色、背景或镜头。
// 只有高级开启才接收变化，普通模式留给手动输入和原助手管理。
// 仅 negative 或采样变更不触发分类重建，避免不必要的用户草稿损失。
// 内容写入仍经过 updateTabs，沿用实时任务锁和总长度上限。
// 此订阅不读取 DOM，蒙版页面暂时隐藏或卸载时也可完成同步。
// 将首尾空白视为等价，与真正提交前 instruction.trim 的约定一致。
// 不监听图片文生图 store，普通图片提示词始终保持独立。
// 当前生成任务使用冻结快照，草稿同步不会改变已发送的请求。
// 随模块生命周期常驻，无 React effect 挂载次序或卸载清理竞态。
useAnimaEditStore.subscribe((edit, previous) => {
  const state = useMaskPromptStore.getState();
  if (state.advanced && edit.settings.instruction !== previous.settings.instruction && edit.settings.instruction.trim() !== assemblePrompt(state.promptTabs)) updateTabs(tabs => seedTabs(tabs, edit.settings.instruction));
});

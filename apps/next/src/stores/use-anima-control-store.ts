"use client";

/**
 * 控制编辑参数草稿：文字、边缘与蒙版分别使用自己的模板初值。
 * 只分离会影响推理的参数和资源选择，任务仍由原公共编辑队列管理。
 * 正反提示词继续共用文字编辑草稿，工具切换不会丢失刚输入的文本。
 * 不使用持久化中间件，不改变现有用户文档格式。
 */
import { create } from 'zustand';
import type { SetStateAction } from 'react';
import { useAnimaEditStore } from './use-anima-edit-store';
import { getAnimaControlDefaults } from '@/utils/comfy/anima-control-workflow';

// 只抽取参数与资源字段，不复制任务门闩、源 File 或 Blob URL 所有权。
// 每个模式的 seedMode 独立，蒙版初始 custom 才能复现模板种子。
// SelectedModel 与扩展数组仍沿用原表单类型，模型选择器不需要分叉。
// null 模型表示尚未手动选择，实际文件名由本模式 settings 决定。
type EditDraft = Pick<ReturnType<typeof useAnimaEditStore.getState>, 'settings' | 'selectedModel' | 'extensions' | 'seedMode'>;
export type ControlMode = 'edge' | 'inpaint';
// formMode 只控制文字编辑表单的显式模式按钮。
// 专用蒙版和边缘页面直接指定 mode，不因另一个隐藏表单切换而改变。
// drafts 不含结果和网络状态，所有页面仍看到同一个活动任务。
// update 接收函数以读取最新草稿，连续滑动不会覆盖另一个参数更新。
interface ControlStore { formMode: ControlMode | 'text'; drafts: Record<ControlMode, EditDraft>; update: (mode: ControlMode, patch: Partial<EditDraft>) => void; setFormMode: (mode: ControlStore['formMode']) => void }
// 初始化时分别调用模板读取器，两个 LoRA 空数组不共享可变引用。
// 控制模板本身没有 AnimeEditV2，不继承文字编辑的预载 LoRA。
// 用户手动选择扩展后保留该选择，重新挂载不会再初始化。
// getter 不访问磁盘，模板更新在下一次应用启动时自然生效。
// 默认 seed 保持字符串，安全整数检查仍由构建入口负责。
// null 和空扩展有不同语义；控制模式从明确的空列表开始。
const initial = (mode: ControlMode): EditDraft => ({ settings: getAnimaControlDefaults(mode), selectedModel: null, extensions: [], seedMode: 'custom' });
// store 只保存模式草稿，不引入第二个生成会话或取消入口。
// shallow 合并保留其余模式内容，更新边缘参数不会重置蒙版参数。
// update 不自动发起上传，所有网络行为仍属于公共执行器。
// formMode 不写入工作流，controlMode 在读取草稿时由模板初值带出。
// 控制草稿包含独立 LoRA 数组，显式删除全部后不会预载回来。
// 页面卸载不清空数据，返回时仍显示用户最近确认的值。
// 全局 source、result 和 taskId 继续由 useAnimaEditStore 持有。
export const useAnimaControlStore = create<ControlStore>(set => ({ formMode: 'text', drafts: { edge: initial('edge'), inpaint: initial('inpaint') }, update: (mode, patch) => set(state => ({ drafts: { ...state.drafts, [mode]: { ...state.drafts[mode], ...patch } } })), setFormMode: formMode => set({ formMode }) }));

/**
 * 从最新状态读取一次表单草稿，提交时不能使用上次渲染的参数闭包。
 * text 使用原 store，其默认采样值和预载编辑 LoRA 保持原有行为。
 * 控制模式仅覆盖参数与资源字段，指令仍从共用输入读取。
 * 返回新对象不转移资源所有权，不需要释放 source 或 result。
 * 文字模式没有 controlMode，沿用原 Cosmos 参考图构建分支。
 * 对象内数组只由专用 setter 替换，入队时执行器另外深克隆。
 * 本读取器也供异步资源快捷加载作身份校验，不依赖组件仍挂载。
 */
export function getAnimaEditDraft(mode: ControlMode | 'text'): EditDraft {
  // 公共提示词从当前文本草稿取值，而不是保存进入控制页时的一份副本。
  // 这样预设词、助手回写和手动输入都沿用现有更新链。
  // 读取不会写回任一 store，隐藏组件订阅也不会造成更新循环。
  // 默认模型仍保存在各自 settings，空选择不是“选择了文字默认模型”。
  const text = useAnimaEditStore.getState();
  if (mode === 'text') return text;
  const draft = useAnimaControlStore.getState().drafts[mode];
  return { ...draft, settings: { ...draft.settings, instruction: text.settings.instruction, negative: text.settings.negative } };
}

/**
 * 统一函数式 setter 契约，让已有模型和采样组件直接复用。
 * 更新按事件触发时的最新数据求值，多个输入的更新不会互相回滚。
 * 指令与负面词同步回文字草稿，保证编辑工具切换的文本连续性。
 * 控制参数写回对应 mode，绝不覆盖文字模式的采样器或模型默认值。
 * patch 仅允许 EditDraft 字段，不能修改队列动作函数。
 * 文字分支复用既有 patch，原组件调用方式保持兼容。
 * 控制分支是同步内存动作，不需要等待 effect 才能正确提交首个任务。
 * 不在切换时复制上一个模式参数，否则首次蒙版仍会继承错误默认值。
 * 调用者不能直接修改默认 JSON，只有本会话草稿可变。
 * 这里不做数值夹取，非法草稿应在构建入口得到明确错误。
 */
export function patchAnimaEditDraft(mode: ControlMode | 'text', patch: Partial<EditDraft>): void {
  // 模式资源 patch 不带 settings 时，不应引起一次无关提示词更新。
  // 控制页仅改变采样参数时仍保留同一组文本，不能从历史副本恢复旧指令。
  // 若用户同时输入正负文本，两个字段在同一次文字草稿更新中合并。
  // 手动指定的数字保留原值，模板默认只用于初始化和缺字段兼容。
  if (mode === 'text') { useAnimaEditStore.getState().patch(patch); return; }
  useAnimaControlStore.getState().update(mode, patch);
  if (patch.settings) useAnimaEditStore.getState().setSettings(previous => ({ ...previous, instruction: patch.settings!.instruction, negative: patch.settings!.negative }));
}
// 参数和模型 setter 共用同一个更新器，保留 React SetStateAction 的行为。
// 泛型 key 限制在草稿数据范围，类型不匹配会在 typecheck 阶段失败。
// 函数式更新使用最新值，空 LoRA 数组不会被其他页面默认列表覆盖。
// extensions 的 null 由模型 hook 在展示与快照时解释，不在这里自动添加。
// 返回的闭包只固定模式，数据在每次操作时重新读取。
// setSettings 之后立即提交也能读到新值，不依赖下一帧 React 渲染。
// 字段修改不改变已有任务的冻结快照，公共队列不订阅草稿参数。
export function editDraftSetter<K extends keyof EditDraft>(mode: ControlMode | 'text', key: K) {
  return (value: SetStateAction<EditDraft[K]>) => { const previous = getAnimaEditDraft(mode)[key]; patchAnimaEditDraft(mode, { [key]: typeof value === 'function' ? (value as (old: EditDraft[K]) => EditDraft[K])(previous) : value }); };
}

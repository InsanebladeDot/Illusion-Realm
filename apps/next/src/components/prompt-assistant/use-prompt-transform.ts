"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { t } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { usePromptAssistantStore } from "@/stores/usePromptAssistantStore";
import { preparePromptImages } from "@/utils/prompt-assistant-images";
import { MOSS_COMPOSITION_PRESET } from "@/data/moss-composition-instruction";
import { mossCompositionInstruction, validateMossComposition } from "@/utils/moss-composition-prompt";
import type { CompositionSize } from "@/view/create/moss-composition/composition-draft";
import { preferencesForPrompt, presetInstruction, presetName, transformPrompt } from "@/utils/prompt-assistant";
// 复用 Agent 已确定的本站模型与首次推荐，避免在两个功能里硬编码不同 Grok ID。
// 只读取模型选择，不调用 Agent 聊天或工具循环；真正转换仍使用原文本转换 IPC。
// 密钥在主进程注入，本 hook 不读取、传递或持久化明文凭据。
import { agentRunSelection, useAgentProviderStore } from "@/stores/use-agent-provider-store";
import { assertModelImages, promptModelId } from '@/utils/provider-image-capability';
import { assertTranslationReferenceKey } from '@/utils/prompt-translation-references';
export interface PromptTarget {
  contextId: string; read: () => string; write: (value: string) => void;
  // 仅指定媒体模式预处理；原稿保留给冲突判断与撤销，不改普通提示词行为。
  prepare?: (value: string) => string;
  restore?: (value: string, input: string) => string;
  referenceKey?: string;
  maxLength?: number;
  compositionSize?: CompositionSize;
  // 尺寸决定能否转译成构图，模型系列决定使用哪份预设偏好。
  mossPresetScope?: boolean;
  imageSources?: readonly string[];
}
interface Replacement { contextId: string; before: string; after: string; referenceKey?: string; compositionSize?: CompositionSize }
/** 多图标签的分组标题不是工作流引用，保留标题，只转换各组正文里的资源标记。 */
function prepareResult(value: string, prepare?: PromptTarget["prepare"]) {
  if (!prepare) return value;
  return value.split(/(^Image \d+:)/gim).map((part, index) => index % 2 ? part : prepare(part)).join("");
}
/** 保存文字收据，不保存图片、地址或密钥；写盘失败仍保留已返回的译文。 */
async function saveTransformRecord(record: import("@illusion-realm/shared").PromptTranslationRecord) {
  try { await usePromptAssistantStore.getState().save(current => ({ history: [record, ...(current.history ?? [])] })); }
  catch { useToastStore.getState().show(t("create.promptAssistant.history.saveFailed")); }
}
/** 取发送时的配置快照；读图失败直接停止，绝不退回纯文字假装识图成功。 */
async function requestPromptTransform(text: string, target: PromptTarget): Promise<Pick<Replacement, "after" | "compositionSize">> {
  await usePromptAssistantStore.getState().load();
  const preferences = preferencesForPrompt(usePromptAssistantStore.getState().preferences, !!target.compositionSize, !!target.mossPresetScope);
  const compositionSize = preferences.presetId === MOSS_COMPOSITION_PRESET ? target.compositionSize : undefined;
  const model = promptModelId(preferences) || (preferences.provider === 'custom' ? '' : (await agentRunSelection(preferences.provider)).model);
  if (target.imageSources) assertModelImages(preferences.provider, model, useAgentProviderStore.getState().catalogs);
  const name = presetName(preferences);
  // 编码仅发生在开关开启时；顺序对应模型看到的 Image 1、Image 2。
  const images = target.imageSources ? await preparePromptImages(target.imageSources) : undefined;
  const baseInstruction = presetInstruction(preferences);
  const instruction = (compositionSize ? mossCompositionInstruction(baseInstruction, compositionSize) : baseInstruction) + (target.prepare ? "\nPreserve all resource markers exactly, including <Picture N>, <Video N> and <Audio N>, plus any custom <prefix N> markers. Do not translate, rename, invent or renumber resource markers." : "")
    + (target.maxLength ? `\nKeep the complete output within ${target.maxLength} characters, including all sections and references.` : "");
  const response = await transformPrompt({ ...preferences, model, text, instruction, images });
  const normalized = compositionSize
    ? validateMossComposition(response, compositionSize)
    : prepareResult(response, target.prepare);
  const after = target.restore ? target.restore(normalized, text) : normalized;
  assertTransformLength(after, target.maxLength);
  await saveTransformRecord({ id: crypto.randomUUID(), createdAt: Date.now(), before: text, after, provider: preferences.provider, model, presetName: name, contextId: target.contextId });
  return { after, compositionSize };
}
/** 六段式输出也不能被编辑框截成半句话；超长时保留原稿，让用户缩短后再试。 */
function assertTransformLength(text: string, maxLength?: number) {
  if (maxLength !== undefined && text.length > maxLength) throw Error(t("create.promptAssistant.truncatedResponse"));
}
/** 请求锁与忙碌状态独立维护；成功结果仍交回原替换/撤销逻辑，失败统一释放按钮。 */
function usePromptTransformRun(target: PromptTarget, receive: (result: Replacement) => void, mounted: RefObject<boolean>) {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const notify = (message: string) => useToastStore.getState().show(message);
  const run = async () => {
    if (locked.current) return; const before = target.read();
    if (target.imageSources && !target.imageSources.length) { notify(t("create.promptAssistant.imagesFailed")); return; }
    if (!before.trim() && !target.imageSources?.length) { notify(t("create.promptAssistant.empty")); return; }
    locked.current = true; setBusy(true);
    try {
      // 指定 Euzhi 不等于切换 Agent 当前站点；仅取 Euzhi 已选模型的快照。
      // 未选模型时由原目录推荐补足，缺可用项会进入原错误提示而非猜一个模型。
      // GLM 和自定义站点继续沿用各自模型字段，切站不覆盖另一站参数。
      // 等模型期间用户仍可能改原稿，后面的 before/contextId 校验继续阻止迟到覆盖。
      // 解析模型失败也进入同一个 finally 释放按钮，不另开一个无法撤销的转换通道。
      // 资源表变化也算冲突，避免文字没变却把旧素材的转换结果覆盖到新素材上。
      // 多图结果再次转译时也保留分组标题，不能把 Image 2: 当作缺失的生成资源。
      const text = prepareResult(before, target.prepare);
      const output = await requestPromptTransform(text, target);
      receive({ contextId: target.contextId, before, referenceKey: target.referenceKey, ...output });
    } catch (error) { if (mounted.current) notify(error instanceof Error ? error.message : t("create.promptAssistant.failed")); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  return { busy, run };
}
export function usePromptTransform(target: PromptTarget) {
  const latest = useRef(target); const mounted = useRef(true);
  const [undo, setUndo] = useState<Replacement | null>(null); const [pending, setPending] = useState<Replacement | null>(null);
  useEffect(() => { latest.current = target; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const notify = (message: string) => useToastStore.getState().show(message);
  const apply = (result: Replacement) => {
    if (latest.current.contextId !== result.contextId) return;
    // 冲突后明确应用也要按当前资源表校验，已经删除的素材不能靠确认按钮绕过。
    try {
      assertTranslationReferenceKey(result.referenceKey, latest.current.referenceKey);
      // 坐标像标在纸上的刻度，换了纸张尺寸就得重新算。
      const size = latest.current.compositionSize;
      if (result.compositionSize && (size?.width !== result.compositionSize.width || size.height !== result.compositionSize.height)) {
        throw Error(t("create.promptAssistant.mossCompositionSizeChanged"));
      }
      const after = latest.current.restore ? result.after : prepareResult(result.after, latest.current.prepare);
      assertTransformLength(after, latest.current.maxLength);
      const before = latest.current.read(); latest.current.write(after);
      setUndo({ ...result, before, after }); setPending(null); notify(t("create.promptAssistant.success"));
    } catch (error) { notify(error instanceof Error ? error.message : t("create.promptAssistant.failed")); }
  };
  // 收件人仍须核对当前输入，就像快递到了也要核对门牌，不能只凭寄出时的地址交付。
  // contextId 对应分类或正文入口；before 对应发送时的原文，两项都一致才能直接替换。
  // 用户切换分类或继续输入时保留待确认结果，不把旧响应覆盖到另一段新稿上。
  // 已卸载的实例不再发布 React 状态，原请求的 finally 仍负责释放运行锁。
  // 主动应用待确认结果继续走原 apply，所以撤销保存的是真正替换前那一刻的文字。
  // 此步骤不重新读取供应商，回包属于发送时选定的那次转换。
  // 接收和发送分开只划分职责，不新增全局结果缓存或第二份请求队列。
  // 冲突提示属于当前 hook 实例，普通图与蒙版的 context 不会共用待确认状态。
  const receive = (result: Replacement) => {
    if (!mounted.current) return;
    if (latest.current.contextId === result.contextId && latest.current.read() === result.before && latest.current.referenceKey === result.referenceKey) apply(result);
    else { setPending(result); notify(t("create.promptAssistant.conflict")); }
  };
  const { busy, run } = usePromptTransformRun(target, receive, mounted);
  const revert = () => {
    if (!undo || undo.contextId !== target.contextId) return;
    if (target.read() !== undo.after) { notify(t("create.promptAssistant.undoConflict")); return; }
    target.write(undo.before); setUndo(null);
  };
  return { busy, run, revert, canUndo: undo?.contextId === target.contextId, pending: pending?.contextId === target.contextId ? pending : null, applyPending: () => { if (pending) apply(pending); }, discard: () => setPending(null) };
}

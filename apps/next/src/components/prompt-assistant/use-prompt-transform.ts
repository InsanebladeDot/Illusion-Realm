"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { usePromptAssistantStore } from "@/stores/usePromptAssistantStore";
import { presetInstruction, transformPrompt } from "@/utils/prompt-assistant";
// 复用 Agent 已确定的本站模型与首次推荐，避免在两个功能里硬编码不同 Grok ID。
// 只读取模型选择，不调用 Agent 聊天或工具循环；真正转换仍使用原文本转换 IPC。
// 密钥在主进程注入，本 hook 不读取、传递或持久化明文凭据。
import { agentRunSelection } from "@/stores/use-agent-provider-store";
export interface PromptTarget { contextId: string; read: () => string; write: (value: string) => void }
interface Replacement { contextId: string; before: string; after: string }
/**
 * 两个正文入口共用一次偏好读取和文本转换，hook 只负责当前输入的状态生命周期。
 * 本方法不操作任何编辑器，远端成功不等于允许覆盖用户此刻的草稿。
 * 密钥仍在主进程注入，这里只确定供应商、模型和已选择的指令。
 * 读取或请求失败向调用方拒绝，由 hook 的 catch 提示、finally 解锁。
 * 等待模型目录时用户可以继续编辑，调用方会在回包后重新核对原稿。
 * 与 Agent 共用的是本站模型选择，不启动 Agent 工具轮次或改变聊天供应商。
 * preferences 取 load 后的最新快照，避免首帧默认值覆盖用户保存的 Euzhi。
 * GLM/custom 的模型字段仍按原规则选择，不因增加本站丢掉旧自定义配置。
 */
// 历史像留存已签收的快递单：记录发送快照与实际回包，不把后改的设置贴到旧结果上。
// 未应用的冲突结果也已真实返回，应能从历史找回；撤销仅恢复输入，不删除收据。
// 只有请求成功才进入保存，401、403、空返回与截断输出不会制造成功历史。
// 保存失败单独提示，已经得到的译文仍交给输入冲突检查，不能因此丢掉模型结果。
// 请求期间切换分类或离开页面不抹掉成功结果，记录不依赖原编辑器继续挂载。
// 普通文档只存原文、译文和公开标签，不保存地址、系统指令或 API Key。
// presetName 在发送时解析，删除或改名预设不会让旧记录变成另一个预设。
// createdAt 取完成时刻，多请求完成先后才是历史的默认排列依据。
// append 使用函数式保存，合并排队期间其他输入刚完成的记录。
// 保存异常在此被消费，不冒充供应商失败，也不产生未处理 Promise。
async function requestPromptTransform(text: string, contextId: string): Promise<string> {
  // 请求分为取偏好、发远端、保存本地收据三个阶段，只有第二阶段产生模型结果。
  // 第一阶段失败仍由外层原 catch 接住，不会记录“使用默认模型成功”的假条目。
  // 模型选择期间输入可能继续变化，contextId 和 text 是发起时捕获的值。
  // 不能在 await 之后再从 latest.current.read 读取原文，那会把新稿冒充发送内容。
  // 供应商、预设和模型都从同一个发送快照确定，避免记录三者来自不同时刻。
  // 自定义预设可能与内置预设同名，实际转换仍用原 id 寻找指令。
  // 历史名称只帮助阅读，不用于选择请求模型或重新执行该条记录。
  // 本函数不更新 React busy，外层 finally 统一恢复真实请求按钮。
  // 保存历史的等待结束后仍需 receive 重新核对草稿，不能省掉原冲突保护。
  // 中途切站不改变已发请求，收据不会按保存时的新站点重新标记。
  // 远端成功、本地失败是两个独立结果，用户提示只说明后一个失败。
  // 本地失败不会自动重发远端请求，避免额外计费及生成不一样的译文。
  // 用户撤销的是当前文字替换，历史不随 undo 删除，方便之后找回。
  // 主动放弃待确认结果也只是关闭提示，不把已经完成的翻译视为从未发生。
  // 同样的中文描述先后得到不同译文时，两次成功都保留，不以原文做缓存键。
  // record 不含 instruction 正文，避免把大型自定义指令重复写入每条收据。
  // 不把记录附在下一轮消息中；原 transformPrompt 的 schema 只提交转换契约字段。
  // 页面卸载只停止原输入状态更新，成功收据仍通过现有持久化链路保存。
  await usePromptAssistantStore.getState().load();
  const preferences = usePromptAssistantStore.getState().preferences;
  const model = preferences.provider === "euzhi" ? (await agentRunSelection("euzhi")).model : preferences.provider === "glm" ? preferences.model : preferences.customModel;
  const presetName = preferences.presets.find(item => item.id === preferences.presetId)?.name ?? t(preferences.presetId === "anima" ? "create.promptAssistant.anima" : "create.promptAssistant.translation");
  const after = await transformPrompt({ ...preferences, model, text, instruction: presetInstruction(preferences) });
  const record = { id: crypto.randomUUID(), createdAt: Date.now(), before: text, after, provider: preferences.provider, model, presetName, contextId };
  try { await usePromptAssistantStore.getState().save(current => ({ history: [record, ...(current.history ?? [])] })); }
  catch { useToastStore.getState().show(t("create.promptAssistant.history.saveFailed")); }
  return after;
}
export function usePromptTransform(target: PromptTarget) {
  const latest = useRef(target); const locked = useRef(false); const mounted = useRef(true);
  const [busy, setBusy] = useState(false); const [undo, setUndo] = useState<Replacement | null>(null); const [pending, setPending] = useState<Replacement | null>(null);
  useEffect(() => { latest.current = target; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const notify = (message: string) => useToastStore.getState().show(message);
  const apply = (result: Replacement) => {
    if (latest.current.contextId !== result.contextId) return;
    const before = latest.current.read(); latest.current.write(result.after);
    setUndo({ ...result, before }); setPending(null); notify(t("create.promptAssistant.success"));
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
    if (latest.current.contextId === result.contextId && latest.current.read() === result.before) apply(result);
    else { setPending(result); notify(t("create.promptAssistant.conflict")); }
  };
  const run = async () => {
    if (locked.current) return; const before = target.read();
    if (!before.trim()) { notify(t("create.promptAssistant.empty")); return; }
    locked.current = true; setBusy(true);
    try {
      // 指定 Euzhi 不等于切换 Agent 当前站点；仅取 Euzhi 已选模型的快照。
      // 未选模型时由原目录推荐补足，缺可用项会进入原错误提示而非猜一个模型。
      // GLM 和自定义站点继续沿用各自模型字段，切站不覆盖另一站参数。
      // 等模型期间用户仍可能改原稿，后面的 before/contextId 校验继续阻止迟到覆盖。
      // 解析模型失败也进入同一个 finally 释放按钮，不另开一个无法撤销的转换通道。
      receive({ contextId: target.contextId, before, after: await requestPromptTransform(before, target.contextId) });
    } catch (error) { if (mounted.current) notify(error instanceof Error ? error.message : t("create.promptAssistant.failed")); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const revert = () => {
    if (!undo || undo.contextId !== target.contextId) return;
    if (target.read() !== undo.after) { notify(t("create.promptAssistant.undoConflict")); return; }
    target.write(undo.before); setUndo(null);
  };
  return { busy, run, revert, canUndo: undo?.contextId === target.contextId, pending: pending?.contextId === target.contextId ? pending : null, applyPending: () => { if (pending) apply(pending); }, discard: () => setPending(null) };
}

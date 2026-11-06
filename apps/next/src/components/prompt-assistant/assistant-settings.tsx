"use client";

import { useState } from "react";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { useTranslation } from "@/i18n";
import { usePromptAssistantStore } from "@/stores/usePromptAssistantStore";
import { useToastStore } from "@/stores/useToastStore";
import { assistantError } from "@/utils/prompt-assistant";
// 新增和编辑共用原输入样式，主题切换不依赖浏览器默认表单配色。
// 保存后的记录仍采用原有 name/instruction 结构，无需变更用户数据版本。
// 两个输入都保留原长度上限，管理功能不扩大远端请求的指令容量。
// name 是给用户识别的标题，不参与模型名称、文件路径或 API 地址解析。
// instruction 保持多行文本，修改后下一次转换才读取新内容。
// 已经发出的转换请求保留其原指令，不由编辑表单尝试取消或重写。
// 删除也只移除可选模板，不回滚已经替换到提示词输入框的文字。
// 主表面通过既有订阅重新渲染菜单，无需另外缓存一份预设列表。
// 空名称或空正文沿用原有校验提示，编辑不能绕过新增的内容要求。
// 表单成功关闭以后再次打开，会以持久化记录重建草稿而非复用旧 state。
// 修改不提供系统密钥读写入口，沿用非密钥段落的最小数据范围。
// 异步失败由原工具提示处理，正文和模型连接参数不会成为错误日志内容。
const INPUT = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent-stroke";
/**
 * 自定义预设新增与编辑共用原有表单，不复制弹窗或另外存一份配置。
 * presetId 缺省为新增；编辑保留原 id，重命名不会打断选中关系。
 * 草稿仅存在本次弹窗，取消或关闭不写入用户数据。
 * 删除在同一表单二次确认，不能点一次管理按钮就丢失指令。
 * 内置预设不在 preferences.presets 中，不能由此表单修改或删除。
 * 落盘复用 store.save 的成功提交和失败回滚，不提前关闭失败的表单。
 */
export function AssistantSettings({ onClose, presetId }: { onClose: () => void; presetId?: string }) {
  const { t } = useTranslation(); const preferences = usePromptAssistantStore(state => state.preferences);
  // 首次挂载从记录恢复草稿，之后外部重绘不能覆盖用户尚未保存的输入。
  // 查找只访问自定义数组，不把 translate/anima 内置文本当作可写记录。
  // confirming 与 busy 分开：前者是用户确认意图，后者才表示正在落盘。
  const preset = preferences.presets.find(item => item.id === presetId);
  const [busy, setBusy] = useState(false), [confirming, setConfirming] = useState(false), [name, setName] = useState(preset?.name ?? ""), [instruction, setInstruction] = useState(preset?.instruction ?? "");
  // 保存采用提交时最新列表，避免覆盖打开弹窗后其他输入框保存的预设。
  // 编辑不存在的 id 必须失败，不能意外新建一个相同 id 的记录。
  // 编辑仅替换名称和正文，保留当前 presetId，不能偷偷切换正在使用的预设。
  // 新增继续自动选中新记录，与原有添加按钮的行为一致。
  // trim 只发生在明确保存时，输入过程中保留用户空格和换行。
  // persist 失败时保留草稿并恢复按钮，不给出虚假的保存成功提示。
  // 不把指令文本或数据文档打印到控制台，错误使用已有友好提示。
  // busy 同时禁用保存与删除，防止同一表单发起互相覆盖的两次写盘。
  const submit = async () => {
    // 确认删除期间也拦住隐式 form 提交，按 Enter 不能意外保存草稿。
    // busy 防止键盘与点击同轮触发重复提交，按钮禁用之外再保留逻辑边界。
    // 返回不会清空草稿，用户取消删除后仍可正常保存。
    if (busy || confirming) return;
    setBusy(true);
    try {
      const state = usePromptAssistantStore.getState(), current = state.preferences;
      if (!name.trim() || !instruction.trim() || presetId && !current.presets.some(item => item.id === presetId)) throw new Error("presetInvalid");
      const value = { id: presetId ?? crypto.randomUUID(), name: name.trim(), instruction: instruction.trim() };
      await state.save(presetId ? { presets: current.presets.map(item => item.id === presetId ? value : item) } : { presetId: value.id, presets: [...current.presets, value] });
      useToastStore.getState().show(t("create.promptAssistant.presetSaved")); onClose();
    } catch (error) { useToastStore.getState().show(error instanceof Error && error.message === "presetInvalid" ? t("create.promptAssistant.presetInvalid") : assistantError(error)); }
    finally { setBusy(false); }
  };
  // 删除只按原 id 定位，草稿名称即使改过也不会影响目标记录。
  // 删除当前预设后回退英文翻译，防止保存悬空 presetId。
  // 删除其他预设保留正在使用的内置或自定义选择。
  // 只删除用户数组中的一项，其余记录的顺序和内容不发生变化。
  // 最后一项删除后空数组合法，不需要伪造一个自定义默认预设。
  // 成功写盘才提示完成，失败仍停留确认区，用户可以重试或取消。
  // 双击确认不能绕过 busy，异步保存期间所有变更入口均禁用。
  // 已经被另一处删除的项不重复写盘，明确反馈无效目标。
  // 预设选择与数组在同一 save 中提交，不产生中间的悬空选择状态。
  // 这里只使用既有非密钥配置存储，删除预设不会删除连接或 API Key。
  const remove = async () => {
    // 删除函数只接受已确认的用户操作，不把展示确认区等同于已经同意删除。
    // 表单仍在写盘时重复激活不再启动第二次持久化。
    // 无效 id 的检查继续在 try 中报告友好错误，不跨 React 事件抛异常。
    if (busy || !confirming) return;
    setBusy(true);
    try {
      const state = usePromptAssistantStore.getState(), current = state.preferences;
      if (!presetId || !current.presets.some(item => item.id === presetId)) throw new Error("presetInvalid");
      await state.save({ presets: current.presets.filter(item => item.id !== presetId), presetId: current.presetId === presetId ? "translate" : current.presetId });
      useToastStore.getState().show(t("create.promptAssistant.presetDeleted")); onClose();
    } catch (error) { useToastStore.getState().show(assistantError(error)); }
    finally { setBusy(false); }
  };
  // 标题明确当前是编辑，仍沿用原资源弹窗的宽屏居中与窄屏替换机制。
  // 通过外壳关闭时检查 busy，写盘未完成不能让用户误以为操作已取消。
  // 既有 titleId 和数据标记保留，其他提示词输入复用方无需修改。
  return <ResourceDialogShell open title={t(presetId ? "create.promptAssistant.editPreset" : "create.promptAssistant.addPreset")} titleId="prompt-assistant-settings" onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <form className="mx-auto max-w-xl space-y-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
      {/* 界面：确认删除时锁定草稿，取消确认后仍能继续编辑原输入。 */}
      {/* 名称和正文沿用新增表单及其长度限制，不使用第二套编辑控件。 */}
      {/* busy 时禁用输入，避免保存中的修改看似成功却未包含在已提交值中。 */}
      <label className="block space-y-1 text-sm">{t("create.promptAssistant.presetName")}<input data-assistant-preset-name autoFocus disabled={busy || confirming} value={name} maxLength={80} onChange={event => setName(event.target.value)} className={INPUT} required /></label>
      <label className="block space-y-1 text-sm">{t("create.promptAssistant.instruction")}<textarea data-assistant-preset-instruction disabled={busy || confirming} value={instruction} maxLength={8000} rows={7} onChange={event => setInstruction(event.target.value)} className={INPUT} required /></label>
      {/* 删除确认只显示原记录名，避免把未保存的新名称误认为已落盘目标。 */}
      {/* type=button 保证删除与取消不会冒泡触发 form 的保存提交。 */}
      {/* 编辑入口只有自定义记录；内置项不渲染删除按钮。 */}
      {/* 确认区保留普通取消，用户无需关闭整个弹窗即可放弃删除。 */}
      {/* 破坏性操作使用现有主题 destructive 色，不写死红色。 */}
      {confirming && <p data-assistant-delete-confirmation role="alert" className="text-sm">{t("create.promptAssistant.deletePresetConfirm", { name: preset?.name ?? name })}</p>}
      <div className="flex justify-end gap-3">{preset && <button data-assistant-delete type="button" disabled={busy} onClick={() => confirming ? void remove() : setConfirming(true)} className="mr-auto rounded-lg border border-destructive/30 px-4 py-2 text-sm text-destructive disabled:opacity-50">{t(confirming ? "create.promptAssistant.confirmDeletePreset" : "common.delete")}</button>}{confirming ? <button data-assistant-delete-cancel type="button" disabled={busy} onClick={() => setConfirming(false)} className="rounded-lg px-4 py-2 text-sm">{t("common.cancel")}</button> : <button data-assistant-save type="submit" disabled={busy} className="rounded-lg bg-accent-fill px-5 py-2 text-sm text-accent-fill-foreground disabled:opacity-50">{t(busy ? "create.promptAssistant.busy" : "create.promptAssistant.save")}</button>}</div>
    </form>
  </ResourceDialogShell>;
}

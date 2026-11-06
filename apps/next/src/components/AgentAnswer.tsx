"use client";

/**
 * 界面：Agent 回复正文与复制入口；附件、工具过程和错误仍由消息行负责。
 * 阅读面渲染 Markdown，剪贴板与模型上下文继续使用未经改写的原始字符串。
 * 不把渲染后的 innerText 反写 store，表格、代码与 H3 标签不会丢失原始格式。
 * 不添加第二套编辑器状态，流式追加和历史会话恢复继续由 useAgentStore 管理。
 */
import { Copy } from "lucide-react";
import { MarkdownResponse } from "@/components/MarkdownResponse";
import { useTranslation } from "@/i18n";
import { copyText } from "@/utils/charactersFormat";
import { useToastStore } from "@/stores/useToastStore";

// text 是当前消息累计正文；streaming 只控制尾部指示和复制入口的状态。
// 没有完成的回复仍可阅读，不用等待整次模型调用结束才展示标题或表格。
// 流结束后按钮自动可用，复制的是最终原文而不是一个较早的闭包快照。
// 原文保留 CRLF、缩进与表格竖线，不以显示层做过的换行归一化替换它。
// text 不包含角色名；剪贴板不附加 Agent 标签或页面工具按钮文案。
// streaming 缺省等同于已完成，历史会话不必补写新的持久化字段。
interface AgentAnswerProps { text: string; streaming?: boolean }

/**
 * 复制沿用项目现有剪贴板封装，异常转为 false，不产生未处理的 Promise 拒绝。
 * 成功与失败文案复用已有词条，界面中不新增硬编码中文。
 * 复制按钮显式标记 type=button，不触发外层输入区的表单提交。
 * 生成中禁用复制避免把尚未写完的 Markdown 误当作最终输出。
 * 禁用状态只是按钮行为，不阻止用户按需手动选择当前可见内容。
 * 图标提供 aria-label 和 title，键盘与屏幕阅读器都能识别动作。
 * 流式尾标与正文分开，复制的原文没有 ▍ 字符。
 * 尾标不使用 role=alert，逐 token 更新不会触发反复朗读。
 * MarkdownResponse 的 memo 复用既有文本，外围消息状态变化不会重复解析旧回复。
 * 深浅主题使用现有 muted 和 foreground token，不引入固定白底。
 * 复制按钮不浮在文字之上，长回复最后一行仍能完整选中。
 * 文本选择与浏览器原生复制不被接管，用户仍可只复制一小段。
 * 组件不读 Node 或 Electron 对象，可用于普通浏览器预览。
 * 未完成的 Markdown 由解析器容错，尾标不拼入待解析字符串。
 * 错误与主动停止状态仍由消息行显示，不能把部分正文伪装成完整成功。
 * 这个组件不启动生成或执行链接，只负责现有消息的可读展示。
 * copyText 的失败分支也显示提示，避免剪贴板权限不足时静默无响应。
 * 复制成功后不设置消息状态，不会触发会话保存或重新开始模型调用。
 * 使用通用复制词条作为可访问名称，切换语言时按钮名称同步更新。
 * 不通过 DOM 查询获取正文，单页多条回复的复制入口不会串到第一条消息。
 * 工具输出可能含 JSON 或路径，不放入此组件就不会被误解释为可阅读文档。
 * 空回复的等待动画仍由消息行负责，本组件仅在已有正文时挂载。
 * 回复完成后即使后续另一条消息开始流式更新，本条原文仍保持独立。
 * Clipboard API 只能在明确点击后调用，组件挂载与流式重绘不访问剪贴板。
 * 复制成功的 toast 沿用提示词助手现有反馈，不额外引入一组重复翻译。
 * 不把原文存在按钮属性中，长文档不会被复制到 DOM 属性或 title 中。
 */
export function AgentAnswer({ text, streaming }: AgentAnswerProps) {
  const { t } = useTranslation();
  const copy = async () => { const copied = await copyText(text); useToastStore.getState().show(t(copied ? "create.promptAssistant.copied" : "common.copyFailed")); };
  return <>
    {/* 界面：仅助手正文采用 Markdown；用户输入和工具输出保留原样。 */}
    <MarkdownResponse markdown={text} />
    {streaming && <span aria-hidden="true" className="ml-0.5 animate-pulse">▍</span>}
    {/* 界面：复制完整 Markdown 原文，不从渲染出来的表格拼回文本。 */}
    {/* 界面：回答尾部的小复制图标，去掉文字按钮对正文的视觉干扰。 */}
    {/* title 与 aria-label 保留完整名称，鼠标悬停和辅助阅读仍可识别。 */}
    {/* 点击仍复制完整原文，布局优化不改变剪贴板内容和失败提示。 */}
    <button data-agent-copy type="button" disabled={streaming} title={t("common.copy")} aria-label={t("common.copy")} onClick={() => { void copy(); }} className="mt-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-muted hover:text-foreground disabled:opacity-40"><Copy size={13} /></button>
  </>;
}

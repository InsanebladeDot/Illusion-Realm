"use client";

import { memo, useEffect, useRef } from "react";
import {
  AlertCircle,
  Brain,
  Bot,
  Loader2,
  Plus,
  Square,
  Trash2,
  Wrench,
} from "lucide-react";
import { useTranslation } from "@/i18n";
import {
  useAgentStore,
  type AgentMessage,
  type AgentRunStep,
  type AgentSession,
} from "@/stores/useAgentStore";
import { AgentComposer } from "@/view/agent/AgentComposer";
import { AgentKeyNotice } from "@/view/agent/AgentKeyNotice";
import { AgentImageThumbnails } from "@/view/agent/AgentAttachments";
import { AgentGeneratedImages } from "@/view/agent/AgentGeneratedImages";
import { cn } from "@/utils/cn";
import { subscribeAgentEvents } from "@/utils/electronBridge";
import { THIN_BORDER_CLASS, THIN_DIVIDER_CLASS } from "@/utils/layout";

/** 未开始对话时主区居中的那一屏（对应 Codex 的「你想让我们在 X 中构建什么？」） */
function AgentHero() {
  const { t } = useTranslation();
  return (
    <div
      data-agent-hero
      className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Bot className="h-7 w-7" />
      </span>
      <h2 className="text-xl font-semibold tracking-tight">
        {t("agent.hero.title")}
      </h2>
      <p className="max-w-md text-xs text-muted-foreground">
        {t("agent.hero.subtitle")}
      </p>
    </div>
  );
}

/**
 * 过程区：模型思考 + 工具调用（参数与输出）。
 * 放在回答文本**上方** —— 和 Codex 一样：先看到做了什么，再看到结论。
 */
function AgentMessageSteps({ steps }: { steps: AgentRunStep[] }) {
  const { t } = useTranslation();
  if (steps.length === 0) return null;

  return (
    <ul data-agent-steps className="mt-2 space-y-1.5">
      {steps.map((step, index) =>
        step.kind === "reasoning" ? (
          <li
            key={`reasoning-${index}`}
            data-agent-step="reasoning"
            className="rounded-lg bg-muted/40 px-2.5 py-2"
          >
            <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Brain className="h-3.5 w-3.5" />
              {t("agent.message.reasoning")}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {step.text}
            </p>
          </li>
        ) : (
          <li
            key={step.id}
            data-agent-step="tool"
            data-agent-tool={step.name}
            className="rounded-lg bg-muted/40 px-2.5 py-2"
          >
            <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              {step.state === "running" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wrench className="h-3.5 w-3.5" />
              )}
              {step.name}
              {step.state === "running" ? (
                <span className="font-normal">
                  · {t("agent.message.toolRunning")}
                </span>
              ) : null}
            </p>
            {Object.keys(step.arguments).length > 0 ? (
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {JSON.stringify(step.arguments)}
              </p>
            ) : null}
            {step.output ? (
              <p
                data-agent-tool-output
                className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs"
              >
                {step.output}
              </p>
            ) : null}
          </li>
        )
      )}
    </ul>
  );
}

/**
 * 单条消息（过程区 / 正文 / 附件 / 失败 / 已停止）。
 *
 * **为什么 memo**：流式追加时只有正在接收的那一条会被重建（store 里其余消息引用不变），
 * 没有 memo 的话每个 token 都会重渲染整段会话 —— 长回答时界面会明显跟不上流
 * （实测：8k 字符的回答会让整页长时间无响应）。
 */
const AgentMessageRow = memo(function AgentMessageRow({
  message,
}: {
  message: AgentMessage;
}) {
  const { t } = useTranslation();
  return (
    <li
      data-agent-message
      data-agent-role={message.role}
      className={cn(
        "rounded-xl border px-3 py-2",
        message.role === "user"
          ? "border-transparent bg-muted/60"
          : "bg-background",
        message.role === "agent" ? THIN_BORDER_CLASS : null
      )}
    >
          <p className="text-[11px] font-medium text-muted-foreground">
            {message.role === "user"
              ? t("agent.message.you")
              : t("agent.message.agent")}
          </p>
          <AgentMessageSteps steps={message.steps ?? []} />
          {message.text ? (
            <p
              // 钩子只挂在**助手**那一条上：用户消息也带同名钩子时，
              // `querySelector('[data-agent-answer]')` 会先命中用户那条（自检脚本踩过）
              data-agent-answer={message.role === "agent" ? "" : undefined}
              className={cn(
                "mt-1 whitespace-pre-wrap break-words text-sm",
                message.steps && message.steps.length > 0 ? "mt-2" : null
              )}
            >
              {message.text}
              {message.streaming ? (
                <span className="ml-0.5 animate-pulse">▍</span>
              ) : null}
            </p>
          ) : message.streaming ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("agent.status.generating")}
            </p>
          ) : null}
          {message.attachments && message.attachments.length > 0 ? (
            <AgentImageThumbnails
              attachments={message.attachments}
              className="mt-2"
            />
          ) : null}
          {message.generatedImages && message.generatedImages.length > 0 ? (
            <AgentGeneratedImages images={message.generatedImages} />
          ) : null}
          {message.error ? (
            <p
              data-agent-message-error
              className="mt-2 flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{message.error}</span>
            </p>
          ) : null}
          {message.cancelled ? (
            <p
              data-agent-message-cancelled
              className="mt-2 text-xs text-muted-foreground"
            >
              {t("agent.message.cancelled")}
            </p>
          ) : null}
    </li>
  );
});

/** 对话区：一轮提问 + 助手的**真实流式回答**（每条消息一行，行内 memo 见上） */
function AgentMessageList({ session }: { session: AgentSession }) {
  return (
    <ul
      data-agent-messages
      className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4"
    >
      {session.messages.map((message) => (
        <AgentMessageRow key={message.id} message={message} />
      ))}
    </ul>
  );
}

/** 会话列表（本页左栏）：一行一个会话，悬停出现删除按钮 */
function AgentSessionList() {
  const { t } = useTranslation();
  const sessions = useAgentStore((state) => state.sessions);
  const activeSessionId = useAgentStore((state) => state.activeSessionId);
  const selectSession = useAgentStore((state) => state.selectSession);
  const deleteSession = useAgentStore((state) => state.deleteSession);

  if (sessions.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">
        {t("agent.sessions.empty")}
      </p>
    );
  }

  return (
    <ul data-agent-sessions className="flex flex-col gap-0.5">
      {sessions.map((session) => {
        const active = session.id === activeSessionId;
        return (
          <li key={session.id} className="group relative">
            <button
              type="button"
              data-agent-session={session.id}
              aria-current={active ? "true" : undefined}
              onClick={() => selectSession(session.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 pr-8 text-left text-xs transition-colors",
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <span className="min-w-0 truncate">{session.title}</span>
            </button>
            <button
              type="button"
              data-agent-session-delete={session.id}
              aria-label={t("agent.sessions.delete")}
              title={t("agent.sessions.delete")}
              onClick={() => deleteSession(session.id)}
              className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Agent 页 —— 仿 Codex 的对话界面。
 *
 * 区域（沿用 AGENTS.md 的区域词表）：
 * - `rail`  本页左栏 = 会话列表（新聊天 / 会话 / 未接入提示）
 * - `stage` 右侧主区 = 对话区（没消息时显示 hero）
 * - `composer` 底部输入区（见 `AgentComposer`）
 *
 * 现状：后端已接通（Python sidecar + 事件流），会话仍**只存在内存里**：切走这一页就没了
 * （落盘要等用户数据文档的格式变更，见 `useAgentStore` 的注释）。
 * 没配 API Key 时 `sendDraft` 会在拉起进程之前拦下，并在输入区上方给出
 * 「去设置里填写」的可点提示（见 `AgentKeyNotice`）。
 */
export function AgentPage() {
  const { t } = useTranslation();
  const sessions = useAgentStore((state) => state.sessions);
  const activeSessionId = useAgentStore((state) => state.activeSessionId);
  const createSession = useAgentStore((state) => state.createSession);
  const applyEvent = useAgentStore((state) => state.applyEvent);
  const running = useAgentStore((state) => state.runningRunId !== null);
  const toolNames = useAgentStore((state) => state.toolNames);
  const cancelRun = useAgentStore((state) => state.cancelRun);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ?? null;
  const lastMessage = activeSession?.messages[activeSession.messages.length - 1];

  /**
   * 订阅主进程推来的事件流：挂载时订、卸载时退。
   * `applyEvent` 只认当前 `runId`，所以取消 / 重开后迟到的帧会自己丢掉 —— 不需要在这里过滤。
   */
  useEffect(() => subscribeAgentEvents(applyEvent), [applyEvent]);

  /** 流式追加时把视图钉在最底部（写 scrollTop 即可，不需要节拍） */
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [
    lastMessage?.text.length,
    lastMessage?.generatedImages?.length,
    activeSession?.messages.length,
  ]);

  return (
    <div className="flex h-full min-h-0">
      {/* rail：本页左栏 = 会话列表 */}
      <aside
        data-agent-sidebar
        className={cn(
          "hidden w-[248px] shrink-0 flex-col border-r md:flex",
          THIN_DIVIDER_CLASS
        )}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 px-3 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Bot className="h-4 w-4" />
            {t("agent.title")}
          </span>
          <button
            type="button"
            data-agent-new-chat
            onClick={() => createSession()}
            title={t("agent.newChat")}
            aria-label={t("agent.newChat")}
            className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("agent.newChat")}
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
            {t("agent.sessions.title")}
          </p>
          <AgentSessionList />
        </div>
      </aside>

      {/* stage：对话区 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <header
          className={cn(
            "flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3",
            THIN_DIVIDER_CLASS
          )}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {activeSession?.title ?? t("agent.title")}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {t("agent.hero.subtitle")}
            </p>
          </div>
          {running ? (
            <div className="flex shrink-0 items-center gap-2">
              <span
                data-agent-status="generating"
                className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground"
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("agent.status.generating")}
              </span>
              <button
                type="button"
                data-agent-stop
                onClick={() => void cancelRun()}
                title={t("agent.status.stop")}
                className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Square className="h-3 w-3" />
                {t("agent.status.stop")}
              </button>
            </div>
          ) : (
            <span
              data-agent-status="idle"
              title={toolNames.length > 0 ? toolNames.join("、") : undefined}
              className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground"
            >
              {toolNames.length > 0
                ? t("agent.status.tools", { count: toolNames.length })
                : t("agent.status.idle")}
            </span>
          )}
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {activeSession && activeSession.messages.length > 0 ? (
            <AgentMessageList session={activeSession} />
          ) : (
            <AgentHero />
          )}
        </div>

        <AgentKeyNotice />
        <AgentComposer />
      </div>
    </div>
  );
}

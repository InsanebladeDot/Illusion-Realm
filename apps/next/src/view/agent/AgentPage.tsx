"use client";

import { Bot, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useAgentStore, type AgentSession } from "@/stores/useAgentStore";
import { AgentComposer } from "@/view/agent/AgentComposer";
import { cn } from "@/utils/cn";
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

/** 对话区：一轮提问 + 一条助手占位回复（后端接上后换成真实流式输出） */
function AgentMessageList({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  return (
    <ul
      data-agent-messages
      className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4"
    >
      {session.messages.map((message) => (
        <li
          key={message.id}
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
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">
            {message.text}
          </p>
        </li>
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
 * 现状：**只是界面骨架** —— 后端未接入，`sendDraft` 只把消息写进本地内存会话；
 * 会话也不落盘（见 `useAgentStore` 的注释）。
 */
export function AgentPage() {
  const { t } = useTranslation();
  const sessions = useAgentStore((state) => state.sessions);
  const activeSessionId = useAgentStore((state) => state.activeSessionId);
  const createSession = useAgentStore((state) => state.createSession);
  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ?? null;

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
            data-agent-new-chat-rail
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
          {/* 界面骨架徽标：后端接上后删掉这一段即可 */}
          <span
            data-agent-shell-badge
            title={t("agent.status.shellOnlyTitle")}
            className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground"
          >
            {t("agent.status.shellOnly")}
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {activeSession && activeSession.messages.length > 0 ? (
            <AgentMessageList session={activeSession} />
          ) : (
            <AgentHero />
          )}
        </div>

        <AgentComposer />
      </div>
    </div>
  );
}

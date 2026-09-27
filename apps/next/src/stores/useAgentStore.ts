"use client";

import { create } from "zustand";
import { t } from "@/i18n";

/** 会话里的一条消息 */
export type AgentMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
  /** 本地创建时间（毫秒） */
  createdAt: number;
};

/** 一次会话（对应左栏「会话」列表里的一行） */
export type AgentSession = {
  id: string;
  title: string;
  messages: AgentMessage[];
  createdAt: number;
  updatedAt: number;
};

/** 权限档位：**目前只是界面状态**，还没有任何实际约束 */
export type AgentPermission = "readonly" | "full";
/** 推理强度：同样是界面状态（后端接上后才会真的传下去） */
export type AgentEffort = "low" | "medium" | "high";

type AgentState = {
  /** 全部会话（新的在前） */
  sessions: AgentSession[];
  /** 当前选中的会话；null = 还没开始（主区显示 hero） */
  activeSessionId: string | null;
  /** 输入框草稿（受控 textarea 用） */
  draft: string;
  permission: AgentPermission;
  /** 选中的模型 id（取自本地模型索引；null = 未选） */
  modelId: string | null;
  effort: AgentEffort;
  /** 新建空会话并选中，返回新会话 id */
  createSession: () => string;
  selectSession: (sessionId: string) => void;
  /** 删除会话；删的是当前会话时把选中项收回到余下最新的一条 */
  deleteSession: (sessionId: string) => void;
  setDraft: (text: string) => void;
  /** 把草稿写进当前会话（还没会话就先建一个）；空草稿返回 false */
  sendDraft: () => boolean;
  setPermission: (permission: AgentPermission) => void;
  setModelId: (modelId: string | null) => void;
  setEffort: (effort: AgentEffort) => void;
};

/** 会话标题上限（超出截断加省略号） */
const SESSION_TITLE_MAX = 24;

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** 用首条消息给会话起名；空白文本返回 null，由调用方回落到词条文案 */
function titleFromText(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > SESSION_TITLE_MAX
    ? `${normalized.slice(0, SESSION_TITLE_MAX)}…`
    : normalized;
}

function emptySession(): AgentSession {
  const now = Date.now();
  return {
    id: createId("session"),
    title: t("agent.sessions.untitled"),
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Agent 页（`view/agent/**`）的会话状态：会话列表 + 当前会话 + 输入草稿 + 权限 / 模型 / 强度。
 *
 * ## 怎么用
 * - 读：`const sessions = useAgentStore((s) => s.sessions)`
 *   —— **只订阅用到的字段**，订阅整个 store 会让每次输入都重渲染整页。
 * - 写：组件里取动作 `const setDraft = useAgentStore((s) => s.setDraft)`；
 *   事件回调或非组件模块用 `useAgentStore.getState().sendDraft()`。
 *
 * ## 拿到什么 / 传什么
 * - `sessions: AgentSession[]`：每条含 `id / title / messages / createdAt / updatedAt`。
 * - `messages: AgentMessage[]`：`{ id, role: "user" | "agent", text, createdAt }`。
 * - `activeSessionId: string | null`：null 时主区显示 hero。
 * - `createSession(): string` 新建并选中，返回新 id；`selectSession(id)`；`deleteSession(id)`。
 * - `draft` + `setDraft(text)`；`sendDraft(): boolean`（空草稿返回 false）。
 * - `permission: "readonly" | "full"`、`modelId: string | null`、
 *   `effort: "low" | "medium" | "high"` —— 界面状态，尚未接后端。
 *
 * ## 持久化
 * **只在内存里**（刷新 / 重启即清空）。会话要落盘就得进用户数据文档，
 * 那是格式变更（要版本标记 + 迁移），所以刻意留到接后端那一步再做。
 *
 * ## 后端
 * 还没接 —— `sendDraft` 只把消息写进本地会话，助手那条是占位文案
 * （`agent.status.pending`），不会真的调用模型。
 */
export const useAgentStore = create<AgentState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  draft: "",
  permission: "readonly",
  modelId: null,
  effort: "medium",

  createSession: () => {
    const session = emptySession();
    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSessionId: session.id,
    }));
    return session.id;
  },

  selectSession: (sessionId) => set({ activeSessionId: sessionId }),

  deleteSession: (sessionId) =>
    set((state) => {
      const sessions = state.sessions.filter((item) => item.id !== sessionId);
      return {
        sessions,
        activeSessionId:
          state.activeSessionId === sessionId
            ? sessions[0]?.id ?? null
            : state.activeSessionId,
      };
    }),

  setDraft: (text) => set({ draft: text }),

  sendDraft: () => {
    const state = get();
    const text = state.draft.trim();
    if (!text) return false;

    const sessionId = state.activeSessionId ?? state.createSession();
    const now = Date.now();
    set((prev) => ({
      draft: "",
      sessions: prev.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        const userMessage: AgentMessage = {
          id: createId("msg"),
          role: "user",
          text,
          createdAt: now,
        };
        const agentMessage: AgentMessage = {
          id: createId("msg"),
          role: "agent",
          text: t("agent.status.pending"),
          createdAt: now + 1,
        };
        return {
          ...session,
          /** 首条消息兼作会话标题；之后不再改，避免标题随对话漂移 */
          title:
            session.messages.length === 0
              ? titleFromText(text) ?? session.title
              : session.title,
          messages: [...session.messages, userMessage, agentMessage],
          updatedAt: now,
        };
      }),
    }));
    return true;
  },

  setPermission: (permission) => set({ permission }),
  setModelId: (modelId) => set({ modelId }),
  setEffort: (effort) => set({ effort }),
}));

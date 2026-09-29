"use client";

import { create } from "zustand";
import type {
  AgentEventMessage,
  AgentHistoryItem,
  AgentPermission,
} from "@illusion-realm/shared";
import { t } from "@/i18n";
import { useAgentSecretStore } from "@/stores/useAgentSecretStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { cancelAgent, runAgent } from "@/utils/electronBridge";

/** 挂在输入框上的图片附件（目前只做本地展示，未随消息发给后端） */
export type AgentAttachment = {
  id: string;
  name: string;
  /** 本地绝对路径（Electron 下由 `getPathForFile` 取到；浏览器语义下为 null） */
  filePath: string | null;
  /** `URL.createObjectURL` 得到的预览地址；移除 / 发送时回收 */
  previewUrl: string;
  size: number;
};

/** 过程区里的一步：工具调用 */
export type AgentToolStep = {
  kind: "tool";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  state: "running" | "done";
  output?: string;
};

/** 过程区里的一步：模型思考（部分模型才有） */
export type AgentReasoningStep = { kind: "reasoning"; text: string };

export type AgentRunStep = AgentToolStep | AgentReasoningStep;

/** 会话里的一条消息 */
export type AgentMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
  /** 本地创建时间（毫秒） */
  createdAt: number;
  /** 随这条消息一起发出的图片附件 */
  attachments?: AgentAttachment[];
  /** 助手工具生成的图片绝对路径（只用于本地按需预览） */
  generatedImages?: string[];
  /** 助手专用：过程区（工具调用 / 思考），按发生顺序 */
  steps?: AgentRunStep[];
  /** 助手专用：还在流式接收 */
  streaming?: boolean;
  /** 助手专用：失败说明（UI 标红） */
  error?: string;
  /** 助手专用：被用户主动停止（而不是失败） */
  cancelled?: boolean;
};

/** 一次会话（对应左栏「会话」列表里的一行） */
export type AgentSession = {
  id: string;
  title: string;
  messages: AgentMessage[];
  createdAt: number;
  updatedAt: number;
};

export type { AgentPermission };
/** 推理强度：仍是界面状态（后端还没有这个参数） */
export type AgentEffort = "low" | "medium" | "high";

type AgentState = {
  /** 全部会话（新的在前） */
  sessions: AgentSession[];
  /** 当前选中的会话；null = 还没开始（主区显示 hero） */
  activeSessionId: string | null;
  /** 输入框草稿（受控 textarea 用） */
  draft: string;
  /** 当前挂在输入框上的图片附件 */
  attachments: AgentAttachment[];
  permission: AgentPermission;
  /** 选中的模型 id（取自本地模型索引；null = 未选） */
  modelId: string | null;
  effort: AgentEffort;
  /** 最近一次运行识别到的工具名（含宿主工具），给 UI 显示「识别到 N 个工具」 */
  toolNames: string[];
  /** 正在跑的 run；null = 空闲（UI 靠它显示「生成中 / 停止」） */
  runningRunId: string | null;
  /** 正在接收的助手消息 id（事件都往它身上写） */
  activeAssistantMessageId: string | null;
  /** 新建空会话并选中，返回新会话 id */
  createSession: () => string;
  selectSession: (sessionId: string) => void;
  /** 删除会话；删的是当前会话时把选中项收回到余下最新的一条 */
  deleteSession: (sessionId: string) => void;
  setDraft: (text: string) => void;
  /** 追加附件（调用方负责生成 previewUrl） */
  addAttachments: (attachments: AgentAttachment[]) => void;
  /** 移除一个附件并回收它的 object URL */
  removeAttachment: (attachmentId: string) => void;
  /** 清空附件并逐个回收 object URL */
  clearAttachments: () => void;
  /** 起一次运行（把草稿发给 sidecar）；没有文本、或已有运行在跑时返回 false */
  sendDraft: () => Promise<boolean>;
  /** 停下当前运行（主进程 kill 整棵进程树） */
  cancelRun: () => Promise<void>;
  /** 消费一帧事件（由 `subscribeAgentEvents` 的回调调用） */
  applyEvent: (event: AgentEventMessage) => void;
  setPermission: (permission: AgentPermission) => void;
  setModelId: (modelId: string | null) => void;
  setEffort: (effort: AgentEffort) => void;
};

/** 会话标题上限（超出截断加省略号） */
const SESSION_TITLE_MAX = 24;

/**
 * 流式文本的合并刷新间隔（毫秒）。
 *
 * 为什么不能每来一个 delta 就 `set()`：一个 8k 字符的回答会触发几千次整段会话重渲染，
 * 界面反而**跟不上**流（实测：用假模型灌长回答时，渲染风暴让整页长时间无响应）。
 * 攒一小批再刷，观感上仍是连续的，而渲染次数降两个数量级。
 * 用 `setTimeout` 而不是 rAF：窗口不可见时 rAF 不回调（见 AGENTS.md）。
 */
const STREAM_FLUSH_INTERVAL_MS = 40;

let pendingAnswerText = "";
let pendingReasoningText = "";
let streamFlushTimer: ReturnType<typeof setTimeout> | null = null;

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
 * 多轮上下文：只带**纯文本**的 user / assistant。
 * 附件与过程区不带给模型 —— 上次的工具调用明细只会挤占上下文。
 * 当前这一轮的提问（`currentUserMessageId`）要排除掉：它已经在 question 里了。
 */
function buildHistory(
  messages: AgentMessage[],
  currentUserMessageId: string
): AgentHistoryItem[] {
  return messages
    .filter(
      (message) =>
        message.id !== currentUserMessageId && message.text.trim().length > 0
    )
    .map((message) => ({
      role: message.role === "user" ? ("user" as const) : ("assistant" as const),
      content: message.text,
    }));
}

/**
 * 本次运行允许工具访问哪些目录（`list_directory` 的白名单）。
 * 取用户实际配置过的路径；一个都没配就传空数组 —— 宁可不给权限，也不要猜一个。
 */
function buildAllowedRoots(): string[] {
  const { outputPath, paths } = useSettingsStore.getState();
  return [
    outputPath,
    paths.searchPath,
    paths.checkpointPath,
    paths.lorasPath,
    paths.diffusionModelsPath,
  ]
    .map((item) => item?.trim() ?? "")
    .filter((item) => item.length > 0);
}

/**
 * Agent 页（`view/agent/**`）的状态：会话 + 输入草稿 + 附件 + **运行状态机**。
 *
 * 怎么用：读 `useAgentStore((s) => s.sessions)`（只订阅用到的字段）；
 * 写用取到的动作；非组件模块用 `useAgentStore.getState().xxx()`。
 * 事件订阅在页面挂载时做（`subscribeAgentEvents(useAgentStore.getState().applyEvent)`），
 * 卸载时退订 —— 见 `AgentPage`。
 *
 * 一次运行的完整流程：
 * 1. `sendDraft()`：用户消息 + 一条**空助手消息**（`streaming: true`）落进会话，
 *    组装多轮 history 与白名单，调 `agent:run` 拿 `runId`；
 * 2. sidecar 逐帧推事件 → `applyEvent()` 按 `runId` 认领后写进那条助手消息
 *    （`answer_delta` 追加文本、`tool_call`/`tool_result` 维护过程区）；
 * 3. `final` 定稿（用定稿全文覆盖增量拼接）、`error` 标红、`cancelRun()` 标「已停止」。
 *
 * 拿到什么：`sessions / activeSessionId / draft / attachments / permission / modelId /
 * effort / toolNames / runningRunId`，动作见上方的类型定义。
 *
 * 持久化：**只在内存里**（刷新即清空）；要落盘得进用户数据文档（格式变更 + 迁移）。
 * 密钥：渲染层**永远拿不到** —— 用户在设置页填的那把存在主进程侧（`apps/electron/agent/secret.js`），
 * 环境变量 / `.env` 只在开发测试时用；两者都由主进程经 stdin 传给 sidecar。
 * 「没配就拦在拉起进程之前」见 `sendDraft`；**完整消息流见 `docs/agent-message-flow.md`**。
 */
export const useAgentStore = create<AgentState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  draft: "",
  attachments: [],
  permission: "readonly",
  modelId: null,
  effort: "medium",
  toolNames: [],
  runningRunId: null,
  activeAssistantMessageId: null,

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

  addAttachments: (attachments) =>
    set((state) => ({ attachments: [...state.attachments, ...attachments] })),

  removeAttachment: (attachmentId) =>
    set((state) => {
      const target = state.attachments.find((item) => item.id === attachmentId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return {
        attachments: state.attachments.filter((item) => item.id !== attachmentId),
      };
    }),

  clearAttachments: () =>
    set((state) => {
      for (const item of state.attachments) URL.revokeObjectURL(item.previewUrl);
      return { attachments: [] };
    }),

  sendDraft: async () => {
    const state = get();
    if (state.runningRunId) return false;
    const text = state.draft.trim();
    if (!text) return false;

    /**
     * 没有密钥就**别拉起 sidecar**：Python 侧会抛「缺少 API Key」，那条错误会出现在
     * 对话里，看起来像"Agent 坏了"；而真正该发生的是「去设置里填一个」。
     * `.env` / 环境变量提供的 key 同样算已配置 —— 那是开发测试路径（见 agent/secret.js）。
     *
     * 先判 `configured` 再 refresh 一次：`status` 的初值是"未配置"，直接进 /agent 页
     * 立刻回车时它还没读过主进程，不刷新就会**误拦**。
     */
    if (!useAgentSecretStore.getState().status.configured) {
      const secret = await useAgentSecretStore.getState().refresh();
      if (!secret.configured) {
        useAgentSecretStore.getState().flagMissing();
        return false;
      }
    }

    // 上一次运行的残留缓冲不该混进新消息
    discardStreamBuffer();

    const sessionId = state.activeSessionId ?? state.createSession();
    const now = Date.now();
    const userMessage: AgentMessage = {
      id: createId("msg"),
      role: "user",
      text,
      createdAt: now,
      attachments: state.attachments,
    };
    const assistantMessage: AgentMessage = {
      id: createId("msg"),
      role: "agent",
      text: "",
      createdAt: now + 1,
      steps: [],
      streaming: true,
    };
    const currentSession = get().sessions.find((item) => item.id === sessionId);
    const history = buildHistory(currentSession?.messages ?? [], userMessage.id);

    set((prev) => ({
      draft: "",
      attachments: [],
      activeAssistantMessageId: assistantMessage.id,
      sessions: prev.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              // 首条消息兼作会话标题；之后不再改（避免标题随对话漂移）
              title:
                session.messages.length === 0
                  ? titleFromText(text) ?? session.title
                  : session.title,
              messages: [...session.messages, userMessage, assistantMessage],
              updatedAt: now,
            }
          : session
      ),
    }));

    try {
      const { runId } = await runAgent({
        question: text,
        history,
        config: {
          permission: get().permission,
          allowedRoots: buildAllowedRoots(),
        },
      });
      set({ runningRunId: runId });
      return true;
    } catch (error) {
      // 起不来就标在这条消息上：静默失败比报错更难查
      patchAssistantMessage(set, get, assistantMessage.id, {
        error: error instanceof Error ? error.message : String(error),
        streaming: false,
      });
      set({ runningRunId: null, activeAssistantMessageId: null });
      return false;
    }
  },

  cancelRun: async () => {
    const runId = get().runningRunId;
    if (!runId) return;
    flushStreamBuffer();
    await cancelAgent(runId);
    const assistantId = get().activeAssistantMessageId;
    if (assistantId) {
      patchAssistantMessage(set, get, assistantId, {
        cancelled: true,
        streaming: false,
      });
    }
    set({ runningRunId: null, activeAssistantMessageId: null });
  },

  applyEvent: (event) => {
    const state = get();
    // 只认当前这一次运行：取消 / 重开后，旧 run 的迟到帧一律丢弃
    if (!state.runningRunId || event.runId !== state.runningRunId) return;
    const assistantId = state.activeAssistantMessageId;

    switch (event.type) {
      case "tools":
        set({ toolNames: event.tools.map((tool) => tool.name) });
        break;
      case "step":
        // 轮次不落成过程项：工具调用与思考已经能说明进展
        break;
      case "reasoning_delta":
        scheduleStreamFlush({ reasoning: event.text });
        break;
      case "answer_delta":
        scheduleStreamFlush({ answer: event.text });
        break;
      case "tool_call":
        if (assistantId) {
          patchAssistantMessage(set, get, assistantId, {
            pushTool: {
              kind: "tool",
              id: event.id,
              name: event.name,
              arguments: event.arguments,
              state: "running",
            },
          });
        }
        break;
      case "tool_result":
        if (assistantId) {
          patchAssistantMessage(set, get, assistantId, {
            finishTool: { id: event.id, output: event.output },
          });
        }
        break;
      case "tool_artifacts":
        if (assistantId && event.images.length > 0) {
          patchAssistantMessage(set, get, assistantId, {
            appendGeneratedImages: event.images,
          });
        }
        break;
      case "final":
        // 先把攒着的 token 刷出去，再用定稿全文覆盖 —— 两步都做完观感才不跳
        flushStreamBuffer();
        if (assistantId) {
          // 用定稿全文覆盖：极端情况下增量拼接可能与定稿不一致，以定稿为准
          patchAssistantMessage(set, get, assistantId, {
            replaceText: event.text,
            streaming: false,
          });
        }
        set({ runningRunId: null, activeAssistantMessageId: null });
        break;
      case "error":
        flushStreamBuffer();
        if (assistantId) {
          patchAssistantMessage(set, get, assistantId, {
            error: event.message,
            streaming: false,
          });
        }
        set({ runningRunId: null, activeAssistantMessageId: null });
        break;
    }
  },

  setPermission: (permission) => set({ permission }),
  setModelId: (modelId) => set({ modelId }),
  setEffort: (effort) => set({ effort }),
}));

/** 助手消息的补丁形状（只给本文件的两个入口用） */
type AssistantPatch = {
  appendText?: string;
  replaceText?: string;
  appendReasoning?: string;
  pushTool?: AgentToolStep;
  finishTool?: { id: string; output: string };
  appendGeneratedImages?: string[];
  streaming?: boolean;
  error?: string;
  cancelled?: boolean;
};

/**
 * 把补丁应用到某条助手消息上。
 *
 * 单独抽出来是因为流式写入有两条规则不能写错：
 * ① 思考文本并到上一条 `reasoning` 里（一次思考是一个整体，别一个 token 一项）；
 * ② 工具结果按 `id` 找回对应那次调用（模型可能并行发起多个调用）。
 */
function patchAssistantMessage(
  set: (
    partial: Partial<AgentState> | ((state: AgentState) => Partial<AgentState>)
  ) => void,
  get: () => AgentState,
  messageId: string,
  patch: AssistantPatch
): void {
  const { activeSessionId } = get();
  set((state) => ({
    sessions: state.sessions.map((session) => {
      if (session.id !== activeSessionId) return session;
      return {
        ...session,
        messages: session.messages.map((message) => {
          if (message.id !== messageId) return message;
          const steps = [...(message.steps ?? [])];

          if (patch.appendReasoning) {
            const last = steps[steps.length - 1];
            if (last && last.kind === "reasoning") {
              steps[steps.length - 1] = {
                ...last,
                text: last.text + patch.appendReasoning,
              };
            } else {
              steps.push({ kind: "reasoning", text: patch.appendReasoning });
            }
          }
          if (patch.pushTool) steps.push(patch.pushTool);
          if (patch.finishTool) {
            const targetId = patch.finishTool.id;
            const index = steps.findIndex(
              (step) => step.kind === "tool" && step.id === targetId
            );
            if (index >= 0) {
              const step = steps[index] as AgentToolStep;
              steps[index] = {
                ...step,
                state: "done",
                output: patch.finishTool.output,
              };
            }
          }

          return {
            ...message,
            steps,
            generatedImages: patch.appendGeneratedImages
              ? Array.from(
                  new Set([
                    ...(message.generatedImages ?? []),
                    ...patch.appendGeneratedImages,
                  ])
                )
              : message.generatedImages,
            text:
              patch.replaceText !== undefined
                ? patch.replaceText
                : message.text + (patch.appendText ?? ""),
            streaming: patch.streaming ?? message.streaming,
            error: patch.error ?? message.error,
            cancelled: patch.cancelled ?? message.cancelled,
          };
        }),
      };
    }),
  }));
}

/**
 * 把流式文本攒进缓冲，并安排一次刷新。
 *
 * 同一个窗口内到来的多个 delta 会被合并；定时器到点后**一次性**写进那条助手消息 ——
 * 这就是「每个 token 一次重渲染」变成「每 40ms 一次」的地方。
 */
function scheduleStreamFlush(delta: { answer?: string; reasoning?: string }): void {
  pendingAnswerText += delta.answer ?? "";
  pendingReasoningText += delta.reasoning ?? "";
  if (streamFlushTimer) return;
  streamFlushTimer = setTimeout(() => {
    streamFlushTimer = null;
    flushStreamBuffer();
  }, STREAM_FLUSH_INTERVAL_MS);
}

/** 把缓冲里的文本立刻写进正在接收的那条助手消息（没有缓冲就什么也不做） */
function flushStreamBuffer(): void {
  if (streamFlushTimer) {
    clearTimeout(streamFlushTimer);
    streamFlushTimer = null;
  }
  const answer = pendingAnswerText;
  const reasoning = pendingReasoningText;
  pendingAnswerText = "";
  pendingReasoningText = "";
  if (!answer && !reasoning) return;

  const state = useAgentStore.getState();
  const assistantId = state.activeAssistantMessageId;
  // 已经定稿 / 取消时没有接收中的消息：这段文本按过期处理（final 会用定稿全文覆盖）
  if (!assistantId) return;
  patchAssistantMessage(useAgentStore.setState, useAgentStore.getState, assistantId, {
    appendText: answer || undefined,
    appendReasoning: reasoning || undefined,
  });
}

/** 丢弃未刷新的缓冲（新一次发送前调用） */
function discardStreamBuffer(): void {
  if (streamFlushTimer) {
    clearTimeout(streamFlushTimer);
    streamFlushTimer = null;
  }
  pendingAnswerText = "";
  pendingReasoningText = "";
}

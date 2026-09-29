/**
 * Agent 页（`/agent`）与 Python sidecar 的**跨语言契约**。
 *
 * 三处必须一致，改一边就要改另一边：
 * 1. Python 侧 `apps/agent/agent_core/core.py` yield 的事件；
 * 2. 主进程 `apps/electron/agent/runner.js` 逐行转发时加上 `runId`；
 * 3. 渲染层 `apps/next/src/stores/useAgentStore.ts` 消费它。
 *
 * `scripts/verify-agent-events.js` 会真的拉起 Python 进程，断言事件序列与关键字段。
 */

/** 权限档位：只读不挂写盘类工具（P3 落地，目前只透传给工具 server） */
export type AgentPermission = "readonly" | "full";

/** 多轮上下文里的一条（桌面端由会话 store 维护） */
export interface AgentHistoryItem {
  role: "user" | "assistant";
  content: string;
}

/**
 * 本次运行的配置。**没有 apiKey**：密钥由主进程注入，
 * 绝不从渲染进程传下来、也不进命令行参数。
 */
export interface AgentRunConfig {
  baseUrl?: string;
  model?: string;
  maxSteps?: number;
  permission?: AgentPermission;
  /** 只读工具允许访问的目录白名单（渲染层按用户设置填；空 = 不允许访问文件系统） */
  allowedRoots?: string[];
  /**
   * 其余键**原样透传**给 Python sidecar（`agent_core/config.py` 按 camelCase 读取）。
   *
   * 典型用途是自检开关：`fakeLlm` / `fakeDelayMs`（见
   * `scripts/verify-agent-events.js`）。**别在这里放密钥** —— 主进程会显式拒收
   * 带 `apiKey` 的 config（见 `ipc-handlers/agent.handlers.js` 的校验器）。
   */
  [key: string]: unknown;
}

/** `agent:run` 的入参 */
export interface AgentRunOptions {
  question: string;
  history?: AgentHistoryItem[];
  config?: AgentRunConfig;
}

/** 工具清单里的一项（给 UI 显示「识别到 N 个工具」） */
export interface AgentToolCard {
  name: string;
  description: string;
}

/**
 * 事件流的一帧，字段名与 Python 侧逐个对齐，`type` 是判别字段。
 *
 * 注意 `answer_delta` 不等于最终稿：模型可能先说半句再决定调工具，
 * 所以 UI 要把「工具调用前的文本」放进过程区，别当答案定稿。
 */
export type AgentEvent =
  | { type: "tools"; tools: AgentToolCard[] }
  | { type: "step"; step: number }
  | { type: "reasoning_delta"; step: number; text: string }
  | { type: "answer_delta"; step: number; text: string }
  | {
      type: "tool_call";
      step: number;
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }
  | { type: "tool_result"; step: number; id: string; name: string; output: string }
  | { type: "tool_artifacts"; name: string; images: string[] }
  | { type: "final"; text: string; steps: number }
  | { type: "error"; message: string };

/** 主进程转发给渲染层时，每帧都带上 runId（多窗口 / 多次运行可区分） */
export type AgentEventMessage = { runId: string } & AgentEvent;

/** `agent:run` 的返回：启动成功即返回，结果走事件流 */
export interface AgentRunHandle {
  runId: string;
}

/**
 * 宿主工具调用：主进程 → 渲染层的「请执行这个工具」。
 *
 * 为什么需要这一跳：应用专属能力里，工作流组装（`utils/comfy/*`）与落盘 / Meta 内嵌
 * （`saveGeneratedImages` / `buildGeneratedImageMeta`）只存在于渲染层，主进程是手写
 * CommonJS、运行期拿不到它们。于是宿主工具的**执行端**放在渲染层，
 * 主进程（`agent/host-tools.js`）只做转发与等回执。
 */
export interface AgentHostCall {
  /** 本次调用的唯一 id：回执必须原样带回，主进程按它认领响应 */
  callId: string;
  /** 工具名（由主进程在 `hostTools` 里声明，模型看不到别的名字） */
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * 宿主工具回执：渲染层 → 主进程。
 *
 * `ok:false` 时 **不要**把堆栈塞进 `error` —— 这段文本最终会进模型的工具结果，
 * 只放一句可读的原因即可（与主进程侧 `host_response` 的口径一致）。
 */
export interface AgentHostCallResult {
  callId: string;
  ok: boolean;
  /** 给模型看的文本结果（`ok:true` 时用），只放摘要 / 路径，别放 data URL */
  result?: string;
  /** 给界面展示的生成图片绝对路径；不进入模型上下文 */
  images?: string[];
  error?: string;
}

/**
 * 密钥状态摘要 —— **渲染进程能拿到的全部信息**。
 *
 * 密钥原值只存在于主进程（`apps/electron/agent/secret.js`，safeStorage 加密落盘），
 * 渲染层只能问「有没有 / 从哪来 / 怎么存的 / 尾 4 位」，据此渲染提示与设置项。
 */
export interface AgentSecretStatus {
  /** 这次运行到底有没有 key 可用 */
  configured: boolean;
  /**
   * `env` = 环境变量 / `.env` 提供的（**只用于开发测试**）；
   * `stored` = 用户在设置页填的；`none` = 两条都没有。
   */
  source: "stored" | "env" | "none";
  /** 落盘方式：`safeStorage` = 系统加密，`plain` = 拿不到加密能力时的明文兜底，`""` = 没有存储 */
  protection: "safeStorage" | "plain" | "";
  /** 尾 4 位，用于确认「填的是哪一把」；不足 4 位或未配置时为空串 */
  tail: string;
}

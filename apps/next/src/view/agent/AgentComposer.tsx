"use client";

import { useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { AGENT_DEFAULTS } from "@illusion-realm/shared";
import { APP_NAME } from "@/data/navigation";
import { useTranslation } from "@/i18n";
import { useAgentStore, type AgentEffort } from "@/stores/useAgentStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { cn } from "@/utils/cn";
import {
  INPUT_BORDER_CLASS,
  PRIMARY_BUTTON_CLASS,
  THIN_BORDER_CLASS,
} from "@/utils/layout";
import { AgentAttachmentStrip } from "@/view/agent/AgentAttachments";
import { AgentAddMenu, AgentPermissionMenu } from "@/view/agent/AgentComposerMenus";

const EFFORT_VALUES: AgentEffort[] = ["low", "medium", "high"];
/** 输入框高度上限（约 6 行）：再长就内部滚动，别把 composer 顶到半个屏幕 */
const INPUT_MAX_HEIGHT_PX = 148;

/** 下拉共用的外观（与组装面板的模板选择器同一套观感） */
const SELECT_CLASS = cn(
  "h-7 min-w-0 rounded-md bg-background px-2 text-[11px] outline-none",
  INPUT_BORDER_CLASS
);

/**
 * 上下文 chip 行：应用名 / 「本地」/ 当前输出目录。
 *
 * 为什么第三枚是输出目录：Codex 那枚是 git 分支，而渲染进程读不到 git；
 * 输出目录是这个应用里**真实存在**、且语义最接近「当前工作区」的东西。
 */
function AgentContextChips() {
  const { t } = useTranslation();
  const outputPath = useSettingsStore((state) => state.outputPath);
  const workspace = outputPath?.trim() ?? "";

  return (
    <div
      data-agent-context
      title={t("agent.composer.context")}
      className="flex flex-wrap items-center gap-1 px-1 pb-1 text-[11px] text-muted-foreground"
    >
      <span className="rounded-full bg-muted px-2 py-0.5">{APP_NAME}</span>
      <span className="rounded-full bg-muted px-2 py-0.5">
        {t("agent.composer.modeLocal")}
      </span>
      <span
        data-agent-workspace
        aria-label={t("agent.composer.workspace")}
        title={workspace || t("agent.composer.workspaceUnset")}
        className="max-w-[240px] truncate rounded-full bg-muted px-2 py-0.5"
      >
        {workspace || t("agent.composer.workspaceUnset")}
      </span>
    </div>
  );
}

/** 输入框：Enter 发送、Shift + Enter 换行（与 Codex 的输入区一致） */
function AgentComposerInput() {
  const { t } = useTranslation();
  const draft = useAgentStore((state) => state.draft);
  const setDraft = useAgentStore((state) => state.setDraft);
  const sendDraft = useAgentStore((state) => state.sendDraft);
  const running = useAgentStore((state) => state.runningRunId !== null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /**
   * 高度随内容伸缩（Codex 的输入区就是这样）。
   * 先归零再读 `scrollHeight`：不归零的话删内容时高度只增不减（scrollHeight 不会变小）。
   */
  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = "auto";
    const next = Math.min(element.scrollHeight, INPUT_MAX_HEIGHT_PX);
    element.style.height = `${next}px`;
    element.style.overflowY = element.scrollHeight > INPUT_MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [draft]);

  return (
    <textarea
      ref={inputRef}
      data-agent-input
      aria-label={t("agent.composer.placeholder")}
      rows={1}
      value={draft}
      placeholder={t("agent.composer.placeholder")}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.shiftKey) return;
        event.preventDefault();
        // 正在跑就不接受回车发送（一次只跑一个 run，避免把队列语义搅进来）
        if (!running) void sendDraft();
      }}
      className="w-full resize-none bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
    />
  );
}

/**
 * 右侧的模型标识（**只读**）。
 *
 * 为什么这里没有下拉：早先那版把**本地 SD 模型**当成 LLM 列在下拉里
 * （界面上会显示成「不错的风格」这类模型名），对 Agent 毫无意义。
 * 模型现在来自共享配置（`packages/shared/src/data/agent.ts` + 工作区根 `.env`）。
 */
function AgentModelBadge() {
  const { t } = useTranslation();
  const model = AGENT_DEFAULTS.model;
  const shortName = model.includes("/")
    ? model.slice(model.lastIndexOf("/") + 1)
    : model;

  return (
    <span
      data-agent-model={model}
      title={`${t("agent.composer.model")}：${model}\n${t("agent.composer.modelTitle")}`}
      className="max-w-[160px] truncate text-[11px] text-muted-foreground"
    >
      {shortName}
    </span>
  );
}

/** 强度下拉（界面状态；后端接上后才会真的传下去） */
function AgentEffortSelect() {
  const { t } = useTranslation();
  const effort = useAgentStore((state) => state.effort);
  const setEffort = useAgentStore((state) => state.setEffort);

  return (
    <select
      data-agent-effort
      aria-label={t("agent.composer.effort")}
      value={effort}
      onChange={(event) => setEffort(event.target.value as AgentEffort)}
      className={SELECT_CLASS}
    >
      {EFFORT_VALUES.map((value) => (
        <option key={value} value={value}>
          {value === "high"
            ? t("agent.composer.effortHigh")
            : value === "low"
              ? t("agent.composer.effortLow")
              : t("agent.composer.effortMedium")}
        </option>
      ))}
    </select>
  );
}

/** 发送（回车与它走同一条路径） */
function AgentSendButton() {
  const { t } = useTranslation();
  const sendDraft = useAgentStore((state) => state.sendDraft);
  const running = useAgentStore((state) => state.runningRunId !== null);

  return (
    <button
      type="button"
      data-agent-send
      disabled={running}
      onClick={() => void sendDraft()}
      title={t("agent.composer.send")}
      aria-label={t("agent.composer.send")}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        PRIMARY_BUTTON_CLASS,
        running && "opacity-50"
      )}
    >
      <Send className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * Agent 页的输入区（composer）—— 对齐 Codex 底部那一块：
 * 上下文 chip 行 → 附件条（有图才显示）→ 输入框 →
 * 底排「左：+ / 权限；右：模型 / 强度 / 发送」。
 *
 * 位置与 Codex 一致：**权限紧跟 `+` 右边**；模型与强度在右侧（模型只读、来自共享配置）。
 * 「新聊天」不在这里 —— 它在左栏与标题栏上（Codex 也放在侧栏）。
 */
export function AgentComposer() {
  return (
    <div className="shrink-0 px-4 pb-4">
      <div
        className={cn(
          "rounded-2xl border bg-background p-2 shadow-sm",
          THIN_BORDER_CLASS
        )}
      >
        <AgentContextChips />
        <AgentAttachmentStrip />
        <AgentComposerInput />
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <div className="flex min-w-0 items-center gap-1">
            <AgentAddMenu />
            <AgentPermissionMenu />
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <AgentModelBadge />
            <AgentEffortSelect />
            <AgentSendButton />
          </div>
        </div>
      </div>
    </div>
  );
}

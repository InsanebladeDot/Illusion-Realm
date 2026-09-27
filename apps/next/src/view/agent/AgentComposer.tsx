"use client";

import { Plus, Send } from "lucide-react";
import { APP_NAME } from "@/data/navigation";
import { useTranslation } from "@/i18n";
import {
  useAgentStore,
  type AgentEffort,
  type AgentPermission,
} from "@/stores/useAgentStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { cn } from "@/utils/cn";
import {
  INPUT_BORDER_CLASS,
  PRIMARY_BUTTON_CLASS,
  THIN_BORDER_CLASS,
} from "@/utils/layout";

const EFFORT_VALUES: AgentEffort[] = ["low", "medium", "high"];
const PERMISSION_VALUES: AgentPermission[] = ["readonly", "full"];

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

  return (
    <textarea
      data-agent-input
      aria-label={t("agent.composer.placeholder")}
      rows={2}
      value={draft}
      placeholder={t("agent.composer.placeholder")}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.shiftKey) return;
        event.preventDefault();
        sendDraft();
      }}
      className="w-full resize-none bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
    />
  );
}

/** 右侧三个下拉：权限 / 模型 / 强度（目前只写 store，未接后端） */
function AgentComposerControls() {
  const { t } = useTranslation();
  const models = useSettingsStore((state) => state.models);
  const permission = useAgentStore((state) => state.permission);
  const modelId = useAgentStore((state) => state.modelId);
  const effort = useAgentStore((state) => state.effort);
  const setPermission = useAgentStore((state) => state.setPermission);
  const setModelId = useAgentStore((state) => state.setModelId);
  const setEffort = useAgentStore((state) => state.setEffort);

  return (
    <div className="flex min-w-0 items-center gap-1">
      <select
        data-agent-permission
        aria-label={t("agent.composer.permission")}
        value={permission}
        onChange={(event) => setPermission(event.target.value as AgentPermission)}
        className={SELECT_CLASS}
      >
        {PERMISSION_VALUES.map((value) => (
          <option key={value} value={value}>
            {value === "full"
              ? t("agent.composer.permissionFull")
              : t("agent.composer.permissionReadonly")}
          </option>
        ))}
      </select>

      <select
        data-agent-model
        aria-label={t("agent.composer.model")}
        value={modelId ?? ""}
        onChange={(event) => setModelId(event.target.value || null)}
        className={cn(SELECT_CLASS, "max-w-[180px]")}
      >
        {models.length === 0 ? (
          <option value="">{t("agent.composer.modelUnset")}</option>
        ) : null}
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>

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
    </div>
  );
}

/** 底部一排：左「新聊天」、右三个下拉 + 发送 */
function AgentComposerActions() {
  const { t } = useTranslation();
  const createSession = useAgentStore((state) => state.createSession);
  const sendDraft = useAgentStore((state) => state.sendDraft);

  return (
    <div className="flex items-center justify-between gap-2 px-1 pt-1">
      <button
        type="button"
        data-agent-new-chat
        onClick={() => createSession()}
        title={t("agent.newChat")}
        aria-label={t("agent.newChat")}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
      </button>

      <div className="flex min-w-0 items-center gap-1">
        <AgentComposerControls />
        <button
          type="button"
          data-agent-send
          onClick={() => sendDraft()}
          title={t("agent.composer.send")}
          aria-label={t("agent.composer.send")}
          className={cn(
            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            PRIMARY_BUTTON_CLASS
          )}
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Agent 页的输入区（composer）—— 仿 Codex 底部那块：
 * 上下文 chip 行 → 输入框 → 左「新聊天」/ 右（权限 / 模型 / 强度 / 发送）。
 *
 * 现状：这三个下拉只写进 `useAgentStore` 的界面状态，**没有接后端**；
 * 主区右上角那枚「界面骨架 · 未接入后端」徽标说的就是这件事。
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
        <AgentComposerInput />
        <AgentComposerActions />
      </div>
    </div>
  );
}

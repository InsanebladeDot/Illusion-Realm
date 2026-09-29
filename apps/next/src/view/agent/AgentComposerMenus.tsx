"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Check, ChevronDown, Eye, ImagePlus, Plus, ShieldCheck } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useAgentStore, type AgentPermission } from "@/stores/useAgentStore";
import { cn } from "@/utils/cn";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { filesToAttachments, pickImageFiles } from "@/view/agent/AgentAttachments";

/** 触发器（+ / 权限）共用外观：与 Codex 一致 —— 小圆角、静音色、悬停有底 */
const TRIGGER_CLASS = cn(
  "inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] text-muted-foreground",
  "transition-colors hover:bg-muted hover:text-foreground"
);
/** 弹层：贴底上弹（输入框在最底部，往下弹会被窗口裁掉） */
const PANEL_CLASS = cn(
  "absolute bottom-[calc(100%+6px)] left-0 z-30 w-[320px] rounded-xl border bg-background p-1.5 shadow-lg",
  THIN_BORDER_CLASS
);
const ITEM_CLASS =
  "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted";

/** 点外部 / Esc 关闭（两个弹层共用；close 必须是稳定引用，否则每次渲染都重订阅） */
function useDismissPopover(
  ref: RefObject<HTMLDivElement | null>,
  open: boolean,
  close: () => void
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open, ref]);
}

/**
 * `+`：添加内容 —— 对应 Codex 那个「添加」菜单。
 * 目前只有一项「添加图片」（后端接上后，附件会随消息一起交给 Agent）。
 */
export function AgentAddMenu() {
  const { t } = useTranslation();
  const addAttachments = useAgentStore((state) => state.addAttachments);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissPopover(ref, open, close);

  const handlePick = async () => {
    close();
    const files = await pickImageFiles();
    if (files.length > 0) addAttachments(filesToAttachments(files));
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-agent-add
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("agent.composer.addMenuLabel")}
        title={t("agent.composer.addMenuLabel")}
        onClick={() => setOpen((previous) => !previous)}
        className={cn(TRIGGER_CLASS, "w-7 justify-center gap-0 px-0")}
      >
        <Plus className="h-4 w-4" />
      </button>

      {open ? (
        <div data-agent-add-menu role="menu" className={PANEL_CLASS}>
          <p className="px-2 pb-0.5 pt-1 text-[11px] text-muted-foreground">
            {t("agent.composer.add")}
          </p>
          <button
            type="button"
            role="menuitem"
            data-agent-add-image
            onClick={() => void handlePick()}
            className={ITEM_CLASS}
          >
            <ImagePlus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block text-xs font-medium">
                {t("agent.composer.addImage")}
              </span>
              <span className="block text-[11px] leading-4 text-muted-foreground">
                {t("agent.composer.addImageHint")}
              </span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

const PERMISSION_ICONS = { readonly: Eye, full: ShieldCheck } as const;
const PERMISSION_VALUES: AgentPermission[] = ["readonly", "full"];

/**
 * 权限：与 Codex 一样放在 `+` 右边，点开是「应如何批准…」的两项。
 * 现在只是界面状态（后端接上后由它决定挂哪些工具，见 docs/agent-integration.md 的 P3）。
 */
export function AgentPermissionMenu() {
  const { t } = useTranslation();
  const permission = useAgentStore((state) => state.permission);
  const setPermission = useAgentStore((state) => state.setPermission);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissPopover(ref, open, close);

  const CurrentIcon = PERMISSION_ICONS[permission];
  const label = (value: AgentPermission) =>
    value === "full"
      ? t("agent.composer.permissionFull")
      : t("agent.composer.permissionReadonly");
  const hint = (value: AgentPermission) =>
    value === "full"
      ? t("agent.composer.permissionFullHint")
      : t("agent.composer.permissionReadonlyHint");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-agent-permission
        data-agent-permission-value={permission}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("agent.composer.permission")}
        title={t("agent.composer.permissionChange")}
        onClick={() => setOpen((previous) => !previous)}
        className={TRIGGER_CLASS}
      >
        <CurrentIcon className="h-3.5 w-3.5" />
        {label(permission)}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open ? (
        <div data-agent-permission-menu role="menu" className={PANEL_CLASS}>
          <p className="px-2 pb-1 pt-1 text-[11px] text-muted-foreground">
            {t("agent.composer.permissionTitle")}
          </p>
          {PERMISSION_VALUES.map((value) => {
            const Icon = PERMISSION_ICONS[value];
            const active = value === permission;
            return (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                data-agent-permission-option={value}
                onClick={() => {
                  setPermission(value);
                  close();
                }}
                className={ITEM_CLASS}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">{label(value)}</span>
                  <span className="block text-[11px] leading-4 text-muted-foreground">
                    {hint(value)}
                  </span>
                </span>
                {active ? <Check className="mt-1 h-3.5 w-3.5 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { DocumentDialog } from "@/components/DocumentDialog";
import { useTranslation } from "@/i18n";

const SETUP_STEPS = ["register", "createKey", "copyKey", "saveKey"] as const;
const WEBSITE_URL = "https://siliconflow.cn/";

function SetupSteps() {
  const { t } = useTranslation();
  return <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed">
    {SETUP_STEPS.map(step => <li key={step}>{t(`settings.agentSection.setup.${step}`)}</li>)}
  </ol>;
}

function useGuideKeyboard(open: boolean, container: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    container.current?.querySelector<HTMLButtonElement>('[role="dialog"] button')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const buttons = Array.from(container.current?.querySelectorAll<HTMLElement>('[role="dialog"] button, [role="dialog"] a[href]') ?? []);
      if (event.key === "Escape") { event.preventDefault(); buttons[0]?.click(); }
      if (event.key !== "Tab" || !buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!event.shiftKey && (index < 0 || index === buttons.length - 1)) { event.preventDefault(); buttons[0]?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [open, container]);
}

export function SiliconFlowSetupHelp() {
  const { t } = useTranslation(), [open, setOpen] = useState(false), container = useRef<HTMLDivElement>(null);
  useGuideKeyboard(open, container);
  const preview = SETUP_STEPS.map((step, index) => `${index + 1}. ${t(`settings.agentSection.setup.${step}`)}`).join("\n");
  return <div ref={container} className="flex flex-wrap items-center gap-2">
    <a data-agent-provider-link href={WEBSITE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary">
      {t("settings.agentSection.setup.website")}<ExternalLink aria-hidden className="h-3.5 w-3.5" />
    </a>
    <button type="button" data-agent-setup-guide aria-haspopup="dialog" aria-expanded={open} title={preview} onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
      <BookOpen aria-hidden className="h-3.5 w-3.5" />{t("settings.agentSection.setup.title")}
    </button>
    {/* 弹窗：硅基流动注册与 API 配置，复用文档型弹框和现有 i18n。 */}
    <DocumentDialog open={open} eyebrow={t("settings.agentSection.title")} title={t("settings.agentSection.setup.title")} titleId="agent-setup-guide-title" onClose={() => setOpen(false)} confirmLabel={t("common.close")}>
      <SetupSteps />
      <a data-agent-guide-website href={WEBSITE_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-4">{t("settings.agentSection.setup.website")}<ExternalLink aria-hidden className="h-3.5 w-3.5" /></a>
    </DocumentDialog>
  </div>;
}

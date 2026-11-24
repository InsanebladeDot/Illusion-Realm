"use client";

/** 项目管理复用现有级联菜单和确认层；挂起、关闭、删除分别调用真实会话动作。 */
import { useRef, useState } from "react";
import { Pause, X, Pencil, Trash2 } from "lucide-react";
import { CascadeMenu } from "@/components/cascade-menu";
import { useTranslation } from "@/i18n";

export function CanvasProjectMenu({ rename, leave, active, requestDelete }: { active: boolean; requestDelete: () => void; rename: () => void; leave: (mode: "suspend" | "close" | "delete") => Promise<boolean> }) {
  const { t } = useTranslation();
  const anchor = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const run = async (mode: "suspend" | "close" | "delete") => {
    if (pending) return;
    setPending(true);
    setError(false);
    try { if (!await leave(mode)) setError(true); else { setOpen(false); } }
    catch { setError(true); }
    finally { setPending(false); }
  };
  const items = [
    { id: "suspend", label: t("canvas.suspend"), icon: Pause, action: () => { void run("suspend"); } },
    { id: "close", label: t("canvas.closeToLibrary"), icon: X, action: () => { void run("close"); } },
    { id: "rename", label: t("canvas.rename"), icon: Pencil, action: () => { setOpen(false); rename(); } },
    { id: "delete", label: t("canvas.removeProject"), icon: Trash2, destructive: true, action: () => { setOpen(false); requestDelete(); } },
  ].map(item => ({ ...item, disabledReason: pending ? t("canvas.persistenceLoading") : undefined }));
  return <div ref={anchor} style={{ display: "inline-flex" }}>
    <button data-canvas-project-menu type="button" aria-label={t("canvas.projectMenu")} aria-expanded={open} onClick={() => { setError(false); setOpen(value => !value); }}><span className="hy-neutral-mark">{t("canvas.brandMark")}</span><span>⌄</span></button>
    {active && open && <CascadeMenu anchor={anchor} items={items} caption={error ? t("canvas.sessionBusy") : undefined} label={t("canvas.projectMenu")} backLabel={t("canvas.cancel")} placement="pointer" onClose={() => setOpen(false)} />}
  </div>;
}

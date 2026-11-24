"use client";

import { HoverTip } from "@/components/hover-tip";

/** 导航只展示会话名单；关闭须先由该编辑器确认保存，不能直接删除名单掩盖失败。 */
import { useRouter, usePathname } from "next/navigation";
import { Pause, X } from "lucide-react";
import { useCanvasSessionsStore } from "@/stores/use-canvas-sessions-store";
import { useTranslation } from "@/i18n";

export function SuspendedCanvases({ expanded }: { expanded: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { sessions, activeId, closeRequested } = useCanvasSessionsStore();
  const suspended = sessions.filter(item => pathname !== "/canvas" || item.id !== activeId);
  if (!suspended.length) return null;
  return <section data-suspended-canvases className="mt-3 w-full min-w-0 text-xs">
    <p className="mb-2 flex items-center gap-2 px-3 text-muted-foreground"><Pause size={14} />{expanded && t("canvas.suspendedCanvases")}<span>{suspended.length}</span></p>
    <div className="max-h-44 overflow-y-auto">{suspended.map(session => <div key={session.id} className="flex items-center gap-1">
      <HoverTip asChild label={(session.name || t("canvas.untitled")) || ""}><button type="button" className="min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left hover:bg-foreground/5" onClick={() => { useCanvasSessionsStore.getState().open(session.id, session.name); if (pathname !== "/canvas") router.push("/canvas"); }}>{expanded ? session.name || t("canvas.untitled") : <Pause size={14} />}</button></HoverTip>
      {expanded && <button type="button" disabled={!!closeRequested} aria-label={t("canvas.closeToLibrary")} className="rounded-md p-1 hover:bg-foreground/5" onClick={() => useCanvasSessionsStore.setState({ closeRequested: session.id })}><X size={12} /></button>}
    </div>)}</div>
  </section>;
}

"use client";

/** 删除确认留在工作区浮层，避免挂到顶部小按钮内部而被错误裁切。 */
import { useState } from "react";
import { useTranslation } from "@/i18n";
import { CanvasChip } from "./reference-ui/components";
import styles from "./canvas.module.css";
import { canvasLibraryErrorKey } from "./canvas-library-api";

export function CanvasProjectDelete({ remove, cancel }: { remove: () => Promise<boolean>; cancel: () => void }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ReturnType<typeof canvasLibraryErrorKey> | "canvas.sessionBusy" | null>(null);
  const confirm = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try { if (!await remove()) setError("canvas.sessionBusy"); }
    catch (error) { setError(canvasLibraryErrorKey(error)); }
    finally { setPending(false); }
  };
  return <div className={styles.dialog}><h2>{t("canvas.removeProject")}</h2><p>{t("canvas.projectDeleteNotice")}</p>
    {error && <p role="alert">{t(error)}</p>}
    <footer><CanvasChip disabled={pending} onClick={cancel}>{t("canvas.cancel")}</CanvasChip><CanvasChip disabled={pending} onClick={() => { void confirm(); }}>{t("canvas.remove")}</CanvasChip></footer>
  </div>;
}

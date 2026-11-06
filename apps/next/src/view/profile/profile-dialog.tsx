"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@/i18n";

interface ProfileDialogProps { title: string; children: ReactNode; onClose: () => void }

/**
 * 弹窗：原生 dialog 提供焦点约束、Esc 与关闭后焦点恢复。
 * showModal 在提交后的 effect 中执行，静态导出阶段不访问 document。
 * cleanup 关闭同一个 DOM 实例，使严格模式重执行 effect 时不会留下旧模态状态。
 * 背景点击同时判断 event.target 和边界；点击正文空隙不会误关闭。
 * 页面滚动锁由全局 dialog[open] 选择器接管，关闭后恢复原滚动位置。
 */
export function ProfileDialog({ title, children, onClose }: ProfileDialogProps) {
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  const { t } = useTranslation();
  useEffect(() => { const modal = ref.current; modal?.showModal(); return () => modal?.close(); }, []);
  return <dialog ref={ref} className="profile-dialog" aria-labelledby={id} onCancel={onClose} onClick={event => {
    const r = event.currentTarget.getBoundingClientRect();
    if (event.target === event.currentTarget && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) onClose();
  }}>
    <header><h2 id={id}>{title}</h2><button type="button" onClick={onClose} aria-label={t("common.close")}><X size={19} /></button></header>
    <div className="profile-dialog-body">{children}</div>
  </dialog>;
}

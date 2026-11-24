"use client";

/** 创建输入区公告：只解释当前缺项并打开原清单，刷新仍使用已有扫描入口。 */
import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useSetupChecklistStore } from '@/stores/use-setup-checklist-store';
import type { useWorkflowReadiness } from '@/hooks/use-workflow-readiness';

export function WorkflowModelNotice({ readiness }: { readiness: ReturnType<typeof useWorkflowReadiness> }) {
  const { t } = useTranslation(), [error, setError] = useState(false);
  const refresh = async () => {
    setError(false);
    try { await useSettingsStore.getState().scanAllModels(); }
    catch { setError(true); }
  };
  if (!readiness.blocked) return null;
  return <aside data-workflow-model-notice role="status" className="m-3 space-y-2 rounded-lg bg-muted/30 p-3 text-xs leading-5">
    <p className="font-medium">{t(readiness.checking ? 'components.setupChecklist.checkingModels' : 'components.setupChecklist.generationLocked')}</p>
    <p className="text-muted-foreground">{t('components.setupChecklist.unlockNotice')}</p>
    {readiness.missing.length > 0 && <ul className="max-h-24 overflow-y-auto text-muted-foreground">{readiness.missing.map(name => <li key={name} className="break-all">{name.split(/[/\\]/).pop()}</li>)}</ul>}
    <div className="flex gap-4"><button type="button" data-open-model-checklist onClick={() => useSetupChecklistStore.getState().setOpen(true)} className="text-accent-text hover:underline">{t('components.setupChecklist.title')}</button><button type="button" data-refresh-model-readiness disabled={readiness.checking} onClick={() => { void refresh(); }} className="text-accent-text hover:underline disabled:opacity-50">{t('components.setupChecklist.recheckModels')}</button></div>
    {error && <p role="alert" className="text-destructive">{t('components.setupChecklist.scanFailed')}</p>}
  </aside>;
}

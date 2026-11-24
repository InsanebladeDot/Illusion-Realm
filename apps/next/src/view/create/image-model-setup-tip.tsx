"use client";

/** 创作页上方的模型提醒和补齐入口，文件选项来自已经扫描的本地目录。 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, X } from 'lucide-react';
import { SimpleSelect } from '@/components/SimpleSelect';
import { useSetupDownloads } from '@/hooks/use-setup-downloads';
import { useTranslation } from '@/i18n';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useSetupChecklistStore } from '@/stores/use-setup-checklist-store';
import { imageCoreNames, imageCoreSlots, type ImageModelIssue } from '@/utils/comfy/image-core-models';
import type { VideoModelOverrides } from '@/utils/comfy/video-workflow-models';
import type { ComfyApiPrompt } from '@/types/comfy';
import type { LocalModel } from '@/types/localModel';
import type { SettingsPaths } from '@/types/settings';

const LABELS = { unet_name: 'create.videoModels.unet', ckpt_name: 'create.page.model', clip_name: 'create.videoModels.clip', vae_name: 'create.videoModels.vae' } as const;

interface Props {
  issue: ImageModelIssue;
  title: string;
  group: string;
  missing: string[];
  template: ComfyApiPrompt;
  values: VideoModelOverrides;
  models: LocalModel[];
  paths: SettingsPaths;
  onChange: (values: VideoModelOverrides) => void;
  onClose: () => void;
}

export function ImageModelSetupTip({ issue, title, group, missing, template, values, models, paths, onChange, onClose }: Props) {
  const { t } = useTranslation();
  const folder = useSetupDownloads();
  const messages = {
    directory: t('create.imageModelSetup.directory'),
    checking: t('create.imageModelSetup.checking', { name: title }),
    missing: t('create.imageModelSetup.missing', { name: title }),
  };
  const [editing, setEditing] = useState(false);
  const [scanFailed, setScanFailed] = useState(false);
  async function refresh() {
    setScanFailed(false);
    try { await useSettingsStore.getState().scanAllModels(); }
    catch { setScanFailed(true); }
  }
  // Portal 位于标题栏下方，不受创建栏的滚动裁切。
  return createPortal(<aside data-image-model-tip className="fixed top-14 left-1/2 z-[85] max-h-[calc(100dvh-5rem)] w-[min(27rem,calc(100%-1.5rem))] -translate-x-1/2 overflow-auto rounded-xl border border-border bg-background p-3 text-xs shadow-lg">
    <div className="flex items-start gap-2">
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
      <p role="status" className="flex-1 font-medium" data-image-model-issue={issue}>{messages[issue]}</p>
      <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={onClose} aria-label={t('common.close')}><X size={14} /></button>
    </div>
    {missing.length > 0 && <p className="mt-2 max-h-20 overflow-auto break-all text-muted-foreground">{missing.map(name => name.split(/[/\\]/).pop()).join(' · ')}</p>}
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-accent-text">
      {issue === 'directory' && <button type="button" data-image-model-choose-dir disabled={folder.busy} className="hover:underline" onClick={() => { void folder.act(); }}>{t('components.setupChecklist.chooseModels')}</button>}
      <button type="button" className="hover:underline" data-open-model-checklist onClick={() => { useSetupChecklistStore.getState().openGroup(group); onClose(); }}>{t('components.setupChecklist.title')}</button>
      {issue !== 'directory' && <>
        <button type="button" className="hover:underline" data-image-model-configure onClick={() => setEditing(value => !value)} aria-expanded={editing}>{t('create.imageModelSetup.configure')}</button>
        <button type="button" data-refresh-model-readiness className="hover:underline disabled:opacity-50" disabled={issue === 'checking'} onClick={() => { void refresh(); }}>{t('components.setupChecklist.recheckModels')}</button>
      </>}
    </div>
    {editing && <div className="mt-3 space-y-2 border-t border-border pt-2" data-image-model-recovery>
      {/* 每一项只显示对应分类里的文件，相对名称直接交给对应 Loader。 */}
      {imageCoreSlots(template).map(slot => {
        const names = [...imageCoreNames(slot, models, paths).values()].sort((a, b) => a.localeCompare(b));
        const options = [{ value: '', label: t('create.imageModelSetup.workflowDefault') }, ...names.map(name => ({ value: name, label: name }))];
        return <div className="space-y-1" key={slot.id}>
          <p className="text-muted-foreground">{t(LABELS[slot.input])}</p>
          <SimpleSelect data-image-model-slot={slot.input} ariaLabel={t(LABELS[slot.input])} portal value={values[slot.id] ?? ''} options={options} onChange={name => onChange({ ...values, [slot.id]: name })} />
        </div>;
      })}
      <p className="text-muted-foreground">{t('create.imageModelSetup.localHint')}</p>
    </div>}
    {(scanFailed || folder.error) && <p role="alert" className="mt-2 text-destructive">{folder.error || t('components.setupChecklist.scanFailed')}</p>}
  </aside>, document.body);
}

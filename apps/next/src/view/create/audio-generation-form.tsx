"use client";
/**
 * rail：Role TTS 使用 MiniMax H3 音频图，复用主模型、步数、种子、LoRA 和生成控件。
 * 表单由宿主传入参数，创作页和画布节点共用全部控件。
 * 提交、取消和保存由宿主负责，本组件只展示参数与通知用户操作。
 */
import { useWorkflowReadiness } from "@/hooks/use-workflow-readiness";
import { WorkflowModelNotice } from "@/components/workflow-model-notice";
import { workflowModelDraft } from "@/utils/workflow-model-draft";
import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import type { AudioCreateState } from '@/stores/use-audio-create-store';
import type { ReactNode } from 'react';
import { audioWorkflowTemplate, audioWorkflowDefaults } from '@/utils/comfy/audio-workflow';
import { ImageReferencePrompt } from './image-reference-prompt';
import { PromptConversionPreview } from './prompt-conversion-preview';
import { normalizeVideoReferences } from '@/utils/comfy/video-reference-media';
import { audioPromptMedia } from '@/utils/comfy/audio-prompt-references';
import { GenerateFooter } from './GenerateFooter';
import { SeedFields } from './generation-sampling-fields';
import { VideoModelSelect } from './video-model-select';
import { GenerationParameterControl } from './generation-parameter-control';
import { VIDEO_GENERATION_LIMITS } from '@/utils/comfy/video-generation-settings';
import { AudioUpload } from './AudioUpload';
import { VideoLoraSelect } from './video-lora-select';
import { WorkflowModelSettings } from './video-model-settings';
import { AdvancedSettingsSection } from "./advanced-settings-section";

const TEMPLATE = audioWorkflowTemplate();
const AUDIO_KINDS = ['audio'] as const, NO_IMAGES: (string | null)[] = [];

// 参数由宿主传入；参考展示只要文件名，不要求把整个音频读进表单。
export type AudioGenerationFormState = Pick<AudioCreateState, 'prompt' | 'seed' | 'random' | 'loras' | 'unetName' | 'steps' | 'durationSeconds' | 'modelOverrides' | 'patch' | 'setLoras' | 'submit' | 'error'> & { reference: { name: string } | null };
interface Props { state: AudioGenerationFormState; active: boolean; disabled?: boolean; promptId?: string; children?: ReactNode; referenceControl?: ReactNode; countControl?: Parameters<typeof GenerateFooter>[0]["countControl"]; variant?: 'full' | 'settings' }

export function AudioGenerationForm({ state, active, disabled = false, promptId = 'audio-prompt', children, referenceControl, countControl, variant = 'full' }: Props) {
  const { t } = useTranslation();
  const reference = Boolean(state.reference);
  const template = useMemo(() => audioWorkflowTemplate(reference), [reference]);
  const defaults = useMemo(() => audioWorkflowDefaults(reference), [reference]);
  const media = useMemo(() => audioPromptMedia(state.reference), [state.reference]);
  // 参数侧栏只编辑配置，像抽屉里的设置页；按 Enter 也不能绕过节点的统一生成入口。
  const full = variant === 'full';
  const modelPrompt = useMemo(() => workflowModelDraft(template, { main: state.unetName, overrides: state.modelOverrides[reference ? 'reference' : 'text'], loras: state.loras }), [template, state.unetName, state.modelOverrides, reference, state.loras]);
  const readiness = useWorkflowReadiness(full ? modelPrompt : null);
  const stepsControl = <GenerationParameterControl name="audio-steps" label={t('create.advancedSettings.steps')} hint={t('create.advancedSettings.stepsHint')} min={1} max={100} step={1} value={state.steps ?? defaults.steps} onChange={steps => state.patch({ steps: Math.round(steps) })} />;
  return <form data-audio-create onSubmit={event => { event.preventDefault(); if (full && !readiness.blocked) state.submit(); }} className="flex min-h-0 flex-1 flex-col">
    <WorkflowModelNotice readiness={readiness} />
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* rail：真实音频参数，主模型和步数使用工作流缺省或用户覆盖。 */}
      <fieldset disabled={disabled} className="min-w-0 space-y-4 p-3">
        {/* 界面：「模型」直接复用已有封面卡片和本地模型选择弹窗。 */}
        <VideoModelSelect workflowId="minimax" templateOverride={template} overrides={state.unetName ? { [defaults.unetId]: state.unetName } : {}} onChange={value => state.patch({ unetName: value[defaults.unetId] ?? null })} disabled={disabled} />
        {/* rail：扩展紧跟主要模型，和图片模式的参数阅读顺序一致。 */}
        <VideoLoraSelect workflowId="minimax" templateOverride={TEMPLATE} value={state.loras} disabled={disabled} onChange={state.setLoras} />
        {/* rail：只展示音频图真实的 CLIP/VAE，不显示 pixel_space 占位。 */}
        <WorkflowModelSettings key={reference ? 'reference' : 'text'} workflowId="minimax" mediaKind="audio" templateOverride={template} overrides={state.modelOverrides[reference ? 'reference' : 'text'] ?? {}} onChange={value => state.patch({ modelOverrides: { ...state.modelOverrides, [reference ? 'reference' : 'text']: value } })} onReset={() => state.patch({ modelOverrides: { ...state.modelOverrides, [reference ? 'reference' : 'text']: {} } })} disabled={disabled} />
        {full && <><label htmlFor={promptId} className="text-sm font-medium">{t('create.audio.prompt')}</label>
        {/* 界面：「音频提示词」复用视频 @ 补全、撤销、输入法及光标逻辑。 */}
        <ImageReferencePrompt id={promptId} value={state.prompt} onChange={prompt => state.patch({ prompt })} images={NO_IMAGES} media={media} kinds={AUDIO_KINDS} disabled={disabled} assistant preparePrompt={text => normalizeVideoReferences(text, media)} label={t('create.audio.prompt')} placeholder={t('create.audio.promptHint')} />
        {/* 界面：「转换预览」复用视频展示，只读显示实际提交的 H3 标记。 */}
        <PromptConversionPreview value={state.prompt} media={media} />
        {referenceControl ?? <AudioUpload label={t('create.audio.reference')} fileName={state.reference?.name ?? null} onSelect={reference => state.patch({ reference })} onRemove={() => state.patch({ reference: null })} emptyHint={t('create.audio.referenceHint')} />}</>}
        {/* 创作页保留原时长行；画布设置形态的时长统一在节点浮层选择。 */}
        {full && <><GenerationParameterControl name="audio-duration" label={t('create.audio.duration')} hint={t('create.audio.durationHint')} min={VIDEO_GENERATION_LIMITS.durationMin} max={VIDEO_GENERATION_LIMITS.durationMax} step={0.1} value={state.durationSeconds ?? defaults.durationSeconds} onChange={durationSeconds => state.patch({ durationSeconds })} />
        <p data-audio-workflow className="text-xs text-muted-foreground">{t(state.reference ? 'create.audio.referenceWorkflow' : 'create.audio.textWorkflow', { seconds: state.durationSeconds ?? defaults.durationSeconds })}</p></>}
        {full && stepsControl}
        <SeedFields seed={state.seed} seedMode={state.random ? 'random' : 'custom'} onSeed={seed => state.patch({ seed })} onSeedMode={mode => state.patch({ random: mode === 'random' })} />
      </fieldset>
      <AdvancedSettingsSection disabled={disabled}>
        {/* 界面：画布把采样步数收进高级设置，创作页仍在表单中直接显示。 */}
        {!full && <fieldset disabled={disabled} className="min-w-0">{stepsControl}</fieldset>}
      </AdvancedSettingsSection>
      {state.error && <p role="alert" className="p-3 text-sm text-destructive">{state.error}</p>}
      {/* 界面：没有中间预览列时在表单内播放，结果仍由同一个常驻 store 持有。 */}
      {children}
    </div>
    {/* 界面：「生成 | ×N」和骰子复用图片页的整个底部组件。 */}
    {full && <GenerateFooter disabled={disabled || readiness.blocked} generating={active} onGenerate={state.submit} countControl={countControl} quantityLabel={t('create.audio.media')} seedControl={{ random: state.random, onEnable: () => state.patch({ random: true }) }} />}
  </form>;
}

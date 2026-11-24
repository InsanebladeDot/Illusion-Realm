"use client";

/** 编辑三种入口各取自己的模板，缺模型时仍可导入、画图和改参数，只禁用推理。 */
import { useMemo } from 'react';
import type { AnimaEditSettings } from '@/utils/comfy/anima-edit-workflow';
import { getImageWorkflowTemplate } from '@/utils/comfy/imageWorkflow';
import { getMinimaxImageEditTemplate } from '@/utils/comfy/minimax-image-edit-workflow';
import { getAnimaControlTemplate } from '@/utils/comfy/anima-control-workflow';
import { workflowModelDraft } from '@/utils/workflow-model-draft';
import { useWorkflowReadiness } from './use-workflow-readiness';

export function useEditModelReadiness(settings: AnimaEditSettings) {
  const prompt = useMemo(() => {
    const template = settings.controlMode ? getAnimaControlTemplate(settings.controlMode)
      : settings.editWorkflow === 'minimax-image-edit' ? getMinimaxImageEditTemplate() : getImageWorkflowTemplate('anima');
    return workflowModelDraft(template, { main: settings.checkpointName, overrides: settings.modelOverrides, loras: settings.loras, upscale: settings.upscale });
  }, [settings]);
  return useWorkflowReadiness(prompt);
}

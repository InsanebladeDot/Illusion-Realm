"use client";

// 视频尺寸适配层只读取工作流默认值并传参；选择、缩放和返回格式与图片完全共用。
import { useMemo } from "react";
import { getVideoWorkflowTemplate } from "@/utils/comfy/videoWorkflow";
import { getVideoResolutionDefaults, type VideoResolutionSettings } from "@/utils/comfy/video-resolution";
import { CreationSizeSelector } from "./creation-size-selector";

interface Props { workflowId?: string; value?: VideoResolutionSettings; disabled: boolean; onChange: (value: VideoResolutionSettings) => void }
export function VideoResolutionControls({ workflowId = "minimax", value, disabled, onChange }: Props) {
  const defaults = useMemo(() => getVideoResolutionDefaults(getVideoWorkflowTemplate(workflowId)), [workflowId]);
  return (
    /* 界面：「图片尺寸」，与图片同组件、同功能、同返回参数；这里只对接视频状态 */
    <fieldset disabled={disabled} data-video-resolution className="min-w-0">
      <CreationSizeSelector value={value ?? defaults} onChange={onChange} />
    </fieldset>
  );
}

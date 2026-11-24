/** 视频配置沿用原模板；只在打开侧栏时加载工作流，普通节点不提前装入全部视频JSON。 */
import { DEFAULT_VIDEO_WORKFLOW_ID } from "@/data/videoForm";
import { getVideoWorkflowTemplate } from "@/utils/comfy/videoWorkflow";
import { applyVideoResolution, getVideoResolutionDefaults } from "@/utils/comfy/video-resolution";
import type { CanvasData } from "./canvas-model";
import { canvasOutputDimensions } from "./canvas-output-size";

/** 像在复印的工作单上填尺寸：原模板不变，当前节点的宽高进入实际MiniMax条件节点。 */
export function getCanvasVideoWorkflowTemplate(data: CanvasData) {
  // 画布继承原模板扩展；创作页未传此选项时仍保留它原有的默认行为。
  const template = getVideoWorkflowTemplate(data.workflow ?? DEFAULT_VIDEO_WORKFLOW_ID, true);
  // 旧自定义允许超出现行本地模型范围；浏览侧栏不悄悄重写或因旧值阻断原模型配置。
  if (data.videoOutput && data.videoMegapixels === undefined) return template;
  applyVideoResolution(template, { ...getVideoResolutionDefaults(template), ...canvasOutputDimensions(data) });
  return template;
}

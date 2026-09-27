/**
 * 视频工作流配置（任务规范：固定参数与限制规则集中到 data 配置，禁止 UI 硬编码魔法数字）
 * 工作流 JSON 位于 src/data/comfy/videoWorkflower/<大分类>/<工作流>.json
 */

export type VideoWorkflow = {
  id: string;
  /** 大分类（目录名），如 minimax / wan2.2 */
  category: string;
  /** 展示名 */
  name: string;
  /** 相对 src/data/comfy/videoWorkflower 的工作流文件路径 */
  file: string;
  /** 是否需要用户提供时长（minimax 时长固定，wan2.2 需提供） */
  requiresDuration: boolean;
};

export const VIDEO_WORKFLOWS: VideoWorkflow[] = [
  {
    id: "minimax",
    category: "minimax",
    name: "MiniMax H3 图生视频",
    file: "minnimax/minimax h3 图生视频-首尾帧.json",
    requiresDuration: false,
  },
  {
    id: "wan2.2",
    category: "wan2.2",
    name: "Wan2.2 Remix NSFW",
    file: "wan2.2/wan2.2-Remix-NSFW.json",
    requiresDuration: true,
  },
];

export const DEFAULT_VIDEO_WORKFLOW_ID = "minimax";

/** 视频生成限制规则（集中管理，便于调整阈值） */
export const VIDEO_WORKFLOW_LIMITS = {
  /** 时长（秒）上限 */
  durationMax: 5,
  durationMin: 1,
  defaultDuration: 5,
} as const;

export function getVideoWorkflowById(
  id: string | null | undefined
): VideoWorkflow | undefined {
  return VIDEO_WORKFLOWS.find((workflow) => workflow.id === id);
}

/** 大分类列表（按出现顺序去重） */
export function getVideoWorkflowCategories(): string[] {
  return Array.from(
    new Set(VIDEO_WORKFLOWS.map((workflow) => workflow.category))
  );
}

export function getVideoWorkflowsByCategory(
  category: string
): VideoWorkflow[] {
  return VIDEO_WORKFLOWS.filter(
    (workflow) => workflow.category === category
  );
}

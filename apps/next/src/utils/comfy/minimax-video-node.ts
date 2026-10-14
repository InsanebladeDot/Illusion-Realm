/** 定位 Minimax 两种生成节点；尺寸与高级设置都沿节点连接读取，避免为参考工作流复制参数逻辑。 */
import type { ComfyApiPrompt } from "@/types/comfy";

export function findMinimaxVideoNode(prompt: ComfyApiPrompt) {
  return Object.values(prompt).find((node) =>
    node.class_type === "MiniMaxH3ImageToVideo" || node.class_type === "MiniMaxH3ReferenceToVideo");
}

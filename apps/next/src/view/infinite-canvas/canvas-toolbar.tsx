"use client";

// 同一底栏组件用于实际画布，只有动作适配留在这里；视口不进入作品撤销历史。
// 图引擎镜头操作可能在卸载时失败，在此消费拒绝，避免留下未处理的异步错误。
import { useReactFlow, useViewport } from "@xyflow/react";
import { CanvasCounters, CanvasDock, ViewControls } from "./reference-ui/canvas-chrome";
import type { useCanvasEditor } from "./use-canvas-editor";
import styles from "./canvas.module.css";

interface ToolbarProps {
  editor: ReturnType<typeof useCanvasEditor>;
  hand: boolean;
  grid: boolean;
  minimap: boolean;
  onHand: (value: boolean) => void;
  onGrid: () => void;
  onMiniMap: () => void;
  onAdd: () => void;
  onSettings: () => void;
  onHelp: () => void;
  // 和添加菜单一样通知宿主导入；控件本身不维护素材列表或隐藏 input。
  // 使用动作名 import 与现有 add 区分：前者选择文件，后者只创建空节点。
  // 回调不会接收凭据、文件内容或任意 IPC 通道，职责仍然是 UI 意图通知。
  // 入口能否执行由宿主根据草稿加载状态与桌面路径能力判断。
  // 和多个节点共享此回调不会共享它们的媒体播放状态。
  onImport: () => void;
}

export function CanvasToolbar({ editor, hand, grid, minimap, onHand, onGrid, onMiniMap, onAdd, onSettings, onHelp, onImport }: ToolbarProps) {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  const fit = () => { void flow.fitView({ padding: .3, maxZoom: 1, duration: 0 }).catch(() => undefined); };
  // 映射只适配动作来源，实际导入仍由宿主的一份流程完成。
  // 不把文件夹按钮接成空动作，也不继续用“素材库”误导已有文件管理能力。
  // 导入完成后的撤销可用性来自 editor，底栏不维护一份自己的导入计数。
  // 调整媒体类型或导入规则不用修改本动作表，UI 与具体格式能力保持分离。
  const actions: Record<string, () => void> = { add: onAdd, hand: () => onHand(!hand), undo: () => editor.history(false), redo: () => editor.history(true), target: fit, settings: onSettings, import: onImport };
  return <><div className={styles.viewTools}><ViewControls zoom={zoom} grid={grid} minimap={minimap} onZoomChange={value => { void flow.zoomTo(value).catch(() => undefined); }} onFit={fit} onGridToggle={onGrid} onMiniMapToggle={onMiniMap} onHelp={onHelp} /></div><div className={styles.toolbar}><CanvasDock hand={hand} canUndo={editor.canUndo} canRedo={editor.canRedo} onAction={action => actions[action]?.()} /></div><div className={styles.counter}><CanvasCounters nodes={editor.nodes.length} edges={editor.edges.length} /></div></>;
}

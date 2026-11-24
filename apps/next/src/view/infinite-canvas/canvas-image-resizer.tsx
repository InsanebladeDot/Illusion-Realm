"use client";

/** 各类节点共用原画布尺寸手势，松手只产生一笔可保存、可撤销的编辑。 */
import { NodeResizeControl, ResizeControlVariant } from "@xyflow/react";
import { useCanvasEditorActions } from "./canvas-editor-context";
import styles from "./canvas.module.css";

const EDGES = ["top", "right", "bottom", "left"] as const;

export function CanvasImageResizer({ selected }: { selected: boolean }) {
  const actions = useCanvasEditorActions();
  if (!selected) return null;
  // 控件挂在卡片边缘，参数面板不参与节点测量；图片像素和生成尺寸均不改变。
  const callbacks = { onResizeStart: actions.startDrag, onResizeEnd: actions.stopDrag };
  return <div className={styles.resizers} data-card-resizers data-visible={selected}>
    {EDGES.map(position => <NodeResizeControl key={position} position={position} variant={ResizeControlVariant.Line} style={{ border: 0, background: "transparent" }} className={styles.resizeEdge} minWidth={160} minHeight={100} maxWidth={1200} maxHeight={900} {...callbacks} />)}
    <NodeResizeControl position="bottom-right" style={{ border: 0, background: "transparent" }} className={styles.resizeCorner} minWidth={160} minHeight={100} maxWidth={1200} maxHeight={900} {...callbacks} />
  </div>;
}

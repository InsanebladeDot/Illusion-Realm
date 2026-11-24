"use client";

// 标注挂在卡片外侧，随节点移动缩放；只点击时通知编辑，不参与生成或连线。
import { Tag } from "lucide-react";
import type { CSSProperties } from "react";
import { HoverTip } from "@/components/hover-tip";
import { useTranslation } from "@/i18n";
import { annotationInk, type CanvasAnnotation } from "./canvas-annotations";
import styles from "./canvas-annotations.module.css";

interface Props {
  values?: CanvasAnnotation[];
  onEdit: (id: string) => void;
}

export function CanvasAnnotationList({ values, onEdit }: Props) {
  const { t } = useTranslation();
  if (!values?.length) return null;
  return <div data-canvas-annotations className={`${styles.list} nodrag nopan`} onDoubleClick={event => event.stopPropagation()}>
    {/* 节点四周：按添加顺序占八个位置，删掉一项后由后面的标注依次补位。 */}
    {values.map((item, index) => <HoverTip key={item.id} asChild label={item.text}>
      <button type="button" data-canvas-annotation={item.id} data-annotation-position={index + 1} className={styles.tag} style={{ backgroundColor: item.color, color: annotationInk(item.color), "--annotation-color": item.color } as CSSProperties} aria-label={t("canvas.editAnnotation", { text: item.text })} onClick={event => { event.stopPropagation(); onEdit(item.id); }}>
        <Tag size={14} aria-hidden /><span>{item.text}</span>
      </button>
    </HoverTip>)}
  </div>;
}

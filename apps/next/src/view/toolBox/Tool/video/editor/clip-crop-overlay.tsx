"use client";

// 裁剪草稿只属于当前画布操作，确认前不写工程，取消不需要反向修补历史。
// 四边比例像相框遮住照片边缘，源文件与原来的项目位置都不会改变。
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useTranslation } from "@/i18n";
import type { ClipCrop } from "./editor-timeline";
import { EditorAction } from "./editor-controls";
import styles from "./editor.module.css";

export interface CropEdit { confirm: (crop: ClipCrop) => void; cancel: () => void; }
interface Point { x: number; y: number; }
const EMPTY_CROP: ClipCrop = { left: 0, top: 0, right: 0, bottom: 0 };

// 在旋转后的源盒内反算指针，不能直接拿旋转包围盒宽高作为源像素尺。
// 先围绕盒中心做反向旋转，再除以未旋转的宽高，得到稳定的0–1坐标。
// getBoundingClientRect包含旋转后的外接矩形，offsetWidth/Height才是未旋转的盒尺。
// 对中心对称的旋转，两种盒的中心相同，因此可以用前者定位、后者量比例。
// 指针拖出源盒会夹在0或1，不能因为鼠标越界就裁出负比例或超过整张图。
function sourcePoint(element: HTMLElement, x: number, y: number, rotation: number): Point {
  const box = element.getBoundingClientRect(), angle = -rotation * Math.PI / 180;
  const dx = x - (box.left + box.width / 2), dy = y - (box.top + box.height / 2);
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  return { x: clamp((dx * Math.cos(angle) - dy * Math.sin(angle)) / element.offsetWidth + .5), y: clamp((dx * Math.sin(angle) + dy * Math.cos(angle)) / element.offsetHeight + .5) };
}

// 拖动框选的起点和终点组成四边裁剪；左右反向拖也得到同一个合法矩形。
function cropBetween(from: Point, to: Point): ClipCrop {
  return { left: Math.min(from.x, to.x), right: 1 - Math.max(from.x, to.x), top: Math.min(from.y, to.y), bottom: 1 - Math.max(from.y, to.y) };
}

export function ClipCropOverlay({ style, crop, rotation, mirrored, edit }: { style: CSSProperties; crop?: ClipCrop; rotation: number; mirrored?: boolean; edit: CropEdit }) {
  // 草稿用屏幕看到的左右，提交时再换回源方向；镜像后左边不再等于源左边。
  // 此组件由当前裁剪会话挂载，切换对象需要结束会话，不能把草稿挪给下一段。
  const { t } = useTranslation(), start = useRef<Point | null>(null);
  const [draft, setDraft] = useState(mirrored && crop ? { ...crop, left: crop.right, right: crop.left } : crop ?? EMPTY_CROP);
  const ref = useRef<HTMLDivElement>(null), latest = useRef(edit);
  useEffect(() => { latest.current = edit; });
  useEffect(() => {
    // 临时拿走焦点使Escape可靠落到裁剪；关闭后仅在焦点仍属于此操作时归还。
    // 如果用户已经点击别的真实控件，清理不能反过来抢回焦点。
    const element = ref.current;
    const previous = document.activeElement;
    element?.focus({ preventScroll: true });
    const cancel = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); latest.current.cancel();
    };
    window.addEventListener("keydown", cancel, true);
    const blur = () => latest.current.cancel();
    window.addEventListener("blur", blur);
    return () => {
      // 先拆监听再取消草稿，避免卸载期间的失焦事件重复触发旧回调。
      // latest保留最新宿主回调，空依赖的清理不会调用首次渲染的过期业务闭包。
      window.removeEventListener("keydown", cancel, true);
      window.removeEventListener("blur", blur);
      latest.current.cancel();
      if (previous instanceof HTMLElement && previous.isConnected && (!document.activeElement || document.activeElement === document.body || element?.contains(document.activeElement))) previous.focus({ preventScroll: true });
    };
  }, []);
  const down = (event: PointerEvent<HTMLDivElement>) => {
    // 只接受单个主键手势；按钮属于确认区，不能按下确认时又重新开始框选。
    if (start.current || event.button !== 0 || (event.target as Element).closest("button")) return;
    event.preventDefault(); event.stopPropagation();
    start.current = sourcePoint(event.currentTarget, event.clientX, event.clientY, rotation);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    setDraft(cropBetween(start.current, sourcePoint(event.currentTarget, event.clientX, event.clientY, rotation)));
  };
  const up = (event: PointerEvent<HTMLDivElement>) => { move(event); start.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); };
  // 松手前先清start，正常释放捕获不会被lostpointercapture误认成意外取消。
  // 框太窄只禁用确认，用户仍可继续拖、重置或取消，不提交空画面。
  const confirmed = mirrored ? { ...draft, left: draft.right, right: draft.left } : draft;
  const valid = draft.left + draft.right <= .99 && draft.top + draft.bottom <= .99;
  return <div ref={ref} data-clip-crop className={styles.cropOverlay} style={style} tabIndex={0} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); edit.cancel(); } }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onLostPointerCapture={() => { if (start.current) { start.current = null; latest.current.cancel(); } }} onPointerCancel={() => { start.current = null; latest.current.cancel(); }}>
    {/* 裁剪框：指针松手只结束草稿，点击确认才形成一次可撤销工程修改。 */}
    <div className={styles.cropRect} style={{ left: `${draft.left * 100}%`, top: `${draft.top * 100}%`, right: `${draft.right * 100}%`, bottom: `${draft.bottom * 100}%` }} />
    <div className={styles.cropControls} style={{ transform: `translate(-50%, -50%) rotate(${-rotation}deg)` }}><EditorAction label={t("toolBox.editorUi.cropApply")} onClick={valid ? () => edit.confirm(confirmed) : undefined} /><EditorAction label={t("toolBox.editorUi.reset")} onClick={() => setDraft(EMPTY_CROP)} /><EditorAction label={t("common.cancel")} onClick={edit.cancel} /></div>
  </div>;
}

"use client";

/** 合成画布：模板图与文字同在SVG内，选框单独标记，导出不含编辑工具。 */
// 像地图坐标：窗口只改显示比例，图层仍存自然坐标；指针通过 SVG 逆矩阵换算。
import { useRef, type PointerEvent, type RefObject } from "react";
import { useTranslation } from "@/i18n";
import { layoutDialogue } from "./dialogue-render";
import { templateText, type DialogueTemplate } from "./dialogue-data";
import type { DialogueDocument, DialogueLayer } from "./dialogue-types";
// 文字和导出使用同一离线字体身份，旧层缺fontId时保持系统字库。
// CSS字体名只由白名单配置生成，不解释用户正文。
import { dialogueFontFamily } from "./dialogue-fonts";
import { RotateCw } from "lucide-react";
// 选框、缩放角和旋转柄独立于作品内容，沿用 data-dialogue-selection 从导出中移除。
import { DIALOGUE_CORNERS, resizeDialogue, rotateDialogue } from "./dialogue-transform";

// 宿主管理撤销，画布只报告手势起止；中间补丁传 false，不逐帧入历史。
interface StageProps {
  doc: DialogueDocument; selectedId: string | null; templates: DialogueTemplate[];
  svgRef: RefObject<SVGSVGElement | null>; onSelect: (id: string | null) => void;
  onPatch: (id: string, values: Partial<DialogueLayer>, remember?: boolean) => void;
  // 双击仅通知正文编辑，仍使用右栏唯一输入框，图层数据不增加HTML。
  // 单击与移动继续只改变选择和位置，不偷偷解锁文字。
  onEditText: (id: string) => void;
  onStart: () => void; onEnd: () => void; onImageError: () => void;
}
// 固定手势起点和原图层，每帧相对它计算，不把位移重复累加。
interface Drag { id: string; pointer: number; x: number; y: number; layerX: number; layerY: number; snapshot: DialogueLayer; corner?: string }
// rotate 只用于顶部手柄；取消保留最后显示结果，可用一次撤销恢复。
// 双击正文才通知右栏编辑，工具手柄不触发文字解锁。

// 根 SVG 逆矩阵包含居中留白与缩放，不能只按 DOM 宽度除比例，也不额外乘 DPR。
function stagePoint(svg: SVGSVGElement | null, event: PointerEvent<SVGGElement>) {
  // 未挂载时返回 null，不把定位失败当作 (0,0)。
  const matrix = svg?.getScreenCTM();
  return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
}

export function DialogueStage({ doc, selectedId, templates, svgRef, onSelect, onEditText, onPatch, onStart, onEnd, onImageError }: StageProps) {
  const { t } = useTranslation(), drag = useRef<Drag | null>(null);
  const start = (event: PointerEvent<SVGGElement>, layer: DialogueLayer) => {
    // 只接受左键和单指；定位成功才捕获指针，保留按下偏移，避免图层突然跳到中心。
    if (event.button !== 0 || drag.current) return;
    const point = stagePoint(event.currentTarget.ownerSVGElement, event); if (!point) return;
    event.stopPropagation(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    // 从原始命中元素识别手柄，currentTarget仍是图层g，所以捕获后沿用同一move/end。
    // Element覆盖SVG rect与g，不使用只适用于HTML输入框的HTMLElement判断。
    // 无需为四个角分别登记全局pointermove，也不会在穿过另一个角时更换手势方向。
    const corner = event.target instanceof Element ? event.target.closest("[data-dialogue-resize]")?.getAttribute("data-dialogue-resize") ?? (event.target.closest("[data-dialogue-rotate]") ? "rotate" : undefined) : undefined;
    drag.current = { id: layer.id, pointer: event.pointerId, x: point.x, y: point.y, layerX: layer.x, layerY: layer.y, snapshot: layer, corner };
    onSelect(layer.id); onStart();
  };
  const move = (event: PointerEvent<SVGGElement>) => {
    // 只处理本次捕获指针；中心限制在画稿内，但贴纸边缘仍可越界。
    const current = drag.current, point = stagePoint(event.currentTarget.ownerSVGElement, event);
    if (!current || current.pointer !== event.pointerId || !point) return;
    // 旋转改角度，缩放会改中心；分支先处理，避免被普通移动覆盖。
    // 中间帧不入历史，结束统一记录一次，右栏读取同一份图层参数。
    if (current.corner === "rotate") {
      onPatch(current.id, rotateDialogue(current.snapshot, current.x, current.y, point.x, point.y), false);
      return;
    }
    if (current.corner) {
      onPatch(current.id, resizeDialogue(current.snapshot, current.corner, point.x - current.x, point.y - current.y), false);
      return;
    }
    onPatch(current.id, { x: Math.max(0, Math.min(doc.width, current.layerX + point.x - current.x)), y: Math.max(0, Math.min(doc.height, current.layerY + point.y - current.y)) }, false);
  };
  const end = () => { if (drag.current) { drag.current = null; onEnd(); } };
  // 多种结束事件可能连续到达，先清 drag 再记历史，保证一次手势只入栈一次。
  return <section data-dialogue-stage className="flex min-h-[340px] min-w-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30 p-3 lg:min-h-0" aria-label={t("dialogue.canvas")}>
    {/* stage：白色是作品底纸，不是未适配主题的面板；外壳继续使用主题色。 */}
    {/* 根SVG先画背景再画layers，数组越靠后显示越靠前，同款模板也按实例叠放。 */}
    {/* SVG的viewBox固定作品比例，w-full与h-full仅决定可显示区域，不重写文档尺寸。 */}
    {/* touch-none避免触摸拖动同时滚动页面，属性区的正常滚动不受此类影响。 */}
    {/* 空白处按下取消选择；气泡内部由start拦截，不能同时执行这两个意图。 */}
    {/* SVG图层的role与tabIndex使其可用键盘抵达，Enter和空格只选择而不新增。 */}
    {/* aria-pressed表示已选中这个实例，不表示该模板已经被禁止再次添加。 */}
    {/* 透明rect是命中区：模板PNG透明区域仍可抓取，不只在黑色边线处才能拖动。 */}
    {/* 命中区位于文字之后，文字无需单独添加拖动监听，也不会出现半个气泡不能点。 */}
    {/* 键盘焦点只提高淡线对比，不把单击选框加粗为高亮光圈。 */}
    {/* 缺失templateId跳过无法绘制的层，属性列表仍保留该记录供用户处理。 */}
    {/* image onError只通知宿主，不能在render的map里删除数组导致历史不同步。 */}
    {/* preserveAspectRatio=meet保留背景完整内容，画布比例改变时可能出现留白。 */}
    {/* 旋转写在scale之前的变换链中，中心始终由translate定位而不绕画布原点打转。 */}
    {/* SVG等比缩放保留全图，背景不使用cover裁掉用户画面。 */}
    {/* 选择描边跟随自然坐标，导出时通过专用标记移除。 */}
    <svg ref={svgRef} data-dialogue-svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${doc.width} ${doc.height}`} className="h-full max-h-full w-full touch-none" onPointerDown={() => onSelect(null)}>
      <rect width="100%" height="100%" fill="#ffffff" />
      {doc.background && <image href={doc.background} width={doc.width} height={doc.height} preserveAspectRatio="xMidYMid meet" onError={onImageError} />}
      {doc.layers.map(layer => {
        const item = templates.find(template => template.id === layer.templateId); if (!item) return null;
        return <g key={layer.id} data-dialogue-layer={layer.id} role="button" tabIndex={0} aria-label={templateText(item, "name")} aria-pressed={selectedId === layer.id} transform={`translate(${layer.x} ${layer.y}) rotate(${layer.rotation}) scale(${layer.width / 640})`} className="cursor-move outline-none focus-visible:[&>rect]:stroke-opacity-80" onDoubleClick={event => { if (!(event.target instanceof Element && event.target.closest("[data-dialogue-selection] g,[data-dialogue-resize],[data-dialogue-rotate]"))) { event.stopPropagation(); onEditText(layer.id); } }} onPointerDown={event => start(event, layer)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(layer.id); } }}>
          <image href={item.src} x={-320} y={-200} width={640} height={400} opacity={layer.opacity} onError={onImageError} />
          <DialogueText layer={layer} verticalTemplate={item.vertical} />
          {/* 透明命中区填满气泡画片，点击文字与透明边缘都只选择当前图层。 */}
          {/* 未选中的虚线为透明，焦点出现时仍可用键盘看见轮廓。 */}
          {/* 此矩形不参与作品输出，不能被烘焙为一层淡色边框。 */}
          <rect data-dialogue-selection x={-318} y={-198} width={636} height={396} fill="transparent" stroke={selectedId === layer.id ? "var(--accent-stroke)" : "transparent"} strokeOpacity={.35} strokeWidth={.75} vectorEffect="non-scaling-stroke" />
          {/* stage：四角手柄放在命中区之后，重叠时优先接收缩放点击。 */}
          {/* 手柄组带导出排除标记，生成PNG不会多出四个小方块。 */}
          {/* 小方块尺寸随图层scale抵消，缩小气泡后仍保留可抓取区域。 */}
          {/* 宽度字段继续作为键盘等价入口；装饰手柄不额外塞入四个重复Tab位置。 */}
          {/* 白底和强调描边取语义主题色，深色也能看见选中工具。 */}
          {/* 四角来自相同配置数组，旋转与边界统一走resizeDialogue。 */}
          {/* 顶部旋转图标与四角同属工具层，导出统一移除，不进入成品。 */}
          {/* 图标尺寸抵消层自身缩放；连线只提示控制关系，不拦截画布点击。 */}
          {/* 点击只抓住旋转手柄，按下后拖动才改变角度；右栏仍可键盘输入精确角度。 */}
          {/* 图标使用现有RotateCw，不新增位图资源或另一套旋转按钮样式。 */}
          {selectedId === layer.id && <g data-dialogue-selection>
            <line x1={0} y1={-198} x2={0} y2={-198 - 28 * 640 / layer.width} stroke="var(--accent-stroke)" strokeOpacity={.3} strokeWidth={.75} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            <g data-dialogue-rotate transform={`translate(0 ${-198 - 28 * 640 / layer.width}) scale(${640 / layer.width})`} style={{ cursor: "grab" }}>
              <circle r={12} fill="var(--background)" stroke="var(--accent-stroke)" strokeOpacity={.35} strokeWidth={.75} />
              <RotateCw x={-7} y={-7} width={14} height={14} color="var(--muted-foreground)" strokeWidth={1} pointerEvents="none" />
            </g>
          </g>}
          {selectedId === layer.id && <g data-dialogue-selection>{DIALOGUE_CORNERS.map(corner => <rect key={corner.id} data-dialogue-resize={corner.id} x={corner.x * 318 - 8 * 640 / layer.width} y={corner.y * 198 - 8 * 640 / layer.width} width={16 * 640 / layer.width} height={16 * 640 / layer.width} rx={2} fill="var(--background)" stroke="var(--accent-stroke)" strokeOpacity={.4} strokeWidth={.75} vectorEffect="non-scaling-stroke" style={{ cursor: corner.cursor }} />)}</g>}
        </g>;
      })}
    </svg>
  </section>;
}

// 横排和竖排共用 layoutDialogue；竖排列从右到左，空行占位，溢出只裁显示、不删正文。
// 用 SVG 文本而非 HTML，导出可复用同一排版；中英混排是字格估算，并非专业排印。
export function DialogueText({ layer, verticalTemplate }: { layer: DialogueLayer; verticalTemplate: boolean }) {
  // clipPath 用图层实例 ID，同款模板也不共用裁切框；横排 x 与 textAnchor 配套对齐。
  // 透明度分别作用于图片和文字，不能在父层再乘一次。
  const { box, size, gap, lines } = layoutDialogue(layer, verticalTemplate), step = size * layer.lineHeight;
  const vertical = layer.direction === "vertical", anchor = layer.align === "left" ? "start" : layer.align === "right" ? "end" : "middle";
  return <g fill={layer.color} opacity={layer.opacity} data-dialogue-font={layer.fontId} fontFamily={dialogueFontFamily(layer.fontId)} fontSize={size} clipPath={`url(#clip-${layer.id})`} pointerEvents="none">
    <defs><clipPath id={`clip-${layer.id}`}><rect {...box} /></clipPath></defs>
    {lines.map((line, index) => vertical ? Array.from(line).map((char, row) => <text key={`${index}-${row}`} textAnchor="middle" x={box.x + box.width - step * (index + .5)} y={box.y + (layer.align === "center" ? (box.height - line.length * (size + gap)) / 2 : layer.align === "right" ? box.height - line.length * (size + gap) : 0) + size * .85 + row * (size + gap)}>{char}</text>) : line && <text key={index} textAnchor={anchor} x={box.x + (layer.align === "left" ? 0 : layer.align === "right" ? box.width : box.width / 2)} y={box.y + (box.height - lines.length * step) / 2 + size * .85 + index * step} textLength={Array.from(line).reduce((sum, char) => sum + size * (/^[\x20-\x7e]$/.test(char) ? .6 : 1), 0) + Math.max(0, line.length - 1) * gap} lengthAdjust="spacingAndGlyphs">{line}</text>)}
  </g>;
}

"use client";

/** 合成画布：模板图与文字同在SVG内，选框单独标记，导出不含编辑工具。 */
// 画布用自然坐标，显示时等比缩放，不把标题栏或导航宽度写死进位置计算。
// 就像用地图坐标记录地点，窗口变大只改变地图比例，不改变地点本身。
// 指针通过SVG当前变换矩阵回到自然坐标，因此横竖版、窄窗与DPR都用同一公式。
// 图层拖动使用指针捕获，离开气泡边界仍能收到本次手势的松开事件。
// 资源列表负责添加，画布只选择和移动，避免每次点空白都意外新增气泡。
// 选择状态通过参数传入，多个舞台不会共享一个选中对象。
// 文字由React安全输出，不执行尖括号或HTML事件。
import { useRef, type PointerEvent, type RefObject } from "react";
import { useTranslation } from "@/i18n";
import { layoutDialogue } from "./dialogue-render";
import { templateText, type DialogueTemplate } from "./dialogue-data";
import type { DialogueDocument, DialogueLayer } from "./dialogue-types";
// 文字和导出使用同一离线字体身份，旧层缺fontId时保持系统字库。
// CSS字体名只由白名单配置生成，不解释用户正文。
import { dialogueFontFamily } from "./dialogue-fonts";
import { RotateCw } from "lucide-react";
// 画布工具区只增加旋转图标，仍与原四角共同属于当前选中实例。
// icon的SVG子路径不接收指针，命中由外围圆形区域统一承担。
// 用户点到图标中空处也能开始拖动，不必精确抓住一条细线。
// 旋转控制不添加外部图片请求，lucide会随现有JS离线加载。
// 控件与模板正文分别绘制，因此文字透明度不会使手柄一起无法操作。
// 选择边线使用non-scaling-stroke，气泡放大后仍是细线而非粗边框。
// 降低描边透明度只影响工具提示，不改变模板PNG自身的漫画轮廓。
// 对话框本身的边框由原PNG决定，用户要求的浅色选框不重绘作品线条。
// 手柄位置以画片640比400边界为准，不逐帧扫描PNG非透明区域。
// 画片中的透明尾巴与装饰仍参与整体尺寸，不能按肉眼白色框重新定义中心。
// 上方连接线随图层旋转，用户能看出旋转操作仍绑定当前气泡而非画布。
// 整个stage不新增全局mousedown或mousemove，页面离开后没有悬挂的旋转监听。
// 四角共用同一个自然像素换算器；普通拖动、撤销、导出不复制一套新实现。
// 手柄只是选中层的编辑工具，沿用导出器已有data-dialogue-selection清理标记。
// resizeDialogue负责尺寸，事件层继续负责指针捕获与一次手势的起终点。
import { DIALOGUE_CORNERS, resizeDialogue, rotateDialogue } from "./dialogue-transform";

// 宿主负责撤销历史，画布仅通知手势开始、过程与结束。
// patch过程显式传false，不能把每次pointermove都当作一次独立编辑。
// 模板列表包含已加载的自定义素材，查找不到时不伪造另一张图。
// svgRef供真实PNG导出读取，不向公共标题栏暴露绘图节点。
// 回调不接收原生文件或Electron事件，保持渲染进程边界。
// 文档、选中项和资源目录分别传入，搜索筛选不影响画布已有内容。
// 缺图由素材加载状态报告，仍保留图层id，用户可以删除或重新选择。
// 画布宽高必须由文档提供，不能根据素材文件的透明边框推断页面比例。
interface StageProps {
  doc: DialogueDocument; selectedId: string | null; templates: DialogueTemplate[];
  svgRef: RefObject<SVGSVGElement | null>; onSelect: (id: string | null) => void;
  onPatch: (id: string, values: Partial<DialogueLayer>, remember?: boolean) => void;
  // 双击仅通知正文编辑，仍使用右栏唯一输入框，图层数据不增加HTML。
  // 单击与移动继续只改变选择和位置，不偷偷解锁文字。
  onEditText: (id: string) => void;
  onStart: () => void; onEnd: () => void; onImageError: () => void;
}
// 手势快照只保存起点和原图层坐标，不在移动时反复读已改变的中心。
// 这样每次delta都相对同一起点，避免位移累计造成气泡突然加速。
// 页面卸载会丢弃这个局部ref，不存在全局document pointermove监听。
// 同时只接受一个指针，触摸第二根手指不会抢走当前气泡。
// snapshot记录原width和rotation，缩放每一帧都相对同一起点计算。
// corner为空就是原来的移动手势，不把任何普通气泡点击都解释成缩放。
// 快照不包含DOM节点，指针结束后整个对象释放，不持有旧控件事件。
interface Drag { id: string; pointer: number; x: number; y: number; layerX: number; layerY: number; snapshot: DialogueLayer; corner?: string }
// corner的rotate保留值只在顶部控制命中时产生，不和四个角名混用。
// 拖动快照保存完整旧层，是为了角度与缩放都有稳定基准，不表示每帧全量覆盖它。
// move仍只提交对应字段的补丁，避免旋转时重写其他刚调整的样式属性。
// pointercancel遵守既有“保留最后显示结果并可撤销”的契约，不另造旋转取消语义。
// 双击在pointerup之后触发，先结束选择手势再进入正文，不遗留未结算的移动历史。
// 双击控制工具不应解锁正文，事件边界检查排除四角与顶部手柄。
// 单击空白仍取消选择，正文编辑许可随当前选择自然失效。
// 单击图层只读文字，与右栏数字控件焦点不是同一种锁定状态。
// 单击图层查看样式，右栏数字需单独双击解锁，不能继承正文的编辑许可。
// SVG g继续可Tab选中；正文只读框的回车为无鼠标用户提供编辑入口。

// 屏幕点通过逆矩阵回到画稿，包含SVG居中留白，不只按DOM宽度除比例。
// 矩阵还没建立时返回空，禁止产生NaN位置并污染文档。
// 只在真实pointer事件中执行，因此静态预渲染不依赖DOMPoint。
// 浏览器负责DPR到CSS像素的映射，不额外乘一次devicePixelRatio。
// 获取当前矩阵使窗口调整后下一次拖动按新布局工作。
// 空ref意味着舞台已卸载，迟到事件被忽略。
function stagePoint(svg: SVGSVGElement | null, event: PointerEvent<SVGGElement>) {
  // 此处有三套坐标：鼠标给窗口CSS坐标，画稿存自然坐标，气泡还有自己的局部坐标。
  // SVG根矩阵只负责前两套之间转换，气泡的旋转不应参与拖动中心的反算。
  // 比如1280宽画稿显示为640宽，鼠标右移10像素对应画稿右移20像素。
  // 若只加clientX差值，缩小预览时移动会变慢，导出的位置也与手感不一致。
  // preserveAspectRatio可能给画稿上下或左右留空，矩阵还包含这段平移。
  // 只用clientWidth除viewBox宽度会漏掉留白，因此必须采用getScreenCTM。
  // ownerSVGElement来自当前事件目标，避免在渲染中读取React ref触发规则错误。
  // 返回null表示此事件不能定位，并不等同于画稿左上角(0,0)。
  // 调用方必须保留这个区别，否则页面初挂载的异常事件会把气泡瞬移到边缘。
  // DOMPoint.matrixTransform产生新点，不修改SVG的变换或文档中的旧坐标。
  // 不把浏览器屏幕物理像素混入计算，所以不读取screenX或screenY。
  // 单独调整Electron缩放时，浏览器矩阵仍负责真实显示比例。
  // 此函数只处理定位，是否允许拖动、是否选中由start判断。
  const matrix = svg?.getScreenCTM();
  return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
}

export function DialogueStage({ doc, selectedId, templates, svgRef, onSelect, onEditText, onPatch, onStart, onEnd, onImageError }: StageProps) {
  const { t } = useTranslation(), drag = useRef<Drag | null>(null);
  const start = (event: PointerEvent<SVGGElement>, layer: DialogueLayer) => {
    // 右键常用于系统菜单，不能因为按下右键也创建一次内容历史。
    // drag已有值时拒绝第二个起点，防止双指触摸覆盖第一次手势的坐标。
    // 先取得有效点再捕获指针；定位失败不应锁住一个没有起点的拖动。
    // stopPropagation阻止根SVG的空白点击处理立即取消刚选中的气泡。
    // focus落在g节点，随后Delete事件才有清楚的画布目标。
    // 指针捕获把后续移动留给当前g，经过另一气泡上方也不会切换目标。
    // drag保存layerX和layerY，而非DOM包围盒左上角；旋转后仍以气泡中心移动。
    // pointerId区分鼠标或触摸事件序列，不能拿按钮序号替代。
    // onSelect仅改变阅读目标，onStart才登记可撤销的手势起点。
    // 点击但没有移动时，起点与当前文档相同，结束不会制造空历史。
    // 两个回调按同一事件调用，下一次pointermove由最新React提交处理。
    // 本方法没有调用onPatch，因此按下时不会先把图层吸到鼠标中心。
    // 偏离中心处抓取也保留原偏移，用户不会看到气泡突然跳一下。
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
    // 没有drag时pointermove只是悬停，不允许把当前选中层跟着鼠标移动。
    // 对同一指针以起点求差，每次都用layerX加delta，避免把上一次delta再加一遍。
    // 根坐标已经消除页面缩放，旋转气泡的水平拖动仍与鼠标水平方向一致。
    // 中心被限制在画稿宽高内，允许框的一部分露在边外，而不是强制整个框可见。
    // 这与把贴纸中心固定在纸内相似，贴纸本身仍可越过纸边被导出画布裁切。
    // 只传x和y，不能把start时旧的整个layer覆盖回来，否则会吞掉其他字段改变。
    // remember=false仍会重新渲染，暂停的是历史入栈而不是实时位置。
    // 目标id来自手势快照，不依赖此时属性栏是否选中同一个气泡。
    // pointercancel与丢失捕获之后drag清空，迟到move不会继续修改位置。
    const current = drag.current, point = stagePoint(event.currentTarget.ownerSVGElement, event);
    if (!current || current.pointer !== event.pointerId || !point) return;
    // 缩放的x/y是对角固定所需的中心偏移，不能继续落入普通移动分支覆盖它。
    // 中间帧remember=false与移动一致，松手后onEnd一次性提交缩放前文档。
    // 修改width直接回流右栏公共控件，不维护另一个手柄专用scale状态。
    // 顶部手柄只改角度，不按移动分支改变中心；点击但未拖动不制造历史。
    // 起始点是实际按下位置，避免小图标边缘被点中时角度跳动。
    // 松开与取消继续走同一个end，整次旋转只记一次撤销。
    // 此分支先于resize检查，否则rotate字符串会被当成未知角名而返回空补丁。
    // rotateDialogue用中心和绝对根坐标，resizeDialogue用起点相对位移，两种输入不可互换。
    // 右栏角度字段与鼠标共享同一rotation值，没有另存一份图标角度。
    // 因而手柄旋转后右栏即时回填，撤销也会同时还原图形和数值。
    // 手柄处的鼠标样式只是提示，不承担按键状态，真实捕获仍在父g节点。
    // 即使指针离开圆形区域，父g已捕获当前指针，因此旋转可连续进行。
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
  // pointerup、pointercancel和lostpointercapture可能先后到达同一个手势。
  // 清空drag在onEnd之前，使第二个结束事件不再次压入同一份起点。
  // cancel目前保留最后已显示位置并提交一次历史，不伪装回到起点。
  // 因此若用户要恢复，仍能按一次撤销取回真正的手势前画稿。
  // 结束不清除选择，鼠标松开后右侧属性应继续指向刚移动的实例。
  // 这里没有document监听，所以不需要跨页面删除一个全局pointerup回调。
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

// 文字区域按模板比例计算，与外部画片保持相同的变换层级。
// 每层使用自己的clipPath id，两个气泡不会借用对方的裁切框。
// 横排显式设置textLength，让预估字格宽与实际SVG渲染保持一致。
// 空行不输出text节点，但其索引仍占一行，保留手动分段。
// 竖排每字独立定位并保持正向，不把中文整体旋转90度。
// 每列从右往左推进，符合传统竖排漫画阅读顺序。
// 字距只改变字内间距，行高决定行或列之间的距离。
// 对齐同时影响横排起点或竖排列内起点，不改变列的阅读方向。
// overflow只裁切可见部分，原文保存在图层中供用户调整。
// 系统回落与十种内置字体均由当前Chromium绘制，内置字体随导出嵌入。
// 不使用foreignObject，避免包含HTML的SVG在PNG转换时污染画布。
// opacity作用在整组文字，与底框的图层透明度一致。
// 用户的引号、尖括号、换行均由React按文本处理。
// textAnchor负责左中右定位，不能用CSS text-align代替SVG文本锚点。
// 总行高居中到安全区，减少短对白贴到模板上沿的问题。
// 常见中英文混排使用字格估算，不声称提供复杂印刷字形排版。
// 长文需要用户改字号或模板宽度，界面会显示明确的溢出提醒。
// 本组件不修改文档，布局变化只改变渲染结果，不生成额外撤销步骤。
export function DialogueText({ layer, verticalTemplate }: { layer: DialogueLayer; verticalTemplate: boolean }) {
  // clipPath的矩形仍在模板坐标系里，与文字和图形共同被外层scale缩放。
  // clip id使用实例UUID，不能用templateId，否则两份同款模板会引用同名DOM片段。
  // defs在作品SVG内部，序列化时也被复制，不依赖页面其他隐藏SVG中的定义。
  // pointerEvents=none保证用户点击字时命中整层，而非进入一个没有拖动回调的text。
  // 横排的anchor与x配套设置：start靠左、end靠右，middle在安全区中心。
  // 只有textAnchor变化而x保持不动，会使所谓右对齐实际跑到框外。
  // 基线以0.85倍字号近似，不把SVG的y误当文字上边缘。
  // y方向先减去全部行高的一半，短句和多行都以安全区中点为基准。
  // 空行虽不产生text节点，但index仍参与后续y计算，因此中间留白不会消失。
  // textLength明确使用字格估算宽度，lengthAdjust让同一估算控制显示与换行。
  // ASCII和中文宽度不同，不能把string.length乘同一个常量当全部正文宽度。
  // 竖排每个字符单独输出，英文也按格竖放，不提供复杂的竖排英文旋转规则。
  // 竖排列x递减，所以先输出的列在右侧，符合当前模板的日漫阅读方向。
  // 列内的对齐重新计算y，左对齐选项在竖排语义中对应靠顶部。
  // 行高决定列中心的横向间隔，字距决定列内纵向字符间隔。
  // 字色取图层当前值，不能重读模板默认色覆盖用户刚选择的颜色。
  // 图形alpha在image上、文字alpha在g上各应用一次，不能在共同父层再乘一遍。
  // text节点不带HTML富文本样式；英文字体缺中文字形时由系统字体离线兜底。
  // 若要升级排版算法，应修改共享layoutDialogue并同时核对SVG与导出，不另写Canvas字排。
  const { box, size, gap, lines } = layoutDialogue(layer, verticalTemplate), step = size * layer.lineHeight;
  const vertical = layer.direction === "vertical", anchor = layer.align === "left" ? "start" : layer.align === "right" ? "end" : "middle";
  return <g fill={layer.color} opacity={layer.opacity} data-dialogue-font={layer.fontId} fontFamily={dialogueFontFamily(layer.fontId)} fontSize={size} clipPath={`url(#clip-${layer.id})`} pointerEvents="none">
    <defs><clipPath id={`clip-${layer.id}`}><rect {...box} /></clipPath></defs>
    {lines.map((line, index) => vertical ? Array.from(line).map((char, row) => <text key={`${index}-${row}`} textAnchor="middle" x={box.x + box.width - step * (index + .5)} y={box.y + (layer.align === "center" ? (box.height - line.length * (size + gap)) / 2 : layer.align === "right" ? box.height - line.length * (size + gap) : 0) + size * .85 + row * (size + gap)}>{char}</text>) : line && <text key={index} textAnchor={anchor} x={box.x + (layer.align === "left" ? 0 : layer.align === "right" ? box.width : box.width / 2)} y={box.y + (box.height - lines.length * step) / 2 + size * .85 + index * step} textLength={Array.from(line).reduce((sum, char) => sum + size * (/^[\x20-\x7e]$/.test(char) ? .6 : 1), 0) + Math.max(0, line.length - 1) * gap} lengthAdjust="spacingAndGlyphs">{line}</text>)}
  </g>;
}

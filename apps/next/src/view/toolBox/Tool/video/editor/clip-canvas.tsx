"use client";

// 节目画布只适配单个片段：真实媒体在裁切层，操作选框在独立交互层。
import { useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { useTranslation } from "@/i18n";
import { defaultTransform, fittedSize, type ClipTransform } from "./clip-transform-model";
import type { EditorMediaAsset, EditorPreviewClip, EditorPreviewProject } from "./editor-panels";
import styles from "./editor.module.css";
import { ClipCropOverlay, type CropEdit } from "./clip-crop-overlay";

// 外层仍拥有工程确认值；组件只把拖动意图回报，不另存一份片段工程。
// preview传完整候选用于即时画面与X/Y联动，commit只在松手时真正写工程。
// cancel扔掉候选，确认值没有被改过，所以Escape不需要执行反向移动命令。
// select只选画布对应实例，不定位时间，也不选择素材库中的原文件。
// locked拒绝开始与提交，selected只决定选框显示，不能决定叠放优先级。
// 当前只有一个媒体层，没有通过提高选中z-index冒充多轨合成。
export interface CanvasEdit {
  crop?: CropEdit;
  selected: boolean; locked: boolean; value: ClipTransform;
  select: () => void; preview: (value: ClipTransform | null) => void; commit: (value: ClipTransform) => void;
}
// 组件children是已经挂载的真实媒体内容，父层控制src和解码，不在画布层重建播放器。
// 可选edit意味着只读渲染仍可采用同一构图几何，静态图片样板无需复制CSS矩阵。
// 源查看不使用该层，保持原始contain预览，不将工程参数应用到素材原件。
// project提供像素尺和宽高比；clip提供身份与确认变换；asset提供源的基础尺寸。
// 这三类数据分别来自项目、安排、素材，不能把它们合成一个可随意改写的大对象。
// clip.id决定生命周期，同源不同安排切换时旧手势必须结束。
// 操作按钮是独立覆盖层，所以播放器不会因为指针焦点而变成可编辑输入框。
// plane只拆分绘制与操作职责，三种模式仍使用唯一canvasStyle和手势换算。
// 默认all保留静态图片样板调用，不要求旧调用方重新装配两层。
// picture用于合成内容栈，不生成能抢指针的操作按钮。
// operations用于独立操作栈，不渲染video或img，因此不会重复解码。
// 两个平面读取同一个edit.value，属性草稿不会使选框和画面落在不同位置。
// 两者的测量框均铺满项目frame，换算不包含标题和播放器控制栏。
// 内容裁切与操作提示分离，选框越过项目边界时仍可辨认。
// 锁层按钮不参与鼠标命中，继续显示内容，但不能拦截下方可编辑片段。
// 锁层从键盘Tab路径排除，时间线仍可以明确访问其身份。
// 透明度零时指针放行，用户可从时间线恢复该片段透明度。
// plane不是业务类型开关，素材查看不调用画布操作适配器。
// 操作标记与内容标记分开，自动回归不会把两个平面误数成两份媒体。
// 既有指针捕获、Escape和窗口resize取消机制继续统一使用。
// 位置数据仍是项目像素中心，拆平面不能把它改为DOM左上角。
// 选中状态仅产生细边框，不给内容提高层级。
interface CanvasProps { clip: EditorPreviewClip; asset: EditorMediaAsset; project: EditorPreviewProject; edit?: CanvasEdit; children?: ReactNode; plane?: "all" | "picture" | "operations"; }
// 复用同一手势对象保留按下时的原变换与抓取位置，不能每次move累加屏幕误差。
// 两平面读取同一项目尺寸，因此窗口缩放不会使画面和操作层使用不同坐标原点。
// 拖动取消时只丢弃候选，不提交反向位移来假装恢复。
// 锁在拖动中改变会触发既有取消，松手不能把锁前候选写回确认值。
// 操作层卸载同样释放pointer capture，不留下全局鼠标监听。
// 画面平面没有edit按钮，却继续读取草稿value，因此直接拖动时真实帧同步移动。
// 图片静态样板使用默认all，所以旧调用无需知道多视频合成的分层装配细节。
// 键盘焦点只进入可编辑操作目标，锁定与隐藏内容不抢快捷键。
// 透明层不参与鼠标拾取，但它的时间线ID仍有效，不等于从工程删除。
// 当前没有自由变形手柄，plane参数不能被误读成缩放手柄已实现。
interface CanvasGesture { pointer: number; element: HTMLElement; x: number; y: number; factorX: number; factorY: number; origin: ClipTransform; candidate: ClipTransform; }

// 百分比只从项目坐标计算，因此窗口宽度变化不会改写X/Y确认值。
// 如960项目像素在1920工程中总是50%，画布缩成600px也仍在正中央。
// 基础尺寸只contain源画面一次；scale再乘在基础宽高上，避免contain叠两次。
// 旋转绕自身中心，位置仍是项目坐标中的中心，不能用旋转后包围盒反推X/Y。
// 透明度只用于真实内容层，操作边框保持可见，零透明也能找回当前选中对象。
// 不读取DOM尺寸来推导数据，屏幕比例仅在手势开始时用于反算位移。
// CSS中的left/top指向内容盒中心所在的项目百分比，再用translate移回半个盒宽高。
// translate(-50%,-50%)使用自身大小，不能改成项目的一半或窗口的一半。
// rotate与均匀缩放顺序不会改变中心，但非等比变形不在本轮契约内。
// 这里把scale乘进宽高而不再加CSS scale，避免真实内容放大两次。
// 旋转后的命中包围盒由浏览器计算，不能拿它反推基础适配宽高。
// 元数据存在时优先真实显示尺寸；静态图片可使用StaticImageData的原始宽高。
// 字符串封面没有可信尺寸时采用项目比例安全回退，不能解析URL猜源宽高。
// 图片导入尚未接通，静态图片渲染边界与正式真实视频回归分开报告。
// 不透明度不放进通用style结果，因为相同几何也要给可见操作层复用。
// 内容opacity为0时选框仍可见，用户能通过属性把透明画面恢复。
// 选框细线不占布局宽度，不会把百分比坐标挤成另一个实际中心。
// CSS transform-origin固定center，旋转不会让位置参数变成左上角坐标。
// 按百分比渲染能自然跟随窗口与分隔条尺寸变化，不额外监听DPR改数据。
// 项目像素与CSS像素不混用，也不根据getBoundingClientRect结果重写transform。
// 镜像只应用到实际内容层的scaleX，位置选框不改变项目坐标方向。
// 旋转先围绕画面中心进行，X/Y始终表示项目中的同一个中心点。
// 宽高沿用contain基础适配，镜像不会把竖视频强制拉伸到横项目全幅。
// 内容层裁在项目边界内，操作选框位于独立交互层，避免手势反馈被裁掉。
// 上层缩小时留出的空间是真实透明区域，下层解码视频可以从中露出。
// 不透明度应用到每层实际媒体像素，黑色背景只属于最底部项目画布。
// 选中框不会写入内容，也不参与未来导出画面的契约。
// 从素材模式查看源时不套用这个工程构图，仍看到原始文件画面。
function canvasStyle(value: ClipTransform, asset: EditorMediaAsset, project: EditorPreviewProject): CSSProperties {
  const size = fittedSize(asset.metadata?.width ?? (typeof asset.cover === "object" ? asset.cover?.width : undefined) ?? project.width, asset.metadata?.height ?? (typeof asset.cover === "object" ? asset.cover?.height : undefined) ?? project.height, project);
  return { left: `${value.x / project.width * 100}%`, top: `${value.y / project.height * 100}%`, width: `${size.width * value.scale / project.width}%`, height: `${size.height * value.scale / project.height}%`, transform: `translate(-50%, -50%) rotate(${value.rotation}deg)` };
}

// 拖动像平移桌面上的一张照片，不论照片转了多少度，屏幕向右仍对应项目X增大。
// 因此使用画布比例换算全局位移，不能用旋转后的对象矩形当尺子。
// 起点保留鼠标抓住照片的偏移，绝不把照片中心吸到鼠标下面。
// 位置限制与属性字段一致；保留两位小数是项目值精度，不是屏幕像素取整。
// 允许出界，只在最终画面裁切；禁止出界会让用户无法做常见的局部构图。
// factor在本手势开始时固定；画布尺寸若改变则由生命周期取消，不能继续用旧尺子。
// 起点value在按下瞬间复制，因此每次move都从同一个原中心加完整位移。
// 不能用上一次候选加本次总位移，否则鼠标移动十像素会被重复累加多次。
// X和Y分别使用项目宽/屏幕宽与项目高/屏幕高，不能假设两者永远同一个数。
// 常规项目frame保持比例，这两个系数应接近；分别计算可以抵御亚像素舍入差。
// 屏幕坐标用clientX/clientY，与frame矩形相同参照，不掺入系统窗口装饰偏移。
// frame左上已反映居中黑边，位移算法不再额外减一次预览表面的留边。
// 因为只算差值，点击时抓取偏移自动保持，不需要逆旋转求鼠标局部坐标。
// 例如指针抓在右上角，再向右移动192项目像素，画面中心也只增加192。
// 照片转30度或缩50%仍应得到相同项目位移，不能被旋转包围盒宽度放大误差。
// 候选位置保留其他三个字段，不在每次move时重新contain或清空透明度。
// 坐标允许负值和越过项目宽高，画布边界只是最终裁切而非拖动范围限制。
// 只有数值安全范围会夹限到十万，范围与属性输入一致，防止无穷CSS百分比。
// 两个小数位足以表达项目亚像素位置，不把屏幕整数坐标等同于项目整数像素。
// 松手会再用最后坐标计算一次，浏览器没有发最后move时仍能提交正确终点。
function gestureValue(gesture: CanvasGesture, x: number, y: number): ClipTransform {
  const round = (value: number) => Number(Math.max(-100000, Math.min(100000, value)).toFixed(2));
  return { ...gesture.origin, x: round(gesture.origin.x + (x - gesture.x) * gesture.factorX), y: round(gesture.origin.y + (y - gesture.y) * gesture.factorY) };
}

// 只为当前片段捕获手势，媒体节点作为children始终保留，不把视频换成封面来拖动。
// 裁切层独立overflow:hidden，旋转或移出项目的真实像素不会画到项目边界以外。
// 选框是另一个无媒体的按钮层，截图导出能力没有接通，也不会把选框当画面像素。
// 交互层允许溢出frame，外侧预览表面仍负责工作区边界；选框不被内容裁切层切掉。
// pointer捕获保证鼠标离开画面后仍能松手提交，Escape和系统取消都保留旧构图。
// 关闭页面、换片段、锁轨或改变画布尺寸会结束旧手势，不留下全局键盘监听。
// frameRef测量的是整个项目相框，不是当前已经缩放或旋转的内容。
// 相框包括项目黑场，源画面可能只占其中一部分，但项目坐标尺始终不变。
// canvasRoot绝对铺满frame，所以基础left/top百分比不包含标题、控制条或边栏。
// 真实内容通过children保留引用，字段变化只更新样式，不调用load或替换src。
// 因此构图不应改变当前视频帧、播放位置、静音状态或媒体readyState。
// 画面外的操作反馈来自另一层，不会被canvasCrop的overflow隐藏。
// 整个预览表面仍限制工作区外溢，不能让选框覆盖应用导航或窗口按钮。
// 当对象大部分移出画布，仍可通过属性数字和重置找回，不新增自由变形手柄。
// 没有添加旋转手柄，旋转只由复用字段提交，符合本轮不做自由变形的边界。
// 没有canvas像素绘制或getImageData处理用户视频，避免建立另一套解码和采样流程。
// 视频继续由Chromium渲染，裁切和二维变换由同一DOM几何完成。
// 这是一层真实单源变换，不是上方视频轨覆盖下方视频轨的合成器。
// 选框显示与轨道顺序没有任何关联，不能用选中高亮改变未来叠放规则。
export function ClipCanvas({ clip, asset, project, edit, children, plane = "all" }: CanvasProps) {
  const { t } = useTranslation(), frameRef = useRef<HTMLDivElement>(null), gesture = useRef<CanvasGesture | null>(null);
  const value = edit?.value ?? clip.transform ?? defaultTransform(project), style = canvasStyle(value, asset, project);
// 先清gesture引用再释放捕获，因为release可能同步触发lostpointercapture。
// 若先释放再清引用，lost事件可能第二次取消同一草稿，形成重复状态写入。
// 没有活跃手势时取消应是无动作，正常主题刷新不能清空其他对象的候选。
// 移除草稿由edit.preview(null)完成，工程确认值从未被中间move改写。
// 不执行反向transform意味着取消不会覆盖手势期间外部已经确认的新值。
// 释放捕获前检查hasPointerCapture，避免系统已取消后再释放抛DOMException。
// 捕获元素可能已被卸载，清理仍使用当初保存的元素引用，不重新查另一按钮。
  function cancel() {
    const active = gesture.current;
    gesture.current = null;
    if (!active) return;
    if (active.element.hasPointerCapture(active.pointer)) active.element.releasePointerCapture(active.pointer);
    edit?.preview(null);
  }
  // effect只拥有当前画布的取消边界，所有回调都读取本次实际手势。
  // 依赖对象、锁和确认变换，切换对象或字段提交不能继续拖动旧草稿。
  // 不依赖每次变化的edit对象，否则每帧候选更新都会把自己取消掉。
  // preview回调仅清候选，清理时不提交工程，也不重新选择素材。
  // ResizeObserver初次通知只建立基准，真正尺寸变化才结束手势。
  // blur覆盖切换到其他程序；系统pointercancel也走同一保留确认值流程。
  // Escape监听限于活跃手势，平时不会抢属性输入框的Escape恢复行为。
  // 元素移除时先释放捕获，迟到的pointerup不能把已取消候选写回来。
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let size = "";
    const observer = new ResizeObserver(() => { const box = frame.getBoundingClientRect(), next = `${box.width}:${box.height}`; if (size && next !== size) cancel(); size = next; });
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape" && gesture.current) { event.preventDefault(); event.stopPropagation(); cancel(); } };
    observer.observe(frame); window.addEventListener("blur", cancel); window.addEventListener("keydown", key, true);
    return () => { observer.disconnect(); window.removeEventListener("blur", cancel); window.removeEventListener("keydown", key, true); cancel(); };
    // 候选变化不重装订阅；锁/对象/确认值变化必须结束旧手势。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.id, clip.transform, edit?.locked]);
  // 取消选中才终止手势；从未选中变为选中是按下画面的正常动作。
  // 若把selected放进上面effect的清理依赖，首次点击会刚捕获就被自己取消。
  // 独立检查失选可兼顾“点击选中后继续拖”和“外部切换对象后放弃旧草稿”。
  useEffect(() => {
    if (!edit?.selected) cancel();
    // cancel读取当前捕获，只在选择身份变化时执行，候选更新不重装订阅。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit?.selected]);
// 只接主键，右键不能改构图或抢走现有片段菜单的意图。
// 锁轨在手势起点就拒绝，不给用户一个最后才回弹的假移动反馈。
// frame宽高为零时不开始手势，隐藏页面或正在布局时不能除零得到无限坐标。
// preventDefault阻止浏览器选择视频或执行默认拖图片行为，画布用pointer而非HTML文件拖放。
// 因此不会生成时间线MIME载荷，也不会被外部Files导入流程误识别为新素材。
// focus使用preventScroll，避免按钮边界在画布外时浏览器自动滚动造成视觉抖动。
// 选中动作不调用播放头定位，用户可以在当前真实帧上调整画面。
// origin复制当前确认或候选值，后面不修改父组件传入的对象。
// 指针ID记录在gesture，一个无关触点不能接管另一次鼠标操作。
// setPointerCapture由真实pointerdown触发，捕获失败不会通过伪造属性蒙混成真实拖动。
  function down(event: PointerEvent<HTMLButtonElement>) {
    if (!edit || edit.locked || event.button !== 0) return;
    const box = frameRef.current?.getBoundingClientRect();
    if (!box?.width || !box.height) return;
    event.preventDefault(); edit.select(); event.currentTarget.focus({ preventScroll: true });
    gesture.current = { pointer: event.pointerId, element: event.currentTarget, x: event.clientX, y: event.clientY, factorX: project.width / box.width, factorY: project.height / box.height, origin: { ...value }, candidate: { ...value } };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
// 只接受本次pointerID，系统额外触点和迟到事件都不改变当前候选。
// 锁表变化后即使还没收到清理通知也先停止更新候选。
// candidate同时存在于本次手势引用与外层预览草稿，松手不依赖React是否已画完最后一帧。
// 预览回调会刷新字段显示，但不调用工程提交，因此工程时长和源区间都不变。
// 不能直接把event对象保存在状态中，React事件生命周期不应延长到松手以后。
// 这里仅保存数值，不保存DataTransfer、File或完整媒体对象。
  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId || edit?.locked) return;
    active.candidate = gestureValue(active, event.clientX, event.clientY);
    edit?.preview(active.candidate);
  }
// 先保存当前手势引用再清全局槽位，后续lost捕获不会误取消刚提交的构图。
// 最后坐标重新换算，避免释放发生在两个pointermove之间时丢失末端位置。
// 先结束临时预览再提交确认值，二者在同一事件批次，不显示回原处再跳到终点。
// 提交前再次查看locked，防止拖动中途被锁定还按旧权限写入。
// 工程命令还会复核锁与身份，组件层只是提前提供交互保护。
// pointercancel不走这里，系统中断必须保留原确认值而非提交当前候选。
// 拖动松手不改变selectedClip以外的任何安排，复制对象不被连带位移。
  function up(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    gesture.current = null;
    const candidate = gestureValue(active, event.clientX, event.clientY);
    if (active.element.hasPointerCapture(active.pointer)) active.element.releasePointerCapture(active.pointer);
    edit?.preview(null);
    if (!edit?.locked) edit?.commit(candidate);
  }
// sourceIn以只读数据属性提供源区间观测，不能通过改DOM属性写回工程。
// 该值服务真实媒体映射与验收，不影响百分比构图或时间线位置。
// 相同源的两个层可能有不同入点，不能只比较currentTime就宣称两层失步。
// 图层同步必须先扣各自sourceIn，再加工程start比较同一节目时间。
  return <div ref={frameRef} className={styles.canvasRoot} data-clip-canvas={plane !== "operations" ? clip.id : undefined} data-canvas-operations={plane === "operations" ? clip.id : undefined} data-source-in={clip.sourceIn ?? 0} data-transform={JSON.stringify(value)}>
    {/* 节目画面：真实video/img位于唯一裁切层，构图不改变媒体src和解码生命周期。 */}
    {plane !== "operations" && <div className={styles.canvasCrop}><div className={styles.canvasContent} style={{ ...style, transform: `${style.transform} scaleX(${clip.mirrored ? -1 : 1})`, opacity: value.opacity / 100, clipPath: clip.crop ? `inset(${clip.crop.top * 100}% ${clip.crop.right * 100}% ${clip.crop.bottom * 100}% ${clip.crop.left * 100}%)` : undefined }} data-canvas-content>{children}</div></div>}
    {/* 操作选框：只控制当前单源片段，不改变轨道优先级，也没有自由变形手柄。 */}
    {plane !== "picture" && edit && <button type="button" data-canvas-selection={edit.selected} data-canvas-locked={edit.locked} className={styles.canvasSelection} style={{ ...style, pointerEvents: edit.locked || value.opacity === 0 ? "none" : undefined }} tabIndex={edit.locked ? -1 : 0} aria-label={t("toolBox.editorUi.canvasSelect")} aria-disabled={edit.locked} onClick={edit.select} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel} />}
    {plane !== "picture" && edit?.crop && !edit.locked && <ClipCropOverlay key={clip.id} style={style} crop={clip.crop} rotation={value.rotation} mirrored={clip.mirrored} edit={edit.crop} />}
  </div>;
}

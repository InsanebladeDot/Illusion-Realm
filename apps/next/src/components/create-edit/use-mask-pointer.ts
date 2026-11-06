"use client";

/**
 * 画布指针适配：坐标由实际显示矩形转换成自然像素。
 * pointer capture 保证鼠标移出画布仍能完成一笔，取消则回滚本笔。
 * 视图平移只更新 CSS 位移，不产生蒙版或 RGB 像素。
 */
import { useRef, type PointerEvent, type RefObject } from 'react';
import { t } from '@/i18n';
// 所有笔刷裁切读取已完成选区，拖动中的草稿不能变成绘制限制。
// 反选保留图片矩形边界，不允许画到图像外的点状工作区。
// 旧数组路径不能表达 inverted，必须使用统一契约。
import { pixelSelectionPath } from '@/utils/image-editor';
import { useMaskGesture } from './use-mask-gesture';
import { useMaskWorkspaceStore } from '@/stores/use-mask-workspace-store';
import { rememberMask, restoreMask, type MaskDocument, type MaskSnapshot } from '@/utils/mask-document';
import { brushStamp, fillMaskRegion, paintSegment, type MaskPoint } from '@/utils/mask-paint';

// 每次按下固定本笔参数，拖动期间切换 UI 不会改变半条笔迹的语义。
// doc 身份也必须固定，迟到的 pointerup 不能写入另一张新导入图片。
// pan 不持有 stamp 或像素快照，避免仅移动视图就消耗大图历史内存。
// id 用于区分鼠标与触控指针，第二指不能继续第一指的笔迹。
// before 是本笔之前的快照，系统取消时恢复并移除该历史条目。
// erase 固定于 down 时，避免一次路径前半绘画、后半突然擦除。
// stamp 是离屏小画布，每一笔结束后释放引用供垃圾回收。
// layer 固定于 down 时，设置面板切层不能把正在拖动的一笔拆到两层。
// spacing 与 stamp.width 一起决定原像素步长，不依赖显示比例。
// last 在平移模式是 client 坐标，在绘制模式是原图坐标。
interface Stroke { id: number; doc: MaskDocument; last: MaskPoint; stamp: HTMLCanvasElement | null; layer: 'mask' | 'painted'; erase: boolean; spacing: number; before?: MaskSnapshot }

/**
 * 缩放后的坐标反解同时覆盖系统 DPR 和页面缩放，不能乘设备像素比。
 * canvas 属性尺寸是自然像素，client 矩形才是当前 CSS 显示尺寸。
 * pointerdown 只接受主按钮，右键和触控第二指不开始新笔迹。
 * fill 和 select 在按下时完成，一个点击只记录一条历史。
 * draw/paint 自动切到对应层，erase 尊重用户选中的层。
 * 绘制到隐藏层时自动显示该层，让用户能立即看见刚画的结果。
 * busy 及任务锁同时检查，不能只依赖外层按钮的禁用外观。
 */
// 几何工具先尝试接管，避免套索点击同时产生一枚蒙版印章。
// 只读通道的守卫在down最前面，预览PNG不能被当成文档层修改。
// 正常画笔与几何工具各持有自己的活动手势，两者通过布尔返回值互斥。
// 捕获保证画布外抬起仍能收尾，但不允许外部down开始一笔。
// 未导入或导入中不获取像素上下文，避免对旧图进行半次编辑。
// 同一笔的layer固定，设置面板修改目标层只影响下一笔。
// 同一笔的stamp固定，opacity/hardness修改不会追溯重算已经盖下的颜色。
// 平移使用client差量，画笔使用原图点坐标，二者不能混为相同单位。
// 父组件在CSS中移动图像，getBoundingClientRect已经反映这份位移。
// 因此point不再手动减offset，否则放大后会双重扣除位置。
// 撤销只在down记录一次，move可以触发多次revision而不增加快照。
// 首个印章在同起终点绘制，后续重复位置必须在move守卫过滤。
// 该边界能避免半透明点击在pointerup被再盖一次而变得过强。
// 路径插值返回最后实际落笔点，未满spacing的余量留给下个事件。
// 选区clip在每次实际绘制前应用，上下文恢复后不会污染其他工具。
// 一笔跨出选区时仍保持鼠标捕获，但选区外内容不得改变。
// 颜色填充属于单击动作，和连续笔迹的stamp路径分开处理。
// 填充读取当前图片合成而非显示缓冲，蒙版提示色不构成色块边界。
// 平移没有before快照，移动图片不会消耗真实像素操作的撤销名额。
// 取消画笔恢复三层同一快照，不能只撤回mask留下painted半条笔迹。
// 结束前核对pointerId，第二设备的抬起不能结束第一笔。
// 文档身份不同的move直接丢弃，导入新图不接受迟到的旧坐标。
// 页面返回重建hook时不会复活旧capture，像素由store继续保留。
// 锁定检查既在UI也在down入口，脚本触发事件不能绕过任务期间保护。
// 显示层与导出层分开，Canvas重绘不会擦除文档中的实际笔迹。
// 图层自动显示使当前落笔可见，但导出仍按固定通道含义读取各层。
// 工具名称来自类型union，不能依赖中文标签判断擦除或涂抹分支。
// 所有尺寸取真实canvas属性，与系统DPR无额外乘除关系。
// 局部画布hook不调用Electron桥接，原图字节不会因手动绘画被上传。
// 像素失败使用既有翻译，页面不暴露异常堆栈或文件路径。
// 返回事件对象只包含安全React处理器，不向外提供私有图层引用。
// 用户可在任务完成后继续修改同一文档，运行输入已由队列冻结。
// 缩放发生在父视图，pointerhook无需持有第二份zoom状态。
// 同一套输入逻辑服务圆笔、方笔和擦除，避免三个控件出现坐标漂移差异。
// 触控默认滚动被touch-none和preventDefault共同约束，避免一笔拖动整页。
// 右键只保留视图行为，不提交内容、不创建历史。
export function useMaskPointer(canvas: RefObject<HTMLCanvasElement | null>, locked: boolean, pan: (dx: number, dy: number) => void) {
  // active 不进入 React state，移动事件不因异步渲染丢掉最后落笔位置。
  // 同一次事件回调读取 store.getState，避免旧闭包中的 doc 或工具值滞后。
  // DOMRect 已包含 CSS 位移，坐标换算不需要再减一次平移量。
  // canvas.width 是实际像素数，除以 rect.width 得到显示到像素比例。
  // 同样的笔刷在 100% 和 50% 显示下都覆盖相同原像素直径。
  // 不乘 devicePixelRatio；那会把高 DPI 上的画笔位置推离鼠标。
  // 选择框只影响clip，指针坐标仍由完整图像的显示矩形换算。
  const active = useRef<Stroke | null>(null), gesture = useMaskGesture(locked);
  const point = (event: PointerEvent<HTMLCanvasElement>): MaskPoint => { const rect = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - rect.left) * event.currentTarget.width / rect.width, y: (event.clientY - rect.top) * event.currentTarget.height / rect.height }; };
  const down = (event: PointerEvent<HTMLCanvasElement>) => {
    const state = useMaskWorkspaceStore.getState(), doc = state.doc; if (!doc || state.channel !== 'painting' || state.busy || locked || active.current || event.button !== 0) return;
    // 阻止默认触控滚动和拖拽选中，使一次手势只由当前工具处理。
    // pointer capture 让抬起即使发生在画布外也能收尾。
    // 捕获不代表允许多指同时画，active 门闩已在入口排除第二笔。
    // 非主按钮直接返回，右键不会误产生蒙版或填充。
    if (gesture.down(event)) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const pos = point(event), layer = state.tool === 'paint' ? 'painted' : state.tool === 'draw' || state.tool === 'select' ? 'mask' : state.layer;
    // 实际绘制层自动显示，用户能看到操作效果；导出语义不因显隐改变。
    // draw/select 都选择 mask，paint 选择 painted，其他工具沿用当前层。
    // 更新层选择不创建历史，内容操作才需要 undo。
    // pan 沿用层只是保留偏好，本身不会访问任何像素写入函数。
    state.patch({ layer, visible: { ...state.visible, [layer]: true } });
    try {
      // 平移分支不创建大图快照，频繁移动不会挤掉真实编辑的撤销历史。
      // 捕获起点使用屏幕 CSS 像素，位移可直接累加到 transform。
      // fill/select 是单击动作，不建立持续笔迹，也不等待 pointerup 才执行。
      // 填充始终连通，选择工具尊重用户设置的全图/连通范围。
      // fill 的 toggle 只对已有蒙版生效，RGB 绘画仍保持填色含义。
      if (state.tool === 'pan') { active.current = { id: event.pointerId, doc, last: { x: event.clientX, y: event.clientY }, stamp: null, layer, erase: false, spacing: 1 }; return; }
      if (state.tool === 'fill' || state.tool === 'select') { state.mutate(value => fillMaskRegion(value, pos, layer, state.brush, state.tolerance, state.tool === 'fill' || state.contiguous, state.tool === 'fill')); return; }
      // 记录历史后再盖首章，撤销应回到本笔之前而不是第一点之后。
      // stamp 的透明度和硬度已冻结，后续 move 只做位置插值。
      // before 引用历史中的只读快照，取消时不再复制一次大图。
      // 首个零距离盖章保证鼠标单击也产生一个点。
      // 捕获之后的异常仍由 catch 显示，不能变成未处理浏览器错误。
      rememberMask(doc); const stamp = brushStamp(state.brush, layer === 'mask'), erase = state.tool === 'erase';
      active.current = { id: event.pointerId, doc, last: pos, stamp, layer, erase, spacing: state.brush.spacing, before: doc.past.at(-1) };
      // 统一路径同时支持矩形、椭圆和自交套索的奇偶填充。
      // 单次 save/restore 避免裁切泄漏到下一笔或导出阶段。
      // 笔刷透明度仍由既有 stamp 冻结，不从选区颜色推断。
      const context = doc[layer].getContext('2d')!; context.save(); if (state.selection) context.clip(pixelSelectionPath(state.selection), 'evenodd');
      paintSegment(doc[layer], stamp, pos, pos, state.brush.spacing, erase); context.restore(); state.refresh();
    } catch { state.patch({ error: t('create.maskEditor.exportFailed') }); }
  };
  // 一次 move 可能跨过多个像素，用固定间距补点避免快速涂抹出现断线。
  // 当前文档被替换时立即丢弃旧事件，引用不一致不能靠尺寸相等放行。
  // 光标移动只刷新显示；一笔的历史已经在 down 阶段记录。
  // pan 使用 client 差值，位移单位是屏幕 CSS 像素，不随画笔比例改变。
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    // 接收移动前重新核对文档身份，换图不能把旧坐标写进新画布。
    // 当前 pointerId 必须匹配 capture 拥有者，其他设备的 hover 被忽略。
    // 同一笔移动只增加显示版本，不追加历史，内存使用与事件数量无关。
    // pan 返回前不刷新文档 revision，缩略图和导出不会因移动而失效。
    if (gesture.move(event)) return;
    const stroke = active.current; if (!stroke || stroke.id !== event.pointerId || stroke.doc !== useMaskWorkspaceStore.getState().doc) return;
    if (!stroke.stamp) { pan(event.clientX - stroke.last.x, event.clientY - stroke.last.y); stroke.last = { x: event.clientX, y: event.clientY }; return; }
    // 相同坐标的 move/up 不重复盖章，否则单击会把 50% 强度累加成 75%。
    // 初始印章只由 down 负责，移动只有达到实际位移才进入插值。
    const next = point(event); if (next.x === stroke.last.x && next.y === stroke.last.y) return;
    // move 与 down 必须共用相同选区解释，不能只有首个点尊重反选。
    // 实时读取当前状态，Escape 清除选择后不继续用旧 clip。
    // 旧文档身份检查在前，像素与路径始终属于同一幅图。
    const context = stroke.doc[stroke.layer].getContext('2d')!, selection = useMaskWorkspaceStore.getState().selection; context.save(); if (selection) context.clip(pixelSelectionPath(selection), 'evenodd');
    stroke.last = paintSegment(stroke.doc[stroke.layer], stroke.stamp, stroke.last, next, stroke.spacing, stroke.erase); context.restore(); useMaskWorkspaceStore.getState().refresh();
  };
  // pointercancel 的含义是输入被系统取消，回滚本笔比留下半条更可预期。
  // 正常抬起提交最后一段，再释放捕获；lost capture 不重复执行回滚。
  // 结束时仅触碰本次拥有的 pointerId，多指事件不能结束另一笔。
  // 快照弹出与恢复成对执行，撤销列表不会保留已经取消的操作。
  const end = (event: PointerEvent<HTMLCanvasElement>, cancel: boolean) => {
    // 取消使用操作前快照，但正常结束不再重放第一枚印章。
    // 同坐标的抬起由 move 守卫过滤，低透明度不会无故累加。
    // 先清 active 再释放 capture，后续事件不能重复收尾同一笔。
    // hasPointerCapture 保护系统已经回收捕获的情况。
    // cancel 的 pop 只移除当前笔起点，保留更早的用户操作。
    // 画布引用可能已经被卸载，此时不能对不存在的 DOM 调释放方法。
    if (gesture.end(event, cancel)) return;
    const stroke = active.current; if (!stroke || stroke.id !== event.pointerId) return;
    if (cancel && stroke.before) { restoreMask(stroke.doc, stroke.before); stroke.doc.past.pop(); useMaskWorkspaceStore.getState().refresh(); } else if (!cancel) move(event);
    active.current = null; if (canvas.current?.hasPointerCapture(event.pointerId)) canvas.current.releasePointerCapture(event.pointerId);
  };
  return { onPointerDown: down, onPointerMove: move, onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => end(event, false), onPointerCancel: (event: PointerEvent<HTMLCanvasElement>) => end(event, true), onLostPointerCapture: (event: PointerEvent<HTMLCanvasElement>) => end(event, true) };
}

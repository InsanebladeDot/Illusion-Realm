"use client";
/**
 * 新几何/修饰工具的指针适配，画笔基础事件通过返回值判断是否被接管。
 * 套索只创建选择，裁剪只创建待确认矩形，二者拖动不改图像内容。
 * 模糊在按下时冻结输入并记录一次历史，取消恢复同一笔之前的快照。
 */
import { useRef, type PointerEvent } from 'react';
import { useMaskWorkspaceStore } from '@/stores/use-mask-workspace-store';
import { rememberMask, restoreMask, type MaskDocument, type MaskSnapshot } from '@/utils/mask-document';
import { blurredPixels, blurStroke, cropBounds, type PixelPoint } from '@/utils/image-editor';
import { t } from '@/i18n';
// 选择工具共享边界夹取、轮廓与有效性校验，拖动时不生成像素遮罩。
// crop 复用矩形建区；已有形状通过显式入口保留到确认阶段。
// 完成选区与 draft 分开，Delete 不能使用未闭合轮廓。
import { clampSelectionPoint, commitSelection, selectionOutline, type PixelSelection, type SelectionTool } from '@/utils/image-editor';

// id/doc 共同固定一次手势身份，迟到的事件不能写到新导入的图片。
// points 保存当前形状轮廓；套索移动未达到半像素时不累积重复顶点。
// blurSource 是当前笔冻结的图，避免反复模糊已处理的结果。
// before 只有会写像素的模糊需要，几何拖动不创建大图历史。
// priorSelection 允许系统取消时恢复用户之前的选择。
// radius/size 在按下时冻结，不在一笔中途随面板更新。
// 选择和裁剪不计入像素历史，确认操作才记录 undo。
// 手势对象属于一次pointer capture，不能被另一根手指覆盖。
// 活动几何手势直接消费第二次down，普通画笔也不能趁机开始另一个笔迹。
// 文档引用用于隔离异步导入，尺寸相同的不同图片仍必须视为不同目标。
// currentTarget矩形包含显示缩放和平移，转换后才进入几何或滤镜算法。
// 套索顶点没有CSS单位；旋转须映射旧路径，裁剪后则建立新文档坐标。
// last用于过滤重复顶点，不是实际裁剪矩形的固定右下角。
// 几何操作的历史在显式确认时建立，拖动预览不消耗大图快照。
// 模糊必须即时写像素，因此在down阶段记录before并冻结blurSource。
// 取消与正常结束共享同一身份核对，不能结束另一设备当前手势。
// 捕获已被系统回收时不再释放，避免正常取消路径额外抛异常。
// 错误说明由中文词条提供，不把Canvas内部堆栈展示给用户。
// 手势结束清除active引用，冻结的大图滤镜缓冲才有机会被回收。
// blur 之外都属于选区拖动，tool 在按下时冻结不随工具按钮变更。
// priorSelection 是完整契约，系统取消恢复时不能丢掉反选状态。
// 草稿只包含临时点，最终提交才创建有效 PixelSelection。
interface Gesture { id: number; doc: MaskDocument; tool: SelectionTool | 'blur'; start: PixelPoint; last: PixelPoint; points: PixelPoint[]; priorSelection: PixelSelection | null; blurSource?: HTMLCanvasElement; before?: MaskSnapshot; size: number }
// DOMRect 包含滚动和视图位移，坐标只需按属性像素比例反解一次。
// devicePixelRatio 不参与换算，否则高 DPI 下会产生双倍偏移。
// 捕获期间坐标可以在画布外，由 cropBounds 和 Canvas clip 处理边界。
// 坐标转换不读取window宽度，nav开合后仍以画布实际边界为准。
// 矩形已经包含平移，不需要重复扣除宿主offset。
// 自然像素位置可以是小数，套索顶点保留这些精度。
// 显示倍率不参与导出，坐标转换只用于确定当前笔迹落点。
// cropBounds会夹取越界矩形，模糊则由Canvas裁切。
// 指针捕获范围大于画布也不意味着允许扩展文档尺寸。
// 读取currentTarget而非event.target，避免嵌套目标影响换算。
// 本函数只计算位置，不改变工具、图层或历史。
// 如果宿主隐藏画布，入口守卫负责不开始新手势。
// 文档大小来自canvas属性，不能拿CSS宽高充当图像尺寸。
// 不同DPR设备上的相同相对点击应落在相同原像素。
// 不以鼠标速度或移动事件数量改变自然坐标。
// 选择回放从原坐标重绘，缩放后轮廓仍指向同一区域。
// 状态中的选区使用相同坐标契约，滤镜和蒙版转换无需再次缩放。
// 几何变换由宿主同步选区，指针换算不承担路径变换或历史导航。
// 普通视图缩放不应清除用户已圈定的主体。
function position(event: PointerEvent<HTMLCanvasElement>): PixelPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  // 捕获越界仍限制自然坐标，工作区圆点不属于图片选区。
  // DPR 不参与，实际 CSS 矩形已包含用户缩放和平移。
  // 夹取保留小数，低倍率的椭圆边缘仍能抗锯齿。
  return clampSelectionPoint({ x: (event.clientX - rect.left) * event.currentTarget.width / rect.width, y: (event.clientY - rect.top) * event.currentTarget.height / rect.height }, event.currentTarget.width, event.currentTarget.height);
}
// 选择边线和裁剪框直接写入工作区状态，其他预览读同一份坐标。
// 几何反馈不调用 refresh，不作废已有 PNG 导出。
// 套索至少三个点才形成有效闭合区域，简单点击不会误全选。
// 模糊与 painted 图层相同，原图和生成 mask 均不被改写。
// 每笔复用一次滤镜结果，不在 move 内做全图高斯。
// 画布外的移动不会改变像素尺寸，只有显式确认裁剪才改尺寸。
// 手势末尾补采样使鼠标抬起点不会漏掉最后一段。
// 裁剪预览每次读取原手势起点，拖动中途反向不会把上个矩形当作新起点。
// 套索路径按采样顺序追加，不排序顶点，否则主体轮廓会被连错。
// 相邻点距离不足半像素时跳过，减少同位置事件造成的无效数组增长。
// 发布选区使用数组副本，下一次push不会静默修改上一版React状态。
// 模糊笔迹连续连接last到next，不只处理当前一个孤立圆点。
// 刷新在写入颜色后发生，缩略图不会先看到新revision再读到旧像素。
// 几何预览不调用refresh，已有导出Blob仍代表最后一次实际内容。
// 最终确认通过store进入历史，advance本身没有破坏性裁剪。
// 手势中的doc被冻结，位置只能作用这次捕获对应的素材。
// 每次move的last更新发生在处理之后，异常不应偷偷推进到未处理位置。
// 模式由down冻结，拖动中更改工具只影响下一次手势。
// 套索不自动上传或开始生成，闭合区域仍需用户显式转蒙版。
// 路径外部的点不改变文档宽高，越界只是预览几何的一部分。
function advance(gesture: Gesture, next: PixelPoint): void {
  const state = useMaskWorkspaceStore.getState();
  // 绘制中只发布 draft，几何确认前没有可删除的完成选区。
  // 半像素去重降低事件重复带来的点数，套索轨迹仍按输入顺序显示。
  // 矩形与椭圆从同一对角计算，反向拖动不会改变形状含义。
  // 模糊仍即时写像素，并使用按下时冻结的已完成选区。
  // Escape 已清 drawing 时停止更新，不能在下一次 move 又复活草稿。
  if (gesture.tool !== 'blur') { if(!state.selectionDrawing) return; if(gesture.tool==='lasso') { if(Math.hypot(next.x-gesture.last.x,next.y-gesture.last.y)>=0.5) gesture.points.push(next); } else gesture.points=selectionOutline(gesture.tool,gesture.start,next); state.patch({selectionDraft:[...gesture.points]}); }
  else if (gesture.blurSource) { blurStroke(gesture.doc, gesture.blurSource, gesture.last, next, gesture.size, gesture.priorSelection); state.refresh(); }
  gesture.last = next;
}

// 捕获后每个事件先核对文档，换图不会把旧拖动写入新文档。
// 工具锁与原画笔相同，运行队列期间不能改准备中的生成输入。
// 返回 true 表示事件已消费，普通画笔不应再落一个点。
// 异常先解除手势引用，后续移动不会沿用半初始化滤镜。
// 所有失败转为本地化信息，不输出 canvas 内部堆栈。
// 鼠标取消和 lost capture 共用回滚路径，正常结束先清 ref。
// down返回true表示本工具已经处理或占用事件，父hook必须立即返回。
// 返回false只表示此工具未接管，不表示当前事件应该写入任何图层。
// 套索点击不足三个不同点时没有选区，不能把空路径当作全图。
// 裁剪从任意方向拖动统一交给cropBounds，避免负宽高进入getImageData。
// 移动中的几何预览只patch状态，不调用refresh清掉用户已有导出。
// 模糊操作每次移动刷新revision，因为它确实改变了painted像素。
// 半径和直径在手势开始时读取，拖动过程中不重新采样面板设置。
// blurSource只计算一次，事件频率不同不会改变高斯处理的源图。
// 已有套索作为本次模糊clip，拖到选择之外也不能修改外部像素。
// 模糊开始时自动显示painted，避免图层隐藏导致用户以为工具失效。
// 计算滤镜先于remember，分配失败不会凭空增加一条可撤销记录。
// 系统取消恢复before后移除该笔历史，其前一条用户编辑仍保留。
// 正常pointerup只补末点，不再重复执行完整手势。
// 取消套索恢复priorSelection，让临时失去捕获不会丢掉用户旧选择。
// 换图后结束旧手势只释放引用，不向新图写回旧selection或crop。
// 旧文档离开store后可能仍被事件持有，身份检查阻止其继续刷新新工作区。
// 坐标可以超出图像范围，Canvas clip和cropBounds分别负责像素边界。
// 显示缩放不会改变半像素采样门槛，因为比较的是自然像素坐标。
// 选择路径实时克隆数组交给store，后续push不会无通知修改已发布的状态。
// 父hook负责主按钮和只读通道检查，本hook补充活动手势与文档锁。
// 同一hook实例的active只存在ref里，React渲染不会重新创建正在拖动的状态。
// 所有Canvas异常都在手势边界消费，不产生未处理的异步拒绝。
// 本工具没有服务器副作用，取消手势不应调用取消生成的IPC。
// 页面卸载由浏览器结束pointer capture，像素草稿仍由工作区store持有。
// 几何动作不自动触发生成，用户确认裁剪后仍需显式点击运行。
// 读写使用当前store动作，不能依赖首次render闭包里的revision。
// preview与最终crop使用同一个矩形对象，确认后的尺寸可独立核对。
// 工具切换只影响下一次down，已开始的一笔保持原先tool语义。
// 多指输入尚无手势缩放功能，额外指针被忽略而不是解释成另一个画笔。
// 所有失败仍允许用户重新选择工具或撤销，不清掉源文档。
// 结束先清ref后release，lostpointercapture不会把刚完成的一笔再取消。
// 本hook不负责导出，生成时读取文档最新像素的职责留给提交边界。
export function useMaskGesture(locked: boolean) {
  const active = useRef<Gesture | null>(null);
  const down = (event: PointerEvent<HTMLCanvasElement>): boolean => {
    const state = useMaskWorkspaceStore.getState(), tool = state.tool, doc = state.doc;
    if (active.current) return true;
    // 椭圆与矩形由几何入口接管，不能漏入普通画笔分支落下一个点。
    // 主按钮和只读通道仍由父指针守卫检查，不放宽任务锁。
    // 锁定只限制修改，不改变已有选择或显示缩放。
    if (!doc || locked || state.busy || !['rectangle','ellipse','lasso', 'crop', 'blur'].includes(tool)) return false;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const point = position(event), gesture: Gesture = { id: event.pointerId, doc, tool: tool as Gesture['tool'], start: point, last: point, points: [point], priorSelection: state.selection, size: state.brush.size };
    try {
      // 计算滤镜先于记历史，计算失败不留下假的撤销入口。
      // 几何模式只清当前选框，不清原蒙版或 painted。
      // 模糊自动显示 painted，防止在隐藏层修饰看起来无效。
      if (tool === 'blur') { gesture.blurSource = blurredPixels(doc, state.blurRadius); rememberMask(doc); gesture.before = doc.past.at(-1); state.patch({ visible: { ...state.visible, painted: true } }); }
      // 开始新形状替换旧区，但不删像素；取消可恢复此前完整选区。
      // 首个点立即显示，连续 move 显示未闭合路径。
      // drawing 是动作守卫，尚未松开时菜单与 Delete 均不可执行。
      else state.patch({ crop:null,selection:null,selectionDraft:[point],selectionDrawing:true });
      active.current = gesture; if (tool === 'blur') advance(gesture, point);
    } catch { active.current = null; state.patch({ error: t('create.maskEditor.exportFailed') }); }
    return true;
  };
  // move 不重新猜测当前工具，保持按下时的手势语义。
  // 第二根手指不能结束或修改第一根手指的拖动。
  // 文档替换后的手势丢弃，不向新文档回放旧坐标。
  const move = (event: PointerEvent<HTMLCanvasElement>): boolean => {
    const gesture = active.current; if (!gesture) return false;
    if (gesture.id !== event.pointerId || gesture.doc !== useMaskWorkspaceStore.getState().doc) return true;
    try { advance(gesture, position(event)); } catch { useMaskWorkspaceStore.getState().patch({ error: t('create.maskEditor.exportFailed') }); } return true;
  };
  // 正常结束补终点，取消则恢复像素和原有选区。
  // 先清 ref 再释放 capture，lost capture 不会再次回滚刚提交的操作。
  // 只移除当前模糊笔对应的快照，更早的历史保持不变。
  // 无有效裁剪框时仍可退出手势，不对原图做隐式裁剪。
  // 取消选择不触发导出刷新，因为从未改过图像内容。
  // DOM 捕获可能已被系统回收，释放前检查当前所有权。
  const end = (event: PointerEvent<HTMLCanvasElement>, cancel: boolean): boolean => {
    const gesture = active.current; if (!gesture) return false; if (gesture.id !== event.pointerId) return true;
    if (gesture.doc !== useMaskWorkspaceStore.getState().doc) { active.current = null; return true; }
    // 只有正常抬起且 drawing 仍有效才提交；Escape 后的迟到抬起无操作。
    // 非共线校验拒绝一点和直线，不能把它们当作全图或裁剪依据。
    // 系统取消恢复旧区，用户主动 Escape 已经清除 drawing 因而保持取消。
    // crop 拖动产生普通矩形选区，显式确认才调用像素裁剪。
    // blur 回滚延续原先一次手势一次历史的语义。
    const state=useMaskWorkspaceStore.getState();
    if (!cancel) { move(event); if(gesture.tool!=='blur'&&state.selectionDrawing) { const selection=commitSelection(gesture.points,gesture.doc.original.width,gesture.doc.original.height); state.patch({selection,selectionDraft:null,selectionDrawing:false,crop:gesture.tool==='crop'&&selection?cropBounds(gesture.start,gesture.last,selection.width,selection.height):null}); } }
    else { if (gesture.before) { restoreMask(gesture.doc, gesture.before); gesture.doc.past.pop(); state.refresh(); } state.patch({ selection:state.selectionDrawing?gesture.priorSelection:state.selection,selectionDraft:null,selectionDrawing:false,crop:null }); }
    active.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); return true;
  };
  return { down, move, end };
}

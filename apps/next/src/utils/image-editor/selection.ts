/**
 * 统一矩形、椭圆、套索选区：保存自然像素轮廓和反选标志。
 * 所有消费者以同一奇偶路径裁切，虚线、删除与裁剪共享边界。
 * 不持有 DOM、主题或缩放；像素操作由宿主记录历史。
 */
import { pixelCanvas, pixelContext, type PixelPoint, type PixelRect } from './canvas';

// width/height 是建立选区时的文档自然尺寸，绝非显示矩形。
// points 不包含工作区外坐标，选区不会选中图片周围的点状底板。
// inverted 只交换图片内外，不能把无限工作区解释为选区。
// 所有形状转为轮廓，后续删除和滤镜不再分三套实现。
// readonly 防止下一帧 pointermove 静默改写已提交的选区顶点。
// 工具切换不改变尺寸，只有裁剪和旋转会建立新的坐标系。
// 选区不含颜色，主题切换或蒙版显示色不会改变选中范围。
export interface PixelSelection { points: readonly PixelPoint[]; inverted: boolean; width: number; height: number }
// 拖动中的轮廓和有效选区分开；未抬起时不允许破坏性操作。
// 矩形和椭圆记录两角，套索则按输入顺序保留采样点。
// crop 仍是唯一工具入口，没有新增三种裁剪模式。
export type SelectionTool = 'rectangle' | 'ellipse' | 'lasso' | 'crop';

// 捕获指针可以移到图片外；自然坐标在此限制在文档边界。
// 保留小数用于抗锯齿，不提前把低倍率指针粗暴取整。
// 屏幕缩放与 DPR 已在调用处反解，这里不能再次乘比例。
export function clampSelectionPoint(point: PixelPoint, width: number, height: number): PixelPoint {
  return { x: Math.max(0, Math.min(width, point.x)), y: Math.max(0, Math.min(height, point.y)) };
}
// 角点顺序固定绕轮廓一圈，反向拖动得到相同几何。
// 椭圆用 96 个边界样本统一成路径；原像素坐标不会随缩放变化。
// 不是智能吸边，也不将套索用户轨迹替换成最短路算法。
// 返回临时轮廓供实时虚线显示，是否有效由提交函数判断。
// 椭圆采样角度均匀分布，首尾由共用 Path2D 闭合补齐。
// 矩形使用边界坐标，宽度为零的手势后续会被面积校验拒绝。
// 输出数组不共享上次拖动的引用，React 可观察到轮廓更新。
// crop 使用相同矩形轮廓，不在拖动阶段裁掉任何像素。
export function selectionOutline(tool: SelectionTool, from: PixelPoint, to: PixelPoint): PixelPoint[] {
  const x = Math.min(from.x, to.x), y = Math.min(from.y, to.y), w = Math.abs(to.x-from.x), h = Math.abs(to.y-from.y);
  return tool === 'ellipse' ? Array.from({ length: 96 }, (_, i) => ({ x: x+w/2+Math.cos(i*Math.PI/48)*w/2, y: y+h/2+Math.sin(i*Math.PI/48)*h/2 })) : [{ x, y }, { x: x+w, y }, { x: x+w, y: y+h }, { x, y: y+h }];
}
// 先去掉相邻重复点，单击和直线不会误创建可删除的区域。
// 用任意非共线三点判定面积，不用有符号总面积误拒绝自交套索。
// 奇偶自交路径仍有有效区域；后续 raster 使用同样填充规则。
// 非共线叉积至少为一个平方像素，即对应三角面积至少半像素。
// 返回 null 必须意味着无操作，不得回退为全图选中。
// 套索绘制中的开放轮廓不调用此函数，不能提前获得有效面积状态。
// 输入数组保留只读约束，去重建立新数组，不改原手势的采样记录。
// 面积阈值使用平方像素，与屏幕像素或设备 DPR 无关。
// 非法线段返回空选择后，菜单禁用与执行层空值守卫同时生效。
// 轮廓超过边界被投影回边缘，不为文件增加透明外边框。
// 本校验不做语义主体识别，也不会为手绘轮廓自动添加细节。
// 点先夹取再判断，完全落在图片边界外的移动不能制造额外区域。
// 返回的宽高锁定当前像素缓冲，反选不会把图片外的点阵算入范围。
// 末点允许重复起点，常见手绘闭合不会因首尾相同被整体拒绝。
// 极小非共线轮廓也要达到面积门槛，避免误触生成破坏性选区。
// 自交轮廓的部分有向面积可能抵消，故不使用鞋带总和判定。
export function commitSelection(points: readonly PixelPoint[], width: number, height: number): PixelSelection | null {
  const clean = points.map(p => clampSelectionPoint(p, width, height)).filter((p,i,a) => !i || Math.hypot(p.x-a[i-1].x,p.y-a[i-1].y)>=0.5), a=clean[0], b=clean[1];
  return a && b && clean.some(p=>Math.abs((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))>=1) ? { points: clean, width, height, inverted: false } : null;
}
// 反选在图片矩形与轮廓之间使用 evenodd；包括已有孔洞与自交。
// 正常轮廓先建完整路径，闭合线只连接末点和起点。
// 这一规则就是自由套索端点的直线闭合，不承诺边缘识别。
// path 同时供虚线、clip 和遮罩填充，避免预览与实际删区分叉。
// 图片边框在反选时也绘出轮廓，明确选区包含图像外沿。
// 空轮廓不会被调用者解释成全图；有效性由提交入口先守住。
// 路径对象每次重建，不积累前一次缩放的线宽或上下文状态。
// 路径用自然边界坐标，反选框与图像本身完全重合。
export function pixelSelectionPath(selection: PixelSelection): Path2D {
  const path = new Path2D(), points=selection.points; if (selection.inverted) path.rect(0,0,selection.width,selection.height);
  if (points.length) { path.moveTo(points[0].x,points[0].y); points.slice(1).forEach(p=>path.lineTo(p.x,p.y)); path.closePath(); } return path;
}
// 遮罩仅在操作确认时分配，不在 pointermove 每帧生成整图位图。
// 白色 alpha 表示选中覆盖，透明表示保留；颜色没有业务意义。
// 浏览器抗锯齿只作用在边界，内部和外部保持完全选择或不选择。
// 反选通过同一路径产生，不用手写另一套点包含算法。
export function selectionCoverage(selection: PixelSelection): HTMLCanvasElement {
  const canvas=pixelCanvas(selection.width,selection.height), context=pixelContext(canvas); context.fillStyle='#fff'; context.fill(pixelSelectionPath(selection),'evenodd'); return canvas;
}
// 用实际覆盖的 alpha 求最小整数包围框，反选可能仍覆盖整图。
// 不直接使用顶点边界，反向选区的包围框与原轮廓通常不同。
// 零覆盖返回 null，确认裁剪时不生成零尺寸 PNG。
// 扫描仅发生在显式裁剪确认，拖动时不做逐像素读回。
// 右边界和下边界采用排他端点，差值可直接作为缓冲宽高。
// 非矩形边缘的部分 alpha 计入框内，避免丢失抗锯齿轮廓。
// 反向选择可能仅在四角有覆盖，仍正确返回整幅图片包围框。
// 保留部分抗锯齿像素，不能把椭圆的边缘硬截掉一圈。
export function selectionBounds(selection: PixelSelection): PixelRect | null {
  const {width,height}=selection, data=pixelContext(selectionCoverage(selection)).getImageData(0,0,width,height).data; let x=width,y=height,right=0,bottom=0;
  for(let row=0;row<height;row++) for(let col=0;col<width;col++) if(data[(row*width+col)*4+3]) { x=Math.min(x,col); y=Math.min(y,row); right=Math.max(right,col+1); bottom=Math.max(bottom,row+1); }
  return right>x && bottom>y ? { x,y,width:right-x,height:bottom-y } : null;
}
// 几何变换同步映射轮廓与画布尺寸，翻转不会抛弃选区。
// 坐标是像素边界：镜像使用 width-x，而不是采样点的 width-1-x。
// 顺时针旋转交换自然宽高；逆时针由宿主连续调用三次。
// inverted 不变，翻转原图不会把选区含义变成反选。
// 变换不修改旧对象，取消或历史导航不会看到被隐式改写的轮廓。
// 宿主保证图像像素同时执行同方向变换，不能单独调用来移动选区。
// 非矩形与矩形都按点映射，镜像结果不会重新近似成包围框。
// 反选边界由新的宽高重建，不残留旋转前的水平尺寸。
export function transformSelection(selection: PixelSelection, mode: 'rotate' | 'flipX' | 'flipY'): PixelSelection {
  const {width,height}=selection; return { ...selection, width:mode==='rotate'?height:width, height:mode==='rotate'?width:height, points:selection.points.map(p=>mode==='rotate'?{x:height-p.y,y:p.x}:mode==='flipX'?{x:width-p.x,y:p.y}:{x:p.x,y:height-p.y}) };
}

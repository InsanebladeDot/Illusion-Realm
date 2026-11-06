/**
 * 几何编辑：套索选区转蒙版，以及真正改变三层像素尺寸的裁剪。
 * 本模块不保留历史；宿主必须在修改前记录一次文档快照。
 * 不使用 CSS clip 或隐藏溢出模拟裁剪，导出不包含框外像素。
 * 原始 File 由宿主保留读取元数据，不参与编辑导出。
 */
import { pixelCanvas, pixelContext, type PixelLayers, type PixelPoint, type PixelRect } from './canvas';
// 共享形状路径使选区转蒙版与 Delete、裁剪使用相同奇偶规则。
// 旧点列表算法不再作为页面选区的第二份事实来源。
// selection 不包含主题或屏幕倍率，生成仍读取原图像素。
import { pixelSelectionPath, type PixelSelection } from './selection';

// 左上角向下取整，右下角向上取整，框线间触及的像素都会保留。
// 支持任意拖动方向，反向拖动不返回负宽高。
// 坐标先夹取再计算，鼠标移出画布也不会读取非法范围。
// 最少两像素才构成裁剪，单击不会意外把整张图片裁成一点。
// null 表示没有有效操作，宿主不应因此清掉文档。
// 输入尺寸来自文档缓冲，不能传经过缩放的 DOMRect。
// 预览和提交共用边界算法，防止框线与实际结果不一致。
export function cropBounds(from: PixelPoint, to: PixelPoint, width: number, height: number): PixelRect | null {
  const x = Math.max(0, Math.floor(Math.min(from.x, to.x))), y = Math.max(0, Math.floor(Math.min(from.y, to.y)));
  const right = Math.min(width, Math.ceil(Math.max(from.x, to.x))), bottom = Math.min(height, Math.ceil(Math.max(from.y, to.y)));
  return right - x >= 2 && bottom - y >= 2 ? { x, y, width: right - x, height: bottom - y } : null;
}
// 所有临时结果建立后才修改原层，避免中途读取已缩小的坐标系。
// getImageData 保留整数边界内字节，不通过 drawImage 比例插值。
// 三个层采用同一矩形，蒙版不会相对底图发生偏移。
// 改写尺寸真实删除框外绘图区域，不是视图遮挡。
// 宿主保留历史快照，所以删除区域仍可通过撤销恢复。
// 不重新生成 File，不破坏源图快速加载模型使用的元数据。
// 旋转或前次裁剪后的尺寸直接读取当前层。
// 仅接受 cropBounds 产生的矩形，不接受未经夹取的鼠标范围。
// 输入 rect 的 x/y 是当前文档坐标，绝对不能沿用裁剪前素材的显示位置。
// 三个 getImageData 都先完成，尺寸重置才开始，因此读取阶段失败不会裁掉任一层。
// 修改阶段若发生浏览器内存异常，宿主已有快照可供用户撤销。
// 目标 Canvas 保持原对象身份，现有订阅者不需要重新绑定三层引用。
// 尺寸赋值会重置 context 状态，后续画笔不能依赖此前设置过的 clip。
// putImageData 不使用全局 alpha，半透明蒙版覆盖率按字节保留。
// 原始 File 仍代表导入素材；当前像素输出必须读取裁剪后的层。
// 裁剪后旧套索坐标已失效，宿主在确认操作时将选择和临时框清空。
// 宽高改变会触发视图重新适应，但不会把 CSS 缩放烘焙进 PNG。
// 一条历史记录包含所有图层旧尺寸，因此撤销能恢复被删除的外部区域。
// 取消裁剪只丢弃 rect，不调用此函数，不会消耗像素历史。
// 这是实际缓冲裁剪，既不同于蒙版遮住区域，也不同于仅改变展示容器。
export function cropPixels(layers: PixelLayers, rect: PixelRect): void {
  const targets = [layers.original, layers.painted, layers.mask];
  const crops = targets.map(canvas => pixelContext(canvas).getImageData(rect.x, rect.y, rect.width, rect.height));
  targets.forEach((canvas, index) => { canvas.width = rect.width; canvas.height = rect.height; pixelContext(canvas).putImageData(crops[index], 0, 0); });
}
// 套索只是选择，显式执行此操作才将选中主体标为重绘区域。
// “选区转蒙版”覆盖旧蒙版，避免叠加未知旧笔迹。
// 白 RGB + alpha 与原画笔、导出器使用同一覆盖率契约。
// 边缘保留抗锯齿部分覆盖，不强制二值化。
// 临时层先绘制完整选区，再一次性写回。
// 画布外的套索顶点不扩大输出尺寸。
// RGB 层不变，提示色不会真正画到图片上。
// 少于三个点直接返回，空选区不是全选。
// 遮罩临时层初始透明，闭合路径内部才写入白色覆盖。
// 偶奇规则允许手绘套索自交，重复环绕不会把孔洞错误填满。
// 转换后原有蒙版被替换，这一语义由按钮明确触发并支持撤销。
// 本函数不更新 revision；宿主的统一 mutate 在成功后通知所有预览。
export function selectionToMask(layers: PixelLayers, selection: PixelSelection): void {
  if (selection.points.length < 3) return;
  const result = pixelCanvas(layers.original.width, layers.original.height), context = pixelContext(result);
  // 反选与椭圆同样可转蒙版，不回退成顶点的矩形包围框。
  // 只替换覆盖率层，RGB 与当前可编辑原图的透明度保持不变。
  // 临时层绘好后一次写回，半完成路径不会直接污染原 mask。
  context.fillStyle = '#ffffff'; context.fill(pixelSelectionPath(selection), 'evenodd');
  const target = pixelContext(layers.mask); target.clearRect(0, 0, result.width, result.height); target.drawImage(result, 0, 0);
}

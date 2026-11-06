/**
 * 浏览器像素编辑模块的基础契约，不依赖 React、Zustand 或业务词条。
 * 坐标始终是原图像素；显示缩放由宿主界面反向换算。
 * 调用者提供画布和错误边界，本模块不请求文件、网络或 Electron。
 * 模块只修改传入的层，撤销和任务调度由宿主统一管理。
 */
// 输入坐标可以带小数，以免缩小视图时光标只能跳到整数位置。
// 坐标不是归一化百分数，调用者必须先完成显示矩形到缓冲尺寸的换算。
// 本模块没有设备像素比假设；DPR 影响显示清晰度，不改变文档坐标系。
// PixelLayers 采用结构类型，已有蒙版文档无需复制即可交给此功能包。
// 三张画布的所有权仍属于宿主，函数不会自动清理或替换引用。
// 接口没有 File、URL 或磁盘路径，因此也不会处理源文件的生命周期。
// 自然宽高必须大于零；导入校验在分配图层前完成。
// 画布分配失败按浏览器异常向上传递，调用者不得用空图伪装成功。
// 该模块不建立隐藏的全局缓存，多个工作区可以使用各自独立的图层。
// 输出 Canvas 由调用方持有，引用释放后才能让浏览器回收其像素内存。
export interface PixelPoint { x: number; y: number }
// 三个图层具有相同尺寸，裁剪时必须作为一个文档一起提交。
// original 保留解码像素；painted 是用户新增或修饰后的颜色。
// mask 的 alpha 表示覆盖率，颜色展示由宿主自行决定。
export interface PixelLayers { original: HTMLCanvasElement; painted: HTMLCanvasElement; mask: HTMLCanvasElement }
// Rect 使用左上角和正整数尺寸，不接受 CSS 盒子的浮点宽高。
// cropBounds 负责从任意拖动方向计算合法的这类矩形。
// 超出图像的拖动会夹取到边界，不补画布或生成透明扩边。
export interface PixelRect { x: number; y: number; width: number; height: number }

// 只在浏览器交互期间调用，模块加载时不访问 document。
// 返回离屏画布，不挂入 DOM，也不继承页面主题和 CSS 尺寸。
// 先设尺寸再取 context，避免 resize 清空已经写入的内容。
export function pixelCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
}
// willReadFrequently 用于历史、选区和导出的像素读取场景。
// 获取失败必须抛错，交给宿主本地化，不能返回假成功的空画布。
// Error 不包含文件名、用户路径或输入图像内容。
export function pixelContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is unavailable');
  return context;
}
// 多边形用偶奇规则处理自交路径，手绘套索不会因为方向改变而翻转含义。
// 小于三个顶点不是闭合选区，调用者此时应保持之前的有效选区。
// closePath 补回起点，用户无需精确点中起始像素。
// 不执行 fill 或 clip，允许同一路径复用于预览、遮罩和滤镜。
// 路径顶点按传入顺序连接；这里没有自动主体识别或边缘吸附。
// 偶奇填充规则必须由使用路径的 fill/clip 调用者显式指定。
// Path2D 自身不保存填充规则，不能仅创建路径就认为自交语义已经确定。
// 路径不裁到文档边界，由目标 Canvas 的有效区域自然裁切。
// 预览可以设置虚线描边，输出和选择遮罩不应复制这些显示样式。
// 套索路径为独立对象，之后修改顶点数组不会追溯改变已创建的路径。
// 只有起点的输入也能创建路径，但不能据此推断存在可填充的选区。
// 选择是否有效由上层判断，底层只负责一致的几何描述。
export function selectionPath(points: readonly PixelPoint[]): Path2D {
  const path = new Path2D(); if (!points.length) return path;
  path.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach(point => path.lineTo(point.x, point.y)); path.closePath(); return path;
}
// 局部修饰先合成 RGB 层，避免只模糊透明 painted 看起来毫无效果。
// 原图层本身不变，处理结果放回 painted 以保留原图独立导出。
// 蒙版和显示色不参与颜色合成，预览紫色不会烘焙进真实图像。
// 默认 source-over 顺序使透明绘画区域仍透出原图。
// 合成目标使用独立 context，滤镜或擦除的旧合成模式不会泄漏进来。
// 此结果不叠加用户选择的蒙版显示色，也不应用反向 alpha。
// 需要透明重绘输入时应调用文档导出器，不能把 RGB 合成当作 mask PNG。
// 颜色读取遵循浏览器 Canvas 解码及合成规则，不声称实现额外色彩管理。
// 本函数同步执行，调用者应避免在鼠标每个移动事件中重复合成整张大图。
// 局部模糊在手势起点复用一份合成结果，保证处理输入稳定。
export function compositePixels(layers: PixelLayers): HTMLCanvasElement {
  const result = pixelCanvas(layers.original.width, layers.original.height), context = pixelContext(result);
  context.drawImage(layers.original, 0, 0); context.drawImage(layers.painted, 0, 0); return result;
}

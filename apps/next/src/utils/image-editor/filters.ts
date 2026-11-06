/**
 * 独立图像修饰：局部模糊笔刷和选区/全图高斯模糊。
 * 使用 Canvas 高斯滤镜，不引入第二个完整编辑器运行时。
 * radius 以源像素为单位，对应高斯标准差。
 * 显示缩放、DPR、蒙版叠加色均不参与输入。
 * 结果写 painted，original 仍可独立导出。
 */
import { compositePixels, pixelCanvas, pixelContext, type PixelLayers, type PixelPoint } from './canvas';
// 画笔与整图滤镜使用同一选区路径，椭圆/反选不降级为套索顶点。
// PixelSelection 中的尺寸是文档尺寸，滤镜不额外乘视图倍率。
// 没选区仍保持原来的整图或笔迹范围语义。
import { pixelSelectionPath, type PixelSelection } from './selection';

// 同一笔使用按下时冻结的合成图，抖动不会无限重复模糊。
// 宿主整笔复用结果，不在每个 move 重算全图。
// 标准差上限控制代价，下限防止零半径无效处理。
// 镜像扩边避免不透明图片四周产生透明暗边。
// 三倍标准差 padding 覆盖核的主要能量范围。
// 滤镜结果裁回原始大小，不为文档添加边框。
// 离屏缓冲不依赖页面可见性，不需要 rAF 等待。
// 新 context 隔离滤镜状态，不污染普通画笔。
// padding 是运算缓冲，不是用户图像的一部分，最终严格裁回原宽高。
// 相邻八个镜像块用于补足边缘采样，中心块保留源图实际方向。
// 扩边先完成再执行滤镜，避免先模糊得到透明边缘后再尝试填补。
// 高斯滤镜由当前 Chromium 实现，输出可能随浏览器版本出现细微差异。
// 回归验证颜色混合、角点和尺寸等不变量，不比较某版浏览器特有的全部浮点结果。
// 只有 sigma 经过限幅，调用者传入的文档层和笔刷直径不会在这里重设。
// 函数返回冻结的颜色结果，后续写入 painted 不改变当前笔的模糊源。
// 透明输入仍遵循 Canvas 的预乘合成限制，不能从全透明解码像素恢复隐藏颜色。
// 三张层不参与画布显示尺寸计算，缩放后模糊半径仍是相同自然像素数。
// 大图处理会分配多个缓冲，应由用户明确操作触发而不是在渲染期间运行。
// 滤镜失败应显示错误而非切到原图假装应用成功。
// 没有使用网络滤镜服务或上传素材，处理在渲染进程内完成。
export function blurredPixels(layers: PixelLayers, radius: number): HTMLCanvasElement {
  const source = compositePixels(layers), sigma = Math.max(0.5, Math.min(24, radius)), pad = Math.ceil(sigma * 3);
  const padded = pixelCanvas(source.width + pad * 2, source.height + pad * 2), context = pixelContext(padded);
  for (let row = -1; row <= 1; row++) for (let col = -1; col <= 1; col++) {
    context.save(); context.translate(pad + (col > 0 ? source.width * 2 : 0), pad + (row > 0 ? source.height * 2 : 0));
    context.scale(col === 0 ? 1 : -1, row === 0 ? 1 : -1); context.drawImage(source, 0, 0); context.restore();
  }
  const filtered = pixelCanvas(padded.width, padded.height), filter = pixelContext(filtered);
  filter.filter = 'blur(' + sigma + 'px)'; filter.drawImage(padded, 0, 0);
  const result = pixelCanvas(source.width, source.height); pixelContext(result).drawImage(filtered, pad, pad, source.width, source.height, 0, 0, source.width, source.height); return result;
}
// 模糊笔只写冻结结果，笔刷直径决定局部影响范围。
// 粗线采用圆端，快速移动不会留下段落间隙。
// 整条手势在宿主只记录一次 undo。
// 套索先裁切上下文，选区外像素不受影响。
// 蒙版覆盖率与局部修饰独立，不因模糊而改变。
// 没有触及的 painted 区域不修改。
// 原图不直接写入，保留独立原图导出语义。
// size 为原像素直径，此工具不另行模拟压力和流量。
// 局部遮罩与实际文档 mask 是两张不同的画布，不能复用同一对象。
// 遮罩的黑色 RGB 没有颜色含义，source-in 只使用它的覆盖面积。
// source-in 后的 patch 只在笔迹范围保留模糊后的颜色。
// 同一笔经过重叠区域时仍使用冻结源，效果不会随事件频率无限增强。
// 圆端和终点圆共同覆盖单击及有长度的拖动。
// 存在套索时 clip 先于绘制 patch，选区外的 painted 内容保持不变。
// 上下文恢复后不遗留路径裁切，下一支普通画笔可以使用不同选区。
// 该局部工具没有读取 mask.alpha，也不会更改重绘范围。
// 宿主在开始处理前保存一次快照，整条拖动而非每个点对应一次撤销。
// 系统取消输入时宿主还原该快照，不能仅停止移动留下半条修饰。
export function blurStroke(layers: PixelLayers, source: HTMLCanvasElement, from: PixelPoint, to: PixelPoint, size: number, selection: PixelSelection | null): void {
  const context = pixelContext(layers.painted); context.save();
  // 选区内外含义由统一路径决定，不能忽略 inverted 标志。
  // clip 只限定本笔写入，restore 后下一笔可以使用新的选择。
  // 图像层的自然尺寸与选区尺寸由宿主在几何变换时同步。
  if (selection) context.clip(pixelSelectionPath(selection), 'evenodd');
  const region = new Path2D(); region.moveTo(from.x, from.y); region.lineTo(to.x, to.y);
  // 临时遮罩将 stroke 转为面积，clip 本身不会读取 lineWidth。
  // 终点圆形让单击也能触发修饰。
  // 遮罩不进入文档 mask，因此不会意外请求额外重绘。
  const patch = pixelCanvas(source.width, source.height), target = pixelContext(patch);
  target.lineWidth = size; target.lineCap = 'round'; target.stroke(region); target.beginPath(); target.arc(to.x, to.y, size / 2, 0, Math.PI * 2); target.fill();
  target.globalCompositeOperation = 'source-in'; target.drawImage(source, 0, 0); context.drawImage(patch, 0, 0); context.restore();
}
// 全局滤镜与模糊笔使用同一个颜色合成和高斯实现。
// 无套索时处理全图，有套索时只替换多边形内部。
// 选区使用自然像素，几何变换后宿主同步映射轮廓和文档尺寸。
// 只读取一次输入，处理结果不会反馈到后续采样。
// 调半径不直接改图，点击应用才创建历史和输出。
// 蒙版不变，可以独立指定生成模型的重绘范围。
// 使用 Chromium 的滤镜，不承诺等同 Photoshop 色彩管理。
// 异常交由宿主恢复快照和显示翻译提示。
// 全图应用与局部笔刷共享 sigma 和边缘处理，避免两入口显示同名却采用不同滤镜。
// 带选区时 clearRect 同样受 clip 限制，选区外原 painted 不会被清空。
// 临时结果在清除目标前已建立，读取和写入不会互相反馈。
// 执行后图层尺寸不变，导出和工作流仍按当前文档的自然宽高处理。
// 原图独立通道不会体现 RGB 修饰；合成通道才显示此结果。
// 这与工作流继续使用原图加 alpha 的约定一致。
// 后续若要把 RGB 修饰送入生成，必须作为显式产品契约变更处理。
export function gaussianBlur(layers: PixelLayers, radius: number, selection: PixelSelection | null): void {
  const source = blurredPixels(layers, radius), context = pixelContext(layers.painted); context.save();
  // 同一选区也限制清除旧 painted，不能只限制绘入新滤镜结果。
  // 非矩形外像素保持原值，反选则交换这一范围。
  // 与局部笔刷使用相同 evenodd 规则，预览与处理不会出现孔洞差异。
  if (selection) context.clip(pixelSelectionPath(selection), 'evenodd');
  context.clearRect(0, 0, source.width, source.height); context.drawImage(source, 0, 0); context.restore();
}

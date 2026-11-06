/**
 * 显示通道合成：只操作预览 Canvas，不压缩 PNG，也不修改文档图层。
 * painting 用于可编辑 RGB 预览，其他通道按真实导出含义显示。
 * mask 是黑底白色覆盖，透明通道使用反向 alpha。
 * 预览可使用较小缓冲，实际导出始终交给原尺寸 PNG 编码器。
 */
import { maskCanvas, maskContext, type MaskLayers } from './mask-document';

// 类型与导出键一致，组件不用猜测文件名判断当前通道。
// painting 不包含显示色，主画布可以在合成完成后叠加蒙版提示。
// image 只读取原图，composite 同时读取 RGB 绘画。
// 通道名同时约束工作区选择、缩略图和导出 Blob 键，拼错在类型检查时失败。
// 只读通道不接受绘画，返回 painting 才能继续修改像素。
// 通道显示保留原纵横比，小缓冲只改变预览采样率。
// 原尺寸与缩略图可以使用同一绘制函数，不能分别猜测 alpha 的正反方向。
// 黑色遮罩背景只存在预览目标，不写回透明 mask 层。
// 显示棋盘或背景色由容器负责，不需要合成进图像。
// context.reset 同时清理画布和合成状态，使重复切换通道具有确定结果。
// 绘制失败由宿主边界处理，不返回可提交的空 PNG。
// 渲染过程不触发上传或任务入队，预览与生成的副作用明确分开。
// 生成输入固定选择文档导出的 composite，不跟随当前看到的通道。
// 因此用户查看黑白蒙版后点击生成也不会误上传黑白图作为原图。
// 独立导出只在显式点击时进行，平时缩略图不创建大体积 Blob。
// 蒙版显示透明度用于辅助观察底图，与实际笔刷 opacity 是不同参数。
// displayOpacity 不应进入导出编码，也不应修改工作流的 mask 强度。
// 每次叠加创建独立临时层，source-in 不会擦除源文档 mask。
export type MaskChannel = 'painting' | 'mask' | 'image' | 'composite';
// 调用前由宿主设置缓冲大小；drawImage 同步缩放三层保持对齐。
// gray mask 用黑背景加白 alpha，等价于导出灰度覆盖率。
// destination-out 只在临时预览移除 alpha，不会清除原图 RGB。
// 浏览器显示无法呈现全透明 RGB；逐字节正确性由 PNG 导出负责。
// context 每次重置，前一个通道的合成模式不泄漏到下一个。
// 生成任务从文档导出而非这里读取，选通道不会改变提交内容。
// 本函数无 URL 生命周期，编辑每一笔无需创建或撤销 Blob URL。
export function drawMaskChannel(target: HTMLCanvasElement, layers: MaskLayers, channel: MaskChannel): void {
  const context = maskContext(target), { width, height } = target; context.reset();
  if (channel === 'mask') { context.fillStyle = '#000000'; context.fillRect(0, 0, width, height); context.drawImage(layers.mask, 0, 0, width, height); return; }
  context.drawImage(layers.original, 0, 0, width, height);
  if (channel !== 'image') context.drawImage(layers.painted, 0, 0, width, height);
  if (channel !== 'painting') { context.globalCompositeOperation = 'destination-out'; context.drawImage(layers.mask, 0, 0, width, height); context.globalCompositeOperation = 'source-over'; }
}
// 编辑叠加只读取当前显隐、颜色和显示透明度，不写输出通道。
// 临时图使用主画布缓冲尺寸，缩略图无需分配原尺寸大图。
// mask RGB 保持白色，预览时才通过 source-in 着色。
// 原始图层的覆盖率不随面板透明度变化，生成结果仍一致。
export function drawMaskOverlay(target: HTMLCanvasElement, layers: MaskLayers, color: string, opacity: number): void {
  const overlay = maskCanvas(target.width, target.height), tint = maskContext(overlay), context = maskContext(target);
  tint.drawImage(layers.mask, 0, 0, target.width, target.height); tint.globalCompositeOperation = 'source-in'; tint.fillStyle = color; tint.fillRect(0, 0, target.width, target.height);
  context.save(); context.globalAlpha = opacity; context.drawImage(overlay, 0, 0); context.restore();
}

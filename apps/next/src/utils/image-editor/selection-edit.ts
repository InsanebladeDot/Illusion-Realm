/**
 * 选区像素动作：Delete 保持尺寸，裁剪保留形状并改变缓冲尺寸。
 * 只操作宿主已有三层，不写硬盘源文件、不压入独立历史栈。
 * 遮罩由统一选区路径生成；主题纹理和虚线不会混入任何结果。
 */
import { pixelContext, type PixelLayers } from './canvas';
import { cropPixels } from './geometry';
import { selectionBounds, selectionCoverage, type PixelSelection } from './selection';

// alphaMultiplier 使用同一覆盖字节，不会给矩形和套索不同删除语义。
// retain=true 保留选区，供非矩形裁剪把包围框内的角落变透明。
// 删除只影响 alpha，未选像素 RGB/alpha 都保持原字节。
// 三层同时处理，避免原图透明后仍显示独立绘画或紫色蒙版残影。
// 原始 File 仍保留元数据；改变的是当前可编辑位图副本。
// 调用前由 store 建立一次快照，循环不能为每个图层各记一次历史。
// putImageData 不依赖画笔遗留的 clip 或 globalCompositeOperation。
// alpha 是覆盖率乘积，原本半透明的像素不能被重新变为不透明。
// 逐层先读数据再写回，当前层的写入不改变共用 coverage。
// 对完全选中的内部 alpha 直接归零，未选区乘一保持原透明度。
// 反向选择使用同一个 coverage，不另行猜测图像主体或背景。
// 不填白或填黑，透明提示由展示 canvas 的 CSS 棋盘提供。
// 画布尺寸没有赋值，Delete 前后宽高严格相同。
// 编辑后的原图层与 painted 一同变透明，导出合成不会复活已删区域。
// mask 清掉同一区域的覆盖率，避免蒙版显示色覆盖真实透明预览。
export function deleteSelectionPixels(layers: PixelLayers, selection: PixelSelection, retain = false): void {
  const {width,height}=selection, coverage=pixelContext(selectionCoverage(selection)).getImageData(0,0,width,height).data;
  for(const canvas of [layers.original,layers.painted,layers.mask]) { const context=pixelContext(canvas), pixels=context.getImageData(0,0,width,height); for(let i=3;i<pixels.data.length;i+=4) pixels.data[i]=Math.round(pixels.data[i]*(retain?coverage[i]:255-coverage[i])/255); context.putImageData(pixels,0,0); }
}
// 先求实际覆盖包围框，空选区不裁、不把图片清成空白。
// 形状裁切先处理 alpha，再移除包围框以外的缓冲像素。
// 对反选返回整图尺寸是合法结果，不能强制套用原轮廓宽高。
// 没有第三套裁剪工具，所有形状都走这个确认路径。
// 图片像素和 mask 同时移动原点，后续生成不会出现通道错位。
// 像素历史由调用者管理，失败不会被 UI 伪装成成功导出。
export function cropSelectionPixels(layers: PixelLayers, selection: PixelSelection): void {
  const bounds=selectionBounds(selection); if(!bounds) return; deleteSelectionPixels(layers,selection,true); cropPixels(layers,bounds);
}

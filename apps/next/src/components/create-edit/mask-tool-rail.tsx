"use client";
/**
 * 图片编辑器左侧主工具栏，与应用全局 nav 完全独立。
 * 三种选区共享状态，裁剪保持唯一入口；保留所有已实现笔刷。
 */
import { Hand, SquareDashed, CircleDashed, Lasso, Crop, Brush, Paintbrush, Eraser, PaintBucket, Pipette, Droplets } from 'lucide-react';
import { useMaskWorkspaceStore } from '@/stores/use-mask-workspace-store';
import { useTranslation } from '@/i18n';
import { MaskToolButton } from './mask-tool-button';

// 工具按查看、选区、裁剪、绘画顺序呈现；没有未实现的对象识别入口。
// 矩形/椭圆图标表达选区，不拿对齐或镜像图标混充。
// select 保留已有选色蒙版功能，新的形状工具不覆盖它的含义。
// 所有 SVG 随主题使用 currentColor，暗色下不用额外图片资源。
// group 边界只画短分隔线，不重复创建第二个侧栏宽度。
const TOOLS=[{name:'pan',Icon:Hand},{name:'rectangle',Icon:SquareDashed},{name:'ellipse',Icon:CircleDashed},{name:'lasso',Icon:Lasso},{name:'crop',Icon:Crop},{name:'draw',Icon:Brush},{name:'paint',Icon:Paintbrush},{name:'erase',Icon:Eraser},{name:'fill',Icon:PaintBucket},{name:'select',Icon:Pipette},{name:'blur',Icon:Droplets}] as const;

// 工具栏宽 48px，36px 命中区；短视口可独立滚动访问最后一项。
// 工具选中态持久，hover 只产生反馈，不能替代 aria-pressed。
// 从 crop 切到别的工具只取消待确认裁剪，不悄悄裁掉图像。
// 已有有效选区进入 crop 保留原形状，而不是清成新矩形。
// 绘画层偏好沿用原规则，几何工具不切换 mask/RGB 的实际层。
// 只读通道选工具时回到可编辑图，避免用户以为画笔失效。
// 开始新工具不生成、不导出，模型参数和公共队列完全不受影响。
// 保留原图导入入口在顶部，工具栏不再重复放置第二个文件 input。
// 右侧四个通道是输出视图，与本栏工具状态属于不同维度。
// 点击工具回到 painting，但不清原图、RGB 绘画、mask 或历史。
// w-12 固定为局部工具宽度，图片放大不把它压成零宽。
// overflow-y-auto 确保 320px 或短窗口仍能找到模糊等后部工具。
// 名称提示由共享按钮 Portal 渲染，不被此处纵向滚动截断。
// 图标尺寸与 hit area 分离，增加可点范围不放大笔刷图形本身。
// 分组线只画在几个边界，不给每个工具添加重复的厚边框。
// 没有有效选区时进入裁剪只等待矩形手势，不立即裁掉整张图。
export function MaskToolRail({locked}:{locked:boolean}) {
  const state=useMaskWorkspaceStore(), {t}=useTranslation();
  // 单一工具入口负责切换，crop 的 shape 预览通过已有 store 动作建立。
  // drawing 已清零后迟到 pointerup 不得提交上一支套索。
  // 取消预览保留完成选区，用户仍可再进入裁剪或执行 Delete。
  const select=(name:typeof TOOLS[number]['name'])=>{ state.patch({tool:name,channel:'painting',crop:null,selectionDraft:null,selectionDrawing:false,...(name==='draw'||name==='select'?{layer:'mask' as const}:name==='paint'?{layer:'painted' as const}:{})}); if(name==='crop') useMaskWorkspaceStore.getState().action('startCrop'); };
  return <aside data-mask-tool-rail aria-label={t('create.maskStudio.tools')} className="flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto rounded-xl border border-border/70 bg-background/90 py-1.5">{TOOLS.map(({name,Icon},index)=><div key={name} className={index===1||index===4||index===5?'border-t border-border/60 pt-1':''}><MaskToolButton mode={name} name={t(`create.maskStudio.${name}`)} selected={state.tool===name} disabled={locked||state.busy||!state.doc} onClick={()=>select(name)}><Icon/></MaskToolButton></div>)}</aside>;
}

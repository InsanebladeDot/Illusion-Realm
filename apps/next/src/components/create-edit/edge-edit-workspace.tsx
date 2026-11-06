"use client";

/**
 * 边缘编辑使用已有 OpenCV Worker 与阈值控件，右侧复用控制生成参数。
 * 只提交转换结果 Blob；原图永远不能直接绕过 Canny 进入控制工作流。
 * 结果由输入身份校验，阈值或反转变化后旧结果立即不可提交。
 */
import { useState } from 'react';
import { useEdgeEditorStore } from '@/stores/use-edge-editor-store';
import { useCannyPreview } from '@/view/create/use-canny-preview';
import { CannyEnableToggle, CannyPreviewPanel } from '@/view/create/canny-preview-panel';
import { useAnimaEdit } from '@/hooks/use-anima-edit';
import { useTranslation } from '@/i18n';
import { ControlGenerationPanel } from './control-generation-panel';
import { cn } from '@/utils/cn';

/**
 * 转换中、导入中和禁用状态都锁定生成，不回退到旧文件。
 * 文件直接包裹 PNG 字节，不经 canvas 再编码造成反转或尺寸漂移。
 * width/height 来自同一源图，转换 Worker 保持原尺寸。
 * 队列会冻结这份文件，提交后调整下一次检测不会改变已排队输入。
 * 检测面板在任务期间禁用，停止仍通过共享会话按钮提供。
 * 窄屏按页内标签切换，但两侧保持挂载，状态不会因显示改变而丢失。
 */
// 边缘结果的有效性由输入身份决定，界面出现旧图片并不代表允许提交。
// 每次生成从当前结果Blob创建File，不能重新读取未反转的原文件。
// 不额外提供mask通道，edge模板只使用转换图的IMAGE输出。
// 源图片getter用于读取内嵌模型信息，和实际控制图上传具有不同用途。
// 窄屏切到参数页不终止Worker，返回后预览仍读取当前转换状态。
// 生成失败后的恢复由公共会话处理，布局只负责展示错误与重试入口。
// 宽屏的两栏断点依据内容容器宽度，nav开合也会参与可用空间变化。
// 父级没有通过覆盖层假装替换内容，工作区仍是main展示区域的实际子内容。
// 本组件没有文件写入权限，结果保存继续通过正式preload桥接。
export function EdgeEditWorkspace() {
  // canny hook 持有转换生命周期，路由草稿则存在独立 Zustand store。
  // useAnimaEdit 仅订阅共享会话，不因新增此页面创建第二条执行队列。
  // pane 仅控制窄屏布局；宽屏同时显示两区，不隐藏结果来规避拥挤。
  // 转换结果含原输入身份，新阈值计算开始时旧 blob 立即不可用。
  // 输出 File 直接使用 blob，不绘入临时 canvas，保证字节与预览一致。
  // 不使用原图 file 作为控制源，这一约束由实际上传字节回归检查。
  // loading 防止新图尚未解码时意外使用上一张图的结果。
  // processing 防止用户快速切换反转后提交旧结果。
  // enabled=false 时 hook 返回 result=null，因此暂停检测也同时禁止生成。
  // 任务冻结后由队列持有文件，界面销毁 Worker 不会取消已排队请求。
  // 生成错误由共享 runControl 捕获并写入表单，而不是未处理 Promise。
  // 模型加载 getter 读原始 File，检测后的 PNG 不带原图元数据。
  // 边缘模式从自己的 JSON 读取初值，不继承文字编辑 LoRA 与采样设置。
  // 模板草稿独立，生成阶段和公共任务门闩仍与其他编辑工具共用。
  const canny = useCannyPreview(), editor = useAnimaEdit('edge'), { t } = useTranslation(), [pane, setPane] = useState<'canvas' | 'settings'>('canvas');
  const generate = async () => { if (!canny.result || !canny.source || canny.loading || canny.processing || editor.busy) return; await editor.runControl(new File([canny.result.blob], 'edge.png', { type: 'image/png' }), canny.source.width, canny.source.height, 'edge'); };
  return <div data-edge-editor className="@container min-h-0 min-w-0 flex-1 overflow-y-auto"><div className="flex gap-2 p-2 @min-[880px]:hidden">{(['canvas', 'settings'] as const).map(value => <button key={value} type="button" data-edge-pane={value} aria-pressed={pane === value} onClick={() => setPane(value)} className="rounded-lg border border-border px-3 py-2 text-xs aria-pressed:bg-accent">{t(value === 'canvas' ? 'create.maskStudio.canvas' : 'create.maskStudio.settings')}</button>)}</div><div className="grid min-w-0 grid-cols-1 gap-3 p-3 @min-[880px]:h-full @min-[880px]:overflow-hidden @min-[880px]:grid-cols-[minmax(0,1fr)_344px]">
    {/* 宽屏左侧单独滚动，阈值和预览不会把右侧按钮挤出展示区。 */}
    {/* 窄屏按钮改变 pane，DOM 仍挂载，不会重新导入或重置反转。 */}
    {/* 原图移除与替换由 Canny hook 统一管理 URL，不在布局组件释放。 */}
    {/* fieldset 禁用真实输入元素，不仅添加半透明视觉状态。 */}
    {/* 原始图片预览和下载沿用既有检测面板，避免功能搬迁丢失旧入口。 */}
    {/* stage：原图、阈值、反转与当前检测结果，统一使用既有转换组件。 */}
    <fieldset disabled={editor.busy} className={cn('min-h-0 min-w-0 space-y-3 @min-[880px]:overflow-y-auto', pane !== 'canvas' && 'hidden @min-[880px]:block')}><CannyEnableToggle state={canny} /><CannyPreviewPanel state={canny} /></fieldset>
    {/* 右侧面板与蒙版共享组件，停止和结果下载行为完全一致。 */}
    {/* 尺寸从当前原图读取，Worker 不缩放输入，因此与转换图相同。 */}
    {/* 不提供一个会被控制模板忽略的自定义宽高输入。 */}
    {/* side：转换未完成时明确禁用，不能提交上一轮的结果。 */}
    <div className={cn('min-h-0 min-w-0 [&>form]:h-full', pane !== 'settings' && 'hidden @min-[880px]:block')}><ControlGenerationPanel editor={editor} mode="edge" getSourceFile={() => useEdgeEditorStore.getState().source?.file ?? null} disabled={!canny.result || canny.loading || canny.processing} width={canny.source?.width} height={canny.source?.height} onGenerate={generate} /></div>
  </div></div>;
}

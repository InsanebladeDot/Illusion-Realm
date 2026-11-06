"use client";

/**
 * side：蒙版和边缘绘画复用模型、LoRA、提示词、采样和公共生成会话。
 * 调用方只负责提供最新图像，组件不构建第二套工作流或任务队列。
 * 参数按对应模板分别保存，生成生命周期仍复用文字编辑公共会话。
 */
import { Sparkles, Square, Download } from 'lucide-react';
// 右侧内容插槽仅接收 React 视图，不向组装面板暴露新的任务操作。
// 父级选择参数或分类视图，公共生成 footer 始终保留可用。
// 默认省略插槽时边缘绘画继续呈现原参数区。
import type { ReactNode } from 'react';
import { RandomSeedButton } from "@/components/random-seed-button";
import { useTranslation } from '@/i18n';
import type { AnimaEditState } from '@/hooks/use-anima-edit';
import { AnimaEditModels } from './anima-edit-models';
import { EditInstruction } from './anima-edit-form';
import { AnimaEditSettings } from './anima-edit-settings';
import { ImagePreviewTrigger } from '@/components/ImagePreviewOverlay';
import { downloadMaskImage } from '@/utils/mask-image';

// 尺寸由预处理结果决定，不能显示一个对 LLLite 不生效的 MP 选择器。
// 参数适配只改变当前展示对象，不把 controlMode 写回文字编辑草稿。
// disabled 包含转换中的状态，不能让用户误提交上一张旧边缘图。
// 结果来自真实生成会话，不以原图或蒙版冒充生成完成。
// getSourceFile 在执行时读取当前工具原图，不能捕获文字模式的旧 source。
// 模型快捷读取保留原文件元数据，不读取重新编码后的蒙版 PNG。
// width/height 仅用于显示控制输入尺寸，实际队列尺寸由准备好的 File 配对传入。
// onGenerate 返回 Promise，准备和队列错误由已有页面边界捕获。
// disabled 只表示本工具暂未准备好，editor.busy 表示整个编辑会话有任务。
// 两者分开，Canny 处理中不会错误地显示为已有远端任务。
// 蒙版的正向输入移到画布下方，右栏仅保留负面输入与参数。
// hideInstruction 只控制位置，不更换 instruction/negative 的数据语义。
// 边缘模式不传此选项，继续显示原有右侧指令入口。
interface Props { promptAssembly?: ReactNode; hideNegative?: boolean; hideInstruction?: boolean; editor: AnimaEditState; mode: 'inpaint' | 'edge'; disabled: boolean; onGenerate: () => Promise<void>; width?: number; height?: number; getSourceFile?: () => File | null }

/**
 * 表单与 footer 在正常 flex 流中，窄屏仍可滚动访问全部参数。
 * 模型选择直接复用既有弹窗，所以右键、版本与多 LoRA 行为保持一致。
 * 点击生成由调用方冻结当前输入，再交给 editor.runControl。
 * 活动任务锁定参数，但停止按钮保留；保存阶段不提供假停止承诺。
 * 错误继续展示共享会话返回的可读信息，不吞掉失败后冒充成功。
 * 控制模式显示专属标签，实际模型路径仍由统一资源检查解析。
 * 当前会话只支持一次一张，因此按钮准确标注乘一。
 * 下载针对已经保存成功的结果 Blob，与画布导出明确区分。
 */
// 骰子只改变下一次生成的参数模式，不调用onGenerate或上传当前通道。
// 随机偏好保留在对应参数草稿，控制模板首次使用固定种子基准。
// 参数冻结后按钮禁用，不能让用户误以为已运行任务会被新seed追溯修改。
export function ControlGenerationPanel({ editor, mode, disabled, onGenerate, width, height, getSourceFile, hideNegative = false, hideInstruction = false, promptAssembly }: Props) {
  // adapted 仅用于组件展示，不对 store 执行 setSettings，文字模式不被隐式切换。
  // 字段默认值和自定义参数来自该控制模式的独立模板草稿。
  // mode 指明模板类别，不能根据文件名或透明像素数量猜测工作流。
  // 控制图始终使用原尺寸，shared settings 的 MP 选择在该展示对象上隐藏。
  // 输入 ID 用 mode 前缀，三个保持挂载的表单不能拥有重复 label 目标。
  // 模型与扩展组件直接收到共享 setter，确认选项后实际提交也使用同一状态。
  // queued 词条属于公共任务命名空间，其他阶段属于原编辑词条。
  // result 只有正式保存器成功返回才存在，下载不以 busy=false 作为成功条件。
  const { t } = useTranslation(), adapted = { ...editor, settings: { ...editor.settings, controlMode: mode } };
  return <form data-control-form={mode} className="flex min-h-0 min-w-0 flex-col rounded-xl border border-border/70 bg-background/70" onSubmit={event => { event.preventDefault(); void onGenerate(); }}>
    {/* side：滚动范围限于参数内容，桌面按钮始终留在可见 footer。 */}
    {/* 模型弹窗由原组件创建，容器断点不复制第二套模型菜单。 */}
    {/* 指令和负面词复用 PromptInput，保留已有提示词助手操作。 */}
    {/* 源图快捷读取通过 getter 指向当前控制工具，不依赖文字页是否访问过。 */}
    {/* side：模型与 LoRA 选择器、负向提示词及高级参数。 */}
    {/* 正向位置由父布局决定，不渲染第二份会误导用户的修改指令框。 */}
    {/* 负向仍使用原预设组件，选择预设只能写入 negative。 */}
    {/* 采样、强度和控制区间继续使用同一模式草稿，不因位置调整重置。 */}
    {/* 高级组装占用同一个 flex 内容位，替换参数区而非覆盖或在画布下追加。 */}
    {/* 退出后参数从原领域草稿恢复，模型和负向正文不依赖输入实例保存。 */}
    {/* footer 继续属于唯一表单，高级打开也能生成或停止当前任务。 */}
    {promptAssembly ? <div className="min-h-0 flex-1">{promptAssembly}</div> : <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"><h2 className="text-sm font-semibold">{t(mode === 'edge' ? 'create.maskStudio.edgeTab' : 'create.animaEdit.inpaint')}</h2><fieldset disabled={editor.busy || editor.importing} className="min-w-0 space-y-5 disabled:opacity-60"><AnimaEditModels editor={adapted} getSourceFile={getSourceFile} />{!hideInstruction && <EditInstruction editor={adapted} idPrefix={mode} />}<AnimaEditSettings editor={adapted} idPrefix={mode} hideNegative={hideNegative} /></fieldset>{width && height && <p className="text-xs text-muted-foreground">{width} × {height}</p>}</div>}
    {/* 生成未准备好时按钮明确禁用；转换失败不能静默退回文生图。 */}
    {/* stopping/saving 禁止重复停止，队列拥有最终收尾状态。 */}
    {/* 错误以 alert 语义暴露，正常阶段以 status 语义更新。 */}
    {/* 右侧表单不自行上传，所有请求由当前工具准备后交给公共队列。 */}
    {/* 界面：与公共任务卡片一致的阶段、生成和停止。 */}
    <footer className="space-y-3 border-t border-border/70 p-4"><p data-control-status role={editor.error ? 'alert' : 'status'} className="break-words text-xs text-muted-foreground">{editor.error || (editor.phase === 'queued' ? t('create.generationTasks.status.queued') : t(`create.animaEdit.phase.${editor.phase}`))}</p><div className="flex min-w-0 items-center gap-2"><button data-control-run type="submit" disabled={disabled || editor.busy || editor.importing} className="create-generate-button flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-40"><Sparkles className="h-4 w-4" /><span className="flex-1">{t(mode === 'edge' ? 'create.maskStudio.runEdge' : 'create.animaEdit.runInpaint')}</span><span className="border-l border-white/35 pl-3 text-xs">× 1</span></button><RandomSeedButton random={editor.seedMode === 'random'} disabled={editor.busy || editor.importing} onEnable={() => editor.patch({ seedMode: 'random' })} /></div>{editor.busy && <button type="button" data-control-stop disabled={editor.phase === 'saving' || editor.phase === 'stopping'} onClick={() => { void editor.stop(); }} className="flex items-center gap-2 text-xs text-destructive disabled:opacity-40"><Square className="h-3 w-3" />{t('create.animaEdit.stop')}</button>}</footer>
    {/* 结果 URL 由编辑 store 管理，这里不在卸载时释放共享资源。 */}
    {/* 查看原图或蒙版不会改变下载对象，按钮始终下载生成结果。 */}
    {/* 无结果时不放演示缩略图，避免把输入图误认成模型输出。 */}
    {/* 界面：已生成结果缩略图，点击复用原有大图预览。 */}
    {editor.result && <div className="space-y-2 border-t border-border p-3"><ImagePreviewTrigger items={[{ key: editor.result.image.objectUrl, src: editor.result.image.objectUrl, alt: t('create.animaEdit.result') }]} index={0} className="block h-36 overflow-hidden rounded-lg" /><button type="button" data-control-download onClick={() => { if (editor.result) downloadMaskImage(editor.result.image.blob, editor.result.image.filename); }} className="flex items-center gap-1 text-xs text-accent-text"><Download className="h-3 w-3" />{t('create.animaEdit.download')}</button></div>}
  </form>;
}

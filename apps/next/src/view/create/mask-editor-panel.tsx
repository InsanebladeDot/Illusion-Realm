"use client";

/**
 * 编辑页蒙版工作区：左画布、右参数，窄屏切换时保留两侧实例。
 * 生成直接导出最新像素，不使用可能过期的预览结果。
 * 本地导出与正式生成分别触发，不再提供手动上传验证。
 */
import { useState } from "react";
import { useTranslation } from "@/i18n";
import { useAnimaEdit } from "@/hooks/use-anima-edit";
import { useMaskWorkspaceStore } from "@/stores/use-mask-workspace-store";
import { exportMaskDocument } from "@/utils/mask-document";
import { MaskCanvasStage } from "@/components/create-edit/mask-canvas-stage";
import { MaskToolbar } from "@/components/create-edit/mask-toolbar";
import { ControlGenerationPanel } from "@/components/create-edit/control-generation-panel";
import { MaskChannelRail } from "@/components/create-edit/mask-channel-rail";
// 画布下方是实际正向提示词，分类与工具复用图片页组装面板。
// 负面词由 side 的原负向组件承担，位置调整不交换已有正文。
// 两处都继续写当前编辑草稿，工作流正负编码节点的契约保持明确。
import { MaskPositivePrompt } from "@/components/create-edit/mask-positive-prompt";
// 原面板占据 side 的内容槽，避免复制工具 UI 或给左侧画布增加下方区域。
// 独立分类草稿保留路由切换前内容，右侧参数与生成仍属于公共表单。
// 窄屏点击高级同时切至右侧视图，不让已打开的组装隐藏在另一栏。
import { useMaskPromptStore } from "@/stores/use-mask-prompt-store";
import { PromptAssemblyPanel } from "./promptAssembly/PromptAssemblyPanel";
import { cn } from "@/utils/cn";
// 固定工具栏属于局部编辑区，不替换应用 nav。
// stage 继续填满剩余高度，三个可见通道置于右侧，合成数据仅供工作流。
// 短视口工具可独立滚动，主图不会被工具数量撑高。
import { MaskToolRail } from "@/components/create-edit/mask-tool-rail";

/**
 * 同步编码当前文档再创建 File，队列持有冻结字节，后续换页不影响。
 * 正式生成使用当前编辑合成 RGB（原图加绘画），并以反向 mask 写入 alpha。
 * busy 在导出和上传期间锁定画布，任务锁定由原公共队列负责。
 * 导入失败保留旧文档，错误在左侧直接显示。
 * 窄屏仅切换显示栏，不卸载任一侧实例。
 * 原图尺寸由文档读取，旋转后也能正确显示与提交。
 */
export function MaskEditorPanel() {
  // 文档来自独立 store，路由卸载后再回来仍有三层像素和撤销记录。
  // editor 复用公共会话，文字和控制工具不会同时运行两条独立队列。
  // pane 只决定窄屏显示哪栏，桌面用 CSS 断点同时显示两栏。
  // 导入和任务 busy 分属不同生命周期，locked 合并二者守住画布入口。
  // 准备函数每次读取 getState，避免提交闭包持有上一张文档。
  // exportMaskDocument 同步冻结三个像素层，当前操作不会在编码中途插入。
  // File 使用编辑合成加反向 alpha，RGB 涂色、模糊等修改也必须进入工作流。
  // 生成错误来自共享会话；本页只处理准备图像阶段的导出错误。
  // 未导入图片时 prepare 返回 null，不创建空文件或假任务。
  // 模型快捷读取 getter 指向当前 doc.file，保留原图内嵌工作流。
  // 蒙版表单始终读其模板草稿，隐藏文字表单不能覆盖这些参数。
  // 任务门闩仍来自公共会话，分离参数不会新增一条执行队列。
  const state = useMaskWorkspaceStore(), editor = useAnimaEdit('inpaint'), { t } = useTranslation(), [pane, setPane] = useState<'canvas' | 'settings'>('canvas');
  // 输出只在显式导出或生成时计算，鼠标每移动一次不压缩整张 PNG。
  // 四份结果属于同一个 revision，预览和上传不能混用不同蒙版版本。
  // prepare 不设置 busy，调用边界决定是否需要锁定异步后续动作。
  // 存储 exports 供通道独立下载，正式生成读取 composite 的编辑像素与蒙版。
  const prepare = () => { const current = useMaskWorkspaceStore.getState(); if (!current.doc) return null; const result = exportMaskDocument(current.doc); current.patch({ exports: result }); return result; };
  // 排队门闩在 runControl 内同步建立，重复点击不会追加重复任务。
  // width/height 取当前导出结果，旋转之后不使用旧源图方向。
  // inpaint 明确选择模板，不能依据 PNG 是否存在透明像素自动猜测。
  // 蒙版为空仍可导出，用户可决定是否使用；不悄悄全图填白扩大编辑范围。
  // await 队列时界面仍可切页，任务本身持有文件并在 store 回填结果。
  // finally 收尾由共享队列处理，本组件不伪造生成成功或取消成功。
  // 第一张编辑图的 RGB 合成配合实际 mask，而非上传 UI 的有色蒙版叠加截图。
  // composite 保留透明像素中的 RGB，ComfyUI 同一次 LoadImage 读取 IMAGE 与 MASK。
  // 当前查看哪个缩略图不影响输入选择，黑白通道不会被误当作控制原图。
  const generate = async () => { if (editor.busy || state.busy) return; try { const result = prepare(); if (result) await editor.runControl(new File([result.composite], 'inpainting.png', { type: 'image/png' }), result.width, result.height, 'inpaint'); } catch (reason) { state.patch({ error: reason instanceof Error ? reason.message : t('create.maskEditor.exportFailed') }); } };
  // grid 只占工作区剩余高度，窄屏切栏按钮也计入分配。
  // 右侧 footer 不在参数滚动区内，因此生成与停止不会被长表单挤走。
  // 左栏工具条和正向提示词不压缩，画布独占二者之外的剩余空间。
  // 长正向文本在输入框内部滚动，不能反向挤压画布。
  // 收起面板的高度过渡直接参与 flex 分配，不维护第二份折叠状态。
  // 图片缩放只改变 stage 内部图像，不能改变这个高度分配。
  // 极矮窗口保留最小画布并允许左栏滚动，避免把工具挤出可访问范围。
  // hidden 只在窄屏生效，扩大窗口时两个视图立即恢复同排。
  // main 外层的颜色、圆角和留白由既有应用外壳管理。
  // 本工作区只定义功能内的间距，不重复创建 head 或 nav。
  const locked = state.busy || editor.busy, doc = state.doc, { advanced, setAdvanced } = useMaskPromptStore(), button = 'inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs hover:bg-accent disabled:opacity-40';
  return <div data-mask-editor aria-label={t("create.maskEditor.title")} className="@container flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"><div className="flex shrink-0 gap-1 p-2 @min-[880px]:hidden">{(['canvas', 'settings'] as const).map(value => <button key={value} type="button" data-mask-pane={value} aria-pressed={pane === value} onClick={() => setPane(value)} className={cn(button, pane === value && 'bg-accent')}>{t(value === 'canvas' ? 'create.maskStudio.canvas' : 'create.maskStudio.settings')}</button>)}</div><div data-mask-grid className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-3 overflow-hidden p-3 @min-[880px]:grid-cols-[minmax(0,1fr)_344px]">
    {/* 导入入口保留同一文件重复选择能力，读取后清 input.value。 */}
    {/* 上传文件仍经解码和尺寸校验，accept 只是文件选择提示。 */}
    {/* 本地错误使用 alert 语义，不用浏览器原生提示框打断编辑。 */}
    {/* 通道缩略图固定在主图右侧，首张返回可编辑视图，其他是只读输出。 */}
    {/* 画布图像保留原纵横比，布局缩放不参与实际 PNG 尺寸计算。 */}
    {/* 画布填满左栏剩余高度，正向提示词收起后不在底部留下空白。 */}
    {/* 工具条保持自然高度；正向词固定输入高度，内容变多不改变上下分区。 */}
    {/* 最小画布高度只为极矮视口保底，常规窗口不再受 42vh 上限限制。 */}
    {/* 显示栏切换只改 display，回到画布时仍使用 flex 而非 block 布局。 */}
    {/* stage：画布、浮动笔刷设置、文档工具和原尺寸导出。 */}
    <section className={cn('flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto [&>[data-mask-toolbar]]:shrink-0', pane !== 'canvas' && 'hidden @min-[880px]:flex')}><MaskToolbar locked={locked} /><div data-mask-canvas-row className="flex min-h-[160px] min-w-0 flex-1 items-stretch gap-2"><MaskToolRail locked={locked} /><MaskCanvasStage key={doc?.name ?? 'empty'} locked={locked} /><MaskChannelRail /></div><fieldset disabled={locked} data-mask-prompt className="min-w-0 shrink-0 rounded-xl bg-background/40 p-3"><MaskPositivePrompt editor={editor} locked={locked} onAdvancedChange={enabled => { if (!locked) { setAdvanced(enabled); if (enabled) setPane('settings'); } }} /></fieldset>{state.error && <p role="alert" className="shrink-0 text-xs text-destructive">{state.error}</p>}
    </section>
    {/* 生成参数直接复用公共组件，不复制模型扫描、LoRA 权重或提示词助手。 */}
    {/* 文件管理和原文字改图仍由父工作区提供入口，此处不改变路由选择。 */}
    {/* 活动任务可从全局任务列表查看与停止，页面本身不是任务生命周期所有者。 */}
    {/* 当前图片的读取回调实时返回文件，异步模型解析能检查是否发生换图。 */}
    {/* side：真实模型与生成参数，直接交接公共队列。 */}
    {/* side：高级开启时原位替换为完整组装面板，画布和下方正文保持原高度。 */}
    {/* 关闭只切换展示内容，公共 footer 的生成和停止入口不会消失。 */}
    {/* 嵌套 fieldset 继续承担原生禁用边界，Portal 回写由 store 再检查。 */}
    <div className={cn('min-h-0 min-w-0 [&>form]:h-full', pane !== 'settings' && 'hidden @min-[880px]:block')}><ControlGenerationPanel hideInstruction editor={editor} mode="inpaint" getSourceFile={() => useMaskWorkspaceStore.getState().doc?.file ?? null} disabled={!doc || state.busy} width={doc?.original.width} height={doc?.original.height} onGenerate={generate} promptAssembly={advanced ? <fieldset data-mask-assembly disabled={locked} className="h-full min-h-0 min-w-0"><PromptAssemblyPanel assemblyStore={useMaskPromptStore} disabled={locked} series="anima" backLabel={t('create.maskStudio.returnSettings')} onClose={() => setAdvanced(false)} /></fieldset> : undefined} /></div>
  </div></div>;
}

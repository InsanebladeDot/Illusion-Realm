"use client";
/**
 * rail：Role TTS 使用 MiniMax H3 音频图，复用主模型、步数、种子、LoRA 和生成控件。
 * 表单状态属于常驻 Zustand，切换模式不丢草稿或生成结果。
 * 提交交给公共 FIFO，组件不发请求，也不在卸载时停止正在运行的任务。
 */
import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { useAudioCreateStore } from '@/stores/use-audio-create-store';
import { useGenerationTaskStore, isGenerationTaskActive } from '@/stores/useGenerationTaskStore';
import { audioWorkflowTemplate, audioWorkflowDefaults } from '@/utils/comfy/audio-workflow';
// 复用视频现有引用编辑器，音频只注入允许类型和当前唯一参考槽。
// 复制、翻译助手继续写同一个草稿，不复制另一个音频输入实现。
// 转换预览不改变用户原稿；真正提交在 builder 再次核验引用。
import { ImageReferencePrompt } from './image-reference-prompt';
import { PromptConversionPreview } from './prompt-conversion-preview';
import { audioPromptMedia } from '@/utils/comfy/audio-prompt-references';
// 生成、种子、主模型和步数直接组合已有组件，不复制任何一套控件外观。
// 音频只提供受控参数，图片与音频状态的隔离由各自 store 保证。
// 默认值读取当前 JSON，调整参数时才写入覆盖字段。
import { GenerateFooter } from './GenerateFooter';
import { SeedFields } from './generation-sampling-fields';
import { VideoModelSelect } from './video-model-select';
import { GenerationParameterControl } from './generation-parameter-control';
// 时长复用已有 MiniMax 范围和参数行，不新建音频专用数字框或滑条。
// 仅共享边界，音频草稿与视频草稿仍然独立。
// 生成图继续使用音频模板，不能因此切换到视频生成器。
import { VIDEO_GENERATION_LIMITS } from '@/utils/comfy/video-generation-settings';
import { AudioUpload } from './AudioUpload';
import { VideoLoraSelect } from './video-lora-select';
import { AudioResults } from './audio-results';
// 音频只注入模板与分支草稿，辅助模型控件与其余创作模式完全共用。
// 刷新列表不会替换参考文件、主模型或时长。
// 参考音频是否存在决定模板分支，不根据文件名字符串或提示词中的 @ 标记猜测。
// 模板只用于当前显示，真实音频上传成功后仍由原 builder 组装执行图。
// 回调同时保留另一分支字典，来回添加和移除参考音频不会丢掉各自选择。
// 恢复默认也只清当前分支，不顺便重置随机种子、时长或加速 LoRA。
import { WorkflowModelSettings } from './video-model-settings';

// 只用于公共 LoRA 控件的默认来源，构建器始终克隆原始模板。
// 音频模式传入 minimax 系列，不能选择给图片 UNet 使用的扩展。
// 两份工作流的默认加速 LoRA 相同，用户更改后不随参考文件增删而重置。
// 常量在模块中只创建一次，避免编辑输入时重复克隆整图。
// Role TTS 保留用户熟悉的标签名，但已不再调用角色库的占位表单。
// 模板默认模型路径可含中文子目录，扩展卡片显示时不需要改模型文件名。
// 公共选择器的模板注入不修改视频页注册的默认工作流。
// 视频页的模型、时长和分辨率状态不与本面板双向绑定。
// 创建页移除角色入口后，本面板是唯一可见的语音生成模式。
// 显示默认加速扩展并不代表模型已经安装，缺失时由执行前检查报告。
// 当前模板数据只读，用户删除扩展只修改 store.loras。
// 公共选择器仍支持用户自己选择多个 MiniMax LoRA。
// 非 MiniMax 系列不会因为位于音频模式而被额外放行。
// 模板注入是复用点，卡片、弹窗、权重编辑继续使用原有组件。
const TEMPLATE = audioWorkflowTemplate();
// 引用的类型约束是固定任务能力，不能因某次没有参考就开放视频或图片。
// 空图片列表仅满足公共编辑器预览契约，不创建任何图片展示或上传槽。
// 模块常量保持引用稳定，普通输入不会触发无关的图片装饰更新。
const AUDIO_KINDS = ['audio'] as const, NO_IMAGES: (string | null)[] = [];

// showResults 在无 stage 的单/双栏布局为 true，窄窗口也能播放结果。
// 三栏交由 stage 展示同一个结果组件，不同时创建两套播放器。
// 上传组件保留完整 File，旧实现仅记名称无法真正接入 LoadAudio。
// 删除参考后下次提交立即选择无参考图，正在排队的任务仍使用旧快照。
// 描述输入复用图片提示词编辑面，包含现有复制与翻译助手。
// 中文对白不会被自动翻译，用户可以通过助手主动把场景描述转为英文。
// 输入错误与远端错误都在表单中显示，不仅把问题写进控制台。
// 已保存结果即使有新任务失败仍保留，不能用错误分支清空用户产物。
// 删除原角色选择和参考转录输入，它们不属于本工作流的真实参数。
// 参考模式与无参考模式提示由当前 File 是否存在决定，不另持久化一个开关。
// 参数区滚动与 footer 分开，尺寸变化不引入页面外的第二层浮动面板。
// useGenerationTaskStore 读取全局真实状态，不使用本地 setGenerating 猜测。
// 这里只关联最新提交项；所有待执行项仍能从标题栏任务中心查看和取消。
// 切换到其他页面不调用 abort，用户明确停止才经过统一取消入口。
// 面板 props 只描述结果放置位置，不决定选用哪份生成图。
// 工作流选择跟随参考 File 的真实存在性，尺寸变化不能影响生成模式。
// 表单使用 preventDefault，提交不会触发浏览器导航或刷新整个应用。
// 提示词控件用 contentEditable 明文模式，不接受粘贴 HTML 作为执行内容。
// 提示词的 value 从 store 恢复，切换标签后不显示空白旧 DOM。
// 助手翻译由用户主动选择，不在每次提交时静默调用模型翻译。
// 模型执行中仍允许编辑下一条参数，已提交内容由队列快照隔离。
// 上传控件的隐藏 input 一次只接受一个参考文件，符合模板单参考端口。
// 文件导入后保留 File，而不是仅保留显示名称。
// 删除文件只清空 reference，未自定义时恢复无参考模板默认时长。
// 替换参考音频不会改写之前排队项的不可变 File。
// 提示行显示当前所选秒数，避免自定义后仍显示默认五秒的误导信息。
// 无参考提示行显示英文工作流名，便于与原模板对照。
// 结果区与错误区并列，失败不会遮住之前已经生成的音频。
// 没有结果时保留音乐图标空态，不拿模板样例音频当成真实生成物。
// 扩展区域直接复用 SelectedExtensions 和 ExtensionSelectDialog 的真实实现。
// 模板默认扩展显示完整模型信息；没有封面时使用公共卡片的后备显示。
// 扩展选择保持当前布局的宽屏弹窗和窄屏替换行为，不另造音频专属弹窗。
// 结果 showResults=false 时不在 rail 再绘制播放器，避免同时占据两块区域。
// 使用相同 AudioResults 组件保证窄屏与宽屏的文件查看行为一致。
// stage 在布局中隐藏不代表任务停止，表单不依赖 stage 的生命周期。
// 全局队列的失败卡片是全部任务的记录，表单仅显示最新提交错误。
// 生成期间离开本页，不运行任何音频专用 useEffect 清理取消逻辑。
// 所有中文显示来自 i18n，新增词条也提供英文对应键。
// 数据标记只用于可观察回归，不通过 window 暴露 store 私有方法。
// 表单的 min-h-0 允许参数区在低窗口中收缩，不能撑出全局 main。
// 结果播放器具有自身标准控制条，不需要为了听声音跳到外部网站。
// 面板不直接导入 Electron 或 Node，网络和文件副作用留给已有桥接。
// 参考素材不被发送给远端账户服务器，只通过用户配置的 ComfyUI 服务处理。
export function RoleTtsPanel({ showResults = true }: { showResults?: boolean }) {
  const { t } = useTranslation(), state = useAudioCreateStore();
  // 模板缺省项按参考音频实时读取，null 覆盖不会锁死第一次挂载时的值。
  // UNet 节点 id 只用于选择器适配，切换参考图时保留用户选中的模型相对名。
  // 两个 memo 均为纯读取，不在渲染过程中请求模型服务或改写模板。
  const reference = Boolean(state.reference);
  const template = useMemo(() => audioWorkflowTemplate(reference), [reference]);
  const defaults = useMemo(() => audioWorkflowDefaults(reference), [reference]);
  // 菜单和只读预览使用同一素材数组，导入、替换、删除都随 File 更新。
  // 不创建 URL，音乐图标与名称足够选择，避免切页造成未释放播放资源。
  // File 保持在原 store，引用控件并不改变队列所持有的参考字节。
  const media = useMemo(() => audioPromptMedia(state.reference), [state.reference]);
  const active = useGenerationTaskStore(store => store.tasks.some(task => task.id === state.taskId && isGenerationTaskActive(task)));
  return <form data-audio-create onSubmit={event => { event.preventDefault(); state.submit(); }} className="flex min-h-0 flex-1 flex-col">
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* rail：真实音频参数，主模型和步数使用工作流缺省或用户覆盖。 */}
      <div className="space-y-4 p-3">
        {/* 界面：「模型」直接复用已有封面卡片和本地模型选择弹窗。 */}
        {/* 默认显示当前模板的 UNet，改名后的模型可由用户重新选择。 */}
        {/* 主模型卡片只覆盖 UNet，辅助设置按当前音频模板另行配置。 */}
        <VideoModelSelect workflowId="minimax" templateOverride={template} overrides={state.unetName ? { [defaults.unetId]: state.unetName } : {}} onChange={value => state.patch({ unetName: value[defaults.unetId] ?? null })} disabled={false} />
        {/* rail：扩展紧跟主要模型，和图片模式的参数阅读顺序一致。 */}
        {/* 移动原实例，不再在步数和种子下方重复渲染扩展选择器。 */}
        {/* 加速 LoRA 仍来自音频模板，增删和权重继续写回音频草稿。 */}
        <VideoLoraSelect workflowId="minimax" templateOverride={TEMPLATE} value={state.loras} disabled={false} onChange={state.setLoras} />
        {/* rail：只展示音频图真实的 CLIP/VAE，不显示 pixel_space 占位。 */}
        {/* 有无参考各用自己的分支，恢复默认只清当前辅助设置。 */}
        {/* 任务已入队时持有旧快照，这里调整仅影响下一次生成。 */}
        <WorkflowModelSettings key={reference ? 'reference' : 'text'} workflowId="minimax" mediaKind="audio" templateOverride={template} overrides={state.modelOverrides[reference ? 'reference' : 'text'] ?? {}} onChange={value => state.patch({ modelOverrides: { ...state.modelOverrides, [reference ? 'reference' : 'text']: value } })} onReset={() => state.patch({ modelOverrides: { ...state.modelOverrides, [reference ? 'reference' : 'text']: {} } })} disabled={false} />
        <label htmlFor="audio-prompt" className="text-sm font-medium">{t('create.audio.prompt')}</label>
        {/* 界面：「音频提示词」复用视频 @ 补全、撤销、输入法及光标逻辑。 */}
        {/* 唯一差异通过 audio 类型注入，菜单与搜索都不能选择图片/视频。 */}
        {/* 助手仍保留，音频生成不会因为换输入框丢失复制、翻译能力。 */}
        <ImageReferencePrompt id="audio-prompt" value={state.prompt} onChange={prompt => state.patch({ prompt })} images={NO_IMAGES} media={media} kinds={AUDIO_KINDS} disabled={false} assistant label={t('create.audio.prompt')} placeholder={t('create.audio.promptHint')} />
        {/* 界面：「转换预览」复用视频展示，只读显示实际提交的 H3 标记。 */}
        {/* 原稿保留 @audio1，预览和构图同用官方 <Audio 1> 转换。 */}
        {/* 无效引用显示原因，用户可删除引用或重新导入参考音频。 */}
        <PromptConversionPreview value={state.prompt} media={media} />
        <AudioUpload label={t('create.audio.reference')} fileName={state.reference?.name ?? null} onSelect={reference => state.patch({ reference })} onRemove={() => state.patch({ reference: null })} emptyHint={t('create.audio.referenceHint')} />
        {/* 界面：「音频时长」复用步数同款参数行，滑条和数字输入都可修改。 */}
        {/* 未编辑时读当前模板；手动设置后切换参考仍保留所选秒数。 */}
        {/* 范围为客户端护栏，实际长度仍需按模板帧数规则对齐。 */}
        <GenerationParameterControl name="audio-duration" label={t('create.audio.duration')} hint={t('create.audio.durationHint')} min={VIDEO_GENERATION_LIMITS.durationMin} max={VIDEO_GENERATION_LIMITS.durationMax} step={0.1} value={state.durationSeconds ?? defaults.durationSeconds} onChange={durationSeconds => state.patch({ durationSeconds })} />
        {/* 工作流提示与控件读取同一个值，不再硬写默认四秒或五秒。 */}
        {/* 文件的有无决定模式，修改秒数本身不会切换工作流。 */}
        {/* 两种语言都通过同一 seconds 占位符显示当前选择。 */}
        <p data-audio-workflow className="text-xs text-muted-foreground">{t(state.reference ? 'create.audio.referenceWorkflow' : 'create.audio.textWorkflow', { seconds: state.durationSeconds ?? defaults.durationSeconds })}</p>
        {/* 界面：「步数」直接复用生成参数滑条；未编辑时读取当前图的实际值。 */}
        {/* 无参考默认 10，有参考默认 8；用户覆盖优先且会冻结进队列。 */}
        {/* 种子复用图片随机/自定义按钮组，同一字段也由底部骰子控制。 */}
        <GenerationParameterControl name="audio-steps" label={t('create.advancedSettings.steps')} hint={t('create.advancedSettings.stepsHint')} min={1} max={100} step={1} value={state.steps ?? defaults.steps} onChange={steps => state.patch({ steps })} />
        <SeedFields seed={state.seed} seedMode={state.random ? 'random' : 'custom'} onSeed={seed => state.patch({ seed })} onSeedMode={mode => state.patch({ random: mode === 'random' })} />
      </div>
      {state.error && <p role="alert" className="p-3 text-sm text-destructive">{state.error}</p>}
      {/* 界面：没有中间预览列时在表单内播放，结果仍由同一个常驻 store 持有。 */}
      {showResults && <AudioResults />}
    </div>
    {/* 界面：「生成 | ×N」和骰子复用图片页的整个底部组件。 */}
    {/* 数量 N 实际创建 N 项音频任务，菜单操作本身不提交。 */}
    {/* 受控骰子只更新音频随机模式，不写入图片页的高级设置。 */}
    <GenerateFooter generating={active} onGenerate={state.submit} quantityLabel={t('create.audio.media')} seedControl={{ random: state.random, onEnable: () => state.patch({ random: true }) }} />
  </form>;
}

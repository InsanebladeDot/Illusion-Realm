"use client";
// 界面：控制工作流的权重与时间区间，普通文字编辑不显示无效参数。
// 独立区块复用公共数值行和双端滑块，所有模式写各自的参数草稿。
// 放在高级设置外，首次使用就能直接核对 JSON 默认控制值。
import { AnimaControlSettings } from './anima-control-settings';

/**
 * 文字改图参数区：复用创建页的枚举菜单和参数滑条，不使用浏览器默认下拉。
 * 只提供原工作流存在的参数，反向提示词和高级设置默认折叠。
 */
// 正反向指令与图片模式共用 PromptInput，Seed 保留单行参数输入。
// contentEditable 需要显式 disabled，不能只依赖 fieldset 的原生表单禁用。
// 助手修改回到 settings.negative，因此导出与生成读取同一份文本。
import { NegativePromptSection } from "@/view/create/NegativePromptSection";
import { GenerationSamplingFields } from "@/view/create/generation-sampling-fields";
import { AdvancedSettingsSection } from "@/view/create/advanced-settings-section";
import { ChevronDown } from "lucide-react";
// 三种编辑模式读取自己的模板，不能用文字编辑的节点号配置蒙版图。
// 模板只供提取设置字段，实际接线和提交仍由原构建器负责。
// 共用加载器表单放在参数区，外层编辑器继续负责原图、蒙版和生成状态。
// 模板来源可变，SimpleSelect 的菜单、键盘和主题样式却只有一套实现。
// 选择回调使用函数式 setSettings，避免覆盖刚更新的提示词或采样参数。
// 恢复默认只清辅助覆盖，不重置用户已经画好的蒙版、原图或编辑指令。
// busy 与 importing 同时锁定资源选择，防止读取图片快照时用户改写同一设置。
// 各编辑模式已有独立草稿，本组件不额外缓存一份与 store 竞争的覆盖值。
import { useMemo, type ReactNode } from "react";
import { getImageWorkflowTemplate } from '@/utils/comfy/imageWorkflow';
import { getAnimaControlTemplate } from '@/utils/comfy/anima-control-workflow';
import { WorkflowModelSettings } from '@/view/create/video-model-settings';
import { useTranslation } from "@/i18n";
import { OptionSelect } from "@/view/create/OptionSelect";
import { GenerationParameterControl } from "@/view/create/generation-parameter-control";
import type { AnimaEditState } from "@/hooks/use-anima-edit";

// 文本控件使用主题 token，浅色和深色都与主展示区保持一致。
// appearance-none 去掉平台原生控件装饰，focus ring 提供明确的键盘焦点。
// Seed 保留单行输入，长安全整数不能横向撑开 rail。
// 此常量只供单行参数使用，正反向文本统一由 PromptInput 提供。
export const EDIT_FIELD = "w-full min-w-0 appearance-none rounded-xl border border-border bg-muted/30 px-3 py-3 text-sm leading-6 outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-primary/15 disabled:opacity-60";

/**
 * 折叠容器沿用原生 details 的键盘与展开状态，仅替换默认 marker。
 * 标题、摘要、箭头共用一行，长摘要允许省略，不挤掉操作目标。
 * 箭头随 open 属性翻转，不等待动画事件再更新业务状态。
 * 内容仍在正常文档流，展开后由左侧表单滚动区承载。
 * aria-hidden 使装饰箭头不重复朗读标题。
 * 不把高级参数展开状态写入全局设置或用户数据。
 */
export function EditDisclosure({ title, summary, children }: { title: string; summary?: string; children: ReactNode }) {
  // details 自己保存展开状态，主题切换不会因全局配置变化而重置。
  // summary 保留原生 Enter/Space 交互，不用 div 模拟可点击标题。
  // children 只是折叠而不卸载，用户尚未提交的输入仍然保留。
  // 右侧摘要是提示信息，不负责重新解析或生成实际参数。
  // 自定义箭头只反映 open，不为布局引入一个额外的监听器。
  // 边线使用语义 token，使同一组件在不同主题下保持分区可辨识。
  return <details className="group border-t border-border/70 pt-4"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"><span>{title}</span><span className="ml-auto truncate text-xs font-normal text-muted-foreground">{summary}</span><ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground group-open:rotate-180" /></summary><div className="mt-4 space-y-4">{children}</div></details>;
}

/**
 * 分辨率只选择 MP，保持原图比例，避免提供不生效的宽高输入。
 * 字符串仅用于菜单接口，写回状态时转换为固定选项的数值。
 * 估算值按八像素步进取整，并明确标记约数。
 * 没有原图时不显示一组虚构的默认尺寸。
 * 真实结果尺寸仍在生成后读取图片解码值。
 * 菜单按钮与其他生成页复用 OptionSelect 的选中标记及外部点击关闭。
 */
function EditResolution({ editor }: { editor: AnimaEditState }) {
  // MP 是目标总像素而非长边长度，缩放比需要开平方而不是直接相乘。
  // 一百万像素按十进制计，与 ImageScaleToTotalPixels 节点参数一致。
  // 估算仅在有真实源尺寸时进行，不依赖上传缩略图的显示大小。
  // 八像素取整可能让总像素略偏离目标，文案用约数避免承诺精确尺寸。
  // 极端长宽比下任一维度至少八像素，避免辅助显示出现零尺寸。
  // 结果文件尺寸仍以服务回包实际解码值为准，不将该估算写入 Meta。
  // OptionSelect 要求字符串 value，此处明确做数字与字符串边界转换。
  // 固定选项与构建验证共用相同取值，不提供前端可选但后端拒绝的倍率。
  // 分辨率切换只更新该字段，用户其他高级参数不被默认值覆盖。
  // 窄屏标签和菜单在同一行，提示可换行，不依赖固定页面总宽度。
  const { t } = useTranslation(), { settings, setSettings, source } = editor;
  // 控制流保持源图自然尺寸，模板没有 MP 缩放节点，因此隐藏不生效的菜单。
  // 尺寸直接来自已解码的源图，不能用 DOM 缩略图大小估算。
  // 原文字改图继续使用下面的 MP 预算和八像素步进显示。
  if (settings.controlMode) return <p className="text-xs text-muted-foreground">{t("create.animaEdit.controlSize")}{source ? ` · ${source.width} × ${source.height}` : ""}</p>;
  const scale = source ? Math.sqrt(settings.megapixels * 1e6 / (source.width * source.height)) : 0;
  const size = source ? `${Math.max(8, Math.round(source.width * scale / 8) * 8)} × ${Math.max(8, Math.round(source.height * scale / 8) * 8)}` : "";
  return <section className="space-y-3 border-t border-border/70 pt-4"><div className="flex items-center gap-3"><h3 className="mr-auto shrink-0 text-sm font-medium">{t("create.animaEdit.resolution")}</h3><div className="w-28"><OptionSelect ariaLabel={t("create.animaEdit.resolution")} value={String(settings.megapixels)} options={[0.5, 1, 1.5, 2].map((value) => ({ value: String(value), label: `${value} MP` }))} onChange={(value) => setSettings((previous) => ({ ...previous, megapixels: Number(value) }))} /></div></div><p className="text-xs leading-5 text-muted-foreground">{t("create.animaEdit.resolutionHint")}{size && ` · ${t("create.animaEdit.estimate", { size })}`}</p></section>;
}

/**
 * 参数行复用文生图与视频共用的滑条/数值输入，保留相同焦点及夹取规则。
 * 采样步数为整数，CFG 和强度分别使用匹配模型参数的步进。
 * 种子使用文本框，长安全整数不会因 number 控件滚轮或箭头意外改变。
 * 随机按钮仅更新表单，不自动运行或重新生成。
 * 采样器与调度器复用图片生成枚举，所选值真实写进当前 KSampler。
 * 高级设置收起时仍保留参数，不在打开/关闭过程中回填默认值。
 * 输入数值更新使用函数式 setState，不覆盖同时修改的其他字段。
 * 前端范围限制只是交互辅助，构建器在提交时会再次校验。
 */
// 复用完整采样字段而非只复制外观，选项和数值控制始终使用同一实现。
// 种子保存文本格式，避免超出安全整数的输入在提交前被浏览器静默取整。
// 手动输入会回到custom，骰子只切random，不篡改记住的自定义字符串。
// 降噪属于编辑工具额外字段，插在共用块之后，不给文生图添加无效参数。
// 蒙版的负面词在画布下方，因此hideNegative仅隐藏此处的重复输入。
// 多个工具保持挂载，idPrefix防止label和助手把文本写进其他工具。
// 所有回调使用函数式合并，调一个参数不能覆盖刚修改的另一字段。
// 组件不直接计算随机数，任务提交时统一冻结本次实际seed。
export function AnimaEditSettings({ editor, idPrefix = "anima-edit", hideNegative = false }: { editor: AnimaEditState; idPrefix?: string; hideNegative?: boolean }) {
  // 不再次渲染只读模型清单；可选择 UNet 与 LoRA 的入口在表单顶部。
  // 三组连续参数复用相同 GenerationParameterControl，不另写 range 外观。
  // 通过字段名访问状态保持类型检查，拼错参数名无法编译。
  // steps 的整数步进对应 KSampler，CFG 与降噪允许小数。
  // 高级区收起时摘要仍显示当前步数与 CFG，而不是写死模板值。
  // 负面词独立折叠，空字符串会原样进入工作流的负面编码节点。
  // maxLength 只是输入辅助，导出与运行仍在纯构建函数中检查限长。
  // 正反向文本共用 PromptInput，主题切换不会出现原生白色文本框。
  // 采样器与调度器的 label 仅用于展示，value 才传给工作流。
  // 自定义菜单保留公共关闭行为，点击外部或 Escape 不改变当前选择。
  // sampler 变更不推断 scheduler，允许使用用户显式设定的组合。
  // Seed 文本状态保留编辑中的空值，真正提交时再验证合法整数。
  // 随机按钮生成非负整数，不使用可能被解析成随机标志的负数。
  // 每次点击只更新 seed，不触发上传、队列或模型刷新。
  // 函数式更新以最新 previous 为准，多个参数连续修改不会互相回滚。
  // 父 fieldset 统一处理忙碌禁用，不给某个高级控件留下运行时可改的例外。
  // data-anima-seed 供真实 DOM 回归定位，不是用于绕过组件状态的内部 API。
  // 单列参数布局为按钮标签预留横向空间，避免窄栏中菜单文字被两列挤压。
  // Shuffle 为离线 SVG 图标，不依赖网络字体或字符编码渲染。
  // 参数全部在内存中，不把尚未确认的编辑表单写入用户数据文档。
  const { t } = useTranslation(), { settings, setSettings } = editor;
  // 控制区单独显示以便核对 JSON 初值，折叠高级参数不会隐藏其存在。
  // 原文字流没有控制 mode，因此该复用区块不产生无效节点参数。
  // 正反提示词沿用原输入，采样块仍保留既有数值和菜单组件。
  // 只在模式变化时复制模板，输入指令不重复克隆整图。
  // 辅助覆盖随已有 settings 一起冻结，离线导出与真实运行都能使用。
  // busy 显式传入公共组件，浮层按钮也遵守当前编辑任务的禁用状态。
  const template = useMemo(() => settings.controlMode ? getAnimaControlTemplate(settings.controlMode) : getImageWorkflowTemplate('anima'), [settings.controlMode]);
  return <><WorkflowModelSettings workflowId="anima" mediaKind="image" templateOverride={template} overrides={settings.modelOverrides ?? {}} onChange={modelOverrides => setSettings(previous => ({ ...previous, modelOverrides }))} onReset={() => setSettings(previous => ({ ...previous, modelOverrides: {} }))} disabled={editor.busy || editor.importing} />{!hideNegative && <NegativePromptSection editorId={idPrefix + '-negative'} value={settings.negative} disabled={editor.busy || editor.importing} maxLength={3000} onValueChange={negative => setSettings(previous => ({ ...previous, negative }))} />}<EditResolution editor={editor} /><AnimaControlSettings editor={editor} /><AdvancedSettingsSection>
    {/* 界面：与文生图复用整个采样参数块，字段只写编辑草稿。 */}
    {/* 手动种子保留原校验；骰子开启的随机模式在提交时取值。 */}
    {/* 多个编辑模式共用状态，切换工具不会丢失刚调整的参数。 */}
    <GenerationSamplingFields namePrefix="anima" editSeed sampler={settings.samplerName} scheduler={settings.scheduler} steps={settings.steps} cfg={settings.cfg} seed={settings.seed} seedMode={editor.seedMode} onSampler={samplerName => setSettings(previous => ({ ...previous, samplerName }))} onScheduler={scheduler => setSettings(previous => ({ ...previous, scheduler }))} onSteps={steps => setSettings(previous => ({ ...previous, steps }))} onCfg={cfg => setSettings(previous => ({ ...previous, cfg }))} onSeed={seed => { editor.patch({ seedMode: 'custom' }); setSettings(previous => ({ ...previous, seed })); }} onSeedMode={seedMode => editor.patch({ seedMode })} />
    {/* 编辑特有的降噪参数作为补充，仍使用同一个滑条输入组件。 */}
    <GenerationParameterControl name="anima-denoise" label={t("create.animaEdit.denoise")} min={0} max={1} step={0.01} value={settings.denoise} onChange={denoise => setSettings(previous => ({ ...previous, denoise }))} />
  </AdvancedSettingsSection></>;
}

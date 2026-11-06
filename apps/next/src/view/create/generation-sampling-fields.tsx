"use client";
/**
 * 图片生成和编辑共用的完整采样参数块，统一菜单、滑条和种子外观。
 * 只接受受控值与回调，不读取某个模式的 Zustand，避免两页参数串写。
 * 字段范围继续由工作流入口二次校验，界面控件不是信任边界。
 */
import { Info } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { SAMPLERS, SCHEDULERS } from '@/data/createForm';
import { OptionSelect } from './OptionSelect';
import { GenerationParameterControl } from './generation-parameter-control';
import { ACCENT_FOCUS_RING_CLASS, INPUT_BORDER_CLASS } from '@/utils/layout';
import { cn } from '@/utils/cn';

// 字符串 seed 保留手工输入中的空值，最终提交再检查安全整数。
// samplerName/scheduler 是实际工作流枚举值，不是菜单的翻译标签。
// steps/cfg 使用数字，滑条与右侧输入共享相同受控来源。
// seedMode 与具体种子分开，随机模式下每次提交才生成新值。
// namePrefix 隔离多个同时挂载的模式，label 由 useId 保证唯一。
// editSeed 只保留旧编辑回归定位属性，不改变参数行为。
// 该组件仅处理参数展示与回调，不读取模型文件也不生成ComfyUI节点。
// sampler和scheduler取实时值，调用方提供当前工作流的默认或用户覆盖。
// steps/CFG为数值，seed为字符串，以免用户未提交的长整数被自动截断。
// seedMode决定输入是否启用，而不是通过某个特殊字符串隐式推断。
// 随机模式显示空占位，但草稿seed仍保留供切回custom恢复。
// namePrefix为多个同时挂载的编辑表单提供独立控件名。
// editSeed定位属性服务既有回归，不参与业务分支或参数校验。
// 回调分别描述一个字段，宿主可以使用函数式合并避免覆盖其他值。
// 组件不会自行应用工作流预设，普通图片页的预设仍由父级负责。
// 编辑特有denoise作为宿主附加行，不给所有工作流强塞无效输入。
// 枚举数据来自共享SAMPLERS/SCHEDULERS，选项更新无需维护第二份清单。
// OptionSelect提供自定义菜单，保持现有键盘导航与关闭交互。
// 数值行复用GenerationParameterControl，滑条和数字编辑使用同一个值域。
// 步骤上限100沿用原高级设置，CFG保留0到30及0.1步进。
// UI不把CFG反复round后写回，显示精度不应该改变计算链。
// seed文本输入支持numeric软键盘，但最终合法性仍由提交边界检查。
// 不使用HTML number自动格式化长整数，保留用户输入的原始字符串。
// 空字符串是未完成输入，可以先编辑，提交时给明确错误。
// 随机和自定义按钮都声明type=button，切换不能触发表单提交。
// 两种模式有aria-pressed语义，不把颜色当成唯一状态。
// 说明图标沿用原词条，多个表单中的标签与辅助提示保持一致。
// 公共块没有Zustand订阅，因此同一个实现可以连接不同模式的store。
// 禁用由宿主fieldset负责，蒙版生成时共用参数也会真正停止接收输入。
// 每次实际任务何时采样随机数由宿主提交逻辑决定，本组件不提前采样。
interface SamplingFieldsProps { sampler: string; scheduler: string; steps: number; cfg: number; seed: string; seedMode: 'random' | 'custom'; namePrefix?: string; editSeed?: boolean; onSampler: (value: string) => void; onScheduler: (value: string) => void; onSteps: (value: number) => void; onCfg: (value: number) => void; onSeed: (value: string) => void; onSeedMode: (value: 'random' | 'custom') => void }

// 枚举行沿用原文生图标签、提示图标和 OptionSelect 的关闭/键盘行为。
// ariaLabel 仍是旧文案，现有回归及辅助技术保持可定位。
// hint 只提供说明，不触发另外的浮层或修改当前参数。
// 主动传值避免 uncontrolled defaultValue 在模式切换后保留旧选项。
// 所有选项来自共享数据，新增采样器不需要同步第二份清单。
function SamplingSelect({ kind, value, onChange }: { kind: 'sampler' | 'scheduler'; value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation(), label = t(kind === 'sampler' ? 'create.advancedSettings.sampler' : 'create.advancedSettings.scheduler'), hint = t(kind === 'sampler' ? 'create.advancedSettings.samplerHint' : 'create.advancedSettings.schedulerHint');
  return <div className="space-y-1.5"><div className="flex items-center gap-2"><span className="text-sm font-medium">{label}</span><Info className="h-4 w-4 text-muted-foreground/80" aria-label={hint} /></div><OptionSelect value={value} options={kind === 'sampler' ? SAMPLERS : SCHEDULERS} ariaLabel={label} onChange={onChange} /></div>;
}
// 种子仍提供随机/自定义两种状态，骰子只是同一状态的快捷入口。
// random 下禁用值输入且显示占位，不把某个旧数字伪装成固定结果。
// 自定义使用十进制文本，禁止浏览器 number 对长整数自动格式化。
// 输入不提前 clamp，超大值交由已有提交校验报告，避免静默改变用户值。
// data-seed-value 继续支持文生图回归读取随机哨兵。
// 按钮 type=button，切种子模式不会触发表单提交。
// flex 子项 min-w-0 允许窄栏收缩，不能把整个主区撑宽。
// 两种模式都提供选中语义，颜色不是唯一反馈。
// 从完整高级设置中公开原种子控件，音频页无需再造下拉框或按钮组。
// 只要求种子字段，避免宿主为了复用它伪造 sampler、CFG 等无关参数。
// 完整 SamplingFieldsProps 仍可直接传入，图片与编辑调用不改变。
// data-seed-mode 和 data-seed-value 保持既有回归与可访问状态契约。
export function SeedFields(props: Pick<SamplingFieldsProps, 'seed' | 'seedMode' | 'onSeed' | 'onSeedMode' | 'editSeed'>) {
  const { t } = useTranslation();
  return <div className="space-y-1.5"><div className="flex items-center gap-2"><span className="text-sm font-medium">{t('create.advancedSettings.seed')}</span><Info className="h-4 w-4 text-muted-foreground/80" aria-label={t('create.advancedSettings.seedHint')} /></div><div className="flex min-w-0 gap-1"><div className="grid min-w-0 flex-1 grid-cols-2 rounded-md border border-transparent bg-muted p-0.5 dark:border-border dark:bg-background">{(['random','custom'] as const).map(mode => <button key={mode} data-seed-mode={mode} type="button" aria-pressed={props.seedMode === mode} onClick={() => props.onSeedMode(mode)} className={cn('rounded-sm text-sm', props.seedMode === mode ? 'bg-background text-foreground shadow-sm dark:bg-muted' : 'text-muted-foreground')}>{t(mode === 'random' ? 'create.advancedSettings.random' : 'create.advancedSettings.custom')}</button>)}</div><input type="text" inputMode="numeric" data-anima-seed={props.editSeed || undefined} aria-label={t('create.advancedSettings.seed')} data-seed-value={props.seedMode === 'random' ? -1 : props.seed} value={props.seedMode === 'custom' ? props.seed : ''} disabled={props.seedMode === 'random'} placeholder={t(props.seedMode === 'random' ? 'create.advancedSettings.random' : 'create.advancedSettings.seedPlaceholder')} onChange={event => props.onSeed(event.target.value)} className={cn('h-9 min-w-0 flex-1 rounded-md bg-background px-2 text-sm outline-none focus-visible:ring-1', ACCENT_FOCUS_RING_CLASS, INPUT_BORDER_CLASS)} /></div></div>;
}
// 参数顺序与原参考图一致：采样器、调度器、步数、CFG、种子。
// 编辑特有降噪由宿主附加，不伪装成普通图片必须存在的设置。
// CFG 保留一位小数展示，值本身不在组件里反复四舍五入。
// 每行复用同一滑条控件，拖动和数字编辑都走同一个回调。
// 一整个块直接复用，后续外观修改会同时作用于文生图和编辑。
export function GenerationSamplingFields(props: SamplingFieldsProps) {
  const { t } = useTranslation(), prefix = props.namePrefix ? props.namePrefix + '-' : '';
  return <><SamplingSelect kind="sampler" value={props.sampler} onChange={props.onSampler} /><SamplingSelect kind="scheduler" value={props.scheduler} onChange={props.onScheduler} /><GenerationParameterControl name={prefix + 'steps'} label={t('create.advancedSettings.steps')} hint={t('create.advancedSettings.stepsHint')} min={1} max={100} value={props.steps} onChange={props.onSteps} /><GenerationParameterControl name={prefix + 'cfg'} label={t('create.advancedSettings.cfgRatio')} hint={t('create.advancedSettings.cfgHint')} min={0} max={30} step={0.1} precision={1} value={props.cfg} onChange={props.onCfg} /><SeedFields {...props} /></>;
}

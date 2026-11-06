"use client";

/**
 * 界面：LLLite 控制强度和起止百分比，蒙版与边缘编辑共用。
 * 复用文生图的参数行和边缘检测的双端滑块，不引入第二套轨道样式。
 * 表单保存零到一的原始进度，只有显示数值使用百分数。
 * 控制项放在高级参数之前，用户无需展开即可核对模板默认值。
 */
import { useTranslation } from '@/i18n';
import type { AnimaEditState } from '@/hooks/use-anima-edit';
import { RangeIntervalSlider } from '@/components/range-interval-slider';
import { GenerationParameterControl } from '@/view/create/generation-parameter-control';

// 两端数值输入共享外观；浏览器原生 spinner 不参与视觉布局。
// fieldset 由父组件统一禁用，数值与滑块不会在生成期间出现解锁例外。
// 此组件仅修改草稿，不在鼠标滑动过程中构建、上传或提交工作流。
// 可选控制字段兼容旧快照，初次进入则直接使用模板读取值。
// 默认零起点、完整结束点与一强度均保留，不能用真值判断回填。
// 显式 mode 由调用者提供的 editor.settings 决定，不根据源图 alpha 猜测。
// 起止相等仍合法；交互夹取防止相互穿越，构建器另有独立校验。
export function AnimaControlSettings({ editor }: { editor: AnimaEditState }) {
  const { t } = useTranslation(), { settings, setSettings } = editor;
  // 文字编辑以参考 latent 工作，不显示没有实际消费者的 LLLite 控件。
  // 控制模板只对自己的补丁调参，普通编辑 LoRA 权重不受此强度影响。
  // 此 early return 不改变 Hook 次序，翻译订阅对全部模式保持一致。
  if (!settings.controlMode) return null;
  const lower = settings.controlStart ?? 0, upper = settings.controlEnd ?? 1;
  // 零结束点与零起点均按原值显示，不做隐含最小持续时间处理。
  // 父侧的固定种子或随机偏好与时间区间互相独立。
  // 更改时间端点不会改变模型、蒙版 alpha、图片尺寸或原始采样步数。
  // 同一模式在窄屏替换主区后仍保留这些数值，布局不拥有参数生命周期。
  // 标签通过 typed i18n 取值，两端的语义不会随语言改变而交换。
  // 数值输入的百分数转回节点的零到一比例后再保存。
  // 空值或非有限数忽略，避免临时 NaN 污染可见滑块。
  // 下限不能超过当前结束点，上限不能低于当前起点。
  // 使用函数式更新读取最新另一端，快速连调不会造成倒序。
  // 本地夹取仅改善交互，外部恢复的数据仍要经过构建入口检查。
  // Enter 只结束编辑，不触发外层生成表单提交。
  // 双端滑块已提供两端键盘交互，数值框则允许精确指定百分比。
  // 布局 min-w-0 保证窄屏输入不撑开右侧固定宽度参数栏。
  const endpoint = (key: 'controlStart' | 'controlEnd', number: number) => { if (Number.isFinite(number)) setSettings(previous => ({ ...previous, [key]: key === 'controlStart' ? Math.min(previous.controlEnd ?? 1, Math.max(0, number / 100)) : Math.max(previous.controlStart ?? 0, Math.min(1, number / 100)) })); };
  return <section data-anima-control-settings className="min-w-0 space-y-3">
    {/* 界面：控制强度复用完整参数行，数值与轨道写入同一字段。 */}
    {/* 默认值来自模板，手动调整后在切换工具和返回时保留。 */}
    {/* 强度零是显式关闭控制，不能被回退成默认一。 */}
    <GenerationParameterControl name="anima-control-strength" label={t('create.animaEdit.controlStrength')} min={0} max={10} step={0.01} value={settings.controlStrength ?? 1} onChange={controlStrength => setSettings(previous => ({ ...previous, controlStrength }))} />
    {/* 界面：同一轨道的起止百分比，沿用既有双端滑块。 */}
    {/* 两个读屏标签分别描述起点和终点，不用颜色作为唯一反馈。 */}
    {/* 区间始终按节点原始比例保存，避免导出时再除一次百分数。 */}
    {/* 共享滑块在两端相等时也能键盘调整，不增加拖动专用状态。 */}
    <RangeIntervalSlider value={{ lower, upper }} lowerLabel={t('create.animaEdit.controlStart')} upperLabel={t('create.animaEdit.controlEnd')} onChange={range => setSettings(previous => ({ ...previous, controlStart: range.lower, controlEnd: range.upper }))} />
    {/* 界面：两端精确百分数，独立标签和当前有效 min/max 保持可访问。 */}
    {/* 输入禁用继承父 fieldset，锁定状态与强度参数保持一致。 */}
    {/* 数值框不引入独立草稿，手动输入与滑块反馈实时同步。 */}
    {/* 纯百分数显示不改变 JSON 节点的 start_percent/end_percent 单位。 */}
    <div className="flex min-w-0 justify-between gap-3">{(['controlStart', 'controlEnd'] as const).map(key => <label key={key} className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">{t(key === 'controlStart' ? 'create.animaEdit.controlStart' : 'create.animaEdit.controlEnd')}<span className="flex items-center gap-1"><input data-control-endpoint={key} type="number" min={key === 'controlStart' ? 0 : lower * 100} max={key === 'controlEnd' ? 100 : upper * 100} step={1} value={Math.round((key === 'controlStart' ? lower : upper) * 100)} onChange={event => endpoint(key, event.target.valueAsNumber)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} className="h-8 w-16 rounded-md border border-border bg-background text-center text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />%</span></label>)}</div>
  </section>;
}

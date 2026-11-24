"use client";

// 视频数字入口直接复用画布浮层、胶囊与自定义输入样式，不单独维护一套菜单几何。
// 草稿像铅笔写的预约时间，确认后才盖章：键入过程不改节点，取消就丢弃这次草稿。
import { useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { SegmentedControl } from "./components";
import { ParameterPopover } from "./parameter-popover";

// 调用方注入单位、步进和预设，控件不决定视频帧率、源文件时长或生成服务规则。
// value为确认数字，不是字符串草稿；父节点负责持久化与撤销。
// duration的显示需要一位小数，帧相关数字仍保留整数，由调用方format明确表达。
// 独立实例各有草稿，不使用模块变量保存最后一次输入。
// marker仅用于浮层身份，不能把DOM属性作为生成请求参数来源。
interface Props { marker: string; label: string; value: number; step: number; max?: number; presets: readonly number[]; format: (value: number) => string; formatPreset?: (value: number) => string; disabled?: boolean; onChange: (value: number) => void }

// 每次打开重新挂载字段，初值来自确认参数而非上次取消的半成品。
// 空串先拒绝再转数字，避免JavaScript把空输入悄悄解释成零。
// 自定义只接受步进约束内的安全数；不会把小数帧偷偷四舍五入成整数。
// 同一commit用于Enter和失焦，鼠标与键盘不能拥有两套合法性规则。
// 错误显示在原浮层，非法值不关闭菜单、不提交父节点、不污染历史。
// 最大值是安全精度边界，不是服务能力承诺，真实执行仍需服务约束。
// 浮点误差只容忍表示层级的偏差，不允许不符合步进的实际小数。
// Escape由原ParameterPopover处理，卸载草稿并将焦点还给原触发器。
// 输入单位由label表达，不能要求用户在数字框里自己填写“秒”或“帧”。
// 不读取媒体currentTime，也不启动播放器或定时器，参数菜单没有播放副作用。
// 父级一次onChange是一次原工程事务，不能在keyup时产生几十个撤销快照。
// 预设确认与自定义确认同样不会触发视频生成，执行按钮仍遵守原禁用边界。
// NumberDraft只在custom=true时挂载；关闭菜单会连同输入错误一起释放。
// 打开菜单不修改参数；自定义按Enter或离开字段才提交，Escape丢弃草稿。
// draft保留字符串形态，用户删掉全部数字时空白能够暂时存在，不被旧值顶回。
// 输入框的min与step只是浏览器辅助提示，commit再次校验才能保护粘贴和脚本输入。
// next除以step转换成单位数；时长步进0.1时3.5秒对应35个单位。
// 单位数必须接近安全整数，3.55秒对应35.5单位，因此留在错误草稿中。
// 二进制浮点可能把3.5除0.1算成极微小偏差，容差只消除这类表示误差。
// 正数但小于一个step的输入也失败，比如0.01秒不能保存成0.0秒。
// 单位数超出安全整数时拒绝，避免显示数字与JSON恢复后的数字不一致。
// 错误文本通过step插值解释实际限制，不写死“必须整数”而误导小数秒用户。
// 已确认value不会在setError时变化，原入口继续显示上次合法配置。
// 用户在错误后继续输入可以再次提交，不要求关闭整个参数面板才能修正。
// 草稿确认只调用一次onChange，随后close卸载输入避免失焦再发第二笔事务。
// close由本浮层传入，不调用全局关闭，所以其他节点或侧栏的状态不被重置。
// 错误小字使用role=alert，视觉边界之外也能由辅助工具感知提交失败。
// aria-invalid与错误状态同源，不出现提示错误但字段却声称合法的分叉。
// 没有document级Enter监听，隐藏面板不会拦截其他表单的回车。
// 数值输入聚焦交给原浮层层级，不申请系统窗口焦点或创建额外原生对话框。
// 步进差异由参数传入，不在输入组件里根据中文label猜“秒”或“帧”。
// format只用于摘要与预设，输入框内部始终是不带单位的纯数字字符串。
function NumberDraft({ value, step, max, label, disabled, onChange, close }: Props & { close: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState(false);
  // Enter关闭会引发失焦，像盖过章的票据不能再盖一次；Escape也先标记取消再还焦点。
  const finished = useRef(false);
  const commit = () => {
    if (finished.current) return;
    const next = Number(draft), units = next / step;
    if (!draft.trim() || !Number.isFinite(next) || next < step || next > (max ?? Number.MAX_SAFE_INTEGER) || !Number.isSafeInteger(Math.round(units)) || Math.abs(units - Math.round(units)) > 1e-8) { setError(true); return; }
    finished.current = true;
    onChange(next); close();
  };
  return <div className="hy-quality-custom hy-number-custom" onKeyDown={event => {
    if (event.key === "Escape") finished.current = true;
    if (event.key === "Enter") { event.preventDefault(); commit(); }
  }}>
    {/* 自定义数字：只显示下划线输入，错误不写回已确认参数。 */}
    <input autoFocus aria-label={label} type="number" min={step} max={max} step={step} disabled={disabled} value={draft} aria-invalid={error} onChange={event => setDraft(event.target.value)} onBlur={event => {
      // 改选预设时让该按钮完成确认，不先提交旧草稿并卸载即将点击的目标。
      if (event.relatedTarget instanceof Element && event.relatedTarget.closest(".hy-parameter-options")) return;
      commit();
    }} />
    {error && <small role="alert">{t("canvas.videoNumberInvalid", { step: String(step) })}</small>}
  </div>;
}

// 一个浮层同时服务预设和自定义，避免打开第二层遮罩后焦点返回到已卸载按钮。
// 每次打开重置“正在自定义”的临时视图，已经确认的数字仍从节点读取。
// 预设使用数值比较表示选中，翻译后的单位不会成为业务身份。
// preset按钮的文案经过同一format，因此5秒预设和5.0秒入口不会指向不同单位。
// 没有预设时仍保留自定义入口，可用于只允许用户明确输入的帧数参数。
// 自定义取消不会恢复旧预设，因为这期间确认参数根本没有变化。
// disabled由宿主在真正任务期间传入，未接任务不伪造“处理中”。
// 菜单沿用黑白主题变量，同一DOM适配两种主题，无新配色或独立侧栏。
// 同个页面有多个数字菜单时各自拥有open与custom，不能一开全部展开。
// 只输出参数意图，不生成虚假的结果、扣费或完成提示。
// format是外部明确的单位契约，2秒与2帧即使数字相同也不能共享一个显示函数。
// presets是只读集合，展示过程不得排序或修改调用方传入的数组。
// 当前value如果不在预设列表，菜单不制造错误的默认选中，入口仍显示真实值。
// 用户点已确认预设时仍走父级回调，父级原事务负责去重而非控件缓存旧参数。
// custom状态仅描述菜单正在展示输入，不作为“已选自定义”写入作品。
// 关闭再打开会清掉未确认输入，value仍是上一次已经提交的数字。
// 原浮层使用稳定触发ref做焦点返回，多个同名按钮不会相互抢焦点。
// 原外部点击监听在浮层卸载时清理，此组件不用再安装一套document订阅。
// 原参数外壳的nowheel区域会隔离画布滚轮，不为数字输入另建画布坐标系统。
// custom输入沿用hy-quality-custom样式，避免时长字段与宽高字段出现两套字号。
// 模型切换由父节点拥有，菜单不根据预设选择擅自更换MiniMax模板身份。
// 当前媒体可能仍是旧生成结果，调整下一次时长不会伪装成旧视频已经变长。
// 节点复制后标量参数可独立替换，组件不持有指向另一个节点data的可变对象。
// 这些局部状态不需要Zustand，也不会被写进用户文档的项目快照。
// disabled同时作用原生胶囊，不能只改透明度留下可打开的假禁用入口。
/** 同一选择条既能放进独立参数浮层，也能直接装进超分设置，避免嵌套浮层被裁切。 */
export function VideoNumberOptions(props: Props & { close: () => void }) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState(false);
  const options = [...props.presets.map(value => ({ id: String(value), label: (props.formatPreset ?? props.format)(value) })), { id: "custom", label: t("create.imageSizeSection.custom") }];
  return <div>
    <div className="hy-parameter-options"><SegmentedControl label={props.label} items={options} value={custom ? "custom" : String(props.value)} disabled={props.disabled} onChange={value => {
      if (value === "custom") { setCustom(true); return; }
      props.onChange(Number(value)); props.close();
    }} /></div>
    {custom && <NumberDraft {...props} close={() => { setCustom(false); props.close(); }} />}
  </div>;
}

export function VideoNumberPicker(props: Props) {
  return <ParameterPopover marker={props.marker} label={props.format(props.value)} disabled={props.disabled}>{close => <VideoNumberOptions {...props} close={close} />}</ParameterPopover>;
}

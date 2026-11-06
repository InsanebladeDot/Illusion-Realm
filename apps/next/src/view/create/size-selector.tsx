"use client";

// 图片与视频共用的受控尺寸 UI；不读取业务 store，不请求接口，不计算模型分辨率。
import { Ruler } from "lucide-react";
// 输入中的原始文字属于此输入框，不写入全局已确认尺寸。
// 宽高各自持有草稿，不会因另一边输入或页面重渲染互相覆盖。
// 复用 React 局部状态即可，不新增第二套尺寸业务 store。
import { useEffect, useRef, useState } from "react";
import type { ImageSizePreset } from "@/data/imageSizes";
import type { ImageSizeInput } from "@/utils/imageSize";
// 与生成和恢复草稿使用同一倍率规范化入口，显示不能独自取整。
// UI 只提交确认后的值，图片/视频适配层继续决定最终像素。
// 不复用整数输入控件，否则 1.5 倍会被 parseInt 错误截为 1。
import { clampSizeScale } from "@/utils/imageSize";
import { useTranslation } from "@/i18n";
import { ACCENT_SELECTED_OUTLINE_CLASS, INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
import { AspectRatioIcon } from "./AspectRatioIcon";
import { RangeSlider } from "./RangeSlider";

interface SizeSelectorProps {
  value: ImageSizeInput;
  dimensions: { width: number; height: number };
  presets: readonly ImageSizePreset[];
  min: number;
  // 不传上限表示图片自由输入，不能把 Infinity 输出成 HTML 属性。
  // 视频仍显式传 max，继续展示并校验原有的合法范围。
  // 只改变可选参数，不拆成两份重复的尺寸 UI。
  max?: number;
  step: number;
  className?: string;
  hint?: string;
  scale?: number;
  // 倍率范围由业务注入，不根据页面名或图片/视频标志猜测。
  // 图片省略上限，视频传 1；数值编辑与滑条共用这个约束。
  // 这与 width/height 的 max 分开，像素上限不等于倍率上限。
  // 旧调用方不传这个可选字段即可继续使用图片策略，不增加必填参数。
  // 约束只影响确认后的倍率，输入中可以暂时清空，不能边输入边夹取。
  // 适配层仍须在提交前自行校验，UI 限制不能替代业务校验。
  scaleMax?: number;
  onScaleChange?: (scale: number) => void;
  onPresetChange: (id: string) => void;
  onCustomSizeChange: (size: { width?: number; height?: number }) => void;
}
const SIZE_BUTTON_CLASS = "flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-all hover:bg-accent/50";

// 滑条和倍率文字是同一个受控值的两种入口，不各自保存一份正式尺寸。
// 像先在草稿纸上改数字，确认后才把新倍率交给负责尺寸的调用方。
// 组件只持有草稿，多个选择器实例不会共享尚未提交的输入。
// 图片与视频的差异只有 max 参数，键盘、焦点、样式和提交逻辑共同维护。
function SizeScaleControl({ scale, max, onChange }: { scale: number; max?: number; onChange: (scale: number) => void }) {
  const { t } = useTranslation();
  // null 表示浏览态；空字符串表示用户正在清空，不能误当成 0 倍。
  // 草稿以文字保存，允许 1.、2. 等尚未完成的小数写完再确认。
  // 输入过程中不调用父回调，防止一个按键就改变生成尺寸。
  // 外部 scale 变化只有在浏览态才回显，编辑中的笔迹不被重渲染覆盖。
  // 父层持久化只看到 onChange 的确认值，不会保存空字符串或 1. 的半成品。
  // 取消不需要写回旧倍率，因为编辑之前根本没有覆盖它。
  // 组件卸载也不会自动提交草稿，避免离开页面时意外改变生成设置。
  // 选择预设引起的正式值变化仍由父层负责，不把倍率草稿当预设身份。
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = draft !== null;
  // 只在进入编辑时聚焦并全选，用户可以直接键入新倍率。
  // 依赖 editing 而不是 draft，避免每按一个键就再次全选覆盖输入。
  // 引用的是当前实例的输入框，不能用 document 查询误选其他尺寸控件。
  // 输入只在客户端交互后出现，静态导出和首帧不读取浏览器对象。
  // fieldset 的禁用同时覆盖按钮和输入，不新增绕过生成期间只读的入口。
  // 不用全局选择器找输入，其他创建面板可以同时挂载自己的实例。
  // ref 在输入卸载时清空，后续重进编辑不会操作已经移除的 DOM。
  // 聚焦不修改 draft，辅助技术读取到的是已选中且可编辑的数值。
  // 全选发生在输入挂载后，避免双击剩余的原生文字选择覆盖新值。
  useEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing]);
  // 失焦是唯一提交边界，Enter 也通过 blur 进入，避免一轮操作提交两次。
  // 空稿、负数、零和非有限数恢复原值，不把 NaN 写进全局表单。
  // Number 校验完整字符串，不会把 2abc 当成合法的 2 倍。
  // 一位小数由公共规范化入口处理，外部也不会收到隐藏的多余精度。
  // onChange 只报告数值，最终宽高仍走原来的整数像素对齐链。
  // max 由视频适配层提供，不能通过手输绕过视频的旧范围。
  // 确认前退出草稿态，受控 scale 更新后显示最终规范值。
  // 取消直接清掉草稿，不触发这里，也不还原已确认的其他表单字段。
  // 浏览器文本可以表示指数形式，仍需用有限数检查挡住无穷值。
  // 对小于 0.1 的正值沿用最小倍率，不把负数改造成用户从未要求的缩图。
  // 缩放只发出一次确认意图，图片与视频自行决定各自的像素步进。
  // 同一素材尺寸在多次切换后应可回到原值，不能以当前摘要作下一次基准。
  const commit = () => {
    const parsed = draft?.trim() ? Number(draft) : NaN;
    setDraft(null);
    if (Number.isFinite(parsed) && parsed > 0) onChange(clampSizeScale(parsed, max));
  };
  // 图片滑条给常用的 1.x、2.x、3.x 留出空间；手输更大值时延展显示范围。
  // 这个范围只决定滑条刻度，图片倍率本身不新增硬上限。
  // 视频显式 max=1 时仍保持原来的滑条区间，避免共用 UI 改变视频业务。
  // 两种提示分别说明是否有上限，不再用旧的 0.1–1 提示误导图片用户。
  // 提示文字通过 i18n 生成，语言切换不改变倍率或正在输入的草稿。
  // 常用滑条上界与输入允许范围分开，输入框不输出 Infinity 作为 HTML 属性。
  // 超过常用范围的已确认值仍完整显示，不为放进滑条而截断实际参数。
  // max 保持可选也能表达同构调用的范围，本次只接图片和现有视频入口。
  const hint = max === undefined ? t("create.imageSizeSection.scaleHint") : t("create.imageSizeSection.scaleLimitedHint", { max });
  return <div data-size-scale className="flex shrink-0 items-center gap-2" title={hint}>
    <span className="flex h-5 w-14 items-center px-1">
      {/* rail：倍率滑条保留，拖动与文字输入确认后使用同一个回调。 */}
      {/* 图片调整的是基准宽高，UI 不直接改预设或覆盖自定义基准。 */}
      {/* 禁用由外层 fieldset 继承，不在此读取页面 store 或生成任务。 */}
      <RangeSlider min={0.1} max={max ?? Math.max(4, Math.ceil(scale))} step={0.1} value={scale} onChange={onChange}
        ariaLabel={t("create.imageSizeSection.scale")} trackClassName="h-1 bg-muted-foreground/20"
        fillClassName="bg-foreground/60" thumbClassName="h-3 w-3 border-input bg-background" />
    </span>
    {/* rail：浏览态和编辑态占相同宽度，双击时不挤动尺寸摘要或滑条。 */}
    {/* 倍率单位放在输入框外，避免用户必须删掉 × 才能输入数字。 */}
    {/* 原生按钮提供 Tab 焦点、键盘入口与 disabled 继承，不用不可聚焦 span。 */}
    {/* 尺寸选择器可能出现多个实例，输入通过 ref 定位，不使用重复固定 id。 */}
    {/* 浏览按钮上的可访问名称与输入框一致，切换形态后仍是同一个倍率操作。 */}
    {/* 倍率文字与宽高摘要区分单位，× 不会被当作某一边的像素数。 */}
    {/* 编辑入口保持在正常文档流里，不使用浮层以免窄栏时被裁切。 */}
    {/* 只有确认后才改变摘要，辅助技术不会随每个中间字符读出新像素。 */}
    {editing ? <span className="flex w-12 items-center gap-0.5 text-[11px] text-muted-foreground">
      {/* 小数草稿使用文本框，原生 number 会在 1. 这类中间状态提前清洗值。 */}
      {/* decimal 提供合适的输入键盘，数值范围仍在确认入口按业务 max 处理。 */}
      {/* 不把原生 step 的有效性当校验，1.26 可以完整输入后规范为 1.3。 */}
      <input ref={inputRef} type="text" inputMode="decimal" value={draft}
        data-size-scale-input aria-label={t("create.imageSizeSection.scale")} title={hint}
        // 仅修改草稿，允许先清空再键入；摘要与实际生成仍读取确认值。
        // blur 包含鼠标点到其他控件与 Tab 离开，两者遵循相同确认规则。
        // 切换页面卸载时草稿自然释放，不把未提交内容写入用户文档。
        onChange={(event) => setDraft(event.target.value)} onBlur={commit}
        // 输入法的 Enter 是确认文字，不提前提交尺寸或触发生成。
        // Enter 主动 blur，使数值提交只执行一次，不额外调用 commit。
        // Escape 丢弃局部草稿，不把当前未确认数字传给父层。
        // 这两个按键停止冒泡，避免外层快捷键误处理成生成或关闭工作区。
        // 普通数字键、Tab 和方向键继续保留输入框原生行为。
        // 数字校正留到提交入口，键盘事件本身不重复执行像素对齐。
        // 空格不是确认键，不通过默认表单动作提交倍率。
        // 组合输入只判断 nativeEvent 的真实状态，不靠超时猜测输入是否结束。
        // 失焦由浏览器负责移动焦点，不在点击别的控件时把焦点强行抢回。
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || !["Enter", "Escape"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          if (event.key === "Escape") setDraft(null);
          else event.currentTarget.blur();
        }}
        // 文本框保留紧凑倍率文字的占位，不增加会挤占空间的原生数字箭头。
        // 焦点边界读取现有语义变量，深浅主题不另建一套硬编码配色。
        // w-full 配合 min-w-0，让一位小数在窄 rail 中仍有稳定编辑空间。
        className="h-6 w-full min-w-0 rounded border border-input bg-background px-0.5 text-right tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />×
    </span> : <button type="button" data-size-scale-value aria-label={t("create.imageSizeSection.scale")} title={hint}
      // 双击进入编辑，单击只聚焦，不与旁边拖动滑条争夺操作。
      // detail=0 的点击来自键盘或辅助技术，也允许直接进入同一编辑流程。
      // 开始时使用已确认的一位小数，不把上一轮取消的草稿重新带回来。
      onDoubleClick={() => setDraft(scale.toFixed(1))}
      onClick={(event) => { if (event.detail === 0) setDraft(scale.toFixed(1)); }}
      // 原生按钮的键盘合成 click 依赖浏览器默认动作，嵌入环境不一定送达。
      // Enter 和空格显式进入编辑，与鼠标双击走同一个草稿状态。
      // preventDefault 防止 Enter 再合成一次点击或触发外层表单提交。
      // 空格也不应滚动 rail，否则聚焦倍率时会把正在编辑的位置移走。
      // stopPropagation 只覆盖两个激活键，不拦截 Tab 等正常焦点导航。
      // 这不是给普通单击增加编辑行为，鼠标仍需要双击才打开输入。
      // 输入法确认中的 Enter 保留给输入法，不提前替换倍率按钮。
      // 用同一份 scale 初始化，键盘不会读到上轮输入留下的草稿。
      // 无须监听 document，隐藏或卸载的尺寸面板不会抢走全局按键。
      // 按钮的 disabled 仍由浏览器处理，禁用时不进入这个事件流程。
      // 辅助技术产生的 click 继续保留上面的入口，不强制要求物理键盘。
      // 此处仅改变编辑形态，不在按键时直接计算或持久化宽高。
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || !["Enter", " "].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); setDraft(scale.toFixed(1));
      }}
      // 显示与输入共用 w-12，状态切换不会导致 header 宽度来回跳动。
      // hover 只强调可编辑性；明确的 focus-visible 服务键盘操作。
      // disabled 样式继承 fieldset，生成期间倍率文字也不应看起来可点击。
      className="h-6 w-12 rounded text-right text-[11px] tabular-nums text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed">
      {scale.toFixed(1)}×
    </button>}
  </div>;
}

// 标题仍只拼装调用方算好的宽高，不因新增倍率编辑而再乘一次。
// 同一 scaleMax 传入真实控件，避免参数只停留在表单接口而未生效。
// 图片和视频继续共用摘要、布局与一位小数显示，不新增第二套 header。
function SizeSelectorHeader({ value, dimensions, scale, scaleMax, onScaleChange }: SizeSelectorProps) {
  const { t } = useTranslation();
  return <div className="flex items-center justify-between gap-2">
    <label className="shrink-0 text-sm font-medium">{t("create.imageSizeSection.title")}</label>
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
      <span className="whitespace-nowrap text-xs text-muted-foreground"><span data-size-dimensions>{dimensions.width} × {dimensions.height}</span>
        {value.mode === "custom" ? t("create.imageSizeSection.customLabel") : t("create.imageSizeSection.aspectRatioLabel", { ratio: value.aspectRatio })}</span>
      {/* 业务仅注入倍率上限，范围校验不靠组件名或预设标签猜测。 */}
      {/* 已确认尺寸来自 dimensions，手输过程不会临时显示小数像素。 */}
      {/* 原始宽高仍归所属表单，切换倍率不会覆盖另一创作模式。 */}
      {scale !== undefined && onScaleChange && <SizeScaleControl scale={scale} max={scaleMax} onChange={onScaleChange} />}
    </div>
  </div>;
}

function SizePresetButton({ preset, selected, onClick }: { preset: ImageSizePreset; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" title={`${preset.label} · ${preset.width}×${preset.height}（${preset.note}）`}
      aria-pressed={selected} data-size-preset={preset.id} onClick={onClick}
      className={cn(SIZE_BUTTON_CLASS, INPUT_BORDER_CLASS, selected && ACCENT_SELECTED_OUTLINE_CLASS)}>
      <span className="flex items-center gap-1 whitespace-nowrap">
        <AspectRatioIcon ratio={preset.id} className="shrink-0 text-foreground/70" /><span>{preset.label}</span>
      </span>
      <span className="truncate text-[10px] font-normal text-muted-foreground">{preset.width}×{preset.height}</span>
    </button>
  );
}

function SizePresetGrid({ value, presets, max, onPresetChange, onCustomSizeChange }: SizeSelectorProps) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-4 gap-1">
      {presets.map((preset) => <SizePresetButton key={preset.id} preset={preset}
        selected={value.mode === "preset" && value.aspectRatio === preset.id} onClick={() => onPresetChange(preset.id)} />)}
      <button type="button" aria-pressed={value.mode === "custom"} data-size-preset="custom"
        onClick={() => onCustomSizeChange({ width: value.customWidth, height: value.customHeight })}
        className={cn(SIZE_BUTTON_CLASS, INPUT_BORDER_CLASS, value.mode === "custom" && ACCENT_SELECTED_OUTLINE_CLASS)}>
        <span className="flex items-center gap-1 whitespace-nowrap"><Ruler className="h-[18px] w-[18px] shrink-0 text-foreground/70" />
          <span>{t("create.imageSizeSection.custom")}</span></span>
        {/* 图片显示无上限，视频显示实际数值，不能出现 undefined 或 Infinity。 */}
        {/* 该标签只解释输入范围，像素对齐仍由调用方的计算策略决定。 */}
        {/* 预设卡片的尺寸保持原值，不因自定义开放而修改模型默认分辨率。 */}
        <span className="truncate text-[10px] font-normal text-muted-foreground">{max === undefined ? t("create.imageSizeSection.unlimited") : `≤ ${max}`}</span>
      </button>
    </div>
  );
}

function SizeInput({ side, value, min, max, step, onChange }: {
  // max 为空时 React 会省略原生上限，键盘输入不会仍受隐藏的 1500 限制。
  // min 和 step 来自图片或视频适配层，公共输入不强加 H3 对齐。
  // value 和回调保持受控，已输入的大尺寸可以正常回显。
  side: "width" | "height"; value: number; min: number; max?: number; step: number; onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  // 像填写纸表：先允许把整串数字写完，交表时才检查尺寸。
  // null 表示没有草稿，显示父层已经按图片或视频规则确认的值。
  // 空字符串则是正在清空输入，两者不能都当成数字零。
  // string 保留 1、12 等中间状态，不让最小值或像素对齐抢改笔迹。
  // 另一边提交会使父层重渲染，当前草稿仍保留直到自己的编辑结束。
  // 没有草稿时外部预设、缩放和恢复参数仍可直接更新显示。
  const [draft, setDraft] = useState<string | null>(null);
  // 失焦与回车共用提交边界，范围和步进仍由调用方的原回调处理。
  // 输入为空或浏览器判为无效时恢复上次确认值，不发送 NaN 或零。
  // 检查有限数值保留原先的非法参数保护，不增加图片宽高上限。
  // 先退出草稿态再调用父回调，校正结果由新的 value 自然回显。
  // 不在 onChange 调父回调，避免输入第一个 1 就触发 8/64 的最小值。
  // 没编辑过就离开时不提交，防止纯聚焦意外重置尺寸缩放。
  // 不依赖原生 checkValidity：未对齐的整串数字也应交给业务规则校正。
  // Number 保留小数输入，最终取整只由图片或视频的原适配层执行。
  // 科学计数法仍按 number 输入的原生含义解析，不另造一套解析器。
  // 极长数字若溢出为 Infinity，沿用无效草稿的恢复路径。
  // 负数和零是有限数，交给父层最小边长校正，而非在此静默丢弃。
  // 只提交当前边，父层仍负责保留另一边的宽度或高度。
  const commit = () => {
    if (draft === null) return;
    const parsed = draft.trim() ? Number(draft) : NaN;
    setDraft(null);
    if (Number.isFinite(parsed)) onChange(parsed);
  };
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{t(side === "width" ? "create.imageSizeSection.width" : "create.imageSizeSection.height")}</span>
      {/* rail：尺寸输入保留未完成文字，摘要与生成参数继续使用已确认值。 */}
      {/* min/max/step 仅描述有效结果，父层不会在每个按键后立即夹取。 */}
      {/* 大图仍不传 max，MiniMax 视频继续传自己的 32 像素步进与范围。 */}
      <input type="number" inputMode="numeric" min={min} max={max} step={step} value={draft ?? value} data-size-dimension={side}
        aria-label={t(side === "width" ? "create.imageSizeSection.customWidth" : "create.imageSizeSection.customHeight")}
        // 只缓存当前文本，允许清空重填，不把中间结果持久化到用户设置。
        // 校正发生在 blur，点击生成按钮前的正常失焦同样会提交尺寸。
        // 输入框卸载时局部草稿释放，已确认的全局尺寸仍保留。
        onChange={(event) => setDraft(event.target.value)} onBlur={commit}
        // 回车先结束编辑，避免原生表单因未对齐数值拒绝用户的确认动作。
        // blur 统一执行提交，不再额外调用 commit 导致同次回车提交两遍。
        // 输入法组合期间的 Enter 属于确认文字，不应提前结束字段编辑。
        // 其他按键保留原生行为，Tab、方向键与鼠标点击仍可正常使用。
        // preventDefault 只阻止本次 Enter 的隐式表单提交，不阻止生成按钮。
        // 退出草稿后同一元素继续显示对齐结果，焦点不会跳到其他尺寸字段。
        // 键盘确认不会等待浏览器原生 stepMismatch 校验，1209 仍能正确提交。
        // 失焦后不保留旧文字副本，后续恢复生成参数时可显示新的受控值。
        // 本处理器只结束输入，不直接创建任务，生成仍使用原按钮入口。
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.currentTarget.blur();
        }}
        className={cn("h-8 min-w-0 flex-1 rounded-md bg-background px-2 text-center text-sm shadow-none focus-visible:outline-none focus-visible:ring-1", INPUT_BORDER_CLASS)} />
    </label>
  );
}

function SizeSelectorHint({ value, presets, min, max, step, hint }: SizeSelectorProps) {
  const { t } = useTranslation();
  const note = presets.find((preset) => preset.id === value.aspectRatio)?.note ?? t("create.imageSizeSection.presetNoteFallback");
  // 提示与 input 使用同一 max 参数，避免已放开输入但仍显示旧上限。
  // 自定义图片明确告知没有上限，同时说明实际仍按像素步进对齐。
  // 视频保留带最小值与最大值的原提示，不误显示为图片自由尺寸。
  const customHint = max === undefined ? t("create.imageSizeSection.customUnlimitedHint", { step })
    : t("create.imageSizeSection.customHint", { min, max, step });
  // 预设说明也要移除图片旧上限，不能只修复自定义模式的文案。
  // 调用方显式提供的提示仍优先，视频专用说明因此保持原样。
  // 新词条同步双语，公共组件不硬编码中文或英文。
  const presetHint = max === undefined ? t("create.imageSizeSection.presetUnlimitedHint", { note })
    : t("create.imageSizeSection.presetHint", { note, max });
  return <p className="text-[11px] leading-relaxed text-muted-foreground">{value.mode === "custom"
    // 界面：自定义展示对应约束，预设优先展示调用方的模型说明。
    // 两种文案只影响提示，不在渲染时更改用户已保存的尺寸。
    // 相同规则同时服务图片和视频，减少两套表单的样式分叉。
    ? customHint : hint ?? presetHint}</p>;
}

export function SizeSelector(props: SizeSelectorProps) {
  const { value, min, max, step, onCustomSizeChange } = props;
  return (
    <div data-size-selector className={cn("space-y-2", props.className)}>
      {/* 界面：右上角显示实际宽高；缩放滑条按调用方传入的比例返回选择 */}
      <SizeSelectorHeader {...props} />
      <SizePresetGrid {...props} />
      <SizeSelectorHint {...props} />
      {value.mode === "custom" && <div className="flex items-center gap-2">
        <SizeInput side="width" value={value.customWidth} min={min} max={max} step={step} onChange={(width) => onCustomSizeChange({ width })} />
        <SizeInput side="height" value={value.customHeight} min={min} max={max} step={step} onChange={(height) => onCustomSizeChange({ height })} />
      </div>}
    </div>
  );
}

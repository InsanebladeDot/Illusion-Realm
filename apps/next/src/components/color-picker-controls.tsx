"use client";

/**
 * 界面：二维饱和度/亮度色板、色相条，以及 RGB 精确输入。
 * 色板使用指针捕获，拖出矩形时仍能连续选择边界颜色。
 * 所有颜色只通过 onChange 交给调用方，不拥有图片或蒙版数据。
 */
import { useId, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { useTranslation } from '@/i18n';
import { clampColor, pickerFromHsv, pickerHex, pickerHsv, pickerRgb, type PickerHsv } from '@/utils/color-picker';

// 外部值始终是六位颜色，局部 HSV 只用于保留拖动精度。
// disabled 由外层显式传递，Portal 不再依赖祖先 fieldset 的继承。
// 不在此处加入 mask 标志，绘画和蒙版显示色使用完全相同的控件。
// label 由使用处提供，两个选色面板可以被辅助技术明确区分。
interface PickerControlsProps { value: string; label: string; disabled: boolean; onChange: (value: string) => void }

/**
 * XY 色板的横轴是饱和度，纵轴自上而下是亮度的倒数。
 * 坐标读取实际边界，不假设窗口缩放率或固定像素尺寸。
 * 归一化后夹取，离开色板的拖动不会产生超范围色值。
 * 宽高取至少一像素，布局暂时隐藏时也不会出现除零。
 * 仅左键启动选色，右键不意外更改画笔颜色。
 * 捕获后接收出界移动，松开时浏览器自动释放捕获。
 * 移动只有当前指针仍被捕获时才生效，悬停不会选色。
 * 不依赖 mouse buttons 字段，触摸笔也能使用相同手势。
 * 点击色板先聚焦，使后续方向键可以继续细调。
 * 左右方向键调饱和度，上下调亮度，默认步长为百分之一。
 * Shift 加速到十分之一，保留键盘快速扫过色板的能力。
 * Home/End 分别选择零饱和度和全饱和度，亮度保持不变。
 * 非选色按键不阻止默认行为，Tab 仍可离开色板。
 * 描述文本同时报告两个维度，避免只读出含糊的单一数字。
 * 检查 disabled 后才捕获或通知，生成锁不能被浮层绕过。
 * 白到透明的水平层与透明到黑的垂直层复现参考色板。
 * 色相底色为动态值，布局和边框继续使用 Tailwind 主题 token。
 * 圆形指示点保留黑白双轮廓，亮色和暗色区域均可辨认。
 * 指示点不参与命中测试，不会抢走底板的拖动事件。
 * touch-action 禁用浏览器平移，触摸拖色不会滚动整个页面。
 * color 值与指示点同步计算，不使用异步 Canvas 采样。
 * 整个色板不创建像素历史，只有后续落笔才写入绘画文档。
 * 提示文本通过 i18n，屏幕阅读器与可见面板使用同一语义。
 * 色板本身是二维控件，使用组合组角色而非误报一个一维滑块。
 * hue 条和 RGB 控件提供独立焦点，全部颜色仍可通过键盘到达。
 * 默认不捕获键盘焦点循环，用户可以通过 Tab 返回页面其他控件。
 * 使用隐藏说明节点与 aria-describedby，不把一维 slider 属性挂到 group。
 * 说明节点跟随颜色更新，但不采用 live region，避免拖动时连续打断语音。
 * 每个色板有独立说明 id，复用两个颜色字段不会指向同一个描述。
 * 隐藏说明保留键盘操作提示，视觉布局仍只有色板和指示点。
 * 嵌入式描述不依赖浏览器对较新 aria-description 属性的支持。
 * 描述中的百分比为可读整数，真实色板计算仍使用完整浮点数。
 */
function ColorArea({ hsv, disabled, onChange }: { hsv: PickerHsv; disabled: boolean; onChange: (value: PickerHsv) => void }) {
  const { t } = useTranslation(), descriptionId = useId();
  const point = (event: PointerEvent<HTMLDivElement>) => { const r = event.currentTarget.getBoundingClientRect(); if (!disabled) onChange({ ...hsv, s: clampColor((event.clientX - r.left) / Math.max(1, r.width)), v: 1 - clampColor((event.clientY - r.top) / Math.max(1, r.height)) }); };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? .1 : .01, { s, v } = hsv;
    const next = event.key === 'ArrowLeft' ? { s: s - step } : event.key === 'ArrowRight' ? { s: s + step } : event.key === 'ArrowUp' ? { v: v + step } : event.key === 'ArrowDown' ? { v: v - step } : event.key === 'Home' ? { s: 0 } : event.key === 'End' ? { s: 1 } : null;
    if (next && !disabled) { event.preventDefault(); onChange({ ...hsv, s: clampColor(next.s ?? s), v: clampColor(next.v ?? v) }); }
  };
  return <div role="group" data-color-area tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-label={t('create.colorPicker.area')} aria-describedby={descriptionId} onKeyDown={key} onPointerDown={event => { if (event.button !== 0 || disabled) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); point(event); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) point(event); }} style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }} className="relative h-36 w-full touch-none cursor-crosshair overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <span id={descriptionId} className="sr-only">{t('create.colorPicker.keyboard')} {t('create.colorPicker.position', { s: Math.round(hsv.s * 100), v: Math.round(hsv.v * 100) })}</span>
    {/* 白色层提供饱和度轴，黑色层在其上提供独立亮度轴。 */}
    {/* 两层都不写入 alpha，蒙版覆盖率不受本色板影响。 */}
    {/* 指针圆心对齐实际取色坐标，边界处允许轮廓被轻微裁切。 */}
    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,#000,transparent),linear-gradient(to_right,#fff,transparent)]" /><span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_#0008]" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
  </div>;
}

/**
 * 外部颜色是唯一提交值，局部状态只保存尚未量化的 HSV。
 * 每次色板更新同时写局部值和外部值，不以 effect 延迟同步。
 * 父组件恢复默认或其他入口改色时，直接从新 value 推导显示。
 * 灰度推导保留旧色相，亮度从零拉回时不突然跳到红色。
 * 已提交的 RGB 会舍入到字节，但指示点保持原始拖动精度。
 * 打开面板不会主动通知 onChange，不会创建无意义的脏状态。
 * 色相条范围 0..360，右端与左端同为红色，方便连续扫过。
 * 色相原生 range 保留键盘行为，外观由主题与自定义轨道决定。
 * RGB 三项使用数字输入并去掉浏览器上下箭头，保持紧凑布局。
 * 清空字段暂时不提交，使尚未完成的输入不会产生 NaN。
 * 有限数字夹取到字节，输入负数或 256 不能污染 Canvas 颜色。
 * 输入框与颜色预览处于同一行色值体系，不另存 RGB 草稿。
 * 单通道变更从当前 value 读取另外两项，不覆盖其他最新颜色。
 * Enter 只结束当前输入，不提交外层生成表单。
 * disabled 同时锁住色板、range 和数字输入，避免遗漏任一入口。
 * 当前色圆和十六进制文本提供明确反馈，色盲用户也可读取值。
 * 不使用系统 color input，打开时不会弹出操作系统的默认窗口。
 * 色相条的 thumb 由 CSS 定义，深浅主题均保持可见的白色轮廓。
 * 可见 RGB 字母是通道标识，完整无障碍名称仍走 i18n。
 * 没有吸管系统 API 权限申请，图像颜色选择工具仍保持原功能。
 * 面板尺寸由外壳限制，此组件不采用覆盖整个创作区域的布局。
 * 色值改变仅更新调用者指定字段，不触发导出、上传或生成。
 * React 受控输入会随外部重置更新，不保留与预览冲突的旧值。
 * 数字输入保留 min/max 供辅助技术识别，事件处理仍独立校验。
 * 通道顺序固定 RGB，与截图中的 R/G/B 布局一致。
 * 使用处可复用这套组件处理蒙版提示色，无需复制颜色公式。
 */
export function ColorPickerControls({ value, label, disabled, onChange }: PickerControlsProps) {
  const { t } = useTranslation(), [local, setLocal] = useState(() => ({ color: value, hsv: pickerHsv(value) }));
  const hsv = local.color === value ? local.hsv : pickerHsv(value, local.hsv.h), rgb = pickerRgb(value);
  const change = (next: PickerHsv) => { if (disabled) return; const color = pickerFromHsv(next); setLocal({ color, hsv: next }); onChange(color); };
  return <div data-color-controls className="space-y-3" onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.preventDefault(); }}>
    {/* 界面：自由选色区；面积保持固定，展开不会推挤画布或参数栏。 */}
    {/* 上部是色板，下部紧凑排列当前颜色、色相和 RGB 数字。 */}
    {/* label 来自绘画或蒙版字段，输出值不把两种用途混合。 */}
    <ColorArea hsv={hsv} disabled={disabled} onChange={change} />
    <div className="flex items-center gap-3"><span aria-hidden className="h-7 w-7 shrink-0 rounded-full border border-border" style={{ backgroundColor: value }} /><input data-color-hue aria-label={t('create.colorPicker.hue')} disabled={disabled} type="range" min={0} max={360} value={hsv.h} onChange={event => change({ ...hsv, h: Number(event.target.value) })} className="h-3 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[linear-gradient(to_right,red,#ff0,lime,cyan,blue,#f0f,red)] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:shadow-sm" /></div>
    <div className="grid grid-cols-3 gap-2">{(['red', 'green', 'blue'] as const).map((channel, index) => <label key={channel} className="space-y-1 text-center text-[11px] text-muted-foreground"><input data-color-channel={channel} aria-label={t(`create.colorPicker.${channel}`)} disabled={disabled} type="number" min={0} max={255} step={1} value={rgb[index]} onChange={event => { const n = event.target.valueAsNumber; if (!disabled && Number.isFinite(n)) onChange(pickerHex(rgb.map((v, i) => i === index ? n : v))); }} className="h-8 w-full rounded-md border border-border bg-background px-1 text-center text-xs text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" /><span>{['R', 'G', 'B'][index]}</span></label>)}</div>
    <output aria-label={label} data-color-value className="block text-center font-mono text-xs text-muted-foreground">{value.toUpperCase()}</output>
  </div>;
}

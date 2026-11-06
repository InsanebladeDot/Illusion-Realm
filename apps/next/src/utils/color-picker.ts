/**
 * 选色器的纯颜色换算：UI 使用 HSV，外部状态始终保持 #RRGGBB。
 * 仅转换 RGB，不引入 alpha，避免蒙版显示色改写覆盖率。
 * 不依赖 Canvas 或 DOM，静态导出和浏览器使用相同计算。
 */

// h 使用角度，s/v 使用闭区间 0..1。
// 将亮度和饱和度分开，二维色板可以直接映射归一化指针。
// 色相可以暂时为 360，输出时与零度红色等价。
// 不在此类型混入绘画透明度，后者属于既有笔刷状态。
export interface PickerHsv { h: number; s: number; v: number }

// 字节和指针坐标共用夹取，拖动越界仍会落在最近边缘。
// 默认区间对应饱和度/亮度；字节调用需明确传入 255。
// 调用方负责拒绝非有限输入，不能让 NaN 进入 CSS。
export const clampColor = (value: number, max = 1) => Math.max(0, Math.min(max, value));

/**
 * 将完整十六进制颜色拆为三个字节，返回顺序固定为 RGB。
 * 支持大小写，但只接受六位形式，不猜测三位简写或透明度。
 * 非法外部值回落黑色，使渲染过程不抛异常。
 * 回落不写回外部状态，避免展示阶段悄悄改变用户设置。
 * 组件正常提交总是六位格式，因此失败分支用于边界防御。
 * 每个字节单独解析，不使用有符号位运算混入 alpha。
 * 结果仅用于显示与后续换算，不携带颜色空间配置。
 */
export function pickerRgb(hex: string): number[] {
  const valid = /^#[\da-f]{6}$/i.test(hex) ? hex : '#000000';
  return [1, 3, 5].map(start => parseInt(valid.slice(start, start + 2), 16));
}

/**
 * RGB 输入只写入当前通道，其余通道维持当前外部颜色。
 * 小数四舍五入，越界夹取到 0..255，不允许生成无效 CSS。
 * 非有限输入应由控件拒绝，这里仍提供确定的黑色字节回落。
 * 两位补零保证黑色和低亮度颜色仍是标准六位格式。
 * 输出统一小写，颜色相等不受用户输入大小写影响。
 * 这个函数不更改笔刷强度，也不编码任何透明通道。
 */
export function pickerHex(rgb: number[]): string {
  return '#' + rgb.map(value => Math.round(clampColor(Number.isFinite(value) ? value : 0, 255)).toString(16).padStart(2, '0')).join('');
}

/**
 * 从 RGB 恢复 HSV；灰色和黑色没有唯一色相，保留上次 h。
 * 用户把亮度拖到零再拖回来时，不能突然丢失之前选择的色相。
 * 首次打开无历史色相时采用零度，不伪造其他持久化字段。
 * value 由最大 RGB 决定，saturation 由极差相对最大值决定。
 * 最大值为零时直接取零饱和度，避免除零。
 * 红色区间可能产生负角度，最终统一归一化到 0..360。
 * 色相分支按最大通道计算，不用近似颜色名称匹配。
 * 字节先除以 255，后续公式全部使用相同比例单位。
 * 浮点精度保留到输出阶段，色板拖动不先量化为百分整数。
 * 返回新对象，调用方局部拖动不会修改外部状态对象。
 * 无有效极差时保留 fallbackHue，使灰度编辑仍可继续选色。
 */
export function pickerHsv(hex: string, fallbackHue = 0): PickerHsv {
  const [r, g, b] = pickerRgb(hex).map(value => value / 255), v = Math.max(r, g, b), d = v - Math.min(r, g, b);
  const sector = !d ? fallbackHue / 60 : v === r ? (g - b) / d : v === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (sector * 60 + 360) % 360, s: v ? d / v : 0, v };
}

/**
 * HSV 转 RGB 采用六个连续色相扇区，支持整个环形色带。
 * 亮度为零输出黑色，饱和度为零输出等值灰色。
 * 输入色相归一化，右端 360 不会访问不存在的第七扇区。
 * 辅色 x 由当前扇区内的位置计算，保证相邻扇区连续。
 * 最低通道 m 在最后叠加，不能把亮度误作透明度。
 * 最后才转换到字节，避免中间舍入使拖动指示点跳跃。
 * pickerHex 负责字节夹取和补零，RGB 输入和色板共用格式。
 * 该函数只返回颜色值，不直接通知 store 或触发历史记录。
 * 色板采用标准 sRGB 显示梯度，没有引入色彩管理依赖。
 * 显示预览与实际笔刷使用同一六位颜色，避免两套选色结果。
 * 所有分支均有三个通道，调用方无需处理缺失数组元素。
 * 不支持 alpha 是刻意约束，透明度继续使用独立滑块。
 */
export function pickerFromHsv({ h, s, v }: PickerHsv): string {
  const sector = ((h % 360) + 360) % 360 / 60, c = v * s, x = c * (1 - Math.abs(sector % 2 - 1)), m = v - c;
  const channels = sector < 1 ? [c, x, 0] : sector < 2 ? [x, c, 0] : sector < 3 ? [0, c, x] : sector < 4 ? [0, x, c] : sector < 5 ? [x, 0, c] : [c, 0, x];
  return pickerHex(channels.map(value => (value + m) * 255));
}

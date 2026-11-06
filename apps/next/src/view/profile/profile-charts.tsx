"use client";

/**
 * 私密统计的四种图表统一交给 ECharts；这里只构造可重复的展示配置。
 * 样例数据来自已公开的界面夹具，不读取当前生成队列来冒充账户历史。
 * 实际模式读取版本化本地账本；尚无尝试的日期不伪造成功率。
 * 周期与指标开关由父面板传入，明细和卡片复用完全相同的组件。
 * 文字通过当前语言词条生成，换语言会连同图例和小时单位一起重新绘制。
 * 所有配置都由主题颜色函数生成，实例生命周期与资源释放由宿主统一处理。
 * 趋势和小时图共享坐标样式，避免某张图在深色主题下留下浅色轴标签。
 * 固定系列色延续原参考图的紫、蓝、粉、青，不改变全局应用配色。
 */
import type { EChartsCoreOption } from "echarts/core";
import { useTranslation } from "@/i18n";
import { ProfileEChart, type ChartPalette } from "@/components/profile/profile-echart";
import { REFERENCE_HOURS, REFERENCE_TREND } from "./profile-reference-data";
// 卡片和明细共用汇总参数，不在各图内部读取另一份队列。
// 主模型和 LoRA 的分母由调用方所选角色决定，不能混算。
import type { GenerationStatistics } from "@/utils/generation-statistics";
// 复用图片详情的文件名前缀格式，统计卡和明细无需各写一套路径清洗。
// 该方法只用于展示，不能拿短名字替换账本里的模型身份。
import { displayModelFileName } from "@/utils/buildGeneratedImageMeta";

/**
 * 坐标区留出实际轴标签的空间，不依赖原手绘 SVG 的固定 viewBox 比例。
 * containLabel 让窄卡片中的数字仍处于宿主宽度内，不向邻卡或外框溢出。
 * category 使用调用方提供的日期或小时文字，不能由 ECharts 猜测时区。
 * 百分比轴固定 0–100，真实失败可能使成功率低于旧样例的 96%。
 * 次数轴从零开始，由 ECharts 按当前周期自动求上限与刻度。
 * 分割线使用主题边框色，坐标文字使用弱前景色，主读数仍由 tooltip 显示。
 * 隐藏轴刻度短线和边框，使图表延续原版轻量统计卡的视觉密度。
 * axis tooltip 采用纯文本富文本渲染，不用自行拼接 HTML 格式化函数。
 * 提示框限制在宿主内，窄屏或卡片靠近窗口边缘时不被外层裁掉。
 * tooltip 的字体和背景来自当前 CSS，系统字体变化也能同步反映到图表。
 * 空类别配合空系列不会制造日期或数值，实际模式仍通过面板提示解释原因。
 * 该函数没有 DOM 副作用，可同时用于卡片和原生 dialog 内的图表。
 */
function axes(p: ChartPalette, labels: string[], percent = false): EChartsCoreOption {
  return { textStyle: { fontFamily: p.font, color: p.text }, grid: { top: 10, right: 12, bottom: 4, left: 2, containLabel: true },
    tooltip: { trigger: "axis", renderMode: "richText", confine: true, backgroundColor: p.surface, borderColor: p.border, textStyle: { color: p.text } },
    xAxis: { type: "category", data: labels, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: p.muted, fontSize: 10, hideOverlap: true } },
    yAxis: { type: "value", min: 0, max: percent ? 100 : undefined, splitNumber: 4, axisLabel: { color: p.muted, fontSize: 10, formatter: percent ? "{value}%" : "{value}" }, splitLine: { lineStyle: { color: p.border } } } };
}

/**
 * 趋势图接入真实账本后的读取约定：
 * 日期来自父面板的同一份汇总，不在图表内部另取当前时间。
 * 七天和三十天共享同一种数据形状，切换只替换坐标与系列。
 * 样例仍采用固定参考日期，实际模式采用本机日历标签。
 * 日期标签截取月日是展示行为，底层分组仍包含完整年份。
 * 同一个下标的 counts 与 rates 对应同一天，切换指标不会错位。
 * 次数趋势在实际模式表示产图张数，面板的单位词条相应使用张。
 * 成功率趋势表示任务成功率，tooltip 使用百分号。
 * 没有尝试的某一天使用 null，折线会保留未知而不是假造失败。
 * 有尝试且全部失败的某一天使用零，这与 null 的语义不同。
 * 全部成功时可以达到一百，纵轴上限依旧是百分之一百。
 * 纵轴下限使用零，真实失败率不能被旧样例的 96% 下限裁掉。
 * 次数轴由 ECharts 根据结果选上限，不能沿用成功率的固定范围。
 * 图例名称与 tooltip 名称来自同一语言词条。
 * 线条颜色和面积渐变继续沿用已有视觉方向。
 * 渐变使用相对坐标，窄窗口不会因为像素位置固定而错位。
 * 图表只构造 option，不直接调用 ECharts init 或 dispose。
 * 宿主已经处理 hidden 到可见时的尺寸恢复，本组件不增加轮询。
 * 切换 sample 后同一宿主使用 notMerge，旧日期和系列不会残留。
 * 这里只消费派生数据，不根据当前队列卡片数量重新计算总数。
 * 失败任务的已保存图片会进入次数线，任务失败仍反映在成功率线。
 * 这两条线单位不同，因此通过选择器切换而不是堆到同一纵轴。
 */
export function ProfileTrendChart({ days, success, sample, statistics }: { days: number; success: boolean; sample: boolean; statistics?: GenerationStatistics }) {
  const { t } = useTranslation(), name = t(success ? "profile.ui.success" : "profile.ui.count");
  const counts = days === 7 ? REFERENCE_TREND : [...Array.from({ length: 23 }, (_, i) => 25 + Number(i === 0)), ...REFERENCE_TREND];
  const values = sample ? counts.map((count, i) => success ? [98.4, 99, 98.7, 99.4, 98.9, 99.1, 98.9][i % 7] : count) : (success ? statistics?.rates : statistics?.counts) ?? [];
  const dates = sample ? counts.map((_, i) => new Date(Date.UTC(2025, 9, 22 - counts.length + i)).toISOString().slice(5, 10)) : statistics?.dates.map(date => date.slice(5)) ?? [];
  return <ProfileEChart kind="trend" label={name} option={p => ({ ...axes(p, dates, success), series: [{ type: "line", name, data: values, symbolSize: 5, itemStyle: { color: "#8676ff" }, lineStyle: { width: 2 }, tooltip: { valueFormatter: (value: unknown) => `${value}${success ? "%" : ""}` }, areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "#a496ff66" }, { offset: 1, color: "#a496ff00" }] } } }] })} />;
}

/**
 * 小时分布接入真实账本后的读取约定：
 * 横轴始终覆盖本机零点到二十三点，缺少产出的小时也保留位置。
 * 真实小时数据在汇总器按完成时间计算，不在图表内部解析日期。
 * 一条任务保存多张图片时，这些图片进入其完成小时的柱形。
 * 这个图表示产图时间分布，不表示 GPU 在该小时占用了多少分钟。
 * 排队跨小时不把图片摊给等待中的所有小时。
 * 手动停止已经在汇总器排除，本图不再单独实现另一种过滤。
 * 一天内没有图片时呈现零高度柱形，不能展示旧样例的中午高峰。
 * 七天与三十天切换会替换整个小时数组。
 * 真实模式不会把七天数据乘四来猜测三十天产出。
 * 样例模式的倍增规则只保留参考界面，不写入用户文档。
 * 小时文字来自当前语言，所以中文和英语的坐标单位可以切换。
 * 二十四项数据不会因为坐标文字被 hideOverlap 隐藏而丢失。
 * 鼠标悬停仍可读取没有直接显示文字的小时。
 * barMaxWidth 限制桌面上的柱宽，窄窗口则允许库自动压缩间隔。
 * 纵轴从零开始，单个高峰不会把较低小时抹掉。
 * 小时总数应与同期产图总数一致，可用作用户核对证据。
 * 模型调用不加入这份数组，挂多个 LoRA 不会让高峰柱翻倍。
 * 音频与视频尚未纳入图片账本，因此不会伪装成图片高峰。
 * 实际数组没有固定的强调中午颜色，避免暗示一个未经统计的高峰。
 * 图表宿主与明细弹窗沿用同一个公共 ECharts 生命周期。
 */
export function ProfileHoursChart({ days, sample, statistics }: { days: number; sample: boolean; statistics?: GenerationStatistics }) {
  const { t } = useTranslation(), labels = REFERENCE_HOURS.map((_, hour) => t("profile.ui.hour", { hour }));
  const data = sample ? REFERENCE_HOURS.map((base, i) => ({ value: days === 7 ? base : base * 4 + (i === 12 ? 18 : 0), itemStyle: { color: i === 12 ? "#8d76ff" : "#9aaaff", borderRadius: [2, 2, 0, 0] } })) : statistics?.hours ?? [];
  return <ProfileEChart kind="hours" label={t("profile.ui.peak")} option={p => ({ ...axes(p, labels), series: [{ type: "bar", name: t("profile.ui.count"), data, barMaxWidth: 14 }] })} />;
}

/**
 * 结果分布接入真实账本后的读取约定：
 * 当前账本只确认生成任务结果，没有可靠的图片主题分类字段。
 * 因此真实模式展示成功和失败，样例才展示人物、风景等内容分类。
 * 这个语义差异由面板传入的 sample 决定，不通过提示词关键词猜测。
 * 真实环形分母是已统计任务数，不是已保存图片数。
 * 部分失败批次属于失败任务，即使它留下了一张图片。
 * 手动停止不进入两个扇区，和成功率卡片的分母保持一致。
 * 中央总数也显示任务数，用于核对成功数加失败数。
 * 图例和 tooltip 都显示百分比，不把扇区原始任务数误称为百分比。
 * 图例的百分比从相同 slices 计算，不能与 ECharts 扇区读数分叉。
 * 没有尝试时中央显示零，图例比例显示未知。
 * 零不等于成功率零，所以没有分母时不会显示失败百分之百。
 * 零值扇区从 pie 的 data 里剔除，避免全成功时出现虚假的失败角度。
 * 关闭 showEmptyCircle，空账本不会绘制一圈暗示满额数据的圆环。
 * 环图的颜色与原有 HTML 图例按下标对应。
 * 真实模式两项图例只使用前两种颜色，其余样例颜色不参与统计。
 * 中央文字由 ECharts graphic 绘制，宿主缩放时保持同一坐标系。
 * 图例使用普通 HTML，读屏即使不悬停也能获得每种结果名称。
 * 环形半径使用百分数，所以同一组件在明细里仍保留相同比例。
 * 面板和明细使用相同 statistics，打开详情不产生第二份查询结果。
 * 组件没有写入用户数据的动作，点击查看不会增加生成次数。
 */
export function ProfileDistributionChart({ total, sample, statistics }: { total: number; sample: boolean; statistics?: GenerationStatistics }) {
  const { t } = useTranslation(), names = (["person", "scene", "illustration", "other"] as const).map(key => t(`profile.ui.${key}`));
  // 本地账本没有内容分类，真实模式展示可证明的成功/失败任务分布。
  // 取消记录已经被汇总器排除，环形分母与成功率卡片完全一致。
  // 样例人物/风景比例仍只属于显式样例，不套用到用户图片。
  const labels = sample ? names : [t("create.generationTasks.status.completed"), t("create.generationTasks.status.failed")];
  const slices = sample ? names.map((name, i) => ({ name, value: [42, 28, 15, 15][i] })) : statistics?.outcomes.map((entry, i) => ({ name: labels[i], value: entry.value })) ?? [];
  const denominator = sample ? 100 : statistics?.attempts ?? 0;
  return <div className="pr-distribution"><ProfileEChart kind="distribution" label={t("profile.ui.distribution")} option={p => ({ color: ["#8172ff", "#69c7ff", "#ec95dd", "#7edddd"], tooltip: { trigger: "item", renderMode: "richText", confine: true, formatter: "{b}: {d}%", backgroundColor: p.surface, textStyle: { color: p.text } }, graphic: [{ type: "text", left: "center", top: "36%", style: { text: sample ? String(total) : String(statistics?.attempts ?? 0), fill: p.text, font: `650 23px ${p.font}` } }, { type: "text", left: "center", top: "56%", style: { text: t("profile.ui.totalLabel"), fill: p.muted, font: `11px ${p.font}` } }], series: [{ type: "pie", radius: ["70%", "94%"], label: { show: false }, showEmptyCircle: false, data: slices.filter(entry => entry.value > 0) }] })} /><ul>{labels.map((name, i) => <li key={name}><i />{name}<strong>{denominator ? ((slices[i]?.value ?? 0) / denominator * 100).toFixed(1) + "%" : "—"}</strong></li>)}</ul></div>;
}

/**
 * 两类模型占比的读取约定：
 * role 来自面板选择，只允许主要模型或 LoRA 两种展示范围。
 * 每一类都从原始使用次数单独求和，再转换为百分比。
 * 主要模型的比例不因同一张图加载多个 LoRA 而被稀释。
 * LoRA 的比例表示同类加载使用的份额，不表示使用该 LoRA 的图片覆盖率。
 * 因此一张图上同时使用两个 LoRA 时，每个都贡献一次使用。
 * 去重已在汇总器完成，图表不会再按简短显示名合并不同文件。
 * 名称只显示文件名前缀，去掉目录和模型扩展名。
 * 完整路径仍由汇总器保留，不因展示前缀相同而合并模型用量。
 * 使用次数递减的顺序由汇总器提供，图表采用 inverse 保持首项在最上方。
 * 百分比轴固定零到一百，不把最多只有四成的模型画成满条。
 * 条尾数值保留一位小数，原始使用次数仍留在父级汇总中。
 * 舍入后各条百分比可能有零点一的总和偏差，不反向修改原始次数。
 * 没有使用过该类模型时 values 为空，显示暂无统计。
 * 不能把空 LoRA 分类替换成主模型的条形作为占位。
 * 图表使用 notMerge，切换类别后旧柱形和旧名称都会被替换。
 * 模型较多时按每行三十像素扩展实际宿主高度。
 * 外层最大高度限制在卡片内，剩余模型通过垂直滚动查看。
 * 全部模型仍保留在数据中，没有把第五个以后吞进其他类别。
 * 宿主增加高度只影响绘制几何，不改变模型数量或百分比分母。
 * 明细复用同一组件与当前角色，所以和卡片不会出现两种排序。
 * 模型来自实际产图记录，当前新安装但未使用的模型不会凭空上榜。
 * 本图不访问磁盘或 Civitai，也不为绘图重新计算模型 SHA256。
 */
export function ProfileModelUsageChart({ sample, statistics, role = "main" }: { sample: boolean; statistics?: GenerationStatistics; role?: "main" | "lora" }) {
  const { t } = useTranslation(), names = ["animaBase", "SDXL", t("profile.ui.otherModels")];
  // 一个图片的多个 LoRA 各记一次使用；百分比分母为同类使用次数之和。
  // 坐标轴与悬停提示使用同一前缀，主要模型和 LoRA 保持一致。
  // 保留全部实际模型，不把第五个以后吞进一个无法核实的“其他”。
  const entries = statistics?.usage[role] ?? [];
  const uses = entries.reduce((sum, entry) => sum + entry.value, 0);
  const values = sample ? [68, 18, 14] : entries.map(entry => Number((entry.value / uses * 100).toFixed(1)));
  // 转换发生在求和之后，只替换标签，不改变每个模型对应的数值位置。
  // 两个目录中同名前缀的文件仍是两条记录，不按短标签再次去重。
  // 明细弹窗复用本组件，因此打开明细也不会重新出现目录或后缀。
  const labels = sample ? names : entries.map(entry => displayModelFileName(entry.name));
  return <div className="max-h-60 overflow-y-auto"><ProfileEChart height={Math.max(111, labels.length * 30)} kind="models" label={t("profile.ui.modelUsage")} option={p => ({ ...axes(p, []), grid: { top: 4, bottom: 0, left: 0, right: 34, containLabel: true }, xAxis: { type: "value", min: 0, max: 100, show: false }, yAxis: { type: "category", inverse: true, data: labels, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: p.muted, fontSize: 11, width: 150, overflow: "truncate" } }, graphic: values.length ? [] : [{ type: "text", left: "center", top: "middle", style: { text: t("profile.ui.unavailable"), fill: p.muted, font: `11px ${p.font}` } }], series: [{ type: "bar", name: t("profile.ui.modelUsage"), data: values, barMaxWidth: 8, showBackground: values.length > 0, backgroundStyle: { color: p.border, borderRadius: 6 }, itemStyle: { color: "#8370ff", borderRadius: 6 }, label: { show: true, position: "right", formatter: "{c}%", color: p.muted, fontSize: 10 }, tooltip: { valueFormatter: (value: unknown) => `${value}%` } }] })} /></div>;
}

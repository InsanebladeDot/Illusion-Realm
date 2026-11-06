"use client";

// 下拉选项沿用原业务值，菜单外观、滚动与键盘操作统一复用采样器组件。
import { SimpleSelect } from "@/components/SimpleSelect";

import { useMemo, useState, type ReactNode } from "react";
import { BarChart3, Box, ChevronRight, Clock3, ImageIcon, LockKeyhole, Settings2 } from "lucide-react";
import { useTranslation, type MessageKey } from "@/i18n";
/**
 * 四类图表均由同一套 ECharts 宿主管理，卡片与明细复用当前周期。
 * 引入的别名只保留本面板原有语义，不再维护 CSS 环图或 DOM 进度条。
 * 样例开关继续传到每一类图表，实际模式不会遗留旧样例系列。
 * ECharts 仅负责可视化，指标卡仍由现有 HTML 呈现以保留读屏结构。
 * 图表不参与账户持久化，历史由独立版本化本地账本提供。
 * 这里不单独初始化实例，避免标签隐藏或 dialog 关闭时无法清理资源。
 */
import { ProfileTrendChart, ProfileHoursChart, ProfileDistributionChart as Distribution, ProfileModelUsageChart as ModelUsage } from "./profile-charts";
import { ProfileDialog } from "./profile-dialog";
// 面板订阅持久化账本，队列卡片从内存移除后统计仍然保留。
// 汇总只计算当前周期，图表与指标共用结果，避免各图分母不同。
import { useGenerationHistoryStore } from "@/stores/use-generation-history-store";
import { summarizeGenerationHistory, type GenerationStatistics } from "@/utils/generation-statistics";

/**
 * 指标复用原五张卡片，只有内容通过本地汇总参数注入。
 * 实际模式统计本机记录，显式样例仍保持隔离，不会写入用户历史。
 * 平均耗时表示成功任务的执行到落盘时间，不包含等待队列的时间。
 */
/**
 * 真实指标和样例指标的接入约定：
 * 五张原有指标卡保持相同顺序，图标与主题样式继续复用。
 * 真实总量可以是零，这表示启用账本后该周期确实没有已统计图片。
 * 成功率为 null 时用破折号，表示还没有可计算分母。
 * 成功率为数值零时显示 0.0%，不能被真假判断误换成未知。
 * 平均时长为 null 与平均时长为零同样需要明确区分。
 * 耗时先把毫秒换成秒，再交给词条附加单位。
 * 主要模型和 LoRA 的去重数量在模型卡下方分别列出。
 * 模型总数不等于模型调用次数，所以不会使用今日调用数填这张卡。
 * 积分无来源，即使存在本机生成记录也继续保持未知。
 * 样例里的涨跌对比没有对应真实历史证据，真实模式不会显示样例箭头。
 * 真实模式用已统计任务数说明成功率和耗时的观察范围。
 * 样例切换仅改变展示，不会给主文档写入 186 等参考数字。
 */
function MetricCards({ days, sample, statistics }: { days: number; sample: boolean; statistics: GenerationStatistics }) {
  const { t } = useTranslation(), long = days === 30;
  const metrics = [
    { key: "total", value: long ? "762" : "186", change: long ? "↑ 18%" : "↑ 12%", description: t("profile.ui.previous", { value: long ? "+116" : "+20" }), Icon: ImageIcon },
    { key: "success", value: long ? "98.6%" : "98.9%", change: "↑ 0.8%", description: t("profile.ui.previous", { value: "+0.8%" }), Icon: Box },
    { key: "duration", value: long ? "46s" : "42s", change: "↓ 21%", description: t("profile.ui.previous", { value: "−11s" }), Icon: Clock3 },
    { key: "models", value: long ? "9" : "6", change: "", description: t("profile.ui.primaryModel"), Icon: ImageIcon },
    { key: "points", value: long ? "8,960" : "2,480", change: "↑ 15%", description: t("profile.ui.previous", { value: "+320" }), Icon: Settings2 },
  ];
  // 没有尝试时成功率和平均时长未知；产图和已用模型数量则确实为零。
  // 积分没有可靠来源，继续保留未知，不把本机生成折算成虚构消费。
  // 模型数量为周期内不同主模型加不同 LoRA，描述明确展示两类数量。
  // 样例对比涨跌保留在显式样例，真实模式没有上一周期数据时不显示涨跌。
  const actual: Record<string, string> = { total: String(statistics.total), success: statistics.successRate === null ? "—" : `${statistics.successRate.toFixed(1)}%`, duration: statistics.averageMs === null ? "—" : t("profile.ui.seconds", { value: (statistics.averageMs / 1000).toFixed(1) }), models: String(statistics.modelCount), points: "—" };
  const summary = t("profile.ui.modelTotals", { main: statistics.mainCount, lora: statistics.loraCount });
  return <div className="pr-metrics">{metrics.map(({ key, value, change, description, Icon }) => <article className="pr-metric" key={key}>
    <span className="pr-metric-icon"><Icon size={18} /></span><p>{t(`profile.ui.${key}` as MessageKey)}</p><div><strong>{sample ? value : actual[key]}</strong>{sample && change && <span data-pink={key === "duration"}>{change}</span>}</div><small>{sample ? description : key === "models" ? summary : key === "points" ? t("profile.ui.unavailable") : t("profile.ui.attempts", { count: statistics.attempts })}</small>
  </article>)}</div>;
}

/**
 * 统计卡外壳的复用边界：
 * controls 是现有头部内的操作槽，模型分类选择通过参数注入。
 * 图表标题、图标和详情按钮继续由同一个外壳排列。
 * 趋势图有自己的指标选择，因此保留原来的独立头部结构。
 * 模型分类的业务状态留在面板，不藏进这个公共展示壳。
 * 详情按钮只通知打开意图，不在卡片内重新计算另一份统计。
 * 未提供 onDetails 时不显示无效箭头，避免让用户以为能查看不存在的内容。
 */
function ChartCard({ title, icon, onDetails, controls, children }: { title: string; icon: ReactNode; onDetails?: () => void; controls?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation();
  return <section className="pr-chart-card"><header><h3>{icon}{title}</h3>{controls}{onDetails && <button type="button" onClick={onDetails} aria-label={`${title} · ${t("profile.ui.details")}`}><ChevronRight size={15} /></button>}</header>{children}</section>;
}

/**
 * 统计周期控制本地汇总与样例图，不触发账户或网络查询。
 * details 与主面板使用同一周期和同一组件，避免明细读数与当前卡片分离。
 * 本地记录仅代表启用后的图片任务，不冒充此前历史或云端全部活动。
 */
/**
 * 面板状态与数据的接入约定：
 * 周期 days 由已有 SimpleSelect 提供七天和三十天选项。
 * 主模型与 LoRA 的选择只控制使用占比，不改变总产图和成功率。
 * success 开关只切趋势的指标，不影响原始历史记录。
 * detail 控制当前打开哪一个明细，关闭弹窗不清空周期。
 * 明细图直接复用主卡片的 statistics，防止不同时间重新汇总造成读数跳变。
 * 账本变化时 useMemo 重新计算，不需要手动刷新个人中心。
 * 查看样例时也保留账本订阅，退出样例后可以立即显示新的真实结果。
 * 账本订阅是只读的，切换模型分类不会触发用户文档保存。
 * 真实结果分布采用成功/失败，因为现有记录没有可靠的画面主题字段。
 * 人物、风景等样例分类继续只在 sample 模式存在。
 * 主模型选项默认激活，LoRA 没有使用时明确显示暂无统计。
 * 共享下拉组件提供键盘和焦点行为，本面板不再维护一套自定义菜单。
 * 样例与真实模式都复用同一组图表组件，只有输入数据不同。
 * 实际数据说明同时标出追踪起点限制、取消口径和音视频范围。
 * 没有服务端积分接口时保持未知，不能用本地模型文件价格估算。
 * 未实现本机所有历史回填，用户导入旧图不会改变这些任务统计。
 */
export function ProfileStatisticsPanel({ sample }: { sample: boolean }) {
  const { t } = useTranslation(), [days, setDays] = useState(7), [success, setSuccess] = useState(false), [detail, setDetail] = useState<string | null>(null);
  // 仅当前面板持有周期和模型分类，明细复用同一个选择而不另开状态。
  // useMemo 以账本引用为键，新终态落盘时当前页面自动重新汇总。
  // 不从模型安装目录推算调用量，也不会因展开明细写一条生成记录。
  const history = useGenerationHistoryStore(state => state.data);
  const statistics = useMemo(() => summarizeGenerationHistory(history, days), [history, days]);
  const [modelRole, setModelRole] = useState<"main" | "lora">("main");
  const roleSelect = <SimpleSelect ariaLabel={t("profile.ui.modelRole")} value={modelRole} onChange={value => setModelRole(value === "lora" ? "lora" : "main")} portal options={[{ value: "main", label: t("profile.ui.mainModels") }, { value: "lora", label: t("profile.ui.loraModels") }]} />;
  return <section className="pr-panel pr-statistics" data-profile-statistics>
    {/* 界面：私密统计复用原卡片与图表，真实账本和样例数据显式隔离。 */}
    <header className="pr-stats-heading"><div><h2><LockKeyhole size={18} />{t("profile.ui.private")}</h2><p>{t("profile.ui.statsHint")}</p></div><SimpleSelect
 ariaLabel={t("profile.ui.range")}
 value={String(days)}
 onChange={(value) => setDays(Number(value))}
 className="min-w-0" portal
 options={[{ value: String(7), label: t("profile.ui.days7") }, { value: String(30), label: t("profile.ui.days30") }]}
 /></header>
    {!sample && <p className="pr-data-note">{t("profile.ui.actualStats")}</p>}<MetricCards days={days} sample={sample} statistics={statistics} />
    <div className="pr-chart-row"><section className="pr-chart-card"><header><h3><BarChart3 size={16} />{t("profile.ui.trend")}</h3><SimpleSelect
 ariaLabel={t("profile.ui.trend")}
 value={String(success ? "success" : "count")}
 onChange={(value) => setSuccess(value === "success")}
 className="min-w-0" portal
 options={[{ value: String("count"), label: t("profile.ui.count") }, { value: String("success"), label: t("profile.ui.success") }]}
 /></header><p className="pr-chart-legend"><i />{t(success ? "profile.ui.success" : "profile.ui.count")}<span>{t(success ? "profile.ui.percentUnit" : sample ? "profile.ui.countUnit" : "profile.ui.imageUnit")}</span></p><ProfileTrendChart days={days} success={success} sample={sample} statistics={statistics} /></section>
      <ChartCard title={t(sample ? "profile.ui.distribution" : "profile.ui.outcomes")} icon={<Box size={16} />} onDetails={() => setDetail("distribution")}><Distribution total={days === 7 ? 186 : 762} sample={sample} statistics={statistics} /></ChartCard>
    </div><div className="pr-chart-row pr-bottom-charts">
      <ChartCard title={t("profile.ui.modelUsage")} icon={<Box size={16} />} onDetails={() => setDetail("modelUsage")} controls={roleSelect}><ModelUsage sample={sample} statistics={statistics} role={modelRole} /></ChartCard>
      <ChartCard title={t("profile.ui.peak")} icon={<Clock3 size={16} />} onDetails={() => setDetail("peak")}><ProfileHoursChart days={days} sample={sample} statistics={statistics} /></ChartCard>
    </div>
    {detail && <ProfileDialog title={t(detail === "distribution" && !sample ? "profile.ui.outcomes" : `profile.ui.${detail}` as MessageKey)} onClose={() => setDetail(null)}><p className="pr-data-note">{t(sample ? "profile.ui.chartHint" : "profile.ui.actualStats")}</p>{detail === "distribution" ? <Distribution total={days === 7 ? 186 : 762} sample={sample} statistics={statistics} /> : detail === "modelUsage" ? <ModelUsage sample={sample} statistics={statistics} role={modelRole} /> : <ProfileHoursChart days={days} sample={sample} statistics={statistics} />}</ProfileDialog>}
  </section>;
}

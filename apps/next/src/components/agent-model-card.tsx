"use client";

/**
 * 远端模型卡片：价格、分组、阶梯和令牌可见性在一个可点击区域展示。
 * 价格是每百万 token 的参考价，输入输出各自独立，不作汇率换算。
 * 未知价格显示未公布，不得贴成免费；明确不可用的条目不能提交。
 * 快照未认证的模型仍可选，但不会宣称其真实请求已通过。
 * 主进程保留站点原始模型 ID，展示短名不改变实际传参。
 * 推荐口径说明由父级统一呈现，避免卡片把最低价当绝对承诺。
 */
// 显式词条映射让运行期枚举与未引用词条检查使用同一组键。
// 只改显示文案选择，不把翻译结果当作 provider 或 model 运行参数。
// 固定来源链接不包含 API Key，用户可独立核对站点公开价格。
import { AGENT_PRICE_LABELS } from '@/data/agent-providers';
import { Check } from 'lucide-react';
import type { AgentCatalogModel } from '@illusion-realm/shared';
import { useTranslation } from '@/i18n';
import { cn } from '@/utils/cn';
interface Props { model: AgentCatalogModel; selected: boolean; recommended: boolean; onChoose: () => void; busy: boolean }
/**
 * 小数最多展示四位以去掉二进制浮点尾数，不修改计算或缓存价格。
 * USD 和 CNY 只分别添加符号，不能从中国界面语言推断货币。
 * 该函数只用于可见文本，实际账单由服务商和令牌分组决定。
 */
function money(value: number, currency: string) { return `${currency === 'CNY' ? '¥' : '$'}${new Intl.NumberFormat('en', { maximumFractionDigits: 4 }).format(value)}`; }
// 金额格式固定使用小数点，避免翻译语言改变 token 参考价格的阅读习惯。
// 显示精度不会写回模型对象，推荐排序始终使用目录中的未舍入数值。
// 不能从价格标签推出人民币与美元汇率，服务商的充值折扣也未在此模拟。
// 同价的多个模型可以只有一个推荐，但用户仍可以主动选择其他版本。
// pricingBasis 由目录解析器保留，长阶梯实际展示以明确的 tiers 为依据。
// 价格为零与未知 null 分开处理，避免卡片把缺字段模型显示为免费。
// 无权限卡片保持可读但禁用，这样用户仍能看到为何没有选择该模型。
// available=true 只是令牌可见，界面明确不把它标成已通过真实推理。
// 模型 card 使用真实 button，整块可由键盘确认，并显示当前选择。
// 价格未知与未认证分别表示，不把缺少密钥当作模型不支持。
// 单个 card 的边界使用主题变量，暗色下不出现固定亮色背景。
// ID 可换行，避免宽屏到紧凑布局时撑出整个资源弹窗。
// 保存期间禁用 card，阻止连续点击触发相反的持久化写入。
// 长上下文阈值与分组在 card 上可见，避免仅在 hover 提示里藏价格条件。
// 不显示未经核实的能力徽章，如官方、无限或已测试。
// 模型的价格分档只影响标签，不改变请求参数和收费。
// 界面：远端 Agent 聊天模型选择卡片。
export function AgentModelCard({ model, selected, recommended, onChoose, busy }: Props) {
  // 卡片的选中取决于 provider 和 model 两个字段，父组件已完成同站比较。
  // 模型 ID 不经过用户友好别名转换，用户能直接对照服务商价目表。
  // 每张卡片只提交自己的 ID，不附带公开价、group 或未经信任的网络字段。
  // groups 只是参考计费分组，不在选择时修改令牌或站点账户设置。
  // group 名称按纯文本显示，远端字符串不能插入 HTML 或运行脚本。
  // 多个阶梯按阈值独立标注，不能把基础价和长上下文价混在一个数值里。
  // 长阈值保留 token 单位，不把它误写成聊天轮数或模型输出长度。
  // 选择忙时卡片禁用，避免一次持久化未结束就提交相反的配置。
  // 推荐徽章只提供默认价排序信息，不承诺响应速度、质量或无限额度。
  // 经济与进阶档位也不是模型权限，不会改变 Agent 的只读/完全访问选择。
  // Check 图标被标为 aria-hidden，按钮可访问状态由 aria-pressed 表达。
  // 卡片无图片加载，不会因为远端 logo 缺失导致整个模型不可选择。
  // break-all 对包含斜杠的长 ID 生效，紧凑 main 中不会把卡片撑出横向滚动。
  // 列数由外层网格决定，card 本身不写死宽度，便于复用在不同布局。
  // 所有颜色取主题 token，不固定白色背景或高对比度红边。
  // 不使用 title 隐藏必要的价格条件，分组与长上下文规则都在正文中可见。
  // 模型条目发生更新时 React key 仍是 ID，选中状态不会因列表排序而漂移。
  // 可用性未知时允许选择，发送阶段仍重新核对该服务商密钥。
  // 卡片不请求网络，也不把模型选择直接变成一次聊天提交。
  // 多次打开同一目录只读取外层传入对象，不在组件中维护第二份价格缓存。
  const { t } = useTranslation();
  return <button type="button" data-agent-model-option={model.id} disabled={busy || model.available === false} aria-pressed={selected} onClick={onChoose}
    className={cn('flex min-w-0 flex-col gap-3 rounded-2xl border p-4 text-left transition-colors disabled:opacity-45', selected ? 'border-primary/50 bg-primary/10' : 'border-border/50 bg-background/60 hover:border-primary/30')}>
    <div className="flex w-full items-start justify-between gap-3"><span className="break-all text-sm font-medium">{model.id}</span>{selected && <Check aria-hidden className="h-4 w-4 shrink-0 text-primary" />}</div>
    <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground"><span className="rounded-md bg-muted px-2 py-1">{t(AGENT_PRICE_LABELS[model.tier])}</span>{recommended && <span className="rounded-md bg-primary/10 px-2 py-1 text-primary">{t('agent.providers.recommended')}</span>}</div>
    <div className="space-y-1 text-xs text-muted-foreground"><p>{t('agent.providers.input')}: {model.input === null ? t('agent.providers.unknownPrice') : money(model.input, model.currency)}</p><p>{t('agent.providers.output')}: {model.output === null ? t('agent.providers.unknownPrice') : money(model.output, model.currency)}</p>
      {model.groups.length > 0 && <p>{t('agent.providers.group', { group: model.groups.join(', ') })}</p>}
      {model.tiers.map(tier => <p key={tier.above}>{t('agent.providers.longPrice', { count: tier.above, input: money(tier.input, model.currency), output: money(tier.output, model.currency) })}</p>)}
      <p>{model.available === false ? t('agent.providers.unavailable') : model.available === null ? t('agent.providers.unverified') : t('agent.providers.visible')}</p>
    </div>
  </button>;
}

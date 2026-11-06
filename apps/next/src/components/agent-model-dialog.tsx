"use client";

/**
 * 复用创建页 ResourceDialogShell：宽屏居中弹窗，窄屏占据右侧 main。
 * 浏览站点和点击模型都只修改草稿，右下角应用才保存站点和模型。
 * 搜索仅过滤当前精选数据，不把任意文本作为 model 参数提交。
 * 保存失败保留弹窗与选择，用户能重试，不用静默关闭掩盖错误。
 * 打开后恢复触发按钮焦点，Escape 和外层关闭沿用公共外壳。
 * 目录刷新不自动覆盖用户选择，首次 Euzhi 的推荐明确标出。
 */
// 显式词条映射让运行期枚举与未引用词条检查使用同一组键。
// 只改显示文案选择，不把翻译结果当作 provider 或 model 运行参数。
// 固定来源链接不包含 API Key，用户可独立核对站点公开价格。
import { AGENT_SOURCE_LABELS, AGENT_PRICING_SOURCES } from '@/data/agent-providers';
import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import type { AgentProvider } from '@illusion-realm/shared';
// 布局订阅与焦点生命周期集中在专用 hook，组件只负责选择业务。
// hook 不读取密钥，也不执行模型请求，关闭后释放全部监听。
// 与公共外壳配合提供实际 main 左边界，不复制弹窗骨架。
import { useAgentModelDialog } from '@/hooks/use-agent-model-dialog';
import { ResourceDialogShell } from '@/components/ResourceDialogShell';
import { AgentProviderTabs } from '@/components/agent-provider-tabs';
import { AgentModelCard } from '@/components/agent-model-card';
import { useAgentProviderStore } from '@/stores/use-agent-provider-store';
import { useToastStore } from '@/stores/useToastStore';
import { useTranslation } from '@/i18n';
// 应用按钮沿用创建页主按钮，深浅主题和禁用状态不另建样式。
// 按钮放在外壳固定 footer，列表滚动时仍然能够确认当前选择。
// 模型卡继续只表达选中状态，保存动作由弹窗统一拥有。
import { PRIMARY_BUTTON_CLASS } from '@/utils/layout';
// 来源链接是固定公开页面，不包含认证头、查询密钥或账户资料。
// browser 原生外链可供用户核对实时目录，与模型推理请求无关。
// 旧价格会保留更新时间和回退来源，不能只显示一次成功图标。

interface Props { provider: AgentProvider; onClose: () => void }
// provider 是打开入口时的起始目录，不随父 store 的价格更新强制重置。
// onClose 只丢弃本次草稿，保存是显式应用操作，不在关闭回调隐式执行。
// 目录来自 store，待选模型、搜索文本与临时浏览站点留在组件内部。
// 这样用户取消浏览后，composer 仍显示原来实际运行所用的模型。
// 弹窗没有 API Key 输入，用户被缺钥拦下时沿原链接进入设置页。
// 提供商 key 的保存表单复用当前偏好，但原文从不进入目录组件。
// 宽屏与窄屏使用同一个模型列表组件，不维护两套分叉的选择逻辑。
// 共享外壳继续拥有遮罩、页头、滚动和 Escape，本组件不复制这些基础结构。
// 所有用户可见说明经 i18n，公开来源 URL 则来自固定无机密常量。
/**
 * 内部表单状态不持久化，关闭后重新打开从当前真实偏好开始。
 * 异步刷新按站点独立存储，快速切标签时不会显示另一站目录。
 * 错误统一用 i18n，不把网络响应正文或令牌片段显示在卡片上。
 * 焦点只在本弹窗范围内循环，关闭恢复到原触发按钮。
 * 所有事件监听在卸载时清理，不影响创建页的其他资源弹窗。
 * onClose 在父级是稳定回调，避免普通搜索输入就重复挂载监听。
 */
export function AgentModelDialog({ provider: initial, onClose }: Props) {
  // initial 只初始化本地浏览站点；点标签不会立刻修改 preferences.provider。
  // query 在切站时清空，避免上一站模型名让新目录看起来没有模型。
  // 搜索不区分大小写，保留原始 ID 展示和真正提交值。
  // saving 只锁定本次选择提交，不等同 Agent 正在生成的 runningRunId。
  // catalog 是 provider 作用域的结果，迟到的另一站数据不会进入当前卡片。
  // 目录还没加载时 models 是空数组，界面根据 busy 显示加载与空结果区别。
  // 过滤后数量不改变推荐计算，搜索不能把更贵的唯一结果重新标成最便宜。
  // 勾选来自当前站点的本地草稿，不能拿运行偏好覆盖用户刚点中的卡片。
  // 当前选择可能不在本次精选中，但 composer 仍保留其 ID，不静默覆盖。
  // 主进程目录缓存提供完整来源时间，组件不使用打开弹窗的时间替代价格核实时间。
  // refresh action 是稳定引用，effect 不依赖整个变化中的 store 对象。
  // 目录 effect 仅随 provider 变化运行，搜索输入不发新网络请求。
  // 手动按钮显式传 force=true，普通打开目录尊重主进程 TTL。
  // useAgentModelDialog 提供真实 main 边界，也负责关闭后的焦点恢复。
  // 弹窗挂载在 hydration 之后，公共壳使用对应媒体查询变体避免先满屏再缩放。
  const { t } = useTranslation(); const store = useAgentProviderStore(); const [provider, setProvider] = useState(initial);
  const [query, setQuery] = useState(''), [saving, setSaving] = useState(false); const search = useRef<HTMLInputElement>(null);
  // 像购物时先放入购物篮，点结算才付款：卡片只修改草稿，应用才写入偏好。
  // 用打开时偏好的副本初始化，价格刷新不会重置用户正在考虑的选择。
  // 两个站点各留一个草稿，来回浏览时不会把 Grok 名称带到硅基流动。
  const [draftModels, setDraftModels] = useState(() => ({ ...store.preferences.models }));
  const catalog = store.catalogs[provider], models = catalog?.models.filter(x => x.id.toLowerCase().includes(query.trim().toLowerCase())) || [];
  // 确认资格按完整目录检查，搜索隐藏已选卡片不代表取消选择。
  // 未曾选过模型的站点保持空草稿，不能仅浏览就默选第一张收费卡。
  // 目录明确拒绝权限时禁用应用；未知权限仍沿用原有允许选择的规则。
  const selectedModel = draftModels[provider], canApply = Boolean(selectedModel) && catalog?.models.find(model => model.id === selectedModel)?.available !== false;
  const refresh = store.refresh;
  // 共享外壳在紧凑形态使用当前 main 左边界，宽屏仍保持原居中布局。
  // read 为准而非 resize 事件载荷，遮挡期间恢复后也重新测量。
  // SSR snapshot 为零，Portal 渲染已受外壳水合条件保护。
  const compactLeft = useAgentModelDialog(search);
  useEffect(() => { void refresh(provider); }, [provider, refresh]);
  // 选择只发布一次已落盘配置，主进程仍将验证 endpoint 与密钥作用域。
  // 不在这里发送聊天，也不因用户查看更贵模型就产生费用。
  // 保存失败显示固定提示，原始磁盘异常不带入 UI。
  // finally 释放禁用，允许重试，不关闭用户正在查看的目录。
  // 本次已运行的聊天持有旧快照，不被应用按钮中途更换模型。
  // 保存成功关闭后，composer 从同一 store 更新当前模型标签。
  const apply = async () => {
    // 一次应用把 provider 与 model 一起写盘，不能拆成两个不一致的保存。
    // 捕获的是当前浏览 provider，不是等待结束后可能已改变的全局 provider。
    // UI 锁定使重复点击失效；store 的写队列还保证其他设置入口的保存顺序。
    // 当前聊天已使用启动快照，本次选择不会中止或重定向它的工具调用。
    // 操作成功才关闭弹窗，失败时草稿仍可见且用户可以再次提交。
    // 固定错误提示不回显模型服务错误正文或本地文件路径。
    // finally 恢复按钮状态，不能让一次保存失败永久锁住选择窗口。
    // 用户只浏览或按 Escape 关闭时没有进入此函数，不会产生偏好写入。
    // 事件入口复核资格，不能只依赖按钮的灰色外观防止无效保存。
    // 保存期间禁止再次提交，防止重复应用产生多次配置写入。
    // selectedModel 属于当前渲染的站点，异步等待不会改用另一站草稿。
    if (saving || !canApply) return;
    setSaving(true);
    try { await store.choose(provider, selectedModel); onClose(); }
    catch { useToastStore.getState().show(t('agent.providers.saveFailed'), 'error'); }
    finally { setSaving(false); }
  };
  // 界面：复用创建页资源弹窗，页头、工具栏、主体与价格说明分别交给既有插槽。
  // compactLeft 仅在紧凑 body 布局生效，桌面居中不被导航宽度偏移。
  // 保存期间忽略外壳关闭操作，避免用户以为取消而后台实际提交选择。
  // 标签组和搜索留在 toolbar，不随 card 列表纵向滚动而丢失。
  // footer 的价格单位与推荐口径保持固定可见，不能只藏在鼠标悬停提示中。
  // 公开价目外链另开页面，rel 防止外部页面获得 opener 操作入口。
  // 刷新按钮禁用来自当前站点 busy，不因另一站正在刷新而不可点击。
  // 搜索 icon 只是视觉提示，可访问名称由输入的 aria-label 提供。
  // 受控输入完全在本地过滤，不把用户搜索文本传入服务商 URL。
  // 空搜索不会自动选择结果，即使只剩一个模型也要用户确认。
  // source=cache 与 snapshot 使用不同文案，用户能区分上次联网与随包参考。
  // 认证失败提示关注 key、模型权限和分组；其他失败明确保留旧参考数据。
  // 错误提示带 role=status，刷新结果无需抢焦点也能被辅助技术读出。
  // 没有模型时不创建可点击的空 card，避免无效 model 被保存。
  // 网格从一列逐步增加，card 的长 ID 可以换行，不需要横向滚动整页。
  // key 使用 model.id，不用数组位置，价格更新排序后选中卡片不会错位。
  // model.available=false 的禁用由 card 实现，父层仍保留其可见解释。
  // 用户已选值不会因 recommended 变化而覆盖，勾选和低价推荐是两个独立标记。
  // footer 不包含账户余额、密钥尾号或实际用户路径，可安全显示给未登录游客。
  // 本组件没有远端推理请求，选择、搜索、刷新都不会创建付费聊天。
  // ResourceDialogShell 的 body 负责滚动，外层不再叠一个溢出滚动区域。
  // 关闭后仍由原 composer 保留草稿和会话，弹窗不拥有也不清除消息状态。
  // 核实时间使用浏览器本地日期格式展示，底层缓存仍保留同一个 ISO 时间戳。
  // 站点暂时拒绝公开目录时，不隐藏来源链接，用户可自行登录站点核对价格。
  // aria-labelledby 指向稳定标题 ID，宽窄两种形态保持同一可访问名称。
  // API Key 未核实不等于模型不可选，用户可以先选择再去设置补充凭据。
  // 选中 card 的 onChoose 只保存本地模型 ID，远端字段不能覆盖运行配置。
  // 页面不把任何接口返回的 HTML 作为说明渲染，模型和组名均按纯文本输出。
  // 错误态与已有卡片同时存在是有意设计，不能用“有数据”推断刷新成功。
  return <ResourceDialogShell open compactLeft={compactLeft} title={t('agent.providers.title')} titleId="agent-model-dialog" onOpenChange={open => { if (!open && !saving) onClose(); }}
    description={t('agent.providers.description')} toolbar={<div className="space-y-3 px-4 py-2 sm:px-6">
      <AgentProviderTabs value={provider} disabled={saving} onChange={value => { setProvider(value); setQuery(''); }} />
      <div className="flex items-center gap-2"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border/50 bg-background px-3"><Search className="h-4 w-4 shrink-0 text-muted-foreground" /><input ref={search} data-agent-model-search value={query} onChange={event => setQuery(event.target.value)} aria-label={t('agent.providers.search')} placeholder={t('agent.providers.search')} className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
      <button type="button" data-agent-catalog-refresh disabled={store.busy[provider]} onClick={() => void store.refresh(provider, true)} className="flex h-9 items-center gap-2 rounded-xl px-3 text-xs hover:bg-muted disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" />{t('agent.providers.refresh')}</button></div>
    </div>} footer={<div className="flex flex-wrap items-end justify-between gap-4">
      {/* 弹窗底部：价格说明与应用共处固定区，窄窗口时按钮仍靠右。 */}
      <div className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground"><p>{t('agent.providers.priceNote')}</p><p>{t('agent.providers.recommendNote')}</p><a href={AGENT_PRICING_SOURCES[provider]} target="_blank" rel="noopener noreferrer" className="text-primary underline">{t('agent.providers.pricingLink')}</a></div>
      {/* 应用是唯一写入入口；卡片、搜索、站点浏览和关闭都不触发保存。 */}
      {/* 没有有效选择或正在保存时禁用，失败后恢复原草稿供用户重试。 */}
      {/* 固定按钮使用原生 button，键盘用户不需要通过点击卡片隐式确认。 */}
      {/* 主按钮常量只提供颜色，点击尺寸和焦点环由这里的操作区补齐。 */}
      {/* 关闭应用能力时保留明显的灰态，不能让空选择看起来已经可提交。 */}
      {/* ml-auto 让窄窗口换行后仍位于右下角，而非掉到说明文字左侧。 */}
      <button type="button" data-agent-model-apply disabled={saving || !canApply} onClick={() => void apply()} className={`${PRIMARY_BUTTON_CLASS} ml-auto min-h-9 shrink-0 rounded-xl px-5 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50`}>{t(saving ? 'common.loading' : 'agent.providers.apply')}</button>
    </div>}>
    <div className="space-y-4">{catalog && <p className="text-xs text-muted-foreground">{t('agent.providers.updated', { time: new Date(catalog.updatedAt).toLocaleString() })} · {t(AGENT_SOURCE_LABELS[catalog.source])}</p>}
      {(store.errors[provider] || catalog?.error) && <p role="status" className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">{t(catalog?.error === 'auth' ? 'agent.providers.authError' : 'agent.providers.refreshError')}</p>}
      {!models.length && <p role="status" className="py-8 text-center text-sm text-muted-foreground">{t(store.busy[provider] ? 'agent.providers.loading' : 'agent.providers.empty')}</p>}
      {/* 模型列表：点击只更新当前站点草稿，保持弹窗和聊天入口的实际配置。 */}
      {/* 列表刷新沿用模型 ID 作为 key，不按排序位置迁移选中勾号。 */}
      {/* 保存期间卡片与站点标签一起锁定，已提交的配置快照不再变化。 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{models.map(model => <AgentModelCard key={model.id} model={model} selected={selectedModel === model.id} recommended={catalog?.recommended === model.id} busy={saving} onChoose={() => setDraftModels(current => ({ ...current, [provider]: model.id }))} />)}</div>
    </div>
  </ResourceDialogShell>;
}

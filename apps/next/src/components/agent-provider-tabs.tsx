"use client";

/**
 * Agent 选择器与设置页共用服务商切换，名称与站点 ID 对应。
 * 按钮只表达选择，不保存密钥、不发起模型推理。
 * 外层决定这是预览目录还是实际切换，避免共用组件隐藏副作用。
 * 普通按钮组保留浏览器标准 Tab / Enter 操作，不冒充自定义 ARIA tab。
 * 小窗口允许换行，长模型名不会挤压服务商按钮。
 */
// 显式词条映射让运行期枚举与未引用词条检查使用同一组键。
// 只改显示文案选择，不把翻译结果当作 provider 或 model 运行参数。
// 固定来源链接不包含 API Key，用户可独立核对站点公开价格。
import { AGENT_PROVIDER_LABELS } from '@/data/agent-providers';
import type { AgentProvider } from '@illusion-realm/shared';
import { useTranslation } from '@/i18n';
import { cn } from '@/utils/cn';
interface Props { value: AgentProvider; onChange: (provider: AgentProvider) => void; disabled?: boolean }
// 固定允许集对应主进程，不能由远端模型目录注入任意站点。
// display name 经 i18n 取得，名称修正不改变旧 provider 存储值。
// aria-pressed 让当前选择对键盘和辅助技术都可见。
// selected 只改变样式，不自动保存或刷新另一站数据。
// disabled 供正在持久化的调用方使用，避免重复切换提交。
// 不复用本地模型类别，远端聊天与绘图模型边界独立。
// data 属性供真实页面冒烟读取，不依赖 CSS 文本位置。
// 界面：服务商切换按钮，设置页和模型选择弹窗使用相同组件。
export function AgentProviderTabs({ value, onChange, disabled }: Props) {
  // siliconflow 与 euzhi 是运行契约中的固定 ID，不能拿翻译后的标签发 IPC。
  // 按钮映射次序保持旧站在前，不代表默认选择或按价格自动排序。
  // 当前值只影响 aria-pressed 和颜色，调用方决定是否把点击提交到持久化。
  // 在模型弹窗里点击只是浏览，在设置页里点击才切换实际服务商。
  // 这项区别由 onChange 所在父组件表达，共用组件不能暗中写全局 store。
  // 真正选择模型仍需要点击 card，浏览分组不应改变正在运行的请求。
  // disabled 使用原生按钮属性，保存中不能通过键盘反复提交切换。
  // 各个按钮有独立可访问名称，不依赖图标或颜色识别服务商。
  // 不使用 tablist 语义，避免视觉按钮组缺少对应 tabpanel 导致误导。
  // 文案通过显式 key 映射，词条检查工具能确认两站名称都实际被使用。
  // 不展示用户令牌尾号，切站入口本身不负责凭据状态。
  // 小窗口 flex-wrap 保留可点击尺寸，不把中文站名压缩为纵向逐字排列。
  // className 使用主题变量，暗色下与创建页选择控件保持同一背景规则。
  // data-agent-provider 只公开无秘密的站点 ID，适合真实页面回归定位。
  // key 同样使用 provider，翻译语言变化不会卸载并重建错误的按钮身份。
  // onChange 只传允许集值，不把 click event 或 DOM 节点写入配置。
  // 组件没有副作用，外层打开弹窗也不会自动触发一次“选择”。
  const { t } = useTranslation();
  return <div className="flex flex-wrap gap-2">{(['siliconflow', 'euzhi'] as const).map(provider =>
    <button key={provider} type="button" data-agent-provider={provider} aria-pressed={value === provider} disabled={disabled} onClick={() => onChange(provider)}
      className={cn('rounded-xl border px-4 py-2 text-sm transition-colors disabled:opacity-50', value === provider ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/50 hover:bg-muted')}>
      {t(AGENT_PROVIDER_LABELS[provider])}
    </button>)}</div>;
}

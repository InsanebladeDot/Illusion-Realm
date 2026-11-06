"use client";

/**
 * composer 和设置页共用远端聊天模型入口。
 * 标签显示持久化站点和模型，点击才挂载弹窗，避免首帧宽窄形态闪烁。
 * 选择更新与实际 sendDraft 读取同一 store，避免只换名称而请求仍用旧模型。
 * 初次 Euzhi 尚未选择时展示推荐值，但不会自动发起聊天。
 * 目录周期刷新由 hook 管理，组件卸载后清理定时器。
 * 浏览器或旧主进程缺能力会在弹窗明确提示，不默默成功。
 */
// 显式词条映射让运行期枚举与未引用词条检查使用同一组键。
// 只改显示文案选择，不把翻译结果当作 provider 或 model 运行参数。
// 固定来源链接不包含 API Key，用户可独立核对站点公开价格。
import { AGENT_PROVIDER_LABELS } from '@/data/agent-providers';
import { useCallback, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useAgentProviders } from '@/hooks/use-agent-providers';
import { useAgentProviderStore } from '@/stores/use-agent-provider-store';
import { AgentModelDialog } from '@/components/agent-model-dialog';
// 模型名仅作显示裁切，完整 ID 仍放 data 属性和 title 供验证与读取。
// provider 一起显示，Grok 与硅基流动同名模型也能区分来源。
// 不再把本地 SD 模型列表用于 Agent 的远端聊天选择。
// 按钮状态只控制弹窗，不取消消息或改变现有会话权限。
// close 使用稳定回调，弹窗焦点逻辑不因父组件重绘反复执行。
// 宽度上限延续既有 composer 紧凑布局，窗口窄时仍保留发送按钮。
// data-agent-model 兼容已有冒烟，值是实际模型而非显示短名。
// 界面：Agent 输入区的服务商与聊天模型选择。
export function AgentModelPicker() {
  // useAgentProviders 负责加载偏好与周期目录更新，入口组件不直接读文件。
  // 初始状态使用旧硅基流动默认模型，磁盘读取完成后再显示真实偏好。
  // 已选择 Euzhi 时不用全局 AGENT_DEFAULTS.model 兜底，否则标签和请求会分离。
  // 若 Euzhi 模型尚为空，当前目录推荐用于展示和第一次运行的候选。
  // 用户点击 card 后会持久化明确 ID，之后刷新目录不更换已选模型。
  // short name 只去掉显示前缀，data-agent-model 和请求仍保留完整服务商 ID。
  // 标题还包含完整名称与切换说明，窄窗口裁切不会让用户无法识别模型。
  // provider 名称经显式映射翻译，未引用词条检查可以追踪其实际使用。
  // aria-expanded 与本地 open 状态同步，不从 DOM 是否存在反向推断。
  // onClose 使用稳定回调，目录或草稿更新不会使弹窗重复释放焦点。
  // 点击按钮才挂载 dialog，公共外壳可首帧正确读取水合后的媒体查询。
  // 一进 Agent 页面不自动打开目录，也不会打断用户正在输入的草稿。
  // 同一选择器用于设置页，避免两处独立维护模型选项与默认值。
  // 无密钥也允许浏览目录，真正发送仍由主进程凭据状态控制。
  // 标题不会显示密钥尾号或 API Key 原文，这个入口只负责模型选择。
  // 即使目录暂不可达，已保存的模型名称仍可显示，不改成误导性的“未选”。
  // 空模型且无目录时使用普通模型文案，不猜测一个不存在的 Grok 版本。
  // max-width 只控制标签裁切，不截断实际存储值或修改 model 参数。
  // ChevronDown 是装饰图标，按钮本身的可访问名称来自可见服务商与模型文本。
  // React Fragment 不增加额外布局容器，保持原 composer 工具栏的对齐。
  // dialog 放在同一 React 所有权树中，Portal 只改变 DOM 挂载位置。
  // 关闭模型窗口不清草稿、历史消息、附件或用户权限选择。
  // 切换模型不自动新建会话，历史上下文仍由既有 Agent store 维护。
  // 已运行任务的模型快照不会重新从此组件读取，因此切换不会串用密钥。
  // 当前入口没有原生下拉 select，搜索和卡片选择都在复用的资源弹窗完成。
  useAgentProviders(); const { t } = useTranslation(); const [open, setOpen] = useState(false); const close = useCallback(() => setOpen(false), []);
  const { preferences, catalogs } = useAgentProviderStore(); const provider = preferences.provider;
  const model = preferences.models[provider] || catalogs[provider]?.recommended || ''; const name = model.slice(model.lastIndexOf('/') + 1);
  return <><button type="button" data-agent-model={model} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} title={`${t(AGENT_PROVIDER_LABELS[provider])} · ${model}\n${t('agent.composer.modelTitle')}`}
    className="inline-flex min-w-0 max-w-[125px] items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted sm:max-w-[260px]">
    <span className="truncate">{t(AGENT_PROVIDER_LABELS[provider])} · {name || t('agent.composer.model')}</span><ChevronDown aria-hidden className="h-3 w-3 shrink-0" /></button>
    {open && <AgentModelDialog provider={provider} onClose={close} />}
  </>;
}

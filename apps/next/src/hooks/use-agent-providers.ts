"use client";

/**
 * 可见 Agent / 设置页共享的目录生命周期，离开页面清理轮询。
 * 六小时刷新两站目录，不创建系统定时任务、不在客户端关闭后请求。
 * load 失败由 store 保留可重试状态；hook 只发出无敏感数据的固定警告。
 * 自动刷新不带 force，主进程缓存继续防止多个入口同时联网。
 * 浏览器开发环境的 IPC 缺失以页面错误态呈现，不伪装远端可用。
 * 主题或窗口大小变化不进入依赖，避免仅调布局就刷新模型。
 */
import { useEffect } from 'react';
import { useAgentProviderStore } from '@/stores/use-agent-provider-store';
// 只刷新当前站点的凭据摘要，不读取原始 API Key。
// 模型偏好加载后再次检查，修正旧页面首帧还显示硅基流动的状态。
// 站点变化触发 effect，目录请求本身仍各自缓存。
import { useAgentSecretStore } from '@/stores/useAgentSecretStore';
export function useAgentProviders() {
  // 选择器和设置页都可能挂载本 hook，网络去重由全局 store 和 main 共同完成。
  // 每个实例只持有自己的 interval，卸载时清理，不把任务注册到操作系统。
  // 两站都预热目录是为了用户切换时可立即浏览，不代表切换了当前推理服务商。
  // 硅基流动不可达不阻断 Euzhi，两个 refresh Promise 互不等待。
  // refresh 自己消化网络失败，页面能从各站 errors/catalog.error 显示状态。
  // load 仍可能因用户文档读取失败拒绝，必须显式 catch 而不是遗留 rejection。
  // 固定 warning 不附异常对象，避免把文档里的私人路径输出到日志。
  // interval 每六小时触发一次，main 的 TTL 还会避免重复下载刚更新的价格。
  // 页面重新挂载会再检查目录，以弥补关闭期间错过的刷新，不声称应用关闭后仍同步。
  // key 状态只读当前 provider，不为了预热另一站目录而显示它的配置摘要。
  // ready 变化只修正凭据投影，不自动保存或改写用户的模型选择。
  // 本 hook 不订阅聊天 token，长回复不会使刷新 effect 反复执行。
  // 依赖只含稳定 store action，避免目录结果更新触发新的循环请求。
  // 主题切换不影响 provider action 引用，也不会触发密钥重新保存。
  // 自动目录请求是只读 GET，不创建计费聊天或修改令牌分组。
  // 只有用户显式发送消息时才走模型执行链路。
  // 网络失败后 interval 保留，站点恢复可以在下一周期自然更新。
  // 用户不必等到周期到来，弹窗仍有单次 force 刷新按钮。
  // 浏览器开发模式无 preload 时目录会显示错误态，而不是执行裸 fetch。
  // 函数自身不暴露 provider setter，选择的写入仍经持久化队列串行处理。
  // cleanup 只释放本实例定时器，不清空其他页面共享的目录缓存。
  const load = useAgentProviderStore(s => s.load), refresh = useAgentProviderStore(s => s.refresh);
  // ready 防止尚未读取磁盘偏好就把默认站点状态当作最终状态。
  // effect 依赖 provider，只有切换站点时才查询，不随流式消息重绘请求。
  // 查询失败由 secret store 回落未配置，不能留下未处理 Promise。
  // 另一个页面挂载的旧状态请求由单调序号过滤。
  // keyConfigured 只供提示，发送前仍会重新核对所选站点。
  const provider = useAgentProviderStore(s => s.preferences.provider), ready = useAgentProviderStore(s => s.ready);
  useEffect(() => { if (ready) void useAgentSecretStore.getState().refresh(provider); }, [provider, ready]);
  useEffect(() => {
    const update = () => { void refresh('siliconflow'); void refresh('euzhi'); };
    void load().then(update).catch(() => { console.warn('[agent] Could not load model preferences.'); });
    const timer = setInterval(update, 6 * 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [load, refresh]);
}

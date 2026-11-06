/**
 * Agent 目录桥接：只读固定服务商目录，并在 renderer 再验证响应形状。
 * 网络和认证留在主进程；此模块不直接 fetch，也不缓存 API Key。
 * 没有新 preload 时明确报错，不能把旧主进程当作空目录成功。
 * 时间戳和价格来源直接来自主进程，不用当前页面时间伪装新价。
 * 价格按各站币种展示，不在这里假定汇率或充值折扣。
 * 目录失败可携带旧条目，但传输或 schema 错误由调用者处理。
 * 渲染组件只调用 store，避免表单各自复制 IPC 细节。
 */
import { AgentCatalogSchema, type AgentProvider } from '@illusion-realm/shared';
import { getElectronAPI } from '@/utils/electronBridge';
import { unwrapIpc } from '@/utils/ipcResult';
/**
 * force 只用于用户主动刷新；后台轮询优先遵循主进程缓存 TTL。
 * 错误用稳定标识，UI 负责翻译提示，不显示原始服务商响应。
 * schema.parse 的异常不得作为已刷新成功处理。
 */
export async function readAgentCatalog(provider: AgentProvider, force = false) {
  // getElectronAPI 在网页开发环境返回空值，不能直接断言 preload 一定存在。
  // 新通道需要完整重启主进程，单独刷新 renderer 不会给旧 preload 增加方法。
  // capability check 避免旧主进程出现 undefined is not a function 的无说明错误。
  // 目录参数没有自由 URL 或请求头字段，页面不能绕过主进程固定选站。
  // unwrapIpc 先检查传输结果，业务失败不会被当作包含 models 的对象处理。
  // schema.parse 再检查模型、价格和来源，防止只靠 TS 接口信任旧响应。
  // null 价格会原样保留到 UI，桥接不负责推断免费或替用户选模型。
  // 失败由 provider store 捕获并保留旧目录，本函数不静默构造伪空成功。
  // 本函数无副作用计时器，也不落浏览器 localStorage，便于复用和清理。
  const api = getElectronAPI();
  if (!api?.agentCatalog) throw new Error('catalog');
  return AgentCatalogSchema.parse(unwrapIpc(await api.agentCatalog(provider, force)));
}

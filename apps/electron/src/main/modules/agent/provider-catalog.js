/**
 * 主进程目录服务：固定站点 GET、六小时 TTL、失败保留上次有效价目表。
 * 刷新只读取公开目录及用户令牌可见模型，不发起聊天或付费生成。
 * API Key 只附到所属站点的 /models，请求禁用重定向以免泄漏认证头。
 * 公共价格缓存不落令牌可见性；每次有密钥时重新核对账户模型列表。
 * 不支持价格接口的站点从官网静态数据解析，格式变化会明确回退缓存。
 * 网络错误只返回错误码，不把服务商响应、账户数据或密钥写入日志。
 * 同站并发刷新合并，切换服务商的请求互不覆盖。
 * 定时器由页面启动并清理；主进程没有常驻轮询，关闭应用即停止请求。
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { ENDPOINTS, providerId, resolveProviderKey } = require('./provider-secrets');
const { record, recommend, parseEuzhi, parseSiliconFlow, curateSiliconFlow } = require('./provider-catalog-parser');
const snapshot = require('./provider-snapshot.json');
const { secretFilePath } = require('./secret');
const TTL = 6 * 60 * 60 * 1000;
// TTL 针对公开价格，不针对密钥有效期，不能把六小时缓存当作令牌认证缓存。
// 账户模型列表每次独立核对，用户在官网修改权限后可手动立即更新。
// 官网价格发生变化时只影响目录与推荐，不直接改写用户已经选定的模型。
// 缓存推荐值仅作首次选择候选，实际 UI 会基于最终列表重新计算推荐。
// 未知价格的模型不参与推荐，但仍可显示并交由用户自行核对站点。
// Euzhi 的两个现有 Grok 同价时按数字版本选新版，未来更便宜型号可自然参与排序。
// 硅基流动保留免费、经济和进阶三个档位，不把全站目录全部推给用户。
// 每个返回对象都包含 provider，renderer schema 可识别跨站结果混淆。
// error 只放稳定码，日志和界面都不会意外包含远端错误页的私人信息。
// source 对本轮结果有意义，不从文件中保存的标志假定刚完成联网。
// 成功缓存写入以替换方式完成，不把模型权限核对结果混进公开持久化文件。
// 失败时旧快照保持可查看，但不会把 updatedAt 替换为失败尝试时间。
// 公共 HTTP 被拒绝时不尝试借用户账户登录 cookie 绕过站点限制。
// /models 是否可见不保证流式 tool_calls 可用，真实聊天测试需要用户有效 API Key。
/** @type {Map<string,Promise<import('@illusion-realm/shared').AgentCatalog>>} */
const pending = new Map();
/** @type {Map<string,import('@illusion-realm/shared').AgentCatalog>} */
const memory = new Map();
// pending 只按站点去重，两个服务商同时刷新时不会共享 Promise 或认证头。
// memory 只保存成功公开目录，accountModels 的返回值不会写回这份 Map。
// TTL 使用最近一次成功读取价格的时间，认证检查不延长价格新鲜度。
// 未配置令牌也能浏览公开价格，用户不必先保存 key 才打开模型选择器。
// 随包快照来自核实过的公开数据，并保留自己的采集时间。
// 网络失败不启动自动重试循环，避免故障站点在后台持续消耗请求。
// renderer 的定时器在可见页面生命周期内触发，应用关闭后没有驻留任务。
// 缓存目录由主进程路径策略决定，页面不接收也不能修改其位置。
// 本模块的测试重定向只在进程环境生效，不是面向用户的配置项。
// 所有响应可序列化，不能跨 IPC 携带 Response、Headers 或 Buffer 实例。
/**
 * 请求超时十二秒、响应体限制八兆，避免远端大响应占用主进程。
 * 只接受固定 URL，调用处不能传用户提供的 host。
 * 401 / 403 单独区分，以便提示用户检查令牌或分组。
 * 不读错误响应正文，不用可能含认证信息的异常字符串作为界面文案。
 * @param {string} url @param {string} [key]
 */
async function request(url, key) {
  // 本模块调用点使用固定 HTTPS 地址，不暴露通用代理给 renderer。
  // 有 key 的请求只用于所属站点 /v1/models，不发送给公共价目 HTML。
  // redirect=error 阻止认证请求把 Authorization 转发给未核实的跳转目标。
  // 公开官网的已知 www 跳转已在固定来源地址中显式解决。
  // 十二秒上限覆盖建立连接和读取响应，不能让模型窗口永久停在加载状态。
  // Content-Length 过大时在读取前拒绝，缺失长度时还会核对读取后的文本长度。
  // 八兆限额高于已核实的两个公开目录，避免正常页面被误当异常。
  // 401 与 403 不读取正文，避免把账户限额或网关细节传给页面。
  // 其他非成功状态统一视为网络失败，不依据服务商私有错误结构分支。
  // 成功响应是否为合法目录仍由后续 JSON 与格式解析器检查。
  // URL 和 key 不出现在本函数的抛错信息，日志不会回显认证头。
  const response = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(12000), redirect: 'error' });
  if (response.status === 401 || response.status === 403) throw new Error('auth');
  if (!response.ok) throw new Error('network');
  if (Number(response.headers.get('content-length') || 0) > 8 * 1024 * 1024) throw new Error('catalog');
  const text = await response.text();
  if (text.length > 8 * 1024 * 1024) throw new Error('catalog');
  return text;
}
/**
 * 随包目录只用于冷启动或离线回退；明确标记 snapshot 和核实时间。
 * 不以当前时间替换随包时间，否则离线数据会被误认为刚刷新。
 * 所有条目都重建对象，账户可见性不会污染共享 snapshot。
 * @param {import('@illusion-realm/shared').AgentProvider} provider
 * @returns {import('@illusion-realm/shared').AgentCatalog}
 */
function fallback(provider) {
  // structuredClone 防止认证核对把共享 JSON 对象的 available 改为某用户状态。
  // snapshot 本身的币种、阶梯和分组已经规范化，不重新套一次倍率。
  // 没有联网成功时不把 updatedAt 设成 Date.now，否则离线会一直看起来最新。
  // 推荐从当次模型对象计算，保持可解释的价格与版本排序规则。
  // 推荐不是用户已选值，调用方不得自动覆盖已持久化偏好。
  // 两个站点的 fallback 各自独立，Euzhi 失败不会显示硅基流动模型。
  // 该路径可在没有真实密钥的浏览器开发环境下解释目录来源。
  // 默认 error 留空，因为单纯读取随包参考不等于曾发生一次网络错误。
  // 发起刷新失败之后才由刷新层添加 network，保留动作与结果的区别。
  const models = /** @type {import('@illusion-realm/shared').AgentCatalogModel[]} */ (structuredClone(snapshot[provider]));
  return { provider, models, recommended: recommend(models), source: 'snapshot', updatedAt: snapshot.verifiedAt, error: '' };
}
/**
 * 缓存文件仅含公开目录，不包含账户 API Key 或可见模型差异。
 * 缺失、旧格式或损坏都回落随包快照，不阻止打开模型选择器。
 * 不同站点文件独立，不能因为一次解析失败覆盖另一个目录。
 * 读取端核对有限字段，实际网络结果仍由 shared 响应 schema 再校验。
 * @param {import('@illusion-realm/shared').AgentProvider} provider
 */
async function cached(provider) {
  // 命中内存也标记 cache，不能把上一次成功联网伪装成这一轮刚联网成功。
  // 拷贝顶层状态以免改写成功原件，updatedAt 保持不动。
  // 模型数组之后会被重新 map，认证检查仍不会污染公开缓存。
  // 使用取出的稳定引用做存在性检查，避免异步分支对 Map 状态重复求值。
  // 返回顶层拷贝保持 provider、时间和公开条目的类型完整。
  // source 变为 cache 只描述本次来源，不改写最近成功时间。
  const hit = memory.get(provider);
  if (hit) return { ...hit, source: /** @type {const} */ ('cache') };
  try {
    // 缓存不是秘密存储，内容仍要按外部数据对待，解析异常回退 snapshot。
    // provider 字段防止手改文件名后加载到另一个站点的公开目录。
    // 时间戳必须可解析，否则 TTL 比较会变成 NaN 而永远不刷新。
    // data 不是数组的旧缓存格式不能沿用，避免 renderer 收到对象无法渲染。
    // 模型 ID 至少要是字符串，后续 renderer schema 还会核对完整响应。
    // 恢复磁盘目录标记为 cache，不信任文件里保存的 source=live。
    // 写回流程永远不包含密钥，缓存读取不能获得账户认证原文。
    // 没有文件与权限不足都允许正常使用 snapshot，不阻止用户打开页面。
    // 不在 catch 输出异常堆栈，避免磁盘错误附带真实用户路径。
    const body = record(JSON.parse(await fs.readFile(cachePath(provider), 'utf8')));
    const models = Array.isArray(body.models) ? body.models : [];
    if (body.provider !== provider || typeof body.updatedAt !== 'string' || !Number.isFinite(Date.parse(body.updatedAt)) || !models.every(x => typeof record(x).id === 'string')) return fallback(provider);
    return /** @type {import('@illusion-realm/shared').AgentCatalog} */ ({ ...body, source: 'cache', error: '' });
  } catch { return fallback(provider); }
}
/**
 * 缓存跟随主进程密钥目录的测试隔离，不进入普通用户 JSON。
 * 文件名只由允许集 provider 生成，不接受页面路径。
 * @param {import('@illusion-realm/shared').AgentProvider} provider
 */
function cachePath(provider) { return path.join(path.dirname(secretFilePath()), `agent-catalog-${provider}.json`); }
// 文件名的 provider 在入口已经走允许集，不存在 ../ 或绝对路径拼接。
// 缓存与密钥虽在同一父目录，内容和加密策略完全独立。
// 公共目录可以离线复用，不需要用 safeStorage 与系统用户身份绑定。
// 用户换机器后缓存仍只是公开参考，不会包含可直接使用的令牌。
// 临时文件使用同一目录，rename 不跨分区，避免非原子复制导致半份 JSON。
// 只有成功公开目录进入文件，失败响应 HTML 和认证错误正文不会落盘。
// 文件写入按 mode=0600 请求最小权限；Windows 最终仍依赖系统 ACL。
/**
 * 有密钥时核对 /models，不用公开价目表猜测令牌权限。
 * 查询失败仍保留目录，但全部标记未核实，并给出明确错误状态。
 * 清除密钥后旧的可见性不会被沿用，状态重新成为 null。
 * @param {import('@illusion-realm/shared').AgentProvider} provider
 * @param {import('@illusion-realm/shared').AgentCatalogModel[]} models
 */
async function accountModels(provider, models) {
  // resolveProviderKey 只在主进程返回原值，renderer 接口没有密钥读回通道。
  // 未配置 key 时不访问 /models，也不拿另一站的凭据尝试碰运气。
  // available=null 与 false 语义不同：前者未核实，后者账户明确看不到。
  // 响应必须是 OpenAI 兼容 data 数组，服务商错误对象不算空模型列表。
  // 真正空 data 表示该令牌没有可见模型，所有公开条目都应标为不可用。
  // 集合比较使用原始模型 ID，不能删除 / 或 Pro/ 前缀后模糊匹配。
  // 不请求模型详情、余额或令牌权限写接口，避免扩大凭据暴露范围。
  // 单次列表成功仍不证明 chat/completions 支持流式工具调用。
  // 查询失败保留公开条目，不把网络故障误报为模型全部下架。
  // auth 只用于明确 401/403，其他错误用 availability 供 UI 区分。
  // 输入模型来自公开目录的拷贝，返回值不会反向改写缓存中的权限状态。
  const { key } = resolveProviderKey(provider);
  if (!key) return { models, error: /** @type {const} */ ('') };
  try {
    const body = record(JSON.parse(await request(`${ENDPOINTS[provider]}/models`, key)));
    if (!Array.isArray(body.data)) throw new Error('catalog');
    const ids = new Set(body.data.map(x => record(x).id));
    return { models: models.map(x => ({ ...x, available: ids.has(x.id) })), error: /** @type {const} */ ('') };
  } catch (error) { return { models, error: /** @type {'auth'|'availability'} */ (error instanceof Error && error.message === 'auth' ? 'auth' : 'availability') }; }
}
/**
 * 六小时内复用公开价格；force 用于用户手动刷新或密钥变更后的重新核对。
 * 缓存落盘失败不伪装成网络失败，当前已获取的公开目录仍然有效。
 * 不自动把用户已选模型换成新推荐，推荐仅用于第一次进入服务商。
 * 每次回传前单独做账户核对，公开缓存不携带认证结果。
 * @param {import('@illusion-realm/shared').AgentProvider} provider @param {boolean} force
 * @returns {Promise<import('@illusion-realm/shared').AgentCatalog>}
 */
async function refresh(provider, force) {
  // 读取缓存发生在联网前，故障时总能保留最近一次已核实内容。
  // snapshot 强制尝试更新，即使随包采集时间距今尚不足六小时。
  // force 只越过 TTL，不越过固定站点、超时或响应大小限制。
  // Euzhi 接口当前可能要求认证；不把 API Key 当作网站登录会话注入公共请求。
  // 官网恢复公开目录后，下一次定时或手动刷新可以自然更新，不需要重启客户端。
  // 公开价格成功与缓存写成功是两件事，磁盘只读不应抹掉已获得的最新数据。
  // 使用临时文件原子替换，旧缓存不会因进程中途退出变成截断 JSON。
  // 网络失败回传旧时间和错误状态，不能把错误刷新时间当价格核实时间。
  // accountModels 在公开数据取得后执行，账户可见性不能被公开 TTL 跳过。
  // 请求开始前构造的密钥只用于那一次账户核对，不串到另一个 provider。
  // 硅基流动精选在账户过滤后计算，不让无权限模型占用推荐名额。
  // Euzhi 只保留 Grok 聊天条目，不在此添加其他站点系列补齐空列表。
  // 推荐对最终可展示列表计算，卡片与默认值不会指向隐藏条目。
  // 用户偏好由另一个持久化层管理，目录回包不会自动保存新模型。
  // 失败时 source 从 live 降为 cache，准确表达本次未重新取得公开价格。
  // 错误优先显示认证或可见性问题，避免用户只看到公开网络故障而忽略无效 key。
  let catalog = await cached(provider) || fallback(provider);
  if (force || catalog.source === 'snapshot' || Date.now() - Date.parse(catalog.updatedAt) >= TTL) {
    try {
      // 硅基流动公开首页会跳转 www，直接使用最终地址，继续禁止认证请求重定向。
      // 公开价目请求不附 API Key；站点要求登录时保留缓存，不借用账户会话。
      // Grok 推理端点仍是 /v1，不能把官网目录 URL 当模型请求地址。
      const content = await request(provider === 'euzhi' ? 'https://euzhi.vip/api/pricing' : 'https://www.siliconflow.cn/models');
      const models = provider === 'euzhi' ? parseEuzhi(JSON.parse(content)) : parseSiliconFlow(content);
      catalog = { provider, models, recommended: recommend(models), source: 'live', updatedAt: new Date().toISOString(), error: '' };
      memory.set(provider, catalog);
      // 冷启动目录可能尚无密钥文件；先创建缓存父目录，不要求用户先保存凭据。
      // 原子替换避免应用退出时截断旧缓存；临时文件不含账户可见性。
      // 失败只放弃持久化，不把本次成功获取的价格标为网络失败。
      try { await fs.mkdir(path.dirname(cachePath(provider)), { recursive: true }); await fs.writeFile(cachePath(provider) + '.tmp', JSON.stringify(catalog), { mode: 0o600 }); await fs.rename(cachePath(provider) + '.tmp', cachePath(provider)); } catch { /* 公开缓存不是本次读取成功的前提。 */ }
    } catch { catalog = { ...catalog, source: catalog.source === 'live' ? 'cache' : catalog.source, error: 'network' }; }
  }
  const checked = await accountModels(provider, catalog.models.map(x => ({ ...x, available: null })));
  const models = provider === 'siliconflow' ? curateSiliconFlow(checked.models) : checked.models;
  return { ...catalog, models, recommended: recommend(models), error: checked.error || catalog.error };
}
/**
 * 同一服务商一次只发起一个刷新，防止窗口重挂载制造请求风暴。
 * finally 释放登记，失败后仍允许用户重试。
 * provider 校验发生在使用缓存或构造网络地址之前。
 * @param {unknown} value @param {boolean} [force]
 */
function getProviderCatalog(value, force = false) {
  // providerId 拒绝未知值，发生在查 Map 或拼任何文件名之前。
  // pending 中的 Promise 包含价格与账户核对全过程，打开两个入口不会重复并行。
  // force 若遇到已进行的刷新就复用该次结果，不另起无限叠加的强制请求。
  // Promise 结束后删掉登记，之后的手动按钮仍可以正常重试。
  // finally 不吞掉异常，意外内部错误继续由 registerHandle 包成 IPC 失败。
  // renderer 对失败结果保留原有列表，主进程不需要回传伪造成功数据。
  // 函数不创建 interval；刷新频率由页面生命周期和缓存 TTL 双重控制。
  // 关闭应用不留下后台服务、计划任务或独立下载进程。
  // 测试可以单独调用入口并替换 fetch，以核对真实站点选择和认证隔离。
  // 导出的 request 只供主进程测试复用，preload 没有提供任意 URL 请求接口。
  const provider = providerId(value);
  let job = pending.get(provider);
  if (!job) { job = refresh(provider, force).finally(() => pending.delete(provider)); pending.set(provider, job); }
  return job;
}
module.exports = { getProviderCatalog, request, fallback };

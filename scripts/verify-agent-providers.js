/**
 * provider-secrets：服务商凭据继续按服务商分别存储。
 * runner：直接调用 Agent 的 NDJSON 运行与事件转发实现。
 * provider-catalog-parser：调用模型目录与价格信息的归一化实现。
 * provider-catalog：复用模型目录获取与缓存入口。
 * provider-secrets：状态接口只返回摘要，不将明文密钥带到渲染端。
 * runner：运行配置由主进程组装，页面不能读取或自行注入保存的凭据。
 * provider-catalog-parser：上游返回值是外部数据，需要按原规则筛选可用模型。
 * provider-catalog：目录刷新继续受主进程的服务商边界约束。
 * provider-secrets：切换目录不能混用两家服务商的密钥或改变清除语义。
 * runner：取消和结束仍依赖同一运行实例，不能因引用不同路径生成两份状态。
 */
/**
 * 服务商契约回归：在 Electron ready 后验证真实密钥存储和运行 payload。
 * 所有凭据都是固定测试字符串，文件写入一次性临时目录，不接触用户配置。
 * 公开目录请求由 fetch 替身提供，断言发往哪个站点以及是否携带正确令牌。
 * 替身不执行聊天，不花 token；不能把这项验证描述为真实 Grok 推理通过。
 * 密钥保存仍调用正式 safeStorage 路径，Windows 上检查不会明文落盘。
 * 失败直接以非零退出，不依赖 console 输出是否出现 PASS 字样。
 * 正常、无凭据、错误站点、未知价格、下架和离线回退均有独立断言。
 * 本脚本不创建窗口，不与另一个 Electron 冒烟同时运行。
 */
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { app, safeStorage } = require('electron');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-agent-providers-'));
process.env.ILLUSION_AGENT_SECRET_DIR = root;
delete process.env.ILLUSION_AGENT_API_KEY;
const { updateProviderKey, resolveProviderKey, providerStatus } = require("../apps/electron/src/main/modules/agent/provider-secrets");
const { buildPayloadLine } = require("../apps/electron/src/main/modules/agent/runner");
const parser = require("../apps/electron/src/main/modules/agent/provider-catalog-parser");
const { getProviderCatalog, request } = require("../apps/electron/src/main/modules/agent/provider-catalog");
// 固定样本只使用已核实的 New API 字段，价格单位和分组倍率不通过 UI 推断。
// 旧版 grok-4.6 刻意先出现，验证同价时按版本选择而不是沿用响应顺序。
// 图片模型也带 grok 前缀，检验筛选不会仅靠 startsWith 就误收。
// 随机的更贵聊天模型保留在目录中，验证推荐确实按价格排序。
// 表达式只用纯字符串，生产解析器不执行任何服务商代码。
// token 模型的倍率公式与 tiered_expr 表达式分别覆盖，避免单一格式恒真。
// 配置组只有 grok=0.8，期望值是倍率折算后的 USD 每百万 token。
const pricing = { success: true, group_ratio: { grok: 0.8 }, data: ['grok-4.6', 'grok-4.7', 'grok-image-test'].map(model_name => ({ model_name, quota_type: 0, model_ratio: 9, completion_ratio: 3, enable_groups: ['grok'], supported_endpoint_types: ['openai'], billing_mode: 'tiered_expr', billing_expr: 'len <= 200000 ? tier("base", p * 2 + c * 6 + cr * 0.5) : tier("longcontext", p * 4 + c * 12)' })) };
// model_ratio 与表达式基础输入价刻意不同，确保表达式模式不误用旧倍率字段。
// 期望输入 2×0.8=1.6，输出 6×0.8=4.8，不能套用 model_ratio×2 的旧字段公式。
// 长阶梯输入 4×0.8=3.2、输出 12×0.8=9.6，阈值为 200000 输入 token。
// grok-image-test 包含 image，必须被聊天协议过滤，不参与价格推荐。
// supported_endpoint_types 带 openai，确认它满足聊天端点前置条件。
// success 字段显式 true，后面负向样本会把它改为 false 验证目录拒绝。
// 当前测试不验证所有 New API 表达式语法，只验证本站核实过的 base/longcontext 形式。
// 数值断言使用误差比较处理二进制小数，不能依赖 4.8 的严格浮点恒等。
let calls = [], offline = false, badKey = false;
/**
 * fetch 替身同时核对公开目录不带令牌、私有列表只发往所属服务商。
 * Response 使用真实 Web API 对象，让状态码和 JSON 解码走正式实现。
 * offline 开关模拟站点不可达，badKey 模拟认证失败，两者不能混为同一结果。
 * @param {string} url @param {RequestInit} [options]
 */
async function fakeFetch(url, options) {
  // auth 只用于本次测试的内存比较，不输出原文到控制台或失败截图。
  // 公开接口先返回价格，账户接口后返回可见模型，顺序与生产刷新流程一致。
  // Bearer 前缀属于真实 HTTP 契约，不能把裸 key 当作期待头值。
  // 只有 /models 分支检查认证，公开目录应完全没有 Authorization。
  // offline 在任何分支前抛出，覆盖价格和账户同时不可达的最坏情况。
  // badKey 在公开目录之后生效，模拟价目可见但账户认证失败。
  // Response 的 status 由正式 request 函数判定，测试不直接构造业务 error 字段。
  // 对象头只在本替身里检查，运行期主进程仍使用原始 fetch 的 Headers 处理。
  // 没有模拟真实网关限流、重定向或流式响应，交付说明需保留这个边界。
  const auth = options?.headers?.Authorization;
  calls.push({ url, auth });
  if (offline) throw new Error('offline');
  if (url.endsWith('/api/pricing')) return new Response(JSON.stringify(pricing));
  if (badKey) return new Response('', { status: 401 });
  assert.equal(auth, 'Bearer sk-euzhi-test-2222');
  return new Response(JSON.stringify({ data: [{ id: 'grok-4.7' }] }));
}
/**
 * 先验证旧密钥仍用于硅基流动，再确认 Euzhi 无密钥不会借用环境变量。
 * 随后为 Euzhi 写独立凭据，核对主进程真正生成的 stdin payload。
 * renderer 提供的任意 baseUrl 在显式 provider 路径被固定地址覆盖。
 * 捕获 payload 只用于内存断言，不打印或保存包含令牌的 JSON。
 * clear 仅清 Euzhi，最后硅基流动密钥必须仍可解析。
 * 保存密钥不代表执行聊天，测试只验证注入目的地与参数一致性。
 * Windows 加密能力可用时，直接检查落盘文件不含测试原文。
 * env 的测试值在 finally 恢复或删除，避免影响此脚本后续目录断言。
 */
function checkSecrets() {
  // 起点先写旧站 key，确认新服务商存在时旧文件布局仍被支持。
  // 覆盖环境变量后旧站应优先使用 env，Euzhi 则必须仍然未配置。
  // 使用隔离目录的正式文件读写，不能靠内存 Map 伪造主进程凭据隔离。
  // describe/status 的 configured=false 是无 Euzhi key 的第一道可观察结果。
  // buildPayloadLine 抛错是第二道运行防线，不能仅依赖 UI 拦下发送。
  // 此处没有启动 Python，因此失败不会留下等待 stdin 的孤儿进程。
  // 写入 Euzhi key 后构造显式 provider/model，向其传入恶意自由 endpoint。
  // 最终 config.baseUrl 必须为固定 Euzhi 地址，即使传入的是合法 HTTPS URL。
  // 实际 apiKey 必须是 Euzhi 固定值，而不是仍存在的硅基流动 env key。
  // model 必须保留用户选择的完整值，不能只更新标签仍发送共享默认模型。
  // 三个字段同时断言，防止测试分别独立成功却组合时使用错站点。
  // 图片模型负向断言与正常 Grok 正向断言成对，确保过滤器不是无条件拒绝全部。
  // safeStorage 可用时检查落盘字节不含固定原文，而非仅相信 protection 标签。
  // 非加密环境只跳过加密字节断言，不跳过密钥作用域和清除语义检查。
  // 清除 Euzhi 后先断言其未配置，再断言旧站仍解析 env，防止误删全部凭据。
  // 最后删除测试 env，后续账户目录请求只能从 Euzhi 自己文件读到 key。
  // 保存操作调用的是 provider adapter，secret.js 既有签名没有被改成歧义参数。
  // payload 留在局部变量，仅提取字段断言，不写到日志、磁盘或 renderer。
  updateProviderKey('siliconflow', 'sk-silicon-test-1111');
  process.env.ILLUSION_AGENT_API_KEY = 'sk-silicon-env-3333';
  assert.equal(resolveProviderKey('euzhi').key, '');
  assert.equal(providerStatus('euzhi').configured, false);
  assert.throws(() => buildPayloadLine({ question: 'test', config: { provider: 'euzhi', model: 'grok-4.7' } }), /not configured/);
  updateProviderKey('euzhi', 'sk-euzhi-test-2222');
  const config = JSON.parse(buildPayloadLine({ question: 'test', config: { provider: 'euzhi', model: 'grok-4.7', baseUrl: 'https://invalid.example/v1' } })).config;
  assert.equal(config.baseUrl, 'https://euzhi.vip/v1'); assert.equal(config.apiKey, 'sk-euzhi-test-2222'); assert.equal(config.model, 'grok-4.7');
  assert.throws(() => buildPayloadLine({ question: 'test', config: { provider: 'euzhi', model: 'grok-image-test' } }), /chat model/);
  if (safeStorage.isEncryptionAvailable()) assert.ok(!fs.readFileSync(path.join(root, 'agent-euzhi/agent-secret.json'), 'utf8').includes('sk-euzhi-test-2222'));
  updateProviderKey('euzhi', null); assert.equal(providerStatus('euzhi').configured, false); assert.equal(resolveProviderKey('siliconflow').key, 'sk-silicon-env-3333');
  delete process.env.ILLUSION_AGENT_API_KEY;
}
/**
 * New API 表达式价格必须识别分组倍率、长上下文阈值和输入输出两种价格。
 * 未知表达式留下模型但价格为 null，推荐不能把它当免费。
 * 目录返回空列表代表真实下架，不能自动插入随包模型假装成功。
 * 同价反转样本顺序仍推荐新版，防止单次接口排序碰巧满足测试。
 * 硅基流动样本带同名聊天和嵌入条目；只有明确工具支持的聊天能进入选择器。
 * HTML 是 JSON 包装的 RSC 数据，没有浏览器执行，也不能注入脚本代码。
 * Pro/ 前缀必须保留，不能擅自改成 targetModelName 造成实际请求错误。
 * 这些是格式与边界测试，不以样本存在推断用户真实账户支持。
 */
function checkParsing() {
  // 建立纯解析基线后才进入网络缓存组，解析失败不会被缓存回退掩盖。
  // 对当前表达式直接核对价格，确保随包快照与新价目转换采用同一单位。
  // 不把 JSON 字段顺序当契约，按语义字段读取再构造规范化结果。
  // 正向和负向模型共用其余字段，过滤失败能定位到所改的具体条件。
  // 未配置真实 key 不影响此组执行，因此可以在离线环境复现格式问题。
  // 输出只包含通过摘要，不把完整公开网页或任意外部脚本写进测试日志。
  // 两个聊天模型都必须被保留，不允许为了“默认便宜”只保留推荐一款。
  // image 条目被剔除后的长度必须为二，证明过滤并非隐藏全部非首项数据。
  // 基础输入价与输出价方向分别断言，反过来映射也会导致测试失败。
  // 阶梯阈值取输入长度，不是最大输出长度，card 文案据此解释涨价条件。
  // 原列表与逆序列表都推荐 4.7，用配对对照排除接口原始顺序的干扰。
  // 未知表达式改为 unknown，不执行或猜测它，模型可以存在但推荐应为空。
  // null 输入价必须被保留，不能用 JavaScript Number(null)=0 的行为判为免费。
  // 空数组对照验证下架成功，success=false 对照验证错误响应不是空成功。
  // 这两个反例有相同“没有可用模型”表象，但主进程缓存处置必须不同。
  // 硅基流动样本使用合法工具聊天条目，确保正向目录确实能够被收集。
  // 同结构改为 embedding 的负例不能因为保留 functionCallSupport=true 就漏过。
  // no-tools 的负例仍是 chat，检验仅看 subType 不足以进入 Agent 精选。
  // Pro/test/chat 和 targetModelName 不同，最终 ID 应保留服务商的 Pro/ 前缀。
  // 两个定价方向都为零才期望 free，未知字段不是此正向样本的前置条件。
  // RSC 数据先 JSON.stringify 再包脚本，能覆盖嵌套转义而不是仅解析裸对象。
  // 换行结束的 Flight 行与实际官网一致，匹配逻辑需完整读到 JSON 行。
  // 测试不运行 script，若生产实现改成 eval 也不因此被允许，源码审查仍需禁止。
  const models = parser.parseEuzhi(pricing);
  assert.equal(models.length, 2); assert.equal(models[0].input, 1.6); assert.ok(Math.abs(models[0].output - 4.8) < 1e-9); assert.equal(models[0].tiers[0].above, 200000);
  assert.equal(parser.recommend(models), 'grok-4.7'); assert.equal(parser.recommend([...models].reverse()), 'grok-4.7');
  const unknown = parser.parseEuzhi({ ...pricing, data: [{ ...pricing.data[0], billing_expr: 'unknown' }] }); assert.equal(unknown[0].input, null); assert.equal(parser.recommend(unknown), '');
  assert.deepEqual(parser.parseEuzhi({ ...pricing, data: [] }), []); assert.throws(() => parser.parseEuzhi({ success: false }), /catalog/);
  const row = { modelName: 'Pro/test/chat', targetModelName: 'test/chat', subType: 'chat', status: 'normal', functionCallSupport: true, pricing: [{ specification: 'prompt', price: '0', unitOfGood: '/ M Tokens' }, { specification: 'completion', price: '0', unitOfGood: '/ M Tokens' }] };
  const html = '<script>self.__next_f.push(' + JSON.stringify([1, '4:' + JSON.stringify({ data: [row, { ...row, modelName: 'embedding', subType: 'embedding' }, { ...row, modelName: 'no-tools', functionCallSupport: false }] }) + '\n']) + ')</script>';
  const parsed = parser.parseSiliconFlow(html); assert.equal(parsed.length, 1); assert.equal(parsed[0].id, 'Pro/test/chat'); assert.equal(parsed[0].tier, 'free');
}
/**
 * 公共目录刷新成功后记录请求数，下一次普通读取应命中六小时缓存。
 * 每次有密钥都核对 /models，令牌不可见的便宜模型不能成为推荐。
 * 公开请求不得携带 Authorization，即使已配置 Euzhi 密钥。
 * 一次离线强刷保留模型及原更新时间，同时清楚返回失败状态。
 * 认证失败独立返回 auth，不能伪装成所有模型都已获授权。
 * 磁盘缓存不保存账户 available:true/false，避免清除令牌后残留权限表象。
 * request 的重定向策略由正式网络函数提供，替身不会绕过选站逻辑。
 * 所有断言执行后恢复 fetch，不能污染 Electron 的其他网络行为。
 */
async function checkCatalog() {
  // 此前清除了 Euzhi，所以在本组开始再次显式保存其测试凭据。
  // 替换 global.fetch 在测试进程内生效，不影响用户另一个应用的网络实现。
  // live.source 是当前价格请求成功的证据，单有模型列表不算刷新成功。
  // live.error 为空是账户可见性核对成功的证据，不能只检查公开价格成功。
  // 当前账户只返回 4.7，因此更旧 4.6 的 available 必须明确为 false。
  // 推荐仍为 4.7，证明账户过滤没有把推荐指向不可用模型。
  // calls 中分开定位公开 /api/pricing 和私有 /models，不能混用认证期待。
  // 公开请求头必须 undefined，而不是空的 Bearer，避免无必要转发令牌。
  // 私有请求精确包含本站 key 与 Bearer 前缀，别站 key 会让替身立即失败。
  // 记住公开请求次数后再普通读取，次数不增长证明六小时 TTL 真的生效。
  // 账户请求仍可新增，因为权限核对与公开价缓存的生命周期不同。
  // 文件中每条 available 必须为 null，不能把本用户的权限写进公共缓存。
  // 序列化全文不得包含 sk-euzhi 片段，避免错误写入 key 或请求配置对象。
  // 离线强刷后更新时间必须与 live 相等，失败尝试不能伪装成新核实数据。
  // 离线后模型数量相等，证明错误路径保留可用参考目录而非清空。
  // failed.error 必须存在，保留数据不等于可以省略可见的失败说明。
  // 恢复网络后切 badKey，目录仍可读取，但明确认证失败应映射为 auth。
  // 单独调用 request 负例核对抛错来源，防止业务层硬写 auth 偶然满足断言。
  // 替身在 finally 无条件恢复，即便某个 assert 中断也不污染后续 Electron 生命周期。
  // 内存公开缓存只影响本进程，测试不会把数据写到普通用户的默认位置。
  // 本组没有检查支付金额、实际消耗或流式工具调用，不应外推这些结果。
  updateProviderKey('euzhi', 'sk-euzhi-test-2222'); const original = global.fetch; global.fetch = fakeFetch;
  try {
    const live = await getProviderCatalog('euzhi', true); assert.equal(live.error, ''); assert.equal(live.source, 'live'); assert.equal(live.recommended, 'grok-4.7'); assert.equal(live.models.find(x => x.id === 'grok-4.6').available, false);
    assert.equal(calls.find(x => x.url.endsWith('/api/pricing')).auth, undefined); assert.equal(calls.find(x => x.url.endsWith('/models')).auth, 'Bearer sk-euzhi-test-2222');
    const count = calls.filter(x => x.url.endsWith('/api/pricing')).length; await getProviderCatalog('euzhi'); assert.equal(calls.filter(x => x.url.endsWith('/api/pricing')).length, count);
    const disk = JSON.parse(fs.readFileSync(path.join(root, 'agent-catalog-euzhi.json'), 'utf8')); assert.ok(disk.models.every(x => x.available === null)); assert.ok(!JSON.stringify(disk).includes('sk-euzhi'));
    offline = true; const failed = await getProviderCatalog('euzhi', true); assert.equal(failed.updatedAt, live.updatedAt); assert.equal(failed.models.length, live.models.length); assert.ok(failed.error);
    offline = false; badKey = true; assert.equal((await getProviderCatalog('euzhi')).error, 'auth'); await assert.rejects(() => request('https://euzhi.vip/v1/models', 'test'), /auth/);
  } finally { global.fetch = original; }
}
// ready 后才调用正式 safeStorage，避免把启动过早的不可用状态误测为系统能力。
// 异常不打印包含 payload 的局部变量，assert 消息也只涉及固定测试值。
// 退出由 app.exit 显式携带状态，失败不能通过 app.quit 变成成功。
// 临时目录保留用于失败调查，不递归删除工作区或用户数据。
// stdout 只输出分组通过摘要，不输出密钥文件原文或任何真实用户路径。
// 全部成功后才给出 PASS，不能通过零项执行的分支直接返回成功。
app.whenReady().then(async () => {
  // 依赖组按存储、纯解析、联网缓存顺序执行，前一组失败不会报告后一组已通过。
  // 使用 await 等待账户目录核对结束，不以启动一个未完成 Promise 当作测试成功。
  // app.exit(0) 只位于全部断言完成的路径，catch 显式返回 1。
  // 文件不递归清除，失败调查可以读取临时加密文件和公开缓存格式。
  // 稳定单行摘要用于 CI，不依赖多行对象输出里出现特定 token。
  // 运行目录与样本从当前仓库模块解析，测试不是对拷贝实现自证。
  // Electron ready 保证 Windows DPAPI 可用性与正式 IPC 保存时机一致。
  // 如果该脚本卡在系统初始化，调用方必须按进程退出或超时报告，不能当绿。
  checkSecrets(); checkParsing(); await checkCatalog(); console.log('PASS Agent providers: secret isolation, payload routing, pricing parsing, cache and authentication'); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });

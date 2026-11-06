/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * window-chrome：复用同一份窗口装饰配置与启动参数。
 */
/**
 * Agent 模型选择真实页面回归：静态导出、正式 preload、正式密钥与目录 handler。
 * 远端 fetch 使用固定公开价格夹具；聊天入口只捕获配置，不启动付费推理。
 * 用户数据与凭据在一次性目录里，测试不会覆盖本机已有 API Key。
 * 从真实按钮打开弹窗、切服务商、选模型、保存密钥，再通过正式发送按钮提交。
 * reload 后再次检查选择，避免只验证 Zustand 内存而遗漏普通 JSON 持久化。
 * 1280 和 900 宽分别覆盖居中弹窗与紧凑 main，几何来自真实 Chromium。
 * 手动刷新失败后检查旧目录仍可见，不能用截图成功代替错误态验证。
 * 本测试不证明 Grok 服务端工具调用可用，也不访问真实账户或聊天 API。
 */
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/src/main/core/windows/window-chrome");
const smoke = require('./lib/smoke-harness').createSmokeHarness({ name: 'agent-providers', timeoutMs: 90000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-agent-provider-ui-'));
// 使用独立 Chromium userData，旧账户 cookie 和用户主题不会改变本轮页面前置条件。
// ILLUSION_AGENT_SECRET_DIR 指向同一临时根，正式 safeStorage 写入仍与真实用户隔离。
// 删除测试进程继承的旧 Agent env key，缺钥用例才能真实覆盖 Euzhi 未配置状态。
// 不修改用户根 .env，也不打印环境变量，其他应用进程的配置完全独立。
// 公开价格 fixture 与密钥持久化分离，网络返回不能直接宣称 key 已保存。
// 浏览器里的普通用户文档由共享 guest fixture 保留，reload 可以核对真实写回的数据。
// 该文档是内存替身，测试验证持久化桥接语义，不声称完成物理磁盘断电恢复。
// production storage 的文件读写和加密字节由 verify-agent-providers 另行覆盖。
// 两个维度的结论分别记录，不能用 UI reload 代替主进程凭据落盘检查。
// offscreen 避免抢占桌面焦点，用户仍可以继续操作自己的客户端。
// 背景节流显式关闭，消息事件和布局通知不以窗口可见性为前提。
// 本轮只创建一扇测试窗口，不使用全局 Stop-Process 清理用户进程。
process.env.ILLUSION_AGENT_SECRET_DIR = root; delete process.env.ILLUSION_AGENT_API_KEY;
app.setPath('userData', path.join(root, 'browser')); app.disableHardwareAcceleration(); smoke.setWorkDir(root); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/modules/agent/agent.handlers").registerAgentHandlers();
const handlers = require("../apps/electron/src/main/core/windows/window.handlers"); handlers.registerThemeHandlers(); handlers.registerWindowHandlers();
require('./lib/guest-session-fixture').installGuestDocumentFixture();
// 账户返回未登录，业务页走长期游客，不申请真实账户资料。
// 本地模型、生成物和下载队列全部为空，选择器不得依赖用户安装的绘图模型。
// 输出目录只用于页面布局，测试不执行生成或写入任何用户图片。
// 模型响应通过公开夹具构造，密钥状态使用正式主进程 handler。
// 聊天 handler 捕获的是 buildPayloadLine 的脱敏字段，原密钥不记录到 request。
// 这样能验证 UI 参数实际进入运行配置，而不是只看按钮标签变化。
// 不伪造回答内容；发送成功后才由测试明确推送最终事件结束运行状态。
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false } }));
for (const channel of [C.MODELS_SCAN, C.FILES_LIST_GENERATED_IMAGES, C.FILES_LIST_OUTPUT_FOLDERS]) registerHandle(channel, () => []);
registerHandle(C.MODELS_DOWNLOAD_LIST, () => ({ revision: 0, tasks: [] })); registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root); registerHandle(C.CHANGELOG_READ, () => '');
// 设置页同时挂载其他凭据区，提供未配置摘要避免其读取用户真实密钥。
// 这些替身不参与 Agent 保存断言，只消除无关页面的缺失 handler 噪音。
// 默认用户数据路径使用本轮临时目录，不能暴露真实默认路径。
registerHandle(C.CIVITAI_KEY_STATUS, () => ({ configured: false, protection: '', tail: '' }));
registerHandle(C.PROMPT_SECRET_STATUS, () => ({ configured: false, protection: '', tail: '' }));
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => path.join(root, 'document.json'));
let win, captured, offline = false;
// captured 不保存整个 config，因为 buildPayloadLine 中确实包含解密后的 key。
// matchingKey 只是一项布尔断言投影，截图和 stdout 都拿不到密钥原文。
// baseUrl 与 provider 同时核对，可以发现 UI label 变了但 payload 仍指向旧站的错误。
// 运行 handler 的替身绕过真实 Python 执行，权限和参数验证仍复用生产 validator。
// final 事件稍后由测试发送，避免 runId 还没写入 store 时事件被正常丢弃。
// 这个替身不会向用户伪装一个实际生成产物，答案只是固定 test complete。
// captured 只有真实发送按钮调用正式 bridge 后才赋值，直接改 DOM 标签不够通过。
// 密钥设置和清除通道保持正式实现，不能由 configured=true 常量替身自证隔离。
registerHandle(C.AGENT_RUN, (_event, options) => { const { config } = JSON.parse(require("../apps/electron/src/main/modules/agent/runner").buildPayloadLine(options)); captured = { provider: config.provider, model: config.model, baseUrl: config.baseUrl, matchingKey: config.apiKey === 'sk-euzhi-ui-2222' }; return { runId: 'provider-ui' }; }, require("../apps/electron/src/main/modules/agent/agent.handlers").validateRunArgs);
// 两个聊天模型同价，4.7 应作为推荐；图片模型不在此夹具中注册。
// /models 列表只允许当前测试的 Grok，认证请求走正式主进程选站路径。
// 硅基流动页面故意离线，验证它不会阻断 Euzhi 目录或偷用其 API Key。
// offline 只影响后续目录请求，已经渲染的 card 必须仍保留。
// fetch 替身不回任何真实账户 ID、余额或令牌限额。
// 即使产品意外发出聊天网络请求，替身也会抛错，不能访问外部服务。
global.fetch = async url => {
  // 路由匹配使用固定 endpoint 后缀，任何 chat/completions 请求都视为意外。
  // 测试不进行真实 HTTP，即使用户环境可联网也不会调用付费模型。
  // 公开价格响应不带用户账户数据，available 由另一次 /models 映射得来。
  // 两个 Grok 都可见，选择 4.7 的依据必须是同价版本规则而非过滤掉 4.6。
  // 硅基流动公开目录故意失败，用于验证另一个服务商故障不阻断 Euzhi。
  // 其随包列表仍应可浏览，但本测试不把它标成联网成功。
  // offline 后全部路径抛错，force 按钮必须显示失败而不清空当前 Grok card。
  // Response 由真实 Web API 构造，主进程 request 仍执行状态与文本处理。
  // 本替身没有模拟真实 CORS，联网留在主进程本就不依赖 renderer 的跨域许可。
  // 真实服务商 401、缓存内容与认证头的断言在更低层契约测试中单独覆盖。
  if (offline || String(url).includes('siliconflow')) throw new Error('offline');
  if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'grok-4.7' }, { id: 'grok-4.6' }] }));
  if (!String(url).endsWith('/api/pricing')) throw new Error('unexpected request');
  return new Response(JSON.stringify({ success: true, group_ratio: { grok: 0.8 }, data: ['grok-4.6', 'grok-4.7'].map(model_name => ({ model_name, quota_type: 0, model_ratio: 1, completion_ratio: 3, enable_groups: ['grok'], supported_endpoint_types: ['openai'] })) }));
};
// 页面操作经 harness 包装，executeJavaScript 单步超时不能被静默吞掉。
// 主进程轮询不用 requestAnimationFrame，被遮挡时仍有明确等待上限。
// React 受控输入使用原生 setter 加 input 事件，不直接调用 Zustand 私有方法。
// 返回值不能包含 API Key；输入密钥只是固定测试字符串。
// wait 超时点名条件，便于区分水合、弹窗、保存和任务启动失败。
// 截图直接来自 capturePage，不经裁切或缩放掩盖布局溢出。
const run = smoke.createRun(), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// run 由 harness 关联当前 webContents，不能把 executeJavaScript 发到用户窗口。
// wait 使用有限次数，每次等待都在主进程 setTimeout，不会因页面 hidden 停摆。
// 对于阶段前置条件只等待满足，不将超时结果强制改为 true。
// 输入 helper 使用浏览器控件原生 setter，React 的 onChange 必须真实处理 input 事件。
// 草稿、搜索和 API Key 都经相同输入 helper，避免直接调用 store 绕过表单。
// helper 不用 innerHTML 注入 card，所有模型展示由生产组件和正式 IPC 响应生成。
// JSON.stringify 只用于 JavaScript 参数字面量，不被拼进 shell 执行命令。
// selector 与 value 都是脚本自带固定值，不接受任意外部执行字符串。
// 函数等待 70ms 只是给 React 输入提交留有限时间，关键验证继续等待可观察结果。
// capturePage 截图还需要等合成帧，不能把 DOM 已更新误当像素已更新。
async function wait(expression) { for (let i = 0; i < 160; i++) { if (await run(`Boolean(${expression})`)) return; await delay(60); } throw new Error('Provider UI wait: ' + expression); }
async function input(selector, value) { await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`); await delay(70); }
/**
 * 先从旧硅基流动默认值开始，确认升级不会改变既有用户选择。
 * 弹窗内切站只浏览目录，尚未点击模型时 composer 不应已换成 Euzhi。
 * 搜索到唯一模型后选择，再 reload，验证模型 ID 和站点同时持久化。
 * 此阶段没保存凭据，向聊天入口提交必须被缺钥提示阻止。
 * 缺钥不能清空草稿或附件，也不能产生一个假的 Agent run。
 * 键盘 Escape 用正式外壳处理，不能靠测试移除 DOM 模拟关闭。
 * 截图在宽屏弹窗稳定后读取，记录真实卡片和来源说明。
 */
async function checkPicker() {
  // 新文档没有 agentPreferences，应恢复旧硅基流动默认而不是新 Euzhi。
  // 更新公告按真实按钮关闭，不能删 DOM 跳过应用启动生命周期。
  // 入口的 data-agent-model 必须是请求 ID，不是显示短名或本地绘图模型名。
  // 打开之后等待标题证明共享外壳已挂载，再点击 Euzhi 标签。
  // 等待两张卡片证明公开目录实际进入 renderer，不只检查标签颜色。
  // 浏览标签时检查 composer ID 仍为旧值，避免“看一眼”就改变下一次收费模型。
  // 搜索输入 4.7 后期望仅一张卡，确认当前目录过滤已工作。
  // 唯一卡片点击后只形成草稿，必须再点击右下角应用才提交偏好。
  // 应用完成才关闭弹窗，然后 reload，排除只改变组件本地 state 的实现。
  // reload 后等待模型恢复 4.7，不能抓到首帧默认值就立即判失败。
  // 再尝试发送前没有保存 Euzhi key，配置状态不能借用硅基流动环境变量。
  // 缺钥提示出现是用户可见阻止，captured 仍为空是主进程未启动运行的证据。
  // 草稿仍为原文，用户去设置回来无需重新输入是预期产品行为。
  // 窗口保持同一实例，证明重载而非新建 fixture 初始化成预选模型。
  // screenshot 在有限动画等待后采集，避免上一帧旧站目录残留。
  await win.loadURL('app://app/agent'); await wait("document.querySelector('[data-agent-model]')");
  await wait("document.querySelector('[aria-labelledby=update-announcement-title]')"); await run("document.querySelector('[aria-labelledby=update-announcement-title] button').click()");
  smoke.check('Legacy provider retains model', await run("document.querySelector('[data-agent-model]').dataset.agentModel==='deepseek-ai/DeepSeek-V4-Flash'"));
  await run("document.querySelector('[data-agent-model]').click()"); await wait("document.querySelector('#agent-model-dialog')"); await run("document.querySelector('[data-agent-provider=euzhi]').click()"); await wait("document.querySelectorAll('[data-agent-model-option]').length===2");
  smoke.check('Browsing provider does not commit selection', await run("document.querySelector('[data-agent-model]').dataset.agentModel==='deepseek-ai/DeepSeek-V4-Flash'"));
  // DOM 提交不等于合成帧已更新，截图等待有限的入场动画时长。
  // 不用 rAF 作等待前提，offscreen 与窗口遮挡不会无限挂起。
  // 截图必须来自 Euzhi 当前卡片，不能把上一帧硅基流动当作验证结果。
  await delay(350); fs.writeFileSync(path.join(root, 'models-wide.png'), (await win.webContents.capturePage()).toPNG());
  await input('[data-agent-model-search]', '4.7'); smoke.check('Search filters Grok catalog', await run("document.querySelectorAll('[data-agent-model-option]').length===1"));
  // 搜索已缩小为 4.7，选中后勾号应变化，但聊天入口仍保持旧模型。
  // 弹窗必须继续存在，不能把卸载后碰巧没改变标签当成草稿成功。
  // 同时核对应用可用，避免实现把卡片直接禁用来阻止立即切换。
  // 所有选择均从真实 DOM 点击，不直接调用 Zustand action 绕过确认流程。
  // 公开目录和推理仍是隔离夹具，本组只证明选择与持久化边界。
  // API Key 在下一阶段才配置，因此选卡与应用均不应启动聊天请求。
  await run("document.querySelector('[data-agent-model-option]').click()");
  smoke.check('Card selection stays in draft until Apply', await run("!!document.querySelector('#agent-model-dialog')&&document.querySelector('[data-agent-model-option]').getAttribute('aria-pressed')==='true'&&document.querySelector('[data-agent-model]').dataset.agentModel==='deepseek-ai/DeepSeek-V4-Flash'&&!document.querySelector('[data-agent-model-apply]').disabled"));
  // Escape 等价于取消本次浏览，应销毁草稿而不是悄悄保存。
  // 关闭后等待真实 DOM 消失，避免重新点击入口时仍命中旧弹窗。
  // 重新打开必须从持久化偏好初始化，旧 Grok 草稿不能自动恢复。
  // 初始站点仍是硅基流动，再切 Euzhi 才检查是否有残留勾号。
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await wait("!document.querySelector('#agent-model-dialog')");
  await run("document.querySelector('[data-agent-model]').click()"); await wait("document.querySelector('#agent-model-dialog')"); await run("document.querySelector('[data-agent-provider=euzhi]').click()"); await wait("document.querySelectorAll('[data-agent-model-option]').length===2");
  // 该站点从未应用过模型，因此所有卡片均未选中且应用禁用。
  // composer 保留旧模型是第二个证据，不能只验证卡片自身的局部状态。
  // 这组反证捕获卡片写盘后仅伪装不关闭弹窗的错误实现。
  smoke.check('Closing discards the unapplied provider and model', await run("!document.querySelector('[data-agent-model-option][aria-pressed=true]')&&document.querySelector('[data-agent-model-apply]').disabled&&document.querySelector('[data-agent-model]').dataset.agentModel==='deepseek-ai/DeepSeek-V4-Flash'"));
  // 重新选 4.7 后跨站浏览，草稿按站点分别保留而不污染实际偏好。
  // 回到 Euzhi 时仍应看到相同卡片勾号，价格刷新不能重置暂选。
  // 此时尚未保存，实际聊天入口仍应保持硅基流动。
  await run("document.querySelector('[data-agent-model-option=\"grok-4.7\"]').click();document.querySelector('[data-agent-provider=siliconflow]').click()");
  await run("document.querySelector('[data-agent-provider=euzhi]').click()");
  smoke.check('Provider browsing preserves only its local draft', await run("document.querySelector('[data-agent-model-option=\"grok-4.7\"]').getAttribute('aria-pressed')==='true'&&document.querySelector('[data-agent-model]').dataset.agentModel==='deepseek-ai/DeepSeek-V4-Flash'"));
  // 截图采集暂选状态与应用按钮，不拿已保存后的页面冒充确认前状态。
  // 短等待仅稳定合成帧，不用计时器模拟持久化结果或模型响应。
  // 后续重载断言仍负责确认真正写回文档，而不是只有视觉更新。
  await delay(200); fs.writeFileSync(path.join(root, 'models-apply.png'), (await win.webContents.capturePage()).toPNG());
  // 应用是本测试第一次提交选择，等待关闭表示保存 Promise 已完成。
  // 若保存失败，产品应保留弹窗并提示，不能让本等待误判为成功。
  // 随后的 reload 使用原有读写边界，检查模型和站点同时恢复。
  await run("document.querySelector('[data-agent-model-apply]').click()"); await wait("!document.querySelector('#agent-model-dialog')");
  win.webContents.reload(); await wait("document.querySelector('[data-agent-model]')?.dataset.agentModel==='grok-4.7'"); smoke.check('Provider and model survive reload', true);
  await input('[data-agent-input]', 'test provider'); await run("document.querySelector('[data-agent-send]').click()"); await wait("document.querySelector('[data-agent-key-notice]')"); smoke.check('Missing Euzhi key blocks run and retains draft', !captured && await run("document.querySelector('[data-agent-input]').value==='test provider'"));
}
/**
 * 使用正式 IPC 保存两站不同的固定测试密钥，核对只回状态、不回原文。
 * 点击真实发送按钮，捕获最终 stdin 路由字段，不执行真实模型请求。
 * provider、model、endpoint 和 key 四者必须同时来自 Euzhi。
 * 一次 final 事件解除任务状态，为后面的尺寸和刷新用例提供稳定页面。
 * 非法 provider、自由 baseUrl、以及页面传 apiKey 通过正式校验拒绝。
 * 捕获入口复用正式运行校验器，负向 IPC 请求仍会在业务逻辑前拒绝。
 * 清除 Euzhi 后硅基流动仍配置，证明 UI 操作不会串删另一站文件。
 */
async function checkSubmission() {
  // 前一阶段经真实设置保存 Euzhi key，这里仅查询状态，不再用 IPC 补造前置条件。
  // summary.success 和 configured 同时为真才算本地保存完成。
  // 序列化状态不能含 sk-euzhi，尾号和保护方式可以保留。
  // 另写硅基流动不同 key，为后面的清除隔离与错误密钥路由提供对照。
  // 非法 provider 通过 preload 真正调用主进程，不仅在页面类型层模拟拒绝。
  // INVALID_ARGUMENT 证明 validator 拒绝，而不是系统路径或网络碰巧失败。
  // 恶意 endpoint 用合法 HTTPS 形式，检验允许集而不是仅限制 URL scheme。
  // 注入 apiKey 用固定假值，生产入参禁止任何同名字段，不能仅忽略它。
  // 正向发送使用实际文本输入与按钮，生产 Agent store 应构造 provider/model 配置。
  // runId 返回后页面停止按钮出现，表明真实 store 已认领本次运行。
  // captured 四项路由字段必须一致，不能只证明 model 字符串单独正确。
  // matchingKey 为真确认主进程选择 Euzhi 凭据，而不是 renderer 传了原值。
  // final 事件带相同 runId，仍经正式事件消费者写回助手消息和运行状态。
  // 停止按钮消失后再清凭据，排除正在执行的任务 UI 与后续用例状态干扰。
  // 清除 Euzhi 后查询硅基流动仍配置，防止“清除当前”误删全部站点。
  // 本组不声明真实模型回答正确，因为执行端已明确用捕获替身替代。
  const summary = await run("window.electronAPI.agentSecretStatus('euzhi')"); smoke.check('Scoped secret returns only summary', summary.success && summary.data.configured && !JSON.stringify(summary).includes('sk-euzhi'));
  await run("window.electronAPI.agentSetSecret('sk-silicon-ui-1111','siliconflow')");
  smoke.check('Invalid provider rejected', await run("window.electronAPI.agentSecretStatus('unknown').then(x=>!x.success&&x.code==='INVALID_ARGUMENT')"));
  // 自由 endpoint 和 renderer API Key 都必须在捕获 handler 前被拒绝。
  // 断言错误码，不能把 Python 启动后碰巧网络失败当成边界正确。
  // 两个请求使用固定假值，不携带或打印任何真实密钥。
  smoke.check('Arbitrary endpoint rejected', await run("window.electronAPI.runAgent({question:'test',config:{provider:'euzhi',model:'grok-4.7',baseUrl:'https://invalid.example/v1'}}).then(x=>!x.success&&x.code==='INVALID_ARGUMENT')"));
  smoke.check('Renderer key injection rejected', await run("window.electronAPI.runAgent({question:'test',config:{apiKey:'fake-test'}}).then(x=>!x.success&&x.code==='INVALID_ARGUMENT')"));
  await run("document.querySelector('[data-agent-send]').click()"); await wait("document.querySelector('[data-agent-stop]')");
  smoke.check('Submission routes model endpoint and key together', captured?.provider === 'euzhi' && captured.model === 'grok-4.7' && captured.baseUrl === 'https://euzhi.vip/v1' && captured.matchingKey);
  win.webContents.send(C.AGENT_EVENT, { runId: 'provider-ui', type: 'final', text: 'test complete', steps: 1 });
  await wait("!document.querySelector('[data-agent-stop]')");
  smoke.check('Clearing Euzhi retains SiliconFlow key', await run("window.electronAPI.agentClearSecret('euzhi').then(()=>window.electronAPI.agentSecretStatus('siliconflow')).then(x=>x.success&&x.data.configured)"));
}
/**
 * 从缺钥提示的真实设置链接进入表单，不直接调用保存 IPC 代替用户操作。
 * 先输入未保存密钥再切站点，确认明文草稿不会被带到另一服务商。
 * 返回 Euzhi 后重新输入固定测试 key 并点击保存，等待正式状态摘要更新。
 * 实际存储仍使用系统加密和本轮临时目录，不触及用户已有凭据。
 * 设置页与 composer 共用偏好，返回聊天后必须仍显示 Grok 模型。
 * 保存仅证明本地凭据已落盘，目录认证替身不代表真实站点接受测试 key。
 * 截图保存表单的空输入与已配置状态，不能展示原始测试 key。
 * 最后重新填草稿，为真实发送按钮用例准备前置条件。
 */
async function checkSettings() {
  // 从 notice 链接进入 /settings#agent，复用用户真实导航与锚点流程。
  // 等 agent-api-key 输入存在，避免路由过渡期间点击到旧页面按钮。
  // unsaved-test-key 只用于验证草稿清理，不应出现在任何持久化结果。
  // 点硅基流动标签后等待 aria-pressed，确保共享偏好已经完成切换。
  // 输入空值断言是可见结果，不直接检查组件私有 React state。
  // 切回 Euzhi 时输入仍应是新表单，未保存的另一站内容不能自动带回来。
  // 新输入通过保存按钮写入正式 encrypted secret 文件，状态点必须变 configured。
  // 保存结束后原文输入应清空，避免后续截图把凭据展示出来。
  // 截图再等待有限时间，页面切换动画不能留下聊天页旧快照。
  // 返回 Agent 使用同一文档 fixture，偏好应仍是 Euzhi + grok-4.7。
  // 新加载页面需重新从主进程查询凭据摘要，不依赖设置页残留 configured。
  // 填入 test provider 后才交给下一组实际发送，准备步骤与行为断言清楚分离。
  // 设置页其他功能的凭据读取都有未配置替身，不接触用户真实 Civitai 或 GLM key。
  await run("document.querySelector('[data-agent-key-notice-link]').click()"); await wait("document.querySelector('#agent-api-key')");
  await input('#agent-api-key', 'unsaved-test-key'); await run("document.querySelector('[data-agent-provider=siliconflow]').click()"); await wait("document.querySelector('[data-agent-provider=siliconflow]').getAttribute('aria-pressed')==='true'");
  smoke.check('Switching provider discards unsaved key draft', await run("document.querySelector('#agent-api-key').value===''") );
  await run("document.querySelector('[data-agent-provider=euzhi]').click()"); await wait("document.querySelector('[data-agent-provider=euzhi]').getAttribute('aria-pressed')==='true'");
  await input('#agent-api-key', 'sk-euzhi-ui-2222'); await run("document.querySelector('[data-agent-key-save]').click()"); await wait("document.querySelector('[data-agent-key-status]').dataset.agentKeyStatus==='configured'");
  smoke.check('Settings clears saved key input', await run("document.querySelector('#agent-api-key').value===''") );
  // 软导航的 view-transition 可能仍保留旧聊天快照；重新载入设置路由后再取像素。
  // 这次重载同时检查保存后的状态来自主进程，不能靠刚保存的组件局部状态。
  // 不在截图前填入原文，capturePage 只记录空输入与配置尾号。
  // 唯一查询参数强制完整导航，避免同 URL 的 loadURL 仍停留在旧页面过渡中。
  // 离屏窗口可能尚未提交新的合成帧，主动请求重绘后再采集设置页。
  // invalidate 只用于测试窗口，不改变产品动画或取消实际用户导航。
  // 额外等待有固定上限，不用可能停止回调的 rAF 作为截图前置条件。
  await win.loadURL('app://app/settings?provider-preview=1#agent'); await wait("document.querySelector('[data-agent-key-status]')?.dataset.agentKeyStatus==='configured'");
  win.webContents.invalidate(); await delay(500); fs.writeFileSync(path.join(root, 'provider-settings.png'), (await win.webContents.capturePage()).toPNG());
  await win.loadURL('app://app/agent'); await wait("document.querySelector('[data-agent-model]')?.dataset.agentModel==='grok-4.7'"); await input('[data-agent-input]', 'test provider');
}
/**
 * 紧凑窗口应使用共享外壳的 main 布局，不发生模型卡溢出视口。
 * force 刷新故意失败，已有目录仍保留，页面必须显示错误说明。
 * Escape 从实际键盘事件进入公共监听，关闭后触发按钮可继续使用。
 * 对话结果不被模型弹窗覆盖或删除，关闭后原回复继续可见。
 * 仅测本次窗口，不枚举或强制关闭用户其他 Electron 进程。
 * offscreen 截图不抢焦点；backgroundThrottling=false 保证后台生命周期。
 * 最新构建指纹是前置条件，不在旧 out 上误判这次代码。
 * 任一异常通过 smoke.finish 给出非零退出，所有断言均必须实际执行。
 */
async function checkNarrow() {
  // 当前 app 的 nav 宽度已与最初共享常量不同，回归必须以 main 实测边界为准。
  // 新对齐属性是公共外壳可选参数，其他页面未传时保留原行为。
  // 本组检查的是 Agent 调用方正确传实测值，不声称已覆盖所有资源工具布局。
  // 宽窄切换不重新创建 provider store，用户模型选择和聊天答案均应保留。
  // 失败提示出现后仍能 Escape 返回，是目录故障不破坏基本导航的验证。
  // 900px 低于公共外壳的宽屏阈值，仍足够桌面 nav 存在。
  // 用 setSize 而不是直接改 matchMedia 返回，测试真实浏览器布局分支。
  // 宽度变化后先等待有限时间，再通过原模型入口重新打开同一套弹窗。
  // 读取 right 与 innerWidth，约束模型窗口不能横向溢出整个客户端。
  // 与 main 的 left 配对比较，覆盖旧常量 220px 与当前 CSS 窄 nav 不一致的问题。
  // 这项几何断言比“窗口在视口内”更强，能发现左边露出聊天内容的缝隙。
  // 强刷前必须等打开时自动刷新结束，否则 disabled 按钮点击不会发起新请求。
  // 将 offline 放在等待之后，确保本次故障来自用户 force 动作的预期时机。
  // role=status 查询限定在弹窗里，不能误把设置页旧 toast 当当前失败提示。
  // 卡片数量仍为二，证明失败没有清空已取得目录。
  // 此时 Euzhi key 已被清除，缓存公开 card 应显示未核实而不是旧账户可见标记。
  // Escape 从 document 的真实键盘监听进入公共外壳，不调用组件私有关闭方法。
  // 关闭之后助手答案仍是 test complete，目录操作不能替换或删除对话内容。
  // 本组只测紧凑布局，宽屏卡片展示来自前面独立截图，不混淆两个命题。
  win.setSize(900, 850); await delay(120); await run("document.querySelector('[data-agent-model]').click()"); await wait("document.querySelector('#agent-model-dialog')");
  smoke.check('Narrow dialog stays inside viewport', await run("(()=>{const r=document.querySelector('[data-resource-dialog=agent-model-dialog]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1})()"));
  // 当前 nav 已通过 CSS 缩窄，必须与 main 左边缘对齐，不能再留旧 220px 空白。
  // 测量主容器而不是写死像素，展开/收起或后续导航样式调整仍受约束。
  // 容差一像素只覆盖小数像素，不允许整条聊天内容透在弹窗侧面。
  smoke.check('Compact dialog aligns to actual main inset', await run("Math.abs(document.querySelector('[data-resource-dialog=agent-model-dialog]').getBoundingClientRect().left-document.querySelector('[data-app-main]').getBoundingClientRect().left)<1"));
  // 打开弹窗会先核对账户列表，等该请求结束再点击刷新，不能点击 disabled 按钮。
  // 错误提示限定到当前弹窗，排除设置页 toast 的全局 status 区域。
  // 先前失败发生在测试前置条件，不能据此误改产品的目录保留逻辑。
  await wait("!document.querySelector('[data-agent-catalog-refresh]').disabled"); offline = true; await run("document.querySelector('[data-agent-catalog-refresh]').click()"); await wait("[...document.querySelectorAll('[data-resource-dialog=agent-model-dialog] [role=status]')].some(e=>e.textContent.includes('刷新失败'))");
  smoke.check('Failed refresh keeps Grok choices', await run("document.querySelectorAll('[data-agent-model-option]').length===2")); await delay(200); fs.writeFileSync(path.join(root, 'models-narrow.png'), (await win.webContents.capturePage()).toPNG());
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await wait("!document.querySelector('#agent-model-dialog')"); smoke.check('Escape restores conversation', await run("document.querySelector('[data-agent-answer]')?.textContent.includes('test complete')"));
}
async function main() {
  // Electron ready 后才创建窗口，确保 preload、safeStorage 和协议处于生产时机。
  // assertBuildFresh 在载入前验证源码指纹，陈旧 out 必须以环境错误而非代码回归解释。
  // contextIsolation 和 nodeIntegration 与正式客户端边界一致，页面不能直接读本地文件。
  // sandbox=false 保持本项目 CommonJS preload 约定，不临时打开 Node 集成绕过桥接。
  // additionalArguments 让自定义 head 采用生产窗口标记，截图不混用原生标题栏。
  // occlusion 清理只销毁本测试创建的遮挡窗口，不枚举用户其他窗口。
  // 四个阶段严格串行，同一 Agent 文档和密钥作用域贯穿整个用户操作流程。
  // 任一前置条件异常会进入 finally 销毁本窗口，再由顶层 catch 让套件失败。
  // smoke.allPassed 检查非抛错断言，截图或最后一步成功不能覆盖前面红项。
  // main catch 传原始异常给本地测试日志，实际业务 IPC 仍不向页面暴露堆栈。
  // 输出截图目录仅为一次性测试位置，用户工作区不会新增二进制截图资源。
  // 所有检查通过后才结束进程，不把仅创建窗口成功当作整个功能完成。
  await app.whenReady(); smoke.assertBuildFresh({ app });
  win = new BrowserWindow({ ...windowChromeOptions(), show: false, width: 1280, height: 900, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  smoke.attachWebContents(win.webContents); const occlusion = await smoke.hardenWindow(win);
  try { await checkPicker(); await checkSettings(); await checkSubmission(); await checkNarrow(); console.log('PROVIDER_SCREENSHOTS', root); }
  finally { occlusion.dispose(); win.destroy(); }
  smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch(error => smoke.finish({ app, ok: false, error }));

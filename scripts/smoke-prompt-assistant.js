/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * window-chrome：复用同一份窗口装饰配置与启动参数。
 * protocol：使用客户端的 app:// 与 localfile:// 协议实现。
 * window.handlers：窗口和主题 IPC 隶属 core 的系统交互边界。
 * index：窗口加载迁移后的真实 preload 桥接文件。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 */
/** Real preload/IPC prompt assistant regression with isolated secrets, deferred GLM and a local compatible API. */
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path"); const http = require("node:http");
const { app, BrowserWindow } = require("electron"); const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
// 正式应用的主题入口现在位于自定义 head，夹具也要声明相同窗口能力。
// 继续使用项目窗口工厂参数，不手工插入一个测试专用主题按钮。
// 浏览器模式不展示桌面标题栏，沿用旧夹具会找不到真实外观入口。
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/src/main/core/windows/window-chrome");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "prompt-assistant", timeoutMs: 60000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-assistant-")); process.env.ILLUSION_PROMPT_SECRET_DIR = path.join(root, "secrets");
// Euzhi 复用 Agent 的真实加密文件，测试必须把该分区也隔离到本轮临时根。
// 不读取或覆盖用户实际已配置的 Euzhi 凭据，也不沿用开发环境的硅基流动密钥。
// 原 GLM 与自定义端点仍使用上面的独立提示词助手测试目录。
process.env.ILLUSION_AGENT_SECRET_DIR = path.join(root, "agent-secrets");
app.disableHardwareAcceleration(); app.setPath("userData", path.join(root, "browser")); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol(); require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
// head 挂载时读取窗口状态，需要正式控制 handler 提供当前 BrowserWindow 信息。
// 注册的是既有产品 handler，测试没有向 renderer 暴露原生窗口实例。
// 隔离窗口的最大化状态不会影响用户正在操作的客户端。
require("../apps/electron/src/main/core/windows/window.handlers").registerWindowHandlers();
require("../apps/electron/src/main/modules/prompt-assistant/prompt-assistant.handlers").registerPromptAssistantHandlers();
let userData = { version: 1, settings: { paths: {}, theme: "light", outputPath: root }, promptAssistant: { provider: "glm", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.7-flash", customModel: "", presetId: "translate", presets: Array.from({ length: 24 }, (_, index) => ({ id: `fixture-${index}`, name: `Preset ${index + 1}`, instruction: "Translate to English, preserving the original scene." })) } };
registerHandle(C.USER_DATA_READ, () => ({ data: require("./lib/guest-session-fixture").withGuestSession(userData), filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, (_event, data) => { userData = data; return { data, filePath: "" }; });
// 本专项以游客运行，账户刷新应返回正式未登录结构，而不是报未注册 IPC。
// 不连接账户后端或伪造登录成功；提示词转换与账户认证仍保持各自边界。
// 该回执只消除夹具缺失噪声，错误业务状态仍可由其他真实断言发现。
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHENTICATED" } }));
for (const channel of [C.MODELS_DOWNLOAD_LIST, C.MODELS_SCAN, C.FILES_LIST_GENERATED_IMAGES, C.FILES_LIST_OUTPUT_FOLDERS]) registerHandle(channel, () => []);
for (const channel of [C.AGENT_SECRET_STATUS, C.CIVITAI_KEY_STATUS]) registerHandle(channel, () => ({ configured: false, source: "none", protection: "", tail: "" }));
// 两个密钥入口均经过生产 handler 与系统加密实现，不用布尔常量伪造共享成功。
// 只有公开目录回落固定随包数据，本测试不访问站点价格接口或触发真实聊天。
// Agent 请求通道虽然注册，但本套件只调用凭据，不启动 Python 工具循环。
require("../apps/electron/src/main/modules/agent/agent.handlers").registerAgentHandlers();
registerHandle(C.AGENT_CATALOG, (_event, provider) => require("../apps/electron/src/main/modules/agent/provider-catalog").fallback(provider));
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root); registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => ""); registerHandle(C.CHANGELOG_READ, () => "");
const requests = []; let complete; let win; let server; let endpoint; let localRequest;
const originalFetch = global.fetch;
// Agent 故意仍选择硅基流动，创建页显式选 Euzhi 不应偷偷改变聊天站点。
// 这里指定一个合法 Grok 聊天 ID，避免匹配结果依赖随包推荐日后更新。
// 普通文档只存模型名；真实认证密钥在后续场景通过正式 IPC 保存。
userData.agentPreferences = { provider: "siliconflow", models: { siliconflow: "fixture-silicon", euzhi: "grok-4" } };
// 只记录认证是否正确，不把明文令牌加入截图、用户文档或诊断输出。
// 固定响应只证明目的地、模型和提示词传输，不能作为真实 Grok 文案质量证明。
// Euzhi 不进入原 GLM 延迟队列，旧的输入冲突回归保留原请求编号。
const euzhiRequests = [];
// 下面只拦截本站固定 chat/completions 地址，其他 URL 仍交给原 fetch。
// 因此代码若误用了 custom 地址，不能误收到同一个成功假响应。
// Euzhi 记录独立数组，GLM 原有延迟编号不受新增供应商请求影响。
// 请求体以 JSON 读取，能核对 model、messages 和 stream 等真实传输字段。
// 授权只比较测试密钥对应的 Bearer 字符串，不输出该字符串本身。
// 返回标准 choices 结构，生产 responseText 仍负责空值、长度和文本解析。
// 不绕过 production service 直接向 textarea 写成功文本，替换必须来自 IPC 回包。
// 原 GLM 分支保留可控 complete，原稿被修改时的迟到响应仍可重复构造。
// 原 custom 分支由真实本地 HTTP 服务接收，不把所有端点都替换成同一个桩。
// 此测试不保证 Euzhi 域名当前可达，也不证明用户账户支持指定 Grok 模型。
// 固定响应没有账单副作用，所有请求都使用不存在于用户账户的夹具密钥。
// fetch 的替换只发生在测试主进程，renderer 仍不能读取令牌或任意请求头。
// 套件 finally 会恢复 originalFetch，错误退出也不把拦截留给其他业务。
// 如果实际实现改成另一个端点，本断言应失败提示契约变化，不能静默跟随。
// 目录读取也被替换成随包公开数据，避免价格网络抖动拖慢文本转换专项。
// 请求体只用于当前进程断言，不把用户正文或远端响应写入真实应用日志。
// 该夹具不检查图片输入，因为提示词助手的契约仅转换文本，Agent 图片能力保持独立。
// 同一文本可能在其他用例重复出现，判断此次请求使用数组长度而不是文本去重。
// 返回 Promise 与真实 fetch 一致，业务 finally 的 busy 释放仍会正常经过异步边界。
// 没有返回假配置状态，密钥存取和状态查询使用真实系统加密实现。
// 主进程请求在生产 timeout 保护之内，固定回包不代替超时错误映射的专项证明。
// 缺 key 的分支在 service 提前退出，本拦截不应被调用，计数可以验证这一点。
// 不接受仅 URL 前缀相同的请求，精确相等能发现多斜杠或重复 v1 的路径错误。
// Authorization 字段大小写采用现有 service 写法，头部格式变化需要同步审查测试。
// 响应未设置特殊测试标记，产品解析器不能根据 fixture 字段走旁路。
// 模型名按用户已保存的本站偏好传递，服务端验证仍由真实服务商负责。
// 全局拦截不负责切站或写偏好，所以菜单和 store 是否正确仍由界面用例检验。
// GLM 与 Euzhi 的响应内容故意不同，落点拿错供应商时精确文本断言能够发现。
// 本站成功回包不是自动配置凭据的依据，前序必须由真实表单成功保存密钥。
// Agent 保持硅基流动选择作为对照，测试不能为了方便先把两个入口切成同一站。
// 本地兼容服务保留原回包解析，新增分支没有减少旧代理连接的验证范围。
// 密钥在 safeStorage 内加密只验证本机存取，不承诺跨电脑复制文件还能解密。
// 清除使用本站 provider，不能用删除整个 secrets 根目录替代跨入口清除断言。
// 所有请求按测试步骤串行，避免同一个 complete 指针被并发 GLM 请求覆盖。
// 一次转换只允许一个 Euzhi 请求，可发现菜单保存或重载时意外自动提交。
// 测试凭据与业务文档分开设置临时根，普通 JSON 不能作为令牌的备用保存位置。
// 结果错误必须继续向 harness 抛出，不在拦截中 catch 成固定成功响应。
// 这些边界同时保护旧 GLM 行为，新增供应商不应把原有网络错误一概吞掉。
global.fetch = (url, options) => {
  if (String(url) === "https://euzhi.vip/v1/chat/completions") {
    euzhiRequests.push({ body: JSON.parse(options.body), authorized: options.headers.Authorization === "Bearer fixture-euzhi-key" });
    return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "euzhi translated tags" }, finish_reason: "stop" }] })));
  }
  if (!String(url).startsWith("https://open.bigmodel.cn/")) return originalFetch(url, options);
  requests.push(JSON.parse(options.body));
  return new Promise(resolve => { complete = (content = "a girl under the moon", status = 200, finish = "stop") => resolve(new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }] }), { status })); });
};
// 执行失败时补上当前操作，区分桥接失败、菜单节点缺失和输入框尚未挂载。
// 这里只记录测试脚本片段，不包含实际账户凭据；测试密钥也只存在隔离目录。
const delay = ms => new Promise(resolve => setTimeout(resolve, ms)); const run = source => win.webContents.executeJavaScript(source, true).catch(error => { throw new Error(`${error.message}: ${source}`); });
async function wait(source) { for (let i = 0; i < 150; i++) { if (await run(`(()=>{try{return Boolean(${source})}catch{return false}})()`)) return; await delay(50); } throw new Error("Assistant step timed out: " + source); }
async function fixtureRequest(previous) { for (let i = 0; i < 150 && requests.length === previous; i++) await delay(50); if (requests.length !== previous + 1) throw new Error("Fixture request missing"); }
const TOOL = "[data-prompt-assistant=prompt-editor]";
const qaDir = process.argv.find(value => value.startsWith("--qa-dir="))?.slice(9);
// 离屏窗口不保证每次 DOM 变化都立刻提交新帧，截图前主动请求一次绘制。
// 保留原 200ms 主进程等待，避免把旧缓冲中的无菜单页面当成新界面。
// 只刷新当前测试 WebContents，不改变产品主题、节点或菜单的可见状态。
async function capture(name) { if (qaDir) { fs.mkdirSync(qaDir, { recursive: true }); win.webContents.invalidate(); await delay(200); fs.writeFileSync(path.join(qaDir, name + ".png"), (await win.webContents.capturePage()).toPNG()); } }
async function click(selector) { await require("./lib/sidebar-menu-fixture").revealSidebarPreference(run, selector); await run(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function input(selector, text) { await run(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});const setter=Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;setter.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`); }
async function text(value) { await run(`document.querySelector('#prompt-editor').textContent=${JSON.stringify(value)}`); }
async function options() { await wait("!document.querySelector('[data-prompt-assistant-menu]')"); await click(`${TOOL} [data-assistant-options]`); await wait("document.querySelector('[data-prompt-assistant-menu]')"); }
async function item(id) { await click(`[data-assistant-item="${id}"]`); }
async function translation() { await click(`${TOOL} [data-assistant-translate]`); }
async function startServer() {
  server = http.createServer((request, response) => { let body = ""; request.on("data", chunk => { body += chunk; }); request.on("end", () => { localRequest = { body: JSON.parse(body), authorized: request.headers.authorization === "Bearer fixture-custom-key", url: request.url }; response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ choices: [{ message: { content: "local translated text" }, finish_reason: "stop" }] })); }); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); endpoint = `http://127.0.0.1:${server.address().port}/v1`;
}
async function checkBasics() {
  smoke.check("Single subtle icon rests inside each plain editor", await run("document.querySelectorAll('[data-prompt-assistant]').length===2&&document.querySelector('[data-assistant-actions]').dataset.expanded==='false'"));
  await run(`document.querySelector('${TOOL}').dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}))`);
  await wait(`document.querySelector('${TOOL} [data-assistant-actions]').dataset.expanded==='true'`);
  smoke.check("Hover expands the toolbar", true);
  await run(`document.querySelector('${TOOL}').dispatchEvent(new PointerEvent('pointerout',{bubbles:true,pointerType:'mouse',relatedTarget:document.body}))`);
  await wait(`document.querySelector('${TOOL} [data-assistant-actions]').dataset.expanded==='false'`);
  smoke.check("Leaving collapses the toolbar", true);
  await text("女孩站在月光下"); await translation();
  await wait("document.body.textContent.includes('设置 → API 密钥 → 提示词助手')");
  smoke.check("Missing credentials preserve the original input", requests.length === 0 && await run("document.querySelector('#prompt-editor').textContent==='女孩站在月光下'"));
  await options(); await item("provider"); await item("glm");
  smoke.check("Provider and GLM models form three cascade columns", await run("document.querySelectorAll('[data-prompt-assistant-menu] [role=menu]').length===3&&document.querySelectorAll('[data-assistant-item^=glm-4]').length===3"));
  await checkCascadeLayout();
  await capture("prompt-assistant-light");
  await item("glm-4.5-flash"); await options(); await item("settings");
  await checkKeySettings();
  await text("女孩站在月光下");
  await translation(); await fixtureRequest(0);
  smoke.check("Selected model and original text reach the API", requests[0].model === "glm-4.5-flash" && requests[0].messages[1].content === "女孩站在月光下");
  complete(); await wait("document.querySelector('#prompt-editor').textContent==='a girl under the moon'");
  smoke.check("Translation replaces the input", true); await click(`${TOOL} [data-assistant-undo]`);
  smoke.check("Undo restores the exact original text", await run("document.querySelector('#prompt-editor').textContent==='女孩站在月光下'"));
}
async function checkConflicts() {
  await translation(); await fixtureRequest(1); await text("newer edit"); complete("older translated result");
  await wait("document.querySelector('[data-assistant-result]')");
  smoke.check("A deferred result cannot overwrite newer edits", await run("document.querySelector('#prompt-editor').textContent==='newer edit'"));
  await run("Array.from(document.querySelectorAll('[data-assistant-result] button')).find(button=>button.textContent==='应用结果').click()");
  smoke.check("Explicit apply accepts the preserved result", await run("document.querySelector('#prompt-editor').textContent==='older translated result'"));
  await click(`${TOOL} [data-assistant-undo]`); smoke.check("Undo after explicit apply restores the newer edit", await run("document.querySelector('#prompt-editor').textContent==='newer edit'"));
  await translation(); await fixtureRequest(2); complete("", 401); await wait("document.body.textContent.includes('密钥无效')");
  smoke.check("Authentication errors preserve input", await run("document.querySelector('#prompt-editor').textContent==='newer edit'"));
  const before = requests.length; await translation(); await fixtureRequest(before); complete("", 403);
  await wait("document.body.textContent.includes('访问被拒绝（403）')");
  smoke.check("Access denial differs from invalid authentication and preserves input", await run("document.querySelector('#prompt-editor').textContent==='newer edit'"));
}
async function checkPresetsAndCustom() {
  await options(); await item("presets"); await item("add"); await wait("document.querySelector('[data-assistant-preset-name]')");
  await input("[data-assistant-preset-name]", "My instruction"); await input("[data-assistant-preset-instruction]", "Return English tags only."); await click("[data-assistant-save]");
  await wait("!document.querySelector('[data-resource-dialog=prompt-assistant-settings]')"); const before = requests.length; await translation(); await fixtureRequest(before);
  smoke.check("Custom preset becomes the system instruction", requests[before].messages[0].content === "Return English tags only."); complete();
  await wait(`!document.querySelector('${TOOL} [data-assistant-translate]').disabled`);
  await options(); await item("provider"); await item("custom"); await wait("document.querySelector('[data-assistant-endpoint]')");
  await input("[data-assistant-endpoint]", endpoint); await input("[data-assistant-model]", "local-model"); await click("[data-assistant-connection-save]");
  const custom = '[data-prompt-key-provider="custom"]'; await wait(`document.querySelector('${custom} [data-assistant-api-key]')`);
  await input(`${custom} [data-assistant-api-key]`, "fixture-custom-key"); await click(`${custom} [data-assistant-save]`);
  await wait(`document.querySelector('${custom} [data-prompt-key-status]').dataset.promptKeyStatus==='configured'`);
  await returnToCreate(); await text("newer edit"); await translation(); await wait("document.querySelector('#prompt-editor').textContent==='local translated text'");
  smoke.check("Custom compatible API receives authenticated POST and selected model", localRequest.authorized && localRequest.url === "/v1/chat/completions" && localRequest.body.model === "local-model");
  for (let i = 0; i < 100 && !userData.promptAssistant?.presets.length; i++) await delay(50);
  smoke.check("Preferences and custom presets persist without credentials", userData.promptAssistant.presets.length === 25 && !JSON.stringify(userData).includes("fixture-glm-secret") && !JSON.stringify(userData).includes("fixture-custom-key"));
  const status = await run(`window.electronAPI.promptSecretStatus({provider:'glm',baseUrl:''})`);
  smoke.check("GLM credential remains separate, encrypted, and only status is exposed", status.success && status.data.configured && status.data.protection === "safeStorage" && !JSON.stringify(status).includes("fixture-glm-secret"));
  const other = await run(`window.electronAPI.promptSecretStatus({provider:'custom',baseUrl:${JSON.stringify(endpoint + "/other")}})`);
  smoke.check("A different proxy endpoint cannot reuse the previous key", other.success && !other.data.configured);
  const invalid = await run("window.electronAPI.transformPrompt({provider:'custom',baseUrl:'http://example.com/v1',model:'x',text:'test',instruction:'test'})");
  smoke.check("IPC rejects insecure non-local endpoints", !invalid.success && invalid.code === "INVALID_ARGUMENT");
}

/**
 * 从真实级联菜单进入编辑，复用原新增表单，不直接调用 store。
 * 前置条件是上一个场景已经创建并选中了 My instruction。
 * 当前供应商是本机兼容接口，追加请求不触碰真实付费 API。
 * 修改名称与系统指令后，用户文档必须只保留同一 id 的一项。
 * 当前选中 id 不能因改名重建而变化，确保正文更新立即用于后续转换。
 * 先检查输入预填，避免测试在一个空新增表单中误建了第二条记录。
 * 文档状态通过正式 USER_DATA_WRITE 夹具观察，不从 UI 名称猜测保存完成。
 * 外部接口仅回固定文本，用于检查实际发出的 system instruction。
 * 修改后触发真实转换 IPC，覆盖从编辑到使用新指令的完整链路。
 * 不检查模型文案质量，受控响应只证明传输参数与替换流程。
 * 生成按钮、工作流和 ComfyUI 不在此场景中操作。
 * 修改结果会由后面的 reload 场景再次检查，不能只停留在内存中。
 * 预设数量必须保持二十五，防止每次编辑都追加一条重复记录。
 * 内置预设没有铅笔入口，保护英文翻译和 Anima 的固定指令。
 * 通过 name 查找测试夹具只是为了获得已创建的随机 id。
 * 正式按钮定位与保存替换仍使用稳定 id，不按名称进行删除。
 */
async function checkPresetEditing() {
  // 初始二十四条夹具用于维持原有滚动菜单回归，新建一条后总数为二十五。
  // 如果编辑错误地追加记录，二十五的严格等式会在切换供应商前失败。
  // 菜单管理入口由 data-assistant-edit 定位，不能误点同一行的选用按钮。
  // 预填名称来自正式表单 state，可以发现 id 未传递导致的新增模式误开。
  // 修改后的正文故意与旧值不同，后续网络请求才能区分是否仍使用旧指令。
  // 改名不更换 id，因此 selectedId 与原 id 的相等断言同时覆盖选择连续性。
  // 文档检查发生在弹窗关闭之后，关闭应意味着 store.save 已经完成。
  // 转换输入使用新的唯一文本，避免旧一次的 local translated text 满足等待。
  // localRequest 是本机服务端捕获的请求体，不由预设表单自行提供。
  // system message 与提示词 user message 独立，检查零号消息防止写错角色。
  // 返回固定短文本不验证任何供应商的实际指令遵循或安全策略。
  // 此测试不读取真实密钥值，兼容接口只用上一个场景的隔离夹具密钥。
  const preset = userData.promptAssistant.presets.find(value => value.name === "My instruction");
  await options(); await item("presets");
  smoke.check("Built-in assistant presets have no editing entry", await run("!document.querySelector('[data-assistant-edit=translate]')&&!document.querySelector('[data-assistant-edit=anima]')"));
  // 二十四条旧夹具会把刚新增的自定义项放到菜单底部，截图前先滚动到它。
  // 使用正式菜单滚动容器，不裁剪截图或改变产品宽度来隐藏布局问题。
  // 这也让后续编辑入口处于真实可见范围，而非只对不可见元素执行 click。
  await run(`document.querySelector('[data-assistant-edit="${preset.id}"]').scrollIntoView({block:'nearest'})`); await capture("prompt-custom-preset-edit-entry");
  // 滚动后的管理入口必须仍落在窗口内，不能只对屏幕外的 DOM 执行点击。
  // 同时读取父菜单与目标几何，定位菜单越界和局部滚动失败的区别。
  // 结果只含尺寸与位置，不打印指令、密钥或本地文件路径。
  const entry = await run(`(()=>{const e=document.querySelector('[data-assistant-edit="${preset.id}"]').getBoundingClientRect(),m=document.querySelector('[data-prompt-assistant-menu]').getBoundingClientRect();return {visible:e.width>0&&e.left>=0&&e.top>=0&&e.right<=innerWidth&&e.bottom<=innerHeight,entry:[e.left,e.top,e.width,e.height],menu:[m.left,m.top,m.width,m.height]}})()`); smoke.check("Custom preset management remains visible after scrolling", entry.visible, JSON.stringify(entry));
  await click(`[data-assistant-edit="${preset.id}"]`); await wait("document.querySelector('[data-assistant-preset-name]')?.value==='My instruction'");
  await input("[data-assistant-preset-name]", "Edited instruction"); await input("[data-assistant-preset-instruction]", "Return concise English tags."); await click("[data-assistant-save]"); await wait("!document.querySelector('[data-resource-dialog=prompt-assistant-settings]')");
  smoke.check("Editing replaces the original preset without changing selection", userData.promptAssistant.presets.length === 25 && userData.promptAssistant.presetId === preset.id && userData.promptAssistant.presets.find(value => value.id === preset.id).instruction === "Return concise English tags.");
  await text("edited instruction check"); await translation(); await wait("document.querySelector('#prompt-editor').textContent==='local translated text'");
  smoke.check("The next request uses the edited system instruction", localRequest.body.messages[0].content === "Return concise English tags.");
}

/**
 * 删除回归放在既有 reload 后，使用负面输入里的同一个共享助手菜单。
 * 高级组装模式可能没有主提示词工具条，不能依赖隐藏的旧 TOOL 节点。
 * 第一次点击删除只展示确认，取消后原记录和选中 id 都应保留。
 * 取消确认后保存原值以关闭弹窗，验证退出确认并不锁死编辑功能。
 * 删除未选中的 fixture-0，当前自定义预设应继续使用原 id。
 * 再删除当前选中的编辑记录，应自动回到内置英文翻译。
 * 两次删除都由真实按钮确认，不能调用 filter 构造期望文档。
 * 文档中的其余二十三项保持存在，不误删整个自定义数组。
 * 重新加载真实静态页面，检查磁盘桥接文档中的删除结果已水合。
 * 最后再次打开菜单，被删项和它的管理按钮都不能出现。
 * 内置英文翻译应可见且被选中，保护删除当前项后的可用默认行为。
 * 所有写入局限于本套件 userData 变量，不删除用户配置。
 * 这里只验证编辑配置持久化，不把内存夹具称为真实磁盘故障测试。
 * 真正 JSON 文件读写由既有 userData 模块负责，本测试用正式 IPC 契约交互。
 * 截图保留完整菜单，以便检查长名称与管理按钮的布局。
 * 每次等待都有有限超时，删除失败不能靠静默跳过给出绿灯。
 */
async function checkPresetDeletion() {
  // 负面输入只用于打开同一个配置菜单，本场景不转换或删除负面提示词正文。
  // 先取消当前项的删除确认，再保存相同内容，用于检查两种动作互不混淆。
  // 取消只回到编辑态，用户仍能看见已经预填的名称和多行正文。
  // fixture-0 的 id 是固定夹具，与用户创建的随机 id 不可能混为一项。
  // 第一项删除以后数量应从二十五减到二十四，第二项再减到二十三。
  // 最终严格数量可检测批量误删，但不以数量代替目标 id 消失的检查。
  // 删除活动项之前重新打开菜单，让回调从最新 preferences 获取真实选择。
  // 回退目标采用项目内置 translate，刷新后仍应显示其勾选图标。
  // 成功提示中的文本也可能包含预设名，所以删除判断限定菜单数据标记。
  // 等待每个管理弹窗实际卸载后再开菜单，避免两个浮层同时点击而假失败。
  // 截图在二次确认之前捕获，能核对删除提示中的目标名称与取消入口。
  const preset = userData.promptAssistant.presets.find(value => value.name === "Edited instruction");
  const openPresetMenu = async () => { await click('[data-prompt-assistant=negative-prompt-editor] [data-assistant-options]'); await wait("document.querySelector('[data-prompt-assistant-menu]')"); await item("presets"); };
  await openPresetMenu(); await capture("prompt-custom-presets"); await click(`[data-assistant-edit="${preset.id}"]`); await wait("document.querySelector('[data-assistant-delete]')"); await click("[data-assistant-delete]"); await wait("document.querySelector('[data-assistant-delete-confirmation]')"); await click("[data-assistant-delete-cancel]");
  smoke.check("Cancelling deletion preserves the preset and selection", userData.promptAssistant.presets.length === 25 && userData.promptAssistant.presetId === preset.id && await run("!document.querySelector('[data-assistant-delete-confirmation]')"));
  await click("[data-assistant-save]"); await wait("!document.querySelector('[data-resource-dialog=prompt-assistant-settings]')");
  await openPresetMenu(); await click('[data-assistant-edit="fixture-0"]'); await wait("document.querySelector('[data-assistant-delete]')"); await click("[data-assistant-delete]"); await click("[data-assistant-delete]"); await wait("!document.querySelector('[data-resource-dialog=prompt-assistant-settings]')");
  smoke.check("Deleting an inactive preset preserves the active selection", !userData.promptAssistant.presets.some(value => value.id === 'fixture-0') && userData.promptAssistant.presetId === preset.id);
  await openPresetMenu(); await click(`[data-assistant-edit="${preset.id}"]`); await wait("document.querySelector('[data-assistant-delete]')"); await click("[data-assistant-delete]"); await capture("prompt-preset-delete-confirmation"); await click("[data-assistant-delete]"); await wait("!document.querySelector('[data-resource-dialog=prompt-assistant-settings]')");
  smoke.check("Deleting the active preset falls back to English translation", userData.promptAssistant.presetId === 'translate' && userData.promptAssistant.presets.length === 23 && !userData.promptAssistant.presets.some(value => value.id === preset.id));
  win.reload(); await wait("document.querySelector('[data-prompt-assistant=negative-prompt-editor]')"); await openPresetMenu();
  smoke.check("Preset deletion and fallback survive page reload", await run(`!document.querySelector('[data-assistant-item="${preset.id}"]')&&!document.querySelector('[data-assistant-edit="fixture-0"]')&&document.querySelector('[data-assistant-item=translate] svg')`));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
}
async function returnToCreate() {
  await click('a[href="/create"]'); await wait("document.querySelector('[data-prompt-assistant=prompt-editor]')");
}
async function checkKeySettings() {
  await wait("document.querySelector('[data-settings-category=keys]').getAttribute('aria-pressed')==='true'");
  smoke.check("Assistant settings deep-link selects the API keys category", await run("location.hash==='#prompt-keys'&&Boolean(document.querySelector('#agent'))&&Boolean(document.querySelector('#civitai-api-key'))"));
  await capture("prompt-api-keys");
  await click('[data-settings-category=tools]');
  smoke.check("Toolbox settings no longer contain credentials", await run("!document.querySelector('#agent')&&!document.querySelector('#prompt-keys')&&!document.querySelector('#civitai-api-key')"));
  await click('[data-settings-category=models]');
  smoke.check("Model settings no longer contain Civitai credentials", await run("!document.querySelector('#civitai-api-key')"));
  await click('[data-settings-category=tools]'); await run("location.hash='agent'");
  await wait("document.querySelector('[data-settings-category=keys]').getAttribute('aria-pressed')==='true'");
  smoke.check("Existing Agent anchor still opens the credential category", await run("Boolean(document.querySelector('#agent-api-key'))"));
  await click('[data-settings-category=keys]');
  const glm = '[data-prompt-key-provider="glm"]';
  await input(`${glm} [data-assistant-api-key]`, "fixture-glm-secret"); await click(`${glm} [data-assistant-save]`);
  await wait(`document.querySelector('${glm} [data-prompt-key-status]').dataset.promptKeyStatus==='configured'`);
  smoke.check("Saved credentials clear the draft input", await run(`document.querySelector('${glm} [data-assistant-api-key]').value===''`));
  await click(`${glm} [data-assistant-clear]`); await wait(`document.querySelector('${glm} [data-prompt-key-status]').dataset.promptKeyStatus==='missing'`);
  smoke.check("Settings clear removes the isolated credential", !(await run("window.electronAPI.promptSecretStatus({provider:'glm',baseUrl:''})")).data.configured);
  await input(`${glm} [data-assistant-api-key]`, "fixture-glm-secret"); await click(`${glm} [data-assistant-save]`);
  await wait(`document.querySelector('${glm} [data-prompt-key-status]').dataset.promptKeyStatus==='configured'`);
  await returnToCreate();
}
async function checkAppearance() {
  await options(); await item("provider"); await item("glm");
  const colors = () => run("(()=>{const css=getComputedStyle(document.querySelector('[data-assistant-column=\"0\"]'));return css.backgroundColor+' '+css.color})()");
  const light = await colors(); await click("[data-theme-trigger]"); await wait("document.querySelector('[data-theme-option=dark]')"); await click("[data-theme-option=dark]"); await wait("document.documentElement.dataset.theme==='dark'");
  await wait(`(()=>{const css=getComputedStyle(document.querySelector('[data-assistant-column="0"]'));return css.backgroundColor+' '+css.color!==${JSON.stringify(light)}})()`);
  smoke.check("Menu follows the application's dark theme", light !== await colors());
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
  await delay(700); await capture("prompt-assistant-dark");
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await wait("document.querySelectorAll('[data-prompt-assistant-menu] [role=menu]').length===1");
  await wait("(()=>{const r=document.querySelector('[data-prompt-assistant-menu]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()");
  smoke.check("Narrow screens show a navigable single-column menu inside viewport", true);
  await capture("prompt-assistant-narrow");
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await wait("!document.querySelector('[data-prompt-assistant-menu]')"); smoke.check("Escape closes the menu", true);
}
async function checkAssemblyTargets() {
  const ids = await openAssemblyForChecks();
  const tabTool = id => `[data-prompt-assistant="${id}"]`;
  await input("[data-prompt-tab-input]", "first category description");
  const before = requests.length; await click(`${tabTool(ids[0])} [data-assistant-translate]`); await fixtureRequest(before);
  await click(`[data-prompt-tab="${ids[1]}"]`); await input("[data-prompt-tab-input]", "other category description"); complete("translated first category");
  await wait(`!document.querySelector('${tabTool(ids[1])} [data-assistant-translate]').disabled`);
  smoke.check("Switching tabs during translation cannot overwrite another category", await run("document.querySelector('[data-prompt-tab-input]').value==='other category description'&&!document.querySelector('[data-assistant-result]')"));
  await click(`[data-prompt-tab="${ids[0]}"]`); await wait("document.querySelector('[data-assistant-result]')");
  smoke.check("Original category retains its deferred translation for review", await run("document.querySelector('[data-prompt-tab-input]').value==='first category description'"));
  await run("Array.from(document.querySelectorAll('[data-assistant-result] button')).find(button=>button.textContent==='应用结果').click()");
  await wait("document.querySelector('[data-prompt-tab-input]').value==='translated first category'");
  smoke.check("Applying translation updates the assembly category and merged prompt", await run("document.querySelector('#prompt-editor').textContent.includes('translated first category')&&document.querySelector('#prompt-editor').textContent.includes('other category description')"));
  await click(`${tabTool(ids[0])} [data-assistant-undo]`); await wait("document.querySelector('[data-prompt-tab-input]').value==='first category description'");
  smoke.check("Assembly translation also supports undo", true);
  await checkAssemblyNegative();
  await checkPromptOrder(ids);
  await checkAssemblyPersistence(ids);
}
// 从原菜单设定 GLM，再打开真实高级分类，准备助手和队列共用的稳定前置。
// 清除前一个窄屏用例的仿真尺寸，不改变应用导航或用户偏好制造宽栏。
// 分类 id 从真实 Tab 读取，不复制八个默认值，新增注册项时测试仍覆盖当前队列。
// 等输入框出现后才返回，避免只完成开关点击就开始输入。
// 此步骤不改分类内容，前后正文仍由各自用例明确准备。
// 供应商选择仅用于本轮隔离文档，实际用户 GLM/Euzhi 偏好不参与测试。
// 独立准备函数让测试职责清楚，不把导航、翻译、排序和恢复混在超长函数里。
// 返回的 id 数组只用于核对顺序，不作为生成图片的模型或文件参数。
async function openAssemblyForChecks() {
  await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
  await options(); await item("provider"); await item("glm"); await item("glm-4.7-flash");
  await click("[data-advanced-prompt-toggle]"); await wait("document.querySelector('[data-prompt-tab-input]')");
  return run("Array.from(document.querySelectorAll('[data-prompt-tab]')).map(button=>button.dataset.promptTab)");
}
// 负向助手依然独立写回；排序只操作正向分类，不能把负面词混进队列。
// 保留原拒绝截断结果的断言，确保新增排序入口不影响助手的失败恢复。
// 前置分类内容由上一个场景准备，测试没有直接重写组装 store。
// 此场景沿用原负向助手回归，因为排序不能让正负两份正文混到一起。
// 负向文本从 negative-prompt-editor 提交，当前正向分类仍保留第一组原稿。
// 请求成功时只修改负向编辑器，正向 textarea 必须逐字不变。
// 之后故意返回 length 结束原因，验证截断结果不能覆盖已有有效负向词。
// 错误提示应与格式错误、缺钥分开，这里使用已有输出长度提示等待。
// 没有必要为排序创建新的助手状态，原 busy 和 finally 仍应释放按钮。
// 固定英文响应由夹具提供，测试不依赖公网翻译服务输出的随机性。
// 正向顺序随后才调整，使本例与后面顺序变化的因果关系清楚。
// 负向词不加入 promptTabs，所以当前 Tab 列表长度不受本例操作影响。
// 若负向值变化后正向组被清空，本例会在后续精确合并断言中暴露。
// 本函数不负责重载，保持所有文字与助手撤销记录处于同一窗口实例。
async function checkAssemblyNegative() {
  const negative = "[data-prompt-assistant=negative-prompt-editor]"; await run("document.querySelector('#negative-prompt-editor').textContent='模糊画面'");
  const previous = requests.length; await click(`${negative} [data-assistant-translate]`); await fixtureRequest(previous); complete("blurry image");
  await wait("document.querySelector('#negative-prompt-editor').textContent==='blurry image'");
  smoke.check("Negative prompt translation writes only to the negative editor", await run("document.querySelector('[data-prompt-tab-input]').value==='first category description'"));
  const truncated = requests.length; await click(`${negative} [data-assistant-translate]`); await fixtureRequest(truncated); complete("incomplete output", 200, "length");
  await wait("document.body.textContent.includes('输出超过长度限制')");
  smoke.check("Truncated model output cannot replace the original text", await run("document.querySelector('#negative-prompt-editor').textContent==='blurry image'"));
}
// 持久化与首次操作分开，重载后的结论不能依赖旧组件的局部状态。
// 凭据和预设仍由原流程核对，分类顺序是本轮增加的同文档恢复边界。
// 返回普通模式作为下一个用例的稳定前置，避免水合前后助手入口切换。
// 保存采用用户文档的已有写入节流，重载前等 advanced 标记已经到达主进程夹具。
// 分类调序发生在同一个同步 store 更新链，写入文档应包含新的数组顺序。
// 重载会销毁旧组件本地 sorting 开关，恢复结果只能来自文档和 sanitize。
// 等待任意助手只表示应用已开始挂载，后面仍需要等待目标 Tab 在正确位置。
// 旧凭据状态仍通过主进程查询，不能把 renderer 内存里 configured 当证据。
// 自定义指令仍保留编辑后的内容，新增分类顺序不应覆盖其他同文档分区。
// 首项稳定 id 必须是原第二组，这能发现恢复时又按默认注册表排序的回归。
// 原 prompt-editor 也应恢复正确正文，不能只看到 Tab 队列外观正常。
// 排序工具的展开状态无需恢复，队列数据与工具是否显示属于不同生命周期。
// 关闭高级作为后续删除预设前置，保证普通正文助手真实可用而非水合瞬间的旧节点。
// 等待普通助手按钮出现，避免下一次 options 点击落在已经被高级界面替换的节点上。
// 没有直接调用 store.rehydrate 或修改 DOM 列表，整个恢复沿产品启动路径运行。
// 测试不会更改系统真实文档路径，reload 仍读取本轮隔离的 userData 夹具。
// 如果保存失败，外层错误应导致非零结束，不能靠重载默认值将失败静默盖过。
// 这是页面重载验证，不是打包安装后跨版本升级迁移的完整证明。
async function checkAssemblyPersistence(ids) {
  for (let i = 0; i < 100 && !userData.createForm?.advancedPrompt; i++) await delay(50);
  win.reload(); await delay(100); await wait("document.querySelector('[data-prompt-assistant]')");
  const persisted = await run("window.electronAPI.promptSecretStatus({provider:'glm',baseUrl:''})");
  // 编辑保留原有 reload 验证范围，这里应恢复改过的名称与指令。
  // 旧文本不再作为期望，否则只能证明新增可持久化而漏掉编辑结果。
  // 密钥仍走独立主进程存储，自定义指令不得覆盖认证状态。
  smoke.check("Credentials and edited custom instructions survive reload", persisted.success && persisted.data.configured && userData.promptAssistant.presets.some(preset => preset.name === "Edited instruction" && preset.instruction === "Return concise English tags."));
  // 重载后从可见分类读取顺序，不能只检查持久化文档里的原始数组。
  // 等待目标 id 在首位，覆盖水合前默认队列暂时出现的时间窗。
  await wait(`document.querySelector('[data-prompt-tab]')?.dataset.promptTab===${JSON.stringify(ids[1])}`);
  smoke.check("Prompt group queue survives document hydration", await run("document.querySelector('#prompt-editor').textContent==='other category description, first category description'"));
  await click("[data-advanced-prompt-toggle]");
  await wait("document.querySelector('[data-prompt-assistant=prompt-editor]')");
}
/** 手动排序复用原浏览器输入与隔离文档，确认以前只能改变面板草稿。 */
// 原箭头实时提交改为独立模式，旧生成、预设和重载回归继续读取最终确认顺序。
// 业务测试放在单独 helper 中，原主套件仍负责窗口、凭据与统一错误退出。
async function checkPromptOrder(ids) {
  await require("./lib/check-prompt-order-editor")({ win, run, wait, click, delay, ids,
    check: smoke.check, capture, setTheme: setOrderTheme,
    savedIds: () => userData.createForm.promptTabs.map(tab => tab.id) });
}
/**
 * 主题从正式外观菜单切换，使用户偏好和原生媒体查询同时改变。
 * 不能只写 nativeTheme，否则 AppShell 会按仍然保存的深色偏好重新覆盖它。
 * 只等媒体查询变浅可能恰好读到过渡的一帧，截图随后仍是深色。
 * 因此同时等待 data-theme、matchMedia 和主题动画结束，三者缺一不能拍照。
 * 关闭菜单沿用共享夹具助手，不能删 Portal 节点伪造正常关闭。
 * 主题切换没有改变分类文字，截图对照仍使用同一条已经排好的队列。
 * 该方法不直接操作 DOM style 或 data-theme，保留产品唯一主题写点。
 * 外观入口仍在自定义标题栏，普通菜单展开由既有 revealSidebarPreference 负责。
 * 浅色和深色分别调用同一个方法，避免只有恢复深色时遗漏菜单清理。
 * 主题动画有有界结束等待，不把页面缺少可见动画帧当成无限等待的理由。
 * 离屏截图读取真实渲染缓冲，捕获前的 invalidate 仍由公共 capture 完成。
 * 断言颜色状态发生在关闭外观对话框前，不能由关闭时重新挂载页面掩盖状态错误。
 * 测试主题只保存在隔离 userData，用户实际客户端仍维持自己的深浅偏好。
 * matchMedia 以当次读取为准，不假设收到一次 change 就代表当前仍是目标状态。
 * 此回归不改变主题事件恢复机制，事件丢失专项仍属于原已有测试范围。
 * 截图文件名的 light/dark 必须与实际样式匹配，不能以文件名代替视觉复核。
 * 菜单项名称从产品选择器读取，不复制一套用于测试的主题按钮。
 * 当前场景使用应用级覆盖，不修改 Windows 系统主题影响其他软件。
 * 设置页和创建页共享同一个主题 store，跨路由截图继续采用已确认偏好。
 * 主题失败时 wait 抛错给外层 harness，不能静默跳过浅色仍声称双主题验证。
 * 没有定时伪造完成，只在产品显示的信号和真实媒体查询一致时继续。
 */
async function setOrderTheme(theme) {
  await click("[data-theme-trigger]");
  await wait(`document.querySelector('[data-theme-option=${theme}]')`);
  await click(`[data-theme-option=${theme}]`);
  await wait(`document.documentElement.dataset.theme==='${theme}'&&!document.documentElement.classList.contains('theme-ripple')&&matchMedia('(prefers-color-scheme: dark)').matches===${theme === "dark"}`);
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
}
/**
 * Euzhi 接入使用真实菜单和输入框转换，不直接在 renderer store 中塞供应商状态。
 * 先清空本站凭据，证明缺钥时原稿保留，也证明没有借用其他供应商已经保存的密钥。
 * 再从创建页进入连接设置，使用原提示词助手凭据表单保存本站密钥。
 * 随后由 Agent 的正式状态 IPC 确认同一份凭据，而不是用表单成功 Toast 作结论。
 * 转换请求必须使用固定 Euzhi 地址、Agent 中保存的 grok-4 和真实输入文本。
 * 远端返回固定英文文本，测试不宣称已经消费用户账户或验证公网服务。
 * 请求拦截只验证认证布尔值，避免把密钥本身写进测试报告。
 * Agent 仍应保留原硅基流动偏好，复用本站模型读取不能等同于切换聊天站点。
 * 重新加载检查供应商保存与 Agent 凭据存活，覆盖 normalize 不能丢掉新枚举。
 * 再从 Agent 清除本站凭据，提示词助手应同步读到未配置，防止出现重复存储。
 * 恢复 GLM 仅准备后续旧套件，不修改用户实际软件配置。
 * 所有密钥文件位于本轮临时根，系统加密由真实 safeStorage 完成。
 */
// 本站回归的第一前置是已经配置过 GLM，缺钥测试才能证明两站不会互相借用。
// 先清本站加密文件，不能只把状态 UI 写成未配置来制造假缺钥。
// 转换时保留用户正在编辑的完整原稿，失败反馈和正文正确性分开判断。
// 缺钥场景要求请求计数不增加，表示拒绝发生在实际付费请求之前。
// GLM 凭据仍在隔离目录中，因此不把“所有密钥都为空”误认成站点隔离通过。
// 选站通过菜单 action 保存，与正式用户从创建页面选供应商走同一路径。
// 自定义 baseUrl 来自前序兼容接口场景，故意保留它验证 Euzhi 使用固定地址。
// 固定地址是主进程约束，不靠创建页把输入框显示成正确域名来保证。
// 进入设置继续用原连接按钮，覆盖助手菜单到 API 密钥分类的实际导航。
// Euzhi 表单使用公共凭据控件，保存动作不能再落到 custom 的地址哈希分区。
// 表单等待 configured 后仍向 Agent 查询，能发现仅本组件局部状态更新的假成功。
// Agent 状态回执只检查 configured，不能把返回明文密钥当共享成功证据。
// 保存测试密钥发生在专门临时目录，用户当前代理站点的凭据不受影响。
// 密钥保存不应改变 Agent 的模型偏好，本站选择和本站认证是独立数据。
// 重新返回创建页再调用转换，覆盖路由卸载后仍能读到同一凭据来源。
// 请求的 model 必须逐字等于已经保存的 grok-4，不能使用 GLM 或自定义模型。
// 请求文本取用户原稿，不能把合并预览、系统说明或输入框 placeholder 发出去。
// 请求数量恰好一个，避免菜单选择和点击翻译分别提交一次造成重复计费。
// 请求头只记 authorized 布尔值；测试报告不存整份含令牌的 headers。
// 系统指令继续由用户预设选择提供，Euzhi 不另起一套无预设的对话客户端。
// 响应采用 OpenAI choices/message 形状，验证现有解析器直接兼容本站。
// 固定响应里的英文标签只用于检查替换目标，不能据此评价真实 Grok 质量。
// 真实密钥没有参与请求，本站额度、限流与网络连通性都不由该夹具证明。
// Agent 仍处于 siliconflow，覆盖显式读取 Euzhi 模型不等于执行 choose 的边界。
// 文档内容不能包含 fixture-euzhi-key，防止复用时把 API Key 写入普通 JSON。
// 旧 GLM 模型配置保留，用户回切时无需重新填之前选择的免费模型。
// 对输入的替换继续使用原冲突检查和撤销，不以新增站点绕过旧保护。
// 本站没有选中模型时的推荐逻辑属于原 Agent 目录服务，这里使用确定旧选择。
// 不存在的模型最终仍可由服务商拒绝，测试不声称名称验证能代表账户权限。
// 测试函数里的所有 await 都由外层套件失败处理收尾，异常不会变成通过。
// 页面仍用真实 preload 和上下文隔离，未在 renderer 注入直接读写密钥能力。
// 后续持久化用例仍需重载，当前一次成功不能替代重启恢复和跨入口清除。
// 如果该步失败，日志应区分缺配置、保存失败和正文替换失败，不靠截图猜测。
async function checkEuzhi() {
  // 前序已经启用高级模式；普通正文助手在该模式下会按产品规则隐藏。
  // 先从真实开关回到普通输入，再验证本站转换，不能向分类输入猜测落点。
  await wait("document.querySelector('[data-advanced-prompt-toggle]')");
  if (await run("document.querySelector('[data-advanced-prompt-toggle]').getAttribute('aria-checked')==='true'")) await click("[data-advanced-prompt-toggle]");
  // 之前的重载用例只等待任意助手，分类助手可能先于普通编辑器挂载。
  // 本用例操作普通正文，须等待对应按钮就绪，不能把空 DOM 误报成站点失败。
  await wait("document.querySelector('[data-prompt-assistant=prompt-editor] [data-assistant-options]')");
  await run("window.electronAPI.agentClearSecret('euzhi')");
  await options(); await item("provider"); await item("euzhi"); await text("moonlit landscape"); await translation();
  await wait("document.body.textContent.includes('设置 → API 密钥 → 提示词助手')");
  smoke.check("Euzhi missing key preserves draft without reusing GLM credentials", euzhiRequests.length === 0 && await run("document.querySelector('#prompt-editor').textContent==='moonlit landscape'"));
  await options(); await item("settings"); await wait("document.querySelector('[data-prompt-key-provider=euzhi]')");
  const form = '[data-prompt-key-provider=euzhi]';
  await input(`${form} [data-assistant-api-key]`, "fixture-euzhi-key"); await click(`${form} [data-assistant-save]`);
  await wait(`document.querySelector('${form} [data-prompt-key-status]').dataset.promptKeyStatus==='configured'`);
  smoke.check("Prompt settings save the same Euzhi credential visible to Agent", (await run("window.electronAPI.agentSecretStatus('euzhi')")).data.configured);
  await returnToCreate(); await text("moonlit landscape"); await translation(); await wait("document.querySelector('#prompt-editor').textContent==='euzhi translated tags'");
  smoke.check("Euzhi receives fixed endpoint auth, Agent Grok model and selected instruction", euzhiRequests.length === 1 && euzhiRequests[0].authorized && euzhiRequests[0].body.model === "grok-4" && euzhiRequests[0].body.messages[1].content === "moonlit landscape");
  smoke.check("Choosing Euzhi for creation does not switch Agent or persist a key", userData.agentPreferences.provider === "siliconflow" && !JSON.stringify(userData).includes("fixture-euzhi-key"));
  await checkEuzhiPersistence();
}
// 持久化回归与首次请求分开，避免在一个函数里混合本次请求和重载后的状态。
// 此时已有一次成功转换和共享密钥；重载后不能仅靠页面旧内存继续显示 Euzhi。
// 清除走 Agent 入口、核对走提示词助手入口，故意跨调用方验证同一凭据。
// 重载前已从创建页选定 Euzhi 且成功请求一次，内存与文档应持有相同站点。
// 先打开供应商菜单截图，既证明入口可见，也展示它与旧 GLM/custom 并存。
// 重载后再次打开菜单，读取真实选中图标，不能只检查旧 userData 对象字段。
// 文档 provider 与菜单图标同时满足，才能覆盖保存和 hydrate 两侧接线。
// 本站条目的模型由 Agent 管理，没有在菜单中硬编码一个日后会失效的 Grok 列表。
// 切回 GLM 是恢复后续公共测试前置，不能在清本站密钥时顺带清所有凭据。
// 从 Agent 清除，再由提示词助手查询，验证不是两份各自能用但无法同步的密钥。
// 若只清页面输入框，主进程仍有旧认证，配置状态断言应当失败。
// 清除不调用聊天或生成能力，不应启动 Python sidecar 或访问远端。
// 非法 image 模型绕过前端菜单直接提交，证明主进程没有只依赖 UI 过滤。
// 该请求故意携带陌生 baseUrl，命名站点不能因为地址看似 HTTPS 就转发密钥。
// 预期错误代码必须是 INVALID_ARGUMENT，缺钥导致 INTERNAL 不能算模型校验通过。
// 拒绝发生在取密钥与 fetch 之前，避免对错误模型也消耗一次供应商请求。
// clear 后状态由 providerStatus 读取，不能靠先前成功请求的缓存判断还存在。
// 本站凭据已清，测试临时浏览器目录仍可保留截图供排查，里面不应存明文令牌。
// 此场景验证共享删除语义，不测试系统 safeStorage 在另一台 Windows 上的可移植性。
// 旧 custom 的凭据继续按端点隔离，不被 Euzhi 的共享凭据规则吸收到 Agent 中。
// 菜单保存 Promise 完成后才关闭，重载不是拿尚未提交的视觉选择作前置。
// 这里没有调用 Agent choose，所以聊天供应商仍由用户自己的选择独立决定。
// 有模型校验错误必须给固定错误原因，不把服务商原始响应和令牌写入 UI。
async function checkEuzhiPersistence() {
  await options(); await item("provider"); await capture("prompt-euzhi-provider"); await item("euzhi");
  win.reload(); await wait("document.querySelector('[data-prompt-assistant=prompt-editor]')"); await options(); await item("provider");
  smoke.check("Euzhi supplier selection survives reload", userData.promptAssistant.provider === "euzhi" && await run("!!document.querySelector('[data-assistant-item=euzhi] svg')"));
  await item("glm"); await item("glm-4.7-flash"); await run("window.electronAPI.agentClearSecret('euzhi')");
  smoke.check("Clearing Euzhi in Agent also clears prompt credentials", !(await run("window.electronAPI.promptSecretStatus({provider:'euzhi',baseUrl:''})")).data.configured);
  const invalid = await run("window.electronAPI.transformPrompt({provider:'euzhi',baseUrl:'https://elsewhere.invalid',model:'grok-imagine-image',text:'x',instruction:'x'})");
  smoke.check("Euzhi rejects image model IDs through production IPC validation", !invalid.success && invalid.code === "INVALID_ARGUMENT");
}
/**
 * 同一个组装组件也在蒙版编辑使用，必须验证回调绑定到注入草稿。
 * 原图片队列在前序已经调过顺序，作为独立性对照而非假造另一份 store。
 * 此处不需要图片文件：准备提示词可先于导入，正式生成仍保持原前置检查。
 * 两组内容通过相同 textarea 原生 setter 写入，事件进入生产 Zustand 动作。
 * 蒙版正文不是普通图片 DOM；预期只在 mask-positive 出现反向排序的两段文本。
 * 检查图片页保存的组内容与顺序，能发现误写全局 store 的接线问题。
 * 不调用 ControlNet、上传或生成接口，页面能编辑不等于 GPU 工作流已验证。
 * 截图记录实际参数区复用，避免把仅在普通图片有效的入口宣称两处接通。
 * 缺图时画布保持原空态，测试没有插入伪造成功图来绕过导入步骤。
 * 本场景使用普通编辑入口和蒙版 tab，不直接把面板组件挂到测试页面。
 * 初次打开默认队列应从质量词开始，普通图片已改成镜头优先也不能污染它。
 * 默认质量组与镜头组有稳定 id，不依赖中文标题或用户可能改过的显示名。
 * 单独比较整个图片分类快照，防止仅检查正文却遗漏了快捷词或工具绑定丢失。
 * 快照只包含提示词数据，不含本站密钥或账户配置，允许留在测试进程内。
 * 蒙版没有持久化分区，本场景不声称其队列可以跨应用重启恢复。
 * 异步等待使用外层有界轮询，不依赖窗口可见时才运行的动画帧。
 * 普通图片 DOM 可暂时隐藏或卸载，独立性结论来自其正式持久化快照。
 * 页面切换不会触发真正生成；结束保留蒙版排序画面供截图验收。
 */
// 普通图片队列快照在切编辑页之前取得，后面的对照不能读取已经被污染的新值。
// 原模式条按钮决定编辑工作区，mask-edit-tab 再明确选择蒙版而非文字改图。
// 未选文件不会启动解码，测试只操作允许先准备的提示词参数。
// 高级按钮先展开原 side 里的组装面板，不新开测试专用组件实例。
// 质量为首项说明普通图片已经排到首位的镜头没有泄漏到编辑草稿。
// 第一组 mask quality 和第二组 mask camera 是独立文本，不从普通图提示词复制。
// 只在蒙版 scope 下选 textarea，隐藏的普通图组件即使仍挂载也不能成为输入目标。
// 第二组向前一步应恰好交换质量和镜头，不应移动到队尾或跳过多个空组。
// 最终正文由 #mask-positive 显示，底层生成也读同一个 instruction。
// 快照对比涵盖每个分类对象，不只比较数量，能发现工具、快捷词和名称被改写。
// 截图仍含空画布，明确本例没有验证导入、涂抹、上传和图像生成。
// 主进程模型扫描在本套件返回空列表，不阻止仅编排本地提示词的交互。
// 相同组名不表示相同业务状态，图片与编辑的质量组都要保留自己的内容。
// 同一公共组件通过 assemblyStore 参数区分业务数据，UI 结构和排序算法只维护一份。
// 本例结束时不清本地分类，便于后续人工检查截图与当前注入面板对应。
// 只允许套件 finally 销毁测试窗口，不会关闭用户正在使用的 Electron 客户端。
// 该快照比较不证明用户文件已经写盘；蒙版原本只保留内存会话，不扩大其持久化承诺。
// 若生成中 locked 生效，store 自己还要拒绝排序，本例没有伪造任务去替代原忙碌回归。
async function checkMaskOrder() {
  const before = JSON.stringify(userData.createForm.promptTabs);
  await run("[...document.querySelectorAll('[data-create-mode-tabs] button')].find(b=>b.textContent.trim()==='编辑').click()");
  await click("#mask-edit-tab");
  await click("[data-mask-advanced]");
  await wait("document.querySelector('[data-mask-assembly] [data-prompt-tab-input]')");
  smoke.check("Mask queue starts independently from the reordered image queue", await run("document.querySelector('[data-mask-assembly] [data-prompt-tab]').dataset.promptTab==='quality'"));
  await input("[data-mask-assembly] [data-prompt-tab-input]", "mask quality");
  await click("[data-mask-assembly] [data-prompt-tab=shot]");
  await input("[data-mask-assembly] [data-prompt-tab-input]", "mask camera");
  await click("[data-mask-assembly] [data-prompt-sort-toggle]");
  // 蒙版直接拖镜头组到质量组，确认注入 store 的回调没有误写图片队列。
  // 与图片使用同一手柄 helper，但保持两端独立的正文断言和持久化快照。
  await require("./lib/check-prompt-drag").drag(win, run, "shot", "quality");
  // 此时模式里镜头组已经移到前面，但蒙版生成正文仍要按旧序排列。
  // 蒙版没有自己的文件持久化，不能套用图片文档回执作为唯一观察点。
  // #mask-positive 是原生成表单实际使用的正文区域，不是新排序 UI 的标题。
  // 如果注入回调仍沿用旧的即时写入动作，这个精确字符串比较会立即失败。
  // 两组各放一段不同内容，先后关系才能在真实生成输入中看得出来。
  // 不主动修改 #mask-positive 的内容，正文变化必须来自原 store 订阅。
  // 这里没有创建编辑图片任务，不会向 ComfyUI 发出昂贵的生成请求。
  smoke.check("Mask order stays uncommitted until Done", await run("document.querySelector('#mask-positive').textContent==='mask quality, mask camera'"));
  // 带 data-mask-assembly 的选择器确保只点当前编辑实例的完成按钮。
  // 图片工作区可能保留 DOM，不能把全页第一个 Done 当作当前蒙版操作。
  // 完成以后才允许正文换序，不通过重开高级面板触发一次额外同步来补救。
  // wait 有套件级时间上限，订阅若未发布新正文会以超时明确失败。
  // 这个动作走同一展示组件，但注入的提交方法属于蒙版自己的 store。
  await click("[data-mask-assembly] [data-prompt-sort-done]");
  await wait("document.querySelector('#mask-positive').textContent==='mask camera, mask quality'");
  // before 是进入蒙版前的完整图片分类快照，不只保存两个有内容组。
  // 因此误写图片的快捷词、绑定工具或空组位置也会被整体比较发现。
  // 蒙版更新成功与图片完全不变必须同时成立，才能证明复用没有共享业务状态。
  // 本断言不把蒙版顺序写入图片文档，二者持久化边界仍沿用现有设计。
  // 最后的截图来自确认后的蒙版面板，供人工核对返回普通态的视觉结果。
  smoke.check("Mask ordering updates its instruction and preserves image groups", before === JSON.stringify(userData.createForm.promptTabs));
  await capture("prompt-group-order-mask");
}
async function checkCascadeLayout() {
  const geometry = () => run("(()=>{const r=document.querySelector('[data-assistant-column=\"0\"]').getBoundingClientRect();return [r.left,r.top,r.width,r.height].join(',')})()");
  // 工具条有 200ms 展开动画，首次基准要在动画完成后再取锚点。
  // 否则比较的是打开菜单期间移动的锚点，不是子菜单导致的根位置变化。
  // 有限主进程等待不依赖页面 rAF，仍保留后面的严格几何相等断言。
  await delay(250);
  const first = await geometry(); await item("presets"); await wait("document.querySelector('[data-assistant-item=anima]')");
  smoke.check("Root position and height stay fixed when a taller submenu opens", first === await geometry());
  smoke.check("Preset submenu uses extra height and scrolls within the viewport", await run("(()=>{const r=document.querySelector('[data-assistant-column=\"0\"]').getBoundingClientRect();const child=document.querySelector('[data-assistant-column=\"1\"]');const c=child.getBoundingClientRect();return c.height>r.height&&c.bottom<=innerHeight&&child.scrollHeight>child.clientHeight})()"));
  await capture("prompt-assistant-scroll"); await item("provider"); await item("glm");
  smoke.check("Child columns open right when there is space", await run("document.querySelector('[data-prompt-assistant-menu]').dataset.submenuDirection==='right'&&document.querySelector('[data-assistant-column=\"1\"]').getBoundingClientRect().left>=document.querySelector('[data-assistant-column=\"0\"]').getBoundingClientRect().right"));
  const style = await run(`(()=>{const anchor=document.querySelector('${TOOL}');const previous=anchor.getAttribute('style');anchor.style.position='fixed';anchor.style.left=(innerWidth-45)+'px';anchor.style.top='300px';anchor.style.right='auto';anchor.style.bottom='auto';window.dispatchEvent(new Event('resize'));return previous})()`);
  await wait("document.querySelector('[data-prompt-assistant-menu]').dataset.submenuDirection==='left'");
  await wait("(()=>{const columns=Array.from(document.querySelectorAll('[data-assistant-column]')).map(el=>el.getBoundingClientRect());return columns[1].right<=columns[0].left&&columns.every(r=>r.left>=0&&r.right<=innerWidth)})()");
  smoke.check("Child columns flip left without exceeding the window", true);
  const leftRoot = await geometry(); await item("presets"); await wait("document.querySelector('[data-assistant-item=anima]')");
  smoke.check("Left-opening tall submenu also leaves the root unchanged", leftRoot === await geometry());
  await capture("prompt-assistant-left");
  await run(`(()=>{const anchor=document.querySelector('${TOOL}');${style === null ? "anchor.removeAttribute('style')" : `anchor.setAttribute('style',${JSON.stringify(style)})`};window.dispatchEvent(new Event('resize'))})()`);
  await item("provider"); await item("glm");
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app }); await startServer();
  // 自定义 head 与正式桌面窗口一致，使主题回归操作实际的产品入口。
  // offscreen 只改变显示方式，preload、安全隔离与当前窗口协议保持真实。
  // 只销毁本套件窗口，不以清理残留为由结束用户的 Electron 进程。
  win = new BrowserWindow({ ...windowChromeOptions(), show: false, width: 1500, height: 1000, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } }); win.webContents.debugger.attach("1.3");
  try { await win.loadURL("app://app/create"); await wait("document.querySelector('[data-prompt-assistant]')"); await delay(300); await run("Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='知道了')?.click()");
    // 编辑先验证后续 API 请求，删除放在 reload 之后验证恢复与回退。
    // 原翻译、撤销、认证、主题和组装场景保持执行，保护共享工具条行为。
    // 所有场景在同一个隔离窗口依次运行，不并发占用 Electron 冒烟实例。
    // 历史回归复用同一个真实静态页；在零请求、成功/失败与重载后三个阶段观察。
    // 不改原请求编号，也不额外启动 Electron 进程，旧翻译与预设断言继续保留。
    // 最后再运行蒙版排序，避免历史窄屏仿真改变它的宽屏前置。
    const history = require("./lib/check-prompt-translation-history"), context = historyContext();
    await history.checkEmpty(context);
    await checkBasics(); await checkConflicts(); await history.checkResults(context); await checkPresetsAndCustom(); await checkPresetEditing(); await checkAppearance(); await checkAssemblyTargets(); await checkPresetDeletion(); await checkEuzhi(); await history.checkPersistence(context); await checkMaskOrder();
  } finally { win.destroy(); server.close(); global.fetch = originalFetch; }
  smoke.finish({ app, ok: smoke.allPassed() });
}
// 文档观察函数读取原隔离 handler 的回执，不能把产品 state 私有结构暴露给页面。
// reload 等待工具栏真实挂载；setTheme 复用原主题检查，不只改截图名字。
// waitSaved 使用有界主进程等待，不依赖窗口是否获得绘制帧。
// 设备仿真结束显式清除，防止后续旧用例读取到上一步残留窄屏尺寸。
function historyContext() {
  // context 不包含密钥、系统文件路径或可写 store，只向新回归提供已有观察能力。
  // history 返回本轮隔离 userData 的已保存段落，不能被新回归当作注入接口。
  // requestCount 用于零请求对照，不把服务商 response 数量误称为历史保存数量。
  // waitSaved 的条件针对明确条数，避免固定 sleep 在慢机器上读到合并前的数据。
  // 五秒上限到达后返回，下一条严格断言负责给出业务失败，不进入无限等待。
  // reload 只换当前套件页面，用户打开的其他 BrowserWindow 不会受到影响。
  // metrics 传 null 是恢复原值的显式协议，不把数字零作为合法窗口宽度。
  // 恢复宽屏时调用 clearDeviceMetricsOverride，不能沿用上次窄屏的媒体查询值。
  // setOrderTheme 同时承担菜单清理，历史 helper 不复制另一份外观关闭逻辑。
  // 多个场景使用同一 context 只共享测试工具，不共享各历史组件的局部展开 state。
  return {
    run, wait, click, capture, toolbar: TOOL, check: smoke.check, setTheme: setOrderTheme,
    // 剪贴板验证需要真实焦点；不用权限桩绕过产品 copyText 的失败分支。
    // 只有明确复制用例显示本套件窗口，其余离屏步骤仍沿用原运行方式。
    // 有界等待 document.hasFocus，聚焦失败时报告前置而不是继续读取旧剪贴板。
    focus: async () => { win.show(); win.focus(); win.webContents.focus(); await wait("document.hasFocus()"); },
    history: () => userData.promptAssistant.history ?? [], requestCount: () => requests.length,
    waitSaved: async count => { for (let i = 0; i < 100 && userData.promptAssistant.history?.length !== count; i++) await delay(50); },
    reload: async () => { await win.loadURL("app://app/create"); await wait(`document.querySelector('${TOOL}')`); },
    metrics: width => width ? win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false }) : win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride"),
  };
}
main().catch(error => { console.error(error.message); if (win && !win.isDestroyed()) win.destroy(); server?.close(); global.fetch = originalFetch; smoke.finish({ app, ok: false, error }); });

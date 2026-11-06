/**
 * 图片输入与固定聊天布局的真实 Chromium 回归，使用静态导出和正式 preload。
 * 系统选图通过 CDP 文件选择器提供应用图标，不把用户图片或路径送往网络。
 * 发送使用生产 store、IPC 校验器与 stdin 构造器，只替换付费执行端。
 * HTTP 字节与真实 Python SDK 的串联另由 verify-agent-vision.js 验证。
 * 本文件验证 Euzhi 路由下确实收到两张图片、后续追问和页面固定几何。
 * 所有文档、浏览器状态和密钥均在一次性目录中，不清理用户现有应用进程。
 */
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/src/main/core/windows/window-chrome");
const smoke = require('./lib/smoke-harness').createSmokeHarness({ name: 'agent-vision', timeoutMs: 90000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-agent-vision-ui-'));
// 继承环境中的真实密钥不能参与测试，所有状态使用本轮固定凭据。
// 系统加密在 ready 后调用，页面不会拿到密钥全文。
// 两张同源图标以不同文件名提供，断言验证数量与字节，不凭缩略图推断上传成功。
process.env.ILLUSION_AGENT_SECRET_DIR = root; delete process.env.ILLUSION_AGENT_API_KEY;
app.setPath('userData', path.join(root, 'browser')); app.disableHardwareAcceleration(); smoke.setWorkDir(root); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/modules/agent/agent.handlers").registerAgentHandlers();
const windowHandlers = require("../apps/electron/src/main/core/windows/window.handlers"); windowHandlers.registerThemeHandlers(); windowHandlers.registerWindowHandlers();
// 启动即恢复 Euzhi + Grok，测试不依赖用户上一次实际选择。
// 暗色来自正式文档水合流程，不能只往根节点强加 CSS class 伪造主题。
// guest fixture 仅隔离账户清理，仍使用生产页面、存储桥接和组件。
let documentData = require('./lib/guest-session-fixture').withGuestSession({ version: 1, settings: { paths: {}, locale: 'zh-CN', theme: 'dark' }, agentPreferences: { provider: 'euzhi', models: { siliconflow: 'deepseek-ai/DeepSeek-V4-Flash', euzhi: 'grok-4.7' } } });
registerHandle(C.USER_DATA_READ, () => ({ data: documentData, filePath: '', isNew: false })); registerHandle(C.USER_DATA_WRITE, (_event, value) => { documentData = value; });
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false } }));
for (const channel of [C.MODELS_SCAN, C.FILES_LIST_GENERATED_IMAGES, C.FILES_LIST_OUTPUT_FOLDERS]) registerHandle(channel, () => []);
registerHandle(C.MODELS_DOWNLOAD_LIST, () => ({ revision: 0, tasks: [] })); registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root); registerHandle(C.CHANGELOG_READ, () => '');
// 公开目录用随包参考，不访问真实价目接口或认证端点。
// available=null 表示未验证账号权限，与本地已保存 key 是两个不同事实。
// runner payload 含解密 key，因此只在局部断言，不输出对象或写入截图说明。
registerHandle(C.AGENT_CATALOG, (_event, provider) => require("../apps/electron/src/main/modules/agent/provider-catalog").fallback(provider));
// 控制回归模拟启动握手延迟，验证 runId 返回前用户也能停止。
// 仅替换执行端，表单、store、preload 与参数校验继续使用正式代码。
// cancelled 记录精确运行编号，能发现旧启动返回后误杀新任务的问题。
// 不调用真实 Python，也不终止本机其他 Electron 或模型进程。
// releaseStart 由测试显式放行，避免依赖不稳定的固定网络延迟。
let deferStart = false, releaseStart; const cancelled = [];
registerHandle(C.AGENT_CANCEL, (_event, runId) => { cancelled.push(runId); return true; });
const requests = []; let win;
// 捕获 payload 之后立刻返回 runId，模拟正式主进程的异步生成握手。
// final 事件稍后发送，确保 store 先记录 runId，避免测试制造事件早到的竞态。
// 捕获对象只留在本进程内存，日志与截图不显示其中的 apiKey。
// Euzhi 的密钥使用独立文件，硅基流动未配置也不能影响当前图片请求。
// 目录返回随包快照不代表实际价格更新，页面会按 snapshot 来源展示。
// 模型选择在用户文档中指定，验证页面水合后的真实选择被用于请求。
// 主进程的运行 validator 复用生产函数，图片校验不是被替身绕过的检查。
// 付费执行唯一被替换的是启动 Python 的动作，payload 构造仍为正式实现。
// 真正 Python HTTP 传输由另一个独立契约测试覆盖，两类证据不能互相替代。
// 文档写入保存内存副本，所有用户数据读写都留在这个进程的 guest fixture。
// 输出路径使用临时目录供页面展示，测试不触发生成图片保存或真实下载。
// 生成物与本地模型列表为空，页面挂载不能依赖用户已经安装绘图模型。
// 本测试专门使用 dark，覆盖用户截图中的暗色聊天工作区。
// 自定义窗口参数沿用正式 windowChromeArguments，避免截图混入原生标题栏。
// backgroundThrottling=false 保持后台消息与布局通知，测试不抢占桌面焦点。
// offscreen 截图包含完整 nav、head 和底部状态条，外围空白也属于人工核查范围。
// 请求目录与发送图片是独立链路，公开目录夹具不允许替代用户图片内容。
// 延迟只影响 handler 返回，不改变已捕获 payload 的模型与档位。
// 为每次请求固定编号，后续模拟 token 由同一编号经真实订阅消费。
// 正常请求立即完成握手，延迟请求由 checkControls 在停止后释放。
// 新请求可在旧 handle 返回前启动，专门覆盖取消竞态。
// 不在 finally 自动伪造成功事件，任何未完成状态由断言明确发现。
registerHandle(C.AGENT_RUN, (_event, options) => {
  requests.push(JSON.parse(require("../apps/electron/src/main/modules/agent/runner").buildPayloadLine(options)));
  const handle = { runId: `vision-ui-${requests.length}` };
  return deferStart ? new Promise(resolve => { releaseStart = () => resolve(handle); }) : handle;
}, require("../apps/electron/src/main/modules/agent/agent.handlers").validateRunArgs);

const run = smoke.createRun(), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// 等待在主进程执行，页面被遮挡或离屏时不依赖 rAF。
// 每一步超时应点名条件并失败，不能以空数组或默认 true 跳过断言。
// 受控输入通过浏览器原生 setter 触发真实 React onChange。
async function wait(expression) { for (let i = 0; i < 160; i++) { if (await run(`Boolean(${expression})`)) return; await delay(60); } throw new Error('Vision UI wait: ' + expression); }
async function input(value) { await run(`(()=>{const e=document.querySelector('[data-agent-input]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`); await delay(50); }
/**
 * 点击正式 + 菜单，拦截系统文件选择并填入两张测试图片。
 * 不调用 store 私有方法、不注入附件 DOM，读取与预览都由正式组件处理。
 * 文件选择器返回之后等待两张缩略图，证明 File 转附件阶段真正执行。
 * CDP 仅连接本测试窗口，结束后销毁窗口，不影响用户客户端。
 */
async function attachImages() {
  // 使用真实 File input 多选，确保浏览器 Blob 的 MIME 与文件读取行为真实发生。
  // 不能只创建两个带名称的空对象，否则无法验证转换模块拿到了实际字节。
  // 两个文件各有独立 object URL，后续数组顺序由浏览器文件选择结果决定。
  // 文件路径只提供给本地 CDP 文件选择器，不进入模型 images 字段。
  // Page.enable 让 fileChooserOpened 事件可观察，不依赖操作系统弹窗获得前台焦点。
  // intercept 只接管本窗口的下一次文件选择，不修改应用的全局文件选择逻辑。
  // backendNodeId 指向正式组件动态创建的 input，不另外向页面插入隐藏上传元素。
  // DOM.setFileInputFiles 使用 Chromium 的真实 change 流程，React 逻辑必须正常消费。
  // 所选 File 通过 filesToAttachments 创建 object URL，复用正式预览组件。
  // 选择后等待 data-agent-attachment-count=2，而不是仅等待系统选择器关闭。
  // 图片读取在用户发送时才发生，本阶段不会提交 Agent 请求。
  // 添加菜单关闭由生产 onClick 完成，不在测试里删 DOM 避免干扰焦点恢复。
  // 模型配置不在选图 helper 中修改，图片与服务商状态保持独立。
  // 对浏览器选择失败使用 Promise rejection，harness 最终必须返回非零退出。
  // debugger 在 finally detach，测试失败同样释放其对窗口的控制。
  // 文件夹与源文件都在临时位置，不需要用户提供私人照片才能复现问题。
  // 文件内容从应用资源复制，不依赖不稳定的互联网图片下载。
  // 同一张图片复制两份是有效多图用例，后续检查确保两项均进入实际 payload。
  // 不以网络截图比较上传结果，传输断言会直接比较编码数据的字节内容。
  // 浏览器扩展名为 PNG，对应标准 image/png，不触发兼容格式重采样分支。
  // 生成独立文件名防止浏览器将完全相同选择误判为未变化。
  // files 内容来自应用图标，服务器不会读取用户真实图片。
  // 选择失败让 Promise 拒绝，不能只展示附件而绕过系统选择路径。
  const files = ['one.png', 'two.png'].map(name => { const file = path.join(root, name); fs.copyFileSync(path.join(__dirname, "../apps/electron/assets/icon.png"), file); return file; });
  win.webContents.debugger.attach('1.3'); await win.webContents.debugger.sendCommand('Page.enable'); await win.webContents.debugger.sendCommand('Page.setInterceptFileChooserDialog', { enabled: true });
  const chosen = new Promise((resolve, reject) => {
    win.webContents.debugger.on('message', (_event, method, params) => { if (method === 'Page.fileChooserOpened') win.webContents.debugger.sendCommand('DOM.setFileInputFiles', { files, backendNodeId: params.backendNodeId }).then(resolve, reject); });
  });
  // 文件选择必须带真实用户手势，普通 executeJavaScript 的 click 会被 Chromium 拒绝。
  // Runtime.evaluate 的 userGesture 只用于这一次正式按钮点击，不直接注入附件状态。
  // 此手势不会跳过文件转换、发送状态或生产 IPC 校验，后续仍检查真实字节。
  // 文件选择有五秒上限，拦截事件缺失时明确失败，不等待整个套件看门狗。
  await run("document.querySelector('[data-agent-add]').click()"); await wait("document.querySelector('[data-agent-add-image]')");
  await win.webContents.debugger.sendCommand('Runtime.evaluate', { expression: "document.querySelector('[data-agent-add-image]').click()", userGesture: true });
  await Promise.race([chosen, delay(5000).then(() => { throw new Error('File chooser event missing'); })]);
  await wait("document.querySelector('[data-agent-composer] [data-agent-attachment-count]')?.dataset.agentAttachmentCount==='2'");
}
/**
 * 先发送双图，再仅以文字追问，验证图片真正进入当前输入与历史上下文。
 * handler 使用正式 buildPayloadLine，检查固定 Euzhi endpoint 与 Grok 模型。
 * final 事件经正式订阅写回聊天记录，长回复用于制造真实内部滚动。
 * 不声称测试回复是 Grok 的识图结果，它只是确定性的布局夹具。
 */
async function checkImages() {
  // 输入中文问题同时覆盖 UTF-8 JSON，不只测试 ASCII 字符串与 base64 的组合。
  // 发送仍通过按钮，能够发现 store 只维护 attachments 却不传 images 的旧实现。
  // 等停止按钮出现后才读取 requests，说明 renderer 已经认领正式 runId。
  // first.config.provider、baseUrl、model 必须同时指向 Euzhi 的 Grok 配置。
  // 不从页面模型标签推断实际 endpoint，二者可能因接线错误产生不一致。
  // 图片数量必须恰好两张，防止只发送第一张或重复附加历史图。
  // 每项 data URL 解码后均与源图 Buffer 比较，不能用有效 MIME 前缀冒充真实内容。
  // 单独检查 blob/local 路径不出现，锁住“远端无法读取本地地址”的原始回归。
  // 结果内容刻意不包含图片或路径，避免回显 fixture 误被当成助手看到了图片。
  // 第一轮 final 帧使用相同 runId，验证正式事件订阅与会话补丁仍可正常收尾。
  // 只有第一轮完成后才发送追问，不借并发 run 混淆上下文来源。
  // 追问没有重新选图片，它必须依赖会话缓存的 inputImages。
  // 第二次 images 为空，与 history[0].images 非空形成成对对照。
  // 第一条历史图片 URL 与原 first.images 相等，防止缓存仅保留了空占位。
  // 历史保留原问题文字，不能将图像讨论改造成没有提问的孤立图片块。
  // 工具产物不参与本用例，用户输入图不能被错误放进 generatedImages。
  // 长回复通过正式 final 事件进入 Markdown 组件，不直接用 innerHTML 填充页面。
  // 一百二十段确保即便较高窗口也需要内部滚动，避免“内容刚好不溢出”的假通过。
  // 原发送附件仍在用户消息上展示，转换与提交不能提前 revoke 预览 URL。
  // 缩略图数量断言限定 user 消息，不把 composer 中的残留附件当作已发送记录。
  // 当前用例只启动两个捕获运行，结束时请求数量必须为二，排除隐含重复发送。
  // mock 不回真实 Grok 语义结果，因此测试摘要只描述传输与上下文。
  // 图片编码成功之前 store 不能清空草稿，转换失败保留输入的产品分支由实现负责。
  // UI 在发送后清空 composer 附件，但消息仍拥有自己的预览和模型输入数据。
  // 多图内容不写入普通偏好文档，切换 provider 不需要迁移或复制图片。
  // 服务商密钥没有通过用户消息传递，图片、文本和秘密属于不同协议字段。
  // base64 解码后比较字节，不用“包含 image_url 字样”作为上传成功证据。
  // 当前问题不重复写进 history，图片应只出现在自己的这一条用户消息上。
  // 第一轮结束后发送第二轮，新请求的 images 为空，第一轮图应留在 history。
  await attachImages(); await input('请分析这两张图片'); await run("document.querySelector('[data-agent-send]').click()"); await wait("document.querySelector('[data-agent-stop]')");
  const first = requests[0], bytes = fs.readFileSync(path.join(root, 'one.png'));
  smoke.check('Euzhi receives two actual image byte payloads', first.config.provider === 'euzhi' && first.config.baseUrl === 'https://euzhi.vip/v1' && first.config.model === 'grok-4.7' && first.images.length === 2 && first.images.every(image => Buffer.from(image.split(',')[1], 'base64').equals(bytes)));
  smoke.check('Image inputs contain no blob or local paths', first.images.every(image => image.startsWith('data:image/png;base64,')));
  win.webContents.send(C.AGENT_EVENT, { runId: 'vision-ui-1', type: 'final', text: '第一轮测试回复', steps: 1 }); await wait("!document.querySelector('[data-agent-stop]')");
  await input('继续说明上一张图'); await run("document.querySelector('[data-agent-send]').click()"); await wait("document.querySelector('[data-agent-stop]')");
  smoke.check('Follow-up retains original image context', requests[1].images.length === 0 && requests[1].history[0].images.length === 2 && requests[1].history[0].images[0] === first.images[0]);
  win.webContents.send(C.AGENT_EVENT, { runId: 'vision-ui-2', type: 'final', text: ('一段用于验证固定布局的长回复。\n\n').repeat(120), steps: 1 }); await wait("!document.querySelector('[data-agent-stop]')");
  smoke.check('Sent images remain previewable in conversation', await run("document.querySelectorAll('[data-agent-message][data-agent-role=user] [data-agent-attachment]').length===2"));
}
/**
 * 几何验证覆盖长回复、内部滚动、浏览器焦点恢复和手动窗口变化。
 * main 与根文档不允许被程序滚动，消息区仍应有真实可滚动高度。
 * 输入区高度可随草稿变化，但底边始终锚定 stage，页头不能消失到视口上方。
 * 宽窄和短窗口使用同一会话，不靠重建页面掩盖布局漂移。
 */
async function checkLayout() {
  // 页头与 composer 都在 stage 的固定行，消息行独自分配剩余高度。
  // 这不是按窗口坐标绝对定位，所以会话列表展开时仍应遵守 main 的宽度。
  // 1435x900 对应用户截图附近的桌面尺寸，保留真实外壳和底栏几何。
  // 900x720 覆盖较窄但仍是桌面导航的情况，不依赖移动底栏分支。
  // 540x720 覆盖移动布局，页面主区可用高度会按外壳规则变化。
  // 1280x540 检查低高度窗口，长回复不能挤走底部输入。
  // 每次只调整同一扇测试窗口，历史内容与生成状态不重新初始化。
  // scrollHeight 大于 clientHeight 才证明消息区真实承担滚动。
  // composer.bottom 与 stage.bottom 相等，锁住底部输入的实际位置。
  // 页头 top 非负可以发现整个工作区被外围滚动推走的情况。
  // main.bottom 不能超过 innerHeight，输入区固定到错误的超高容器也应失败。
  // 给 main.scrollTop 赋值主动模拟浏览器聚焦引起的外围滚动。
  // 给路由包装层也赋值，防止仅修 main 却留下下一层隐藏滚动容器。
  // window.scrollTo 检验根文档锁定，不能只看某个子节点的 overflow 属性。
  // textarea.focus 触发真实浏览器焦点行为，覆盖输入框重新获得焦点的场景。
  // scrollIntoView 使用 nearest，模拟浏览器最小移动而非人为强制居中。
  // 最终几何在这些操作之后读取，不能先检查固定再执行可能推动外层的动作。
  // 容差一像素只覆盖分数像素布局，不接受整行或几十像素的偏移。
  // screenshots 在宽、窄两种布局保存，便于人工判断额外留白和聊天间距。
  // invalidate 请求合成重绘，不依赖动画时钟在离屏窗口持续运行。
  // 截图不会参与布尔断言结果，像素采集成功不能掩盖前面几何失败。
  // 只在测试截图前请求重绘，产品代码不引入周期性强制布局。
  // 长草稿的自动高度会触发 React effect，因此输入后保留有限提交时间。
  // textarea 的 148px 上限来自已有组件，不新建与产品不一致的测试常量行为。
  // 客户端内部滚动条应出现在 textarea，不能增长整个 body 来容纳三十五行。
  // 草稿变长时允许 composer 向上扩展，但底边仍必须固定在 stage 底部。
  // 未发送的长草稿不会进入 history，避免测试中隐含第三次模型请求。
  // 清空输入通过正式 onChange，恢复高度也必须由生产 effect 处理。
  // 不清空 session，布局阶段结束后仍能查看原图和两轮对话。
  // 不锁死消息 scrollTop，用户仍可上下浏览，只禁止外围工作区被带动。
  // 每个窗口尺寸等待有限布局提交，不用 rAF 才能获取正确边界。
  // main padding 与边框是外壳的一部分，不把它们当成多余页面滚动。
  // 特意调用 scrollIntoView 和 scrollTop，复现只设 overflow:hidden 仍可被推动的情况。
  for (const [width, height] of [[1435, 900], [900, 720], [540, 720], [1280, 540]]) {
    win.setContentSize(width, height); await delay(200);
    const geometry = await run("(()=>{const main=document.querySelector('[data-app-main]'),stage=document.querySelector('[data-agent-stage]'),scroll=document.querySelector('[data-agent-scroll]'),composer=document.querySelector('[data-agent-composer]');scroll.scrollTop=scroll.scrollHeight;main.scrollTop=300;main.firstElementChild.scrollTop=300;window.scrollTo(0,300);document.querySelector('[data-agent-input]').focus();document.querySelector('[data-agent-input]').scrollIntoView({block:'nearest'});const s=stage.getBoundingClientRect(),c=composer.getBoundingClientRect(),h=stage.firstElementChild.getBoundingClientRect();return {fixed:Math.abs(c.bottom-s.bottom)<1&&h.top>=0&&c.bottom<=innerHeight,outer:main.scrollTop===0&&main.firstElementChild.scrollTop===0&&scrollY===0,scrollable:scroll.scrollHeight>scroll.clientHeight,inside:main.getBoundingClientRect().bottom<=innerHeight}})()");
    smoke.check(`${width}x${height} keeps header/composer fixed and only messages scroll`, geometry.fixed && geometry.outer && geometry.scrollable && geometry.inside);
    if (width === 1435 || width === 540) { win.webContents.invalidate(); await delay(100); fs.writeFileSync(path.join(root, `layout-${width}.png`), (await win.webContents.capturePage()).toPNG()); }
  }
  // 多行输入不能推走页头，textarea 达上限后应在自己内部滚动。
  // 这与聊天消息滚动是两个独立容器，不能由 body 承担其中任意一个。
  // 清空草稿后恢复普通输入高度，不修改会话已有图片或回复。
  await input(('多行草稿\n').repeat(35));
  smoke.check('Long draft grows inward while composer bottom remains fixed', await run("(()=>{const c=document.querySelector('[data-agent-composer]').getBoundingClientRect(),s=document.querySelector('[data-agent-stage]').getBoundingClientRect(),i=document.querySelector('[data-agent-input]');return Math.abs(c.bottom-s.bottom)<1&&i.clientHeight<=148&&i.scrollHeight>i.clientHeight})()"));
  await input('');
}
/**
 * 自定义深度菜单、输入区停止及启动期取消的 Chromium 回归。
 * 用户操作均走真实按钮，模拟后端只负责可控地延迟握手与发送事件。
 * 不是实际 Grok 回答；测试证明 UI 状态和协议接线，不证明模型内容。
 */
// 高档实际进入 maxSteps=6，不能只有标签变化而请求仍传默认值。
// 菜单向上展开应位于窗口内，覆盖截图中原生 select 的视觉问题。
// 运行期间发送按钮必须可点击，点击的含义变成停止回答。
// 工具运行中也能停止，局部 spinner 必须结束，防止留下假忙碌状态。
// 取消事件迟到时不得写入正文，也不得恢复已经结束的运行。
// 启动 handshake 尚未完成时停止，界面先立即冻结而非等后台编号。
// 旧 handle 返回前再提交新问题，必须取消旧编号而保留新编号运行。
// 模拟老 final 含明显标记，若泄漏到任意正文断言会失败。
// 新 final 证明取消处理没有把应用变成无法再次发消息的状态。
// 截图保留菜单和正在运行的停止按钮，便于复核实际外观。
// 每一步等待有上限，不使用任意长 sleep 掩盖竞态。
// 用户切换档位仅影响下一轮，已捕获请求仍保持原来的六轮。
// 本组结束后 requests 总数必须五次，避免重复发送或额外自启动。
// 两个旧图片回归的请求仍保留，控制测试不重置历史来绕过上下文。
// 先运行布局回归再控制回归，旧的固定布局断言不会被额外消息干扰。
// 低档后续发送也核对二轮，避免映射表只实现一个档位。
// 新的初始阶段停止即使没有后台编号，也必须保留“已停止”提示。
// cancelled 数组由 IPC 侧记录，不能只根据按钮消失推断后台收到请求。
// 新任务收到 final 后必须恢复发送箭头，验证完成与停止都能收尾。
// 运行中长思考过程的最大高度另检查 computedStyle，非只比较类名。
// 所有检查都在正式页面挂载后执行，覆盖真实 store 订阅和 React 更新。
// 代码没有访问 renderer 的私有 Zustand store，也没有植入新的假 UI。
// 测试窗口复用现有尺寸，截图没有打开另一个会抢焦点的 Electron 进程。
// 先等待 React 展开菜单，再读取实际几何，不从 CSS 类推断方向。
// 中档可选状态仍由共享组件绘制，截图能暴露选项文字是否截断。
// 点击高档后关闭菜单再发送，避免浮层遮挡发送按钮产生假失败。
// 参数断言取主进程捕获的真实 payload，不只读取按钮展示文字。
// 运行中工具事件带精确 runId，与其他会话或已经完成请求隔离。
// stop 通过输入区入口触发，页头现有入口不代替这项交互断言。
// 迟到事件刻意在取消回执之后发送，覆盖系统 kill 尚未完成时的帧。
// 启动阶段的取消先检查按钮状态，再开始下一条提问。
// 第二个启动与旧 handle 的返回顺序由 releaseStart 控制，而非碰运气。
// 如果旧 runId 被重新挂回，新 final 将被丢弃，最后完成断言会失败。
// low 映射在新的请求快照中验证，不指望改变已经发出的 high 请求。
// 取消数组可以含已结束旧编号，却绝不能包含仍在运行的新编号。
// 结束后恢复发送箭头；未收到 final 时不能提前显示就绪。
// 原消息仍留在聊天记录，测试未通过删会话掩盖残留 streaming。
// 当前 selector 使用正式 data 标记，菜单选项通过公开 role 定位。
// 不用隐藏元素点击或强制删除 overlay 绕过真实按钮可用性。
// 工具 spinner 是局部组件状态，整体按钮停止并不自动证明它已结束。
// 任何捕获请求缺失都会触发数组或长度断言失败，而非静默跳过检查。
// 截图保存发生在停止前，确保用户能看到实际的方形停止图标。
async function checkControls() {
  win.setContentSize(1435, 900); await delay(150);
  await run("document.querySelector('[data-agent-effort] button').click()"); await wait("document.querySelector('[role=option]')");
  smoke.check('Query depth uses an upward custom listbox', await run("(()=>{const p=document.querySelector('[data-agent-effort] [role=listbox]').getBoundingClientRect(),b=document.querySelector('[data-agent-effort] button').getBoundingClientRect();return p.bottom<=b.top&&p.top>=0&&!document.querySelector('[data-agent-effort] select')})()"));
  fs.writeFileSync(path.join(root, 'query-depth.png'), (await win.webContents.capturePage()).toPNG());
  await run("Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent.includes('6')).click()"); await input('检查停止回答'); await run("document.querySelector('[data-agent-send]').click()"); await wait("document.querySelector('[data-agent-composer-stop]')"); await delay(50);
  assert.equal(requests[2].config.maxSteps, 6);
  win.webContents.send(C.AGENT_EVENT, {runId:'vision-ui-3',type:'tool_call',step:1,id:'pending',name:'search_characters',arguments:{query:'Alice'}}); await delay(80);
  fs.writeFileSync(path.join(root, 'stop-response.png'), (await win.webContents.capturePage()).toPNG());
  await run("document.querySelector('[data-agent-composer-stop]').click()"); await wait("!document.querySelector('[data-agent-composer-stop]')"); assert.ok(cancelled.includes('vision-ui-3'));
  win.webContents.send(C.AGENT_EVENT, {runId:'vision-ui-3',type:'answer_delta',step:1,text:'LATE_FRAME_SHOULD_NOT_APPEAR'}); win.webContents.send(C.AGENT_EVENT, {runId:'vision-ui-3',type:'final',text:'LATE_FRAME_SHOULD_NOT_APPEAR',steps:1}); await delay(80);
  smoke.check('Stop freezes replies immediately and ends unfinished tool spinners', await run("!document.body.textContent.includes('LATE_FRAME_SHOULD_NOT_APPEAR')&&!document.querySelector('[data-agent-tool] .animate-spin')&&document.body.textContent.includes('已停止')"));
  deferStart=true; await input('启动阶段停止'); await run("document.querySelector('[data-agent-send]').click()"); await wait("document.querySelector('[data-agent-composer-stop]')"); assert.equal(requests.length,4);
  await run("document.querySelector('[data-agent-composer-stop]').click()"); await wait("!document.querySelector('[data-agent-composer-stop]')"); deferStart=false;
  await run("document.querySelector('[data-agent-effort] button').click()"); await wait("document.querySelector('[role=option]')"); await run("Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent.includes('2')).click()");
  await input('新的有效提问'); await run("document.querySelector('[data-agent-send]').click()"); await wait("document.querySelector('[data-agent-composer-stop]')"); await delay(80); assert.equal(requests[4].config.maxSteps,2);
  releaseStart(); await delay(100); assert.ok(cancelled.includes('vision-ui-4')); assert.ok(!cancelled.includes('vision-ui-5'));
  smoke.check('Late startup handle cancels only the stopped run', await run("!!document.querySelector('[data-agent-composer-stop]')"));
  win.webContents.send(C.AGENT_EVENT,{runId:'vision-ui-5',type:'final',text:'新回答正常完成',steps:1}); await wait("!document.querySelector('[data-agent-composer-stop]')");
  smoke.check('New response finishes after a startup cancellation',await run("document.body.textContent.includes('新回答正常完成')"));
}
// 浅色复核通过正式外观按钮切换，不直接写根节点伪造主题。
// 与暗色复用相同角色查询深度组件，检查选中项不会被勾选图标截断。
// 截图包括整个窗口，避免裁掉弹出面板后误认为浮层没有越界。
// 切换主题不重发 Agent 请求，控制回归的请求计数必须保持五次。
// 选项切换后等待 data-theme 更新，颜色过渡给有限提交时间。
// 关闭外观浮层使用原按钮，不能删除 portal 节点来绕过生命周期。
// 菜单三个选项必须全部存在，不能依靠只有当前档位而显得紧凑。
// 读取文字元素的 scrollWidth/clientWidth，能发现视觉省略号的真实截断。
// 主题偏好写在本测试内存文档，用户设置文件不会被修改。
// 菜单检查结束再关闭，保存的截图展示的是用户可见实际菜单。
// 不以截图文件存在代替断言，布局和文本检查均进入 harness 结果。
// 此验证不增加业务组件或全局样式覆盖，所有行为仍由正式主题系统完成。
// 窗口宽度沿用桌面回归尺寸，极窄布局已由独立几何循环覆盖。
// 与暗色截图配对，可人工核对面板配色、圆角与正文对比度。
// UI 回归由一个 Electron 进程顺序执行，遵守仓库冒烟互斥约定。
async function checkLightMenu() {
  await run("document.querySelector('[data-theme-trigger]').click()"); await wait("document.querySelector('[data-theme-option=light]')");
  await run("document.querySelector('[data-theme-option=light]').click()"); await wait("document.documentElement.dataset.theme==='light'"); await delay(150);
  await run("document.querySelector('[data-theme-trigger]').click()"); await run("document.querySelector('[data-agent-effort] button').click()"); await wait("document.querySelector('[data-agent-effort] [role=option]')");
  smoke.check('Light query menu shows every option without truncation', await run("(()=>{const labels=[...document.querySelectorAll('[data-agent-effort] [role=option] span')];return labels.length===3&&labels.every(e=>e.scrollWidth<=e.clientWidth)})()"));
  fs.writeFileSync(path.join(root, 'query-depth-light.png'), (await win.webContents.capturePage()).toPNG());
  await run("document.querySelector('[data-agent-effort] button').click()");
}
// app ready 后再使用 safeStorage，避免测试意外走系统尚未就绪的明文回退。
// static out 必须与当前源码指纹一致，否则这次回归没有结论。
// 所有窗口与 CDP 连接只属于本测试，不 Stop-Process 关闭用户工作。
async function main() {
  // ready 后才写测试密钥，与正式设置页使用 safeStorage 的时机一致。
  // assertBuildFresh 检查源代码内容而非修改时间，避免在旧 out 上测出错误结论。
  // preload 使用正式绝对路径，页面只能经 contextBridge 获取有限 API。
  // nodeIntegration=false 保证 UI 测试没有依赖 renderer 直接读取 Node 文件。
  // sandbox=false 沿用仓库 CommonJS preload 约定，不为测试临时开放其他能力。
  // 用户未登录走长期游客，图片发送测试无需真实账户服务器可用。
  // 更新公告用真实关闭按钮消除遮挡，不通过移除节点绕过应用状态。
  // 等 grok-4.7 表示偏好水合完成，不能在旧默认模型首帧发图。
  // 图片检查与布局检查严格串行，后者复用前者创建的真实对话内容。
  // 同一进程只有本套件创建的窗口，finally 仅销毁它和对应遮挡 fixture。
  // CDP attached 状态先检查，初始化早期失败也不会在清理时报第二个异常。
  // 请求总数断言防止按键或异步状态竞态导致重复运行。
  // 输出目录只包含测试资源，不代表用户图片或正式密钥保存位置。
  // 路由刷新和原图上传都没有访问真实中转站，测试不产生付费调用。
  // allPassed 包含几何检查的结果，不因最后一步文字输入成功而忽略此前失败。
  // finish 的非零退出与公共看门狗结合，任何未完成套件不得被 CI 误判为绿。
  await app.whenReady(); smoke.assertBuildFresh({ app });
  require("../apps/electron/src/main/modules/agent/provider-secrets").updateProviderKey('euzhi', 'sk-vision-ui-test');
  win = new BrowserWindow({ ...windowChromeOptions(), show: false, width: 1435, height: 900, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  smoke.attachWebContents(win.webContents); const occlusion = await smoke.hardenWindow(win);
  try {
    await win.loadURL('app://app/agent'); await wait("document.querySelector('[data-agent-model]')?.dataset.agentModel==='grok-4.7'");
    await wait("document.querySelector('[aria-labelledby=update-announcement-title]')"); await run("document.querySelector('[aria-labelledby=update-announcement-title] button').click()");
    await checkImages(); await checkLayout(); await checkControls(); await checkLightMenu(); console.log('VISION_SCREENSHOTS', root);
  } finally { occlusion.dispose(); if (win.webContents.debugger.isAttached()) win.webContents.debugger.detach(); win.destroy(); }
  assert.ok(requests.length === 5); smoke.finish({ app, ok: smoke.allPassed() });
}
// 失败必须走 harness 非零退出，不能由截图成功覆盖前面的失败断言。
// fixture 不验证远端账号、真实视觉回答或收费，仅证明应用传输与布局。
// 临时截图保持原始尺寸，人工复核时不裁剪掉外壳或窗口底部。
main().catch(error => smoke.finish({ app, ok: false, error }));

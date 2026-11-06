/**
 * Agent Markdown 阅读专项：真实静态页面、preload 和消息事件，模型由固定 IPC 夹具代替。
 * 不请求语言模型、不启动 Python、不花 token、不执行实际图片或视频生成。
 * 通过真实输入区发送用户消息，再推送分块答案，避免只测试一个脱离产品的渲染样例。
 * 本次同时覆盖截图中的 H3 文本、GFM 表格、代码块、HTML 字面标记与复制原文。
 * 所有用户文档与截图都位于临时目录，不读取或改写用户的真实账户和模型配置。
 * 系统剪贴板由页面替身隔离；测试观察复制参数，不覆盖用户当前的剪贴板内容。
 * 断言由 smoke harness 管理，旧构建、超时和失败必须保留非零退出码。
 */
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { app, BrowserWindow } = require("electron");
// 正式 Windows 客户端从 preload 的启动标记决定是否绘制自定义 head。
// 测试也要带同一参数，否则不存在顶栏外观入口，不能拿旧账户菜单路径代替。
// 配置只影响本轮窗口，不改变用户的全局窗口设置。
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/src/main/core/windows/window-chrome");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels"), { registerHandle } = require("../apps/electron/src/main/ipc/result");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "agent-markdown", timeoutMs: 90000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-agent-markdown-")); let win, request;
// 临时 userData 也隔离 Chromium 会话，不共享普通客户端的内存、缓存和持久化入口。
// 主进程禁用 GPU 仅作用于测试，截图仍来自 Chromium 对真实 React 页面绘制的结果。
// 看门狗覆盖初始化和轮询全过程，防止页面未挂载时无限等待。
// 协议在 ready 前声明，沿用正式应用静态资源的加载方式。
// workDir 让失败日志能指出本轮截图与临时文档所在位置。
// 不运行 registerAllIpcHandlers，避免本专项初始化真实密钥、下载或外部服务。
// 主题与窗口控制沿用生产 handler，深浅主题切换不是直接改 DOM 的伪测试。
app.setPath("userData", path.join(root, "browser")); app.disableHardwareAcceleration(); smoke.setWorkDir(root); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
const windowHandlers = require("../apps/electron/src/main/core/windows/window.handlers"); windowHandlers.registerThemeHandlers(); windowHandlers.registerWindowHandlers();
require("./lib/guest-session-fixture").installGuestDocumentFixture();
// 生成入口只需要确认已配置，不把任何真实密钥传给渲染端。
// account:me 固定本地未登录，游客页面不依赖账户服务返回资料。
// 模型、下载与输出列表为空，不扫描用户磁盘，也不产生后台下载。
// 路径仅供现有组件布局使用，测试不把生成内容写入用户目录。
// changelog 通道为空，更新弹窗仍按正式静态资源流程处理。
// 这里的 configured=true 是夹具状态，不证明真实密钥可连接模型服务。
// 资料接口的 401 属于正式契约，AuthGate 应按游客分支挂载业务页。
// 下载列表使用 revision/tasks 形状，避免把未初始化状态误当成测试目标。
// 空模型列表不是隐藏错误，Markdown 展示不应要求本地安装任何模型。
// 没有挂上传接口，图片链接测试不能借助上传替身把自动请求变成成功。
// 文件输出列表也不提供伪生成物，图片附件仍由既有专项单独覆盖。
// 账户清理使用共享的无副作用夹具，不触及实际账户令牌文件。
// 所有 handler 只在这个进程注册，不会覆盖用户正在运行应用里的 IPC。
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHENTICATED" } }));
registerHandle(C.AGENT_SECRET_STATUS, () => ({ configured: true, source: "env", protection: "", tail: "test" }));
for (const channel of [C.MODELS_SCAN, C.FILES_LIST_GENERATED_IMAGES, C.FILES_LIST_OUTPUT_FOLDERS]) registerHandle(channel, () => []);
registerHandle(C.MODELS_DOWNLOAD_LIST, () => ({ revision: 0, tasks: [] })); registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root); registerHandle(C.CHANGELOG_READ, () => "");
// 固定 runId 仍需通过真实 runAgent 与 store 写入 runningRunId，事件才能被消费。
// 不在 handler 内立即发事件，防止 IPC 返回之前的首帧被 store 合理丢弃。
// request 保留调用方原文，用来证明阅读渲染没有反向修改发送给模型的内容。
// fixture 不异步返回网络结果，后续事件由测试阶段明确控制到达时机。
// 当页面不消费正式 IPC 返回时，等待生成状态会失败，不能越过这道前置条件。
// 不复用另一次测试的 runId，单个独立进程中只有本次运行可接收事件。
registerHandle(C.AGENT_RUN, (_event, options) => { request = options; return { runId: "markdown-fixture" }; });
// 用中文段落复现截图，但混入英文、标签和多行代码，检查不同语法的交界。
// 表格必须包括标准分隔行，不用伪造一个无法被 GFM 识别的表格作为正向基准。
// H3 的 <d> 是模型提示词的字面信息，阅读面不能静默删除它。
// 恶意链接和标签放在末尾，验证用户可见文本不会变成可执行 DOM。
// 图片使用本地不可达地址；正常实现不创建 img，也就不应自动加载该地址。
// 长代码行专门捕获 flex 最小宽度把 main 撑宽的回归。
// 样例中的标题分两级，能发现解析器只支持一种井号数量的实现缺陷。
// 行内强调与删除线并排，覆盖 CommonMark 与 GFM 插件各自负责的语法。
// 引用用独立段落，不能由表格单元格内误匹配出来的 > 代替正向结果。
// 代码块包含 JSON 标签，验证围栏信息不会作为正文首行重复出现。
// 代码中的标签必须保留字面字符，不能按普通段落再解释一次。
// 分隔线前后都留空行，避免与 Setext 标题歧义造成测试输入错误。
// 普通中文单元格与英文单元格同时存在，字体和换行不能只适配英文。
// 地址端口不可达，即便误加载也不会访问真实第三方或泄露用户参数。
// 危险内容使用固定无副作用的标记，检测的是是否执行而非制造真实破坏。
// 追加真实代码、普通提示词、无语言和未知语言四种围栏，不能全按代码染色。
// Python 的缩进和换行用于复制对照，JSON 长行仍用于滚动边界检查。
// 未知语言不是接口错误，回落 text 后也必须能复制原文。
const markdown = "## 完善后的 H3 提示词\n\n**integrated_multimodal_description:**\n\n[Shot 1] A quiet voice says: <d>[English] Ne~</d>\n\n---\n\n### 语气指定说明\n\n| 时间段 | 说话内容 | 语气指定 |\n| --- | --- | --- |\n| 0–0.4s | Ne~ | softly and slowly |\n| 1–5s | 你好 | 平静、沉思 |\n\n- **T2VA** 模式\n- 支持 *强调* 和 ~~删除线~~\n\n> 保留原始标签\n\n```json\n{\"prompt\":\"<d>hello</d>\"}\n" + "x".repeat(240) + "\n```\n\n[Unsafe](javascript:alert(1))\n\n![preview](http://127.0.0.1:9/tracking.png)\n\n<script>window.__markdownInjected = true</script>\n\n```text\nCamera: fast push-in, then follow the fighter.\n```\n\n```python\ndef greet(name):\n    return \"Hello \" + name\n```\n\n```\nA plain prompt without a language.\n```\n\n```unknown-language\n<Picture 1> remains literal.\n```";
// 页面轮询使用主进程计时，不依赖被遮挡窗口的 requestAnimationFrame。
// 每个条件有有限次数，超时直接抛出当前表达式而不是假装跳过。
// executeJavaScript 由 harness 包裹，保留单步超时和当前步骤信息。
// event helper 只构造生产 AgentEventMessage 的字段，不访问 React 私有状态。
// 截图缓存在本轮临时目录，失败时保留供人工判断，不写入 docs 二进制文件。
// 所有辅助函数只操作本轮 win，不枚举或关闭用户已打开的 Electron 窗口。
// wait 条件返回布尔值，超时和断言失败能被分别识别，不吞掉等待结果。
// 最大等待约九秒，超过后保留表达式帮助定位挂载、事件或主题阶段。
// setTimeout 在主进程执行，后台页面的 CSS 动画停顿不影响等待上限。
// emit 不修改正文，切片的拼接必须由生产流式缓存与 store 完成。
// capture 保存 capturePage 原始 PNG，不对图片做缩放掩盖布局溢出。
// 读取截图失败也会进入顶层 catch，不能只输出一个不存在的结果路径。
const run = smoke.createRun(), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression) { for (let i = 0; i < 150; i++) { if (await run(`Boolean(${expression})`)) return; await delay(60); } throw new Error("Markdown wait timed out: " + expression); }
function emit(event) { win.webContents.send(C.AGENT_EVENT, { runId: "markdown-fixture", ...event }); }
async function capture(name) { fs.writeFileSync(path.join(root, name + ".png"), (await win.webContents.capturePage()).toPNG()); }
/**
 * 先走发送和增量路径，再发送最终全文，分别检查流式与完成态。
 * 用户输入故意带 Markdown，防止回复组件意外接管用户消息。
 * clipboard.writeText 是唯一页面替身，保存参数以检查 CRLF、围栏和表格原文。
 * 不注入消息 store，不直接把测试 HTML 放入气泡，所有正文来自正式事件消费。
 * 首个增量只写到表格中途，第二段补全，验证未闭合结构不会让页面停止渲染。
 * 先等待生成状态，确保生产 store 已保存 runId，再开始推送夹具事件。
 * 更新公告按真实按钮关闭，避免浮层遮挡截图与后续主题交互。
 * 窗口最初隐藏且 backgroundThrottling=false，等待机制不依赖真实前台焦点。
 * 断言读 DOM 与实际样式，不以库名称或源码中出现特定字符串充当成功证据。
 * 输入事件使用原生 textarea setter，确保 React 的受控 onChange 正常收到变更。
 * 发送通过正式按钮执行，不能绕开空输入、密钥状态和已有任务的互斥规则。
 * 等待标题而非固定睡眠后马上读 DOM，可以适应静态资源加载速度差异。
 * 流式阶段按钮应禁用；如果一收到 token 就错误标记完成，会在此被发现。
 * 第二段先补齐表格，再发送 final，因此覆盖增量路径而非只依赖最终稿重建。
 * final 必须解除复制禁用，永久停在 loading 的界面不能算阅读成功。
 * 原始 Markdown 未写入任何页面属性，测试读取的是实际渲染出来的节点。
 * 更新弹窗只关闭一次，不篡改公告的本地已读状态以跳过正式页面生命周期。
 */
async function checkAnswer() {
  await win.loadURL("app://app/agent"); await wait("document.querySelector('[data-agent-input]')");
  await wait("document.querySelector('[aria-labelledby=update-announcement-title]')"); await run("document.querySelector('[aria-labelledby=update-announcement-title] button').click()");
  await run("Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async text=>{window.__copiedMarkdown=text}})");
  await run("(()=>{const e=document.querySelector('[data-agent-input]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'**用户原文**');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await delay(100); await run("document.querySelector('[data-agent-send]').click()"); await wait("document.querySelector('[data-agent-stop]')");
  emit({ type: "answer_delta", step: 1, text: markdown.slice(0, 190) }); await wait("document.querySelector('[data-agent-answer] h2')");
  // 过程夹具走生产事件消费；折叠只影响显示，不能让工具结果从 store 丢失。
  // 不通过注入一段 details HTML 绕过 AgentMessageSteps 的真实渲染。
  // 推理与工具项都给出固定内容，完成后应能展开核对参数和原样输出。
  // 事件使用同一 runId，若正式 store 错误忽略事件，摘要不会凭空出现。
  // 先发调用再发结果，符合真实协议，避免构造无法在线上产生的状态。
  // 工具文本中的星号保持原文，用来区分工具区与 Markdown 正文的解析边界。
  // 摘要默认折叠但仍可由键盘/点击展开，不应完全删除过程内容。
  emit({ type: "reasoning_delta", step: 1, text: "Checking the H3 prompt format." });
  emit({ type: "tool_call", step: 1, id: "layout-tool", name: "inspect_prompt", arguments: { mode: "H3" } });
  emit({ type: "tool_result", step: 1, id: "layout-tool", name: "inspect_prompt", output: "**raw tool output**" });
  smoke.check("Streaming renders a heading before the complete document arrives", await run("document.querySelector('[data-agent-copy]').disabled"));
  emit({ type: "answer_delta", step: 1, text: markdown.slice(190) }); await wait("document.querySelector('[data-agent-answer] table')");
  emit({ type: "final", text: markdown, steps: 1 }); await wait("!document.querySelector('[data-agent-copy]').disabled");
  // 完成态的 DOM 检查同时验证块级语义与截图中暴露的星号、井号和表格竖线问题。
  // 用户消息仍是原样文本，不能因为复用了组件而被当作助手 Markdown 渲染。
  // 查询范围限定在回复正文，角色名或工具输出里的同名内容不能让断言误绿。
  // 两个表格正文行独立存在，证明不是仅为原文加了一个 table 外壳。
  // H3 字面标签在可见文本中存在，但浏览器不能创建 d 或 script 元素。
  // 默认 URL 过滤应移除危险协议；没有模拟浏览器安全策略来替组件兜底。
  // h3 与 strong 同时存在才能证明块级和行内解析均已接入。
  // tr 数量检查限定在 tbody，不能把表头那一行误算成正文。
  // pre code 查询保证代码仍有语义容器，而不是被拆成普通段落。
  // 用户文本的正向 includes 与 strong 的负向检查配对，防止检查范围恒真。
  // request.question 来自真实 IPC 参数，显示层看起来正确还不够。
  // querySelector 的协议检查读取实际 href 属性，原始恶意字符串留在文字里不算执行。
  // window 标记只由样例 script 设置，若只是静默执行后删标签仍会失败。
  // img 的负向检查验证不自动加载；是否点击外链属于用户明确操作，不在此用例中模拟。
  smoke.check("H3 answer renders headings, emphasis, table, lists, quote and code", await run("(()=>{const a=document.querySelector('[data-agent-answer]');return a.querySelector('h3')&&a.querySelector('strong')&&a.querySelectorAll('tbody tr').length===2&&a.querySelector('li em')&&a.querySelector('del')&&a.querySelector('blockquote')&&a.querySelector('pre code')})()"));
  smoke.check("User message and outbound request keep literal Markdown", request.question === "**用户原文**" && await run("document.querySelector('[data-agent-role=user]').textContent.includes('**用户原文**')&&!document.querySelector('[data-agent-role=user] strong')"));
  smoke.check("Raw H3 tags remain visible without executing HTML or loading images", await run("(()=>{const a=document.querySelector('[data-agent-answer]');return a.textContent.includes('<d>[English] Ne~</d>')&&!a.querySelector('d,script,img')&&!window.__markdownInjected&&!a.querySelector('a[href^=javascript]')})()"));
  await run("document.querySelector('[data-agent-copy]').click()"); await wait("typeof window.__copiedMarkdown==='string'");
  // 逐字比较原文，复制成纯展示文字或混入按钮文案都会失败。
  // 同时验证点击后没有丢失表格分隔行、代码缩进或恶意标签的字面内容。
  // 剪贴板替身只观察参数，实际操作系统剪贴板保持不变。
  // 复制测试不读取 textContent，因为页面中额外存在角色名和复制按钮文字。
  // 真正成功参数必须包含原始 script 字面串，渲染安全不能靠改写持久化数据实现。
  // 比较完整字符串而非 includes，能捕获末尾多出的换行、空格或流式尾标。
  // 本用例不声称操作系统剪贴板权限可用，只证明产品复制链路传入的内容正确。
  smoke.check("Copy receives exact original Markdown rather than rendered text", await run("window.__copiedMarkdown") === markdown);
}
/**
 * 两种主题分别在宽屏与窄屏截图，检查表格和代码不会把 main 撑出视口。
 * 窗口尺寸是内容区 CSS 尺寸，不修改产品断点或媒体查询实现。
 * 深浅主题通过真实外观入口切换，并等待主题过渡结束后读取样式。
 * 表格可换行，代码必须能在自身 pre 内横向滚动，不能截断原始长行。
 * body 滚动宽度提供全局反证，单个元素看似不溢出仍可能把父级撑宽。
 * 用真实截图记录阅读布局，不把伪模型通过称为真实生成质量通过。
 * 1280px 覆盖有会话侧栏的常规桌面，540px 覆盖收起侧栏后的紧凑主区。
 * 两个宽度用同一消息实例，不用重建消息规避 resize 后的布局问题。
 * 代码超长行应产生局部滚动，p.scrollWidth>p.clientWidth 是可观测证据。
 * overflowX 必须是 auto，隐藏溢出虽然看似不撑宽，用户却无法阅读剩余代码。
 * 表格不要求强制横向滚动，窄表能够自然换行就是合法的阅读布局。
 * 检查完成后才截图，图片对应的是已断言过的同一主题与尺寸。
 * 主题变化不重新请求答案，消息内容在两种主题下应逐字保持一致。
 * 截图只能辅助人工检查颜色与留白，功能正确性仍由明确的 DOM 断言负责。
 * 等待两百毫秒只给 resize 后的绘制留出机会，不把延迟本身当作布局通过证据。
 * 两轮中每个尺寸都重新读取元素几何，避免沿用上一次窗口宽度的缓存结果。
 * theme 和 width 同时写进截图文件名，人工复核时不会混淆浅色宽屏与深色窄屏。
 */
async function checkLayout() {
  for (const theme of ["light", "dark"]) {
    // 使用正式自定义 head 的外观入口，窗口创建时带生产能力标记。
    // 不能复用登录页的 data-toolbox-theme，那是另一套只在登录入口出现的按钮。
    // 不向设置 store 或根元素注入主题，也不依赖已移除的账户菜单外观项。
    // 等待选项挂载后再选 dark，避免只点开浮层却误以为已切换深色。
    // 选项变更仍通过生产 setTheme 和 nativeTheme IPC 同步 Chromium 配色。
    // 切换完成关闭外观浮层，后续截图只保留目标聊天界面。
    // 关闭按钮走正式 onClose，不能在测试中删除 DOM 来掩盖未释放的锁定状态。
    // 首轮仍为初始 light；这条分支只在第二轮执行，不反复切换导致动画竞跑。
    if (theme === "dark") {
      await wait("document.querySelector('[data-theme-trigger]')");
      await run("document.querySelector('[data-theme-trigger]').click()"); await wait("document.querySelector('[data-theme-option=dark]')");
      await run("document.querySelector('[data-theme-option=dark]').click()"); await wait("document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('theme-ripple')");
      await require("./lib/sidebar-menu-fixture").closeAppearance(run);
    }
    // 1920px 检查正文限宽，320px 检查输入操作和气泡在极窄窗口不撑宽页面。
    // 与原有中等宽度使用同一条消息，resize 不能靠重新挂载来掩盖布局问题。
    // 深浅主题各执行全部宽度，不能只在一种配色下确认代码块滚动边界。
    for (const width of [1920, 1280, 540, 320]) {
      win.setContentSize(width, 900); await delay(200);
      smoke.check(`${theme} ${width}px keeps document within main and long code scrollable`, await run("(()=>{const a=document.querySelector('[data-agent-answer]'),p=a.querySelector('pre');return a.getBoundingClientRect().right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth&&p.scrollWidth>p.clientWidth&&getComputedStyle(p).overflowX==='auto'})()"));
      await capture(`${theme}-${width}`);
      // 两种主题都要保存实际代码区，不能只凭页面顶部截图判断高亮可读性。
      // 540px 同时覆盖窄聊天列，工具栏与复制动作仍应留在块内。
      // 先滚动当前 Python 块，确认截图来自同一个生产消息实例。
      // 不裁掉应用外壳；这样可以一并看出代码区是否侵入输入框或导航。
      // keyword 的实际前景色必须区别于正文，只有 className 而无 CSS 不能通过。
      // 颜色按当前主题计算，不把浅色数值硬套到暗色后断言通过。
      // capture 等待绘制，几何与语义断言仍由本循环原有检查负责。
      // 截图后返回顶部，让后一个尺寸保持与原测试一致的阅读起点。
      // 该滚动只影响测试页，不修改产品滚动 effect 或会话持久化。
      // 没有为截图重新生成模型答案，两种主题共享完全相同的原文。
      // 最后继续极窄 320px 检查，代码区滚动不能破坏后续响应式状态。
      // 本记录是无模型夹具的真实页面截图，不能称为线上回答质量验证。
      if (width === 540) {
        smoke.check(`${theme} syntax colors differ from plain text`, await run("(()=>{const code=document.querySelector('[data-code-language=python] code');return getComputedStyle(code.querySelector('.hljs-keyword')).color!==getComputedStyle(code).color})()"));
        await run("document.querySelector('[data-code-language=python]').scrollIntoView({block:'center'})");
        await capture(`code-block-${theme}-narrow`);
        await run("document.querySelector('[data-agent-scroll]').scrollTop=0");
      }
    }
  }
}
/**
 * 代码块的语言、着色和单独复制走生产 React 组件，不能只检查依赖已安装。
 * 已有 JSON 块覆盖长行，新 Python 块覆盖关键词、字符串、缩进与原样复制。
 * 三种 text 块分别来自明确声明、没有声明和不认识的语言，均不能崩溃。
 * 高亮检查实际 span，颜色另结合后续两种主题截图复核。
 * 剪贴板替身只观察参数，不改用户系统剪贴板，也不宣称验证了系统权限。
 * 第二次复制普通提示词，能发现所有按钮错误绑定第一块正文的问题。
 * 失败场景使用明确拒绝的 Promise，项目封装必须反馈失败而非显示已复制。
 * 恢复替身后其他完整回复复制回归仍可使用，避免后续测试继承坏环境。
 * 普通围栏没有语法 span，防止英文镜头描述被自动猜成代码语言。
 * 尖括号在代码中仍是可见文本，不得生成图片、script 或 H3 自定义元素。
 * 捕获截图前滚动到代码块，保存的是实际渲染工具栏而不是页面顶部。
 * 每个断言限定在块内，不让整条回复尾部已有复制按钮误充新功能。
 */
// 夹具共有五个围栏，不能把普通正文里的行内 code 算成第六个块。
// 第一个 JSON 围栏沿用已有超长字符串，用来覆盖代码区内部横向滚动。
// 第二个 Python 围栏含 def 与 return，两个关键词应由语法库产生 token。
// Python 的四个行首空格是有效语义，复制结果少一个空格也不能通过。
// 这份 Python 夹具末尾没有用户额外空行，复制预期没有解析器补的换行。
// text 围栏的 Camera 英文应显示为普通文本，不自动猜成 CSS 属性。
// 无声明围栏测试解析器没有 language 类时的默认值。
// 未知声明围栏测试库不认识语法名时的稳定回落，而非直接抛错。
// 未知围栏含 Picture 字面标记，不能因为代码区另一个渲染入口而执行为元素。
// 语言数量检查与 token 检查分开，只有正确标签而没有着色仍不足以通过。
// hljs 类名来自实际返回的语法树，不是在夹具 Markdown 里手写 span。
// JSON 的 string token 和 Python 的 keyword token 分别证明两份语言定义可用。
// 只找 data-markdown-code-block 内的按钮，已有整条回复复制不能误充单块复制。
// 点击 Python 后先等待剪贴板替身接收新文本，再比较完整相等。
// 没有使用 startsWith 作为最终结果，它只作为有上限轮询的完成信号。
// 最终相等检查能发现混入语言名、复制按钮文字或其他代码块内容。
// 第二次复制 text 块使用不同正文，可发现所有复制按钮误绑定同一个 source。
// text 的负向 span 检查证明普通提示词没有被着色器随意解释为代码。
// 剪贴板失败时替身明确拒绝 Promise，成功路径不能继续用旧 copied 状态。
// 等待中文失败提示针对测试当前 locale；这不是新增加的硬编码产品文案。
// 恢复 writeText 后才继续截图，后续操作不继承刻意失败的测试前提。
// 截图前滚动真实代码 section，不裁出一个脱离聊天上下文的组件样本。
// capture 复用同一 Chromium 窗口，不是靠重新拼 HTML 生成示意图。
// 检查中的 window 变量只存在测试页，不加进 preload 或正式 IPC 协议。
// 页面没有获得 Node 文件能力，保存截图由主进程执行。
// 复制仍经过生产 copyText，替身只替换最终浏览器能力，不绕过产品成功判断。
// 被拒绝的 Promise 不应导致整条消息卸载或 Agent 状态变成生成失败。
// 本例没有改 source，复制失败提示不会反向写入原始 Markdown 字符串。
// 流式与完整回复复制仍由前面的 checkAnswer 覆盖，不在这里重建第二次会话。
// 多块状态是否互相误绑通过先后复制不同正文验证，而非读取组件内部 state。
// 按钮图标是展示反馈，文字相等断言才是复制内容的证据。
// 单块复制完成后仍继续会话切换与布局检查，能暴露交互后的残留副作用。
// 深浅主题的可读性需要结合后续截图复核，DOM 中有 token 不等于颜色合适。
// 窄窗口的滚动测试沿用同一份 JSON 长行，不删短夹具来掩盖溢出问题。
// 整个专项不调用任何语言模型，因此输出速度与模型内容质量不属于本次结论。
async function checkCodeBlocks() {
  smoke.check('Code blocks show their language and safe syntax tokens', await run("document.querySelectorAll('[data-markdown-code-block]').length===5&&document.querySelector('[data-code-language=python] .hljs-keyword')&&document.querySelector('[data-code-language=json] .hljs-string')&&document.querySelectorAll('[data-code-language=text]').length===3"));
  await run("document.querySelector('[data-code-language=python] [data-code-copy]').click()");
  await wait("window.__copiedMarkdown.startsWith('def greet')");
  smoke.check('Block copy preserves indentation without language or toolbar text', await run('window.__copiedMarkdown') === 'def greet(name):\n    return "Hello " + name');
  await run("document.querySelector('[data-code-language=text] [data-code-copy]').click()");
  await wait("window.__copiedMarkdown.startsWith('Camera:')");
  smoke.check('Plain prompts copy their own text and stay unhighlighted', await run("window.__copiedMarkdown==='Camera: fast push-in, then follow the fighter.'&&![...document.querySelectorAll('[data-code-language=text] code')].some(el=>el.querySelector('span'))"));
  await run("Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{throw new Error('fixture clipboard denied')}});document.querySelector('[data-code-language=python] [data-code-copy]').click()");
  await wait("document.body.textContent.includes('复制失败')");
  smoke.check('Clipboard rejection gives a failure message', true);
  await run("Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async text=>{window.__copiedMarkdown=text}});document.querySelector('[data-code-language=python]').scrollIntoView({block:'center'})");
  await capture('code-block-copy-highlight');
}
/**
 * 对照用户给出的 Codex 对话排版检查几何与交互，不检查某个 class 名是否存在。
 * 正文与输入表面读取实际左右边界，宽屏应居中且不超出既定阅读宽度。
 * 用户气泡右边缘与正文右边缘一致，助手则透明无边框，保留两种角色方向。
 * 时间来自真实 message.createdAt，time 元素需带机器可读日期而非空装饰。
 * 工具过程先确认默认折叠，再点击打开并验证实际内容可见。
 * 最后还原折叠状态，避免测试动作改变后续主题截图的目标布局。
 * 会话栏开合不能重建消息节点，正在阅读的正文应保持同一个 DOM 实例。
 * 新聊天功能仍需真实可用，不能因隐藏侧栏而丢掉唯一的创建入口。
 * 新会话验证后通过原列表切回本轮有消息的会话，不直接注入 store 状态。
 * 复制、附件与模型事件已由本文件前段和既有图片冒烟分别覆盖。
 * 截图之前把消息滚动到上方，让时间、用户气泡与助手正文同时进入视口。
 * 不把 Codex 的 Changes/Sources 面板复制成无业务内容的占位界面。
 * 这里只检查真实客户端布局，模拟模型不代表在线推理质量或执行时长。
 * 对齐容差为两像素，只覆盖布局取整，不放宽到能够掩盖一层多余 padding。
 * 用户气泡宽度需小于阅读列，空有右对齐但整行着色的旧实现不能通过。
 * 助手透明背景与零边框配对检查，不能用同色边框假装去掉卡片。
 * time.dateTime 只检查有效输出存在，实际格式由浏览器 Intl 与当前 locale 决定。
 * sidebar.display 与几何宽度分别检查关闭、打开状态，防止仅改变 aria 属性。
 * __answerNode 仅保留测试期 DOM 引用，没有添加到正式会话数据或原始回复字符串。
 * 工具参数中的 H3 固定值作为过程夹具，不要求本地存在 H3 模型文件。
 * 展开结果检查原始字符串相等，Markdown 解析错误地扩散到工具区也会失败。
 * summary 检查针对本次回复，不把其他历史消息的 details 当作目标。
 * 这个用例没有实现耗时采集，所以不要求出现截图中无法从当前契约获得的分钟数。
 * 会话新建后的恢复通过捕获的 sessionId 精确定位，不假设会话按钮的排序位置。
 * 切回后继续执行后面的表格和代码尺寸检查，发现会话操作导致的宽度回归。
 * 局部截图记录用户气泡与正文的相对位置，功能断言仍保留在控制台摘要里。
 */
async function checkConversationLayout() {
  await wait("document.querySelector('[data-agent-process]')");
  // 返回各项几何差值，失败日志能区分阅读列偏移、气泡方向或助手边框问题。
  // 仍按两像素容差判定，不因为看到失败而放宽到能掩盖原生滚动条偏移。
  // 完成态控件只读一次，结果对象不写回产品状态，也不参与布局计算。
  // 所有条件取逻辑与，任意一个布局维度失败都会使整条断言失败。
  const geometry = await run("(()=>{const a=document.querySelector('[data-agent-role=agent]'),u=document.querySelector('[data-agent-role=user] > div:last-child'),m=document.querySelector('[data-agent-messages]'),c=document.querySelector('[data-agent-composer] > div'),s=getComputedStyle(a),r=a.getBoundingClientRect(),b=c.getBoundingClientRect(),q=u.getBoundingClientRect();return {width:m.getBoundingClientRect().width,left:r.left-b.left,right:r.right-b.right,bubble:q.right-r.right,narrow:q.width<r.width,border:s.borderTopWidth,background:s.backgroundColor,time:Boolean(document.querySelector('time[data-agent-timestamp]').dateTime)}})()");
  smoke.check("Conversation uses aligned centered columns, right user bubble and borderless assistant", geometry.width<=800&&Math.abs(geometry.left)<2&&Math.abs(geometry.right)<2&&Math.abs(geometry.bubble)<2&&geometry.narrow&&geometry.border==='0px'&&geometry.background==='rgba(0, 0, 0, 0)'&&geometry.time, JSON.stringify(geometry));
  // 真实点击 summary，不能直接写 open=true 来绕过事件或可访问元素。
  // 工具输出保持未解析的星号，确认折叠详情仍使用原先的文字语义。
  // 同时检查展开前的默认状态，始终打开的工具卡不能满足目标布局。
  // 收起后保留 DOM 内容，后续流式更新仍然可以追加工具结果。
  smoke.check("Execution summary defaults closed", await run("!document.querySelector('[data-agent-process]').open"));
  await run("document.querySelector('[data-agent-process] summary').click()");
  smoke.check("Execution summary expands to original tool results", await run("document.querySelector('[data-agent-process]').open&&document.querySelector('[data-agent-tool-output]').textContent==='**raw tool output**'"));
  await run("document.querySelector('[data-agent-process] summary').click();window.__answerNode=document.querySelector('[data-agent-answer]')");
  // 初始会话栏不占宽，展开后必须可见且 aria 状态同步。
  // 使用同一个消息 DOM 的引用对照，防止开合会话栏实际卸载正在流式渲染的回复。
  // 浏览器几何检查证明不是只有 aria-expanded 变化而侧栏没有真实出现。
  smoke.check("Sessions start collapsed", await run("getComputedStyle(document.querySelector('[data-agent-sidebar]')).display==='none'"));
  await run("document.querySelector('[data-agent-sessions-toggle]').click()");
  smoke.check("Opening sessions preserves the active answer", await run("document.querySelector('[data-agent-sidebar]').getBoundingClientRect().width>0&&document.querySelector('[data-agent-sessions-toggle]').getAttribute('aria-expanded')==='true'&&window.__answerNode===document.querySelector('[data-agent-answer]')"));
  const sessionId = await run("document.querySelector('[data-agent-session][aria-current=true]').dataset.agentSession");
  // 新聊天与切回会话都通过真实按钮，不调用 store 私有方法或模拟路由。
  // 检查 hero 表明已经切到空会话，旧回复不能误留在新会话里。
  // 切回后等待原有表格，证明消息格式和会话内容并未因布局操作丢失。
  // 整轮不刷新页面，避免重新水合掩盖开合组件造成的数据重置。
  await run("document.querySelector('[data-agent-new-chat]').click()"); await wait("document.querySelector('[data-agent-hero]')");
  await run(`document.querySelector('[data-agent-session="${sessionId}"]').click()`); await wait("document.querySelector('[data-agent-answer] table')");
  // React 提交侧栏关闭后再滚动，避免会话切换的自动定位覆盖截图的顶部位置。
  // 等待真实 aria 状态与布局都更新，不把一次 click 返回当作渲染已经提交。
  // 延迟只为截图的绘制留出机会，功能断言仍读取后续真实 DOM。
  // 测试不改产品滚动 effect；用户的正常消息更新仍沿用已有行为。
  // 滚到顶端用于展示时间与用户气泡，后续尺寸用例不依赖这个滚动值。
  await run("document.querySelector('[data-agent-sessions-toggle]').click()"); await wait("document.querySelector('[data-agent-sessions-toggle]').getAttribute('aria-expanded')==='false'");
  await delay(100); await run("document.querySelector('[data-agent-scroll]').scrollTop=0"); await delay(100);
  await capture("conversation-light");
}
// 主入口只创建一扇隔离窗口，preload 使用正式 contextBridge 最小 API。
// offscreen 截图不抢占用户桌面焦点；取消节流让遮挡不会暂停消息消费。
// 上下文隔离与禁用 Node 集成保留产品边界，测试不能靠页面调用文件系统。
// sandbox=false 与当前 CommonJS preload 的生产约定一致。
// 先检查构建指纹，避免在旧 out 上运行得到误导性的解析失败。
// finally 只销毁本轮窗口，成功与失败统一交给 harness 退出码护栏。
// 窗口硬化仍接入公共 harness，SMOKE_OCCLUDE 等显式环境维度能正确识别。
// 没有真实可见窗口时，遮挡维度由 harness 按约定报告，不冒充真实遮挡。
// 本测试没有模型运行子进程，因此收尾不需要停止用户的 Python 或 ComfyUI。
// finish 接收 allPassed，任何一个非抛错断言失败仍能让最终退出码变红。
// 控制台打印的路径仅指本轮临时测试目录，不包含用户生成文件或账户文件。
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  win = new BrowserWindow({ ...windowChromeOptions(), show: false, width: 1280, height: 900, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  smoke.attachWebContents(win.webContents); const occlusion = await smoke.hardenWindow(win);
  // 新增布局断言与原 Markdown 回归在同一真实页面串行执行，不另外启动第二个窗口。
  // 先完成流式与复制，再验证会话切换，最后跑全部主题和宽度。
  // 每一步失败均保留非零退出，不用截图成功来覆盖功能断言的失败。
  // 先验证块内复制，再测整体布局；两者使用同一条真实渲染消息。
  // 新增块内操作不会改变 message 原文，原整条回复复制检查仍保留。
  try { await checkAnswer(); await checkCodeBlocks(); await checkConversationLayout(); await checkLayout(); console.log("MARKDOWN_SCREENSHOTS", root); }
  finally { occlusion.dispose(); win.destroy(); }
  smoke.finish({ app, ok: smoke.allPassed() });
}
// catch 包含页面初始化、解析与断言阶段的异常，不把挂载失败当成零项通过。
// error 交给 harness 写入失败摘要，最后的进程退出码由统一护栏决定。
// 临时截图保留用于人工复核，脚本不递归删除任何工作区或用户数据目录。
main().catch(error => { console.error(error); smoke.finish({ app, ok: false, error }); });

/**
 * UI-01 的真实 Electron 布局回归，不使用浏览器重绘的设计稿代替运行截图。
 * 目标是检查宿主、滚动归属、工程时间坐标和未接通能力边界。
 * 本脚本不测试 FFmpeg、媒体播放、项目保存或多轨合成。
 * 这些真实处理功能由旧版 legacy 工具的独立回归继续覆盖。
 * 只在临时浏览器目录与内存游客文档中执行，不读取用户真实设置。
 * 软件外壳、主题、preload、app:// 协议全部使用项目生产实现。
 * 冒烟像拿尺子量真正搭好的工作台，而不是核对源文件中写了哪些标签。
 * 几何量从 getBoundingClientRect 获取，工程坐标的期望值独立计算。
 * 同一轮只启动一个窗口，主题/尺寸和旧版入口检查顺序进行。
 * 所有等待均有主进程计时上限，隐藏窗口也不会因 rAF 暂停而卡住。
 * 构建指纹不一致时按环境前提失败退出，不能把旧产物截图当作新实现。
 * 日志和退出码继续归 smoke-harness 管理，断言失败不能被最后截图覆盖。
 */
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
// BrowserWindow 仅在测试主进程中使用，产品渲染组件不导入 Electron。
// nativeTheme 改动限于本测试进程，实际页面仍通过 themeSignals 响应主题变化。
// 截图使用 capturePage，得到 app:// 页面真实像素而非由测试拼一张图。
const { app, BrowserWindow, nativeTheme } = require("electron");
// 通道与结果注册复用生产契约，不给渲染层返回一套假成功数据格式。
// registerHandle 负责统一捕获异常，测试替身只提供隔离的本地读取结果。
// 不导入用户真实 JSON 存储模块，避免用例初始化时修改本机账户。
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
// 看门狗限定整个测试的时间，单步执行还有 createRun 的独立超时。
// 超时按失败报告，不能为了凑成功而重复重试整个套件。
// 运行日志自动追加至 logs/smoke-runs.log，截图目录在完成时另行打印。
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "video-editor-ui", timeoutMs: 90000 });
// 临时目录同时隔离浏览器缓存与截图，保留目录方便交付前检查实际像素。
// 不把截图写到用户图片或下载目录，也不覆盖原始视觉基准 PNG。
// 任务完成后需要的截图再复制进文档 runtime 子目录，不清理用户工作区。
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-video-ui01-"));
// 若测试失败，目录保留可定位失败时的页面与截图，不自动删除问题现场。
// 路径由操作系统临时目录生成，不能把用户提供的任意路径作为递归清理目标。
// 本脚本不使用 rm/remove-item，也不终止用户正在运行的 Electron 进程。
// 临时游客没有云端账户，ACCOUNT_ME 等远程能力不会被编辑器主动调用。
// AppShell 的全局下载中心读取空队列是前置夹具，不是视频素材为空。
// 这些全局请求不计为媒体操作，因为它们是外壳真实生命周期的一部分。
// 片段/素材状态与下载队列分开计数，避免把下载状态误报成导入执行。
// 实际截图包含全局空任务状态，这不是新编辑器创建的第二套状态中心。
// 不启用真实 GPU 推理，静态布局仍由 Electron 渲染器绘制。
// 软件渲染仅用于稳定自动化环境，不能据此声称真实系统缩放已验收。
// 专用 userData 防止与用户正在运行的应用共用缓存或争抢实例锁。
app.disableHardwareAcceleration(); app.setPath("userData", path.join(root, "browser"));
smoke.setWorkDir(root); smoke.installWatchdog(app);
// 协议和窗口通道使用真实入口，项目 UI 只有一套外壳与标题栏。
// 主题通道保持原值，不在 DOM 上直接加 .dark 类绕过应用主题机制。
// 生命周期由 main 的 finally 关闭测试窗口，正常失败也不会留下窗口。
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
require("../apps/electron/src/main/core/windows/window.handlers").registerWindowHandlers();
// 游客文档替身沿用已有 helper，保证权限边界不依赖真实账户令牌。
// 它允许本地工具页面水合，不代表已验证账户登录或云端请求成功。
// 其读写只在内存中，UI-01 演示数据不会因此被写进正式用户文档。
require("./lib/guest-session-fixture").installGuestDocumentFixture();
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => "");
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root);
registerHandle(C.CHANGELOG_READ, () => "");
registerHandle(C.MODELS_DOWNLOAD_LIST, () => ({ revision: 0, tasks: [] }));
// 原工具/GIF 在重新挂载外壳时会探测游客账户，返回真实未登录语义而非伪造账户。
// 此替身不发送网络请求，不生成令牌，也不影响新编辑器的零媒体调用判据。
// 401 结果由原权限边界接收，允许本地工具保留正常工作区。
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHENTICATED" } }));
// 主流程没有安装真实 FFmpeg handler，误调用只会落在计数替身中。
// 空状态回包仅支撑旧工具初始化，不能报告 FFmpeg 已找到或版本探测成功。
// 新编辑器应完全不触发该探测，先检查这一点再访问旧工具。
// 这项顺序约束防止 legacy 的正常查询污染新工作区“零查询”的判据。
// 如果未来 UI-01 仍未接入业务却开始探测，计数就会让用例明确失败。
// 导出替身不会创建输出路径，因此不会误覆盖用户本地生成视频。
// 空 FFmpeg 状态用于 legacy/GIF 初始页面挂载，不伪造可执行二进制。
// 新编辑器不应查询这个状态；后面的调用数断言检查其未接入业务服务。
// 导入与处理的替身只记录请求，若禁用按钮泄漏事件就会被断言发现。
let ffmpegQueries = 0, mediaOperations = 0, win;
const errors = [];
registerHandle(C.VIDEO_FFMPEG_STATUS, () => { ffmpegQueries += 1; return { ok: false }; });
// 这些通道存在于生产桥中，返回值只供检测意外调用，不产生媒体文件。
// 未接通状态必须在渲染层就禁用，不能靠测试拒绝处理后再显示假成功。
// 空素材回包不会修改项目，也没有取消真实用户任务的副作用。
for (const channel of [C.VIDEO_PICK_FILE, C.VIDEO_RUN, C.VIDEO_PICK_OUTPUT_FOLDER]) registerHandle(channel, () => { mediaOperations += 1; return null; });
// createRun 自带单步超时，调用侧不手工解释或屏蔽异常。
// wait 的节拍来自主进程计时器，窗口不可见仍可达到明确上限。
// 失败会进入 main().catch，再统一由 harness 输出非零退出码。
const run = smoke.createRun();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// 初次加载只等到所需 UI 出现，不固定等待数秒后假定页面已经水合。
// query 为当前用例的明确条件，其他区域加载速度不会影响断言含义。
// 100 次乘 50ms 给出 5 秒上限，超过时携带条件便于诊断。
// 这里不依赖 requestAnimationFrame，遮挡或后台时也能结束。
// 与 createRun 的单步超时组合，既防止页面无响应也防止条件永远不成立。
// 不捕获后继续执行截图，避免失败页面被标记为正常验收图。
async function wait(query) {
  // 单轮 expression 的执行由 createRun 截止，页面卡死时不会只卡在 for 循环里。
  // 条件返回 false 只继续到既定上限，不追加无限重试或刷新页面掩盖错误。
  // 抛出的条件帮助区分“控件没挂载”与“主题信号没有应用”。
  // 当前测试只用受控内部字符串，不把来自网络的文本插进执行表达式。
  // 此 helper 不负责业务恢复，产品异步取消与错误处理不在此模拟。
  for (let i = 0; i < 100; i += 1) { if (await run(`Boolean(${query})`)) return; await delay(50); }
  throw new Error(`UI-01 condition timed out: ${query}`);
}
// 尺寸是编辑器实际 host 的目标，不是只改变截图导出比例。
// 先读出外壳占用的真实宽高，再通过 CDP 改页面视口补足目标尺寸。
// 不读取旧导航宽度常量，收起侧栏后同一个方法仍会得到正确宿主宽度。
// deviceScaleFactor=1 仅是 CSS 几何测试，不冒充 Windows 的 125%/150% 设置。
// 真实系统缩放和临时面板交互仍留 UI-07，不扩大 UI-01 的验证声明。
// 尺寸改变后等待样式计算，读回实际宽高验证目标确实达到。
// target 使用整数，外壳包含小数像素时允许 1px 以内的舍入差异。
// 一次只改当前窗口，不重开多窗口并行抢夺测试或用户焦点。
async function sizeHost(width, height) {
  // main 有外框色带和内边框，不能直接令浏览器 viewport=1600 就称编辑器为1600。
  // 这里测量 current inset 后补偿，所以截图能同时保留导航并精确量到工作区。
  // height 同样扣除 head 和全局状态栏，而不是只看图片 PNG 的总高度。
  // 浮点 inset 四舍五入只影响 1px 内的误差，不允许整条 sidebar 的宽度误差。
  // 大容器宽度在 headless/offscreen 中不受显示器物理像素限制，但不是系统缩放测试。
  // 页面样式本身没有被测试注入宽度覆盖，仍按真实父容器布局。
  // 从移动导航跨回桌面导航时，首次设宽会改变外壳自身的占位。
  // 再量一次真实 inset 校准宿主，不把导航变化误判为编辑器宽度回归。
  // 两次有界测量覆盖断点收敛，不无限重试，也不修改产品 CSS 宽度。
  // 中间留主进程时间片让既有导航动画结束，不能只读上一帧的布局。
  // 最后的尺寸断言仍只有一次，校准失败不会被前一轮结果冲掉。
  // 这一处理只属于测试尺子的标定，默认窗口和系统缩放行为不变。
  for (let pass = 0; pass < 2; pass += 1) {
    const inset = await run("(()=>{const r=document.querySelector('[data-video-editor-ui]').getBoundingClientRect();return {width:innerWidth-r.width,height:innerHeight-r.height}})()");
    await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: Math.round(width + inset.width), height: Math.round(height + inset.height), deviceScaleFactor: 1, mobile: false });
    await delay(350);
  }
  smoke.check(`Editor host reaches ${width}x${height}`, await run(`(()=>{const r=document.querySelector('[data-video-editor-ui]').getBoundingClientRect();return Math.abs(r.width-${width})<=1&&Math.abs(r.height-${height})<=1})()`));
}
// 只保存真实窗口图像，不添加编号或后期裁图掩盖边界问题。
// 截图包括应用导航、标题栏和全局底部状态，便于人工检查没有重复外壳。
// 画面和缩略图都需完成解码，缺图不能以“稍后会加载”跳过视觉验证。
// complete/naturalWidth 同时检查，加载失败的图片不能因 complete=true 而误过。
// 每个图名包含主题和宿主尺寸，后续文档不会把窄容器误当作整窗口尺寸。
// 图片从打包静态资源加载，不访问设计图所在的原始 file:// 地址。
async function shot(name) {
  // 检查全部图片解码能同时发现节目画面成功但素材封面路径丢失的情况。
  // 音频波形是 SVG，不列入 img 解码集合，也不被误报成缺图。
  // 文件写入完成后才进入下一尺寸，避免同名截图被尚未完成的异步保存覆盖。
  // 后续人工查看应关注文字可读、区域留边和滚动条，不只判断文件是否生成。
  // 原图资料未被改变，运行图另存文件，便于将设计证据与运行证据分开。
  await wait("[...document.querySelectorAll('[data-video-editor-ui] img')].every(img=>img.complete&&img.naturalWidth>0)");
  // DOM 条件完成不代表合成器已提交最新一帧，尤其是主题浮层刚卸载时。
  // 额外留出一次有上限的主进程绘制间隔，避免 capturePage 取得上一帧的弹层。
  // 此处不依赖后台窗口可能暂停的 rAF，也不修改产品动画时长来迁就截图。
  await delay(200);
  fs.writeFileSync(path.join(root, `${name}.png`), (await win.webContents.capturePage()).toPNG());
}
// 骨架的关键不变量是区域填满宿主、没有意外横向外溢，滚动只发生在指定内容区。
// 这里核对实际 CSS 与 DOM 几何，不仅比较 R01–R10 标签是否存在。
// 时间轴最小宽度允许内部横滚，因此不能将 scrollWidth>clientWidth 一律当作缺陷。
// 先比较 host/workspace，再比较 timelineScroll 内的内容，明确两层职责。
// 素材/属性在窄容器收起属于本轮骨架安全策略，完整临时面板仍待 UI-07。
// 固定项目栏和信息条必须在工作区内，预览不能把 footer 挤到视口外。
// R05 高度至少 8px，未来接入拖动不必改变上区或轨道的布局边界。
// 不用全局 overflow:hidden 掩盖超出量，而是读取 workspace 的真实 scrollWidth。
async function checkLayout(label) {
  // 外壳唯一性同时核对标题栏与 caption controls，避免只数 AppShell 漏掉内部复制按钮。
  // main 的真实 padding 由独立 GIF 用例对照，不能因本页好看就认为共享框架没回归。
  // 几何断言把 footer.bottom 与 host.bottom 比较，发现内部 flex 超高而非隐藏裁切。
  // separator 高度是独立布局槽，不是一个 absolute 抓手覆盖在预览底部。
  // 三个 scroll 容器通过计算样式核对，不能只依赖 class 名称声称已有滚动。
  // 隐藏的窄屏面板即使测不到宽度，仍需保持既定滚动契约供后续恢复显示。
  smoke.check(`${label}: single shell and no duplicate window controls`, await run("document.querySelectorAll('[data-app-shell]').length===1&&document.querySelectorAll('[data-window-titlebar]').length===1&&document.querySelectorAll('[data-window-controls]').length===1&&!document.querySelector('[data-video-editor-ui] [data-window-controls]')"));
  smoke.check(`${label}: regions fit the workspace and retain an 8px separator`, await run("(()=>{const h=document.querySelector('[data-video-editor-ui]'),r=h.getBoundingClientRect(),w=h.firstElementChild,s=h.querySelector('[data-editor-region=R05]').getBoundingClientRect(),f=h.querySelector('[data-editor-region=R10]').getBoundingClientRect();return w.scrollWidth<=h.clientWidth+1&&Math.abs(f.bottom-r.bottom)<1&&s.height>=8&&h.scrollHeight<=h.clientHeight+1})()"));
  // UI-03 将 ul 放在共用结果滚动槽中，空态与列表才能有相同的高度边界。
  // 定位真正的结果槽，继续检查计算样式，不把内部 ul 无滚动误报为产品错误。
  // 属性和时间轴的原滚动判据保持，不因素材 DOM 调整而豁免其他区域。
  smoke.check(`${label}: media/property/timeline own their scroll areas`, await run("(()=>{const list=document.querySelector('[data-editor-region=R02] [data-editor-media-results]'),body=document.querySelector('[data-editor-region=R04] > div:last-child'),timeline=document.querySelector('[data-editor-timeline] > div');return [list,body,timeline].every(el=>getComputedStyle(el).overflowY==='auto')})()"));
}
// 时间期望根据任务文档独立给出，不能从生产 DEMO_CLIPS 导入后自我验证。
// 片段宽度检查由页面真实布局给出，确认 8–10、18–20 秒空隙没有被 flex 均分。
// 播放头按 R07 内容列宽计算，排除轨道头和应用 nav 的宽度。
// 0–8 与 10–18 两视频等宽，是发现参考图错误比例的简单反证。
// 只检查静态位置，不因此宣称已经实现真实滚动缩放与吸附修剪。
// 横向滚动后再次核对，能发现刻度单独固定在视口而片段移动的错误。
// 播放头叠层必须不截获事件，为后续片段选择保留命中路径。
// 该判据不依赖 CSS 类名，模块样式哈希变化不会让用例失效。
async function checkCoordinates() {
  // 误把播放头相对整条时间轴定位会偏移一个轨道头宽度，本判据可以直接抓到。
  // 误用 8 秒素材总长计算 left，会让选中片段超过 100%，五段检查也会失败。
  // 比较 left 和 width 两个维度，避免只是 end 对齐而 start 错误的偶然通过。
  // 每段都允许不到 1px 的布局舍入，不能以“差不多”放过明显空隙丢失。
  // 歌曲全宽与背景图末端共同检查 30 秒终点，防止右侧多画一段假时间。
  // 音频轨的竖向对齐由共用 grid 和区域滚动判据保证，不在这里假测声音同步。
  const result = await run("(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect(),r=rect('[data-editor-region=R07]'),p=rect('[data-editor-playhead] i');const rows=[['clip-01',0,8],['clip-02',10,18],['clip-bg',20,30],['clip-voice',10,16],['clip-music',0,30]];return {ok:rows.every(([id,a,b])=>{const c=rect('[data-editor-clip='+id+']');return Math.abs(c.left-r.left-r.width*a/30)<1&&Math.abs(c.width-r.width*(b-a)/30)<1}),playhead:Math.abs(p.left-r.left-r.width*.4)<1,pointer:getComputedStyle(document.querySelector('[data-editor-playhead]')).pointerEvents}})()");
  smoke.check("All five demo clips use exact project coordinates and real gaps", result.ok);
  smoke.check("12s playhead starts at 40% of content width and does not intercept clicks", result.playhead && result.pointer === "none");
}
// 禁用操作在真实 DOM 上调用 click，确认没有向文件选择/处理通道泄漏请求。
// 原生 disabled 的语义不能被仅有透明度样式替代。
// 没有 video/audio 元素，节目图片不能被误认为已实现解码或播放。
// 真实导航链接不在操作禁用断言中，它们应保持可用。
// 输入与 range 同样禁用，不能放空事件处理器伪装为可编辑属性。
// 全程不提交媒体生成任务、不请求云端账户、不执行导出。
// 底层 ffmpegQueries 必须为零，证明新工作区没有偷偷挂载旧编辑器服务。
// 后续检查 legacy/GIF 会查询状态，因此此项安排在离开新编辑器之前执行。
async function checkDisabled() {
  // 元素数量下限防止渲染器丢掉整套控件后 every(empty) 仍返回 true。
  // UI-03 搜索与分类是可用纯 UI；其余属性输入和业务按钮仍原生禁用。
  // 调用 disabled 元素 click 不应触发事件，是原生浏览器行为的实际边界检查。
  // 链接未纳入禁用集合，仍在后续使用原版入口进行真实页面导航。
  // 不断言颜色值代表禁用，因为不同主题或配色会改变视觉透明度。
  // 零媒体操作是可观测副作用边界，不是通过源码查找“没有调用”推断。
  const disabled = await run("(()=>{const host=document.querySelector('[data-video-editor-ui]'),els=[...host.querySelectorAll('button[data-editor-action]:not([aria-pressed]):not([aria-expanded]),input:not([type=search]):not([data-timeline-zoom])')].filter(el=>!el.closest('[data-timeline-view-controls]'));els.forEach(el=>el.click());return els.length>20&&els.every(el=>el.disabled)&&!host.querySelector('video,audio')})()");
  smoke.check("Unconnected controls are natively disabled and do not execute media operations", disabled && mediaOperations === 0 && ffmpegQueries === 0);
}
// 尺寸循环复用同一工作区实例，避免每个尺寸重新挂载掩盖状态或几何问题。
// 1600x1000 三栏、1280x800 三栏边界、960x720 单预览分别截图。
// 边界 1280 不应提前收起属性；960 则不应残留素材空栏。
// 截图名称沿用目标 host 尺寸，真实窗口还包括导航与标题栏。
// 只有这些基础收缩状态进入 UI-01 验证，临时面板开合不在本阶段实现。
// 每次截图前都执行几何断言，防止截出一张被全局滚动条裁掉的表面。
// 几何失败仍由 harness 累计，后续截图通过不能覆盖先前断言失败。
// 样例内容不依赖网络请求，尺寸间切换不会改变任何真实媒体文件。
async function checkSizes() {
  // 每次都从父宿主读回宽高，防止 CDP 尺寸覆盖失败却重复检查上次尺寸。
  // 1600 对应参考原图附近的宽屏，三栏比例与控件密度可以人工对照。
  // 1280 检查严格边界，不用 1279 与 >=1280 两种策略混在一起。
  // 960 小于素材收起点，预览应真正扩展到上区全宽，而不是留一整列空洞。
  // 所有尺寸使用同一批五段媒体，不能为窄屏删片段规避横向滚动问题。
  // 截图前后没有播放计时器，播放头保持12秒，便于逐图量同一位置。
  for (const [width, height] of [[1600, 1000], [1280, 800], [960, 720]]) {
    await sizeHost(width, height); await checkLayout(String(width)); await checkCoordinates();
    smoke.check(`${width}: expected upper panels are visible`, await run(`(()=>{const visible=s=>document.querySelector(s).getBoundingClientRect().width>0;return visible('[data-editor-region=R02]')===${width >= 1040}&&visible('[data-editor-region=R04]')===${width >= 1280}})()`));
    // 再缩到 800px，实际横向滚动后测刻度/片段/播放头，验证它们没有分属两个坐标层。
    // 滚动值直接改变浏览器视口，不改素材的 start/end，也不伪造时间换算结果。
    // 完成后恢复起点再截图，便于人工从 0 秒位置对照原图空隙。
    // 960px 可容纳 176+720 的内容，因此先用 800px 才能验证 scrollLeft 真正生效。
    // 滚动测试只针对时间轴，项目栏和上区不应产生相同水平位移。
    // DOM 内容仍是同五个片段，不能为通过坐标检查重新生成另一条时间线。
    if (width === 960) {
      await sizeHost(800, 720);
      await run("document.querySelector('[data-editor-timeline] > div').scrollLeft=80"); await delay(60);
      smoke.check("Narrow timeline genuinely scrolls horizontally", await run("document.querySelector('[data-editor-timeline] > div').scrollLeft>0"));
      await checkCoordinates(); await run("document.querySelector('[data-editor-timeline] > div').scrollLeft=0");
      await sizeHost(width, height);
    }
    await shot(`ui-01-light-${width}`);
  }
}
// 宿主导航是当前任务明确保留的能力，必须使用真实开关而不是手改 CSS 变量。
// 身份引用验证只是分配可用空间，没有卸载后重建预览或复制编辑器。
// 侧栏动画有短暂过程，等待它稳定后再比较宽度，不截图转场中间帧。
// 两次点击恢复原布局，不改变用户真实配置，因为 settings 夹具只在内存。
// 这个检查不覆盖全站导航功能，只证明新工具宿主没有挡住 head 的导航开关。
// 预览与轨道样例不能因可用宽度变化而丢失，坐标判据继续使用同一组件。
// 不减固定 158.75 或 68px，只核对真实测量到的宽度确实发生变化。
// 主题测试安排其后，因此导航开合不会被深色动效遮挡影响判断。
// 引用临时挂到测试页面 window 上，不写全局 Zustand 或生产状态字段。
// 页面离开后引用随测试窗口释放，不在用户应用留下调试对象。
// DOM 标记来自现有 AppShell，未给产品导航增加只为此用例服务的新接口。
async function checkNavigation() {
  const before = await run("window.__navigationIdentity=document.querySelector('[data-video-editor-ui]');window.__navigationIdentity.getBoundingClientRect().width");
  await run("document.querySelector('[data-sidebar-toggle]').click()"); await delay(450);
  smoke.check("Existing navigation resizes the same editor instance", await run(`document.querySelector('[data-video-editor-ui]')===window.__navigationIdentity&&Math.abs(window.__navigationIdentity.getBoundingClientRect().width-${before})>40`));
  await run("document.querySelector('[data-sidebar-toggle]').click()"); await delay(450);
}
// 主题通过现有外观菜单真实切换，页面必须经 themeSignals 同步 data-theme 和媒体查询。
// 同一 DOM 不卸载，theme 不能换成另一套写死的深色编辑器页面。
// 节目图片 src 不应被加滤镜或替换，图像颜色不属于面板主题。
// 不在测试里直接改 root 的 CSS 自定义属性绕过 themeSignals。
// 窗口不可见仍可收到主题决议，wait 有明确上限。
// 后续旧版/GIF 宿主检查沿用深色，验证共享外壳在主题切换后仍能正常挂载。
async function checkTheme() {
  // 初始游客偏好是显式 light，直接改 nativeTheme 不会改 preference 观测信号。
  // 所以通过外观菜单选择 dark 才符合真实用户路径，不能在 DOM 伪造 data-theme。
  // 等待 theme-ripple 完成，截图不会恰好截到主题过渡的半浅半深状态。
  // 同时核对 matchMedia，避免属性信号变了但实际 CSS 仍按浅色绘制。
  // 关闭外观弹层再截图，免得弹层遮住预览而无法确认区域边界。
  // 使用身份引用核对同一 DOM，不能用内容相似的另一套深色页面蒙混通过。
  await sizeHost(1600, 1000);
  await run("window.__editorIdentity=document.querySelector('[data-video-editor-ui]')");
  await run("document.querySelector('[data-theme-trigger]').click()");
  await wait("document.querySelector('[data-theme-option=dark]')");
  await run("document.querySelector('[data-theme-option=dark]').click()");
  await wait("document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('theme-ripple')&&matchMedia('(prefers-color-scheme: dark)').matches");
  smoke.check("Dark theme retains the same workspace and unfiltered preview", await run("document.querySelector('[data-video-editor-ui]')===window.__editorIdentity&&getComputedStyle(document.querySelector('[data-editor-region=R03] img')).filter==='none'"));
  // 外观菜单常驻到用户主动关闭，使用其真实开关并等待卸载后才拍无遮挡运行图。
  // document 上合成 Escape 不代表焦点所在弹层已接到按键，不能据此假定关闭成功。
  // 明确断言弹层退出，保证截图能看清节目画面与全部区域边界。
  await run("document.querySelector('[data-theme-trigger]').click()");
  await wait("!document.getElementById('appearance-popover')");
  await shot("ui-01-dark-1600");
}
// 新页面通过真实链接进入 legacy，验证原组件未被演示视图替换或删掉。
// 随后直接访问 GIF 路由，检查 ToolPageFrame 默认模式仍有返回栏和内容滚动。
// 不把 GIF 的实际导出能力交给这个空 FFmpeg 夹具验证；现有专项另行执行。
// 路由切换只在本隔离窗口，用户正在使用的工作区和导出任务不受影响。
// 检查旧工具导入入口仍存在，不要求它在未配置 FFmpeg 的情况下虚假成功。
// 页面离开后新编辑器 DOM 必须卸载，不能留隐藏预览或重复导航。
async function checkOtherHosts() {
  // legacy 链接由新页面真实提供，不是测试自己拼一个从未暴露给用户的页面。
  // pathname 条件确认导航完成，不在旧页面尚未卸载时抢先作断言。
  // 默认 frame 的返回链接在新 workspace 中被项目栏替代，两者应该互斥。
  // GIF 的父层 padding 必须大于零，验证新路由专用 CSS 没有泄漏到普通工具。
  // 仅初始挂载正常不能证明 GIF 导出通过，完整导出仍需另跑真实 ffmpeg 用例。
  // 两次导航不会启动第二个 AppShell，真实 tools/layout 的宿主继续复用。
  await run("document.querySelector('a[href=\"/tools/video/editor/legacy\"]').click()");
  await wait("document.querySelector('[data-tools]')&&!document.querySelector('[data-tool-workspace]')&&location.pathname.endsWith('/legacy')");
  // 路由先装好公共外框、随后才完成业务渲染；等待真实导入文案后再核对旧能力。
  // 不用固定睡眠，也不只等data-tools存在就把尚未加载的内容误判为丢失。
  // 超时仍为失败，不能凭一次重试偶然加载完成掩盖业务入口真的缺失。
  await wait("document.body.textContent.includes('点击添加视频片段')");
  smoke.check("Legacy tool keeps the ordinary frame and original import UI", await run("document.querySelector('[data-tools] a[href=\"/tools\"]')&&document.body.textContent.includes('点击添加视频片段')"));
  await win.loadURL("app://app/tools/video/gif"); await wait("document.querySelector('[data-tools] a[href=\"/tools\"]')");
  smoke.check("GIF retains its original scrollable host without editor-only padding override", await run("!document.querySelector('[data-tool-workspace]')&&getComputedStyle(document.querySelector('[data-tools] > div > div:last-child')).overflowY==='auto'&&parseFloat(getComputedStyle(document.querySelector('[data-app-main] > div')).paddingLeft)>0"));
}
// 主流程只管创建窗口、装配真实桥接和按顺序运行用例。
// 所有业务数据替身在窗口加载前准备，避免首帧因缺 IPC 误跳登录页。
// build freshness 使用真实 app 路径，旧导出不能靠源码类型检查蒙混过关。
// 自定义 head 参数与生产窗口一致，保证窗口按钮不会在截图中缺失。
// backgroundThrottling:false 遵守项目后台生命周期要求，不代表已测遮挡维度。
// offscreen 隐藏窗口不会遮挡或抢占用户应用。
// debug 通道只用于视口几何设置，不把组件内部回调作为测试入口。
// 用户关闭应用不属于本测试流程；finally 仅销毁本轮 win。
// 控制台记录渲染错误，最终拒绝 hydration 或 React 状态异常。
// 截图目录保留供人工复核，失败也不会删除问题现场。
// 一旦抛错会进入最外层 catch，经 harness 退出并写清失败原因。
// 验收后的 runtime 图片属于文档交付，不修改安装器或执行发布。
// 工作区回归与窗口生命周期分开，便于确认错误发生在哪个阶段。
// 尺寸和坐标先验收原工程，不能被样板路由的另一份 DOM 替代。
// 原禁用检查只管未接通业务，UI-03 允许的输入另由素材组验证。
// 导航和主题沿用 AppShell 入口，组件样板不复制全局外壳。
// 两组样板共用上下文参数，但各自组件 state 仍归页面实例。
// 上下文只包含测试窗口与有限等待器，不暴露产品 store 写入口。
// controls 先运行，保留 UI-02 的全部字段与折叠回归。
// media 后运行，从其返回的默认工程继续验收 R02。
// 零业务计数放在两个 helper 之后，覆盖整个选择和场景切换过程。
// legacy/GIF 在此函数返回之后再跑，其正常初始化不应污染零媒体判据。
// 函数只安排验证，不负责创建或销毁 Electron 窗口。
// 若某个等待失败，异常向 main 的 finally 传播并关闭本测试窗口。
// 不捕获后继续截图，以免缺少素材页时误截其他路由。
// 单个断言的失败由 harness 累计，后续状态正常不能覆盖失败码。
// helper 返回不表示用户工程已保存，演示状态离开页面即释放。
// sizeHost 是测量工具而非业务命令，只设置隔离窗口的调试视口。
// 截图根目录与等待函数同源，两个 helper 不创建自己的独立运行环境。
// UI-01 原坐标期望保持，不因为 UI-03 新增搜索而调整片段位置。
// 新任务仅拓展素材区的检查，不改变节目或属性的功能验收状态。
// 所有步骤串行，遵守一次一个 Electron 冒烟的运行边界。
// 即使两个 helper 引用同一个资源常量，A/B 的独立状态仍须运行验证。
// 此处不使用 Promise.all，避免同时跳转不同样板路由互相覆盖。
// 检查顺序反映宿主、共享控件、素材面板三个不同责任层。
// 任何一层失败都会保留当前截图目录，便于人工回看现场。
async function checkWorkspace() {
  // ffmpegQueries 也必须为零，因为后台探测即使不生成文件也越过本轮边界。
  // mediaOperations 由注册的业务通道累计，能发现按钮禁用但另有副作用的情况。
  // 计数从初次加载开始，搜索每次输入导致的后台请求也会被捕获。
  // 此处不重置计数器，避免样板导航把前一阶段的违规调用擦掉。
  // 新素材区没有 video/audio 元素，原禁用组同时检查这一播放边界。
  // 无后端调用只证明本次纯 UI 边界成立，不代表真实素材导入已经实现。
  // 原工具的初始化将在后面单独运行，不把其合法行为算成素材区回归。
  // 退出时继续汇总 renderer errors，零业务计数不能抵消 React 渲染错误。
  await checkSizes(); await checkDisabled(); await checkNavigation(); await checkTheme();
  const context = { run, wait, delay, smoke, win, root, sizeHost };
  await require("./lib/check-video-ui-controls").checkVideoUiControls(context);
  await require("./lib/check-video-ui-media").checkVideoUiMedia(context);
  // UI-04 共用同一隔离窗口，验收片段参数映射而不提前启用主时间轴交互。
  // 零业务计数仍在预览回归后检查，任何误播放或导出都会留下调用证据。
  // 主题、窄窗口与样板路由顺序运行，不增加并行 Electron 进程。
  await require("./lib/check-video-ui-preview").checkVideoUiPreview(context);
  await require("./lib/check-video-ui-inspector").checkVideoUiInspector(context);
  // 属性helper与布局helper都复用当前context，不能各自启动窗口导致截图数据来源不同。
  // 属性页结束时停在samples，布局helper显式返回project后再检查三尺寸。
  // 这段路由变化是公开演示导航，不是用私有状态接口重置失败场景。
  // 布局检查包含主题矩阵，随后legacy/GIF验证同一公共外壳没有被局部CSS污染。
  // 零媒体计数在所有helper后才断言，样板任何误导入都会被累计发现。
  // 原samples只有静态资源，未来真实业务要另走LIVE测试，不可在此回包假探测。
  // 运行长一点不等于可以无限等待，主harness的90秒上限仍覆盖全部子阶段。
  // 每个helper内部条件也有单步上限，页面失联和状态未满足能区分报告。
  // 未接通动作的disabled检查排除了真实布局入口和时间轴视口控制。
  // 这些排除依据功能语义标记，不是遇到可点击按钮就一律忽略。
  // 文件、切刀和导出仍在原禁用集合，纯UI开放不能顺便启用媒体业务。
  // 公共EditorFloatField的漫画doubleClick兼容另有原工具回归，不能只看属性样板通过。
  // 本轮最多推进到UI-07，主套件通过不意味着UI-08人工整体验收自动完成。
  // 故文档状态要同时保留人工操作与系统缩放未验证项。
  // 截图归档使用本轮最终静态指纹，不引用前面旧构建产物冒充最新结果。
  await require("./lib/check-video-ui-workspace").checkVideoUiWorkspace(context);
  smoke.check("Media UI interactions never import, probe or play real files", mediaOperations === 0 && ffmpegQueries === 0);
}
// 专项与全量共享当前窗口、产物指纹和错误收集，只改变待检查的公开样板入口。
// 运行范围在这里选择，窗口生命周期与最终退出仍由main负责。
// 属性专项结束在samples页，需要回到project页才能找到legacy/GIF链接。
// 返回公开路由是恢复测试前提，不用隐藏DOM或注入链接来伪造旧宿主入口。
// 全量已经经过同一工程页，不额外重载，以免清掉需要观察的布局状态。
// inspector-only不跳过最终渲染错误检查，也不创建另一套Electron实例。
// 发生异常直接交给main的finally与外层catch，不能把专项失败吞成通过。
// 这层不重置计数器，两个执行分支使用同一个harness累计结果。
async function checkRequestedWorkspace() {
  if (!process.argv.includes("--inspector-only")) { await checkWorkspace(); return; }
  await require("./lib/check-video-ui-inspector").checkVideoUiInspector({ run, wait, delay, smoke, win, root, sizeHost });
  await win.loadURL("app://app/tools/video/editor/samples/project");
  await wait("document.querySelector('[data-video-editor-ui]')");
}
async function main() {
  // 创建窗口后挂载 chrome 事件，窗口最大化状态仍通过生产桥查询。
  // app.whenReady 之前已注册协议，Next 资源在静态导出中正常同源加载。
  // 不使用 file:// 加载 HTML，避免静态资源的 /_next 路径被解析到磁盘根目录。
  // 更新公告通过现有按钮关闭，不用全局 CSS 隐藏真实对话框。
  // 所有截图在公告退出后拍摄，布局不会被首次使用弹窗遮挡。
  // 捕获全部 console error 是严格检查，预期夹具缺口必须明确修好再通过。
  // finally 无论成功失败只销毁当前 win，不去枚举终止用户所有 electron.exe。
  // 窗口销毁后输出截图目录，harness 根据累计断言决定最终退出状态。
  // 若初始化在 win 赋值前就失败，外层 catch 仍可报告，不能访问 undefined.destroy。
  // 90秒看门狗比单个条件上限更长，正常慢截图不会无期限占用会话。
  // 本脚本不实现截图像素自动相似度打分，最终视觉仍由实际图片人工检查。
  // 完成仅表示 UI-01 布局通过，不将 UI-02–08 文档状态批量改为完成。
  await app.whenReady(); smoke.assertBuildFresh({ app }); nativeTheme.themeSource = "light";
  const chrome = require("../apps/electron/src/main/core/windows/window-chrome");
  win = new BrowserWindow({ ...chrome.windowChromeOptions(), show: false, width: 1775, height: 1095, webPreferences: { additionalArguments: chrome.windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  chrome.registerWindowChrome(win); smoke.attachWebContents(win.webContents); win.webContents.debugger.attach("1.3");
  win.webContents.on("console-message", (event) => { if (event.level === "error") errors.push(event.message); });
  try {
    await win.loadURL("app://app/tools/video/editor/samples/project"); await wait("document.querySelector('[data-video-editor-ui]')");
    await wait("document.querySelector('[aria-labelledby=update-announcement-title]')");
    await run("document.querySelector('[aria-labelledby=update-announcement-title] button').click()");
    await wait("!document.querySelector('[aria-labelledby=update-announcement-title]')");
    // UI-01 的几何回归继续先跑，公共控件提取不能改变三栏比例或工程坐标。
    // 业务禁用判据只针对未接通动作，素材高亮与分组开合属于合法纯 UI。
    // 样板测试安排在深色主题检查后，复用同一窗口再切回浅色对照。
    // legacy/GIF 放在最后，避免它们正常的 FFmpeg 初始化污染零媒体调用判据。
    // 截图和交互同源于静态导出，构建指纹不一致时应在开始阶段拒绝运行。
    // 新 helper 返回后还要检查渲染错误，不能只根据各按钮最终状态判成功。
    // helper 没有启动第二个 Electron 进程，符合单次冒烟的串行要求。
    // 样板离开后必须卸载，不能依靠永久隐藏实例保存临时演示状态。
    // UI-02 只验证组件级交互，不把 UI-03–UI-08 的业务范围提前标为完成。
    // 若默认编辑器选择发生变化，样板隔离断言应失败而非更新期望去迁就。
    // 共享样式作用到正式区和两个样板，是此次复用的实际调用证据。
    // 旧版与 GIF 的宿主检查只证明框架兼容，不冒充真实导出结果验证。
    // 素材回归共用当前隔离窗口，继续检查原项目而不启动并行 Electron 冒烟。
    // 新增可用控件必须仍保持零媒体操作，不能只检查最终高亮看起来正确。
    // helper 内的场景切换是显式夹具，真实导入与探测替身计数仍由外层判读。
    // 属性专项复用当前窗口；仅跳过旧静态断言，不跳过指纹与渲染错误检查。
    await checkRequestedWorkspace();
    await checkOtherHosts();
    smoke.check("No hydration or renderer errors", errors.length === 0, errors.join(" | "));
  } finally { win.destroy(); }
  console.log("VIDEO_EDITOR_UI_SCREENSHOTS", root); smoke.finish({ app, ok: smoke.allPassed() });
}
// finally 已清理创建成功的窗口；若初始化提前失败，最外层同样终结测试并报告失败。
// 不直接退出应用而丢弃已有失败码，统一 finish 保存日志和退出结果。
// 错误只写本地诊断，不向产品界面注入假错误弹窗掩盖测试失败。
main().catch((error) => { console.error(error); if (win && !win.isDestroyed()) win.destroy(); smoke.finish({ app, ok: false, error }); });

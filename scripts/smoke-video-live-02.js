/** LIVE-02：真实Electron正式入口、真实本地视频与生产ffprobe的入轨回归。 */
// 文件选择器返回由本进程夹具提供；不是人工操作系统选择框的证据。
// 视频字节、封面、元数据、源播放、DOM和Chromium拖动均来自真实运行。
// 内部拖动优先用CDP截获浏览器自身生成的载荷，不调用React私有闭包。
// 伪造载荷另作负向用例，不把合成DataTransfer称作资源管理器操作。
// 单次只创建隔离窗口，不关闭用户客户端，也不占用系统鼠标。
// 验证对象是正式路由的静态导出，不是组件在测试框架中的替身渲染。
// 应用协议由生产模块注册，资源地址与实际安装后的加载方式一致。
// preload使用生产文件，渲染层调用的接口没有由测试脚本重新实现。
// 文件选择框是唯一被替换的系统入口，替换返回路径而不替换探测结果。
// 探测、封面和源播放均处理磁盘上的实际编码文件，不使用固定元数据。
// 两个测试视频由FFmpeg临时生成，避免读取或公布用户私人视频。
// 横屏样本为640×360、30fps、有AAC音轨，用来对照视频主路径。
// 竖屏样本为360×640、24fps、无音轨，用来发现源参数串用。
// 二者时长非整数帧边界，能够覆盖源时长与工程占位取整的差别。
// 同一源两次入轨是身份反例，单纯两个不同文件无法发现assetId误作clipId。
// 视频移动限定V1，分离音轨限定自身音轨，拒绝用例必须真的经过另一轨。
// 选中反例先选另一素材再点片段，才能发现列表选择被反向覆盖。
// 位置断言读取公开DOM中的工程秒数，不用封面大小猜测是否移动成功。
// 时间线轮廓在松手前截图，能确认草稿确实存在而非只看最终位置。
// 取消测试比较整份片段快照，数量不变也可能发生错误位置写入。
// 重叠测试保留同源第二实例，能发现碰撞逻辑错误地排除了同assetId。
// 键盘事件明确走公开DOM回调，不调用Hook私有函数来制造成功。
// 原生鼠标拖动先由Chromium生成dragstart，载荷取生产处理器真实写入内容。
// 离屏拦截取消后的边界场景使用DOM事件，与前述证据分开描述。
// 外部文件用CDP传真实路径，由Chromium形成File再走getPathForFile。
// 这个外部载荷验证不能等同于资源管理器的OLE系统拖入。
// 脚本不抢用户鼠标、不显示置顶窗口，适合当前桌面不能腾出的限制。
// 截图来自capturePage实际输出，没有用HTML重画一份验收图。
// 整个运行只创建一个Electron窗口，遵守本项目串行冒烟规则。
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawnSync } = require("node:child_process");
const { app, BrowserWindow, nativeTheme, dialog } = require("electron");
const { createSmokeHarness } = require("./lib/smoke-harness");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { resolveTools } = require("../apps/electron/src/main/modules/ffmpeg/locate");
const chrome = require("../apps/electron/src/main/core/windows/window-chrome");
// 外层看门狗限制全场景最长时间，不能因为某个IPC永不返回而一直挂起。
// 页面求值使用harness的单步超时，日志能定位到最后完成的断言。
// 条件等待用主进程计时，不依赖离屏窗口是否调度requestAnimationFrame。
// 结果由累计check决定，不能以最后一次截图成功覆盖前面的断言失败。
// 失败和超时必须保留非零退出码，不通过app.quit丢弃process.exitCode。
// 工作目录保留样本与失败截图，便于复查是否发生了真实文件导入。
// 该目录使用随机后缀，连续运行不会误读上一轮缓存或素材身份。
// 独立userData隔离登录和偏好，不把测试片段写入用户的数据文件。
// 软件绘制只改变本进程截图后端，不改变正式客户端的硬件加速配置。
// registerHandle沿用生产IpcResult包装，不能为测试让渲染拿到另一种返回契约。
// 游客夹具只提供进入页面所需身份，不授予任意文件或Node能力。
// 无关服务返回最小空值，避免网络账号、更新和下载状态污染媒体断言。
// 真实video:probe注册仍来自生产ffmpeg模块，不能返回手写尺寸和时长。
// showOpenDialog夹具根据selection提供取消或路径，按钮点击仍触发生产流程。
// selection在每次导入前更新，重复导入与取消都经过同一个按钮入口。
// 测试不需要网络即可完成，避免把外部服务延迟误当作时间线性能问题。
const smoke = createSmokeHarness({ name: "video-live-02", timeoutMs: 180000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-video-live02-"));
let win, selection = [], dragData = null, dragSource = "", domDrag = false;
const rendererErrors = [];
const run = smoke.createRun(), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.setPath("userData", path.join(root, "browser")); app.disableHardwareAcceleration();
smoke.setWorkDir(root); smoke.installConsoleTee(); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
require("../apps/electron/src/main/core/windows/window.handlers").registerWindowHandlers();
require("./lib/guest-session-fixture").installGuestDocumentFixture();
for (const [channel, result] of [[C.USER_DATA_GET_DEFAULT_PATH, ""], [C.PATHS_GET_DEFAULT_OUTPUT, root], [C.CHANGELOG_READ, ""], [C.MODELS_DOWNLOAD_LIST, { revision: 0, tasks: [] }]]) registerHandle(channel, () => result);
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHENTICATED" } }));
dialog.showOpenDialog = async () => ({ canceled: !selection.length, filePaths: selection });
require("../apps/electron/src/main/modules/ffmpeg").registerVideoToolIpc();

// 等待依据真实状态，截止时间由主进程驱动，后台窗口也不会永久挂起。
// 真实媒体慢于固定延时的场景由条件接住，不用睡够几秒当成功。
// query只用于观察状态，不允许在循环里重复点击按钮或重复提交命令。
// 每轮Boolean转换能容纳DOM节点或布尔表达式，不依赖某个固定文本对象。
// 截止时间来自主进程Date.now，页面没有绘制帧也能结束条件等待。
// 轮询间隔70ms减少忙等，但不会用固定睡眠时长代替状态判定。
// 探测慢时允许在截止前自然完成，不能把第一轮未就绪直接当失败。
// 到期抛错携带实际条件，失败报告能说明在等哪一个UI状态。
// 异步求值本身仍受createRun限制，条件超时与页面卡死不是同一类失败。
// 默认18秒用于本地小视频，不承诺支持任意磁盘或超大文件探测耗时。
// 自动滚动用例传更短窗口，因为应在几个60ms节拍内出现可观察滚动。
// 本函数不吞异常，页面脚本抛错会直接进入测试失败清理。
// 没有catch后返回true的兜底，缺少目标节点不能被误判为通过。
// 调用方先确保页面结构存在，再查询video.readyState等具体状态。
async function wait(query, milliseconds = 18000) {
  const until = Date.now() + milliseconds;
  while (Date.now() < until) { if (await run(`Boolean(${query})`)) return; await delay(70); }
  throw new Error(`Condition not reached: ${query}`);
}
// FFmpeg生成有明确横竖尺寸和帧率差异的测试图，独立ffprobe可再次核对。
// 临时路径只用于本轮夹具，产物和日志不读取用户模型或私人视频。
// 输入size和rate分别控制实际编码尺寸与帧率，不能只改文件名标签。
// 测试图使用testsrc2，导入后可肉眼识别彩色画面而非一张静态假封面。
// 横屏样本额外生成440Hz音轨，探测结果应与无音轨竖屏样本不同。
// libx264与yuv420p保证基础样本能被当前Chromium真实解码。
// 视频长度设为3.25秒，30fps的实际帧尾与24fps源可产生不同取整边界。
// 生成过程由spawnSync检查退出状态，失败时不继续拿空文件跑UI。
// 30秒生成上限避免FFmpeg异常时阻塞整次回归。
// 参数用数组传递，含空格的临时路径不会被shell拆成多个片段。
// windowsHide防止每次生成视频都弹出命令行窗口。
// ffmpeg路径由生产resolveTools选择，确认使用项目随包的媒体能力。
// 音轨样本使用shortest使尾部音视频长度合理，不把无限正弦源留着生成。
// 无音轨样本显式an，避免FFmpeg默认行为误加音轨。
// 输出仅保存在本轮临时目录，测试不会覆盖用户同名文件。
// 函数返回真实路径供系统选择框夹具使用，不返回伪造的VideoProbeResult。
// 元数据是否正确仍由后续生产ffprobe和UI展示断言共同判断。
// codec参数仅用于生成真实异常编码反例，默认值保留既有所有H264样本行为。
// FFV1文件仍走同样的FFmpeg退出码与超时边界，不用零字节文件假扮可探测视频。
// 生产ffprobe应该识别真实编码尺寸，而Chromium是否能播由实际媒体错误决定。
// 坏字节文件和不支持编码是不同失败阶段，原导入失败测试仍保留。
function makeVideo(name, size, rate, audio, codec = "libx264") {
  const file = path.join(root, name), args = ["-y", "-v", "error", "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=${rate}`];
  if (audio) args.push("-f", "lavfi", "-i", "sine=frequency=440");
  args.push("-t", "3.25", "-c:v", codec, "-pix_fmt", "yuv420p", ...(audio ? ["-c:a", "aac", "-shortest"] : ["-an"]), file);
  const result = spawnSync(resolveTools().ffmpegPath, args, { windowsHide: true, encoding: "utf8", timeout: 30000 });
  if (result.status !== 0) throw new Error(result.stderr);
  return file;
}
// 截图直接捕获当前BrowserWindow，不访问静态参考图来冒充运行结果。
// 每张图以场景命名，移动前、候选中和移动后可成组对照。
// 截图内容包含生产应用外壳，能够检查导航和窗口控件没有被复制。
// 图像写入本轮目录，最终交付时再复制选定证据到任务文档目录。
// 测试失败不会自动删除图片，保留当时状态便于解释回归原因。
// 截图不能代替秒数断言，像素上相似的位置也可能相差一帧。
// 同样秒数断言不能代替视觉核查，文字溢出和颜色反馈仍需打开图确认。
// 离屏截图证明真实渲染，不代表完成了人工桌面鼠标验收。
// capturePage只截当前webContents客户区，不会把桌面游戏或私人窗口画进证据。
// width和height取当前窗口真实渲染大小，文件不经过缩放或拼贴。
// 输出toPNG保持无损，细边框和一帧轮廓可以在之后逐像素检查。
// writeFileSync使用固定root加场景名称，每个场景在本次随机目录中独立存档。
// 同名场景在单次流程中只拍一次，不能拿循环最后一张覆盖前面的失败现场。
// 文件名由脚本固定调用点传入，不接收视频名称，避免斜杠改变证据保存目录。
// 截图不携带播放器对象，只保存图像字节，关闭窗口后仍能离线查看。
// 媒体时长与位置的数值证据另存JSON，PNG无法可靠表达小数秒的完整精度。
// 字体抗锯齿和亚像素舍入可能随系统变化，所以当前没有硬编码整图像素哈希。
// 页面内容正确性由各场景断言承担，不能用生成了非空PNG推导业务通过。
// 调用者要保证所需菜单或拖动状态已经稳定，辅助不会偷偷重放上一条动作。
// 菜单场景在openLiveMenu中等待入场动画，拖动场景则在hover尚未提交时采集。
// 这种时点差别保留草稿和正式位置的区别，不能统一先松手再拍所有图。
// 截图写入失败直接抛异常，使证据缺失成为失败，不悄悄交付不存在的图片链接。
// 本轮归档只复制PNG与结构化事实，不需要把临时浏览器缓存和身份夹具一起发布。
async function screenshot(name) { fs.writeFileSync(path.join(root, `${name}.png`), (await win.webContents.capturePage()).toPNG()); }
// click只调用公开元素方法，不能读取React fiber或隐藏状态闭包。
// 元素不存在时求值直接失败，不能自动找另一个同名按钮勉强继续。
// 80ms只给React提交当前事件，不宣称异步媒体任务在这个时间内完成。
// 有异步结果的调用方随后继续使用wait观察busy或媒体就绪。
// 公共aria-label定位与用户可访问名称一致，避免依赖CSS哈希类名。
// 这个辅助函数不模拟系统鼠标点击，因此报告中只称公开DOM交互。
async function click(selector) { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(80); }
// 按钮与文件拖入必须汇入同一个生产startImport，这里验证按钮一侧。
// selection可以含多个实际路径，生产系统选择方法仍返回标准多选结果。
// 空数组让夹具返回canceled，用于确认取消不会清空既有素材和片段。
// 导入点击发生在项目栏，因此窄布局隐藏素材栏后仍可使用该入口。
// 等待素材区不再aria-busy，避免在探测未结束时读取半成品列表。
// 失败素材也会结束busy，所以成功还需由具体用例检查行状态和元数据。
// 重复路径仍走正式去重逻辑，夹具不提前从selection移除重复文件。
// 导入异常保留已有数组的要求在后面的失败用例中单独断言。
// 此函数不读取文件字节，不把视频先整份塞进JS内存。
// 路径传递只到既有选择接口，渲染实际访问仍受生产桥接约束。
async function importFiles(files) {
  selection = files;
  await click('[data-editor-region="R01"] button[aria-label="导入素材"]');
  await wait("!document.querySelector('[data-editor-region=R02]').hasAttribute('aria-busy')");
}
// 片段读取以稳定ID和工程起止为准，不用视觉缩略图大小反推时间。
// 这里不会修改style或受控值，缺少真正提交时断言应失败。
// 公开data属性提供clipId、start、end，正好对应本轮需要核对的工程事实。
// 读取所有实例而非只读选中项，能发现误改同源第二片段的问题。
// Number转换用于精确帧比较，不从格式化时间码中推算浮点秒数。
// selected来自aria-current，用于证明视觉选择由哪个实例拥有。
// 返回数组顺序保持生产DOM顺序，取消用例可以比较整个快照。
// 同一源允许重名，所以这里不以aria-label作为实例身份。
// 不读取视频File或封面字节，工程快照大小与媒体大小没有关系。
// 查询没有副作用，失败前后多次读取不会促成一次提交。
function clips() { return run("[...document.querySelectorAll('[data-editor-clip]')].map(e=>({id:e.dataset.editorClip,start:Number(e.dataset.editorStart),end:Number(e.dataset.editorEnd),selected:e.getAttribute('aria-current')==='true'}))"); }
// 素材身份从当前正式素材行读取，不构造与演示库同名的假assetId。
// 索引只用于选定本测试已知的两个不同样本，正式逻辑仍使用稳定ID。
// 返回ID用于同源多实例反例，不用文件名前缀猜测是否为同一素材。
// 实际素材尚未导入时查询会报错，防止跳过导入步骤后继续画假片段。
async function assetId(index = 0) { return run(`document.querySelectorAll('[data-editor-asset]')[${index}].dataset.editorAsset`); }
// 屏幕落点根据实际lane矩形与当前标尺末端时间换算。
// 这让测试能指定“工程22秒”，同时仍经过生产鼠标坐标转换。
// 矩形left已经包含横滚，测试不会手动把scrollLeft加两遍。
// y选在行内25px处，避开顶部边线和底部相邻音频行。
// 默认V1，也可传A1用于拒绝视频落到音轨的负向场景。
// 0.25px偏移让零秒落点处于内容内部，避免被sticky轨道头边线截获。
// 该偏移小于30fps下一帧的一半像素，不改变预期项目帧。
// 测试当前视口以五秒补齐，末端刻度能作为完整range读取。
// 如果未来主刻度不含末端，需要改此读法，不能继续假设最后标签就是范围。
// 坐标只是输入意图，真正工程起点仍读取提交后的data属性断言。
// 不会通过设置片段style把它提前放到期望位置。
// 横滚与未横滚都调用同一个辅助函数，避免两组测试使用两套时间单位。
async function lanePoint(seconds, track = "V1") {
  // 行高和临时新轨会改变目标纵坐标，先让真实落点进入时间轴滚动视口。
  // 像先翻到目标抽屉再放东西，不能朝屏外发事件却要求命中隐藏音轨。
  // 只调整纵滚，保留横向工程位置；后续仍由elementFromPoint检查实际命中。
  // 顶部预留标尺高度，底部预留滚动条，不能把落点藏在sticky表头后。
  // 每次重读矩形，所以从A1返回V1也会恢复可见位置，不把滚动副作用留给下一例。
  // 这只准备自动输入前提，不改变片段时间、生产CSS或无效轨道的业务预期。
  return run(`(()=>{const e=document.querySelector('[data-editor-track-lane=${track}]'),s=document.querySelector('[data-editor-timeline-scroll]'),v=s.getBoundingClientRect(),p=e.getBoundingClientRect().top+25;s.scrollTop+=Math.min(0,p-v.top-40)+Math.max(0,p-v.bottom+12);const r=e.getBoundingClientRect(),range=Number(document.querySelector('[data-editor-region=R07]').dataset.timelineRange);return{x:r.left+${seconds}/range*r.width+0.25,y:r.top+25}})()`);
}

// 在真实按钮中心附近按下并移动，Chromium自己触发产品的dragstart。
// 截获的载荷包含当前会话ID，测试不手写一份“合法”身份绕开生产入口。
// buttons=1贯穿移动帧，避免把测试漏发按键状态误当产品取消。
// 这证明Chromium内部拖放，不等同于真实资源管理器外部拖入。
// 原生路径先清理测试驱动残留拖动，再开始一组新的鼠标按下与移动。
// 选择器指向真实draggable素材行或片段按钮，而非单独造出的测试div。
// scrollIntoView仅保证源可抓取，不直接改变任何工程秒数。
// fraction表示抓取点在片段宽度内的比例，中点用于验证偏移保持。
// 若只从左边界抓取，即使产品丢掉offset也可能误通过测试。
// 先鼠标移动到源，再按下左键，随后移12px跨过浏览器拖动阈值。
// 移动帧携带buttons=1，防止测试漏发按键状态造成假取消。
// clickCount明确为1，避免两次开始被误解释成双击文本选择。
// Input.dragIntercepted事件提供浏览器实际生成的拖动数据。
// 数据正文由生产startGesture写入，测试不能预先知道本会话UUID。
// 最多等待2秒接收载荷，没有载荷就失败，而不是自行补一个假成功命令。
// 失败时记录命中元素与截图，用来区分布局遮挡和事件驱动环境问题。
// 返回抓取坐标供调用者了解输入，不把它当成已经完成入轨的证据。
// 专用MIME与会话身份由产品负责，测试只转发截获的数据。
// 后续DOM路径有显式domDrag开关，不能悄悄把所有原生断言降成合成事件。
// 原生路径覆盖同源两次创建与一次有效移动，是本轮核心手势证据。
// 离屏取消后不再可靠投递鼠标的限制须写在最终未验证事项里。
// 这类限制不通过反复重试直到偶然成功来掩盖。
async function beginDrag(selector, fraction = .5) {
  if (domDrag) return beginDomDrag(selector, fraction);
  await win.webContents.debugger.sendCommand("Input.cancelDragging");
  dragData = null;
  dragSource = selector;
  const point = await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();return{x:r.left+r.width*${fraction},y:r.top+r.height/2}})()`);
  await win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", buttons: 0, clickCount: 1, ...point });
  await win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", buttons: 1, clickCount: 1, ...point });
  await win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", button: "left", buttons: 1, x: point.x + 12, y: point.y + 12 });
  const until = Date.now() + 2000;
  while (!dragData && Date.now() < until) await delay(40);
  if (!dragData) {
    console.log("DRAG_HIT", point, await run(`({target:document.elementFromPoint(${point.x},${point.y})?.tagName})`));
    await screenshot("drag-failure");
    throw new Error("Chromium did not generate a drag payload");
  }
  return point;
}
// Chromium离屏拦截拖动取消后会停止投递原生鼠标，后续边界用公开DOM事件验证。
// DataTransfer正文仍由产品dragstart写出，不能在夹具中编造有效工程命令。
// 与前面的CDP鼠标证据分别报告，这部分不算系统手势实测。
// DOM分支用于取消后的边界回归，明确不宣称为真实系统鼠标拖动。
// 它仍对生产源元素派发公开dragstart，触发同一手势校验和偏移计算。
// DataTransfer初始为空，合法正文由产品处理器写出，不由测试拼装身份。
// 起点clientX/clientY使用真实DOM矩形，抓取偏移仍是实际像素比例。
// 生产拒绝非ready素材时不会写出可提交载荷，后续落点也不能形成片段。
// 返回items仅用于转交drop，测试不访问Hook内部gesture ref。
// 当前会话session来自实际运行，跨会话负向用例才会显式篡改它。
// scrollIntoView保持源可见，避免合成事件绕过完全不存在的源元素。
// 生产数组没有在夹具中被修改，是否成功仍由clips公开事实判定。
// 本分支共享后续位置、碰撞、草稿和时长断言，不降低业务门槛。
async function beginDomDrag(selector, fraction) {
  dragSource = selector;
  const result = await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect(),x=r.left+r.width*${fraction},y=r.top+r.height/2;window.__timelineTransfer=new DataTransfer();e.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:window.__timelineTransfer,clientX:x,clientY:y}));return{point:{x,y},items:[...window.__timelineTransfer.types].map(mimeType=>({mimeType,data:window.__timelineTransfer.getData(mimeType)}))}})()`);
  dragData = { items: result.items, dragOperationsMask: 17 };
  return result.point;
}
// 目标由elementFromPoint取得，因此边线、sticky头和滚动条仍能阻挡落点。
// 不能直接对V1派发事件来绕过鼠标实际上落在音频行或边栏的问题。
// 每次重建DataTransfer只复制上一阶段产生的MIME正文。
// 篡改负向用例也走这里，所以最终drop必须重新检查正文身份。
// dragenter和dragover先于drop，生产能够发布真实的候选轮廓。
// drop=false时不发送提交事件，便于断言hover尚未改动正式工程。
// drop=true才派发drop，并在源元素发送dragend走统一资源清理。
// 事件均bubbles且cancelable，与生产React事件的捕获和冒泡规则兼容。
// client坐标与lanePoint同一客户区坐标系，不掺入屏幕或窗口装饰偏移。
// 此函数不直接调用applyTimelineCommand，避免绕过UI载荷与轨道验证。
// 短延时只等待当前事件提交，不拿它冒充视频加载成功。
// 目标命中错误会在后续clips或draft断言失败，而不是自动改投V1。
async function dispatchDomDrag(point, drop) {
  const items = JSON.stringify(dragData.items);
  await run(`(()=>{const target=document.elementFromPoint(${point.x},${point.y});const transfer=new DataTransfer();for(const item of ${items})transfer.setData(item.mimeType,item.data);for(const type of ${JSON.stringify(drop ? ["dragenter", "dragover", "drop"] : ["dragenter", "dragover"])})target.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:${point.x},clientY:${point.y}}));${drop ? `document.querySelector(${JSON.stringify(dragSource)})?.dispatchEvent(new DragEvent('dragend',{bubbles:true}))` : ""}})()`);
  await delay(100);
}
// 同一浏览器原生载荷用于hover和drop，不重建工程命令或调用内部门槛。
// drop完成后发dragend，让生产清理路径真正结束冻结比例和滚动计时器。
// 原生路径把截获的同一data发送给dragEnter、dragOver和drop。
// 没有为drop重建一个更宽松的身份，起点与松手必须对应。
// hover留出100ms供React显示草稿，随后截图读取真实轮廓。
// 松手时发送mouseReleased，不能让左键一直停留在按下状态。
// CDP拦截模式未必补发源dragend，因此显式发送公开结束事件。
// 这个补发只触发生产清理，不写工程位置，也不伪造一次成功提交。
// 最后取消驱动内部拖动状态，避免本测试下一步承接旧输入状态。
// 若drop被拒绝，结束步骤仍执行，失败不能留下自动滚动计时器。
// DOM路径与原生路径都由后续工程事实断言判定结果，不能以命令返回当成功。
// 本辅助不修正重叠或负起点，输入非法位置就是要观察产品拒绝。
async function dragTo(point, drop = true) {
  if (domDrag) return dispatchDomDrag(point, drop);
  await win.webContents.debugger.sendCommand("Input.dispatchDragEvent", { type: "dragEnter", ...point, data: dragData });
  await win.webContents.debugger.sendCommand("Input.dispatchDragEvent", { type: "dragOver", ...point, data: dragData });
  await delay(100);
  if (drop) {
    await win.webContents.debugger.sendCommand("Input.dispatchDragEvent", { type: "drop", ...point, data: dragData });
    await win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", buttons: 0, clickCount: 1, ...point });
    await run(`document.querySelector(${JSON.stringify(dragSource)})?.dispatchEvent(new DragEvent('dragend',{bubbles:true}))`);
    await win.webContents.debugger.sendCommand("Input.cancelDragging");
    await delay(100);
  }
}
// 取消分为产品Escape处理与测试驱动取消，两者必须分别结束。
// 公开DOM键盘事件验证页面捕获监听是否清空gesture与draft。
// CDP的Escape命令保留浏览器按键意图，但不作为实际投递成功的唯一证据。
// Input.cancelDragging结束测试驱动的拖动，不直接改变React工程数组。
// 源dragend补齐拦截模式未自动发出的公开生命周期事件。
// mouseReleased恢复驱动左键状态，避免下一组动作被识别成持续按下。
// 取消之前保存的clips快照由调用方比较，不仅看红框是否消失。
// 候选轮廓消失与原位置保留要同时成立，任何一项失败都不算取消正确。
// 自动滚动测试还会在取消后等待，确认scrollLeft不再继续变化。
// 这里不会把片段重新设置为旧style，因此能发现产品真的提交了错误候选。
async function cancelDrag() {
  // CDP拦截模式会吞掉浏览器拖动中的按键投递，补发DOM事件只测试公开Escape监听。
  // 这不是人工键盘证据；命令和原生取消仍不直接触碰工程状态。
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
  await win.webContents.debugger.sendCommand("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await win.webContents.debugger.sendCommand("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await win.webContents.debugger.sendCommand("Input.cancelDragging"); await delay(100);
  await run(`document.querySelector(${JSON.stringify(dragSource)})?.dispatchEvent(new DragEvent('dragend',{bubbles:true}))`);
  await win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", buttons: 0, clickCount: 1, x: 900, y: 700 });
}
// 焦点明确移到目标片段按钮，方向键不依赖列表当前选中素材。
// KeyboardEvent的key使用ArrowLeft/ArrowRight，与浏览器标准一致。
// shiftKey只影响移动步长，不直接在测试中计算或写入新start。
// 事件可冒泡，让公共EditorClipShell的onKeyDown正常接收。
// cancelable允许产品preventDefault，保留真实回调的冲突处理契约。
// 离屏窗口没有可靠系统键盘投递，这个边界在最终报告明确说明。
// 不调用真实桌面sendKeys，避免占用用户正使用的其他程序。
// 按键后读取公开工程秒数，防止只改选中边框却未移动位置。
// 同一辅助用于合法一帧与非法一秒碰撞，二者共用生产提交入口。
// 搜索框是否不被全局拦截由组件局部监听结构与样板键盘回归共同核对。
async function keyMove(id, key, shift = false) {
  await run(`document.querySelector('[data-editor-clip="${id}"]').focus()`);
  // 离屏窗口不投递真实键盘；这里明确派发DOM键盘事件验证公开组件回调。
  // 不把这个用例写成人工系统键盘操作，真实键盘可达性仍需人工验收。
  await run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},shiftKey:${shift},bubbles:true,cancelable:true}))`);
  await delay(100);
}

// 素材选择与实例选择用不同源作反例，不能只看同一文件名就声称隔离。
// 同一素材两次原生拖入，要求真正得到不同clipId，而非复制一张装饰卡。
// 本组前置是已导入两个ready视频、正式V1为空，不能依赖DEMO片段占位。
// 先点击横屏源，建立素材列表自己的选中状态，再开始第一次拖动。
// 第一次落在零秒，第二次落在八秒，两个完整源片段之间保留明显空隙。
// 选择八秒是为了让后续四秒移动仍有可见合法区，而不是碰巧相邻。
// 两次拖动使用同一个assetId，预期得到两个不同clipId。
// 如果产品用assetId作为key，第二次可能覆盖第一片段，这个数量断言会失败。
// 如果只复制DOM装饰而未创建独立数据，clipId或工程秒数也会暴露问题。
// 片段ID还必须不同于素材ID，不能只是两个地方显示同一个身份字段。
// 第二实例起点精确为8，验证原生drop真实走了坐标换算。
// 零秒第一实例也应存在，防止落在sticky边线上时测试只建立一段。
// 随后主动选择竖屏素材，制造“素材选中与片段源不同”的反证条件。
// 再点击横屏首片段，预览与属性应转为该实例，列表仍高亮竖屏。
// 若先选同一素材再点片段，即使两个状态错误绑定也无法发现串用。
// 预览通过data-editor-preview-clip确认实例身份，不只比较相同文件名。
// 属性头通过data-editor-inspector-clip确认同一个实例，避免只更新一半区域。
// 素材高亮读取第二行的aria-current，证明它没有被片段点击清除或覆盖。
// 这组点击不应产生第三个片段，选择与创建是不同意图。
// 截图保留0秒与8秒两个实例，作为后续移动前的真实对照。
// 截图中的横屏画面来自实际文件解码，而非静态DEMO_ASSETS封面。
// 两份实例共享封面来源，不要求为每个片段复制相同视频文件。
// 返回placed快照供下一组核对原始长度，避免在移动后再读取并误作基准。
// 快照只含公开工程事实，不持有可被测试直接改写的React对象。
// 若任何创建失败，后续访问片段应报错，不补造片段让后续测试继续绿灯。
// 本组原生拖动由Chromium鼠标事件产生，区别于后续DOM边界回归。
// 内部载荷会话由页面生成，测试不知道也不硬编码该UUID。
// 选中不会自动播放，截图前的媒体时间应仍在源开头附近。
// 这组不检查修剪把手，因为本轮明确保持装饰和禁用边界。
// 测试结果只说明当前V1单轨选择，不宣称实现音频轨或多选属性。
async function checkCreateAndSelect() {
  const id = await assetId();
  await click('[data-editor-asset]');
  // 先停在尚未松手的内部候选位置，重现用户报告的上区覆盖问题。
  // 预览原本是素材查看，拖动只安排工程位置，不能换成导入提示或重建播放器。
  // 保存媒体节点身份而非只看同名文件，卸载再挂一个相同src也会被识别。
  // 候选停留不应创建片段，松手后仍沿用这份原生载荷提交到零秒。
  // 节目区文字快照覆盖标题与状态，能够发现遮罩以外的错误提示切换。
  // DOM引用保存在隔离测试窗口，不暴露到产品preload，也不写工程数组。
  // 这条CDP内部拖动证据仍不是资源管理器外部文件拖入的人工证明。
  // 前一段真实源已经通过点击选中，media节点不存在会使身份断言直接失败。
  // 观察先于drop，避免松手后清掉的短暂遮罩漏过最终静态截图。
  // 最后继续旧创建断言，不以画面保持稳定替代片段成功建立。
  // 素材点击会先进入真实加载态，首帧就绪前保存文字会把正常状态更新误报成拖动改预览。
  // 先等真实媒体ready及页面ready，两份证据都满足后才保存稳定预览快照。
  // 等待有外层截止，不通过固定延迟或改DOM伪造加载完成；原身份与全文断言保持。
  await wait("document.querySelector('[data-editor-region=R03] video')?.readyState>=2&&!!document.querySelector('[data-editor-preview-state=ready]')");
  await run("window.__ui08Preview=document.querySelector('[data-editor-region=R03] video');window.__ui08Text=document.querySelector('[data-editor-region=R03]').textContent");
  await beginDrag(`[data-editor-asset="${id}"]`); await dragTo(await lanePoint(0), false);
  smoke.check("UI08: internal hover keeps the same media and upper preview", await run("window.__ui08Preview===document.querySelector('[data-editor-region=R03] video')&&window.__ui08Text===document.querySelector('[data-editor-region=R03]').textContent&&!document.querySelector('[data-editor-region=R03]').textContent.includes('松开导入')"));
  await screenshot("ui-08-internal-hover");
  await dragTo(await lanePoint(0));
  await beginDrag(`[data-editor-asset="${id}"]`); await dragTo(await lanePoint(8));
  const placed = await clips();
  // 同源身份断言同时看三个条件，分别排除不同类型的假通过。
  // 数量为二排除第二次创建覆盖第一次。
  // 两个clipId不同排除重复身份节点。
  // clipId不同于assetId排除将源身份直接复用成实例身份。
  // 第二段start为8排除载荷正确但坐标一直回落零点。
  // 如果落点零秒刚好命中轨道头，首段不会创建，数量条件能揭示环境输入错误。
  // 不能把这种首段缺失靠补一个演示片段修好。
  // 本组没有比较片段文件名，因为两段本来就应该显示同一个源名。
  // 也没有要求生成第二份封面，重复入轨只是引用同一源。
  // 八秒间隙是真实空白，截图应能看到它而不是把两个Card均匀排布。
  // 新实例选中是正常结果，第一次实例仍需保留在工程数组中。
  // 后续片段选择使用这两个实际UUID，测试不依赖固定ID常量。
  smoke.check("Native asset drags create independent instances of one source", placed.length === 2 && placed[0].id !== placed[1].id && placed[0].id !== id && placed[1].start === 8);
  await run("document.querySelectorAll('[data-editor-asset]')[1].click()");
  await click(`[data-editor-clip="${placed[0].id}"]`);
  smoke.check("Clip selection maps preview and inspector without changing asset highlight", await run(`document.querySelectorAll('[data-editor-asset]')[1].getAttribute('aria-current')==='true'&&document.querySelector('[data-editor-region=R03]').dataset.editorPreviewClip==='${placed[0].id}'&&document.querySelector('[data-editor-region=R04]').dataset.editorInspectorClip==='${placed[0].id}'`));
  await screenshot("live-02-before-move-light");
  return placed;
}
// 中部抓取后平移四秒，预期start=4而非鼠标所在的片段中点。
// 前后对照整份数组，能发现移动一个实例却连带同源实例的错误。
// 移动前首实例位于0秒，长度为98/30秒，第二实例位于8秒。
// 从首片段中部抓取，目标鼠标放在4秒加半段长度的位置。
// 产品若把起点直接贴到鼠标，会得到约5.63秒而不是4秒。
// 因此不能只检查“片段往右了”，必须精确核对start等于4。
// hover阶段先不松手，预期clips仍保持原起点零秒。
// 同时要求有效轮廓存在，防止“没有显示草稿所以未修改”被误当正确。
// 轮廓截图保存鼠标尚未提交时的布局，明确它不是正式工程记录。
// 有效落点显示data-valid=true，是业务校验与实际V1命中共同结果。
// 第二次dragTo松手，预期只替换被移动实例的start/end。
// 同源第二实例仍在8秒，证明移动使用clipId而不是assetId批量定位。
// 移动后长度与原快照比较，不能把改变终点误称为平移。
// 源文件时长不参与写回，片段占位变化只允许为零。
// 移动后的截图与前图成对，能复核空隙和两个实例确实发生了预期变化。
// 接着拖向第二片段覆盖区，轮廓应为无效而非蓝色可放置。
// 此时正式首片段仍在4秒，碰撞预览不能先把它搬过去再等取消。
// 取消前保存moved快照，之后比较整个数组和选中状态。
// Escape必须清除轮廓，否则用户会以为还存在一个待提交的安排。
// 原数组完全一致还证明没有留下微小帧偏移或意外的新片段。
// 这次取消后切换显式DOM事件模式，反映离屏驱动输入限制。
// 切换只改变测试事件来源，不改变被测业务或断言精度。
// 方向左键预期从4秒变为4减1/30秒，使用项目30fps而非源帧率。
// 若按像素或固定0.1秒移动，这个精确断言会失败。
// 随后Shift+右键尝试加一秒，候选终点会覆盖八秒第二实例。
// 同一碰撞门槛必须拒绝，首实例仍保持上一帧位置。
// 固定反馈区还需出现重叠说明，不能仅悄悄忽略按键。
// 一帧与一秒两次输入都只通过按钮键盘回调，不写工程对象。
// 键盘移动成功后会更新当前实例选择，后续预览仍对应首片段。
// 由于第二实例同源，碰撞测试能发现错误排除所有同源片段的实现。
// 此处没有启用吸附，四秒起点来自精确坐标与项目帧取整。
// 也不允许自动挤开八秒片段，那会破坏其独立实例位置断言。
// 无效轮廓与Escape保留都通过才说明取消语义完整。
// 只检查数量为二不足以证明位置没有被非法提交。
// 这组不依赖动画完成时间，草稿和工程均读取真实状态。
// 鼠标偏移与键盘帧精度属于不同维度，不能用一个通过替代另一个。
async function checkMoveAndCancel(placed) {
  const first = placed[0].id;
  await beginDrag(`[data-editor-clip="${first}"]`, .5);
  await dragTo(await lanePoint(4 + (placed[0].end - placed[0].start) / 2), false);
  smoke.check("Move hover shows valid position without mutating committed clips", (await clips())[0].start === 0 && await run("document.querySelector('[data-timeline-draft]')?.dataset.valid==='true'"));
  await screenshot("live-02-drag-feedback-light");
  await dragTo(await lanePoint(4 + (placed[0].end - placed[0].start) / 2));
  const moved = await clips();
  await checkPlacementEvidence(placed, moved);
  // 这里长度比较使用小容差，只容纳IEEE浮点表示，不容纳一帧业务误差。
  // start=4和第二段start=8则要求准确的帧对齐结果。
  // 如果把宽度四舍五入成整数像素再反算时长，长度比较可能暴露漂移。
  // 如果按数组索引而不是clipId替换，第二段也可能被挪动。
  // 如果把end设成鼠标位置，片段会被错误缩短，不能称为平移。
  // 如果把源入点改成4秒，短源播放会失效，随后真实播放回归另有保护。
  // 中点抓取使本例对offset错误足够敏感。
  // 仅从左边抓取时offset近零，错误实现也可能偶然通过。
  // 移动前后截图保留相同浅色与窗口大小，减少视觉对照歧义。
  // 实际起点和终点仍以data属性为准，截图不承担亚像素时间测量。
  // 片段名字可能省略，但完整title与稳定ID保证可定位同一实例。
  // 成功提交后候选应清除，不能同时留一个幽灵片段看起来像重复创建。
  smoke.check("Move preserves grab offset and leaves the same-source instance unchanged", moved[0].start === 4 && moved[1].start === 8 && Math.abs(moved[0].end - moved[0].start - placed[0].end) < 1e-7);
  await screenshot("live-02-after-move-light");
  await beginDrag(`[data-editor-clip="${first}"]`); await dragTo(await lanePoint(8.5), false);
  smoke.check("Collision preview resolves to a valid edge without mutating the original", await run("document.querySelector('[data-timeline-draft]')?.dataset.valid==='true'&&Math.abs(Number(document.querySelector('[data-timeline-draft]').dataset.start)-(8-98/30))<1e-7") && (await clips())[0].start === 4);
  // 保存碰撞修正后的合法轮廓，原正式安排在松手前仍保持不变。
  // 画面仍含旧正式片段，说明红色候选尚未成为工程数据。
  // 后续Escape再用完整数组验证恢复，不用截图代替状态断言。
  await screenshot("ui-06-edge-placement-light");
  await cancelDrag();
  domDrag = true;
  smoke.check("Escape removes the outline and restores the entire original placement", !(await run("!!document.querySelector('[data-timeline-draft]')")) && JSON.stringify(await clips()) === JSON.stringify(moved));
  await keyMove(first, "ArrowLeft");
  smoke.check("Keyboard one-frame movement uses project fps", Math.abs((await clips())[0].start - (4 - 1 / 30)) < 1e-7);
  await keyMove(first, "ArrowRight", true);
  // 此时首段终点约7.23秒，加一秒将越过第二段8秒起点。
  // 这保证Shift移动真的发生碰撞，而非仅仅因为按钮未收到键盘事件。
  // 前一条合法一帧移动已经证明键盘回调可以提交。
  // 组合这两个断言，能够排除“所有按键都没反应”这种假拒绝。
  // 重叠反馈进一步证明业务门槛实际执行，而不是快捷键被全局吞掉。
  // 新规则保留完整长度并贴到最近合法边界，不推开障碍或偷偷切短片段。
  // 第二段位置作为障碍不变，禁止通过推开障碍自动腾位置。
  // 其源素材与首段相同，所以asset级排除错误会让这个用例失败。
  // 工程总长也不能因失败候选临时增长，后面的整份数组比较会保留该边界。
  // 键盘与鼠标共用贴边规则，最近完整空位应恰好结束于第二段起点。
  smoke.check("Keyboard collision resolves to the nearest full gap with no overlap", Math.abs((await clips())[0].end - 8) < 1e-7);
}

// LIVE-03复核先保存公开DOM的完整起止，不靠截图中的刻度猜片段长度。
// 这像核对停车单：车停在4号线，不代表车长也是4个车位。
// 本例源视频约3.25秒，安排占98帧；第二段的8秒只是起点。
// 因此必须同时读取end，不能看到4与8就断定中间发生重叠。
// 原始placed和moved都来自真实导入后的页面，不是本函数构造的数据。
// JSON保留移动前后身份，后续可以确认比较的是同一实例。
// 帧差独立从两个端点计算，不调用被测碰撞函数来自证结果。
// 原例预期仍为首段4秒、第二段8秒，不缩短片段来制造合法结果。
// 首段98帧与22帧空隙均给固定期望，产品长度若漂移应让回归失败。
// 完整起止写入临时运行目录，文档可以引用数值而非转述视觉印象。
// 输出仅含测试实例ID与工程时间，不写用户视频路径或配置。
// 保存证据不是工程保存功能，正式工程仍只有页面内存会话。
// 调用点在移动提交后、下一次无效拖动前，不会混入后续键盘修改。
// 先验证真实短视频，再用六秒纯模型反例覆盖相反结论。
// 反例没有视频解码，报告中必须与真实媒体和系统操作分开标注。
async function checkPlacementEvidence(before, after) {
  // 这里的30是当前工程fps，不是拿被导入源的24fps反算工程空隙。
  // 页面映射会把数字秒数写到data-editor-start/end，读取时已转Number。
  // 时间码显示可能只保留帧尾，用公开数值能保留7.266666666666667的事实。
  // gapFrames取整只是抵消浮点尾差；22帧期望不使用“约等于若干秒”。
  // 如果两段刚好相接，差应为零；重叠则会得到负数，而不是零以上空隙。
  // 原片段从零开始，placed首段的end也等于原工程长度，可与移动后对照。
  // 同源第二实例的ID不同，保存两段能让读者排除把源素材当片段的误会。
  // selected字段只是现场选择标记，不参与时间交集的计算。
  const gapFrames = Math.round((after[1].start - after[0].end) * 30);
  fs.writeFileSync(path.join(root, "placement-facts.json"), JSON.stringify({ before, after, gapFrames }, null, 2));
  console.log("LIVE03_PLACEMENT_FACTS", JSON.stringify({ after, gapFrames }));
  smoke.check("4s / 8s actual DOM intervals retain 98 frames and a 22-frame gap", after[0].start === 4 && after[1].start === 8 && Math.round((after[0].end - after[0].start) * 30) === 98 && gapFrames === 22);
  checkLongCollision();
}

// 只转译生产纯函数，类型import会消失，不加载React、Node桥接或页面替身。
// 转译不是类型检查；strict类型校验仍由仓库的独立命令负责。
// 六秒源是固定数值夹具，专门反证“4秒位置永远合法”的错误结论。
// 两份安排使用同一assetId，能抓住错误排除同源片段的碰撞实现。
// 首段固定[0,6)，障碍固定[8,14)，移动到4后应为[4,10)。
// 两秒交集必须拒绝，不能改障碍起点或缩短首段去迁就通过。
// 这里手写初始安排与预期，而不是让被测函数生成它自己的期望答案。
// 真实DOM短视频与此数值反例一起，才能区分长度条件而非只看起点。
// 边界表按整数帧列出，避免测试中的浮点舍入先改变输入意图。
// 60帧即2秒，六秒长的片段刚好结束在障碍的8秒起点，应合法。
// 61帧只比合法落点多一帧，应拒绝，验证最小重叠而非只测大交集。
// 420帧即14秒，刚好从障碍结束开始，同样合法。
// 419帧从障碍内最后一帧开始，应拒绝，覆盖另一侧端点。
// 120帧对应用户关心的4秒，此处长源明确与短源得出不同结果。
// 零帧是原位，必须允许，验证移动没有错误地撞到自身。
// 负一帧是左越界，不能被无声夹回零秒而显示成功。
// 表内只改变候选起点，两段的原长度和障碍位置始终保持不变。
// 失败必须带overlap原因；单纯没有提交也可能是身份校验失败。
// 冻结输入对象能暴露在校验前就改写正式安排的副作用。
// 每次计算都使用同一份输入，前一个合法结果不能影响下一个预期。
// 成功结果还检查保持180帧，避免靠缩短六秒片段通过边界。
// 最后对照原数组字节快照，拒绝与成功候选都不得就地改写输入。
// 这只覆盖共用数学门槛，不声称验证系统鼠标、键盘或资源管理器。
// 一旦断言失败，harness保留失败结果，不能由后续截图成功覆盖。
// 生产模块以后增加运行时依赖时，本加载边界应显式失败而非自动mock。
// 动画与轨道均为纯数据模块，所以本例不需要为组件制造替身实现。
// 本轮未发现碰撞算法错误，因此只补证据和回归，不修改业务规则。
function checkLongCollision() {
  // 与胶片带回归共用只允许相对纯模块的递归加载器，动画规则也执行真实生产实现。
  // 它会直接拒绝未知外部依赖，不给新模块制造空mock来让碰撞反例假通过。
  const exports = require("./lib/check-video-filmstrip").models("live-timeline-model");
  const clip = Object.freeze({ id: "first", assetId: "six-seconds", track: "V1", start: 0, end: 6, sourceIn: 0, sourceDuration: 6 });
  // 障碍只替换id和工程位置，sourceIn仍为零，两个实例引用的都是完整六秒。
  // end写成14而不是由被测代码推导，障碍长度的独立预期也是六秒。
  // 既冻结记录又冻结数组：只冻结数组不足以阻止内部对象的start被改写。
  // 成功路径应返回新的片段对象，禁止借着“校验成功”直接改原输入。
  const obstacle = Object.freeze({ ...clip, id: "second", start: 8, end: 14 });
  const input = Object.freeze([clip, obstacle]), original = JSON.stringify(input);
  const rejected = exports.applyTimelineCommand(input, [], { kind: "move", id: "first", start: 4 }, 30);
  smoke.check("Six-second fixture moved to 4 overlaps the unchanged 8-second obstacle", !rejected.ok && rejected.reason === "overlap");
  for (const [frame, expected] of [[0, true], [60, true], [61, false], [120, false], [419, false], [420, true], [-1, false]]) {
    // 单侧端点条件不足以表达交集，前后两个一帧反例会分别抓住漏掉的方向。
    // 60和420的成功同时证明采用半开区间，不能把接触边线误报成碰撞。
    // 61和419的失败约束项目帧精度，不能用一秒容差把细小重叠放过去。
    // 表格不会自动生成“差不多合法”的起点，固定帧值便于直接人工复算。
    // 长度检查只对ok分支读取clip，失败分支没有一个可以误提交的候选对象。
    // input在整个循环都不替换，所以重试不会建立在上一轮已移动的工程上。
    const result = exports.applyTimelineCommand(input, [], { kind: "move", id: "first", start: frame / 30 }, 30);
    smoke.check(`Pure placement fixture at frame ${frame}: adjacency, overlap or invalid start`, result.ok === expected && (!result.ok || Math.round((result.clip.end - result.clip.start) * 30) === 180));
  }
  smoke.check("Placement candidates leave both original six-second instances untouched", JSON.stringify(input) === original);
  // 音轨的固定数值反例只测共用模型，不把它记作实际系统拖入证据。
  // 两个目标音轨都用完整六秒障碍占位，不能缩短障碍来迁就分离结果。
  // 同时间的不同轨道允许独立安排，但同一轨道必须拒绝任何帧交集。
  checkAudioModel(exports, input);
  // 贴边规则是新用户要求，严格碰撞反例仍保留，不能修改六秒素材来迁就结果。
  // 这里同时保留严格apply与交互resolve两种契约，不用更改旧严格预期掩盖碰撞。
  // 固定input的first为[0,6)，second为[8,14)，两段长度都是180工程帧。
  // first尝试4秒时成为[4,10)，严格规则与second有两秒交集，应返回overlap。
  // 新交互规则不能把它缩到[4,8)，那会把完整六秒片段错误截短成四秒。
  // 正确最近合法前贴位置是2，对应[2,8)，与second只有公共边界，没有公共帧。
  // 这个2秒期望独立写死在案例表，不从生产算法计算出来当自己的答案。
  // wanted=-1验证工程左边界贴零，不能将负数继续写进正式片段。
  // 负位置解析为[0,6)后，另一段[8,14)仍保留两秒真实空隙。
  // wanted=9验证位于障碍内部时比较两侧，后贴14比前贴2更近。
  // 正确结果[14,20)不能变成[14,18)，长度仍须完整六秒。
  // wanted=100是无障碍远处，位置应保持100，不能总把所有命令吸到工程末尾。
  // 这条反证区分最近空位策略与“只追加到最后”的简化实现。
  // 每项同时检查end-start为6，位置对了但偷偷缩短内容仍会失败。
  // 每项还比较原input快照，搜索候选不能移动原障碍来腾空位。
  // first自排除按实例ID，不按assetId，第二个同源实例仍作为障碍参与判断。
  // 原始数组顺序在四个案例之间保持不变，不让前一候选改变下一次前提。
  // 测试使用纯模型，没有发起UI拖动，因此这四项不统计成人工鼠标验证。
  // 数值夹具故意用整秒方便独立核算，实际98帧媒体案例另有起止事实文件。
  // 两者互补：六秒反例证明完整占位，真实源证明取整与媒体来源不被混用。
  // resolve返回ok仍须由真正提交入口更新工程，纯函数通过不代表播放器已切源。
  // ES2022转译目标保留Set迭代，与项目实际构建运行环境一致。
  // 如果退回默认ES3，展开Set可能被转成空数组，得到的是测试转译错误而非算法证据。
  // 不能因此删掉边界集合或把预期改成overlap，应该修正测试执行前提。
  // wanted先按项目帧舍入，碰撞比较使用同一fps，防止候选与提交各取不同精度。
  // 此处fps固定30，180帧就是6秒，不借源视频24fps解释成别的长度。
  // 两个端点都参与半开区间比较，end等于other.start合法，晚一帧就不合法。
  // 前面的严格一帧交集案例继续存在，新避让不会削弱独立碰撞门槛。
  // 分离音轨不使用resolve，否则可能把声音挪到14秒而原视频仍在0秒。
  // checkAudioModel保留A1冲突回退A2与两轨都满时整体拒绝的独立期望。
  // 删掉音轨不等于删除源文件，测试后续还会返回素材库验证原视频仍可预览。
  // 原工程并没有上界100秒限制，合法远处位置可以延长总长。
  // 视口range会在提交后重新计算，这里不为候选搜索扩展演示时长。
  // 候选排序距离相等取早位置，是确定性规则，不依赖JS引擎随机遍历结果。
  // Set只负责去重，不作为候选优先级依据，排序后才决定尝试顺序。
  // 所有候选最终仍调用严格apply，所以多个障碍之间窄缝不会被错误接纳。
  // 这个回归不把“贴边”扩展为标尺或播放头吸附，后两者仍未实现。
  // UI草稿也走同一resolve，下面真实拖动断言另读草稿start与提交start对照。
  // 若只在松手时贴边而hover仍显示红色拒绝，公开DOM回归会指出不一致。
  // 鼠标和键盘都经共同commit，后面的ArrowRight碰撞同样应贴到完整空隙。
  // 原四秒八秒案例的98帧长度不因这个六秒反例而改写，不能为统一预期缩短文件。
  // 自动媒体输入与数值夹具在报告中分栏，固定数值不是磁盘探测返回值。
  // 循环失败不重试不同起点，没有为了凑PASS向旁边多挪一帧的测试修补。
  // 案例表每次读取同一original JSON，原数组变动会在本项明确暴露。
  // 结果失败分支没有半成品clip，检查ok后才能安全读取起止。
  // 成功数组可能与原数组引用不同，这是不可变提交的正常结果，不属于原input变化。
  // 输入不可变比较针对内容，不能仅以数组引用不同就宣称障碍未改。
  // 文件系统和用户设置完全不参与这段计算，回归失败可以单独定位到时间模型。
  // 用例结束仍继续原LIVE能力回归，不因四个纯案例通过就提前结束Electron测试。
  for (const [wanted, expected] of [[4, 2], [-1, 0], [9, 14], [100, 100]]) {
    const result = exports.resolveTimelineCommand(input, [], { kind: "move", id: "first", start: wanted }, 30);
    smoke.check(`Nearest legal full gap for ${wanted}s`, result.ok && result.clip.start === expected && result.clip.end - result.clip.start === 6 && JSON.stringify(input) === original);
  }
}

// 分离使用带hasAudio的元数据夹具；真实ffprobe与音轨播放另在正式页验证。
// 本函数不制作假的音频文件，也不声称数值夹具可以代替声卡试听。
// 原视频固定[0,6)，A1障碍同样[0,6)，预期必须回退A2而非挪时间。
// 新音轨保留完整起止，原视频只增加静音标记，不改变源文件时长。
// 然后在A2也放同长度障碍，分离应整体失败，V1仍不能被静音。
// 重复分离在后续真实页面菜单验证，当前纯函数组聚焦轨道占用回退。
// 删除与复制的公开动作另在音轨编辑用例覆盖，不冒充本组的数值断言。
// 这些是不同业务结果，不能只用“片段数量变化”这一条宽泛判断代替。
// 原输入按字节快照比较，失败与成功候选都不能原地改写已有安排。
// 空音轨元数据用于否定分支，不按mp4扩展名默认生成有声片段。
// clip实例拥有独立ID；源素材ID保持相同，证明没有复制源媒体对象。
// A1和A2的先后顺序属于明确策略，不能每次随机选择导致用户安排不稳定。
// 碰撞原因仍为overlap，与键盘和鼠标门槛保持一致。
// 所有固定期望独立列出，不调用产品函数生成其自己的“正确答案”。
// 本夹具的两份V1安排具有不同ID，音轨占用记录另取block-a1，不能触发自ID排除。
// A1记录沿用first的六秒长度，是故意保留时间条件来隔离轨道选择变量。
// 第一次分离返回的数组应包含原有三段再加新音轨，不应移除block-a1。
// 此处检查at(-1)安全，因为读的是纯函数追加数组，不是按轨道分组的DOM。
// A2分支的预期start为0、end为6，是两个独立固定数值，不从结果自身算出。
// 如果实现为寻找A1后续空隙而非尝试A2，track或start至少一个条件会失败。
// 如果实现把音轨放在工程总长末尾，start为0的断言会失败。
// 如果实现只静音不产生独立安排，末项仍是block-a1，A2条件会失败。
// 如果实现把原视频移动到A2，原数组字节对照可发现输入修改。
// 第二次创建full时基于原blocked而非第一次返回值，避免已分离标记抢先拒绝。
// 所以拒绝必须来自两条音轨同时间占用，而不是“已经分离”的另一门槛。
// full[0].audioDetached原值为空，拒绝后不能偷偷出现true。
// 无音轨反例传空素材表，验证缺少可探测源时不会仅靠片段存在就拆出音频。
// 它不单独覆盖hasAudio=false与state=loading，真实无音轨分支还依赖UI回归。
// 对这条覆盖边界保守记录，不能从空表失败推断所有无声编码都已实测。
// 测试源的sourceIn仍是0，音轨分离不会靠更换源入点躲开障碍。
// 两个结果都交给smoke.check，首个失败不会阻止另一条独立失败事实被保留。
// 这里只读取ok分支的clips，使用短路判断避免失败结果被当成功结构解包。
// blocked的快照在调用前保存，不能在函数执行后才保存成一个已污染的基准。
// 两轨都占用的校验没有转码或I/O，因此不依赖FFmpeg速度与机器显存。
function checkAudioModel(model, input) {
  // 锁的反例用空闲音轨，排除因碰撞失败而误以为锁检查有效。
  // 原视频六秒不变，A1锁住时应原位置进入A2，而不是把声音移到末尾。
  // 两条目标轨都锁时应明确trackLocked，且原V1不能出现静音标记。
  // 源轨锁住则三种编辑全部拒绝，覆盖菜单与键盘共同的纯提交入口。
  // 冻结输入还由外层快照校验，拒绝不得偷偷修改原安排再返回错误。
  // 这些是模型反证，不是系统鼠标或扬声器试听的证据。
  // 真实页面另验证正式会话把当前锁表传入，不只验证新增参数的默认值。
  // 旧无锁调用仍保留，下面原占用反例继续验证六参数兼容契约。
  const assets = [{ id: "six-seconds", state: "ready", metadata: { hasAudio: true } }];
  const fallback = model.applyTimelineEdit(input, assets, "detach", "first", "audio", 30, ["A1"]);
  smoke.check("UI08 model: locked A1 routes intact audio to A2", fallback.ok && fallback.clips.at(-1).track === "A2" && fallback.clips.at(-1).end === 6);
  const locked = model.applyTimelineEdit(input, assets, "detach", "first", "audio", 30, ["A1", "A2", "A3"]);
  smoke.check("UI08 model: both targets locked refuses atomically", !locked.ok && locked.reason === "trackLocked" && !input[0].audioDetached);
  smoke.check("UI08 model: source lock blocks every edit", ["detach", "duplicate", "delete"].every(action => { const r = model.applyTimelineEdit(input, assets, action, "first", "new", 30, ["V1"]); return !r.ok && r.reason === "trackLocked"; }));
  const blocked = [...input, { ...input[0], id: "block-a1", track: "A1" }], before = JSON.stringify(blocked);
  const result = model.applyTimelineEdit(blocked, assets, "detach", "first", "audio", 30);
  smoke.check("Audio fixture keeps timing and falls back from occupied A1 to A2", result.ok && result.clips.at(-1).track === "A2" && result.clips.at(-1).start === 0 && result.clips.at(-1).end === 6 && result.clips[0].audioDetached === true && JSON.stringify(blocked) === before);
  const full = [...blocked, { ...input[0], id: "block-a2", track: "A2" }];
  const rejected = model.applyTimelineEdit(full, assets, "detach", "first", "audio", 30, [], ["V1", "A1", "A2"], { video: 5, audio: 2 });
  smoke.check("Both audio tracks occupied rejects detach without muting V1", !rejected.ok && rejected.reason === "overlap" && !full[0].audioDetached);
  smoke.check("Silent-source fixture cannot detach an audio stream", !model.applyTimelineEdit(input, [], "detach", "first", "audio", 30).ok);
}

// 右键事件使用公开DOM合成入口，不读取React闭包或调用Hook私有方法。
// 此辅助只驱动菜单，不冒称人工鼠标右键操作已经完成。
// 客户区坐标固定在窗口内部，公共菜单仍要经过实际Portal定位与聚焦。
// 菜单节点出现后才执行按钮，避免点击到另一份同名项目工具按钮。
// 片段ID来自真实入轨结果，同名视频也不会混淆目标。
// 图标、禁用原因与按钮标签都由正式组件渲染，不在测试里插入菜单HTML。
// 500、500是隔离窗口客户区坐标，不包含桌面原点与任务栏偏移。
// 该坐标不模拟鼠标移动轨迹，只把公开右键意图投递到已存在的片段按钮。
// 菜单回调仍接收到实际currentTarget，焦点恢复不会回到测试构造的假元素。
// bubbles让事件经过正常React事件分派，cancelable允许产品处理器阻止默认菜单。
// 等到菜单标记出现后再继续，React状态提交不是同步插入DOM的假设。
// 只等出现不等“分离成功”，后续动作仍必须触发自己的工程校验。
// 不同菜单调用均传实例ID，模板字符串中的UUID来自产品创建而非用户名称。
// UUID不含选择器引号，文件名中的空格不会影响这个菜单定位表达式。
// 查询限定data-live-clip-menu，避免误点系统标题栏或原版区间里的同名动作。
// 公共行的图标是装饰元素，选择器使用button和aria-label而不依赖SVG路径。
// 本辅助没有写入工程位置，所以后续起止对照仍来自生产提交。
// 如果右键事件误只打开菜单却未选中片段，随后的预览对象检查会暴露目标不符。
// 菜单行复用后仍保留原data标记，测试不需要查React内部组件名称。
// 文件名显示在菜单底部，与操作身份分离，不用末尾名称猜当前clipId。
// 人工鼠标右键仍属未验证；本函数的成功只证明公开处理链。
async function openLiveMenu(id) {
  await run(`document.querySelector('[data-editor-clip="${id}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:500,clientY:500}))`);
  await wait("document.querySelector('[data-live-clip-menu]')");
  // 初次挂载仍可能在opacity=0的入场帧，节点存在不能证明截图已显示菜单。
  // 等计算样式到1后再留一个有限绘制节拍，让capturePage取得当前表面。
  // 这次修复来自实际打开截图发现菜单尚未画出的证据，不掩盖任何业务失败。
  // 等待由上方有界wait负责，动画异常不能无限挂住整个回归。
  await wait("getComputedStyle(document.querySelector('[data-live-clip-menu]').parentElement).opacity==='1'");
  await delay(100);
}

// 分离操作只新增独立工程音轨，节目仍显示视频并保持强制静音。
// 当前没有音频总线，因此不能像旧单源模式那样切为audio并单独发声。
// 真实源试听继续在素材查看中进行，下面不把静音解码声称扬声器试听。
// 本轮节目统一静音，旧“选音轨就切成单源audio播放器”的预期已由用户要求替换。
// 改预期只针对新的声音契约，分离片段数量、独立ID和起止数据仍按原规则严格检查。
// 操作从真实AAC视频右键菜单发起，没有向片段数组手工塞audioOnly记录。
// 原视频仍留在同一工程，分离不应使其可视内容消失。
// 新音轨位于A1，音轨选择可以成为属性目标，却不能篡改视觉栈优先级。
// 安排仍使用原assetId，文件字节未被转成独立wav或从容器剪掉。
// 节目中无audio节点，避免用户误以为已经有多轨混音能力。
// 实际源视频仍可解码，播放后工程时间必须增长而非仅按钮换图标。
// 暂停后所有节目源必须paused，不能漏掉某个独立片段节点。
// muted检查读取每个节点，不能只检查默认的一个全局图标。
// 界面必须出现节目静音说明，让静音是明确状态而非用户猜测。
// 原分离标记必须使再次分离入口禁用，防止重复安排同一个原音轨。
// 分离后的音轨仍参加后续移动、复制与删除回归，不能通过永久禁用音轨来过关。
// 声音规则变更不改变音轨碰撞、源入点或轨道锁门槛。
// 素材库原件仍包含AAC，由合成helper单独检查原件试听按钮保留。
// 真实扬声器是否输出正确声音仍是人工待验项，静音自动测试不冒充试听。
// 截图保存分离后的真实节目和时间线，方便人工核对引用未丢失。
// 本组没有为减轻混音难题而删除音轨元数据或隐藏有AAC事实。
// 元数据hasAudio只是源能力，不表示本轮节目已经启用声音合成。
// 音轨选择后画面继续按工程书签，不退回到任意最近选中的视频源。
// 未来混音必须另定义总线、音量与播放同步，本组不提前搭建假实现。
// 已有音轨的属性编辑范围不因视觉合成开放而自动扩大。
// 下游checkAudioTrackEditing仍读取实际工程秒数，不能只检查DOM存在。
// 没有用静态音频图标代替分离真实引用的成功证明。
// 本组预期属于产品契约更新，后续历史记录保留旧单源试听当时行为但标为历史。
async function checkDetachedAudio() {
  const before = await clips(), first = before[0];
  await openLiveMenu(first.id);
  await click('[data-live-clip-menu] button[aria-label="分离音频到音频轨"]');
  await wait("document.querySelector('[data-program-composite]')?.dataset.programPhase==='ready'");
  const after = await clips(), audio = after.at(-1);
  smoke.check("AAC detaches to an independent A1 instance without replacing the visual programme", after.length === before.length + 1 && audio.id !== first.id && audio.start === first.start && audio.end === first.end && await run(`document.querySelector('[data-editor-clip="${audio.id}"]').closest('[data-editor-track-lane]').dataset.editorTrackLane==='A1'&&!!document.querySelector('[data-live-video]')&&!document.querySelector('[data-live-audio]')`));
  await click('[data-editor-region=R03] button[aria-label=播放]');
  await wait("Number(document.querySelector('[data-editor-playhead]').dataset.time)>.2");
  await click('[data-editor-region=R03] button[aria-label=暂停]');
  smoke.check("Detached programme remains explicitly muted without a second audio player", await run("[...document.querySelectorAll('[data-program-video]')].every(e=>e.paused&&e.muted)&&!document.querySelector('audio')&&document.querySelector('[data-editor-region=R03]').textContent.includes('节目静音')"));
  await screenshot("live-03-audio-detached");
  await openLiveMenu(first.id);
  smoke.check("Already detached video cannot create a duplicate audio stream", await run("document.querySelector('[data-live-clip-menu] button[aria-label=分离音频到音频轨]').disabled"));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await checkAudioTrackEditing(audio);
  await checkVideoDuplicate(first.id);
}

// 音频先合法移动一帧，证明后面的跨轨拒绝不是因为全部移动都失效。
// 键盘仍走共同帧门槛，源fps不能替代当前30fps工程的步长。
// 随后拖向V1，候选只能留在A1且无效，原音轨位置和其他片段都不变。
// DOM合成拖动是本组边界，不把它算作系统级原生拖放。
// 复制按钮应在A1末尾生成新ID，不把音频副本错误送回默认视频轨。
// 原音轨不删除，独立删除副本不能连带删除其源视频或其他同源实例。
// 然后对真实V1实例执行同样的复制与Delete，覆盖两个通道共同编辑入口。
// Delete只派发给聚焦片段，不通过全局document快捷键误删搜索中的内容。
// Shift+F10打开菜单用于验证生产按键映射，报告仍标注为合成键盘事件。
// Escape关闭后应恢复触发片段焦点，用户可继续原位逐帧移动。
// 菜单按需挂载，关闭后DOM中不保留隐藏副本影响Tab路径。
// 一个音频副本与一个视频副本分别操作，不能只凭同源文件名判断删除目标。
// 片段快照读取所有实例，比只检查数量更能发现误挪其他片段的问题。
// 菜单截图保留右键内容，便于核对实际禁用原因和可执行项目。
// 本组没有创建wav输出，也不点击仍禁用的导出或属性数值。
// 起点变化允许1e-7秒尾差，只用来比较1/30的二进制小数。
// 碰撞门槛没有使用这份浮点容差，它仍以整数帧作严格判定。
// 如果误按源30fps之外的帧率移动，起点差会偏离这个独立预期。
// 第一帧移动成功后再保存before，使跨轨拒绝必须保留已提交的新位置。
// 拖动目标22秒在当前视口内，不让“落在窗口外”替代跨轨拒绝的真实条件。
// hover时读取draft所属的lane，能区分固定原轨与跟着鼠标跑到V1两种表现。
// dataset.valid必须为false，所以留在A1的轮廓也不能误呈现合法落点。
// 松手之后比较整个数组JSON，不把hover无效当成最终提交也一定无效。
// 截图前重新打开音轨菜单，避免截到拖动残留轮廓冒充右键内容。
// 此时只有一段A1音轨，纯同轨末尾复制的新增记录也是DOM音轨组末项。
// 这个前置与视频复制不同；视频副本不能使用相同的at(-1)定位假设。
// 删除副本后原audio.id必须仍存在，发现按assetId批量删除的错误。
// Delete发送给document.activeElement，先focus目标才能覆盖片段局部快捷键。
// 若焦点仍停在菜单按钮，事件不会证明时间线片段Delete能力。
// 菜单键使用F10加shiftKey，和普通F10是两个不同的键盘入口。
// Escape派发到document让公共关闭监听运行，不直接把菜单节点移出DOM。
// 关闭后读取activeElement.dataset.editorClip，证明业务恢复了正确实例焦点。
// 不要求焦点回到素材行，因为右键目标是音轨安排而非原素材。
// 此处没有对按键repeat或系统输入法作额外结论，真实键盘路径仍需人工验收。
// 测试完成时保留原音轨，下一组视频复制有真实A1存在作为反例背景。
async function checkAudioTrackEditing(audio) {
  await checkReferenceAudio(audio.id);
  await keyMove(audio.id, "ArrowRight");
  smoke.check("Audio keyboard movement keeps its own track and one-frame precision", Math.abs((await clips()).find(item => item.id === audio.id).start - audio.start - 1 / 30) < 1e-7);
  const before = JSON.stringify(await clips());
  await beginDrag(`[data-editor-clip="${audio.id}"]`); await dragTo(await lanePoint(22, "V1"), false);
  smoke.check("Audio drag shows invalid placement when hovering over a video track", await run("document.querySelector('[data-timeline-draft]').closest('[data-editor-track-lane]').dataset.editorTrackLane==='V1'&&document.querySelector('[data-timeline-draft]').dataset.valid==='false'"));
  await dragTo(await lanePoint(22, "V1"));
  smoke.check("Cross-track audio drop never changes the committed arrangement", JSON.stringify(await clips()) === before);
  await openLiveMenu(audio.id); await screenshot("live-03-clip-menu");
  await click('[data-live-clip-menu] button[aria-label="复制到同轨末尾"]');
  const duplicate = (await clips()).at(-1);
  smoke.check("Audio duplicate appends with its own ID on A1", duplicate.id !== audio.id && await run(`document.querySelector('[data-editor-clip="${duplicate.id}"]').closest('[data-editor-track-lane]').dataset.editorTrackLane==='A1'`));
  await run(`document.querySelector('[data-editor-clip="${duplicate.id}"]').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}))`);
  smoke.check("Focused Delete removes only the duplicated audio instance", !(await clips()).some(item => item.id === duplicate.id) && (await clips()).some(item => item.id === audio.id));
  await run(`document.querySelector('[data-editor-clip="${audio.id}"]').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}))`);
  await wait("document.querySelector('[data-live-clip-menu]')");
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  smoke.check("Keyboard menu closes and restores the original clip focus", await run(`!document.querySelector('[data-live-clip-menu]')&&document.activeElement.dataset.editorClip==='${audio.id}'`));
}

// 视频实例与音频副本共享菜单动作，但仍各自保留原轨道与静音标记。
// 选取已分离的真实视频复制，能够反证副本不会偷偷恢复源声音。
// 末尾位置由同轨实际最大end决定，不能用三十秒视口末尾当放置点。
// 复制后立即检查长度保持，不能靠截短副本躲开碰撞。
// Delete只移除新副本，原视频与它的独立音轨都必须继续存在。
// 此时的源播放器应随选择与删除释放，不留下后台音视频同时播放。
// 菜单驱动仍使用公开DOM，系统右键和人工Delete继续单独列未验证。
// 后续导航清理沿用原回归，用来验证编辑后仍有未保存提醒。
// 素材库始终没有被菜单新增、复制或删除磁盘文件。
// 工程片段数量回到复制前，避免这个用例改变后续离开场景的业务前提。
// 这里进入时已有A1实例，因此DOM最后一个片段不一定属于V1。
// 先记录旧ID集合，再从新集合求差集，避免测试跟DOM分组顺序偶然绑定。
// 只允许找到新身份，不能把原视频当成副本而后误删原件。
// 副本被产品选中后预览会重新加载，因此先等真实video可显示再读声音按钮。
// V1所属轨从closest读取，不能用复制按钮的文字推断它真的放回了正确轨道。
// 静音禁用状态与V1归属一起判断，避免副本既跨轨又恢复声音却侥幸通过一项。
// 复制源虽已分离，副本仍引用同一视频asset，不能变成独立音频类型。
// 删除后片段总数回到before长度，是对副本生命周期的成对核对。
// 原id存在额外防止删错对象后恰巧仍保持同样数量。
// 这个断言不单独逐字段比较所有旧片段；完整重叠拒绝另有快照对照。
// 重新点原片段是导航清理用例的前置，不是为了挽救删除后遗失的选择。
// 未保存离开前必须确实存在一个播放器，否则清理断言会退化成检查空值。
// 恢复源查看不修改任何片段起止，之后仍可对照原工程时间。
// 测试不声称复制建立了磁盘文件；同源引用的源路径保持一份。
// 删除副本也不应删真实源文件，后续原件能达到readyState是额外使用证明。
// 若源文件被误删除，重新查看会报缺失或超时，而非静默换一张演示封面。
async function checkVideoDuplicate(id) {
  const before = await clips();
  await openLiveMenu(id); await click('[data-live-clip-menu] button[aria-label="复制到同轨末尾"]');
  // DOM按V1/A1/A2分组，不按创建顺序；用新增身份定位，不能取数组最后一项。
  // 原先取末项会误拿仍存在的音轨，导致菜单动作正确却被断言错认。
  // 此定位只读取前后差异，不改变复制位置、原时长或产品预期。
  const duplicate = (await clips()).find(item => !before.some(old => old.id === item.id));
  await wait("document.querySelector('[data-live-video]')?.readyState>=2");
  // 节目不再提供可解除静音的源按钮；副本仍须保持真实媒体全部静音。
  // 原复制位置、独立ID和删除保护继续按旧规则检查，声音新契约不放宽工程数据。
  smoke.check("Duplicated detached video stays on V1 and remains muted", await run(`document.querySelector('[data-editor-clip="${duplicate.id}"]').closest('[data-editor-track-lane]').dataset.editorTrackLane==='V1'&&[...document.querySelectorAll('[data-program-video]')].every(e=>e.muted)&&!document.querySelector('[data-editor-region=R03] button[aria-label=开启声音]')`));
  await run(`document.querySelector('[data-editor-clip="${duplicate.id}"]').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}))`);
  smoke.check("Deleting a video duplicate preserves the original video and independent audio", (await clips()).length === before.length && (await clips()).some(item => item.id === id));
  // 删除会关闭源查看；导航清理用例需要重新打开一个真实源作明确前置。
  // 若不重新选择，读取null播放器不能证明离开时真的释放了媒体资源。
  // 这一步不创建新片段，只恢复单源查看，工程快照保持已有安排。
  await click(`[data-editor-clip="${id}"]`); await wait("document.querySelector('[data-live-video]')?.readyState>=2");
}

// 前置保持竖屏素材行高亮，即使当前选中片段引用横屏源。
// 末尾添加按钮应使用素材选择，不能错误复制当前片段引用。
// 点击的是MediaPanel注入的公共动作，不在测试中调用创建命令。
// 本组保存创建前数组，预期只增加一个实例。
// 新起点等于所有旧end的最大值，不等于旧数组最后一项的start。
// 这个选择还能发现把素材总时长相加作为末尾的错误算法。
// 新实例引用的源可能与之前不同，长度按其真实时长转换到项目帧。
// 选择按钮可由键盘触达，但这里DOM click只验证其公开动作链。
// 真正系统Enter投递不在离屏自动化证据范围，最终报告须注明。
// 追加不要求用户拖到当前不可见的工程末端，提供无鼠标替代。
// 工程末端占位取整后应与前段相邻，没有浮点假重叠。
// 如果共同碰撞方法误把相邻边界算重叠，片段数量不会增加。
// 如果按钮未注入回调而仍被禁用，DOM click不会执行，同样会失败。
// 本组不以反馈文本“成功”为唯一依据，直接检查新增实例和起点。
// 追加后预览可以查看源，但不应自动开始播放。
// 函数不在这里执行播放，防止媒体输入状态干扰后续拖动边界回归。
async function checkAppendAndSource() {
  const before = await clips();
  await click('[data-editor-region="R02"] button[aria-label="添加到 V1 末尾"]');
  const after = await clips();
  smoke.check("Keyboard-accessible append creates a new instance at the actual project end", after.length === before.length + 1 && after.at(-1).start === Math.max(...before.map(item => item.end)));
}
// 播放回归在拖动用例后运行，使用本轮已经导入的真实横屏文件。
// 主动从素材行进入源查看，确保不是对静态节目画布误按一个装饰按钮。
// 先等待readyState至少2，表明浏览器已有真实可显示数据。
// 点击播放后等待currentTime超过0.25秒，不能仅观察按钮图标变成暂停。
// 媒体时间来自HTMLVideoElement，不由测试或产品定时器累加。
// 同时记录片段数量，单源播放不能额外创建或合成工程安排。
// 播放状态要求video.paused为false，证明play请求实际生效。
// 不把ffprobe成功当成浏览器能播放的证据，解码能力属于另一条链路。
// 暂停再次走公共预览控制条，最后检查video.paused为true。
// 这能发现按钮只更改React playing变量而未控制真实媒体的问题。
// 视频默认静音，测试不会在用户桌面播放提示音或音乐。
// 虽然样本带AAC音轨，音轨信息与扬声器实际发声不是同一个验收维度。
// 本组不推动工程播放头，仍是LIVE-01保留的单源预览能力。
// 节目合成播放、逐帧和帧导出保持禁用，不用源播放冒充它们。
// 暂停后保留当前源时间，后面的清理用例再确认卸载会释放src。
// 失败时由外层finally销毁当前测试窗口，避免遗留背景播放器。
async function checkRealPlayback() {
  await click('[data-editor-asset]');
  const after = await clips();
  await wait("document.querySelector('[data-live-video]').readyState>=2");
  await click('[data-editor-region="R03"] button[aria-label="播放"]');
  await wait("document.querySelector('[data-live-video]').currentTime>.25");
  smoke.check("Real source playback does not move the project playhead", await run("!document.querySelector('[data-live-video]').paused") && (await clips()).length === after.length);
  await click('[data-editor-region="R03"] button[aria-label="暂停"]');
  smoke.check("Pause still reports the real media state", await run("document.querySelector('[data-live-video]').paused"));
}

// 每个拒绝用例都保存完整快照，不能只根据片段数量不变判为安全。
// 覆盖松手失败、音频轨、跨会话和伪造身份，不调用内部校验函数替代UI入口。
// 所有负向用例从同一已提交工程快照出发，拒绝后应逐项保持不变。
// 第一例把首片段真正松手到重叠区，不只停在红色hover轮廓上。
// 若产品仅预览时校验而drop绕过校验，这一例会发现正式位置被改动。
// 第二例拖素材到A1，先检查无效轮廓和“仅可放入V1”的明确原因。
// 音频行同样接收over是为了提供反馈，不表示支持视频转音频。
// 随后真的在A1松手，预期既没有A1片段，也没有悄悄放回V1。
// 不能把拒绝理解成自动改投同时间上的视频轨。
// 第三例先通过真实源dragstart获得当前有效载荷，再只替换session。
// 保留kind和id，让失败确实来自会话隔离而非无关字段丢失。
// 跨会话正文即使引用现有素材，也不能提交到本页面工程。
// 第四例仅替换id为未知素材，当前会话仍正确。
// 如果drop盲信起点手势而不重读实际正文，伪造ID会错误创建片段。
// 两种篡改都只修改测试DataTransfer，不触碰生产素材数组或手势ref。
// 比较整个快照可发现数量不变但原片段被错移的情况。
// 同源另一个实例也必须保留，避免拒绝处理顺带影响全部同源记录。
// 无效drop之后仍发送dragend，检测失败清理不会卡住后续合法操作。
// 各用例依次执行，任何一次残留手势都可能使下一次身份验证失败。
// 负向反馈应归工程status，不覆盖导入摘要或删除素材元数据。
// 伪造payload的测试不是安全攻击保证，只覆盖本轮明确的会话与ID门槛。
// 本地路径不在载荷里，篡改JSON不能让渲染读任意磁盘文件。
// A1名称与V1编号由生产DOM读取，测试不会直接调用轨道内部分支。
// DOM事件命中由真实坐标决定，音轨的y值与V1相隔一个实际行高。
// 这能发现命中判断错误地一直把track当成V1的实现。
// 拒绝不应自动切分、覆盖或挤开已有实例，这些都超出本轮边界。
// 也不应因一次非法拖动清空整个工程，完整数组对照会捕获该回归。
// 若只是画红框而仍提交，重叠与音轨两例都会失败。
// 若只比较session而不比较起始id，第四例会失败。
// 若只比较id而不比较session，第三例会失败。
// 因此两个字段负向测试不能合成一个同时乱改所有字段的模糊场景。
async function checkRejectedDrops() {
  let before = JSON.stringify(await clips());
  const id = (await clips())[0].id;
  await beginDrag(`[data-editor-clip="${id}"]`); await dragTo(await lanePoint(9));
  smoke.check("Collision drop keeps every full interval without moving obstacles", JSON.stringify((await clips()).map(({ id, start, end }) => ({ id, start, end }))) === JSON.stringify(JSON.parse(before).map(({ id, start, end }) => ({ id, start, end }))));
  // 合法提交可改变当前选中实例；后面的非法载荷应保留这份最新选择和时间快照。
  before = JSON.stringify(await clips());
  await beginDrag('[data-editor-asset]'); await dragTo(await lanePoint(17, "A1"), false);
  smoke.check("Audio lane gives an explicit invalid target", await run("document.querySelector('[data-timeline-draft]')?.dataset.valid==='false'&&document.querySelector('[data-timeline-notice]').textContent.includes('视频只能放入视频轨')"));
  await dragTo(await lanePoint(17, "A1"));
  smoke.check("Video drop into A1 creates no audio or video clip", JSON.stringify(await clips()) === before);
  for (const patch of [{ session: "different-session" }, { id: "unknown-asset" }]) {
    await beginDrag('[data-editor-asset]');
    dragData = { ...dragData, items: dragData.items.map(item => item.mimeType.includes("illusion-realm") ? { ...item, data: JSON.stringify({ ...JSON.parse(item.data), ...patch }) } : item) };
    await dragTo(await lanePoint(18));
    smoke.check(`Forged payload rejected: ${Object.keys(patch)[0]}`, JSON.stringify(await clips()) === before);
  }
}

// 横滚操作真正改变浏览器滚动容器，落点由生产DOM矩形换算。
// 候选只读、项目扩张与收缩都以提交后的DOM秒数作证，不改片段style伪造位置。
// 本组把窗口设为1280×800，使时间线确实需要横向滚动。
// 滚动的是timelineScroll，而不是页面main或素材列表。
// scrollLeft设到末端由浏览器夹到真实最大值，不使用虚构滚动偏移。
// 拖入源仍是已存在的真实素材，避免导入等待影响坐标测试。
// 目标是工程22秒，放置后公开start必须精确为22。
// 如果重复加scrollLeft，起点会明显超前，不能靠视觉误差解释。
// 如果忽略横滚，起点会提前，数据断言同样失败。
// 新增片段拥有新ID，随后只以该ID定位它进行移动。
// 移动开始从片段中部抓取，继续覆盖偏移与横滚组合的场景。
// 手势开始后再次滚到当前末端，验证拖动期间读取最新lane矩形。
// 冻结的range不随hover变动，鼠标目标保持在同一把时间尺上。
// 目标起点32秒，鼠标要加上半段长度，不能直接落在32秒。
// 松手后实际总长应扩展到约35.27秒，而非旧的末尾约14.53秒。
// 信息条使用30fps时间码，35秒8帧作为当前样本的明确期望。
// 如果视口尾部十秒空白被误算进总长，信息条会与期望不同。
// 如果总长只增不减，后面的收缩反例会发现残留旧值。
// 扩张截图保留横滚后的标尺、片段和播放头，人工核对共同坐标。
// 再次抓同一实例，滚到中间可见范围并移到18秒空隙。
// 新末端约21.27秒，旧32秒位置不能作为隐藏历史片段继续撑大工程。
// 原先三个实例仍在更早位置，故新片段是决定工程末端的对象。
// 这个前置让收缩断言有明确因果，不被另一个更晚片段掩盖。
// 源视频长度保持约3.27秒占位，扩张与收缩都只是移动安排。
// 没有进行修剪，不允许靠缩短片段来满足总长断言。
// 测试用工程秒数表达目标，不使用页面左侧导航宽度常量。
// 因此导航或轨道头宽度改变时，坐标读法仍依据实际DOM。
// 截图只作视觉补充，精确帧尾仍由公开数据和信息条共同确认。
// 落点在可见lane内，不能通过直接对不可见DOM派发drop绕过命中。
// 前后窗口大小变化会取消已有手势，所以缩窗先于本组start。
// 本组不验证时间线缩放滑条，该业务继续禁用。
// 也不验证任意长工程性能，只覆盖当前真实短视频下的坐标正确性。
async function checkScrolledPlacement() {
  win.setSize(1280, 800); await delay(150);
  await run("document.querySelector('[data-editor-timeline-scroll]').scrollLeft=10000");
  const before = await clips();
  await beginDrag('[data-editor-asset]'); await dragTo(await lanePoint(22));
  const added = (await clips()).at(-1);
  smoke.check("Scrolled asset drop retains the exact engineering time", (await clips()).length === before.length + 1 && added.start === 22);
  await beginDrag(`[data-editor-clip="${added.id}"]`);
  await run("document.querySelector('[data-editor-timeline-scroll]').scrollLeft=10000");
  await dragTo(await lanePoint(32 + (added.end - added.start) / 2));
  const extended = (await clips()).find(item => item.id === added.id);
  // 项目时间码中最后两位是帧，不是百分之一秒。
  // 35秒8帧来自当前样本98帧占位加32秒起点。
  // 因此断言文本包含35:08，而不是按3.25四舍五入写成35:25。
  // 源帧率24或30不改变项目30fps时间码格式。
  // 时间线视觉范围此时会留尾部空白，但信息条不能显示这段空白。
  // 扩张后冻结比例释放，下一次手势才能读取新range。
  // 如果还沿用旧30秒分母，下一次18秒回移会出现错误落点。
  // 后续收缩反例因此也在间接检查手势结束后的比例恢复。
  // 窗口横滚可以改变lane.left，不能改变lane的工程零点含义。
  // 工程末端增长时标尺和播放头要一起读取新范围，截图供人工复核。
  // 时间码断言不承担视频编码精确时长的独立检验，元数据另有真实探测依据。
  // 这里关注的是已确认源长度到工程占位的确定换算。
  smoke.check("Scrolled move preserves its offset and expands project duration", extended.start === 32 && await run("document.querySelector('[data-editor-region=R10]').textContent.includes('00:00:35:08')"));
  await screenshot("live-02-scrolled-light");
  await beginDrag(`[data-editor-clip="${added.id}"]`);
  await run("document.querySelector('[data-editor-timeline-scroll]').scrollLeft=300");
  await dragTo(await lanePoint(18 + (added.end - added.start) / 2));
  smoke.check("Moving the last clip earlier shrinks actual project duration", (await clips()).find(item => item.id === added.id).start === 18 && await run("document.querySelector('[data-editor-region=R10]').textContent.includes('00:00:21:08')"));
}

// 开始前记录完整工程快照，自动滚动本身不应提交任何安排。
// 先回到scrollLeft零，确保右边仍有可滚动空间。
// 启动素材拖动而非片段移动，候选长度取真实源完整占位。
// 屏幕点选在clientWidth右侧内8px，避开垂直滚动条占据的边缘。
// 若直接用boundingRect.right减8，可能命中滚动条而非实际lane。
// 这种命中错误属于测试输入问题，不能据此修改产品碰撞逻辑。
// hover后等待scrollLeft超过20px，要求至少出现可观察的有限滚动。
// 1500ms窗口足以覆盖数个60ms节拍，超过说明自动滚动没有启动。
// 不通过直接设置scrollLeft来冒充自动滚动结果。
// 候选位置应由滚动后的lane矩形更新，正式clips仍保持快照。
// 接着发送Escape取消，再记录当时scrollLeft。
// 额外等200ms覆盖多个节拍，验证取消后的滚动真的停止。
// 如果只移除轮廓却忘清计时器，scrollLeft会继续变化而失败。
// 如果只清计时器却留下草稿，轮廓存在断言会失败。
// 完整clips对照还能发现自动滚动过程中误提交候选的问题。
// 下一例回到起始可见区域，抓首片段靠右的90%位置。
// 把鼠标放在工程0.1秒，减去抓取偏移后应得到负起点。
// 这是测试负起点的真实输入构造，不能直接往模型塞一个负数替代UI路径。
// 草稿start必须小于零且valid=false，不能静默夹到零后显示可放置。
// 固定status仍可提示非法位置，即使负轮廓一部分被边界裁切。
// 最后取消，不在左越界位置创建新实例或改变源文件。
// 本组只验证右边缘实际自动滚动与取消，左侧阈值另由代码及横滚回归核对。
// 没有宣称覆盖无限持续拖动，活跃期限仍受产品最后dragover时间限制。
// 没有使用rAF等待滚动，因此离屏或后台环境不会永远等待绘制通知。
// 计时器用于视口，不为视频生成假播放进度。
// 若滚动容器已经在最大值，step不能再产生位移，因此前置必须回零。
// 如果窗口太宽无需横滚，本测试会失败并要求修正前置而非降低断言。
// 取消后开始新的负起点手势也验证旧冻结range已经释放。
// 每次手势的取号身份独立，负起点用例不能借上次payload继续提交。
// DOM事件分支被明确标记，不将这些边界回归写成人工鼠标实测。
async function checkAutoScrollAndBoundary() {
  const before = JSON.stringify(await clips());
  await run("document.querySelector('[data-editor-timeline-scroll]').scrollLeft=0");
  await beginDrag('[data-editor-asset]');
  const point = await run("(()=>{const e=document.querySelector('[data-editor-timeline-scroll]'),r=e.getBoundingClientRect(),lane=document.querySelector('[data-editor-track-lane=V1]').getBoundingClientRect();return{x:r.left+e.clientWidth-8,y:lane.top+25}})()");
  await dragTo(point, false);
  await wait("document.querySelector('[data-editor-timeline-scroll]').scrollLeft>20", 1500);
  smoke.check("Hovering the edge performs bounded horizontal scrolling", await run("document.querySelector('[data-editor-timeline-scroll]').scrollLeft>0"));
  await cancelDrag();
  const scroll = await run("document.querySelector('[data-editor-timeline-scroll]').scrollLeft"); await delay(200);
  // 取消后等待跨越三个以上滚动节拍，足以发现未清理的interval。
  // 若只在事件处理当时暂时把step设零，后续tick仍可能继续滚动。
  // 记录的是取消完成后的scrollLeft，避免把最后一个正在完成的tick当回归。
  // 测试不要求滚动回零，因为取消安排不等于撤销用户浏览视口。
  // 原片段位置必须不变，但视口停在取消处是允许的。
  // 草稿消失与视口停止是两条独立资源清理断言。
  // 工程数组不变还排除“取消时自动提交最后有效位置”的实现。
  // 候选若曾是合法位置，也必须由用户明确松手才有提交。
  // 本组是素材创建手势，取消不能留下一个没有可见Card的空实例。
  // 下一步负起点从新的start开始，不能复用取消前的创建UUID继续入轨。
  smoke.check("Cancel stops automatic scrolling and never commits a candidate", await run(`document.querySelector('[data-editor-timeline-scroll]').scrollLeft===${scroll}&&!document.querySelector('[data-timeline-draft]')`) && JSON.stringify(await clips()) === before);
  await run("document.querySelector('[data-editor-timeline-scroll]').scrollLeft=0");
  await beginDrag(`[data-editor-clip="${(await clips())[0].id}"]`, .9);
  await dragTo(await lanePoint(.1), false);
  smoke.check("Negative start resolves to zero while preserving the complete duration", await run("Number(document.querySelector('[data-timeline-draft]').dataset.start)===0&&document.querySelector('[data-timeline-draft]').dataset.valid==='true'"));
  await cancelDrag();
}

// CDP文件路径由Chromium转换为真正File对象，再通过生产getPathForFile和ffprobe。
// 它证明外部Files分支与内部片段分支隔离，不冒充资源管理器的系统OLE手势。
// 用横屏样本复制一份新路径，避免重复路径去重阻止本次新增素材。
// 文件内容仍是真实编码视频，路径不同不会自动变成伪造元数据。
// 落点刻意选在V1内部，证明外部Files不会被当成内部入轨请求。
// 先记录素材数量与全部片段快照，再发送Chromium文件拖放数据。
// CDP的files字段提供实际磁盘路径，浏览器构造File交给页面。
// 页面必须通过生产getPathForFile取路径，测试不向渲染传任意Node接口。
// 内部专用MIME为空，轨道应放行到宿主统一导入流程。
// 如果宿主错误要求必须落在素材栏，本例落在V1时就不会新增素材。
// 如果时间线见到任意drop都创建片段，完整clips对照会失败。
// 等待导入busy结束，确认不是只增加一个仍在探测中的临时行。
// 新行文件名应为external-drop.mp4，并且ready可选择。
// 不只比较数量，以免另一条错误行或旧重复项误满足条件。
// 片段数组必须逐项相等，不能新增、移动或删除任何已有安排。
// 外部导入可以更新素材选择，这不代表允许改写片段选中状态。
// 此场景复用LIVE-01按钮导入所用的startImport和探测能力。
// 没有额外的“拖到时间线就导入并建片段”快捷业务。
// 源字节不由测试通过JS数组搬入内存，仍用生产本地媒体读取路径。
// 载荷本身来自CDP，所以只能证明文件路径分支，不等同Explorer OLE手势。
// 真实系统文件管理器拖入仍按用户桌面不可用的限制列为未验证。
// 不会为了补这项证据抢占系统鼠标或打开前台资源管理器。
async function checkExternalImport(horizontal) {
  const file = path.join(root, "external-drop.mp4"); fs.copyFileSync(horizontal, file);
  const before = JSON.stringify(await clips()), count = await run("document.querySelectorAll('[data-editor-asset]').length");
  const point = await lanePoint(17), data = { items: [], files: [file], dragOperationsMask: 1 };
  await win.webContents.debugger.sendCommand("Input.dispatchDragEvent", { type: "dragEnter", ...point, data });
  await win.webContents.debugger.sendCommand("Input.dispatchDragEvent", { type: "dragOver", ...point, data });
  // 外部文件拖过轨道也不能遮住节目，导入反馈应留在素材区域。
  // 这里截取的是尚未松手的真实工作区像素，能直接检查大遮罩是否残留。
  // 自动CDP文件载荷并非Explorer OLE拖入，最终记录继续保留此证据边界。
  // drop之后沿用原断言：只增加素材，不为用户擅自创建片段。
  // 截图不会改工程状态或媒体对象，不能通过卸载播放器消除遮罩。
  smoke.check("UI08: file hover never mounts a workspace import overlay", await run("![...document.querySelectorAll('[role=status]')].some(e=>e.textContent.includes('松开导入视频'))"));
  await screenshot("ui-08-file-hover");
  await win.webContents.debugger.sendCommand("Input.dispatchDragEvent", { type: "drop", ...point, data });
  await wait(`document.querySelectorAll('[data-editor-asset]').length===${count + 1}&&!document.querySelector('[data-editor-region=R02]').hasAttribute('aria-busy')`);
  smoke.check("External file dropped over V1 only imports a real asset", JSON.stringify(await clips()) === before && await run("[...document.querySelectorAll('[data-editor-asset]')].some(e=>e.title==='external-drop.mp4'&&!e.disabled)"));
}

// 布局变化取消保护的是冻结比例，不能把旧像素尺度带到新容器。
// 此例特意不调整窗口，而是通过已有导航按钮改变实际工作区宽度。
// window.resize不一定触发，所以仅注册窗口事件的实现会在这里留下草稿。
// 前置已有真实片段，取消后完整工程仍应保持相同起止和身份。
// 素材拖入手势只发布候选，尚未创建新实例。
// 导航按钮走生产状态和动画，不直接修改timeline的CSS宽度。
// 等待450ms覆盖原导航开合动画，避免把中途尺寸当最终结果。
// ResizeObserver初次通知不应误取消，先能观察到draft才执行导航点击。
// 观察器在实际宽度变化后结束手势，草稿消失是公开可观察结果。
// 工程数组不变排除“缩容器时顺便提交最后候选”的错误处理。
// 取消不应把已提交片段按新宽度改成另一组秒数。
// 导航收起只是布局行为，不属于导入、探测或播放器控制。
// 测试后再次点击恢复原导航，后续截图保持已确认视觉方向。
// 恢复时没有活跃手势，不应触发旧观察器写入或残留反馈。
// 该回归覆盖容器宽度变化，不代表实现拖动时间线缩放工具。
// 窗口纵向缩小的取消仍由已有resize监听处理，与此处职责不同。
// 两个机制共用abort，所以都不会修改正式clips快照。
// 元素选择以data-sidebar-toggle为准，不依赖当前语言按钮文本。
// DOM点击属于公开UI自动化，不能写成人工系统鼠标操作。
// 这个场景与横滚反例互补：横滚不改宽度，所以不应触发取消。
// 如果观察了grid内容长度而不是视口，工程扩张可能误取消合法提交。
// 前面的工程扩张已通过，结合本例确认观察对象的边界正确。
// 未接多轨或修剪，因此不用重建所有片段来适配新布局。
// 新布局下重新开始手势会读取新矩形，当前这份旧手势直接作废。
// 本函数不保留源事件对象，导航后不向已卸载节点继续投递drop。
// 后续合法外部导入继续执行，用来观察取消没有锁死整个工作区。
// 所有操作仍在同一正式会话中，不能靠重新加载页面清掉草稿蒙混通过。
// 取消后没有清空素材列表，源文件仍可供用户重新拖动。
async function checkLayoutCancellation() {
  const before = JSON.stringify(await clips());
  await beginDrag('[data-editor-asset]'); await dragTo(await lanePoint(2), false);
  await wait("document.querySelector('[data-timeline-draft]')");
  await click('[data-sidebar-toggle]'); await delay(450);
  smoke.check("Navigation width change cancels the frozen gesture without mutating clips", !(await run("!!document.querySelector('[data-timeline-draft]')")) && JSON.stringify(await clips()) === before);
  await click('[data-sidebar-toggle]'); await delay(450);
}

// 已有多个片段后再执行导入失败，能发现失败清理误清工程的回归。
// 先记录素材数量和工程快照，两类状态都要保持原有成功内容。
// 空selection表示用户取消系统选择框，不应产生失败素材或新片段。
// 重复横屏路径应走正式去重，不再次探测并加入相同素材。
// 两次操作后素材数量不变，工程快照也必须完全相同。
// 随后创建扩展名为mp4但字节不是视频的实际文件。
// 生产ffprobe应返回探测失败，不能依扩展名给出默认时长假成功。
// 坏文件行允许保留用于解释失败，但必须disabled，不能拖入V1。
// 已有成功行与真实元数据不能因坏文件失败而被清空。
// 工程数组不能依“最近导入失败”重置为空，已有安排仍有效。
// 预期的ffprobe错误会出现在主进程日志，这是被测错误分支而非脚本崩溃。
// 测试不能因为出现该日志就跳过后续断言，也不能吞掉无关渲染错误。
// 扩展名拒绝与容器探测失败是不同状态，LIVE-01回归另外覆盖混合非法文件。
// 本组只使用一个小损坏文件，不模拟磁盘断开或权限失败。
// 失败后busy必须结束，importFiles中的条件等待会捕获永久加载问题。
// 每次导入仍从项目栏按钮进入，没有绕过统一导入流程。
// 坏行的disabled只说明不可选择/入轨，不表示已经删除磁盘文件。
// 本轮不增加自动重试或修复视频业务，避免超出LIVE-02范围。
async function checkImportFailures(horizontal) {
  const before = JSON.stringify(await clips()), count = await run("document.querySelectorAll('[data-editor-asset]').length");
  await importFiles([]); await importFiles([horizontal]);
  smoke.check("Cancel and duplicate keep imported assets and timeline intact", await run(`document.querySelectorAll('[data-editor-asset]').length===${count}`) && JSON.stringify(await clips()) === before);
  const broken = path.join(root, "broken.mp4"); fs.writeFileSync(broken, "not a video");
  await importFiles([broken]);
  // 损坏样本使用真实文件而非reject Promise替身，错误来自生产ffprobe。
  // 期望失败行可见并禁用，用户能理解是哪个导入没有完成。
  // 失败不能转成0秒ready片段，否则键盘末尾添加可能错误接受它。
  // 已有素材的成功元数据仍由原记录拥有，不使用新失败结果整体覆盖。
  // 这里用工程完整快照守住跨模块边界，导入错误只影响该素材任务。
  // 不能因为模型路径或网络等无关错误而重置时间线。
  // 错误文案不承担异常栈展示，用户看到的是可理解的失败状态。
  // 主进程日志保留诊断，测试把它当预期负向分支而不是忽略整个失败步骤。
  // 坏文件不在磁盘上被自动删除，本轮仅管理导入与预览，不做清理文件功能。
  // 后续主题与播放测试继续使用成功素材，证明失败后的界面仍可工作。
  smoke.check("Probe failure preserves all existing clips and real metadata", await run("[...document.querySelectorAll('[data-editor-asset]')].find(e=>e.title==='broken.mp4')?.disabled") && JSON.stringify(await clips()) === before);
}

// 在已有真实片段和素材后切深色，不能只用空工程检查主题。
// 主题通过nativeTheme.themeSource驱动，沿用项目正式机制。
// 短延时等待主题信号应用，截图内容仍由真实BrowserWindow生成。
// 深色截图保留时间线实例，供人工核对轮廓和选中边框的可见性。
// 窄窗设为960×720，验证主操作没有被隐藏面板一同移除。
// 项目栏导入按钮仍可用，是素材区收起后的真实替代入口。
// 时间线scrollWidth应大于clientWidth，证明窄屏通过内部横滚承载工程。
// 如果整体main变宽横向溢出，不能把它当成正确时间线滚动。
// 素材与属性的响应式隐藏仍属于原UI骨架，不新建另一套移动布局。
// 返回节目通过既有公共动作，必须卸载实际video元素。
// 先保留旧video引用，才能在卸载后检查paused与src清理。
// 只看页面没有video不足以证明旧媒体已释放，脱离DOM也可能继续播放。
// 清理后旧源应暂停且没有src，避免继续占用本地媒体流。
// 这一步不删除素材，也不取消片段选择，工程安排保留。
// 节目预览仍是静态画面，本轮不把返回后的它描述成可合成播放。
// 逐帧与修剪由后续能力接通，导出仍须保持原生disabled。
// 窄截图不是系统DPR缩放证据，100/125/150%桌面缩放仍未在本轮实测。
// 深浅切换后不重置资产ID，主题不应导致重新导入或生成第二份实例。
// 媒体像素不受主题滤镜处理，测试图原色可直接与浅色截图对照。
// 最后返回节目也为后续播放测试建立清楚的源查看入口。
async function checkThemesAndCleanup() {
  // AppShell同时维护主题意图，直接改nativeTheme不会替代用户菜单选择。
  // 因此从生产外观菜单选深色，再核对根节点实际主题，不能只凭文件名叫dark。
  // 主题动画结束后截图，避免把浅色转场中间帧当作最终深色证据。
  // 原有LIVE-01主题回归也走相同菜单，保持两组运行的验证口径一致。
  // 此处点击会经过正式主题IPC，测试不直接写documentElement.dataset。
  // 前一版截图复核发现颜色仍浅，故修正驱动并保留实际主题断言。
  // 根节点和媒体画面颜色分别核查，主题不应给视频本身添加滤镜。
  // 主题切换不改变工程快照，后续窄窗仍展示相同片段。
  // 这个用例证明浅深切换在正式宿主生效，不代表系统缩放或遮挡维度。
  // 截图仍由capturePage取得，不对PNG后期染色制造深色效果。
  await click('[data-theme-trigger]'); await wait("document.querySelector('[data-theme-option=dark]')");
  await click('[data-theme-option=dark]');
  await wait("document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('theme-ripple')");
  smoke.check("Dark theme is applied by the real appearance menu", await run("document.documentElement.dataset.theme==='dark'"));
  // 选择主题会保留外观菜单，截图前通过同一个公开触发器关闭。
  // 不能裁掉或后期擦除菜单，否则无法核对真实时间线的主题外观。
  // 关闭状态另行等待，避免截图恰好捕获浮层退出动画。
  // 业务片段不会因菜单关闭而重建，深色图仍是同一份真实工程。
  // 外观浮层属于AppShell，测试只使用公开按钮而不修改它的DOM样式。
  await click('[data-theme-trigger]'); await wait("document.querySelector('[data-theme-trigger]').getAttribute('aria-expanded')==='false'");
  await screenshot("live-02-final-dark");
  await checkLiveSizes();
  win.setSize(960, 720); await delay(160); await screenshot("live-02-narrow-dark");
  smoke.check("Narrow editor retains reachable project import and timeline scrolling", await run("!document.querySelector('[data-editor-region=R01] button[aria-label=导入素材]').disabled&&document.querySelector('[data-editor-timeline-scroll]').scrollWidth>document.querySelector('[data-editor-timeline-scroll]').clientWidth"));
  // 先明确进入就绪源查看，不能让坏文件后的空预览使清理断言空真。
  await click('[data-editor-asset]');
  await wait("document.querySelector('[data-live-video]')?.readyState>=2");
  await run("window.__oldSource=document.querySelector('[data-live-video]');document.querySelector('[data-editor-region=R03] button[aria-label=返回节目预览]').click()");
  await wait("document.querySelector('[data-editor-region=R03]').dataset.editorPreviewMode==='program'&&!window.__oldSource.hasAttribute('src')");
  smoke.check("Returning to program releases the real source player", await run("document.querySelector('[data-editor-region=R03]').dataset.editorPreviewMode==='program'&&(!window.__oldSource||window.__oldSource.paused&&!window.__oldSource.hasAttribute('src'))"));
}

// LIVE-03补齐正式工程的三种目标容器，不用静态样板替代真实导入布局。
// 目标尺寸指编辑器host，不是含导航和标题栏的整个BrowserWindow。
// 因此像量家具前先扣墙厚，先量外壳占用，再反算需要的客户区尺寸。
// 两次校准容纳导航断点与布局提交，不能无限调整直到偶然得到好图。
// 这里只改变隔离窗口大小，不写产品style，不覆盖容器查询断点。
// 每次保留350ms真实布局时间，最终仍用几何条件判断而非睡够就算通过。
// 1600宽应有三栏，1280也保留属性，960应由既有策略隐藏两侧栏。
// 隐藏素材区时项目栏导入按钮仍必须可用，不能因侧栏消失断掉导入入口。
// R10底边与host底边相符，能发现播放器把项目状态挤到下面的回归。
// 工作区宽度允许1px舍入，但不能把时间线外溢算作正常内部横滚。
// 时间线自身可以scrollWidth更大，它的横滚容器和外层越界是两回事。
// 真实素材和片段数量在缩窗前后核对，防止响应式变化偷偷重建会话。
// 选中状态另由原有隔离回归保护，这里不使用选中触发重新导入。
// light与dark分别在真实外观菜单切换之后调用，本函数不设置主题替身。
// 记录实际主题和DPR，不能只凭文件名包含dark就宣称深色截图通过。
// DPR只是浏览器当前值，不能把窗口大小测试描述成修改系统缩放。
// 六张截图来自带真实素材和片段的正式入口，含宿主导航及窗口控制。
// 无后期裁切或尺寸缩放，因此PNG尺寸比目标host更大属于正确外壳占用。
// 同主题结果写一个JSON，保留host尺寸与列表数，方便第三方复核。
// 该记录没有私人媒体路径，测试文件名也只来自隔离临时目录。
// 结束恢复原来的1600×1000窗口，避免改变后续窄窗和播放测试的前提。
// 它不是全局屏幕设置，不会改变用户正在使用的前台程序分辨率。
// 离屏渲染能检查真实布局，但不能证明前台遮挡、系统鼠标或人工观感。
// 素材区收起后的临时展开仍属UI-07，本轮不启用原本禁用的面板入口。
// 片段布局仍用正式range，缩窗不允许通过缩短源或改变start/end来适配。
// 每个主题保存一份独立JSON，六张截图可据theme和width准确对应数据行。
// 容器目标与窗口尺寸分开记录，AppShell占用不能被误算成编辑器区域。
// 内容宽度允许0.25等亚像素值，1px容差用于系统布局舍入而非隐藏真实溢出。
// 如果导入按钮只在被隐藏素材栏里，960宽时importEnabled或可见布局会暴露入口问题。
// 保留clips计数是为了检测响应式切换错误地重建了空工程。
// 检查不只对比截图，因为黑色预览可以掩盖属性栏已经越界的情况。
// footerFits证明信息条在工作区底部，而不是依赖绝对定位飘到应用状态栏外。
// headerClear读取共享标题DOM，因此素材查看和节目查看使用同一套排版规则。
// 两遍补偿只为了导航形态稳定，不是不断重试直到某个业务断言碰巧成功。
// 尺寸最终由事实行打印，若目标未达到仍会失败，不能用窗口设值返回成功代替。
// setContentSize之后的有限delay等待样式过渡，后续几何断言仍决定是否通过。
// 当前DPR为1的六尺寸组合不能推导系统125%缩放也通过。
// 主题信号来自产品原生主题流程，测试没有覆盖一个独立dark CSS类。
// 结束后恢复窗口尺寸，音轨菜单截图不继承960窄窗的隐藏侧栏。
// 未改变浏览器zoomFactor，因此这组是容器适配，不是整体缩放截图。
async function checkLiveSizes() {
  // 当前这份工程包含探测失败素材行，长错误内容也会一起进入尺寸截图。
  // 数量比较取已提交片段，hover候选的轮廓不是工程记录，不能混入计数。
  // 三尺寸按从宽到窄执行，能覆盖同一实例跨过两个容器查询断点的变化。
  // 恢复窗口以后深色再走同样路径，能发现主题切换造成的最小宽度差异。
  // 截图前没有重载路由，已有素材、封面、片段都保留原来的实际身份。
  // facts按目标尺寸顺序保存，截图文件名和JSON行可以一一核对。
  const theme = await run("document.documentElement.dataset.theme"), facts = [];
  const count = (await clips()).length;
  for (const [width, height] of [[1600, 1000], [1280, 800], [960, 720]]) {
    for (let pass = 0; pass < 2; pass += 1) {
      // innerWidth是页面客户区宽度，减去host得到的是应用外壳实际横向占用。
      // 标题栏与底部状态占用反映在innerHeight和host高度之差里，单独补偿。
      // setContentSize接收整数像素；host边框可能保留小数，故最终允许1px误差。
      // 这项像素容差只用于布局，不会套用到片段的整数帧碰撞断言中。
      // 第一遍设窗口可能让导航改变形态，第二遍按新的实际占用重新校准。
      // 不把固定导航宽度塞进公式，避免导航开合后把同一宽度减两次。
      const inset = await run("(()=>{const r=document.querySelector('[data-live-video-session]').getBoundingClientRect();return {width:innerWidth-r.width,height:innerHeight-r.height}})()");
      win.setContentSize(Math.round(width + inset.width), Math.round(height + inset.height));
      await delay(350);
    }
    const fact = await run("(()=>{const h=document.querySelector('[data-live-video-session]'),r=h.getBoundingClientRect(),f=h.querySelector('[data-editor-region=R10]').getBoundingClientRect(),visible=s=>document.querySelector(s).getBoundingClientRect().width>0;return {width:r.width,height:r.height,overflow:h.firstElementChild.scrollWidth>h.clientWidth+1,footerFits:Math.abs(f.bottom-r.bottom)<1,importEnabled:!h.querySelector('[data-editor-region=R01] button[aria-label=导入素材]').disabled,mediaVisible:visible('[data-editor-region=R02]'),inspectorVisible:visible('[data-editor-region=R04]'),clips:h.querySelectorAll('[data-editor-clip]').length,dpr:devicePixelRatio,theme:document.documentElement.dataset.theme}})()");
    facts.push(fact);
    // 文件名与按钮同时存在时比较实际矩形，能抓住本轮截图发现的窄窗压字。
    // 按钮隐藏时其宽度为零，不要求名称向不存在的控件让出空白。
    // 检查公共标题行，不按英文或中文名称去猜按钮的固定像素宽度。
    fact.headerClear = await run("(()=>{const h=document.querySelector('[data-editor-region=R03] header'),name=h.querySelector(':scope > span').getBoundingClientRect(),actions=h.lastElementChild.getBoundingClientRect();return actions.width===0||name.right<=actions.left+1})()");
    // 1280是属性区保留的边界值，使用>=而非>可抓住断点少一像素的回归。
    // 960时两个侧栏的DOM可以保留，但其盒子宽度必须为零，才算实际隐藏。
    // footerFits核对全局位置差，避免单看元素存在却被父容器裁掉的假通过。
    // importEnabled读取原生disabled，不只判断按钮文字或禁用颜色。
    // 外观主题与devicePixelRatio附在每行，后续无需从整张图猜环境配置。
    // 冒烟harness分别登记六条断言，某一主题失败不能被另一主题通过抵扣。
    smoke.check(`${theme} live host ${width}x${height} retains layout and clips`, Math.abs(fact.width - width) <= 1 && Math.abs(fact.height - height) <= 1 && !fact.overflow && fact.footerFits && fact.headerClear && fact.importEnabled && fact.clips === count && fact.mediaVisible === (width >= 1040) && fact.inspectorVisible === (width >= 1280));
    await screenshot(`live-03-${theme}-${width}x${height}`);
  }
  fs.writeFileSync(path.join(root, `layout-${theme}.json`), JSON.stringify(facts, null, 2));
  win.setSize(1600, 1000);
  await delay(180);
}

// 确认框的用户回答是显式夹具，路由切换和播放器卸载仍执行生产代码。
// 取消时不能丢片段，确认后不能把旧会话带入样板或返回后的空工程。
// 页面已有真实片段时点击样板导航，应先提示未保存工程。
// 确认框回答由测试替身控制，避免弹出系统模态窗口阻塞当前桌面。
// 回答false时原路由必须保留，完整工程快照不能改变。
// 这个反例能发现确认框显示了但Next链接仍继续跳转的问题。
// 捕获阶段阻止默认行为和传播是该保留语义的实际实现。
// 回答true时不由测试直接改URL，而是再次点击同一公开导航链接。
// 等待正式会话节点卸载，确认路由确实通过原Next链接发生切换。
// 旧播放器引用在切换前保存，离开后检查暂停且移除src。
// 旧源即使相同路径也不能在样板背后继续读取或播放。
// 样板不应继承真实会话的clips，业务和演示状态各有生命周期。
// 随后重新加载正式入口，应该得到新的空素材库和空V1。
// 空工程同时没有draft，证明手势展示也没有跨会话残留。
// 新会话并非工程恢复，这符合本轮没有保存或持久化的边界。
// 如果旧clips保存在模块级单例或错误全局store，返回空态断言会失败。
// 如果只清播放器但保留旧素材列表，素材数量断言会失败。
// 本例通过路由清理，不操作用户真实窗口的关闭按钮。
// 系统beforeunload对话框与强制进程退出不是本例覆盖范围。
// 确认替身仅存在本隔离页面，重新load后随文档一起消失。
// 取消导航不应自动停止或删除当前工程，用户仍可继续编辑。
// 确认离开也不能伪造“保存成功”，用户始终看到未保存边界。
async function checkNavigationCleanup() {
  const before = JSON.stringify(await clips());
  await run("window.__oldSource=document.querySelector('[data-live-video]');window.confirm=()=>false;document.querySelector('[data-editor-region=R01] a[href=\"/tools/video/editor/samples\"]').click()");
  smoke.check("Cancelling unsaved navigation preserves the live project", JSON.stringify(await clips()) === before && await run("!!document.querySelector('[data-live-video-session]')"));
  // 确认离开后使用生产路由链接，所以beforeunload并非唯一保护点。
  // Next页面内导航可能不触发完整文档卸载，捕获click仍必须有效。
  // 取消反例先运行，证明同一个链接在不同回答下具有不同结果。
  // 确认反例随后运行，证明保护逻辑没有把导航永久锁死。
  // 旧源引用只在测试页面window上短暂保存，用于确认清理事实。
  // 重载文档后这个引用自然消失，测试不会持久化真实媒体对象。
  // 返回新工程时没有DEMO片段混入，也没有旧真实片段被错误保留。
  // 空态检查包括素材和轮廓，防止只清工程数组却遗留旧导入会话。
  // 页面生命周期回归不等同系统崩溃恢复，本轮没有保存文件可以恢复。
  // 用户确认的行为是放弃临时安排，界面不能暗示已经写盘。
  await run("window.confirm=()=>true;document.querySelector('[data-editor-region=R01] a[href=\"/tools/video/editor/samples\"]').click()");
  await wait("!document.querySelector('[data-live-video-session]')");
  smoke.check("Confirmed navigation releases the source player", await run("window.__oldSource.paused&&!window.__oldSource.hasAttribute('src')"));
  await win.loadURL("app://app/tools/video/editor");
  await wait("document.querySelector('[data-live-video-session]')");
  smoke.check("Returning creates an empty independent project without stale clips", await run("document.querySelectorAll('[data-editor-clip]').length===0&&document.querySelectorAll('[data-editor-asset]').length===0&&!document.querySelector('[data-timeline-draft]')"));
}

// 窗口使用现有windowChrome配置与附加参数，避免截图复制另一套标题栏。
// preload从生产入口加载，contextIsolation与nodeIntegration保持正式隔离边界。
// sandbox配置沿用项目CommonJS preload要求，不为测试扩展Node到页面。
// backgroundThrottling:false确保媒体等待不因窗口隐藏被无限推迟。
// show:false与offscreen:true明确表示离屏验证，不声称做了遮挡窗口维度。
// 测试只管理自己的win，不枚举或终止用户已运行的客户端。
// 先注册chrome处理与harness，再加载正式app协议页面。
// debugger附加仅服务输入和证据采集，不读取React内部组件树。
// console-message捕获error级别，最后统一断言没有渲染与水合错误。
// 媒体探测预期失败在主进程记录，不应被混同成渲染初始化异常。
// Input.setInterceptDrags必须在页面加载后启用，空renderer上命令可能悬挂。
// 前一轮超时正发生在加载前发Emulation命令，因此保留明确步骤日志。
// 日志区分加载正式页、renderer就绪与导入真实媒体，便于定位未来超时。
// FocusEmulation只服务隔离页输入，不会把系统前台焦点从用户应用抢走。
// 正式会话节点出现后再继续，不能在骨架尚未挂载时点击导入。
// 首次更新公告通过真实关闭按钮处理，不用CSS隐藏覆盖层蒙混截图。
// 公告关闭不改变编辑器业务，随后所有动作仍在正式路由执行。
// 初始主题由main设置浅色，移动前后截图处于同一配色便于对照。
// 窗口1600×1000是运行尺寸，不是把另一张图片缩放到该尺寸。
// 播放器仍用localfile生产协议，未开启webSecurity:false绕过媒体边界。
// 注册完的webContents由harness接管单步超时与退出码保护。
// setup失败由外层catch清理窗口，不能把初始化失败记作零断言通过。
async function setup() {
  win = new BrowserWindow({ ...chrome.windowChromeOptions(), width: 1600, height: 1000, show: false, webPreferences: { additionalArguments: chrome.windowChromeArguments(), preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), sandbox: false, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } });
  chrome.registerWindowChrome(win); smoke.attachWebContents(win.webContents);
  win.webContents.on("console-message", event => { if (event.level === "error") rendererErrors.push(event.message); });
  win.webContents.debugger.attach("1.3");
  win.webContents.debugger.on("message", (_event, method, params) => { if (method === "Input.dragIntercepted") dragData = params.data; });
  console.log("LIVE02_STEP load formal page");
  // 先loadURL再发CDP输入命令，是当前驱动初始化的重要顺序约束。
  // 空白webContents附加debugger不代表已经存在可执行Emulation的页面目标。
  // 之前加载前发该命令曾触发180秒看门狗，不能把超时写成成功或SKIP。
  // 步骤日志保留这次定位结论，未来若再挂起可直接分清加载与输入初始化。
  // 页面加载完成后仍等待业务会话节点，避免路由HTML已到但React尚未挂载。
  // 输入命令没有为页面增加Node能力，只控制隔离窗口中的浏览器输入。
  // 对话框关闭使用既有公开按钮，首次公告不应遮住拖动起点。
  // 若公告未真正退出，elementFromPoint会暴露命中遮挡，原生拖动不会产生payload。
  // 不能通过CSS强制隐藏公告来掩盖焦点或遮挡问题。
  // 截图时公告已经关闭，展示的是本轮被测工作区本身。
  await win.loadURL("app://app/tools/video/editor");
  console.log("LIVE02_STEP renderer ready");
  await win.webContents.debugger.sendCommand("Input.setInterceptDrags", { enabled: true });
  await win.webContents.debugger.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: true });
  await wait("document.querySelector('[data-live-video-session]')");
  await delay(500); await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
}
// 先检查构建内容指纹，防止测试运行旧out却声称验证了新源码。
// 指纹不一致应停止并重建，不用忽略开关跳过这一前提。
// 两个真实视频生成完成后才创建页面，导入不会遇到仍在写入的文件。
// 导入后先核对不同尺寸、帧率和音轨，确认元数据不是演示默认值。
// 随后按创建、移动、取消、键盘、拒绝、横滚的顺序执行工程场景。
// 各场景共用一个真实会话，使已有片段保留与状态隔离有实际前置。
// 外部导入与坏文件测试放在已有工程后，能够检测误清空安排的问题。
// 主题和窄窗验证沿用同一批真实视频，不切到另外一个静态展示页。
// 真实播放最后执行，避免离屏浏览器输入驱动限制污染核心拖动证据。
// 清理测试在路由切换中验证播放器释放，最终返回正式空工程。
// 每一项check都计入最终结果，不能由最后一次截图或日志覆盖失败。
// finally销毁当前测试窗口，断言抛错也不会留下继续播放的实例。
// main外层catch同样处理setup前失败，win尚未存在时也能安全报告。
// 工作目录输出便于复制截图与核对样本，不要求用户自行找临时文件。
// LIVE-03仅扩充验收证据；脚本不推进属性编辑或后续产品功能。
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app }); nativeTheme.themeSource = "light";
  const horizontal = makeVideo("landscape-audio.mp4", "640x360", 30, true), vertical = makeVideo("portrait-silent.mp4", "360x640", 24, false);
  await setup();
  try {
    await checkFormalFlows(horizontal, vertical);
  // 这条错误收集覆盖导入、拖动、主题、缩窗和路由清理全流程。
  // 如果React水合不一致导致事件偶尔不工作，不能只靠最终位置通过就忽略。
  // 错误数组只收渲染console error，不把预期ffprobe主进程stderr混入。
  // 也不把warning直接当通过依据，样式告警仍由lint单独报告。
  // 没有维护宽泛忽略名单，未知渲染错误会让本轮失败。
  // 捕获器注册在loadURL之前，首帧初始化错误也能被记录。
  // 导航到样板后监听仍在同一webContents，不会漏掉离开期间异常。
  // 重载正式页后的错误也属于本轮收集范围。
  // 若新增预期解码失败用例，应先明确其日志边界，不能简单屏蔽所有media错误。
  // 当前LIVE-02失败样本只触发探测失败，不需要预期浏览器console error。
  // 这条通过不代替对截图的人工视觉检查，布局错位可能没有任何异常日志。
  // 也不代替主进程类型检查，Electron服务错误可能不会出现在渲染console。
    smoke.check("No renderer or hydration errors in the live timeline flow", rendererErrors.length === 0);
    console.log("LIVE02_MEDIA_ROOT", root);
  } finally { win.destroy(); }
  smoke.finish({ app, ok: smoke.allPassed() });
}
// 生命周期由main持有，场景顺序集中在这里，失败仍由main的finally清理窗口。
// 先核对原LIVE-01/02，再运行追加菜单场景，避免新功能掩盖旧入口回归。
// 片段创建与移动必须在样本真正导入之后，不能从演示工程偷取默认安排。
// 浅深尺寸截图先保留原LIVE-02工程，音轨分离截图另用专属文件名。
// 最后才离开页面，确保未保存提醒、播放器释放和空会话返回覆盖编辑后的工程。
// 这里只编排有限场景，不更改产品状态，也不把重试当作修复失败的办法。
// 专项模式只用于缩小诊断，输出更少断言，不能代替最终全场景回归。
// 同一合成入口在诊断和完整流程末尾调用，避免两条路径传不同媒体能力。
// 旧filmstrip诊断模式仍保留，未设置变量时不会跳过历史场景。
// 诊断开关只存在测试驱动中，正式应用不读取这些环境变量来切换功能。
// 默认未设置时返回false，后面的全部历史操作链仍逐项执行。
// 针对filmstrip的旧开关优先检查，保留原工具开发的诊断入口。
// 针对合成的开关只跳过其他场景，仍经过真实导入和基础片段创建前置。
// 返回true让调用方明确结束本次诊断，不把剩余场景误报为已执行。
// 日志总数由harness实际check累加，不能写死最终通过数量。
// 诊断使用相同静态构建指纹，不能绕过产物新鲜度前提。
// 它不会关闭失败计数，所以先前的导入或基础断言失败依然使整轮非零退出。
// 专项诊断不能被最终交付当成完整回归，最终应删除变量再运行全部链。
// 两种诊断不会同时开窗口，也不会与公共UI套件并行。
// 这次拆分是为了保留主流程三十行限制，职责是明确决定是否运行诊断模式。
// 没有把多个业务命令压进单行绕过长度检查，helper执行链仍可独立阅读。
// 诊断返回值不参与产品业务，不能把true解释为原生系统拖入成功。
// 它不修改工程预期长度或视频元数据，只改变本次测试场景覆盖范围。
async function checkFocusedFlow() {
  if (process.env.VIDEO_FOCUS_HELPER === "1") {
    await require("./lib/check-video-filmstrip").checkVideoFilmstrip({ run, wait, delay, smoke, win, root, clips, click, openLiveMenu });
    return true;
  }
  if (process.env.VIDEO_EDIT_TOOLS_ONLY === "1") { await checkEditTools(); return true; }
  if (process.env.VIDEO_COMPOSITION_ONLY === "1") { await checkComposition(); return true; }
  return false;
}
// 两种模式共用同一真实上下文，不重复创建窗口、工程或导入适配器。
// makeVideo只生成隔离样本字节，importFiles继续走生产探测；不返回假元数据。
// 统一组合上下文只把既有生产驱动借给helper，不另造导入、拖动或碰撞算法。
// 完整流程在原多轨和胶片带回归之后调用，防止新安排影响旧场景前置。
// 诊断模式在基础创建后调用，同一helper负责清理自己的隔离工程安排。
// makeVideo新增可选codec，默认仍为libx264，所以原横竖样本字节契约不变。
// 仅错误恢复场景显式选择FFV1，让生产探测成功与浏览器解码失败形成真实反例。
// importFiles仍调用按钮导入链，helper没有直接写素材store。
// 路径返回值夹具的证据限制继续沿用外层，不因真实FFV1字节而变成人工系统框。
// 根目录随机root同时收集截图与播放JSON，后续归档不会误拿另一运行的视频事实。
// 传入wait沿用主进程有界轮询，不能由helper另造永不结束的等待器。
// 传入beginDrag保留浏览器自己的载荷，不能读取React私有闭包提交片段。
// 传入cancelDrag沿用Escape清理，未在合成helper中复制拖动状态机。
// 上下文不把Electron app退出权交给helper，失败统一由外层finally和harness处理。
// helper结束后仍做导航清理，证明新节目时钟没有妨碍原页面退出。
// 真实媒体错误单独作为预期业务状态，未知renderer异常继续由主流程报失败。
// 调用处只返回Promise，失败必须冒泡，不能catch后打印通过。
async function checkComposition() {
  await require("./lib/check-video-composition").checkVideoComposition({ run, wait, delay, smoke, win, root, clips, click, openLiveMenu, beginDrag, dragTo, lanePoint, cancelDrag, makeVideo, importFiles });
}
async function checkFormalFlows(horizontal, vertical) {
  // 导入前验证正式空工程，防止只在有片段时才隐藏占位文字。
  // 无图画布的黑色来自实际计算样式，不拿截图文件名当作通过依据。
  // 这一步不创建素材，所以不会把样板数据混入后续真实操作链。
  await require("./lib/check-video-ui-integration").checkIntegrationEmpty({ run, smoke, win, root });
  await importFiles([horizontal, vertical]);
  smoke.check("Two real videos keep their own dimensions, fps and audio metadata", await run("document.querySelector('[data-editor-region=R02]').textContent.includes('640×360 · 30fps · 含音轨')&&document.querySelector('[data-editor-region=R02]').textContent.includes('360×640 · 24fps · 无音轨')"));
  // UI-08在已有真实会话中核对筛选，不另建一个假工程来证明装配。
  // helper结束恢复全部素材，后续原LIVE创建/移动仍使用同一组ID。
  // 自动事件只证明公开交互链，不能代替人工完整键盘和Explorer拖入。
  await require("./lib/check-video-ui-integration").checkIntegrationMedia({ run, wait, delay, smoke, win, root });
  const placed = await checkCreateAndSelect();
  // 专项诊断模式只跑本轮媒体交互，摘要数量明确更少，不能替代完整回归。
  // 正式交付运行不设置此变量，原有全部LIVE场景继续执行。
  if (await checkFocusedFlow()) return;
  // 真实实例创建后再验目标锁，锁表与菜单必须读取当前工程快照。
  // 分离拒绝时保持原片段数、源静音标记和素材高亮，避免半次提交。
  // 临时解锁后仍交回原LIVE流程，后面的正常分离证明限制可以恢复。
  await require("./lib/check-video-ui-integration").checkIntegrationLocks({ run, wait, delay, smoke, win, root, clips, click, openLiveMenu });
  // 构图专项沿用当前真实媒体工程，临时副本清理后继续原时间线回归。
  await require("./lib/check-video-canvas").checkVideoCanvas({ run, wait, delay, smoke, win, root, clips, click, openLiveMenu });
  await require("./lib/check-video-ui-timeline").checkVideoUiTimeline({ run, wait, delay, smoke, win, root, clips, click, lanePoint });
  await checkMoveAndCancel(placed); await checkAppendAndSource();
  await checkRejectedDrops(); await checkScrolledPlacement(); await checkAutoScrollAndBoundary(); await checkLayoutCancellation();
  await checkExternalImport(horizontal); await checkImportFailures(horizontal); await checkLiveSizes(); await checkThemesAndCleanup();
  win.setSize(1600, 1000); await checkRealPlayback(); await checkDetachedAudio();
  // 原LIVE回归先完整运行，新多轨用例最后接入，避免新增V2影响历史固定轨道前置。
  // 这一顺序不是跳过旧行为，任何早先失败仍留在同一个harness累计结果里。
  // 新helper借用同一真实素材与窗口，不启动并行Electron或第二份工程。
  // 旧系统文件选择夹具的证据限制继续保留，不因多轨通过写成人工导入完成。
  // 多轨结束后仍运行原导航清理，旧媒体节点必须实际停止并释放src。
  // 截图目录由本次root统一拥有，前后画面不能取自不同构建产物。
  await require("./lib/check-video-multitrack").checkVideoMultitrack({ run, wait, delay, smoke, win, root, clips, click, openLiveMenu, beginDrag, dragTo, lanePoint, cancelDrag });
  await require("./lib/check-video-filmstrip").checkVideoFilmstrip({ run, wait, delay, smoke, win, root, clips, click, openLiveMenu });
  await checkComposition();
  await checkEditTools();
  await checkNavigationCleanup();
}
main().catch(error => { console.error("Renderer errors:", rendererErrors); console.error(error); if (win && !win.isDestroyed()) win.destroy(); smoke.finish({ app, ok: false, error }); });

// 以下是本脚本证据的明确上限，后续验收不能把它们记为已经通过。
// 未占用系统鼠标，因此没有人工从资源管理器拖入的OLE事件证据。
// 未操作原生系统选择框，因此按钮多选路径使用的是选择结果夹具。
// 未在真实前台窗口投递方向键，键盘业务验证使用公开DOM事件。
// 未录制桌面操作视频，交付的是实际capturePage截图与结构化断言。
// 未验证真实125%或150%系统缩放，窗口像素尺寸不等于DPR缩放。
// 未验证实际多显示器跨屏拖动，客户区坐标测试只在当前隔离窗口进行。
// 未验证任意超长视频，当前样本用于校验短视频完整入轨与帧边界。
// 未验证磁盘中途拔出，坏字节文件只覆盖生产ffprobe失败分支。
// 未验证文件导入期间被其他程序改名，源文件并发改写不属于本轮用例。
// 未验证系统级窗口强制关闭时的提示，路由离开与beforeunload是不同层级。
// 未验证操作系统取消拖动时的所有输入序列，Escape回归有驱动边界。
// 未验证A/B两个正式工程并排拖动，跨会话载荷使用单页篡改反例。
// 未验证左侧边缘持续自动滚动，右侧实际滚动与取消是本轮运行证据。
// 未验证长按方向键的repeat频率，单次一帧与Shift一秒已覆盖提交门槛。
// 未验证触屏或手写笔拖动，当前实现与测试围绕桌面HTML拖放。
// 未验证视频原始音轨扬声器输出，真实预览默认静音并检查实际媒体事件。
// 未验证跨片段连续多轨调度；当前覆盖区间的真实视觉层已另行自动验证。
// 修剪与非零sourceIn由多轨helper自动验证，完整人工边缘路径仍未验证。
// 未验证切分或吸附，这些入口保持原生禁用，不能作为可用功能交付。
// 未验证工程写盘与恢复，因为当前片段属于临时会话，明确未保存。
// 未验证导出后的编码结果，因为本轮没有启用导出业务。
// 未用静态样板截图代替正式真实媒体截图，两者有不同运行脚本。
// 未以无异常日志替代视觉检查，图片仍须打开核对边框、空隙与滚动边界。
// 未把预期ffprobe错误当成全量check失败的原因，统一门禁另行报告。
// 未根据单次脚本通过推断所有视频编解码受支持，LIVE-01另测FFV1失败保留元数据。
// 未以测试夹具取消结果证明系统选择框取消按钮可访问，原生UI仍需桌面验收。
// 未通过更改DOM样式让位置断言通过，正式秒数只由产品命令更新。
// 未直接读取React私有状态，测试对外观察边界是公开DOM与原生媒体对象。
// 未并行运行多个Electron冒烟，样板与LIVE-01回归由外部串行调度。

// 编辑工具沿用当前正式窗口和真实媒体，不另开一个并行Electron实例。
// 选择框返回值夹具与自动指针的证据边界不因调用helper而改变。
async function checkEditTools() {
  await require("./lib/check-video-edit-tools").checkVideoEditTools({ run, wait, delay, smoke, win, root, clips, click, lanePoint });
}

// 实际音轨来自前序生产分离，不用静态SVG或另一份假音频素材替代。
// 先看未选，再选中比较边框和空心圆；两种状态都不能改变片段高度。
// 菜单与轨道选择不会把基础画面工具展示给音频对象，避免误导可旋转声音。
// 截图仍是自动操作后的真实Electron页面，不能计为人工试听或人工拖边验收。
async function checkReferenceAudio(id) {
  await run(`document.querySelector('[data-editor-track-lane=V1] [data-editor-clip]').click()`);
  smoke.check("REFERENCE unselected audio uses compact navy body without selection circles", await run(`(()=>{const e=document.querySelector('[data-editor-clip="${id}"]'),s=getComputedStyle(e),h=e.querySelector('[data-clip-trim]');return e.getBoundingClientRect().height===52&&s.backgroundColor==='rgb(17, 48, 84)'&&e.getAttribute('aria-current')!=='true'&&(!h||getComputedStyle(h,'::after').content==='none')})()`));
  await click(`[data-editor-clip="${id}"]`);
  smoke.check("REFERENCE audio selection stays one pixel and does not expose visual editing tools", await run(`(()=>{const e=document.querySelector('[data-editor-clip="${id}"]');return e.getBoundingClientRect().height===52&&getComputedStyle(e).borderTopWidth==='1px'&&getComputedStyle(e.querySelector('[data-clip-trim]'),'::after').content==='""'&&!document.querySelector('[data-clip-basic-tools]')})()`));
  smoke.check("REFERENCE audio envelope grows upwards from a bottom baseline", await run(`document.querySelector('[data-editor-clip="${id}"] [data-clip-waveform] svg').getAttribute('viewBox')==='0 0 1000 16'`));
  win.webContents.invalidate(); await delay(150); await screenshot("reference-audio-selected");
}

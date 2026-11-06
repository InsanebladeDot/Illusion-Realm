// 在既有画布冒烟窗口继续验证主题与本地媒体，不能再启动第二个 Electron。
// 文件由随包 ffmpeg 生成，是真实 PNG、H.264 视频和 PCM 音频，不是返回值夹具。
// 这些文件验证的是解码与文件引用，不宣称已经测过用户拍摄的全部编码或大文件。
// 系统文件选择通过 CDP 拦截后提供真实磁盘文件，仍属于自动选择，不是人工点系统框。
// 文件拖放使用真实 File 配合 DOM DragEvent，单独报告，不能冒充资源管理器实体拖入。
// 所有媒体与文档都在外层随机临时目录，不读取或覆盖用户已有素材。
// 这里不调用业务 Hook、不访问 React 私有 store，全部从正式页面入口操作。
// 原始导入和错误恢复都保留真实生产 preload、路径协议和用户文档写入器。
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
// 此模块是测试侧，允许访问临时文件和随包工具；产品渲染层不引入这些 Node API。
// 不复制生产读写器逻辑，保存断言通过外层已经注册的正式 USER_DATA_WRITE 执行。
// 每个检查名写到共同 smoke 日志，失败不能被本模块的异常处理转换为成功。
// 只有资源清理使用 finally，断言本身不放进会吞错的 catch。
// 没有在失败后无限重试：wait 的上限与整轮看门狗都由外层现有 harness 提供。
// 媒体加载计数与节点计数独立，能区分“有卡没文件”和“有文件但没入作品”。
// 用例不验证模型生成、收费、上传和导出，这些入口在产品中继续保持禁用。
// 自动截图与交互结果分开交付，不能把图片写入磁盘的成功算作业务通过。
// 系统选择框的人工路径、资源管理器实体拖入和扬声器试听仍需另行验收。
// CDP 只改变测试窗口状态，不接管或关闭用户当前运行的正式应用。

// 构造三类可独立识别的内容：竖屏纯色图、横屏连续测试图与三秒正弦音频。
// 视频包含多帧而不是只有封面，因此 currentTime 推进可证明播放器在解码真实媒体。
// 图片文件名有中文、空格与 #，覆盖 localfile 查询参数必须整体编码的边界。
// 错误 MP4 保留视频后缀但正文无效，用来区分扩展名允许和浏览器解码成功。
// TXT 是未支持类型，应在导入边界拒绝，不等到插入空卡后才报错。
// 二进制路径固定在仓库随包目录，缺少前提就明确抛错，不悄悄下载或用假文件补位。
// ffmpeg 输出只写临时目录，生成失败直接传播到外层非零退出，不跳过断言。
// 每个进程设超时，工具不响应不能无限卡住整轮验收。
function createFiles(root) {
  // 不搜索用户磁盘视频，保证测试可复现且不会读取私人素材。
  // 使用生产分发位置，验证本机工具链具备制造可解码样本的条件。
  // binary 为固定程序路径，execFileSync 不经 shell 拼接，文件名中的空格不执行命令。
  // source 是用例常量，不接受对话框传入的文本当作 ffmpeg 参数。
  // 每份样本单独生成，避免一个容器里的音视频轨混淆“独立音频导入”的验证。
  // WAV 选择浏览器普遍支持的 PCM，失败时更容易区分路径问题与复杂编码限制。
  // MP4 使用 yuv420p，避免仅因默认像素格式不受支持而无法测试正常视频链路。
  // 三秒时长足够观察 currentTime 推进，同时控制验收运行成本。
  const binary = path.join(__dirname, "../../apps/electron/bin/ffmpeg/ffmpeg.exe");
  const files = { image: path.join(root, "中文 cover #1.png"), video: path.join(root, "horizontal-24fps.mp4"), audio: path.join(root, "voice-440hz.wav"), broken: path.join(root, "broken.mp4"), unsupported: path.join(root, "unsupported.txt") };
  for (const [name, source, output] of [["image", "color=c=royalblue:s=180x320", ["-frames:v", "1"]], ["video", "testsrc2=size=320x180:rate=24", ["-t", "3", "-c:v", "libx264", "-pix_fmt", "yuv420p"]], ["audio", "sine=frequency=440:sample_rate=44100", ["-t", "3"]]]) {
    // -y 只覆盖随机临时目录里本用例的文件，不与用户目录发生同名冲突。
    // stderr 由异常边界保留，失败不把空输出当作已经创建成功。
    // 图片只生成一帧，后续 naturalWidth/naturalHeight 可以直接识别该样本。
    // 视频测试图包含随时间变化的内容，可以从截图区分真实帧与空黑场。
    // 使用整数帧率作为基本编码样本，不宣称覆盖了可变帧率或 HDR。
    execFileSync(binary, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", source, ...output, files[name]], { windowsHide: true, timeout: 20000 });
  }
  fs.writeFileSync(files.broken, "not a video");
  // 错误文件有实际字节和路径，所以 getPathForFile 应成功，失败应落在解码阶段。
  // unsupported 则在后缀分类阶段被拒绝，这两种错误不应该共用一个假成功结果。
  // 测试文件各自保留便于失败后人工查看，不在用例末尾递归删除证据目录。
  fs.writeFileSync(files.unsupported, "not supported media");
  return files;
}

// 菜单与底栏都应触发浏览器原生选择器，监听 Page 事件可以发现按钮接线断掉。
// 只拦截测试窗口，用户当前桌面应用的选择框不受影响。
// DOM.setFileInputFiles 让 Chromium 构造真实磁盘 File，preload 仍执行 getPathForFile。
// 不给产品注入字符串路径，也不伪造 File.path，因而能发现桥接实际不可用的情况。
// backendNodeId 来自本次 chooser 事件，不能在重新挂载后沿用旧 input 编号。
// 即使设置文件失败，也要释放消息监听和选择器拦截，避免下一个场景被上一个吞掉。
// selector 是用例内常量，不把用户文件名拼成 CSS 选择器。
// 选择动作只证明输入通路；后续另等媒体 ready，不能把 change 事件当成解码证据。
  // userGesture 不是系统鼠标记录，它只为测试脚本提供 Chromium 的瞬时激活上下文。
  // 选择器可能由隐藏 input 打开，所以不能以 input 自身是否可见判断入口失效。
  // 不把系统选择框设成永久自动允许，当前调用结束就恢复原来的拦截设置。
  // 第二次替换与首次导入使用同一方法，验证按钮重渲染后仍能找到实际 input。
  // 监听安装在点击之前，避免快速打开的选择器事件在测试开始等待前丢失。
  // 本地磁盘文件交给 Chromium 后，路径仍须通过生产 preload 才能进入作品。
  // 注入 FileList 不会自动证明 multiple 正确，多选数量由后面的三节点断言确认。
  // 100 毫秒只给调试事件留调度机会，不会写入任何媒体状态或生成结果。
async function chooseFiles(ctx, files, selector = '[data-canvas-toolbar] [aria-label="导入本地素材"]', choice = "copy") {
  // choice 是测试应执行的用户选择，不能直接作为模式传给生产 IPC。
  // copy 情况完全不点选项，只按确认，真正检查产品初始值的副作用。
  // move 情况先点第二项再确认，产品必须读取最新状态而非闭包里的初始 copy。
  // cancel 情况发 Escape，不走确认按钮，测试是否错误地在选文件后立即操作磁盘。
  // chooser 的 backendNodeId 来自真实打开事件，不使用上次打开的 DOM 编号。
  // input 有多选设置才会把混合清单交给产品，这里没有替产品补 multiple。
  // 自动选择结束后才等待确认框，避免把原生系统框尚未返回误判为 UI 卡住。
  // 确认框必须先出现在 DOM，helper 不能只等待 busy 然后默认认为确认成功。
  // 默认选中读 aria-pressed，验证可访问性状态与视觉选项的同源关系。
  // 如果产品错误地只画高亮而状态值仍 move，后续源文件保留断言会失败。
  // helper 的后缀列表只用于决定何时等确认，不承担生产的权限和类型校验。
  // TXT 用例依旧由生产 prepareFiles 拒绝，测试不会过滤后再交给产品。
  // 坏 MP4 同样要经过确认，因为后缀合法不等于内容可以解码。
  // 更换按钮入口也用这份 helper，能够发现普通导入与更换各走一套规则的问题。
  // finally 释放 chooser 拦截但不替产品关闭 pending，取消必须走正式 UI。
  // 如果确认框一直不出现，ctx.wait 有上界并报告表达式，不会无限等文件事件。
  // 默认复制断言每批执行，特别覆盖上一批已选移动之后再次导入的状态重置。
  // 本测试不将 Electron userGesture 标记称为真实人工点击。
  // CDP 路径注入依旧经过 getPathForFile，未在 renderer 伪造 File.path 字段。
  // 所有传入路径都来自当前临时夹具目录，不读取本机用户的视频清单。
  // ctx 指向外层测试窗口，不能从 BrowserWindow.getAllWindows 随便取用户主窗。
  // 先开 Page 域再监听选择器事件，确保拦截有明确的 Chromium 事件来源。
  // 一次调用只持有一次 chooser，finally 完成后下一次调用重新登记。
  // 如果按钮只是看起来可点而未执行 input.click，chooser 会为空并明确失败。
  // 不用等待任意超长定时器猜系统框已经打开，读取的是实际 fileChooserOpened。
  // 生产选择流程依然设置 input.accept 和 multiple，本 helper 不替它修改这些属性。
  // CDP 可以提供 accept 外文件，正好覆盖产品运行期白名单而不是系统过滤器。
  // real File 的大小与路径由 Chromium 获得，不是测试伪造的普通对象。
  const debuggerApi = ctx.win.webContents.debugger;
  let chooser;
  const opened = (_event, method, params) => { if (method === "Page.fileChooserOpened") chooser = params; };
  await debuggerApi.sendCommand("Page.enable");
  await debuggerApi.sendCommand("Page.setInterceptFileChooserDialog", { enabled: true });
  debuggerApi.on("message", opened);
  try {
    // 显式传 userGesture，模拟受信任操作的激活权限；仍不属于人工点击系统框。
    // 普通 executeJavaScript 的 click 会偶然借用前一次激活，长时间运行后浏览器会拒绝。
    // 文件选择本来就要求用户意图，测试必须稳定提供这个前提，不能依赖残留权限。
    // fileChooserOpened 不代表用户已经选了文件，只有下一步才注入本地来源。
    // backendNodeId 指向当前真正打开 chooser 的 input，能发现多个入口接到错误节点。
    // 不直接将路径字符串传给产品 importMedia 命令，保留 File 转换边界的覆盖。
    await ctx.win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click()`, true);
    await new Promise(resolve => setTimeout(resolve, 100));
    if (!chooser) throw new Error("Native canvas file chooser was not opened");
    await debuggerApi.sendCommand("DOM.setFileInputFiles", { files, backendNodeId: chooser.backendNodeId });
    // CDP 提供的仍是真实磁盘 File；视频必须经过正式确认框，而不是测试直接调用 IPC。
    // 默认选项要实际处于复制，不能由 helper 先点复制掩盖产品默认错误。
    // 自动点击和 Escape 均属于自动事件，不宣称人工操作过 Windows 文件选择框。
    // 图片与音频没有二次确认，避免等待一个产品不应显示的弹窗。
    if (files.some(file => /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(file))) {
      await ctx.wait("!!document.querySelector('[data-canvas-import-choice]')");
      ctx.smoke.check("Every video batch defaults to copying", await ctx.run("document.querySelector('[data-canvas-import-choice] .hy-segmented button').getAttribute('aria-pressed')==='true'"));
      if (choice === "cancel") await ctx.key("Escape");
      else {
        if (choice === "move") await ctx.click('[data-canvas-import-choice] .hy-segmented button:last-child');
        // 只有主动切换移动的这次才截确认框，保留删除原位置文件的提前说明。
        // 截图在确认前完成，屏幕上的模式不是测试事后改出的成功标记。
        // 其他批次的默认复制已由状态断言覆盖，不反复覆盖同名截图。
        if (choice === "move") await ctx.shot("31-video-import-move-choice");
        await ctx.click('[data-canvas-import-actions] button:last-child');
      }
    }
  } finally {
    // 即使断言前发生异常也释放拦截，外层关闭窗口时不留挂起的调试监听。
    // removeListener 只移除此 helper 的回调，保留外层错误与控制台采集。
    // 关闭拦截并不是系统取消验证，取消另由后面的原生事件用例覆盖。
    debuggerApi.removeListener("message", opened);
    await debuggerApi.sendCommand("Page.setInterceptFileChooserDialog", { enabled: false });
  }
}

// 测试移动只使用 ffmpeg 生成视频的另一份临时副本，不触碰用户素材。
// 先取消同一个文件，再确认移动，区分 UI 取消与真正文件操作的副作用。
// 取消要同时保留原文件和原四节点，不能只凭“取消”文字判断没有导入。
// 移动后读取真实受管目标，确认字节相同且原位置消失。
// 节点得到非零自然尺寸才说明移动后的路径仍可被 Chromium 解码。
// 最后用正式 Delete 删除测试节点，恢复后续混合导入的节点数前提。
// 删除节点并不删除受管资产，不能将该行为误报成文件回收功能。
// 手动系统选择框和资源管理器拖放仍单独待验，CDP 不是人工证明。
async function checkImportChoice(ctx, files) {
  // 复制样本的操作属于测试准备，正式移动仍必须由画布确认按钮执行。
  // files.video 是实际 H.264 文件，这里不使用探测元数据的假返回值。
  // move-video 的独立名字便于确认被删除的是本测试副本。
  // 第一次选择用 Escape 取消，故意不点确认，观察是否提前创建了节点。
  // 取消后原四节点计数必须保持，不能用撤销动作修补错误的提前导入。
  // !inert 同时确认弹窗关闭后背景已恢复，取消不能把页面永久锁住。
  // 第二次选择重新打开 chooser，验证第一次 pending 没有残留拦住导入。
  // helper 先断言默认复制，再切到移动，覆盖“每批恢复安全默认”。
  // 如果状态错误地记住上一批选择，后续真实混合导入也会检测出来。
  // 等待 ready 检验的是移后地址；源已移除，不能偷偷继续播放旧路径。
  // 目标从 video.src 解码得出，与媒体真正读取的地址一致。
  // 不直接读 Hook 的内部结果，因此可以发现写回媒体路径错误。
  // 字节 equals 比较两份真实文件，复制半份或读取旧帧缓存都不能满足完整性。
  // videoWidth 非零防止只搬运文件却从未在画布解码显示。
  // 320 的预期来自 ffmpeg 夹具设置，而读取值来自 Chromium 自然尺寸。
  // 截图保存时视频未自动播放，避免复制/移动被误当播放命令。
  // 对原 files.video 的字节只读，不重命名它供后续播放场景继续使用。
  // 焦点显式回画布根，避免 Delete 停在播放器内部被正确隔离。
  // 正式 Delete 通过产品命令删除节点，不直接删 DOM 隐藏测试痕迹。
  // 恢复四节点后再跑混合导入，保留原回归对已有作品不得清空的约束。
  // 这里不 Ctrl+Z 恢复已移走的磁盘来源，图撤销不承担文件移动撤销。
  // 同一窗口中的错误与成功截图都有独立文件名，不覆盖前一步证据。
  const source = path.join(ctx.root, "move-video.mp4");
  fs.copyFileSync(files.video, source);
  await chooseFiles(ctx, [source], undefined, "cancel");
  ctx.smoke.check("Canceling video confirmation keeps files and graph", fs.existsSync(source) && await ctx.run("document.querySelectorAll('[data-canvas-node]').length===4&&!document.querySelector('[inert]')"));
  await chooseFiles(ctx, [source], undefined, "move");
  await ctx.wait("document.querySelector('[data-canvas-media=video]')?.dataset.mediaStatus==='ready'");
  const target = await ctx.run("new URL(document.querySelector('video').src).searchParams.get('path')");
  ctx.smoke.check("Moving a real video removes only its temporary original and decodes the result", !fs.existsSync(source) && fs.readFileSync(target).equals(fs.readFileSync(files.video)) && await ctx.run("document.querySelector('video').videoWidth===320"));
  await ctx.shot("29-video-import-move");
  await ctx.run("document.querySelector('[data-infinite-canvas]').focus()");
  await ctx.key("Delete");
  await ctx.wait("document.querySelectorAll('[data-canvas-node]').length===4");
}

// 直接在图片中间按住并移动，覆盖导致用户无法移动的正文命中区域。
// 测量的是图节点位置，不只检查 nodrag 类消失，避免源码修了但事件仍被祖先截走。
// 抓取前适配全部并关闭选中面板，避免图上另一卡或参数区挡住目标。
// 使用 Electron 输入注入；它验证浏览器鼠标事件链，不能冒充用户手动操作。
// 两个轴都移动一段可见距离，松手后再读 transform，确保不是浏览器拖图片影子。
// 保存前调用原撤销恢复位置，使此用例不改变其他场景的构图前提。
// 没有派发 setNodes 或修改 DOM transform 来伪造移动结果。
// 正常图片的正文不应残留标题条或替换按钮；外部节点标题依旧可见。
async function checkImageDragging(ctx) {
  // 适配全部读取真实节点几何，不以固定桌面坐标猜测图片中心。
  // 使用 img 的矩形中央，即便 contain 留边也会落在图片内容区的中央。
  // 后面的节点 transform 来自 React Flow 的 DOM 输出，不是测试缓存的位置。
  // mouseDown 与 mouseUp 都使用左键，排除右键菜单或平移工具的干扰。
  // mouseMove 携带 leftButtonDown，让 Chromium 把运动交给当前抓取会话。
  // 五步渐进移动保留真实拖动事件链，不只发一个 click 然后修改坐标。
  // 每步只等二十五毫秒，让引擎能处理输入，但不以等待时长作为成功条件。
  // 成功依赖 transform 的实际变化，预定延时结束并不直接标记通过。
  // 同时变化 x/y 的目标避免误把横向图滚动当作节点移动。
  // 如果内容区仍被 nodrag 截断，transform 保持不变，这一步会明确超时失败。
  // 图片状态此时已 ready，找不到替换按钮才符合正常展示的要求。
  // 错误时的修复按钮不会被这项正常态检查误删，缺图恢复另有场景。
  // 检查 caption 的缺失限定在 image，音频标题不受这次精简要求影响。
  // 外层标题不在这些选择器内，文件名仍可通过节点外标题识别。
  // 图像像素没有被注入位置数据，真正位移仍是图引擎管理的节点坐标。
  // 截图显示移动后的图片，与导入完成的原位截图可分别核对。
  // 原撤销恢复移动前位置，也检验正文拖动继续进入已有历史机制。
  // 这里没有独立断言所有历史步数，不能把一次恢复推广为完整撤销系统验收。
  // 键盘输入仍属自动注入，人工触控板与高 DPI 拖动需要独立实测。
  // 测试不直接访问 React 私有 Fiber 或 Zustand 内部对象。
  // 这样即使未来内部状态结构调整，正文不能拖动的用户回归仍能被检测。
  // 拖动不会更换媒体文件，后续视频/音频播放继续使用同一真实样本。
  // 没有把图片正文变成额外 button，从而增加无意义的 Tab 焦点。
  await ctx.click('[data-canvas-viewport] [aria-label="适配全部"]');
  const selector = '[data-canvas-media=image] img';
  const position = await ctx.run(`(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  const before = await ctx.run("document.querySelector('[data-canvas-media=image]').closest('.react-flow__node').style.transform");
  for (const type of ["mouseMove", "mouseDown"]) ctx.win.webContents.sendInputEvent({ type, ...position, button: "left", clickCount: 1 });
  for (let i = 1; i <= 5; i++) { ctx.win.webContents.sendInputEvent({ type: "mouseMove", x: position.x + i * 12, y: position.y - i * 8, button: "left", modifiers: ["leftButtonDown"] }); await new Promise(resolve => setTimeout(resolve, 25)); }
  ctx.win.webContents.sendInputEvent({ type: "mouseUp", x: position.x + 60, y: position.y - 40, button: "left", clickCount: 1 });
  await ctx.wait(`document.querySelector('[data-canvas-media=image]').closest('.react-flow__node').style.transform!==${JSON.stringify(before)}`);
  ctx.smoke.check("Imported images drag from the image body and have no normal overlays", await ctx.run("!document.querySelector('[data-canvas-media=image] .hy-media-caption')&&!document.querySelector('[data-canvas-media=image] .hy-media-replace')"));
  await ctx.shot("30-image-body-drag");
  await ctx.key("z", ["control"]);
}

// 此时既有回归留下四张空卡；本轮三份媒体必须追加，不能拿导入替换全部作品。
// 原始页面保持真实来源与节点关系，多选导入后的三类引用分别等待各自解码事件。
// 图片 naturalWidth 与视频 videoWidth 来自 Chromium 解码，不来自测试预填的元数据。
// WAV duration 来自媒体元素读取真实文件，不根据“我们生成了三秒”直接写成功。
// 多选入口还需允许三种扩展名，断言文件名用于识别实例，不代表替代真实解码断言。
// 屏幕截图之前执行正式适配全部动作，截图仍来自正式 app:// 画布。
// 照片的完整比例用 object-fit 检查，不能靠图片正好等于卡片尺寸掩盖裁切问题。
// 这轮没有服务器请求或模型任务，文件导入成功不等于生成服务已经接通。
async function checkImports(ctx, files) {
  // 传三条不同类型绝对路径，系统框的多选属性必须确实容纳混合类型。
  // 不把这些路径写进 localStorage 或 React 私有状态，生产 onChange 必须自己处理。
  // 只有 ready 才继续断言尺寸，防止读到尚未解码时 videoWidth 的初始零值。
  // wait 使用主进程有界轮询，离屏页面不依赖 rAF 才能结束。
  await chooseFiles(ctx, [files.image, files.video, files.audio]);
  await ctx.wait("document.querySelectorAll('[data-canvas-media][data-media-status=ready]').length===3");
  // 总数为旧四加新三，不能靠清空旧图再添加三卡来满足单纯媒体计数。
  // 如果导入只是显示预览却漏入工程，这个节点计数和后续保存都会暴露问题。
  // 对照原图状态，旧文本与连接仍由后续 legacy 场景和实际保存共同覆盖。
  // 节点存在与媒体 ready 是两条独立证据，不能互相替代。
  ctx.smoke.check("Canvas imports three actual media files without clearing existing nodes", await ctx.run("document.querySelectorAll('[data-canvas-node]').length===7"));
  // 图片是竖向，原节点是方形；仅测试正方形图片会漏掉错误的 cover 裁切。
  // natural 尺寸来自原图，不能读取被 CSS 拉伸后的元素宽高代替。
  // 特殊文件名同时覆盖 query path 的 # 编码，截断 URL 会导致实际加载失败。
  // 对象适配模式是可计算的显示契约，不凭截图看起来没裁切就下结论。
  ctx.smoke.check("Image pixels and full-frame fit come from the local source", await ctx.run("(()=>{const e=document.querySelector('[data-canvas-media=image] img');return e.naturalWidth===180&&e.naturalHeight===320&&getComputedStyle(e).objectFit==='contain'})()"));
  // 横向视频与竖向图片覆盖不同源比例，排除三种媒体都指向同一图片路径。
  // 原生 videoWidth 和 videoHeight 非零才能说明 Chromium 真正读到了视频数据。
  // 音频时长大于 2.9 秒允许容器精度差，不把精确浮点舍入当作业务错误。
  // 这里没有伪造 ffprobe 返回值，元数据来自 localfile 协议的真实响应。
  ctx.smoke.check("Actual video and audio metadata are decoded", await ctx.run("document.querySelector('video').videoWidth===320&&document.querySelector('video').videoHeight===180&&document.querySelector('audio').duration>2.9"));
  await ctx.click('[data-canvas-viewport] [aria-label="适配全部"]');
  // 适配只改变镜头，不修改三个来源的自然宽高或播放时长。
  // 如果 fit 操作破坏实际像素，截图与后续播放应显示异常，不把它当成允许误差。
  // 初始深色证据在主题切换前保存，与后面的白色证据使用不同文件名。
  await ctx.shot("18-local-media-dark");
}

// 播放调用走真实 HTMLMediaElement，随后等待实际媒体时间变化，不能改 currentTime 冒充。
// 自动测试主动静音，避免影响用户；因此本轮不宣称扬声器或音高试听通过。
// 音频开始播放后视频应暂停，证明同一画布不会意外同时响多个源。
// 时间值由媒体事件和原生解码推进，用例计时只负责有界等待。
// 原生控件拥有键盘路径，Delete 不应从其内部冒泡成画布删除。
// 切换到文字节点属于离开媒体操作，全部旧源应暂停，不能后台继续读文件。
// 该用例验证自动播放与暂停 API，不把它描述成人工按播放按钮的手感验证。
// 返回原有画布焦点后，其 Delete 快捷键仍由下一组用例验证，不永久禁用。
async function checkPlayback(ctx) {
  // 导入结束默认选中首张图片，播放视频前先通过正式节点头部建立选择前提。
  // 只启动未选中的媒体再点文字不会产生 deselect，不能用这个假前提要求 effect 重跑。
  // 显式检查外壳 selected，防止坐标被其他卡遮挡时悄悄测试另一种行为。
  await ctx.pointer('[data-canvas-node]:has([data-canvas-media=video]) header>svg');
  await ctx.wait("document.querySelector('[data-canvas-node]:has([data-canvas-media=video])').dataset.selected==='true'");
  // 原生播放 Promise 必须正常完成，拒绝会直接让此场景失败。
  // 设置 muted 是测试环境礼貌，不改变产品默认音量或保存的数据。
  // 原生 play 返回的 Promise 由 executeJavaScript 传回主进程，拒绝不会静默吞掉。
  // 选择 SVG 头标而不是视频正文，避免误点原生播放控件改变测试起点。
  // 图引擎外壳负责 selected，媒体正文负责播放，两个生命周期分别建立前提。
  // 音频进入播放状态时视频被停止，但当前视频选择仍可保留以继续编辑参数。
  // 后续选择音频不重新创建播放器，因此源时间不会因选中而归零。
  // 这里测试的是跨类型互斥，同源视频两份实例的存在由拖放场景另行检查。
  // 不先 seek 到一个非零时间再读取它，避免把静态定位误判成实际播放推进。
  // 等到 0.15 秒足以超过初始化噪声，又不必让三秒样本完整播放。
  await ctx.run("(()=>{const v=document.querySelector('video');v.muted=true;return v.play()})()");
  await ctx.wait("document.querySelector('video').currentTime>.15");
  await ctx.run("(()=>{const a=document.querySelector('audio');a.muted=true;return a.play()})()");
  // 先启动视频再启动音频，是为了真正触发另一个活动源的暂停路径。
  // 如果直接从两个初始暂停元素开始读 paused，就无法证明互斥事件已经接通。
  // 使用同一个工作区广播，不允许通过全局 document 暂停测试之外应用页面的音频。
  await ctx.wait("document.querySelector('audio').currentTime>.15");
  // 视频确实先播放过，再由后一个音频打断，不能拿初始 paused=true 蒙混通过。
  // 当前音频应仍在播放，若两个都停下说明互斥通知错误地包含了自身。
  // 没有检查输出音量，所以不把通过结果扩展成扬声器试听已通过。
  // 节点选择不会因此改变，播放互斥只停止旧源的媒体状态。
  ctx.smoke.check("Real audio playback pauses the other video source", await ctx.run("document.querySelector('video').paused&&!document.querySelector('audio').paused"));
  // 互斥播放不强行修改编辑选择，下一步才明确选择音频以验证离开时清理。
  // 保持原播放器实例，不重新调用 play，因此后面的暂停仍针对已推进的真实源。
  await ctx.pointer('[data-canvas-node]:has([data-canvas-media=audio]) header>svg');
  await ctx.wait("document.querySelector('[data-canvas-node]:has([data-canvas-media=audio])').dataset.selected==='true'");
  await ctx.run("document.querySelector('audio').dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}))");
  // keydown 带 bubbles，既能到达 React 捕获层，也能暴露只在冒泡层隔离的错误。
  // 不设置 defaultPrevented 掩盖结果，实际产品必须自己决定是否消费按键。
  // 测试没有修改编辑器的 selected 来迁就删除预期，选择仍是前一步真实导入留下的状态。
  // 此处从 audio 派发 Delete，专门验证父级 capture 阶段不会先误删当前选择。
  // 只在子元素 stopPropagation 还不够，捕获阶段边界缺失仍会被这个用例发现。
  // 事件为自动键盘事件，只覆盖传播规则，不声称测过系统原生音量子控件每个键。
  ctx.smoke.check("Media control keyboard events do not delete nodes", await ctx.run("document.querySelectorAll('[data-canvas-media]').length===3"));
  await ctx.pointer('[data-kind=text] header>svg');
  // 若头部点击被其他节点遮住，应修正命中前提，不能把继续播放写成允许的预期。
  // 这一步不启动第二份声音，只测试已在播放的音频离开选择时会被暂停。
  // paused 是浏览器真实状态，不以播放按钮图标变化猜测解码器已经停止。
  // 三秒样本适合验证启动清理，不足以证明长视频循环播放的资源占用。
  // pointer 走 Electron sendInputEvent，不把 deselect 写进 React 内部 store。
  // 先前音频的播放时间已经推进，所以随后暂停具有真实的资源意义。
  // 切换选择不删除引用，后续持久化仍应保存全部三类媒体。
  // 选择文字使此前媒体离开选中集合，预览 effect 应暂停仍在播放的音频。
  // 只读 DOM 是否移除不足以证明扬声器已停，因此断言实际元素的 paused。
  // 全部媒体都要停，不能只暂停最后一个匹配的首个 video。
  ctx.smoke.check("Changing selection pauses media", await ctx.run("[...document.querySelectorAll('video,audio')].every(e=>e.paused)"));
}

// 浅色切换走真实应用菜单与 nativeTheme，不给根元素直接贴自建 light class。
// 等媒体查询实际落到浅色，避免只等 data-theme 已变却仍截图旧配色。
// 检查画布、卡片、参数、菜单和设置，不接受只有宿主标题栏变白。
// 同时保留节点数，主题切换不能通过重置画布实现“清爽空态”。
// 样式值从 Chromium computed style 读取，不自证 CSS 源文件里存在某个字符串。
// 窄窗口只改变 CSS 视口，不等同于 Windows 125% 或 150% 显示缩放。
// 原生媒体像素保持原颜色，不使用 filter:invert 把深色截图假装成浅色。
// 最后恢复正常视口，避免后面的系统框按钮被布局压到画布外。
async function checkLightTheme(ctx) {
  // 真实应用主题入口要先存在，不能直接给 canvas 添加任意 inline 颜色。
  // closeAppearance 沿用旧测试的外观菜单清理，避免弹出菜单挡住画布截图。
  // nativeTheme 通过 IPC 改变媒体查询，和普通 DOM 属性变化有一帧时差。
  // 因此条件取实际 prefers-color-scheme，而不是单看 data-theme 字符串。
  await ctx.click('[data-theme-trigger]');
  await ctx.wait("document.querySelector('[data-theme-option=light]')");
  await ctx.click('[data-theme-option=light]');
  await require("./sidebar-menu-fixture").closeAppearance(ctx.run);
  await ctx.wait("!matchMedia('(prefers-color-scheme:dark)').matches");
  // media query 是最终绘制依据，nativeTheme 的请求返回成功本身不足以证明颜色已变化。
  // 当用户偏好是跟随系统时产品依旧读取这条机制，本轮强制浅色只为了稳定验收。
  // 不把测试用的固定浅色选择保存到用户真实文档，外层文件是临时隔离文档。
  // 第一项检查宿主底板，第二项检查原组件内部，防止只白了外围应用外壳。
  // 节点总数仍是七，主题变化不得通过重新初始化画布来绕过旧卡黑底。
  // 精确颜色是本轮明确新增的配色契约，不取参考图背景占比计算相似度。
  // 不比较媒体像素是否变白，真实图像必须保持自己的原颜色。
  ctx.smoke.check("Light theme changes the actual canvas and node surfaces", await ctx.run("getComputedStyle(document.querySelector('[data-infinite-canvas]')).backgroundColor==='rgb(248, 249, 251)'&&getComputedStyle(document.querySelector('.hy-node-card')).backgroundColor==='rgb(255, 255, 255)'&&document.querySelectorAll('[data-canvas-node]').length===7"));
  await ctx.pointer('[data-canvas-node]:has([data-canvas-media=image]) header>svg');
  // 明确选中带真实图片的那张卡，不能误测旧空图片样例的参数面板。
  // 面板底与输入文字同时检查，避免白底还留白字造成不可见。
  // 选择不会触发导入或修改图片比例，参数仍归当前节点自己的 data。
  ctx.smoke.check("Parameter panel and prompt text follow the light palette", await ctx.run("getComputedStyle(document.querySelector('.hy-generation-panel')).backgroundColor==='rgb(255, 255, 255)'&&getComputedStyle(document.querySelector('.hy-generation-panel textarea')).color==='rgb(39, 43, 52)'"));
  await ctx.shot("19-local-media-light");
  // 完整窗口保留应用导航，能看出白色画布确实位于正式页面而不是独立展示页。
  // 截图不缩放媒体帧来接近参考图，图片比例由产品原生布局决定。
  // 若机器字体回退不同，不能用这一张图宣布所有文字像素与原资料完全一致。
  await ctx.click('[data-canvas-toolbar] [aria-label="添加节点"]');
  // 添加菜单是独立浮动表面，单看主区颜色不能证明菜单适配了白色主题。
  // 此处不选择新节点，保持后面导入失败用例的节点数基线稳定。
  // Escape 仍通过既有真实键盘入口关闭，复核主题变换没有破坏菜单生命周期。
  ctx.smoke.check("Light add menu has a white surface", await ctx.run("getComputedStyle(document.querySelector('.hy-add-menu')).backgroundColor==='rgb(255, 255, 255)'"));
  await ctx.shot("20-local-media-light-menu");
  // 菜单同时包含可执行导入与禁用服务，人工可核对两类状态是否仍有明显区别。
  // 不在这里点击生成服务来获得虚假成功提示，也不模拟上传任务状态。
  await ctx.key("Escape");
  await ctx.click('[data-canvas-toolbar] [aria-label="画布设置"]');
  // 设置宽度和分组没有重新搭建，白色适配应只改变配色。
  // 关闭设置后恢复工作区，不用刷新页面才能继续导入或播放。
  // 截图同时保留节点，便于人工检查白色浮层与原媒体内容是否发生意外反色。
  ctx.smoke.check("Light settings has a white surface", await ctx.run("getComputedStyle(document.querySelector('.hy-settings')).backgroundColor==='rgb(255, 255, 255)'"));
  await ctx.shot("21-local-media-light-settings");
  // 设置截图包含开关与模式控件，辅助检查通用浅色状态是否在多个调用处同步生效。
  // 原有设置值来自前半段实际交互，不填固定展示数据遮住真实控件。
  await ctx.key("Escape");
  await ctx.win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 960, height: 720, deviceScaleFactor: 1, mobile: false });
  // 960×720 是 CSS 视口限制，不记录成应用主区正好拥有 960 像素宽。
  // 图片、参数面板与底部工具条仍在同一实例，不为窄屏换一张静态截图。
  // 外层此前已覆盖工具条边界，本图补充白色主题的可读性证据。
  await ctx.shot("22-local-media-light-narrow");
  await ctx.win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
  // 清理视口模拟后仍是同一页面与同一作品，后续操作不通过重载清空状态。
  // 如果主题适配依赖一次性窗口尺寸，这种连续操作更容易发现残留布局问题。
}

// 更换坏文件必须保留原卡身份与作品总数，浏览器错误不冒充新增成功结果。
// 文件名允许只是第一层分类，broken.mp4 真正触发 error 才证明失败路径有效。
// 恢复原文件后再等待 ready，不能只点击“更换”就宣称已经恢复视频。
// 取消由 input 原生 cancel 事件验证接线，仍属于自动事件，不冒充人工取消系统框。
// 不支持的 TXT 不能新增节点、清空已导入素材或改变已有媒体 source。
// 文件输入事件完成后值应清空，相同文件下次选择才有机会继续触发 change。
// 当前被选中的图片不应被视频更换影响，三种媒体状态相互独立。
// 错误画面截图保留完整工作区，说明是本地文件失败而不是生成服务失败。
async function checkImportFailures(ctx, files) {
  // selector 锁定带实际视频的卡，不能误点旧的空视频节点。
  // last-child 是更换文件；错误后会多出重试按钮，原更换入口仍在末尾。
  // 选择的是坏字节 MP4，input 的类型白名单应允许它抵达实际解码边界。
  // 若产品只按后缀假报 ready，等待 error 的条件会失败。
  const replace = '[data-canvas-media=video] .hy-media-replace button:last-child';
  await chooseFiles(ctx, [files.broken], replace);
  await ctx.wait("document.querySelector('[data-canvas-media=video]')?.dataset.mediaStatus==='error'");
  // 总数不变证明更换失败没有删除原卡或追加另一张假成功卡。
  // ready 剩两项证明只有视频失败，图片和音频没有被共用错误状态污染。
  // 文件引用允许保存错误来源，后续可重新定位文件，不自动清空整个作品。
  // 错误节点仍有原节点 ID，因此已有连接关系不会指向被偷偷重建的新卡。
  ctx.smoke.check("Decode failure retains the node and other decoded media", await ctx.run("document.querySelectorAll('[data-canvas-node]').length===7&&document.querySelectorAll('[data-canvas-media][data-media-status=ready]').length===2"));
  await ctx.shot("23-local-media-decode-error");
  // 错误截图应同时保留另外两份正常媒体，便于人工核对实例状态没有串到一起。
  // 不把错误文件的黑画面当成成功解码的正常黑场。
  // 仍然保留更换入口，不能用整块错误遮罩把恢复路径盖住。
  await chooseFiles(ctx, [files.video], replace);
  // 换回正常视频必须真正解码，不能只把错误旗标重置为 ready。
  // 之后导入 TXT 使用工作区入口，验证前一次更换目标已经被清掉。
  // 若 stale target 仍在，TXT 会错误地干扰先前视频卡，而不是普通拒绝反馈。
  await ctx.wait("document.querySelectorAll('[data-canvas-media][data-media-status=ready]').length===3");
  await chooseFiles(ctx, [files.unsupported]);
  // 后缀不允许的文件由产品拒绝，CDP 绕过选择器过滤并不代表产品允许此类型。
  // 测试特意验证这层业务检查，而不是仅检查 accept 字符串里写了哪些后缀。
  // 若实现只依赖系统框过滤，拖放同类文件就会绕过规则，这个断言能及时发现。
  // 名称出现在实际批量反馈中，不能只是返回一个静默空数组。
  // 节点数仍七，同时 ready 的等待保证之前的正常媒体没有被错误清理。
  // TXT 不会触发播放器试图读取任意文本；只允许已支持的本地媒体类型。
  ctx.smoke.check("Unsupported files are rejected without clearing imported media", await ctx.run("document.querySelectorAll('[data-canvas-node]').length===7&&document.querySelector('[data-canvas-message]').textContent.includes('unsupported.txt')"));
  await ctx.run("document.querySelector('[data-canvas-file-input]').dispatchEvent(new Event('cancel'))");
  // 这不是人工按系统框取消；交付时必须与 chooser 拦截和实体操作区分。
  // 不传伪 File 或空路径作为“取消”，直接验证浏览器输入的原生取消事件接线。
  // 取消消息单独出现，避免沿用上一轮导入成功文字误导用户发生了新修改。
  // 原生 cancel 监听在 effect 注册，事件可以发现使用不存在 React onCancel 的接线错误。
  // input.value 清空是重复选择仍可工作的前提，不只是一项视觉细节。
  // 已有三张媒体保留，取消不能复用清空列表的旧导入实现。
  ctx.smoke.check("Cancellation leaves media intact and file input empty", await ctx.run("document.querySelectorAll('[data-canvas-media]').length===3&&!document.querySelector('[data-canvas-file-input]').value&&document.querySelector('[data-canvas-message]').textContent.includes('取消')"));
}

// 使用第二个原生 input 得到磁盘 File，再组装拖放，证明 drop 与选择框使用同一导入方法。
// 它仍是合成 DragEvent，资源管理器实际鼠标拖入属于人工待验，不能混写证据。
// 允许同一文件有多个节点，但它们有不同 ID；一张卡出错不应改变同源副本。
// 删除选中媒体后读取退役元素，src 清空与 paused 可以证明清理，而不只是 DOM 消失。
// 撤销应恢复一个新预览会话，不能把已卸载播放器塞回旧节点。
// 预览事件不会生成自己的撤销记录，因此 Ctrl+Z 仍应撤回刚才的作品删除。
// 纯测试 input 在 finally 清除，不给产品工作区留下隐藏的 Tab 或 File 引用。
// 不直接调用编辑器 importMedia，所有节点仍经正式页面的 drop 回调创建。
async function checkDropAndCleanup(ctx, files) {
  // 视频 drop 之前原系统框更换目标已清空，新导入不能覆盖旧视频。
  // drop 的 DataTransfer 只放一份实际 File，节点身份应由正式工厂重新分配。
  // 确认框出现之前的图仍保留旧媒体，不用清空列表表达“等待导入”。
  // 第二份视频解码成功后计数为二，可以排除只把第一份重新加载的错误。
  // 此处不选择移动，验证拖入也默认保留原文件，而非受 dropEffect 字样误导。
  // 文件拖放的分类结果与系统框共享 prepareFiles，不因 MIME 空值产生不同类别。
  // 节点总数八的前提包含原四卡、混合三媒体和这次新增视频。
  // 没有把确认框本身算作一个节点，测试只统计 data-canvas-node。
  // Set 校验的是节点 ID，不是媒体路径，允许同源多实例仍必须身份独立。
  // 新视频选中由生产 importMedia 设置，后面的 Delete 依赖这个真实结果。
  // 如果 drop 错误沿用旧选择，删除后的节点计数或退役来源检查会暴露问题。
  // 退役引用在删除前捕获，DOM 卸载后仍可观察是否调用了资源释放。
  // 保留该引用只在测试范围，产品不保存 HTMLElement 到用户数据。
  // 删除后 src 为空比 paused 更强，能发现暂停了但仍占着本地视频流的情况。
  // 撤销恢复需要重新解码，不复用测试抓住的退役元素或它的旧缓冲。
  // 新会话的自然媒体事件才产生 ready，测试不直接调用组件的成功回调。
  // 测试用 input 在 finally 删除，确保刷新或导出不会把测试元素当成产品入口。
  // 即使失败也释放全局退役引用，避免测试自己泄漏对象干扰下一次运行。
  // 资源管理器的实体鼠标拖入没有在这组自动事件中发生，交付仍明确待验。
  // 该场景不验证跨应用拖放的系统权限或 Windows 全屏程序抢焦点问题。
  // 新 input 只用于让 Chromium 创建真实 File，不属于产品组件或正式入口。
  // 得到 File 后发送给正式宿主 drop，覆盖的是另一条 UI 输入的相同业务流程。
  // 测试 input 使用独立 ID，不复用产品 data-canvas-file-input 导致覆盖选择目标。
  // DOM.getDocument 查询的是当前刷新后的文档根，不能缓存初始页面的节点编号。
  // 这些自动事件不会把鼠标控制权交给 Windows 资源管理器，人工项必须继续待验。
  const document = await ctx.win.webContents.debugger.sendCommand("DOM.getDocument");
  // 此 DOM 根只活在本次页面，不保存在跨刷新缓存中。
  // 后面所有 File 都来自浏览器实际文件 input，不能用普通 JS 对象伪造路径桥接。
  // 本用例只借临时 input 构造外部 File，真正的导入仍由产品宿主处理。
  await ctx.run("(()=>{const e=document.createElement('input');e.type='file';e.id='canvas-smoke-drop';e.hidden=true;document.body.append(e)})()");
  try {
    const { nodeId } = await ctx.win.webContents.debugger.sendCommand("DOM.querySelector", { nodeId: document.root.nodeId, selector: "#canvas-smoke-drop" });
    await ctx.win.webContents.debugger.sendCommand("DOM.setFileInputFiles", { nodeId, files: [files.video] });
    await ctx.run("(()=>{const dt=new DataTransfer();dt.items.add(document.querySelector('#canvas-smoke-drop').files[0]);document.querySelector('[data-infinite-canvas]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}))})()");
    // 外部视频拖入也必须确认，验证没有第二条绕过模式选择的导入实现。
    // 此处仍是合成 DragEvent，不是资源管理器鼠标拖入证据。
    // 不改变默认选项直接确认，后续原文件应继续存在。
    await ctx.wait("!!document.querySelector('[data-canvas-import-choice]')");
    await ctx.click('[data-canvas-import-actions] button:last-child');
    await ctx.wait("document.querySelectorAll('[data-canvas-media=video][data-media-status=ready]').length===2");
    // 两个可解码视频引用同一文件，身份集合大小仍应等于全部节点数。
    // 若用文件路径作为节点 ID，第二份可能覆盖首份，这个断言会失败。
    // 没有要求两个预览共享进度，同源多实例应各自拥有原生媒体元素。
    ctx.smoke.check("Synthetic external file drop creates an independent media node", await ctx.run("document.querySelectorAll('[data-canvas-node]').length===8&&new Set([...document.querySelectorAll('[data-canvas-node]')].map(e=>e.dataset.canvasNode)).size===8"));
    await ctx.run("globalThis.__retiredCanvasMedia=[...document.querySelectorAll('video')].at(-1);document.querySelector('[data-infinite-canvas]').focus()");
    // 保留退役 DOM 的测试引用只用于清理断言，不给产品暴露播放器全局变量。
    // drop 导入的新卡是当前选中项，Delete 应删它，旧视频继续存在。
    // 删除前先把焦点交回画布根，避免测试误停在原生媒体控件的快捷键隔离区。
    await ctx.key("Delete");
    // paused 单独不够：初始未播放也可能满足，因此同时要求 src 已移除。
    // 检查退役元素，而不是只问页面里有没有 video，避免 DOM 消失掩盖缓冲泄漏。
    // 节点数回到七验证删除命令确实执行，没有因为媒体边界过宽而禁掉整页快捷键。
    ctx.smoke.check("Deleting media pauses and releases the actual source", await ctx.run("globalThis.__retiredCanvasMedia.paused&&!globalThis.__retiredCanvasMedia.getAttribute('src')&&document.querySelectorAll('[data-canvas-node]').length===7"));
    await ctx.key("z", ["control"]);
    // 仍用原撤销快捷键，不调用 reducer 重建一份看似相同的新视频节点。
    // restored ready 来自新会话重新解码，不能把已释放旧 DOM 从测试全局塞回去。
    // finally 清理测试 input 与退役引用，下一轮刷新不带这些辅助对象。
    await ctx.wait("document.querySelectorAll('[data-canvas-media=video][data-media-status=ready]').length===2");
  } finally { await ctx.run("document.querySelector('#canvas-smoke-drop')?.remove();delete globalThis.__retiredCanvasMedia"); }
  // 离开此场景后测试临时元素消失，后续保存不能把它当成产品上传控件。
  // 退役 DOM 引用也解除，避免测试自己延长媒体对象寿命却误报产品泄漏。
}

// 保存核对实际磁盘路径，刷新后再次解码，不能靠旧 Hook 内存复用已加载的图片。
// 旧四张空卡与本轮四张媒体卡一起恢复，证明 optional 字段兼容旧数据。
// 文件名与中文路径原样保留，不能把编码后的 URL 当作新的文件地址写盘。
// 用户 JSON 不应塞 base64、Blob URL 或媒体二进制，引用仍保持小体积。
// 重开后选择默认清空，媒体不自动播放，源预览与用户编辑选择保持独立。
// 之后故意移走 PNG，重试应出现真实 error，而不是一直显示缓存封面。
// 把受管副本移回后点重试，仅重新解码，不改引用或生成新的作品历史。
// 用例移动的是自己生成的临时图片，绝不对用户素材进行文件操作。
async function checkMediaPersistence(ctx, files) {
  // 顶部保存按钮走现有分段写盘器，不能测试自己直接写的 JSON 作为产品保存证明。
  // 只有界面给出真实已保存才读磁盘，避免把尚未 flush 的旧文件当成结果。
  // 磁盘读取发生在主进程测试环境，渲染层产品仍禁止导入 fs。
  await ctx.click('.hy-project-header [aria-label="保存画布"]');
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  const stored = JSON.parse(fs.readFileSync(ctx.documentPath, "utf8")).infiniteCanvas;
  // 读取 JSON 而非只看顶部成功文字，可发现保存回调空实现或缓存未真正落盘。
  // 此处只读临时文档的画布段，外层已另验无关用户分段没有被覆盖。
  // 字段保持普通数据，读取测试无需 Electron 渲染对象或浏览器 File 构造器。
  // 四份引用包含同源的第二份视频，防止序列化按 path 错误去重节点。
  // image.path 现在是受管副本的绝对路径，不能保存带 ?path 的派生协议 URL。
  // 检查 blob 字样能发现使用临时对象 URL 绕过真实路径保存的实现。
  // 旧空卡仍没有 media 字段，optional 兼容性由同一份实际草稿一起覆盖。
  ctx.smoke.check("Real JSON stores local media references", stored.nodes.filter(node => node.data.media).length === 4 && stored.nodes.some(node => node.data.media?.name === path.basename(files.image) && node.data.media.path.startsWith(path.join(ctx.root, "user", stored.workspace.folder, "Picture"))) && !JSON.stringify(stored).includes("blob:"));
// 受管路径断言替代早期原文件路径断言，是本轮业务变化。
// 导入后 stored.workspace 应由真实主进程分配。
// 图片引用必须位于该归属的 Picture 下，而不是外部原图路径。
// video 与 Audio 的分类在实际导入和工程恢复用例分别覆盖。
// 这里移动的 imagePath 从真正保存的文档读取，不由测试猜文件名。
// 受管基本名带随机身份，所以不能假设等于 cover 原名。
// 原名仍通过 media.name 保留，这与磁盘安全文件名不是同一字段。
// 如果实现只存了原路径，前面的受管前缀断言会立即失败。
// 如果它存了 blob URL，JSON 字符串检查也会失败。
// 移开受管文件再刷新，确保新解码器真的找不到地址。
// 不能只移外部原图，那已不再是当前媒体的真实来源。
// 这一区别避免测试在复制后仍错误宣称缺图回归覆盖成功。
// 恢复文件使用刚才同一个明确路径，不扫描用户目录寻回。
// 操作前后的文件都属于测试根，生产原文件从未被测试重命名。
// 最终 ready 需要真实加载事件，不直接更改 data-media-status。
// 如果 retry 只是清文字却不重建解码会话，等待应失败。
// 媒体 ready 数量同时约束图片修复不能损坏其他视频与音频。
// 保存字段仍是轻量引用，正文是否便携另由 ircanvas 测试决定。
// 不因受管目录存在就推断 portable 工程已经完整。
// 这组与新工程 round trip 各自有独立的真实失败条件。
  const imagePath = stored.nodes.find(node => node.data.media?.kind === "image").data.media.path;
  fs.renameSync(imagePath, `${imagePath}.away`);
  // 改名后的扩展名不能被当前引用误命中，浏览器必须请求原来的 PNG 地址。
  // 文件移回之前保留整个刷新过程，防止测试只读到了 rename 前的旧解码缓存。
  // 图片引用不会因为路径不存在被 schema 丢弃，结构合法与磁盘存在是两层判断。
  // 作品中的 size 是导入时快照；恢复检查依据真实读取，不把字节数相同当作已就绪。
  // 移走文件比注入 error 返回值更强，实际 localfile 请求会找不到原路径。
  // 完整刷新后 Chromium 重新发起读取，不依赖当前页面已解码的图片缓存。
  // finally 无论断言成败都会还原用例文件，便于失败后重看截图与证据。
  try {
    await ctx.win.reload();
    // 整页刷新丢掉 React 模块缓存与所有旧播放器，不能靠旧媒体 DOM 满足 ready。
    // 刷新仍使用正式 app:// 路由与生产 preload，和正常用户重新打开页面一致。
    // 缺图错误来自文件读取，不通过修改 data-media-status 属性伪造。
    await ctx.wait("document.querySelector('[data-canvas-media=image]')?.dataset.mediaStatus==='error'");
    // 八个节点都保留，缺图只能是单卡错误，不应变成整份文档水合失败或空图。
    // 重开不恢复播放进度或自动发声，作品数据与播放器临时状态保持分离。
    // 此时媒体依旧是同一来源引用，用户可以靠重试或更换来恢复显示。
    ctx.smoke.check("Reopening keeps missing references and does not autoplay", await ctx.run("document.querySelectorAll('[data-canvas-node]').length===8&&[...document.querySelectorAll('video,audio')].every(e=>e.paused)"));
  } finally { fs.renameSync(`${imagePath}.away`, imagePath); }
  // 文件还原后没有重新保存工程，因为原引用一直指向同一个地址。
  // 用户实际找回文件时也应只需重试，不应被迫重新添加一张节点才能恢复。
  // 在 finally 恢复的是测试生成的路径，不允许推广成扫描或修复用户目录的工具。
  await ctx.click('[data-canvas-media=image] .hy-media-replace button:first-child');
  // 文件已移回原地址，重试应使当前引用从 error 重新进入加载再得到 ready。
  // 不重新提供一个成功 mock，不改磁盘中的 media.path 迁就恢复预期。
  // 全部四份 ready 同时证明两份视频与一份音频没有被图片重试影响。
  // 最后截图来自刷新后的正式工作区，不是保存前仍在内存的旧预览。
  await ctx.wait("document.querySelectorAll('[data-canvas-media][data-media-status=ready]').length===4");
  // 原生 error 后的重试创建新的组件会话，已失败的事件监听不能再覆盖这次 ready。
  // 四个来源引用都来自同一临时目录，最终文档不会包含测试代码的隐藏 input。
  // 即便图片恢复成功，本用例也不触发模型任务，正常媒体和生成结果继续隔离。
  // 保存只写受管地址；便携工程导出另测正文打包，二者不能混作一项能力。
  // ready 数为四是两份视频、一份图片与一份音频，不能只等首张图片出现就结束。
  // 其他三份媒体重开后仍走真实解码，因此一处恢复成功不能掩盖另外来源失败。
  // 原引用无需迁移，媒体字段的 optional 增量与旧节点在同一 schema 下共存。
  await ctx.click('[data-canvas-viewport] [aria-label="适配全部"]');
  await ctx.shot("24-local-media-restored");
  // 最终截图保留失败后恢复状态，历史错误截图仍单独存在，不覆盖成只有成功证据。
  // 测试不删除错误日志，也不把先前失败尝试累加进最终通过数量。
}

// 顺序执行以复用同一生产窗口，失败立刻交给外层看门狗与退出码护栏。
// 不并发播放与换主题，让失败能落到具体的资源或交互契约。
// dark 由外层既有场景建立，light 在本模块从真实设置菜单切换。
// 每个阶段至少有独立断言，不拿截图保存成功当作业务验证通过。
// 文件生成只发生一次，后续重开与更换始终引用同一批真实字节。
// 调用者负责窗口最终销毁，模块不退出应用或删除外层证据目录。
async function checkCanvasMedia(ctx) {
  // 模块没有自己的成功退出入口，最终总结由外层 harness 统一判定。
  // 创建样本失败、媒体等待超时和断言失败都应保留为真实非零结果。
  // 如需新增编码覆盖，应新增真实文件与行为断言，不能只扩大格式白名单。
  // 这轮样本规模很小，结果不能推广为多个 4K 长视频并行播放的性能承诺。
  // 截图的 CSS 视口与操作系统 DPI 分开记录，不借 deviceScaleFactor=1 宣称系统缩放通过。
  // 用户真实鼠标拖入、触控板与读屏体验不会因这一组自动检查而改为通过。
  // 所有场景保持串行，媒体与写盘竞争更容易定位到具体步骤。
  // 如果外层以后改变旧节点基线，应同步审查真实预期，而不是无条件放宽节点数。
  const files = createFiles(ctx.root);
  await checkImportChoice(ctx, files);
  await checkImports(ctx, files);
  ctx.smoke.check("Default copying preserves the real source", fs.existsSync(files.video));
  await checkImageDragging(ctx);
  await checkPlayback(ctx);
  await checkLightTheme(ctx);
  await checkImportFailures(ctx, files);
  await checkDropAndCleanup(ctx, files);
  await checkMediaPersistence(ctx, files);
}
module.exports = { checkCanvasMedia };

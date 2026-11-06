/** 三层片段与真实源波形验收：真实编码信号、生产桥接和正式页面分别提供证据。 */
// 不使用mock峰值填充SVG，不把DOM/CDP自动操作说成人工鼠标或试听。
const fs = require("node:fs"), path = require("node:path");
const { execFileSync } = require("node:child_process");

// 本轮新增源文件放在外层随机目录，结束后保留给截图和失败诊断复查。
// 横屏源含AAC，竖屏源无音轨，两者分别验证有声与无声的真实探测分支。
// 后加的三段声音源用于信号数值验证，不冒充用户录音或人工试听。
// helper不替换preload方法，读取走生产videoWaveform及生产registerHandle。
// 首先检查形状契约，再检查信号，最后检查布局，三者失败含义不同。
// 形状通过不能证明解码成功，真实解码通过也不能证明波形槽没有盖住帧带。
// 自动事件与系统鼠标分开记录，测试不会抢用户前台程序的焦点。
// 外层继续运行原导航用例，新增包络请求不能让退出后的源播放器残留。

// 生产schema经TypeScript擦除类型后运行，Zod仍是仓库真实依赖。
// relative import只来自硬编码schemas目录，不接受页面传进来的任意模块名。
// 手写validator与schema对同一反例逐项比较，避免只有类型通过却跨边界行为不同。
// 只加载本契约需要的media/common，不执行Electron主进程或渲染业务。
// 候选bad包含null、数组、URL、额外字段、错误cancel和超长身份，均应拒绝。
// 正常盘符和UNC路径都接受，取消不需要源路径，符合实际清理用途。
// schema加载失败必须抛出，不能以空对象代替后续校验器继续通过。
// Zod是否成功只用于验证输入形状，不替代真实磁盘读取和解码用例。
// 主进程validator本身纯函数，可以在任意输入下调用且不应抛异常。
// 原公共文件有其他schema，加载时不为它们创建假数据或更改契约。
// 测试的绝对路径只是合法形状，此组不宣称它们真实存在。
function schema(name) {
  const ts = require("../../apps/next/node_modules/typescript"), result = {};
  const source = fs.readFileSync(path.join(__dirname, "../../packages/shared/src/schemas", `${name}.ts`), "utf8");
  new Function("exports", "require", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(result, dependency => dependency === "zod" ? require("../../packages/shared/node_modules/zod") : schema(dependency.slice(2)));
  return result;
}

// schema helper只解析仓库已知文件，transpileModule用于运行TS形状而非构建应用。
// Zod从shared依赖位置读取，与生产定义使用的版本保持一致。
// CommonJS导出对象每次独立创建，不将Electron handler注入共享schema。
// relative依赖递归只为media引用common，测试没有让页面指定要执行的脚本路径。
// 编译后的schema与主进程校验分别执行，这样能发现两边对同一字段长度不一致。
// schema是否成功还与独立expected比较，避免两个实现同时接受错误输入却互相背书。
// 当前只验证输入，不通过在测试里重新定义输出类型来掩盖生产返回差异。
// require失败将中断测试，不能把缺少Zod依赖误记成没有非法请求。

// 每个反例预期独立写出，不能以主进程结果生成“正确的schema期望”。
// 两边都错成接受非法路径，也会因expected=false而失败，不只比较彼此相等。
// `-inf`是静音峰值，不应报错或产生NaN；0dB与-20dB分别期望1与0.1。
// 缺失数据必须抛错，不能返回空数组然后画一条似是而非的静音线。
// 数字转换之后检查幅度，而非只检查Peak_level字符串出现过。
// 非法输入不进handler，所以不会启动FFmpeg、创建文件或占用任务额度。
// 长身份反例81字符，正好超过schema与主进程共同的80上限。
// 多一个字段也拒绝，防止未来重构误将非法控制消息降级为读取。
// 本组在真实波形请求之前执行，若契约不一致就停止，不用页面图片掩盖。
// 引用的是生产服务导出的解析器，不在测试里重新写db转振幅算法。
function contractChecks(ctx) {
  const { validateWaveform, parsePeaks } = require("../../apps/electron/src/main/modules/ffmpeg/waveform");
  const shape = schema("media.schema").VideoWaveformRequestSchema;
  const cases = [[{ requestId: "a", inputPath: "C:\\video.mp4" }, true], [{ requestId: "a", inputPath: "\\\\server\\video.mp4" }, true], [{ requestId: "a", cancel: true }, true], [null, false], [[], false], [{ requestId: "a", inputPath: "https://example.com/a.mp4" }, false], [{ requestId: "a", cancel: false }, false], [{ requestId: "a", inputPath: "C:\\a.mp4", cancel: true }, false], [{ requestId: "a".repeat(81), cancel: true }, false]];
  ctx.smoke.check("Waveform schema and main validator agree on strict valid and invalid requests", cases.every(([input, expected]) => shape.safeParse(input).success === expected && (validateWaveform([input]) === null) === expected));
  const peaks = parsePeaks("lavfi.astats.Overall.Peak_level=-inf\nlavfi.astats.Overall.Peak_level=0\nlavfi.astats.Overall.Peak_level=-20\n");
  ctx.smoke.check("Waveform parser distinguishes silence from decoded linear amplitude", peaks[0] === 0 && peaks[1] === 1 && Math.abs(peaks[2] - .1) < 1e-12);
  let missing = false;
  try { parsePeaks("frame:0 pts:0"); } catch { missing = true; }
  ctx.smoke.check("Missing audio statistics cannot pass as a silent waveform", missing);
}

// 合法读取请求给出盘符绝对路径，契约阶段不要求那份示例文件实际存在。
// 合法UNC例覆盖不同根路径形式，不能只用一个C盘样例推断所有本地路径。
// 取消请求不含inputPath，验证文件被外部删除后仍能按身份清理任务的入口。
// null反例会发现validator在判空之前就直接解构对象的问题。
// 数组反例防止把typeof object错误地等同于合法记录。
// 网络URL反例预期形状直接拒绝，不等待FFmpeg网络连接或文件读取失败才算通过。
// cancel:false反例确保取消必须是明确意图，不被真假值强制转换。
// 读取路径与cancel同时出现的反例覆盖联合对象交叉字段不能混用。
// 81字符身份反例只越过上限一个字符，用于发现schema与手写上限差一的问题。
// parsePeaks使用生产函数，三个分贝值的独立预期来自振幅公式和静音定义。
// -20dB误用功率换算会变成0.01，这条断言能发现db/10与db/20混淆。
// 缺Peak_level字段时必须抛错，不能拿frame/pts数字凑成一份看似合法的波形。
// silent与missing分别测试，避免把解析失败统一回落零值后两者无法区分。
// 契约用例不创建文件，也没有把假路径读取成功计入实机验证数量。

// 生成有静音、0.02与0.4振幅三个时段的真实AAC，视频画面复用既有横屏源。
// 每段0.8秒，总长2.4秒，440Hz正弦由FFmpeg合成后编码，不是峰值数组夹具。
// aevalsrc表达式中的逗号属于滤镜表达式，引号在参数字符串内由FFmpeg解析。
// shell未参与执行，路径和表达式不会被PowerShell拆词或执行命令替换。
// c:v copy避免再编码画面影响后面首帧比较，当前新增源不会自动导入工程。
// AAC边界会有编码过渡，后续只读取每段中间窗口，不能要求有损编码逐样本相等。
// 输出位于本轮临时root，不读取、覆盖用户私人素材或项目文件。
// 30秒上限与1MiB诊断缓冲避免测试生成阶段永久阻塞。
// 主进程后续自己探测音轨和时长，测试不传入“预期0.8秒窗口”修改生产映射。
// 静音段是音轨内零信号，和无音轨视频的null响应必须区别测试。
function makeEnvelope(ctx) {
  const { resolveTools } = require("../../apps/electron/src/main/modules/ffmpeg/locate");
  const file = path.join(ctx.root, "waveform-envelope.mp4");
  const sound = "aevalsrc='if(lt(t,0.8),0,if(lt(t,1.6),0.02,0.4))*sin(2*PI*440*t)':s=48000:d=2.4";
  execFileSync(resolveTools().ffmpegPath, ["-y", "-v", "error", "-i", path.join(ctx.root, "landscape-audio.mp4"), "-f", "lavfi", "-i", sound, "-map", "0:v:0", "-map", "1:a:0", "-t", "2.4", "-c:v", "copy", "-c:a", "aac", file], { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
  return file;
}

// 三段的振幅是线性0、0.02、0.4，而非0、20、40分贝。
// 正弦频率固定440Hz，把变化来源限定为振幅，避免同时改变频率影响判断。
// 0.8秒边界的滤镜表达式由FFmpeg解释，不经过shell文本替换。
// 视频只做copy，音频真实AAC编码再由生产服务解码，覆盖容器与编解码链。
// -map丢掉原横屏源音轨，只保留新信号，避免两份声音同时混入导致预期不独立。
// -t把容器限制到2.4秒，长度与三段各0.8秒的算术一致。
// AAC有编码延迟和窗口边界过渡，所以后面的数值不要求精确等于输入小数。
// 读取每段中间点可避开过渡，仍能区分静音、轻声和较大声音。
// execFileSync只用于有限时长测试准备，生产UI仍使用异步读取流程。
// 若准备失败直接抛出，不读取上一次运行留下的同名源当作新样本成功。
// -y只覆盖本轮随机目录中的固定测试文件，不涉及用户磁盘素材。
// 创建编码文件与用固定峰值数组是两种证据，报告会明确这是合成信号真实编码源。

// 通过生产preload invoke读取真实源，未替换videoWaveform handler或返回值。
// 按真实secondsPerPeak取每段中间点，不能按数组三等分掩盖源时间步长错误。
// 0.4秒应近静音、1.2秒应约0.02、2秒应约0.4，阈值留给AAC/8kHz下混合理损耗。
// 三段有序差异能反证随机装饰或固定满幅线，不仅检查数组长度。
// 非法路径请求期待INVALID_ARGUMENT，不能因为后续文件不存在才算正确拒绝。
// 无音轨源期待成功null，和损坏源的失败结果分别验证。
// 立即取消先发读取再发同身份cancel，Promise最终必须结束，不能挂住页面退出。
// 取消结果允许任务已来得及完成但本短时间通常在探测前；下方以null作为取消契约。
// 导入系统框仍由外层夹具提供，这组请求不冒充人工文件管理器拖入。
// 原工程片段数量与选择由后续UI快照守护，单独读取峰值不应创建轨道。
// requestId是短ASCII硬编码，只在测试隔离窗口内使用，不影响用户应用。
// 失败通过harness累计，读取成功本身不等于真实扬声器已经试听。
async function signalChecks(ctx) {
  const file = makeEnvelope(ctx);
  const result = await ctx.run(`window.electronAPI.videoWaveform({requestId:'envelope',inputPath:${JSON.stringify(file)}})`);
  const data = result.success && result.data;
  const levels = data ? [.4, 1.2, 2].map(time => data.peaks[Math.floor(time / data.secondsPerPeak)]) : [];
  ctx.smoke.check("Real AAC silence, quiet and loud windows produce distinct bounded source peaks", data && data.peaks.length <= 4096 && levels[0] < .001 && levels[1] > .008 && levels[1] < .05 && levels[2] > .25, JSON.stringify(levels));
  const invalid = await ctx.run("window.electronAPI.videoWaveform({requestId:'invalid',inputPath:'https://example.com/a.mp4'})");
  ctx.smoke.check("Waveform IPC rejects network source before media access", invalid.success === false && invalid.code === "INVALID_ARGUMENT");
  const silent = await ctx.run(`window.electronAPI.videoWaveform({requestId:'silent',inputPath:${JSON.stringify(path.join(ctx.root, "portrait-silent.mp4"))}})`);
  ctx.smoke.check("A real silent-track video has no fabricated waveform", silent.success && silent.data === null);
  const cancelled = await ctx.run(`(async()=>{const pending=window.electronAPI.videoWaveform({requestId:'cancel',inputPath:${JSON.stringify(file)}});await window.electronAPI.videoWaveform({requestId:'cancel',cancel:true});return pending})()`);
  ctx.smoke.check("Cancelling a real waveform request ends its probe/decode lifecycle", cancelled.success && cancelled.data === null);
}

// 0.4秒位于静音段中央，阈值0.001允许AAC数值残留但拒绝装饰性的明显起伏。
// 1.2秒轻声阈值0.008至0.05包含合理解码误差，仍远小于最后的0.4目标。
// 2秒需大于0.25，因此把所有窗口画成同一个常量也不能通过三点组合。
// 所有下标由生产返回的secondsPerPeak计算，测试不预设源数组恰好有2048项。
// 这会发现服务返回了数组但时间步长标错导致静音窗口被错配到说话段的问题。
// peaks.length上限是额外载荷约束，防止真实解码成功却返回无限音频样本。
// 元素存在不等于数值正确，所以检查幅度范围而非只断言data不是null。
// 生产unwrap不会参与测试结果加工，读取的是preload原始IpcResult。
// 非法URL期待INVALID_ARGUMENT，可区分schema拒绝与后续普通读取错误。
// 无音轨竖屏源由真实ffprobe判断，测试没有把hasAudio:false传给服务制造答案。
// 无声源响应为success:true且data:null，与有音轨但全零数组的静音不同。
// 立即取消复用同一requestId，控制消息不携带原路径，覆盖真实生命周期入口。
// 取消断言要求pending结束，不能只检查控制消息自己返回了null就算释放完成。
// 这仍未测窗口进程崩溃或系统强杀，正常取消通过不外推所有故障清理。
// 读取错误不会自动重新生成源文件，不通过重试变更数据使断言侥幸成功。
// 三点数值写入测试日志，便于对比真实静音与强弱顺序，不只保留一个PASS标签。
// 扬声器保持原隔离默认，信号峰值正确并不说明用户实际听到了声音。
// 以上请求是同一个窗口串行发出，不违反仓库一次一个Electron冒烟的约束。

// 读取正式DOM几何，三层相邻且声音槽不能压到连续帧上。
// 只把真实源ready算采样成功，不以页面存在svg就假定有音轨。
// 帧带和波形的sourceIn/span必须相同，修剪候选/确认后不能一边裁了另一边还显示全源。
// 对象来自前面的真实trim/变速用例，因此源跨度不一定等于工程片段长度。
// 名称/时间码来自原共同壳，测试不增加自己的标题来迎合参考。
// 截图前调整原视口缩放到256，让短真实源的三层细节可辨认。
// 更改缩放只写正常range输入事件，不更改片段start/end或产品CSS。
// 长片段可横滚查看，scrollIntoView只准备可见性，避免按需帧带在屏外不解码。
// 主窗口真实capturePage产生截图，有限绘制等待只用于表面提交，不代替ready断言。
// 浅深主题原矩阵仍由外层执行，本截图保留当前真实主题而非后期改色。
// 所有新验证均在原窗口内串行执行，原导航资源释放用例随后继续运行。
async function layoutChecks(ctx) {
  await ctx.wait("!!document.querySelector('[data-editor-kind=video] [data-waveform-state=ready]')");
  ctx.smoke.check("Real video clip has name/timecode above frames and decoded waveform below", await ctx.run("(()=>{const e=document.querySelector('[data-editor-kind=video]:has([data-waveform-state=ready])'),n=e.querySelector('[data-clip-timecode]').parentElement.getBoundingClientRect(),f=e.querySelector('[data-video-filmstrip]').getBoundingClientRect(),w=e.querySelector('[data-clip-waveform]').getBoundingClientRect();return e.getBoundingClientRect().height===74&&n.bottom<=f.top+.1&&f.bottom<=w.top+.1&&w.height===16&&e.querySelector('[data-clip-timecode]').textContent.includes(':')&&!!e.querySelector('[data-clip-waveform] path').getAttribute('d')})()"));
  ctx.smoke.check("Filmstrip and real audio envelope share the exact trimmed source interval", await ctx.run("[...document.querySelectorAll('[data-editor-kind=video]:has([data-video-filmstrip])')].every(e=>{const f=e.querySelector('[data-video-filmstrip]'),w=e.querySelector('[data-clip-waveform]');return Math.abs(Number(f.dataset.filmstripSourceIn)-Number(w.dataset.waveformSourceIn))<1e-6&&Math.abs(Number(f.dataset.filmstripSpan)-Number(w.dataset.waveformSpan))<1e-6})"));
  await ctx.run("(()=>{const e=document.querySelector('[data-timeline-zoom]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'256');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await ctx.delay(200);
  await ctx.run("document.querySelector('[data-editor-kind=video]:has([data-waveform-state=ready])').scrollIntoView({block:'nearest',inline:'center'})");
  await ctx.delay(250);
  await ctx.wait("!!document.querySelector('[data-editor-kind=video] [data-filmstrip-ready=true]')");
  ctx.win.webContents.invalidate(); await ctx.delay(150);
  fs.writeFileSync(path.join(ctx.root, "timeline-three-layer-real-video.png"), (await ctx.win.webContents.capturePage()).toPNG());
}

// 槽位几何从浏览器getBoundingClientRect读取，不用CSS源码字符串自证布局。
// 总高74px包括两像素边框；标题16、帧带40、波形16刚好占据内容区。
// 标题bottom不能超过帧带top，帧带bottom不能超过波形top，分别保护两个边界。
// 小于0.1像素容差只吸收浮点投影，不允许文字或波形压进另一层。
// 波形高度16是视频内嵌声音槽的约定，独立音轨占标题下更高区域属于另一种布局。
// path必须有真实d值，仅挂一个SVG容器或空轮廓不能通过。
// 时间码必须有分隔符，防止上方只有名称却遗漏持续时间。
// ready限定真实video片段，独立样板的DemoWaveform不会满足这一前提。
// 帧带与波形都按源秒比较入点和跨度，不能一边使用工程秒、另一边使用源秒。
// 允许微秒内差异与帧带输入既有toFixed(6)一致，不放宽到可见的整帧误差。
// 断言覆盖当前工程里的每个真实视频帧带，不能只有第一段同步而副本仍错。
// 调整range值通过原生setter通知React，不能直接修改片段style或canvas像素制造截图。
// 后面的scrollIntoView只改变浏览器视口，原工程start/end由既有回归继续守护。
// 等待data-filmstrip-ready来自生产真实解码完成，不由截图等待定时器设置。
// capturePage取整个正式窗口，保留播放器、属性和时间线的真实空间关系。
// 当前截图里的彩条来自实际视频测试源，不是给时间线单独画的颜色占位。
// 截图可核对帧带排布，但不等于人工验证左右边缘全程手感或系统缩放。
// 保存后仍执行原导航释放场景，截图成功不会提前退出掩盖后续资源异常。

// 契约、真实信号与实际UI三类证据分开报告，不把纯函数反例计成人工媒体操作。
// 任一阶段抛异常由外层冒烟护栏非零退出，后面的截图不会掩盖先前失败。
// 外层已负责构建指纹、窗口生命期与失败日志，这里不另建重复harness。
// 不改系统主题、不操作桌面鼠标、不连接用户现有实例，验证结果归隔离工程。
async function checkVideoWaveform(ctx) {
  contractChecks(ctx);
  await signalChecks(ctx);
  await layoutChecks(ctx);
}
module.exports = { checkVideoWaveform };

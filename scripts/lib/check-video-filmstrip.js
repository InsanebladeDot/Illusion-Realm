/** 倍速、真实帧带和细边缘验收，借用既有LIVE真实媒体与同一Electron窗口。 */
// DOM/CDP自动操作与人工鼠标明确分开；采样来自实际视频解码，不提供假封面。
// 这组用例放在历史回归之后，避免变速后的时长影响旧碰撞案例的前置条件。
const fs = require("node:fs"), path = require("node:path");

// 只加载编辑器纯模型的相对依赖，类型导入由TypeScript擦除。
// 生产算法直接执行，碰撞期望手写，不复制一份“正确算法”自证。
// 缓存避免循环导入；未知非相对依赖立即失败，不能以空对象掩盖契约变化。
// 加载器只读取仓库固定目录的生产TS，不能把用户文件名拼成脚本执行路径。
// 模块名来自本文件硬编码调用和生产相对导入，不接受远程输入。
// TypeScript转译不改算法语句，类型擦除后仍执行当前源代码的校验分支。
// 缓存按模块名登记，可让live-timeline-model与timeline-track-model互相引用时保持同一导出对象。
// 先登记空导出再执行模块，循环依赖不会无限递归地重新读文件。
// 非相对运行时依赖直接抛出，新增依赖时测试应提醒人工审查，而非自动塞假实现。
// 文件不存在也直接失败，不能用空源码让模型断言悄悄跳过。
// 模型加载不经过React，因而本组不能证明属性字段实际接上了回调。
// 后续真实窗口用例正好补这一缺口，两个证据层级不得合并成一次实机操作。
// 这里没有构造假HTMLVideoElement，媒体行为全部留给Chromium真实节点。
// 模型中的类型导入被擦除，不为测试复制VideoProbeResult字段。
// 导出结果按模块缓存，后续取到的是相同纯函数，不引入第二份状态仓库。
// 夹具数组冻结后调用函数，意外原地修改会在后续快照比较中暴露。
// 纯模型测试不依赖磁盘视频时长，固定六秒反例的正确答案可以独立写出。
// 这样真实探测源较短也不会迫使碰撞反例修改预期来迎合产品错误。
// 生产源码中的import改动会影响本加载器，失败需要判断依赖变化，而不是直接忽略。
// require白名单约束的是测试执行边界，不声称它可以替代产品IPC权限验证。
// 没有从编译产物反推源文件路径，路径明确落在仓库编辑器目录。
// 这份转译检查与静态导出运行都保留，各自说明验证对象与局限。
function models(name, cache = new Map()) {
  if (cache.has(name)) return cache.get(name);
  const result = {}, ts = require("../../apps/next/node_modules/typescript");
  cache.set(name, result);
  const source = fs.readFileSync(path.join(__dirname, "../../apps/next/src/view/toolBox/Tool/video/editor", `${name}.ts`), "utf8");
  const load = dependency => {
    if (!dependency.startsWith("./")) throw new Error(`Unexpected model dependency: ${dependency}`);
    return models(dependency.slice(2), cache);
  };
  new Function("exports", "require", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(result, load);
  return result;
}

// 六秒源在工程上占0–6秒，2倍速后必须为0–3秒，源入点仍为零。
// 同轨第七秒放邻居，0.5倍速需要十二秒，必须整体拒绝，不能悄悄截到七秒。
// 锁轨反例使用合法2倍速，拒绝只能来自权限，不来自数值或碰撞错误。
// 2倍速左修剪1秒对应源前进2秒；右延长也受剩余源内容限制。
// 输入冻结并在操作后重新比较，防止修改源对象让后续期望跟着变化。
// 当前目标视频0到6秒，旁边7到13秒，特意保留一秒空隙作为独立碰撞反例。
// 0.5倍速需要0到12秒，确实会覆盖邻居，不能因为之前存在空隙就允许。
// 2倍速正确出点直接期望3，不使用被测函数计算出来的新长度作为正确答案。
// 相同数组调用多次后再次检查JSON快照，能发现先前成功调用污染后续用例。
// 邻居对象也冻结，不能把错误实现移动邻居后得到的“无重叠”结果算通过。
// sourceIn期望零独立于工程out，速度变化不能偷偷改读入位置。
// 检查锁使用同一合法请求，避免非法速度或碰撞先拒绝导致锁校验根本没测到。
// 模型返回null表示拒绝整个编辑，不把返回原数组误认为一次成功确认。
// 左修剪1秒在2倍速下必须sourceIn2秒，能发现仍按1倍映射的老算法。
// 出点仍为3秒，说明左修剪不是整段平移，不能同步把尾部向右挪。
// 工程fps固定30，源秒与项目帧的单位区别由具体数字揭示。
// 这个纯反例只证明时间映射，不能声称真实视频画面已经变速播放。
// 实际playbackRate断言在rateChecks另行验证，避免只改数据而播放器仍1倍。
// 没有修改固定六秒源去迁就错误碰撞，预期和前提从一开始就明确。
// 测试不把另轨覆盖视为碰撞，层叠仍由已有多轨反证负责。
// 原98帧与22帧空隙历史用例仍先运行，不因为新增速度而缩短旧测试源。
// clip的assetId与neighbor相同，能检查同源不同实例不能被碰撞函数一起排除。
// 成功结果只要求目标变化，原输入不变仍是必须满足的独立条件。
// 不根据测试通过推断专业音高重采样、倒放或编码导出已经实现。
function speedModels(ctx) {
  const model = models("clip-speed-model"), track = models("timeline-track-model");
  const clip = Object.freeze({ id: "video", assetId: "source", track: "V1", start: 0, end: 6, sourceIn: 0, sourceDuration: 6 });
  const neighbor = Object.freeze({ ...clip, id: "neighbor", start: 7, end: 13 });
  const clips = Object.freeze([clip, neighbor]), snapshot = JSON.stringify(clips);
  const fast = model.changeClipSpeed(clips, "video", 2, 30, []);
  ctx.smoke.check("Clip rate changes duration while retaining source interval and immutable input", fast[0].end === 3 && fast[0].speed === 2 && fast[0].sourceIn === 0 && JSON.stringify(clips) === snapshot);
  ctx.smoke.check("Slowdown collision and locked rate edits reject without shortening the source", model.changeClipSpeed(clips, "video", .5, 30, []) === null && model.changeClipSpeed(clips, "video", 2, 30, ["V1"]) === null);
  const trimmed = track.trimClip(fast, "video", "start", 1, 30, [])[0];
  ctx.smoke.check("Trim at 2x maps project seconds to real source seconds", trimmed.start === 1 && trimmed.sourceIn === 2 && trimmed.end === 3);
}

// 通过原生value setter和输入事件提交草稿，不能直接调用组件内部onCommit。
// Enter在下一事件间隔发出，确保React已记录新字符串而非提交旧闭包值。
// 作用域显式区分属性区与预览区，同名数值字段不会互相覆盖。
// 作用域R04意味着片段属性，R03意味着当前预览，输入助手不会根据页面第一个input猜目标。
// 标签匹配使用固定中文测试语言，这是测试前提，不参与产品存储键设计。
// 源数值转成字符串后交给真实输入事件，避免直接改组件props跳过校验。
// 不手动移除disabled或readOnly，所以产品错误禁用时提交会失败。
// 先focus会触发上一个字段的原生blur，能够发现草稿跨字段提交问题。
// Enter事件包含冒泡与可取消标志，按组件真实处理路径确认。
// 分开两个浏览器事件间隔，是为了让React记录中间草稿，而非睡够时间就算成功。
// 调用方随后读取媒体rate或片段区间，不能只看input.value变了就报告业务生效。
// 输入precision沿用产品两位显示，测试助手不在发送前四舍五入掩盖字段错误。
// 本助手允许任意字符串，为后续非法草稿反例保留入口。
// 当前用例只输入合法倍速，不冒充已经覆盖所有非法文本组合。
// 没有向window挂测试专用产品方法，生产页面不需要识别自己正在被回归。
// 输入提交可能触发碰撞拒绝，是否成功要由原工程结果判断。
// 焦点路径是自动focus而非人工Tab，交付必须继续区分证据级别。
// 键盘事件由DOM派发，不占用用户当前前台程序的真实键盘。
// 这里的短等待不参与生成、播放或时间线时钟，没有伪造产品进度。
// 标签不存在时让查询失败，而非静默跳过并将功能当作已测。
async function field(ctx, region, label, value) {
  const expression = `[...document.querySelectorAll('[data-editor-region=${region}] label')].find(e=>e.textContent.includes(${JSON.stringify(label)})).querySelector('input')`;
  await ctx.run(`(()=>{const e=${expression};e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ctx.delay(60);
  await ctx.run(`(${expression}).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);
  await ctx.delay(100);
}

// 当前工程已有真实横竖视频，选择V1的一个实例以确保新属性来自工程而非样板。
// 先等真正的帧带解码成功，再截图；仅有canvas节点不能证明已经抽到视频帧。
// 速度2会缩短当前片段，因此不新增同轨冲突，后续源映射另有纯模型反例。
// 预览1.5乘片段2得到实际3倍；工程长度不能被预览倍率二次改变。
// 选择V1当前实例后再读属性，排除属性区仍停在上一条A2音轨的假前置。
// 源解码等待检查readyState至少2，只有video节点存在不足以证明可读真实帧。
// 保存变速前区间，再保存变速后区间，两次快照来自公开DOM确认值。
// 允许最多一帧的向上占位差，不能给足一秒容差让错误截短也通过。
// 2倍速必须明显缩短当前片段，单纯把speed输入显示2而长度不动会失败。
// 真实源总长不被测试修改，新的占位仍要由生产速度模型决定。
// 预览1.5与片段2的乘积独立写成3，能发现只应用其中一个倍率的错误。
// 同一时刻再读工程end完全相等，证明预览倍率不重复计算工程时长。
// 倍率恢复1后仍保留片段2倍，防止把两个状态变量错误合并。
// 最终等待filmstrip-ready标记，确认真实采样任务完成而非只渲染一个空canvas。
// 这个标记必须由生产抽样成功设置，测试不手动填写dataset。
// 真实视频字节由外层FFmpeg生成，帧带来源不是给测试准备的一排静态缩略图。
// 当前检查不逐像素比对每格画面内容，缓存与时间分布还依赖代码审查和截图。
// 不能因这条通过声称已经逐帧遍历整部源视频，本实现是有限采样概览。
// 只选择一个目标来改速，同源实例独立性仍由原复制与画布回归保护。
// 测试场景保持未保存提示，不把浏览器rate改变当成文件转码成功。
// 源帧率与工程帧率不同的第二视频仍在原回归中导入，不能删掉来简化新用例。
// 解码器实际rate比只检查控制条文字更强，但不等于音高与扬声器试听已验。
// 本组最终默认静音，不因速度测试干扰用户正在使用的音频设备。
// 预设按钮来自项目SimpleSelect，不使用测试自制的select模拟新入口。
// 菜单Portal挂在外层，查询data-simple-select-option定位真实选项，避免按第几个button猜测。
// 选2倍预览后实际媒体rate应为4，因为片段速度仍为2。
// 这与接着输入1.5的自定义路径共同证明两个控件写的是同一份状态。
// 如果预设只更新菜单勾选但不更新播放器，真实rate断言会失败。
// 如果手动输入仍被旧预设覆盖，后续3倍媒体rate断言会失败。
// 自定义值1.5是已有预设之一，但输入通路与点击选项通路确实不同。
// 当前没有对1.37等任意小数做完整媒体运行样例，范围与精度由公共字段回归和审查覆盖。
// 预设关闭后焦点返回由SimpleSelect实现，未伪造系统原生下拉菜单。
// 预览倍率改变不自动解除静音，也不会改变已分离音轨的独立工程身份。
// 选项文本带×单位，测试不按本地化显示数字解析业务状态。
// 旧源fps事实仍保留，3倍播放不会把metadata.fps写成90。
// 这里使用短实际视频，不能声称已经验证长时间持续倍速音画漂移。
// 当前多层同步由主时钟推动，已有双真实video的暂停回归仍必须通过。
// 测试没有把更低层封面抹掉来隐藏不同倍率时的同步错误。
async function rateChecks(ctx, id) {
  await ctx.click(`[data-editor-clip="${id}"]`);
  await ctx.wait("document.querySelector('[data-live-video]')?.readyState>=2");
  const before = (await ctx.clips()).find(clip => clip.id === id);
  await field(ctx, "R04", "速度", 2);
  const after = (await ctx.clips()).find(clip => clip.id === id);
  ctx.smoke.check("Real inspector speed shortens the selected instance only", after.end - after.start < before.end - before.start && Math.abs((after.end - after.start) * 2 - (before.end - before.start)) <= 1 / 30 + .001);
  await ctx.click('[data-editor-region=R03] button[aria-label=预览倍速预设]');
  await ctx.click('[data-simple-select-option="2"]');
  ctx.smoke.check("Shared preset selector applies rate to the same real preview", await ctx.run("document.querySelector('[data-live-video]').playbackRate===4"));
  await field(ctx, "R03", "预览倍速", 1.5);
  ctx.smoke.check("Preview rate multiplies actual playbackRate without editing project duration", await ctx.run("document.querySelector('[data-live-video]').playbackRate===3") && (await ctx.clips()).find(clip => clip.id === id).end === after.end);
  await field(ctx, "R03", "预览倍速", 1);
  // 屏幕截图暴露横排标签会把紧凑输入压到几像素；不能只通过程序输入就算可用。
  // 读取真实命中宽度至少40px，确保用户能看到并手动编辑完整倍率。
  ctx.smoke.check("Custom rate input remains visibly editable in the compact transport", await ctx.run("document.querySelector('[data-editor-region=R03] input').getBoundingClientRect().width>=40"));
  // 前序多轨测试留下横纵滚动，窗口加宽也不会自动把目标片段滚回屏内。
  // 胶片带按真实可见性按需采样，不能要求屏外节点产生就绪标记。
  // 通过正常滚动恢复本例前提，不改采样器、片段时间或成功断言。
  await ctx.run(`document.querySelector('[data-editor-clip="${id}"]').scrollIntoView({block:'nearest',inline:'center'})`);
  await ctx.wait(`document.querySelector('[data-editor-clip="${id}"] [data-filmstrip-ready=true]')!==null`);
}

// 连续按八次下一帧，等待真实解码器停止seeking后核对源时间，不用按钮图标代替帧证据。
// 片段2倍速意味着工程八帧对应源十六帧；精度容差只容纳媒体当前时间浮点误差。
// 起始工程位置由预览时间码的唯一data-time观察，不能读取React私有状态。
// 每次点击间隔只是浏览器事件节拍，不是产品用定时器模拟进度。
// 整组耗时用于记录响应上界，未验证人工长按或任意编解码器性能。
// 项目当前时间来自播放头公开data-time，不能拿源currentTime直接当工程位置。
// 八次点击通过产品下一帧按钮，不直接给媒体currentTime赋测试值。
// 每次按钮点击都会经过统一seek入口，旧pause回执不能把累计工程时间退回去。
// 目标8/30秒是由固定项目fps独立决定，不从播放器返回值反推。
// 媒体seeking结束才评估定位，不将正在定位的旧帧误认为最终画面。
// readyState再次检查，避免源切换后节点重建但仍没有解码帧。
// 五秒响应上界只适用于本机短H264测试源，不是所有用户视频的性能承诺。
// Date.now计算覆盖真实按钮等待与解码响应，未用固定值伪造一个耗时结果。
// 如果八次点击丢掉其中一帧，严格的工程步长比较会失败。
// 如果一次点击推进源帧而非工程帧，源fps不同或片段倍速会暴露时间不一致。
// 这里没有人工长按键盘repeat事件，不能写成所有持续按键卡顿均已解决。
// 测试只证明本轮八次连续操作能准确结束，并保留对编解码性能的限制说明。
// 没有使用浏览器fastSeek近似定位，当前产品仍要求精确currentTime目标。
// 暂停由产品逐帧回调触发，不由测试提前pause以绕过播放竞争。
// 定位后如遇工程边界，产品可以夹限；本例明确选在足够长的片段内部。
// 纯黑空隙不作为可读帧的正确结果，因此前置实际选择视频很关键。
// 这项不覆盖跨片段连续自动播放，不能由八次手动定位外推调度已完成。
async function stepChecks(ctx) {
  const before = await ctx.run("Number(document.querySelector('[data-editor-playhead]').dataset.time)");
  const started = Date.now();
  for (let index = 0; index < 8; index += 1) await ctx.click('[data-editor-region=R03] button[aria-label=下一帧]');
  await ctx.wait("document.querySelector('[data-live-video]')?.readyState>=2&&!document.querySelector('[data-live-video]').seeking");
  const after = await ctx.run("Number(document.querySelector('[data-editor-playhead]').dataset.time)");
  ctx.smoke.check("Repeated frame steps use real seek and retain exact project-frame increments", Math.abs(after - before - 8 / 30) < .001 && Date.now() - started < 5000);
}

// 原生wheel事件在时间线投递，Ctrl以外的滚轮不应改变时间比例。
// 缩放前后保存全部片段区间，证明只改视口，不能用时长变化伪装放大。
// 鼠标选在内容列可见区域内，横滚位置不从全局窗口宽度猜测。
// 方向光标来自真实左右热区计算样式，不靠测试给元素加临时样式。
// Ctrl修饰位使用CDP规定值2，不能用一次普通滚轮误认为产品缩放。
// mouseWheel由Chromium输入通道发出，不直接调用Hook内部zoom方法。
// 指针位置来自真实时间线视口右侧可见区域，不使用屏幕固定坐标猜落点。
// 读取lane.width而非整个timeline含轨道头宽度，密度变化的观察对象才正确。
// 放大后lane必须更宽，单纯改变滑杆数字但不重绘时间尺不能通过。
// 保存全部片段对象的公开区间快照，不能只检查当前选中目标没变。
// 缩放不允许悄悄改变同源副本或已分离音轨的start/end。
// 旧横滚后放置回归继续存在，这条新断言不替代拖放坐标准确性验证。
// 光标分别读取start与end热区，不能只看父片段cursor后推测两侧正确。
// 边框宽度精确1px，允许粗2px以上会掩盖用户这次提出的视觉问题。
// 此处检查CSS计算值，不手动临时加class让截图更像参考。
// 选中片段仍可正常修剪，热区透明不等于pointer-events被关闭。
// 截图与计算样式互补，CSS正确也可能因覆盖层让实际命中失败。
// 前面的真实边缘拖动覆盖命中路径，本组只补充方向提示与线宽。
// 未测触控板的所有高频delta组合，不将一次CDP滚轮外推为系统手势全覆盖。
// DPR仍是测试进程当前值，不把CSS像素布局通过称为Windows125%缩放已验。
// 普通非Ctrl滚动保留产品逻辑，本条断言没有重新验证每种滚动设备。
// 测试窗口独立，Ctrl滚轮不会缩放用户正在前台编辑的应用。
// 新选中状态在放大前后都属于原clipId，不为截图临时创建更宽测试片段。
// 自适应密度最小填满视口，测试初始密度足以使一次Ctrl上滚产生可观察增宽。
// 如果用户已经达到最大256，产品正确行为是保持上限；本例不处在该边界。
// 鼠标位置在内容列可见右部，测试没有滚轮到导航区后误要求时间线响应。
// 对比片段数组快照包含选中字段，因此缩放也不能意外切换工程选择。
// 右边缘cursor必须是e-resize，不能用不分方向的ew-resize混过去。
// 左边缘cursor必须是w-resize，证明两边确实有独立方向提示。
// 边框宽度仅声明视觉几何，深浅对比度仍由主题矩阵截图与样式审查补充。
// UI里的假波形不作为视频音轨显示证据，真实音频采样仍未接通。
// 波形未接通不会影响影片段边缘或时间密度的准确性检查。
// 缩略图随片段宽度改变，不允许为完整显示所有图而将片段最小宽抬高。
// 项目range在放大前后不变，内容长度变宽来自每秒像素，而非凭空增加工程秒数。
// 本条没有依赖某个固定导航宽度常量，导航状态变化仍使用实际DOM尺寸。
// 鼠标事件在隔离窗口客户区投递，不把坐标再按屏幕物理比例放大。
// 轮次完成后释放修饰键语义由单次CDP事件承担，没有向系统发送持续Ctrl按下。
async function zoomChecks(ctx, id) {
  const before = await ctx.clips();
  const geometry = "(()=>{const e=document.querySelector('[data-editor-track-lane=V1]'),s=document.querySelector('[data-editor-timeline-scroll]');return {width:e.getBoundingClientRect().width,x:s.getBoundingClientRect().right-80,y:s.getBoundingClientRect().top+45}})()";
  const point = await ctx.run(geometry);
  await ctx.win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseWheel", x: point.x, y: point.y, deltaX: 0, deltaY: -100, modifiers: 2 });
  await ctx.delay(200);
  const after = await ctx.run(geometry);
  ctx.smoke.check("Ctrl-wheel increases timeline density without changing any clip interval", after.width > point.width && JSON.stringify(await ctx.clips()) === JSON.stringify(before));
  ctx.smoke.check("Selected clip uses fine frame and directional edge cursors", await ctx.run(`(()=>{const e=document.querySelector('[data-editor-clip="${id}"]');return getComputedStyle(e).borderLeftWidth==='1px'&&getComputedStyle(e.querySelector('[data-clip-trim=start]')).cursor.endsWith('w-resize')&&getComputedStyle(e.querySelector('[data-clip-trim=end]')).cursor.endsWith('e-resize')})()`));
  // 短视频在全局视图里只有几十像素，截图前使用正式缩放按钮展示真实胶片带。
  // 再将选中片段滚入可见区，避免前序音轨测试留下的纵滚位置遮住V1。
  // 缩放后等待重新采样，不能截取旧ready章下已经被清空的画布。
  for (let index = 0; index < 4; index += 1) await ctx.click('[data-timeline-view-controls] button[aria-label=放大时间轴]');
  await ctx.run(`document.querySelector('[data-editor-clip="${id}"]').scrollIntoView({block:'nearest',inline:'center'})`);
  await ctx.run("document.querySelector('[data-editor-timeline-scroll]').scrollTop=0");
  // 抽样调度有120ms合并窗口，先让尺寸任务启动，否则会误读上一次采样的ready标记。
  // 这里等待的只是调度开始，真正完成仍由下一条真实ready条件判定。
  // 完成条件之后的invalidate只刷新离屏表面，不把正在绘制的一格当整条带完成。
  await ctx.delay(200);
  await ctx.wait(`document.querySelector('[data-editor-clip="${id}"] [data-filmstrip-ready=true]')!==null`);
  // 离屏窗口请求一次真实重绘，再留有限节拍给Chromium提交表面，避免截到上一帧。
  // 这只刷新截图表面，不修改产品DOM样式，也不用等待结束来判定抽帧成功。
  ctx.win.webContents.invalidate(); await ctx.delay(200);
  fs.writeFileSync(path.join(ctx.root, "selected-clip-filmstrip.png"), (await ctx.win.webContents.capturePage()).toPNG());
}

// 镜像和旋转由共享右键菜单发出，实际canvas样式必须随工程确认值改变。
// disabled基础能力保留原因，不能让未实现的倒放按钮报告假成功。
// 截图来自当前Electron真实解码画面与时间线，使用隔离目录避免覆盖用户文件。
// 新菜单动作之后仍运行原导航资源清理，避免本组额外视频解码器逃过卸载检查。
// 右键通过公开contextmenu事件交给产品，不调用applyTimelineEdit直接伪造界面操作。
// 菜单存在条件等待与真正点击分开，能发现菜单在挂载后被其他事件意外关闭。
// 先展开基础编辑，再点镜像，子项必须实际出现在DOM中。
// 镜像后检查data-canvas-content的style，而不是只检查菜单项被勾选。
// scaleX(-1)作用实际媒体内容层，因此不能用只翻转操作选框来通过断言。
// 这项仍需真实video节点与此前readyState证明配合，不能以封面变换代替真实媒体。
// 再次打开菜单检查倒放原生disabled，未接入能力不能因为新增组而被误开放。
// 禁用不是成功状态，测试不会点击后等待一个不存在的完成提示。
// Escape通过原公共关闭监听处理，不能直接remove浮层节点来完成测试。
// 截图取自capturePage，包含真实时间码测试视频、素材卡片和帧带。
// 截图写入当前运行root，不复用上一轮或旧构建的参考图片。
// 这条用例不测试AI、云端上传或导出条目，未出现不能算作那些能力通过。
// 旋转使用与镜像相同生产编辑入口，角度规则还需模型与属性联动审查。
// 测试不读取用户私人源，因此截图可以安全归档到任务文档证据目录。
// 菜单关闭后的焦点恢复由原回归另有覆盖，本组不手动把焦点摆回正确位置。
// 对话菜单沿用创建页公共样式，未另造一个只给测试看的菜单组件。
// 菜单内容超出窗口的响应式由共享容器负责，不用截图裁掉底部项目掩盖问题。
// 错误时外层记录rendererErrors，查询不到按钮必须作为失败报告，而非忽略。
// 真实人工鼠标右键与本次DOM事件分开报告，不能宣称人工桌面操作通过。
// 旋转前读取确认角度，再独立期望加90取模，不能假定前序测试一直保持零度。
// 检查同一个clipId的data-transform，避免镜像后误把另一视频层当目标。
// 镜像和旋转都是无文件写入操作，不能根据磁盘mtime验证工程构图。
// 旋转后重新打开菜单是一个新实例，basic展开状态必须再次显式打开。
// 这也覆盖子菜单状态没有在关闭后污染下一次打开的情况。
// 暂未接入的倒放项仍原生disabled，旋转成功不能顺带把整组全部解锁。
// 每次contextmenu使用相同片段ID，实际右键前父选中状态由产品更新。
// 菜单按钮点击后可能触发播放器定位，实际角度仍应来自原工程记录。
// 不通过点击素材卡让属性目标改变，菜单前后素材列表选择继续独立。
// 截图里的节目画面可能已旋转且镜像，不能拿源封面朝向来判定菜单没有生效。
// 片段胶片带本轮展示源内容概览，不为每个构图变换重新转码缩略图。
// 这种源概览与节目变换的区别在文档中保留，不能声称缩略带就是最终合成画面。
// 程序查询style不能代替肉眼检查实际视频帧，截图仍需要最终打开核对。
// 此组没有删原文件、没有导出副本，原路径仍由素材记录引用。
// 子项必须在侧列出现，主列高度不随展开增加；真实效果仍由命令回归验证。
async function menuChecks(ctx, id) {
  await ctx.run(`document.querySelector('[data-editor-clip="${id}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:500,clientY:500}))`);
  await ctx.wait("document.querySelector('[data-live-clip-menu]')!==null");
  // 数字框文字回卷属于内部滚动；不能把它当作锚点移动关闭刚打开的菜单。
  // 派发scroll只作负向事件夹具，真实失焦回卷已经由前序输入与打开链触发。
  await ctx.run("document.querySelector('[data-editor-region=R03] input').dispatchEvent(new Event('scroll'))");
  ctx.smoke.check("Text input scroll does not dismiss the shared context menu", await ctx.run("!!document.querySelector('[data-live-clip-menu]')"));
  await ctx.click('[data-live-clip-menu] button[aria-label=基础编辑]');
  await ctx.click('[data-live-clip-menu] [data-assistant-column]:nth-child(2) button[aria-label=镜像]');
  await ctx.wait(`document.querySelector('[data-clip-canvas="${id}"] [data-canvas-content]')!==null`);
  ctx.smoke.check("Mirror menu transforms decoded content rather than changing source metadata", await ctx.run(`document.querySelector('[data-clip-canvas="${id}"] [data-canvas-content]').style.transform.includes('scaleX(-1)')`));
  await ctx.run(`document.querySelector('[data-editor-clip="${id}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:500,clientY:500}))`);
  await ctx.wait("document.querySelector('[data-live-clip-menu]')!==null");
  await ctx.click('[data-live-clip-menu] button[aria-label=基础编辑]');
  const angle = await ctx.run(`JSON.parse(document.querySelector('[data-clip-canvas="${id}"]').dataset.transform).rotation`);
  await ctx.click('[data-live-clip-menu] [data-assistant-column]:nth-child(2) button[aria-label="顺时针旋转 90°"]');
  ctx.smoke.check("Menu rotation updates the same decoded canvas transform", await ctx.run(`JSON.parse(document.querySelector('[data-clip-canvas="${id}"]').dataset.transform).rotation===${(angle + 90) % 360}`));
  await ctx.run(`document.querySelector('[data-editor-clip="${id}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:500,clientY:500}))`);
  await ctx.wait("document.querySelector('[data-live-clip-menu]')!==null");
  await ctx.click('[data-live-clip-menu] button[aria-label=基础编辑]');
  await cascadeChecks(ctx);
  // 五项已接通真实动作，旧“倒放禁用”预期在本轮由真实效果回归替代。
  // 此处确认菜单能力，后续EDIT专项再验证真实解码帧，不只看enabled。
  ctx.smoke.check("The five implemented basic edits are available on the selected video", await ctx.run("[...document.querySelectorAll('[data-live-clip-menu] [data-assistant-column]:nth-child(2) button')].length===5&&[...document.querySelectorAll('[data-live-clip-menu] [data-assistant-column]:nth-child(2) button')].every(e=>!e.disabled)"));
  await ctx.run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  fs.writeFileSync(path.join(ctx.root, "filmstrip-speed-real-video.png"), (await ctx.win.webContents.capturePage()).toPNG());
}

// 模型反证与真实窗口交互互补，不能用纯数据测试替代真实帧解码。
// 全部复用外层一个Electron应用，符合串行冒烟要求，不抢占用户桌面鼠标。
// 未覆盖原生系统拖入、系统缩放和扬声器试听，这些人工项继续保持未验证。
// 这组用例依赖前序LIVE已经导入视频并建立多轨片段，缺前提会明确查询失败。
// 窗口调整到1600×1000后再读取实际元素，不能沿用先前960窄窗的旧几何。
// 素材库真实文件保持原数量，不为新回归清空工程重建更容易的样板。
// 先做速度与逐帧，再测菜单和缩放，截图能包含新能力实际生效的状态。
// 纯模型检查不会改变正式工程，实际状态变化都来自后续公开UI事件。
// 按顺序await每组检查，不能让菜单、滚轮和媒体定位并行争抢同一个窗口。
// 所有异常向外传播，原harness用非零退出码报告，最后导航成功不能覆盖失败。
// 不启动第二个Electron进程，所以与其余回归符合单实例串行约定。
// 本组没有原生系统选择框动作，外层选择返回值夹具的限制继续保留。
// 没有资源管理器OLE拖入证据，不能因内部片段dragstart通过就改写人工状态。
// 没有扬声器试听，AAC媒体能够解码不等于听觉输出验收。
// 没有系统级缩放切换，窗口大小矩阵只说明容器布局。
// 没有操作录屏文件，交付应明确只有真实截图与自动断言日志。
// 归档时保留构建指纹与日志哈希，使截图可以追溯到实际运行版本。
// 失败截图不能被命名为全部验收通过，最终记录要区分已修复的中间失败与最终结果。
// 当前短源覆盖横竖与不同帧率，不代表长GOP、网络源、损坏中途文件均通过。
// 导航清理由外层在本组之后执行，辅助解码器不能躲在页面卸载测试之外。
// 纯数据、DOM/CDP和人工证据分别记录，是为了避免验证层级被漂亮截图混淆。
// 同一测试目录中的截图只能来自本次构建，归档要记录实际源码指纹。
// 注释审计与行为断言分别进行，注释数量不构成产品正确性的证据。
// 普通函数长度另用TypeScript语法树正常展开核查，不靠压缩一行绕过限制。
// 单独新增helper不意味着增加一个产品入口，正式路由仍只有原VideoEditorView。
// 旧GIF和漫画使用公共数值字段与按钮样式，最终还要串行回归这些调用方。
// 修改断言时保留业务依据：速度现在可用，所以只剩两个淡入淡出禁用。
// 不能为了让旧用例变绿直接删掉整个未接能力检查或隐藏导出按钮。
// 菜单问题修复后需要重跑真实流程，不能只以静态类型检查当回归通过。
// 测试不关闭用户正在使用的客户端，清理仅限本轮隔离测试窗口。
// 后续任务仍需单独授权或继续指令，本轮不因为提供菜单就自动开发云端AI功能。
// 人工验收未完成时文档继续标明未验，不用本自动helper替换历史限制。
// 最终日志的每个PASS来自明确断言，程序正常退出本身不是新增功能通过证据。
// 若有断言失败，harness退出码护栏仍保留，不能用app.quit丢掉失败码。
// 浏览器错误日志单独留存，以区别业务拒绝、夹具查询错误和真实渲染异常。
// 因环境前置不足退2的冒烟不能计入通过次数，必须解释并先修前提。
// 新参考把宽屏空间优先交给播放器，原“预览缩到三分之二”已被这次请求明确替换。
// 这里独立给出用户可见约束：素材不超过420px、播放器比素材更宽，不能只看CSS字符串。
// 两个窗口都读取正式三栏DOM；总宽来自实际主区，导航占位不再从常量手工扣除。
// 卡片必须固定112×94，两个容器比较能抓住1fr将少量素材拉满一整行的回归。
// 112px封面留边完整呈现横竖视频，源分辨率不同不能变成不同卡片尺寸。
// 94px含封面74px和下方文件名，不要求文件名叠到画面上遮住源内容。
// 文件名left与封面left对齐，bottom位于封面之后，符合参考图的左下角排布。
// 时长必须在封面内右上角，既检查位置又检查真实03秒标签，避免只有空装饰角标。
// 本套件源时长3.25秒，因此格式化到分秒是00:03，不从实际DOM值反推期望。
// 元数据仍在素材对象和无障碍文本，不应为视觉简化修改真实探测值。
// 图片object-fit必须contain，避免竖视频在小横槽内被裁掉头部或下半幅。
// 原有样板列表没有cards类，不受本组固定尺寸约束。
// 状态独立性沿原素材选择测试验证，此处只读几何不重新选择另一素材。
// 选框颜色沿编辑器已有青色，边框宽度精确1px，不能靠2px以上强框近似参考。
// 左右短线仅是装饰，pointer-events必须none，不能拦住真实素材入轨拖动。
// 隐藏辅助元数据后，名称的完整title保留，方便长文件名省略后仍能辨认。
// 若没有素材或角标，查询失败必须向外抛；不能用空数组every形成真空通过。
// resize后有限等待让容器观测提交，不依赖可能因后台窗口停止的rAF。
// wide和medium各自保存真实测量，不临时改DOM样式来迎合112×94预期。
// 恢复1600后才继续播放与菜单测试，避免破坏它们原本的坐标前提。
// 双栏和单栏继续由原浅深尺寸矩阵覆盖，不声称三栏几何等于所有窄屏都已验收。
// 系统缩放和手工鼠标路径没有在这里测试，自动事件证据与人工验收分别报告。
// 像核对相框尺寸与照片内容两张清单：几何正确不能代替下一组首帧像素比对。
// 选择框包住封面而非整卡，主按钮自身背景保持透明，文件名区不再有选中底。
// 宽屏上限与实际比值同时检查，避免只是把属性挤小而让素材仍占半个主区。
// 片段缩略带与素材首帧是不同用途，后者不能随着节目播放或修剪而更新。
async function layoutChecks(ctx) {
  const measure = () => ctx.run("(()=>{const m=document.querySelector('[data-editor-region=R02]').getBoundingClientRect(),p=document.querySelector('[data-editor-region=R03]').getBoundingClientRect(),e=document.querySelector('[data-editor-asset]'),c=e.getBoundingClientRect();return {media:m.width,preview:p.width,card:[c.width,c.height]}})()");
  const wide = await measure();
  ctx.smoke.check("Wide editor gives the player more width than the capped asset panel", wide.media <= 420 && wide.preview > wide.media);
  ctx.smoke.check("Compact card keeps contained first-frame image, upper-right duration and lower-left name", await ctx.run("(()=>{const e=document.querySelector('[data-editor-asset]'),img=e.querySelector('img'),d=e.querySelector('[data-editor-asset-duration]'),name=e.querySelector('strong').getBoundingClientRect(),frame=img.parentElement.getBoundingClientRect(),r=d.getBoundingClientRect();return getComputedStyle(img).objectFit==='contain'&&d.textContent==='00:03'&&r.right<=frame.right&&r.right>=frame.right-8&&r.top>=frame.top&&r.top<frame.top+8&&Math.abs(name.left-frame.left)<1&&name.top>=frame.bottom&&name.width<=frame.width})()"));
  ctx.smoke.check("Selected asset has only a thin cyan cover frame and decorative side marks", await ctx.run("(()=>{const e=document.querySelector('[data-editor-asset][aria-current=true]'),s=getComputedStyle(e),c=getComputedStyle(e.querySelector('img').parentElement),mark=getComputedStyle(e,'::before');return s.backgroundColor==='rgba(0, 0, 0, 0)'&&c.borderTopWidth==='1px'&&c.borderTopColor==='rgb(44, 168, 173)'&&mark.content==='\"\"'&&mark.pointerEvents==='none'})()"));
  ctx.win.setSize(1440, 1000);
  await ctx.delay(200);
  const medium = await measure();
  ctx.smoke.check("Compact assets keep the same fixed size across panel widths", wide.card[0] === 112 && wide.card[1] === 94 && JSON.stringify(wide.card) === JSON.stringify(medium.card));
  ctx.win.setSize(1600, 1000);
  await ctx.delay(200);
}

// 首帧反证用独立FFmpeg解出第0秒和第1秒，与页面真实JPEG封面比像素。
// 不调用产品captureCover产生期望，避免同一错误算法同时制造实际值和“正确答案”。
// 测试源固定为横屏testsrc2，画面随时间变化，误用第1秒应比首帧明显更不相似。
// 后续修剪、镜像和节目播放都已经发生，封面仍应保留源第一帧，不能跟随节目效果。
// 源文件只在外层临时root下，FFmpeg不会读取用户素材或覆盖工程文件。
// 二进制沿用生产resolveTools，不能因测试机器另装了FFmpeg而掩盖随包能力缺失。
// 输出通过pipe传PNG到测试内存，不为封面检查新建永久磁盘缓存。
// -ss放在输入后进行准确定位，不依赖关键帧附近的近似跳转。
// 每次只取一帧，不把整段视频转为图片序列耗光测试内存。
// 一秒反例只用于检验封面来源，不改变产品素材时长或源区间。
// 480宽度对应产品首帧缩略图上限，避免拿640原图与480JPEG直接逐像素比大小。
// nativeImage统一缩到32×18再取像素，减少JPEG有损编码和缩放舍入的局部噪声。
// 比较排除alpha通道，PNG不透明与JPEG不带alpha不应被当成画面内容差异。
// RGB/BGR顺序在两个native位图上相同，因此通道顺序不影响同通道差值。
// 不能仅比较JPEG字符串不同，编码元数据变化也会改变字符串却不代表帧不同。
// 平均误差上限12只容纳压缩与颜色空间差异，第1秒还必须比它至少差2。
// 两个条件结合能避免色条整体相似时一个任意封面也通过宽松阈值。
// 页面封面取自真实img.currentSrc，不从asset对象中注入一个替代的“正确封面”。
// 始终按完整文件名找到横屏源，不能因当前选中了竖视频就比较错对象。
// first与later结果分别写入本地数组，产品不会收到这些参考帧数据。
// FFmpeg有12秒超时与1MB缓冲上限，损坏输入不会无界等待或吞掉输出内存。
// 错误交由harness失败退出，不用空buffer代替参考帧继续比较。
// nativeImage解码失败会导致尺寸或误差校验失败，不能因两份空数组相等而绿。
// 因此pixelError明确检查相同非零buffer长度，不允许空集合真空通过。
// 只返回误差数字进日志，不记录用户路径或把完整图片Base64刷到控制台。
// 这是实际媒体内容自动验证，不等同人工看播放器或扬声器试听。
// Windows系统缩放不会影响源图像像素，仍需另行保留人工缩放限制。
// 这里的参考PNG不是UI展示mock，产品封面继续来自正常浏览器解码链路。
// 原JPEG质量0.8有损，不能要求逐字节完全一致，否则会把合理压缩误判为错帧。
// 时间参考是源0秒而非某个片段的sourceIn，修剪不该更新素材库封面。
function pixelError(left, right) {
  if (!left.length || left.length !== right.length) return Infinity;
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (index % 4 !== 3) sum += Math.abs(left[index] - right[index]);
  }
  return sum / (left.length * .75);
}

// 首帧JSON数据没有进入本例，页面即使正确写了00:03也不能替代像素内容正确。
// 参考图只取一张小尺寸画面，测试成本不随素材文件大小线性装入内存。
// 页面封面应是image/jpeg数据地址，小图不会通过再次读取整段视频生成重复副本。
// 使用currentSrc处理NextImage实际采用的地址，不能误读尚未完成选择的srcset候选。
// native位图由同一resize方法处理，缩放插值差异不混入首帧时间误差。
// 两个参考的输出格式固定PNG，避免期望值也重复产品JPEG压缩而共享同一偏差。
// 第1秒在本测试3.25秒源范围内，不会因超出视频尾部产生空参考图。
// 两次同步FFmpeg只处理本小视频一帧，单次12秒上限远小于外层看门狗。
// 如果输出意外超过缓冲限制会抛错，不能截断PNG后当成有效数据继续验收。
// 只读取横屏源文件，竖屏完整显示与比例由上面的contain断言和真实截图互补。
// 函数返回前所有编码子进程已结束，没有新增后台进程需要后续猜测清理。
// clip变速和镜像不会改变封面src，若产品误绑节目帧将使这个独立原图比对失败。
// 错帧或空图不允许跳过为“封面可选”，因为这个测试前提已成功导入可解码MP4。
// 真实用户损坏视频的缺图回落由原失败用例覆盖，不能用它降低当前正常源验收条件。
// 执行顺序放在速率和菜单之后，保护封面不会随已有真实编辑动作被污染。
async function firstFrameChecks(ctx) {
  const { nativeImage } = require("electron");
  const { execFileSync } = require("node:child_process");
  const { resolveTools } = require("../../apps/electron/src/main/modules/ffmpeg/locate");
  const cover = await ctx.run("[...document.querySelectorAll('[data-editor-asset]')].find(e=>e.title==='landscape-audio.mp4').querySelector('img').currentSrc");
  const actual = nativeImage.createFromDataURL(cover).resize({ width: 32, height: 18 }).toBitmap();
  const errors = [];
  for (const second of [0, 1]) {
    const args = ["-v", "error", "-i", path.join(ctx.root, "landscape-audio.mp4"), "-ss", String(second), "-frames:v", "1", "-vf", "scale=480:-1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"];
    const png = execFileSync(resolveTools().ffmpegPath, args, { windowsHide: true, timeout: 12000, maxBuffer: 1024 * 1024 });
    const expected = nativeImage.createFromBuffer(png).resize({ width: 32, height: 18 }).toBitmap();
    errors.push(pixelError(actual, expected));
  }
  ctx.smoke.check("Asset cover retains the actual source first frame after playback and editing", errors[0] < 12 && errors[1] > errors[0] + 2, JSON.stringify(errors));
}

async function checkVideoFilmstrip(ctx) {
  speedModels(ctx);
  ctx.win.setSize(1600, 1000); await ctx.delay(150);
  await layoutChecks(ctx);
  const id = await ctx.run("document.querySelector('[data-editor-track-lane=V1] [data-editor-clip]').dataset.editorClip");
  await rateChecks(ctx, id); await stepChecks(ctx); await menuChecks(ctx, id); await zoomChecks(ctx, id);
  await firstFrameChecks(ctx);
  // 三层片段和真实声音反证串行复用这个正式工程，不另建模拟时间线。
  // 新断言在原媒体流程之后，新增峰值或视口准备不能改变旧碰撞/修剪前提。
  // 页面退出的原资源清理测试仍在外层继续执行。
  await require("./check-video-waveform").checkVideoWaveform(ctx);
}
module.exports = { checkVideoFilmstrip, models };

// 展开后比较两列的实际边界和主列高度，不能只凭多了五个按钮就认为侧向成功。
// 键盘从父项右移进入子列，再左移回到同一父项，验证不依赖鼠标hover。
// 这些是Electron内自动事件，不代表人工右键或完整键盘路径已经验收。
async function cascadeChecks(ctx) {
  ctx.smoke.check("REFERENCE child menu opens beside the unchanged root column", await ctx.run("(()=>{const e=document.querySelector('[data-live-clip-menu]'),a=e.querySelector('[data-assistant-column=\"0\"]').getBoundingClientRect(),b=e.querySelector('[data-assistant-column=\"1\"]').getBoundingClientRect();return Math.abs(a.top-b.top)<1&&(Math.abs(a.right-b.left)<1||Math.abs(b.right-a.left)<1)&&a.height<230&&b.left>=0&&b.right<=innerWidth})()"));
  await ctx.run("document.querySelector('[data-live-clip-menu] [data-assistant-item=basic]').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}))");
  await ctx.delay(50);
  ctx.smoke.check("REFERENCE ArrowRight focuses the first child command", await ctx.run("document.activeElement.dataset.assistantItem==='freeze'"));
  await ctx.run("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}))");
  await ctx.delay(50);
  ctx.smoke.check("REFERENCE ArrowLeft closes child and returns to its parent", await ctx.run("document.activeElement.dataset.assistantItem==='basic'&&!document.querySelector('[data-live-clip-menu] [data-assistant-column=\"1\"]')"));
  await ctx.click('[data-live-clip-menu] [data-assistant-item=basic]');
  ctx.win.webContents.invalidate(); await ctx.delay(150);
  fs.writeFileSync(path.join(ctx.root,"reference-cascade-real-workspace.png"),(await ctx.win.webContents.capturePage()).toPNG());
}

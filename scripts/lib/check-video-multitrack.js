/** 多轨与修剪回归复用同一个真实Electron工程；自动事件不等于人工桌面操作。 */
const fs = require("node:fs"), path = require("node:path");
// 所有UI用例沿用外层LIVE生成的横屏/竖屏真实文件与生产FFprobe结果。
// 不新开Electron进程，避免单实例锁或两个媒体测试争抢窗口资源。
// 按钮文件选择器在原LIVE脚本中有夹具，这里不把它称作人工系统多选证明。
// 原生CDP鼠标与后续DOM拖放分开报告，不能统称资源管理器真实拖入。
// 本helper不读React内部状态或私有闭包，确认值只从公开DOM与媒体事件观察。
// input定位限定属性区R04，避免误操作轨道设置里同名的输入字段。
// 固定中文标签是当前测试语言前提，不是产品存储字段名。
// 缺少字段应让求值失败，不静默跳过并把不存在的能力算通过。
const input = label => `[...document.querySelectorAll('[data-editor-region=R04] label')].find(e=>e.textContent.includes(${JSON.stringify(label)})).querySelector('input')`;

// 只使用公开输入事件，属性真正提交后再从工程DOM读取结果。
// 先调用原生value setter再派发input，React才能保存一次真实字符串草稿。
// 随后等待一个事件间隔再发Enter，避免两个事件被旧闭包解释成提交上一次文本。
// value允许字符串，非法文本必须走原字段校验，测试助手不预先矫正。
// 提交后短等待只让React更新，不把等待结束当作业务成功。
// 真正成功由后续data-transform、clip时间或aria-invalid反证。
// 字段使用focus，原blur规则仍会执行，不能靠跳过焦点掩盖迟到提交问题。
// 不直接调用onCommit，能发现公共字段没有把事件接到实际工程的情况。
// 同一个助手用于缩放、位置与透明度，避免每个属性有一套特殊测试写入路径。
// Enter通过原input冒泡，不能向document发键盘后假设目标是当前字段。
// 参数使用JSON.stringify插入固定测试表达式，字符串中的引号不应破坏求值语法。
async function field(ctx, label, value) {
  await ctx.run(`(()=>{const e=${input(label)};e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(${JSON.stringify(value)}));e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ctx.delay(70);
  await ctx.run(`(${input(label)}).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);
  await ctx.delay(80);
}
// 浏览器真实指针捕获负责分派，测试不访问React闭包。
// 使用浏览器客户区坐标，与getBoundingClientRect处在同一坐标系。
// mousePressed声明左键按下，mouseReleased清buttons，后续测试不继承旧按键状态。
// 移动过程由真实命中测试决定接收节点，所以数值框丢捕获会真实暴露。
// 这正是本轮发现首帧直接移出输入框无法拖值的反例。
// 若只dispatchEvent给指定input，错误实现也可能通过，因此这里保留CDP投递。
// 间隔只为观察候选，不用于制造视频播放进度，媒体测试仍等待实际currentTime。
// pointerId由Chromium生成，测试不伪造产品hasPointerCapture或release结果。
// 按下/移动/松手由用例显式配对，取消后仍需发松手恢复测试驱动状态。
// 这是自动鼠标事件证据，不代表用户在Windows桌面实际完成了同样操作。
// 没有占用系统鼠标，用户前台程序不被测试拖动抢走。
async function mouse(ctx, type, point) {
  await ctx.win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type, ...point, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  await ctx.delay(80);
}
// 真实元素先滚到可见位置再取矩形，不能给屏幕外手柄强行派发成功事件。
// scrollIntoView只改变视口，不修改片段时间，因此后续区间预期保持原值。
// 用中心点能命中十二像素边缘热区，不靠一像素边线偶然命中。
// 每次手势重新测量，窗口尺寸与横向缩放变化不能沿用旧坐标。
// 返回CSS像素，不乘DPR或系统缩放系数，浏览器负责输入投影。
// 目标不存在会直接失败，不能返回零坐标再把点击其他位置当成功。
async function point(ctx, selector) {
  return ctx.run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest',inline:'nearest'});const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
}
// 截图来自当前Electron窗口capturePage，不能用参考图或HTML重绘替代。
// 文件名只标识场景，画面是否有效仍需readyState与数值断言共同确认。
// 产物写入隔离测试临时目录，不占用用户图片和视频输出文件名。
// 截图保留操作界面与真实解码帧，后续人工可核对层级和细描边外观。
// 不把截图存在当作所有交互已验，尤其不能代替系统拖入与扬声器试听。
// 写盘失败向外抛出，由原harness记录失败，不吞异常继续假装有证据。
async function shot(ctx, name) {
  fs.writeFileSync(path.join(ctx.root, `${name}.png`), (await ctx.win.webContents.capturePage()).toPNG());
}

// 固定六秒源的纯规则反证和真实短视频测试互补，边界预期不由被测函数推导。
// 纯规则读取当前生产TS转译，不复制一份算法再自己验证自己。
// 只有纯模型被加载，不建立React组件或假播放器。
// 固定六秒反证与外层旧LIVE碰撞用例互补，不能缩短片段迁就错误结果。
// 本组构造start4/end8/sourceIn2/sourceDuration10，明确工程与源时钟不同。
// 左侧请求负二十应停在工程2、源0，证明不能向源文件前凭空延长。
// 右侧请求五十应停在邻居9，不能穿过同轨下一个片段。
// 原输入对象和数组均冻结，若模型原地修改start或sourceIn会暴露。
// JSON快照还检查返回后输入未变，不能只冻结外壳却让嵌套字段被改。
// 源入点与右边界同时断言，单看长度不足以发现读错源内容。
// 最小一帧反例分别检查左右边缘，防止只保护一种方向。
// 项目fps用三十，预期直接写1/30，不从被测函数返回值推导期望。
// 锁定反例用合法时间请求，排除因其他参数非法而偶然拒绝。
// 默认五条上限直接使用DEFAULT_TRACK_LIMITS，实机设置用例另行核对界面默认。
// V1到V5已满时nextTrack必须null，不能把音轨占用当成视频名额。
// 提高video到六时现有V1可申请V2，说明上限不是硬编码在五。
// 候选显示顺序明确为V1,V2,A1,A2，不允许临时视频行跑到音轨组下面。
// 层序反例刻意把lower先放clips数组，独立期望仍是upper在前。
// 如果实现误按片段创建顺序绘制，反向数组会使本断言失败。
// 时间点选五秒，两个层都确实覆盖，不能因其中一层未命中而偶然顺序正确。
// 纯模型不解码视频，后面的真实双video断言承担画面与播放证明。
// 转译结果仅来自仓库固定文件，不执行用户文件名或远程字符串。
// 模型依赖当前只有type-only，意外引入运行时依赖会明确报错，提醒维护加载边界。
// 修剪的source边界不能只测sourceIn零，因为那会漏掉已用部分素材还能向左找回的规则。
// 这里sourceIn二秒与start四秒不同，负请求的正确工程下限是二秒而非零。
// 如果实现直接把左边缘夹到零，本测试会发现sourceIn变成负数或画面错位。
// 右邻居九秒而源还能延长更多，能够独立确认邻居限制优先于剩余源。
// 若模型只限制源长度却忽略同轨障碍，右边缘会超过九秒而失败。
// 一帧最短用start4/end8，强行向右拉左边缘到三十秒只允许停在八秒前一帧。
// 反向强拉右边缘到负三秒只允许停在四秒后一帧，覆盖另一侧夹限。
// 锁表只放V1，目标确实在V1；若实现错误检查A轨，本例会得到非null而失败。
// 输入数组中other也冻结，模型不能为延长当前片段推开邻居制造空间。
// 本组没有把期望写成“结果没有重叠”这种宽泛条件，具体入点与端点都固定。
// 轨道上限反例中额外有A1，证明音轨计数不能把五条视频上限变成六条总轨上限。
// 提高视频上限时A1仍存在，生成编号应为V2而非由数组总长度算V3。
// 显示数组顺序的固定预期能抓住分组错误，光检查包含V2无法区分它在A2下面。
// 图层测试故意两个片段start/end完全相同，避免部分覆盖使优先级反证失效。
// clips顺序lower/upper与tracks顺序V1/V2相反，来源顺序与层级被明确解耦。
// 若依赖最近导入或数组末项，预期upper/lower的精确顺序就不能通过。
// 测试没有构造一个“选中置顶”的正确答案，生产函数本来就不接selectedId。
// 返回层数组用map提取稳定id，长文件名或重名不会影响这项层序判断。
// modelChecks不提供虚构VideoProbeResult，所有媒体元数据证明留给真实导入链。
// Object.freeze保护的是输入不被写，返回的新记录仍允许父工程作为下一次确认状态。
// 当前clip对象没有transform，是因为本组时间规则无需构图；构图独立性由实机复制专项覆盖。
// 测试用id one/other只是纯数据身份，不能拿它们替换正式UUID来简化页面用例。
// 整数工程帧是碰撞依据，浮点容差只在观察CDP像素投影时出现。
// 这里没有容差地比较具体端点，能发现模型用近似秒数绕开一帧碰撞。
// ceil源末帧的历史契约仍由旧98帧用例覆盖，不在新测试中改成97帧迁就结果。
// 轨道显示函数输入固定原数组，输出新数组包含候选，正式数组不应被push。
// 如果未来增加轨道删除，nextTrack按最大编号分配而非条数加一的规则也应继续回归。
// 视觉层不接受audioOnly的业务边界由真实音轨不画视频以及原audio预览分支共同覆盖。
// 本模型加载器没有require参数，新增运行时依赖会直接报错，不悄悄填假对象。
// 测试依赖白名单若要扩展，应审查生产依赖，而不是改成允许任意文件路径。
function modelChecks(ctx) {
  const ts = require("../../apps/next/node_modules/typescript");
  const source = fs.readFileSync(path.join(__dirname, "../../apps/next/src/view/toolBox/Tool/video/editor/timeline-track-model.ts"), "utf8"), model = {};
  new Function("exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(model);
  const clip = Object.freeze({ id: "one", assetId: "source", track: "V1", start: 4, end: 8, sourceIn: 2, sourceDuration: 10 });
  const obstacle = Object.freeze({ ...clip, id: "other", start: 9, end: 10 });
  const clips = Object.freeze([clip, obstacle]), before = JSON.stringify(clips);
  const left = model.trimClip(clips, "one", "start", -20, 30, [])[0];
  const right = model.trimClip(clips, "one", "end", 50, 30, [])[0];
  ctx.smoke.check("Trim source/neighbor boundaries preserve source clock and input immutability", left.start === 2 && left.sourceIn === 0 && left.end === 8 && right.end === 9 && JSON.stringify(clips) === before);
  ctx.smoke.check("Trim keeps one project frame and respects lock/cancel contract", model.trimClip(clips, "one", "start", 30, 30, [])[0].start === 8 - 1 / 30 && model.trimClip(clips, "one", "end", -3, 30, [])[0].end === 4 + 1 / 30 && model.trimClip(clips, "one", "end", 6, 30, ["V1"]) === null);
  checkFractionalTrim(ctx, model.trimClip);
  ctx.smoke.check("Track limits default to five each, candidate is grouped without mutating confirmed tracks", model.nextTrack(["V1","V2","V3","V4","V5","A1"], "V", model.DEFAULT_TRACK_LIMITS) === null && model.nextTrack(["V1","A1"], "V", {video:6,audio:5}) === "V2" && model.displayTracks(["V1","A1","A2"], "V").join() === "V1,V2,A1,A2");
  const layers = [{ ...clip, id: "lower", track: "V2" }, { ...clip, id: "upper", track: "V1" }];
  ctx.smoke.check("Composition priority follows track order, never clip insertion order", model.visualClipsAtTime(layers, ["V1","V2","A1"], 5).map(item => item.id).join() === "upper,lower");
}

// 这组源只有3.25秒，1.37倍速在30fps工程中需要72帧占位，工程从第4秒开始。
// 正确尾部6.4秒由手算4加72除30得到，不调用产品算法制造期望。
// 先缩到5秒再请求50秒，必须停在6.4；旧算法向下取整会卡在6.3667。
// 请求50秒故意远超源尾，反证右边不能无限延长，也不能通过减速增加素材。
// 左边向右0.1秒，应在源内前进0.137秒，结束画面和右边位置都保持不变。
// 对这条新入点再做零位移，源仍须为0.137，不能被项目帧取整到0.1333。
// 左边向左恢复到4秒后，sourceIn回零；继续向左只能停在4秒，不能读负源时间。
// 首次左修剪之后的片段仍引用相同assetId，未把“裁掉部分”复制成新素材。
// 同一源的另一实例不在此数组里，旧多实例用例继续负责跨实例隔离。
// 冻结源对象并比较快照，确保恢复尾部没有偷偷增加sourceDuration来迁就预期。
// 结束画面按sourceIn加工程长度乘速度比较，容差只吸收浮点计算尾差。
// 容差仅1e-12秒，用于二进制尾差，不允许用一整帧容差掩盖入点漂移。
// 输入来自纯模型夹具，不是人工拖动；后续Electron用例继续走真实片段手柄。
// 这像同一胶卷反复收放遮挡纸板：恢复的是原内容，胶卷长度和播放速度不变。
// 末格占位可以覆盖源最后的不足一工程帧，不能据此宣称生成了额外视频帧。
// 没有源视频DOM参与这组算术，所以它不能替代真实首帧、播放或解码证明。
// 共享trim函数由调用方传入已加载的生产实现，不复制鼠标或键盘的边界算法。
// 源起点恢复与右侧上限分别断言，避免只比较片段长度而漏掉整体源区间偏移。
// 回退请求是负数，用来证明源零点比工程零点更早生效，而非把时间线一律夹零。
// 理论源终点落在工程6.3723秒附近，6.4是容纳尾部不足一帧的最小工程格。
// 若结束在6.3667秒，就漏掉了真实尾部；若超过6.4，又多占一个完整空格。
// 缩短到5秒时只使用1.37秒源内容，未使用的1.88秒仍必须能够恢复。
// 零位移检查独立执行，故失败只能来自入点换算，不能归因于鼠标分辨率。
// 0.137秒不是30fps整数帧，专门区别源秒数与工程帧编号，整数样例测不到此错误。
// restored直接使用第一次left结果，独立于stationary分支，避免前个错误污染恢复验证。
// 夹具没有源fps字段，修剪的步长由30fps工程决定，不应依赖媒体探测帧率。
// 参数id必须保持fractional，同源库引用不能被当成被编辑片段的身份。
// 延长后还检查原对象快照，源总长或原速度被原地改掉也必须令测试失败。
function checkFractionalTrim(ctx, trim) {
  const original = Object.freeze({ id: "fractional", assetId: "source", track: "V1", start: 4, end: 6.4, sourceIn: 0, sourceDuration: 3.25, speed: 1.37 });
  const snapshot = JSON.stringify(original), short = trim([original], original.id, "end", 5, 30, []);
  const extended = trim(short, original.id, "end", 50, 30, [])[0];
  ctx.smoke.check("Right trim restores the final source slot at fractional speed and stops at its maximum", extended.end === 6.4 && extended.speed === 1.37 && JSON.stringify(original) === snapshot);
  const left = trim([original], original.id, "start", 4.1, 30, []);
  const stationary = trim(left, original.id, "start", 4.1, 30, [])[0];
  ctx.smoke.check("Left trim advances inside the original source without rounding a stationary in-point", Math.abs(left[0].sourceIn - .137) < 1e-12 && Math.abs(stationary.sourceIn - .137) < 1e-12 && stationary.end === 6.4);
  const restored = trim(left, original.id, "start", -50, 30, [])[0];
  ctx.smoke.check("Left extension recovers source zero without changing the fixed right boundary", restored.start === 4 && Math.abs(restored.sourceIn) < 1e-12 && restored.end === 6.4);
}

// 拖值松手提交，Escape只撤销候选；双圈焦点会由计算样式反证。
// 前置先选真实视频片段，属性值必须来自工程而不是静态样板。
// 将X确认到960后再开始鼠标上移二十像素，预期962独立于返回值。
// 属性precision为两位，默认步长0.1，所以不能误按整数每像素一步。
// 起点故意选输入框内部而终点在框外，覆盖用户实际拖出边界的操作。
// 若延迟到move才捕获，第一帧跨出input就丢事件，本用例会保持960而失败。
// 松手后同时读input和canvas，防止只改输入显示而未提交真实构图。
// data-transform必须x962，其他构图由后续回归继续检查独立性。
// 第二次向下三十像素先形成候选，再发Escape，确认值应仍为962。
// Escape后仍发mouseReleased，避免驱动持续按下影响接下来的时间线修剪。
// 取消不能发送一个反向写入“恢复值”，原工程不曾在候选阶段改变。
// 焦点检查读取实际computedStyle，不能只在源码搜索outline:1px宣称薄边框。
// 内部input必须没有outline，父框borderTopWidth必须一像素，排除双圈叠加。
// 焦点线颜色交由主题语义变量，此处不硬编码一套浅色RGB造成深色误判。
// 最后将X恢复960，后续合成画面预期不受本用例残留位移影响。
// 字段恢复仍走真实Enter提交，不直接改data-transform或CSS位置。
// 该用例不宣称覆盖触控笔压力或多指手势，只验证左键纵向拖数。
// 非法文字输入已有原画布专项覆盖，本组保留它的回归调用不另造一套表单测试。
// 鼠标上移二十像素的期望是精确增加二，不采用“只要变大就算通过”。
// 若每次mousemove都在旧候选上累加，事件数量变化会导致结果不等于962。
// 输入与canvas同步还覆盖父层是否把真正新值传回来，局部input候选无法单独通过。
// 第二次向下拖先形成不同候选，Escape恢复962比完全不动再取消更有判别力。
// 如果产品在每次move提前提交，Escape后canvas会残留959，断言会失败。
// 正常松手和取消都要释放捕获，否则紧接的修剪可能仍被旧输入接收。
// focus检查使用parentElement是因为真实DOM约定单位与输入共用fieldInput外框。
// 不读取CSS类的哈希名称，生产构建换hash不会误使测试失败或命中别的元素。
// OutlineStyle必须none，光检查宽度一像素仍可能是内外两个圈一起存在。
// 边框必须一像素，去掉所有焦点边界的错误实现不能借“没有粗圈”通过。
// 默认主题来自先前原LIVE深色矩阵，浅色同组件已由原画布专项覆盖。
// 本组不变更主题来挽救命中失败，真实geometry由当前窗口重新读取。
// 字段原有单击文字编辑仍由后续field助手使用，拖数不应吞掉Enter路径。
// 重置X通过相同字段提交后，不能只把DOM输入改回960而保留工程962。
// 最终组成图的居中与下层露出可进一步发现恢复失败，不靠一个孤立字段断言。
async function numberChecks(ctx, id) {
  await ctx.click(`[data-editor-clip="${id}"]`); await field(ctx, "位置 X", "960");
  const start = await ctx.run(`(()=>{const b=(${input("位置 X")}).getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  await mouse(ctx, "mouseMoved", start); await mouse(ctx, "mousePressed", start);
  await mouse(ctx, "mouseMoved", { x:start.x, y:start.y-20 }); await mouse(ctx, "mouseReleased", {x:start.x,y:start.y-20});
  ctx.smoke.check("Inspector hold-and-scrub up increases confirmed project X", await ctx.run(`Number((${input("位置 X")}).value)===962&&JSON.parse(document.querySelector('[data-clip-canvas]').dataset.transform).x===962`));
  await mouse(ctx, "mousePressed", start); await mouse(ctx, "mouseMoved", {x:start.x,y:start.y+30});
  await ctx.run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
  await mouse(ctx, "mouseReleased", {x:start.x,y:start.y+30});
  ctx.smoke.check("Escape cancels number scrub and keeps the confirmed value", await ctx.run(`Number((${input("位置 X")}).value)===962`));
  ctx.smoke.check("Inspector input uses a single thin surrounding focus line", await ctx.run(`(()=>{const e=${input("位置 X")};e.focus();return getComputedStyle(e).outlineStyle==='none'&&getComputedStyle(e.parentElement).outlineStyle==='none'&&getComputedStyle(e.parentElement).borderTopWidth==='1px'})()`));
  await field(ctx, "位置 X", "960");
}

// 真正拖动左右边缘，不通过直接更新数据伪造修剪结果。
// 记录原start/end作为独立预期，不能读取草稿再用同一个值当正确答案。
// 真实左边缘手柄来自复用片段壳，不能用一个测试专用div调用修剪方法。
// 每秒像素取lane真实宽度除标尺range，与导航宽度和轨道头宽度无关。
// 目标横移对应半秒，误差只容纳一项目帧与输入像素舍入，不允许任意大范围。
// 同时要求end完全不变，左修剪不能被实现成整段平移。
// 首帧原sourceIn为零，向右裁半秒后播放器必须真正读到源半秒附近。
// 点击同一片段后等待真实readyState与seeking结束，再检查currentTime。
// 不能只看封面换了或节目时间码变了就声称源入点映射正确。
// 截图保留视频画面中的时间码，肉眼可辅助核对确实不是源零秒帧。
// 修剪后保存整份clips快照，取消不能只保持目标片段数量却挪动其他记录。
// 第二次移动形成候选后Escape，最终完整快照必须与确认后相同。
// mouseReleased仍在取消后发出，旧捕获不能趁最终松手提交已取消边缘。
// 修剪使用真实pointer事件，外层旧HTML拖放用例仍验证主体拖动没有被手柄劫持。
// 本用例在正式工程中执行，独立DEMO_CLIPS没有被替换或用来伪造素材。
// 当前源文件很短，延长边界的纯模型反证另外覆盖邻居和剩余源内容。
// 未测试任意可变帧率媒体的帧精度，工程帧率与解码源帧率分开报告。
// 右侧边缘与键盘使用同一个纯模型，不能把左侧通过外推所有人机设备都已验证。
// 取消测试比较selected标记也保持，避免一边取消修剪一边偷换属性目标。
// 入点实际播放证明来自HTMLMediaElement，FFprobe元数据成功不能替代浏览器解码。
// 没有生成裁切后的磁盘文件，这里验证的是非破坏工程区间编辑。
// 修剪的目标距离来自range与lane宽，不能拿clip宽除源时长，因为当前显示长度可能已变。
// 如果目标稍微落到旁边片段，pointer捕获仍应交回原手柄，不能修剪到邻居。
// 保存snapshot在第二次gesture之前，后续比较的不是临时draft对象。
// 取消断言用完整数组JSON，不再将目标对象单独替回去掩盖其他片段被修改。
// source定位等待seeking为false，读到刚设置currentTime却未解码的中间状态不算完成。
// readyState至少二同时要求真实帧可用，不能只有metadata成功就认为预览已出现。
// 源时间下限0.45容纳真实输入投影与帧差，不允许修剪后仍停在源零点。
// 源文件同时保留原全长，后面跨层播放会继续引用同一路径验证未破坏文件。
// 没有调用FFmpeg裁切新视频，若磁盘出现新文件也不能用它替代工程sourceIn验证。
// 左边缘把手通过data-clip-trim定位，标签翻译不会使工具默认错误抓到右边缘。
// 实际滑块键盘语义在模型与原键盘路径中分层验证，当前指针用例不冒充人工按键。
// 半秒请求与项目帧率三十对应十五帧，因此预期不因竖屏源二十四fps而变化。
// 若按源fps舍入错误，这份源时钟与工程时间对照能在更多边界测试中暴露。
// 截图含真实源叠印时间码，不用测试自行绘制一个文字标签来冒充视频时间。
async function trimChecks(ctx, id) {
  const original = (await ctx.clips()).find(item => item.id === id);
  const selector = `[data-editor-clip="${id}"] [data-clip-trim="start"]`;
  const origin = await point(ctx, selector);
  const laneWidth = await ctx.run("document.querySelector('[data-editor-track-lane=V1]').getBoundingClientRect().width"), range = await ctx.run("Number(document.querySelector('[data-editor-track-lane=V1]').parentElement.style.getPropertyValue('--timeline-range'))");
  await mouse(ctx, "mouseMoved", origin); await mouse(ctx, "mousePressed", origin);
  const end = {x:origin.x+laneWidth/range*.5,y:origin.y}; await mouse(ctx, "mouseMoved", end); await mouse(ctx, "mouseReleased", end);
  const trimmed = (await ctx.clips()).find(item => item.id === id);
  ctx.smoke.check("Real edge drag changes in-point by half a second and preserves out-point", Math.abs(trimmed.start-original.start-.5)<1/30+.001 && trimmed.end===original.end);
  await ctx.click(`[data-editor-clip="${id}"]`); await ctx.wait("document.querySelector('[data-live-video]')?.readyState>=2&&!document.querySelector('[data-live-video]').seeking");
  ctx.smoke.check("Trimmed source preview seeks to the actual source in-point", await ctx.run("document.querySelector('[data-live-video]').currentTime>=.45"));
  await shot(ctx, "multitrack-trimmed-real-video");
  const snapshot = JSON.stringify(await ctx.clips());
  const next = await point(ctx, selector);
  await mouse(ctx, "mousePressed", next); await mouse(ctx, "mouseMoved", {x:next.x+20,y:next.y});
  await ctx.run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
  await mouse(ctx, "mouseReleased", {x:next.x+20,y:next.y});
  ctx.smoke.check("Escape edge cancellation preserves the full confirmed arrangement", JSON.stringify(await ctx.clips()) === snapshot);
}

// 同类向下投放创建真实轨道；缩小上层后，下层必须仍有解码帧而非封面。
// 源片段先前已经左修剪，跨层移动必须保留较短长度和非零sourceIn。
// 向V2的目标给片段中点偏移，测试不允许自动把左边缘吸到鼠标。
// 新V2应在开始拖动后才出现，放下之前它只是候选，不是已提交工程轨。
// 放下后实际片段.closest(lane)必须是V2，不能只画个成功轮廓。
// 长度比较用end-start，平移到零时end改变是正确结果，不能误要求绝对end不变。
// 移到零附近是为后续上层安排留出共同覆盖区间，不缩短任何片段来制造重叠。
// 随后从真实素材行创建新的V1实例，前后id差集定位新对象。
// 不能取数组末项，因为DOM按轨道分组，最后一个节点可能仍是音轨。
// 新上层缩放50，完整下层应从四周伸出来，覆盖用户给的层级场景。
// 两个节点都必须是video且readyState至少二，不能用封面或占位冒充双层画面。
// videoWidth核对实际640宽源，错误图片占位即使看起来相似也不能通过。
// DOM顺序必须lower再upper，确认与轨道物理顺序一致。
// 主要层来源虽然也是同一视频文件，但id不同，不能因此合并成一个变换对象。
// 先保留完整不透明截图，再调50%不透明度保存第二张实际合成截图。
// 恢复100%后继续选择优先级测试，避免透明度残留让覆盖关系肉眼不明确。
// 截图和真实video数量共同证明合成接通，不只检查某个名叫composite的变量。
// 后续播放单独检查工程时钟，静态重叠图不能证明两层实际同步播放。
// 设置和音轨用例在视觉层形成后执行，能发现增加轨道造成的纵向滚动边界。
// 结束重新选择上层供导航清理测试使用，保证退出前确实有活跃源可释放。
// 素材行选择仍归原面板，本组没有通过点片段反向修改素材列表高亮。
// 本组没有混合两条音轨，不能把静音双video播放写成音频混音验收。
// 当前样本不包含HDR或硬件解码压力测试，五轨默认名额不等于性能基准承诺。
// 同类轨道转移必须在真实目标lane上落下，不能只改clip.track字符串后截一张图。
// 创建V2后的源片段id保持，复制语义与移动语义由身份对照分开。
// length不变同时保持sourceIn，实际播放时下层应从修剪后的源时间开始。
// 新上层仍从完整素材零秒开始，两个同源层故意具有不同入点。
// 这使同步比较必须用工程时间，不能简单要求两个currentTime完全相等。
// 若实际代码忘了sourceIn，两层相同文件会刚好同步却显示错误源区间。
// 上层缩放50后下层全尺寸，截图能直接看到外圈仍是下层画面而非黑底。
// 下层内容节点不能有独立不透明背景，否则低层明明存在也会被上层相框擦掉。
// 层序DOM断言结合实际截图，前者确认确定顺序，后者检查真正透明区域效果。
// 主视频和composite视频都要求videoWidth640，不允许把一个层换成canvas占位。
// 不以单个父div名叫layers认定接通，必须存在两个可解码媒体元素。
// 不透明度50截图后恢复100，后面的播放条件检查仍具有明确的视觉前提。
// 当前默认上层100%仍能看到下层四周，说明大小裁切与透明合成没有互相覆盖。
// 选择下层时当前节目时间可能定位到下层起点，但层级绝不能跟着选择变化。
// 原素材列表选中与片段选择不同，操作下层不应把素材过滤状态偷偷重置。
// 新增视频行使时间线纵向高度增加，设置与音频测试因此覆盖真实多轨滚动需求。
// 如果候选行出现导致横尺变窄，外层四秒/八秒98帧与22帧间隙反证会失败。
// 这些旧反证仍在新helper之前执行，不能靠把新功能放最后跳过原坐标回归。
async function trackChecks(ctx, id) {
  const old = (await ctx.clips()).find(item => item.id === id);
  await ctx.beginDrag(`[data-editor-clip="${id}"]`);
  await ctx.wait("document.querySelector('[data-editor-track-lane=V2]')");
  const target = await ctx.lanePoint((old.end-old.start)/2, "V2");
  await ctx.dragTo(target);
  ctx.smoke.check("Dragging down creates V2 and preserves source duration", await ctx.run(`document.querySelector('[data-editor-clip="${id}"]').closest('[data-editor-track-lane]').dataset.editorTrackLane==='V2'`) && Math.abs(((await ctx.clips()).find(item=>item.id===id).end-(await ctx.clips()).find(item=>item.id===id).start)-(old.end-old.start))<1e-6);
  await ctx.run("document.querySelector('[data-editor-timeline-scroll]').scrollTop=0");
  const before = await ctx.clips();
  await ctx.beginDrag('[data-editor-asset]'); await ctx.dragTo(await ctx.lanePoint(0, "V1"));
  const top = (await ctx.clips()).find(item=>!before.some(previous=>previous.id===item.id));
  await ctx.click(`[data-editor-clip="${top.id}"]`); await field(ctx,"缩放","50");
  await ctx.wait("document.querySelectorAll('[data-clip-canvas] video').length===2&&[...document.querySelectorAll('[data-clip-canvas] video')].every(e=>e.readyState>=2)");
  const order = await ctx.run("[...document.querySelectorAll('[data-clip-canvas]')].map(e=>e.dataset.clipCanvas)");
  ctx.smoke.check("Upper V1 and lower V2 render two real decoded sources in fixed layer order", order.join() === `${id},${top.id}` && await ctx.run("document.querySelector('[data-live-video]').videoWidth===640&&document.querySelector('[data-composite-video]').videoWidth===640"));
  await shot(ctx,"multitrack-composite-real-video");
  await field(ctx,"不透明度","50"); await shot(ctx,"multitrack-opacity-real-video"); await field(ctx,"不透明度","100");
  await compositionPlayback(ctx,id,order);
  await settingsChecks(ctx, id);
  await audioChecks(ctx);
  await ctx.click(`[data-editor-clip="${top.id}"]`);
}

// 先运行纯规则反证，再用同一真实窗口验证数字、修剪与多轨，证据等级分开。
// 窗口恢复1600×1000以确保属性栏可见，窄窗口由原LIVE矩阵另外覆盖。
// 横纵滚动都回零，避免上一个UI回归的视口状态影响抓取前置。
// 实例ID从V1实际节点取得，不使用演示clip-01或固定UUID。
// 顺序执行，不同时启动两个Electron窗口或两份拖动手势。
// helper结束仍保留真实工程交给原导航清理，不自行销毁窗口掩盖资源泄漏。
// 原回归会在窄窗中切换素材、片段和主题，本专项开始先恢复可见大窗口。
// 只恢复窗口尺寸与滚动，不清空工程，因此已存在的真实安排继续接受回归。
// 若原操作链没有创建V1片段，这里直接失败，不能临时补演示对象掩盖原流程问题。
// 同样，如果原分离音轨没有真正建立A1，后续audioChecks不能用假对象救场。
// 数字手势先运行，是因为它不会改变时间安排，失败更容易定位为输入捕获问题。
// 修剪随后运行，产生非零源入点，为多层播放建立更有判别力的源时钟差。
// 最后跨层并创建上层，明确利用前面真实修改结果而非另一套模型夹具。
// 这个连续链能发现修剪后移动丢sourceIn、同源合并变换等跨功能问题。
// 外层harness保留累计失败，当前helper不重置计数，不允许后续截图覆盖早先失败。
// 脚本输出root路径方便复查本次真实样本和截图，不复用上一轮运行目录。
// 跨层拖放沿用生产MIME载荷，DOM模式的session仍由产品dragstart生成。
// 没有读取工程reducer函数，也没有直接调用setState或写Zustand来创建正确答案。
// 拖放确实使用elementFromPoint命中，所以屏幕外A2必须先纵向滚动可达。
// 这一前置修复没有改变业务预期，音轨仍须保留原区间和进入同类目标。
// helper不操作Windows资源管理器，不能替UI08补上人工外部文件拖入勾选。
// helper没有系统缩放接口，1600×1000是测试窗口尺寸，不是125%或150%缩放证明。
// 真实视频默认静音，扬声器试听仍由人工后续验证，不自动改为通过。
// 没有录屏功能，交付的capturePage静态图不能被描述为操作录像。
// 自动鼠标证明浏览器内部捕获路径，不代表触控屏或触摸板所有手势已覆盖。
// 本组没有素材拖入文件管理器的系统OLE路径，外部导入仍引用原LIVE证据边界。
// 临时生成测试视频不含用户私人内容，可保留在运行目录供复核。
// 源路径不写入最终截图说明或公开日志摘要，报告只引用测试文件名与尺寸。
// 回归未量化多解码器CPU/GPU占用，不把五层上限宣传为任意机器实时播放保证。
// 没有工程保存、导出或云同步调用，测试文件写盘仅服务证据而非产品工程能力。
// 未验证跨片段边界自动继续播放，当前同时播放断言只覆盖共同时间区间。
// 两层视频的同步结果不能外推独立音频混音、响度、声像或效果链。
// 未验证损坏源在已解码后突然删除的行为，原探测失败与解码错误是不同阶段。
// 若后续支持图片导入，应另加真实图片多层用例，不能把videoWidth断言当图片证据。
// 当前模型能表达图像构图，但此helper只消费原视频导入入口，不扩大授权增加图片业务。
// 测试结束后返回原导航清理，让离开页面的媒体释放继续接受验证。
async function checkVideoMultitrack(ctx) {
  modelChecks(ctx);
  ctx.win.setSize(1600,1000); await ctx.delay(150);
  await ctx.run("document.querySelector('[data-editor-timeline-scroll]').scrollLeft=0;document.querySelector('[data-editor-timeline-scroll]').scrollTop=0");
  const id = await ctx.run("document.querySelector('[data-editor-track-lane=V1] [data-editor-clip]').dataset.editorClip");
  await numberChecks(ctx,id); await trimChecks(ctx,id); await trackChecks(ctx,id);
}
module.exports = { checkVideoMultitrack, field, mouse, shot };

// 通过正式设置输入验证调低与调高，不靠直接改项目状态制造边界。
// 与属性字段相同，先形成真实草稿再Enter，不直接改limits状态。
// index仅区分本面板视频与音频两个数字，不将轨道编号误用为数组位置。
// 用字符串保留非法输入的可能，字段校验失败必须显示aria-invalid。
// 间隔给React保存草稿，提交结果由调用方的候选轨与错误断言决定。
// key参数允许Escape恢复，避免测试自己设置正确值绕过取消逻辑。
// 修改上限不创建轨道，只有后续真实dragstart与drop才使用新权限。
async function limit(ctx, index, value, key = "Enter") {
  await ctx.run(`(()=>{const e=document.querySelectorAll('[data-track-settings] input')[${index}];e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ctx.delay(70);
  await ctx.run(`document.querySelectorAll('[data-track-settings] input')[${index}].dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true,cancelable:true}))`);
  await ctx.delay(70);
}
// 先检查两项默认都是五，不能只看界面说明文字声称默认数量正确。
// 当前真实存在V1和V2，所以将视频上限设二合法、设一必须非法。
// 非法值不能删除V2，设置只是新增名额，不是删除工程的隐式操作。
// Escape恢复上一次确认的二，再关闭面板，输入草稿不应流进正式limits。
// 拖动下层时不应出现V3，证明限制已经接到实际轨道分配，而非只改输入显示。
// 取消后调高到三，再次拖动才应出现V3候选。
// 验证候选V3的top小于A1的top，防止视频新增行跑到音轨下面。
// 这个几何预期与CSS Modules类名无关，直接读取真实DOM位置。
// 第二次取消后V3消失，不能消耗一个名额或留下空轨。
// 设置面板通过同一EditorAction打开关闭，未创建测试专用设置入口。
// 不要求关闭页面后恢复三，当前文案明确是会话设置而不是持久化偏好。
// 音频默认仍为五，调视频不能顺便把audio上限改为二或三。
// 候选消失不代表已删除源片段，后续音轨与导航回归继续使用原工程确认。
// 两个方向的改值都经过同一提交方法，不能为提高和降低各写一套特殊测试API。
// 本组没有一次创建五个大视频去做压力测试，数量上界另由纯模型检查。
// 将上限从五降到二发生在两条实际视频轨已存在之后，不能用空工程前提回避删除风险。
// 随后输入一是有效数字但不满足现有轨道下限，需就地错误而非自动删轨。
// 错误值仍显示给用户，Escape再恢复最后确认的二，不动态锁到最小值阻止继续输入。
// 如果字段只是视觉显示错误却已把limits设一，后续候选和现有轨道检查会暴露状态污染。
// 升到三后V3出现只说明可以新增，还没真正消耗新轨名额。
// 取消后V3消失正是候选和正式轨道分离的证据，不能保留一条空行假装已经取消。
// 同一设置按钮反复开关，若组件缓存初始limits会把二/三改值错误恢复五。
// 测试没有直接重建组件恢复默认，能够发现父层onChange没有接通的问题。
// 检查几何只看视频候选在A1之前，不依赖标题文案或像素高度的偶然值。
// 若新增轨放在音轨组底部，名额断言可能通过但这项几何断言必然失败。
// A/B状态隔离由原UI专项保留，本次没有把上限提升成共享全局Context。
// 设置只作用当前正式工程，不更改独立samples的演示轨道数量。
// 错误输入使用一而不是空字符串，明确测业务范围拒绝而非仅测Number解析失败。
// 当前已经有两条视频轨，下限二由实际tracks推导，不能写死为默认一。
// 上限错误不应影响音频默认五，面板两个字段仍由同一limits对象的不同键更新。
// 升降上限通过原Integer字段精度，不测试小数自动截断来掩盖非法值。
// 调低以后开始一次新手势，确保nextTrack读取最新限制而非打开面板时缓存。
// 调高以后也开始全新载荷，不复用上一手势的session草稿来制造候选。
// 取消由原cancelDrag发送公开Escape，helper不直接remove V3节点。
// 如果产品把V3提前写进tracks，取消后它还在DOM，断言会明确失败。
// 设置面板关闭后其输入卸载，不能保留不可见焦点影响后续片段快捷键。
// 本组不改变真实片段start/end，因此音轨移动前的快照仍有可靠前提。
// 运行末尾没有把上限重置五，因为临时工程随后会导航销毁，不污染用户持久偏好。
// 后续若新增保存能力，应单独定义会话设置是否进入项目文件，不能沿用这个测试结论。
async function settingsChecks(ctx, id) {
  await ctx.click('[data-track-settings] > span button');
  ctx.smoke.check("Track settings expose the real default video/audio limits", await ctx.run("[...document.querySelectorAll('[data-track-settings] input')].every(e=>Number(e.value)===5)"));
  await limit(ctx,0,"2"); await limit(ctx,0,"1");
  ctx.smoke.check("Track limit cannot delete existing layers through an invalid smaller value", await ctx.run("document.querySelector('[data-track-settings] input').getAttribute('aria-invalid')==='true'"));
  await ctx.run("document.querySelector('[data-track-settings] input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await ctx.click('[data-track-settings] > span button');
  await ctx.beginDrag(`[data-editor-clip="${id}"]`);
  ctx.smoke.check("Lowered limit suppresses new-video-track candidate", !await ctx.run("!!document.querySelector('[data-editor-track-lane=V3]')"));
  await ctx.cancelDrag();
  await ctx.click('[data-track-settings] > span button'); await limit(ctx,0,"3"); await ctx.click('[data-track-settings] > span button');
  await ctx.beginDrag(`[data-editor-clip="${id}"]`);
  ctx.smoke.check("Increasing limit exposes V3 below the video group", await ctx.run("!!document.querySelector('[data-editor-track-lane=V3]')&&document.querySelector('[data-editor-track-lane=V3]').getBoundingClientRect().top<document.querySelector('[data-editor-track-lane=A1]').getBoundingClientRect().top"));
  await ctx.cancelDrag();
  ctx.smoke.check("Cancelling new-track gesture consumes no track or slot", !await ctx.run("!!document.querySelector('[data-editor-track-lane=V3]')"));
}
// 先从真实分离的A1片段取得id，不能用带声音的视频片段冒充音轨。
// 工程音轨来自先前真实AAC源，纯规则夹具不是这次页面投放的数据来源。
// 记录起止后按中点抓取，预期仍保持完整长度而不是把end固定在原位。
// 新增V2后音轨组可能在视口下面，必须真实纵向滚动到A2再取落点。
// 只对屏幕外A2派发事件会绕过命中测试，因此不能直接拿节点调用drop。
// 纵向滚动只改变可见行，不改变横向工程时间，目标秒数仍按同一lanePoint计算。
// 目标必须实际进入A2，不能仅比较数量不变就称作跨音轨移动成功。
// 起点容差至多一帧，长度容差仅容纳二进制小数，不能通过缩短音轨绕过校验。
// 视频和音频保持类型隔离，外层旧音轨投到V1的拒绝用例继续回归。
// 本组没有导出wav或改原文件，音轨移动仍是独立工程实例引用。
// A1实例由真实分离按钮建立，hasAudio与实际audio播放器已经在原LIVE回归中验证。
// 拖动时同类候选可以出现A3，但本次目标明确是已有A2，不应无故创建A3。
// 目标A2本来空闲，所以失败不能归咎于碰撞，能够检查同类转移是否实际开放。
// 原始起点带一帧偏移，测试保留这份值以发现跨层时偷偷归零。
// 目标鼠标秒数加半段长度，与主体grab偏移一致，不能把左端贴到鼠标点。
// 源音轨在A1时选择截图没有帮助，必须观察最终节点所属lane确实变成A2。
// 纵向scrollIntoView先于计算落点，旧A2矩形在视口外时不能用坐标假装可见投放。
// scrollIntoView使用inline nearest，不应顺便横向跳到工程零点改变待放时间。
// 长度精度只容纳1e-7浮点表示，不允许多丢一帧来迁就错误结果。
// 移动完成不修改关联视频audioDetached，音频仍是独立实例而非重新合回视频。
// 当前用例只移动已有音轨，不宣称已实现真实独立音频文件导入。
// 音轨sourceUrl仍来自原视频文件，移动不生成wav或改写原视频字节。
// 先纵滚到目标再求lanePoint还覆盖轨道头与内容纵向一致，否则y会命中错误类型轨道。
// ScrollIntoView可能改变scrollTop，不应触发取消，因为横向pixels基准没有变化。
// 只有窗口或时间线宽度变化才取消手势，单纯纵滚不能被当成布局缩放。
// 目标A2与源A1在同一个timelineGrid，二者width应相同，工程起点无需另加偏移。
// 若音轨行宽度因独奏按钮或标题而不同，公共grid列会使这个错误在几何上暴露。
// 轨道头在第一列，lanePoint使用第二列矩形，不重复减去轨道头宽度。
// 落点采用before.start加半段长度，错用源duration会在修剪后的音轨上形成偏移。
// 这个音轨由未修剪视频分离，具体长度仍来自真实工程，不由测试假定3.25。
// 原源占位可能为98/30秒，比较时不能直接用探测3.25代替工程时长。
// 移轨不是新增素材，原素材面板数量和重复文件判断不应参与这条命令。
// 如果项目仍强制音频留在所属A1，最终closest(lane)会失败，不能以“没有报错”算成功。
// 如果误将音频当视频创建V2，类型归属断言同样会失败。
async function audioChecks(ctx) {
  const id = await ctx.run("document.querySelector('[data-editor-track-lane=A1] [data-editor-clip]').dataset.editorClip");
  const before = (await ctx.clips()).find(item=>item.id===id);
  await ctx.beginDrag(`[data-editor-clip="${id}"]`);
  await ctx.run("document.querySelector('[data-editor-track-lane=A2]').scrollIntoView({block:'nearest',inline:'nearest'})");
  await ctx.dragTo(await ctx.lanePoint(before.start+(before.end-before.start)/2,"A2"));
  const after = (await ctx.clips()).find(item=>item.id===id);
  ctx.smoke.check("Independent audio can move to another same-type track without changing its interval", await ctx.run(`document.querySelector('[data-editor-clip="${id}"]').closest('[data-editor-track-lane]').dataset.editorTrackLane==='A2'`) && Math.abs(after.start-before.start)<1/30+.001 && Math.abs((after.end-after.start)-(before.end-before.start))<1e-7);
}

// 叠放身份确认后单独核对真实播放时钟，避免只看静态图判断同步。
// 点击下层时间线片段后，属性应选中下层而主要视频仍来自上层。
// 用前后DOM层ID顺序相等反证没有选中即置顶的隐藏行为。
// aria-current来自真实片段按钮，不用文件名推断哪个同源实例被选中。
// 一次公共播放按钮驱动两个实际video，等待两者都非paused且currentTime前进。
// 没有调用测试专用media.play来绕过产品控件，播放授权与错误边界都走原流程。
// 暂停同样通过公开按钮，不能分别pause两个节点后自称产品支持统一暂停。
// 源入点不同的两层currentTime本来就应不同，不能拿裸源秒数直接比较。
// 先扣各自sourceIn再比较，得到的才是对应的工程进度。
// 当前两段都放在工程零附近，所以此例不再需要额外叠加不同start。
// 允许0.25秒观察容差以涵盖媒体事件节拍，模型碰撞仍用严格整数帧不借此放宽。
// 真实视频帧是否前进由currentTime与paused共同确认，不以按钮图标变成暂停为证明。
// 没有定时器手写媒体进度，短delay只等待真实暂停事件自然传回。
// 测试保留默认静音，不干扰用户扬声器，也不能把静音播放称作试听通过。
// 此组只验证当前覆盖区间同时播放，不宣称跨空隙连续节目调度已完成。
// 播放等待要求两节点都currentTime大于0.7，单独主视频进度增长不能让它通过。
// 如果低层只是第一帧封面，readyState条件也许通过，但paused/currentTime条件会失败。
// 如果低层自行不断播放，点击公共暂停后every(paused)会发现它没有跟随主控件。
// 对同步采用源时间减入点，使裁过左边缘的下层与完整源上层落在相同工程秒数。
// 单纯要求两源差小于0.25是错误预期，会把合法半秒入点差判成产品失步。
// 这里没有改源时长或缩短片段来让同步断言更容易通过。
// 真实pause事件存在异步节拍，短delay只等消息提交，不把时间写入播放器。
// 比较前读取最新DOM节点，层切换后的旧引用不能代表当前节目播放器。
// 如果上层已到结束而卸载，查询会失败，不能把空数组every为true当成功。
// 本用例在共同覆盖中段暂停，未测试跨结束边界自动切换主时钟，因此明确不外推。
// 节目音频仍默认静音，两个video时间一致不能证明音频总线无回声或响度一致。
// 扬声器试听仍继承UI08未验证项，不因媒体元素有AAC就写成已听到。
async function compositionPlayback(ctx,id,order) {
  await ctx.click(`[data-editor-clip="${id}"]`);
  ctx.smoke.check("Selecting the lower layer changes inspector only, never raises visual priority", await ctx.run(`[...document.querySelectorAll('[data-clip-canvas]')].map(e=>e.dataset.clipCanvas).join()===${JSON.stringify(order.join())}&&document.querySelector('[data-editor-clip="${id}"]').getAttribute('aria-current')==='true'`));
  await ctx.click('[data-editor-region=R03] button[aria-label=播放]');
  await ctx.wait("[...document.querySelectorAll('[data-clip-canvas] video')].every(e=>!e.paused&&e.currentTime>.7)");
  await ctx.click('[data-editor-region=R03] button[aria-label=暂停]');
  await ctx.delay(100);
  ctx.smoke.check("Both real video layers advance and pause from the common program clock", await ctx.run("[...document.querySelectorAll('[data-clip-canvas] video')].every(e=>e.paused)&&(()=>{const a=document.querySelector('[data-live-video]'),b=document.querySelector('[data-composite-video]');return Math.abs((a.currentTime-Number(a.closest('[data-clip-canvas]').dataset.sourceIn))-(b.currentTime-Number(b.closest('[data-clip-canvas]').dataset.sourceIn)))<.25})()"));
}

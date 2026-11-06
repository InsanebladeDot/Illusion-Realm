/** 真实单源画布回归：复用LIVE工程、生产播放器及原窗口，公开事件与模型反证分开。 */
const fs = require("node:fs"), path = require("node:path");

// 数据观测只读工程公开属性，测试不能通过React内部接口写一个正确答案进去。
// data-transform是确认值或当前手势候选，结束手势后才可用它判断工程提交。
// 同时检查属性字段和真实媒体元素，防止只移动选框或封面造成视觉假成功。
// 字段按中文label定位，控件内部仍由生产i18n提供文案，不读取配置来推导预期。
// 这里的键盘与指针属于自动事件，不能写成人工完整操作链或系统拖入验收。
const canvasValue = ctx => ctx.run("JSON.parse(document.querySelector('[data-clip-canvas]').dataset.transform)");
const inputExpression = label => `[...document.querySelectorAll('[data-editor-region=R04] label')].find(e=>e.textContent.includes(${JSON.stringify(label)}))?.querySelector('input')`;

// 先通知React保存字符串草稿，再执行Enter，不把value属性修改当成工程提交。
// 两次调用之间给有界提交间隔，避免输入事件和按键在同一旧闭包中竞争。
// 允许传非法文本，测试不在外面替字段矫正，以验证真实范围与错误处理。
// Enter回到同值后不要求再次提交，公共字段负责避免重复命令。
// focus是真实DOM焦点，失焦会经过原控件逻辑；这里不直接调用onCommit。
// 字段驱动使用原生value setter，是为了通知React而不是只修改HTML属性。
// 测试不调用生产commitField，所以能够发现表单事件没有接通的问题。
// label查找限制在R04，避免同页其他样板的“缩放”输入被误操作。
// 中文label只是当前测试语言前提，不作为工程字段存储键。
// 输入和Enter分成两个事件循环，确保确认使用的是新草稿。
// 如果把两个事件塞进同一旧闭包，可能错误地提交上一次文本。
// 短等待只给React处理事件，不拿等待结束当作保存成功。
// 真正成功由后续data-transform和字段值断言共同判断。
// 非法值测试仍使用同一路径，不能在测试助手里先夹限。
// Escape参数走原控件的恢复逻辑，不直接重置DOM值。
// focus允许真实blur提交发生，因此需要避免无关控件抢焦点。
// 测试不验证输入法组合事件，不能外推为所有文本输入设备已通过。
// 也没有向document发送全局快捷键去替代原字段Enter。
// 本助手只管字符串草稿提交，不持有片段id或工程数组。
// 所以切换目标后仍必须由生产检查器选择正确实例。
// 若label不存在应直接失败，不能悄悄跳过并报测试通过。
async function edit(ctx, label, text, key = "Enter") {
  const expression = inputExpression(label);
  await ctx.run(`(()=>{const e=${expression};e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ctx.delay(70);
  await ctx.run(`(${expression}).dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true,cancelable:true}))`);
  await ctx.delay(70);
}

// 指针使用Chromium客户区坐标，真实pointer捕获和mousemove走产品交互层。
// 不是用dispatchEvent直接伪造一次成功提交，也不改CSS或片段数组。
// 方块中心从实际变换后的选框读取，scale/rotation影响边界但不改变中心语义。
// 横向位移按项目比例独立计算，能够发现误用对象旋转包围盒作尺子的错误。
// mouseReleased只在最后发送，hover阶段必须仍是草稿，不应改时间线安排。
// CDP坐标属于浏览器客户区，不能掺入Windows标题栏的屏幕坐标。
// mousePressed声明左键，mouseReleased清buttons，避免后续用例残留按下状态。
// 每次移动仍经过Chromium命中测试，透明按钮必须真的位于画面上方。
// 因此按钮位置或pointer-events错误会导致构图断言失败。
// 真实捕获由生产pointerdown调用，测试没有伪造hasPointerCapture返回值。
// 这与直接执行onPointerMove回调不同，能够覆盖浏览器事件投递边界。
// 自动CDP事件仍不是人工系统鼠标操作，证据等级必须单独注明。
// 测试没有操作用户正在使用的桌面鼠标，不影响用户前台应用。
// 短间隔避免多次移动被一次页面提交合并，方便逐步观察位置。
// 间隔不用于生成视频进度，媒体时间仍由真实播放器报告。
// 鼠标松手由调用方配对；取消用例也必须释放最终按键状态。
// 此助手不包含拖放文件载荷，所以不能证明资源管理器OLE拖入。
// 按钮按住状态不是文件dragstart，不应触发素材导入遮罩。
// 若媒体错误层挡住画面，真实命中会失败而不是绕过该层强制提交。
// 同一客户区坐标系统供frame测量和输入使用，减少额外缩放误差。
// DPR为1的CDP通过不等于真实125%系统缩放已经验收。
async function mouse(ctx, type, point) {
  await ctx.win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type, ...point, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  await ctx.delay(50);
}
// 抓取点故意偏离中心九个和七个屏幕像素，检验是否错误吸附中心。
// 目标位移传项目像素，助手只用frame尺寸换算为客户区移动量。
// 这里不读取生产gestureValue，预期换算与被测算法保持独立。
// frame宽来自整个项目边界，不取已经旋转后的选框包围盒。
// 否则旋转30度会改变位移尺，导致同样鼠标移动得到不同X增量。
// 宽和高各用独立比例，可发现误把竖轴也除以项目宽的错误。
// 1920和1080是此真实工程已知配置，不从data-transform反推预期。
// 素材640×360并不是此处的位移坐标系，源尺寸只影响基础适配盒。
// 按下前先移动到抓取点，避免上一次手势残留hover坐标影响命中。
// 本助手只开始并预览，不自行松手，调用方可以观察提交前候选。
// 返回客户区终点供同一手势释放，不能松到另一个随意坐标。
// Escape测试复用相同起点计算，检验取消与正常提交的差异。
// 锁轨测试也复用此助手，确保是同一个实际抓取意图被权限拒绝。
// 布局变化后重新测量，不缓存上一窗口的frame尺寸。
// 缩放50%只缩对象，不缩项目尺，因此移动量不能再除以0.5。
// 旋转也不改变X向右Y向下的定义，位移不能旋转到对象局部轴。
// 若项目frame尺寸为零，本组前置就不成立，应由断言暴露布局问题。
// 选框的外包矩形只用来找中心，不能拿其宽高代表源基础尺寸。
async function startMove(ctx, dx, dy) {
  const info = await ctx.run("(()=>{const s=document.querySelector('[data-canvas-selection]'),f=document.querySelector('[data-editor-preview-frame]').getBoundingClientRect(),r=s.getBoundingClientRect();return{x:r.left+r.width/2+9,y:r.top+r.height/2+7,width:f.width,height:f.height}})()");
  const end = { x: info.x + dx * info.width / 1920, y: info.y + dy * info.height / 1080 };
  await mouse(ctx, "mouseMoved", { x: info.x, y: info.y });
  await mouse(ctx, "mousePressed", { x: info.x, y: info.y });
  await mouse(ctx, "mouseMoved", end);
  return end;
}

// 真实像素来自capturePage中的项目frame，截取不包含标题或时间码。
// 把内容盒几何与两个实际像素快照一起看，避免只比较选框变化就称视频帧已变换。
// 媒体节点引用也保持相同，若产品改用封面替换视频，该身份断言会失败。
// 文件图像留给交付核对，哈希只说明像素确有变化，不当作精确合成一致性测量。
// 截图保存完整正式窗口，保留真实素材行、时间线和检查器上下文。
// 只有项目局部裁图可能掩盖错误选择或固定演示文件名，所以同时留整窗证据。
// 文件名区分变换前、变换后与竖屏窄窗，避免后一次覆盖前一次。
// 图片写入独立测试临时目录，不写入用户输出或修改媒体源。
// capturePage返回的是当前渲染画面，不是设计稿或根据预期重绘的图。
// 实际像素断言另行裁项目frame，不能把截图存在就当作内容正确。
// 截图需要交付前打开核对，结构化数值通过不能代替视觉检查。
// PNG没有添加“测试通过”水印，避免把画面证据与结果说明混在一起。
// 此处没有录屏，不能把连续截图描述成真人操作视频。
// 截图记录当时主题和窗口，不代表未拍摄的系统缩放已经验证。
// 媒体源为本地实际编码视频，封面是否存在不影响截图来源说明。
// 捕获失败会抛到外层harness，不能只打印警告后继续称通过。
async function shot(ctx, name) {
  fs.writeFileSync(path.join(ctx.root, `${name}.png`), (await ctx.win.webContents.capturePage()).toPNG());
}

// 从项目frame内部读取实际BGRA像素，选框和标题不应占据大片画面。
// 比较黑色占比可独立证明50%缩放作用在真实画面，不能只有透明选框缩小。
// 颜色阈值容忍编码量化接近黑色，但不会把65%透明度的彩色条纹算作黑色。
// 输入是已知色条测试视频，不能把此判据外推到任意本来就全黑的用户视频。
// 裁图边界向内缩两像素，避免项目边线干扰大面积黑色统计。
// 实际video帧为可辨识彩色测试图，原尺寸应覆盖横屏项目主体。
// 缩放50%后面积约为四分之一，旋转只改变位置与外包矩形，不扩大实际面积。
// 因此黑色占比应明显增加，能够反证仅缩小选框而真实video未变。
// 阈值留有编码暗部与亚像素边缘余量，不要求每个像素逐一一致。
// 本组不是预览与导出逐帧比较，不应报告成输出色彩或编码一致性验收。
// 四字节步长来自NativeImage.getBitmap，不把PNG压缩字节当像素遍历。
// 仅比较RGB通道，窗口截图已合成到背景，alpha不能替代黑场判断。
// 低于三的阈值区分接近黑色与透明度造成的正常变暗。
// 65%不透明度仍应保留彩色测试图，不会把全部画面误算为纯黑。
// 选框最多占少量边缘像素，不可能独自制造超过65%的黑色面积。
// 标题、时间码和属性面板都不在裁图内，主题变化不会改变本组背景比例。
// 输入前提是已解码横屏视频，所以不能用占位黑屏获得“缩放成功”。
// 前一断言必须确认videoWidth和readyState，再执行像素比较。
// 源本来全黑时此方法没有区分力，因此不能对任意用户文件复用该验收阈值。
// 这项验证证明真实画面参与变换，不能证明多个视频已同时合成。
async function picturePixels(ctx) {
  const rect = await ctx.run("(()=>{const r=document.querySelector('[data-editor-preview-frame]').getBoundingClientRect();return{x:Math.ceil(r.left)+2,y:Math.ceil(r.top)+2,width:Math.floor(r.width)-4,height:Math.floor(r.height)-4}})()");
  const pixels = (await ctx.win.webContents.capturePage(rect)).getBitmap();
  let black = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 3 && pixels[i + 1] < 3 && pixels[i + 2] < 3) black++;
  return black / (pixels.length / 4);
}

// 外观菜单同时更新用户偏好和nativeTheme，直接改单边信号会被AppShell偏好覆盖。
// 测试必须像用户一样选择主题，不能在DOM上手写data-theme绕过生产流程。
// 等待观测信号、实际媒体查询和波纹结束三项，防止截图仍是旧配色。
// 选项点击后菜单会保留，再用公开触发器关闭，避免菜单挡住属性证据。
// 关闭状态有独立等待，不靠裁图擦除菜单，也不假定动画固定多少毫秒。
// 同一个方法用于进入深色与恢复浅色，两个方向遵守相同完成条件。
// 查询值是本脚本固定light/dark，不接收任意用户代码或CSS选择器。
// 主题切换失败会超时失败，不能继续拍浅色截图却命名为dark。
// 当前真实媒体节点和工程数组不应因菜单流程重建，由调用方随后反证。
// 主进程主题由生产IPC完成，不在helper内另写一套处理器。
// 菜单不拥有构图数据，关菜单不等于取消已确认变换。
// 真实视频应保留原色，不因工作区主题添加滤镜。
// 这组自动菜单路径仍不能替代人工系统缩放或扬声器试听。
// 恢复light后后续旧LIVE截图前置一致，不泄漏新专项的主题选择。
// 若未来菜单行为改变，真实可访问按钮断言会暴露差异，不能强行删除浮层。
async function setTheme(ctx, theme) {
  await ctx.click('[data-theme-trigger]');
  await ctx.wait(`document.querySelector('[data-theme-option=${theme}]')`);
  await ctx.click(`[data-theme-option=${theme}]`);
  await ctx.wait(`document.documentElement.dataset.theme==='${theme}'&&matchMedia('(prefers-color-scheme: dark)').matches===${theme === "dark"}&&!document.documentElement.classList.contains('theme-ripple')`);
  await ctx.click('[data-theme-trigger]');
  await ctx.wait("document.querySelector('[data-theme-trigger]').getAttribute('aria-expanded')==='false'");
}

// 初始首片段在0秒，源为真实横屏H264；先暂停在确定帧，后续只改构图。
// 不改变源currentTime来制造“前后不同画面”，时间书签在本组保持相同。
// 视频引用记录在页面临时测试变量，产品没有新增全局媒体接口。
// 画面默认100%完整适配，选框与真实video共用同一盒，不包含黑边区域。
// x、y等字段确认后仍须保留淡入淡出禁用，后续速度能力单独回归。
// 属性头跟片段，而素材列表可仍高亮另一份竖屏视频，保护两种选择隔离。
// 本组先选择首个时间线实例，确保字段目标和当前节目源明确。
// readyState至少为2才截图，避免把加载中封面当成实际视频帧。
// 记录节点身份后不重新查询出一个“看起来同名”的替代节点。
// 五个字段确认后原video必须仍是同一个DOM对象。
// 这样可以发现每次构图都卸载重载媒体导致的播放状态丢失。
// 缩放50和旋转30同时存在，能排除只实现位置而忽略其他参数的情况。
// X1120与Y480分别偏离默认960与540，避免默认值恰好掩盖未接通。
// 不透明度65应转换为CSS0.65，而不是误设为65或0.0065。
// videoWidth640来自实际媒体，不由封面或ffprobe夹具填入DOM。
// 变换前后都保存整窗截图，便于核对字段和画面确实属于同一对象。
// 像素对比使用相同项目frame，不能靠缩小外层预览容器获得大黑边。
// 非法缩放-5应停在字段错误态，原确认scale50必须继续用于画面。
// 若模型先夹成最小值，此处会失败，避免用自动矫正掩盖错误输入。
// Escape恢复合法确认值，后续拖动不能携带残留错误草稿。
// 本组只修改构图，不点击播放，画面内容改变不应来自时间跳跃。
// 时间线秒数由下一组独立检查，避免只凭字段值宣称没有改动安排。
// 测试不修改源文件分辨率，缩放只属于节目显示尺寸。
// 淡入淡出仍需禁用；真实速度由独立片段命令接通，不属于构图写入。
// 失败会保留当前截图和日志，外层harness不能以正常app退出覆盖失败码。
// 此处的自动Enter事件覆盖控件契约，不是人工键盘路径证明。
async function checkFields(ctx, id) {
  await ctx.click(`[data-editor-clip="${id}"]`);
  await ctx.wait("document.querySelector('[data-clip-canvas] video')?.readyState>=2");
  await ctx.run("window.__canvasMedia=document.querySelector('[data-live-video]')");
  await shot(ctx, "canvas-before-real-video");
// 选取测试图首帧是为了在不播放的条件下比较构图，减少内容本身变化的干扰。
// 变换前真实图几乎占满横屏项目，黑像素不应大于十分之一。
// 变换后的大面积黑场来自项目底，不是视频error层或加载超时。
// readyState和节点身份共同排除用失败黑屏通过面积阈值的漏洞。
// 截图中的四角旋转后应露出黑底，肉眼核对与像素统计相互补充。
// 不透明度65会使彩条变暗，若只选框变暗而video保持原色也属于错误。
// DOM computedStyle确认透明度属于内容容器，不属于整个检查器或预览外壳。
// 缩放与旋转都是CSS二维几何，不对源视频执行FFmpeg转码。
// 因此videoWidth仍640是正确结果，不能要求变换后解码宽变成320。
// 构图后暂停帧的时间码内容不变，可辅助判断没有偷换帧来制造不同截图。
// 本用例未检查颜色管理精度，不给播放器色域或HDR能力做结论。
// 当前样本是常规H264，不宣称全部编码器都可解码。
// 实际像素检查不能代替源元数据检查，两者分别识别显示和探测问题。
// 没有把截图中的蓝色选框算成模型内容，边缘只占很少比例。
// 一组已知测试图足以反证“只动选框”，但仍需用户视频继续人工验收。
  const beforePixels = await picturePixels(ctx);
  await edit(ctx, "缩放", "50"); await edit(ctx, "旋转", "30");
  await edit(ctx, "位置 X", "1120"); await edit(ctx, "位置 Y", "480"); await edit(ctx, "不透明度", "65");
  const value = await canvasValue(ctx);
  ctx.smoke.check("Canvas fields transform the same real video with project-pixel values", value.x === 1120 && value.y === 480 && value.scale === 50 && value.rotation === 30 && value.opacity === 65 && await ctx.run("window.__canvasMedia===document.querySelector('[data-live-video]')&&getComputedStyle(document.querySelector('[data-canvas-content]')).opacity==='0.65'&&document.querySelector('[data-canvas-content] video').videoWidth===640"));
  await shot(ctx, "canvas-after-real-video");
  const afterPixels = await picturePixels(ctx);
  ctx.smoke.check("Actual decoded video pixels move inside a black project crop", beforePixels < .1 && afterPixels > .65);
  // 主题只改变工作区外观，不应重置已确认构图或重建真实媒体节点。
  // 在非默认位置、半尺寸与旋转状态切深色，比默认中心截图更能发现布局回写。
  // 主题信号经生产外观菜单统一修改，测试不自行加.dark类模拟另一个主题系统。
  // 等信号与媒体查询实际一致，成功条件还需读取真实数据与节点身份。
  // 深色截图保留完整检查器，能够核对同一组五个参数仍对应当前实际帧。
  // 视频色彩不随主题变化，黑场仍是项目底色而非深色面板背景。
  // JSON完整相等保护位置、缩放、角度和透明度，没有只检查其中一项。
  // 保存原video引用还能发现主题切换意外触发卸载/重新加载的问题。
  // 新截图专门记录变换后的深色画面，不能借默认构图的旧主题图代替。
  // 这只验证本测试窗口的nativeTheme信号，不证明系统显示缩放或多屏已经测过。
  // 恢复浅色是后续原LIVE截图的前置，避免把主题状态泄漏给另一用例。
  // 失败向harness传播后由窗口退出清理，不在这里重置失败计数。
  // 主题切换不创建第二份工程或播放器，仍在当前真实会话连续操作。
  // 用户应用没有被测试代码关掉或重启，自动截图来自独立冒烟窗口。
  await setTheme(ctx, "dark");
  ctx.smoke.check("Dark theme preserves transformed decoded video and project values", JSON.stringify(await canvasValue(ctx)) === JSON.stringify(value) && await ctx.run("window.__canvasMedia===document.querySelector('[data-live-video]')"));
  await shot(ctx, "canvas-after-real-video-dark");
  await setTheme(ctx, "light");
  await edit(ctx, "缩放", "-5");
  ctx.smoke.check("Invalid canvas field stays local and leaves confirmed geometry intact", (await canvasValue(ctx)).scale === 50 && await ctx.run("!!document.querySelector('[data-editor-region=R04] input[aria-invalid=true]')"));
  await edit(ctx, "缩放", "50", "Escape");
}

// 屏幕上只移动少量像素也应换算出准确的项目位移，尤其缩放50%、旋转30度后。
// 抓取偏移由startMove加入，预期仍是原中心加delta，不能中心吸到鼠标。
// 候选时X/Y同步，但时间线start/end数组完全不变，说明没有混入片段移动。
// 松手再选另一实例后返回，确认值仍在，排除只更新临时选框状态的假实现。
// Escape取消后选中实例构图恢复原值，未确认候选不能遗留到新一轮拖动。
// 取消不依赖反向拖回起点，输入中合法负坐标也不会被误夹到画布内部。
// 先保存所有片段start/end，再开始画布拖动，比较对象不只当前片段。
// 若错误地调用时间线移动命令，即使画面看似跟手也会被时间数组反证发现。
// 位移180和90使用项目单位，窗口上实际移动距离会小得多。
// 容差小于四项目像素，用于客户区整数坐标量化，不容忍一整段源宽的漂移。
// 旋转30度和scale50继承上一组，因此本组不是只测默认未变换画面。
// X字段必须在松手前同步候选，排除只更新选框而右侧滞后的情况。
// 松手后选择另一片段再返回，确认工程值确实保存到原实例。
// 如果只保留hook里的临时draft，切换后结果会消失并使本组失败。
// 取消用例保存已经提交的位置，不把初始默认中心误当成恢复目标。
// 再次拖动-120/30后发Escape，不通过反向移动回去伪装取消。
// Escape后仍松开鼠标，确保下一用例没有遗留pointer捕获。
// 完整五个值JSON相同，说明取消不仅恢复X，也保留旋转和透明度。
// 源区间没有任何补丁接口，实际数组比较进一步保护该边界。
// 其他实例虽可能同源，也不能因当前拖动同时偏移。
// 切选择动作走生产时间线按钮，未直接写React的selectedId。
// 本组不模拟系统切出应用，window blur清理仍以代码边界说明为主。
// 没有验证触屏双指缩放，生产也没有开放自由变形手柄。
// 测试没有拖动时间线播放头，空间位移与工程时间定位分别验收。
// 取消候选不应产生成功通知，本组只看确认值而非提示文本。
// 保留抓取偏移与字段双向同步是同一个手势的两个观察面。
async function checkDrag(ctx, id, other) {
  const before = await canvasValue(ctx), times = JSON.stringify(await ctx.clips());
  const end = await startMove(ctx, 180, 90);
  let moved = await canvasValue(ctx);
  ctx.smoke.check("Scaled rotated canvas drag keeps grab offset and synchronizes X/Y", Math.abs(moved.x - before.x - 180) < 4 && Math.abs(moved.y - before.y - 90) < 4 && JSON.stringify(await ctx.clips()) === times && await ctx.run(`Math.abs(Number((${inputExpression("位置 X")}).value)-${moved.x})<0.01`));
  await mouse(ctx, "mouseReleased", end);
  await ctx.click(`[data-editor-clip="${other}"]`); await ctx.click(`[data-editor-clip="${id}"]`);
  ctx.smoke.check("Canvas release commits one instance and survives switching selection", Math.abs((await canvasValue(ctx)).x - moved.x) < 0.01);
  const saved = await canvasValue(ctx), cancelEnd = await startMove(ctx, -120, 30);
  await ctx.run("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
  await mouse(ctx, "mouseReleased", cancelEnd);
  ctx.smoke.check("Escape discards canvas draft without changing committed composition", JSON.stringify(await canvasValue(ctx)) === JSON.stringify(saved));
// 本段补充“未选画面首次抓取”的回归，而非重复已选对象的移动。
// 先选第二安排，属性应属于第二安排，书签也随原时间线选择定位。
// 再只点标尺首段时刻，让节目显示第一安排而属性仍保留第二安排。
// 这是正常允许的组合，不能为了画面与属性一致而提前偷偷改selectedId。
// 抓第一安排前先验证这种分离，避免后续选中断言天生就成立。
// 按下第一画面时才就地选择第一安排，不能跳到它的时间线起点。
// 这次按下之后仍要继续同一手势移动六十项目像素。
// 若effect把selected变化视作对象卸载，会在捕获后立刻取消，最终位移为零。
// 因此只检查点击选中还不够，必须同时检查松手后的实际位移。
// 等真实首帧ready再抓取，加载遮罩不能成为误诊为选择逻辑错误的因素。
// 标尺点击使用客户区位置，仍由生产共同时间尺把它转换为工程秒数。
// 标尺在最左十像素处对应第一安排内部，不碰到两段之间的空隙。
// 窗口未横滚是此小组前置，横滚放置另有原LIVE专项覆盖。
// 这里不调用selectCanvas函数，真正的选择来自透明画面按钮命中。
// 向右六十像素是项目单位，不能把鼠标终点直接当成画面中心。
// 末尾检查器id必须变成第一安排，名称相同不足以证明对象切换。
// 同源两段文件名一致，因此稳定id比较尤其必要。
// 候选结束后构图变化保留，说明false到true选择没有触发清理回滚。
// 这个用例还保护点击画面不改变素材列表高亮的架构边界。
// 素材列表高亮由外层原集成用例检查，本段没有写它的任何状态。
// 切换节目对象会重建媒体生命周期，旧video不能继续把回执写给新画面。
// 选中画面本身不执行seek，因此抓取时不会再次重载正在看的帧。
// 捕获结束应只留下已确认位置，不留下未选对象的临时draft。
// 后续复制继承此位置，连续用例能发现候选仅显示成功却未写工程的问题。
// 这里仍属于CDP自动指针，不能描述为用户真人拖动验收。
  await ctx.click(`[data-editor-clip="${other}"]`);
  const ruler = await ctx.run("(()=>{const r=document.querySelector('[data-editor-region=R07]').getBoundingClientRect();return{x:r.left+10,y:r.top+10}})()");
  await mouse(ctx, "mousePressed", ruler); await mouse(ctx, "mouseReleased", ruler);
  await ctx.wait("document.querySelector('[data-clip-canvas] video')?.readyState>=2");
  ctx.smoke.check("Viewing another program frame keeps the inspector selection independent", await ctx.run(`document.querySelector('[data-editor-region=R04]').dataset.editorInspectorClip===${JSON.stringify(other)}`));
  const beforeSelect = await canvasValue(ctx), selectedEnd = await startMove(ctx, 60, 0);
  await mouse(ctx, "mouseReleased", selectedEnd);
  ctx.smoke.check("Clicking an unselected picture selects and completes the same canvas gesture", Math.abs((await canvasValue(ctx)).x - beforeSelect.x - 60) < 4 && await ctx.run(`document.querySelector('[data-editor-region=R04]').dataset.editorInspectorClip===${JSON.stringify(id)}`));
}

// 复制沿用已有公共菜单，不为构图建立第二个复制实现或系统剪贴板假动作。
// 新实例先继承五个确认值，随后修改副本X不能反向改原片段的共享对象。
// 最后删除副本恢复原LIVE场景，便于后续时间线拖动断言继续使用原先两个实例。
// 点击菜单会选择新副本，这是产品正常意图，不把选中变化误判成构图污染。
// 源文件和素材库数量均不由此操作改变，复制是独立安排记录。
// 复制前保存原片段完整变换和当前所有安排id。
// 通过新id差集识别副本，不用文件名判断，因为同源名称本来就相同。
// 菜单入口复用正式右键动作，能够覆盖复制命令与变换克隆的实际连接。
// 副本初始五个值应与原片段相同，不能只保留位置而丢缩放或不透明度。
// 随后只改副本X为800，用非默认值区别于继承的原位置。
// 回到原片段检查全部值，而不只看X，保护其他字段没有意外重置。
// 原片段与副本共享assetId是正确的，独立性要求针对clip.id与transform对象。
// 此组不要求复制媒体文件，素材库增加重复文件反而属于错误副作用。
// 删除临时副本走原删除菜单，保持后续LIVE碰撞测试的两段前置。
// 如果删除失败，后续时长和数量断言会暴露残留，不能静默清空工程救场。
// 复制后的时间安排仍由原命令决定，本测试不为构图篡改start/end。
// 菜单关闭后再点击原片段，避免焦点留在已经卸载的菜单按钮。
// 没有引入测试专用复制回调，生产模型才是行为来源。
// 这里验证值的独立写入，纯模型冻结测试另验证不可变输入。
// 两者结合能发现“暂时显示正确但底层共享对象”的实现错误。
// 失败时不自动重载页面，因为重载可能掩盖实例串值。
async function checkCopy(ctx, id) {
  const saved = await canvasValue(ctx), before = (await ctx.clips()).map(item => item.id);
  await ctx.openLiveMenu(id); await ctx.click('[data-live-clip-menu] button[aria-label=复制到同轨末尾]');
  const copy = (await ctx.clips()).find(item => !before.includes(item.id));
  ctx.smoke.check("Duplicating a clip preserves its complete transform", JSON.stringify(await canvasValue(ctx)) === JSON.stringify(saved));
  await edit(ctx, "位置 X", "800");
  await ctx.click(`[data-editor-clip="${id}"]`);
  ctx.smoke.check("Editing copied transform leaves the original instance independent", JSON.stringify(await canvasValue(ctx)) === JSON.stringify(saved));
  await ctx.openLiveMenu(copy.id); await ctx.click('[data-live-clip-menu] button[aria-label=删除]');
  await ctx.click(`[data-editor-clip="${id}"]`);
}

// 锁轨时字段、组重置和画布手势共同禁用，不能只保护时间线拖动。
// 用真实指针尝试位移，再发松手，确认变换仍是锁前值。
// 淡入淡出仍禁用，速度按独立能力开放；解锁不顺带启用未接通的处理。
// 重置借用原属性组按钮，恢复项目中心和contain100%，不是源分辨率一比一。
// 带错误草稿的重置在公共样板另有覆盖，本组关心正式工程值和真实画面都恢复。
// 先保存锁前值，再通过轨道头公共锁按钮改变真实工程权限。
// 测试没有把input.disabled手动改成true，禁用状态必须来自生产锁表。
// 真实画布拖动仍尝试完整按下、移动和松手，不能只看光标样式。
// 随后比较确认构图不变，防止锁定只隐藏选框而命令仍可写。
// 所有字段都禁用包括此前可编辑的五个构图键。
// 淡入淡出本来就禁用，不能单独证明轨道锁生效；构图与速度均须被锁住。
// 组重置也必须禁用，不能以“恢复默认”作为绕过编辑锁的例外。
// 解锁后使用同一个按钮恢复权限，不重建工程或新建片段。
// 真正重置通过已有属性组动作触发，不直接调用defaultTransform。
// 预期960/540由已知1920×1080中心独立写出。
// 预期scale100指完整contain，不能恢复成源640×360的一比一尺寸。
// 旋转应归零，不透明度应回100，防止组重置只还原其中一个字段。
// JSON完整比较会发现多出旧字段或漏掉值，而不是仅检查按钮变灰。
// 锁定不应静音原视频，声音权限由原通道安排独立管理。
// 本组不覆盖轨道可见或solo按钮，它们仍是未接通能力。
// 键盘越权与菜单越权由原LIVE锁轨回归继续检查。
// 这次新增的是字段与画布入口共享同一权限，而非另建第二套锁。
// 最终恢复默认构图，确保后续竖屏基础适配测试不继承前一对象的参数。
async function checkLockAndReset(ctx) {
  const saved = JSON.stringify(await canvasValue(ctx));
  await ctx.click('[data-editor-track-head=V1] button[aria-label=锁定]');
// 锁前保存的是此前经过真实拖动和复制检验的非默认构图。
// 如果只用默认中心测试，错误重置可能碰巧仍满足不变断言。
// 尝试位移时只读锁态仍允许按钮存在，避免因移除节点无法触发测试。
// 按钮aria-disabled不是原生disabled，所以必须实际检查事件处理拒绝。
// 这能发现只改可访问属性却忘记阻止pointerdown的错误。
// 模型还会复核锁，哪怕界面层存在迟到回调也应保护确认值。
// 普通组重置会涉及五个参数，锁态不得只挡住单字段Enter。
// 解锁后重置成功又反证不是整个回调永久断开。
// 锁定只保护编辑，不要求停止媒体读取或删除当前预览。
// 因此实际播放器是否暂停由播放控制决定，不把轨道锁当成停止按钮。
// 本组没有修改track id，源轨锁和目标轨锁仍由原时间线命令分别处理。
// 音轨分离的目标锁反例在原UI08集成测试中保留。
// 字段禁用不通过透明遮罩实现，原生input.disabled使Tab不能进入这些字段。
// 隐藏面板焦点路径由响应式套件检查，不在此处根据CSS推断通过。
// 重置完成后字段错误草稿由原epoch清理，工程值则来自共同命令。
  const end = await startMove(ctx, 150, 30); await mouse(ctx, "mouseReleased", end);
  ctx.smoke.check("Locked track blocks canvas, transform fields and group reset", JSON.stringify(await canvasValue(ctx)) === saved && await ctx.run("[...document.querySelectorAll('[data-editor-region=R04] input')].every(e=>e.disabled)&&document.querySelector('[data-editor-region=R04] button[aria-label=重置]').disabled"));
  await ctx.click('[data-editor-track-head=V1] button[aria-label=锁定]');
  await ctx.click('[data-editor-region=R04] button[aria-label=重置]');
  ctx.smoke.check("Formal transform reset restores project center and fit baseline", JSON.stringify(await canvasValue(ctx)) === JSON.stringify({ x: 960, y: 540, scale: 100, rotation: 0, opacity: 100 }));
}

// 源查看不带构图编辑层，不能用最后选中片段的缩放去污染素材原件预览。
// 竖屏源入轨复用同一创建方法，验证不同分辨率并非套用横屏宽高。
// 最终删除临时竖屏安排并选回原首段，后续原LIVE的碰撞与音轨用例仍成立。
// 删除只是工程引用，真实portrait素材仍留在列表，可继续查看。
// 窗口大小只改变CSS比例，项目坐标、contain基础尺寸和字段确认值不改。
// 原完整UI套件另覆盖主题和三容器，本组额外检查真实变换在窄窗不漂移。
// 素材列表第二行对应实际360×640竖屏24fps视频，包含不同源比例和帧率。
// 先只点素材，必须进入原始源查看而不出现片段编辑按钮。
// 这时工程仍有原首段选择，能够发现错误复用最后构图污染源查看的问题。
// 添加到V1末尾沿用原键盘替代按钮，没有新增测试专用创建方法。
// 新片段用id差集识别，同一竖屏素材可反复添加而不覆盖已有安排。
// 等待videoHeight640证明实际竖屏源已经解码，不能只看竖屏封面。
// contain基准应占项目满高，横向宽度为607.5/1920。
// 比例0.31640625独立由源宽高和项目尺寸算出，不读取被测fittedSize结果。
// 宽高两项共同检查可发现把竖片拉伸铺满横屏项目的错误。
// 缩放80和X780构成非默认构图，用于检查窄窗口后是否被重新居中。
// 改变窗口只影响显示比例，JSON确认值必须逐项保持不变。
// 窄窗仍检查真实videoHeight，防止响应式改成封面展示规避解码。
// 窄窗截图保留属性与媒体，视觉检查能看到竖图整体比例。
// 恢复窗口后删除临时竖屏安排，素材原件仍应保留。
// 最后选回原横屏片段，下一组播放头验证使用已知起点。
// 这一组不是竖屏项目实机验证，竖屏项目中心另有纯模型反证。
// 也没有改变系统显示缩放，窗口尺寸测试不能记成125%或150%已验。
// 浅深主题由原套件继续覆盖，本组关注已确认构图不受布局改变影响。
// 真实图片尚无导入入口，不能把这个竖屏视频用例写成图片导入成功。
// 新增竖屏安排只存在本次临时工程，不写用户工程文件。
async function checkPortraitAndSource(ctx, id) {
  await ctx.run("document.querySelectorAll('[data-editor-asset]')[1].click()");
  ctx.smoke.check("Asset source viewing keeps original geometry and excludes canvas editing", await ctx.run("!document.querySelector('[data-clip-canvas]')&&!!document.querySelector('[data-live-video]')"));
  const before = (await ctx.clips()).map(item => item.id);
  await ctx.click('[data-editor-region=R02] button[aria-label="添加到 V1 末尾"]');
  const portrait = (await ctx.clips()).find(item => !before.includes(item.id));
  await ctx.wait("document.querySelector('[data-clip-canvas] video')?.videoHeight===640");
  const ratio = await ctx.run("(()=>{const c=document.querySelector('[data-canvas-content]').getBoundingClientRect(),f=document.querySelector('[data-editor-preview-frame]').getBoundingClientRect();return {w:c.width/f.width,h:c.height/f.height}})()");
  ctx.smoke.check("Portrait video uses full-height contain baseline without stretching", Math.abs(ratio.h - 1) < .01 && Math.abs(ratio.w - .31640625) < .01);
  await edit(ctx, "缩放", "80"); await edit(ctx, "位置 X", "780");
  const value = JSON.stringify(await canvasValue(ctx));
  ctx.win.setSize(1138, 815); await ctx.delay(250);
  ctx.smoke.check("Narrow viewport preserves project-pixel composition and real video", JSON.stringify(await canvasValue(ctx)) === value && await ctx.run("document.querySelector('[data-canvas-content] video').videoHeight===640"));
  await shot(ctx, "canvas-portrait-narrow");
  ctx.win.setSize(1600, 1000); await ctx.delay(250);
  await ctx.openLiveMenu(portrait.id); await ctx.click('[data-live-clip-menu] button[aria-label=删除]');
  await ctx.click(`[data-editor-clip="${id}"]`);
}

// 暂停定位产生的迟到timeupdate不代表用户开始播放，不能改回刚拖好的工程书签。
// 连续指针定位每步独立观察实际蓝线，不能只检查最后松手碰巧落在正确位置。
// 媒体当前时间被临时设为旧值是明确负向夹具，不是实际解码器延迟的人工证据。
// 真正播放进度仍由原套件检查，修复不能简单屏蔽所有timeupdate来让拖动稳定。
// 最后点击首片段恢复0秒，原抓取偏移和移动用例保留自己的前置条件。
// 标尺时间范围取公开data值，与实际客户区宽度建立独立比例。
// 0.8、1.2、1.6、2秒连续向右，预期蓝线不应被媒体旧回执向左拉。
// 每次move后立即记录工程时间，不能只看最后松手恰好正确。
// 一帧左右的容差包含30fps对齐与鼠标整数像素误差。
// 若媒体在手势中反写旧位置，即使最终落在2秒也会被中间序列抓住。
// 松手后保存工程书签，再让暂停媒体发出明确的旧timeupdate。
// 把currentTime设0.1是负向夹具，记录中必须与自然媒体事件区分。
// 这个夹具只检验旧回报隔离，不能声称复现所有系统解码器延迟。
// 暂停状态意味着尚未收到新play授权，旧事件不该推进或回退工程。
// 真正播放是否仍能推进由后续原UI06用例独立检查。
// 因此不能用完全移除timeupdate监听来通过本组而破坏播放。
// 暂停最终进度也必须由后续回归检查，避免修抖动时丢失最后媒体时间。
// 点击首段恢复零起点，不能让播放头专项改变原移动用例的前置。
// focus不滚动由产品代码负责，测试没有锁定浏览器滚动位置来掩盖问题。
// 此用例只覆盖自动连续拖动，不代替用户对手感和设备采样率的人工验收。
// 没有使用定时器增加currentTime，媒体时间设置只用于显式反例。
// 播放头空间坐标与画布构图空间坐标不共享候选，两种拖动必须互不串值。
// 失败应保留完整观测序列所在日志，不以再次拖到正确点修饰结果。
async function checkPlayhead(ctx, id) {
  const left = await ctx.run("(()=>{const b=document.querySelector('[data-editor-region=R07]').getBoundingClientRect();return {x:b.left,y:b.top+12,unit:b.width/Number(document.querySelector('[data-editor-region=R07]').dataset.timelineRange)}})()");
  await mouse(ctx, "mousePressed", { x: left.x + .5 * left.unit, y: left.y });
  const observed = [];
  for (const time of [.8, 1.2, 1.6, 2]) {
    await mouse(ctx, "mouseMoved", { x: left.x + time * left.unit, y: left.y });
    observed.push(await ctx.run("Number(document.querySelector('[data-editor-playhead]').dataset.time)"));
  }
  await mouse(ctx, "mouseReleased", { x: left.x + 2 * left.unit, y: left.y });
// 松手后的书签先存为基准，旧媒体回执不允许改变它。
// 负向事件发生在真正暂停的媒体对象上，而非另建一个假的video实例。
// 事件名称是原timeupdate，能覆盖生产监听是否错误地无条件回写。
// 设置旧currentTime本身也可能异步发seeking事件，因此保留有界观察窗口。
// 这个观察窗口只等事件抵达，不通过定时器造出工程播放进度。
// 预期工程秒数保持不变，源局部时间临时不同是本反例故意制造的前置。
// 版本桥应区分用户定位命令与解码器状态通知，不能互相当成授权。
// 正常play随后必须重开回报闸门，否则原UI06真实播放断言会失败。
// pause的最终回执也不能被一并丢掉，所以不能简单用paused条件筛掉全部事件。
// 第一轮曾发现最终暂停同步失败，本回归保留真实播放用例防止修抖动退化。
// 错误修正后的完整套件需要重新执行，不能只引用前半组通过的日志。
// 超时或媒体拒绝属于失败，不会被本负向夹具转写为通过。
// 日志中的自动回执反例不能作为真实驱动卡顿或系统负载场景的人工证明。
// 窗口焦点变化引起的取消另由资源清理边界处理，不在本组伪造系统切出。
// 回到首片段后继续原时间线回归，确保这次反例未永久污染媒体生命周期。
  const saved = await ctx.run("Number(document.querySelector('[data-editor-playhead]').dataset.time)");
  await ctx.run("(()=>{const v=document.querySelector('[data-live-video]');v.pause();v.currentTime=.1;v.dispatchEvent(new Event('timeupdate'))})()"); await ctx.delay(150);
  ctx.smoke.check("Playhead drag is monotonic and paused stale media events cannot pull it backward", observed.every((time, index) => Math.abs(time - [.8,1.2,1.6,2][index]) < .07) && await ctx.run(`Math.abs(Number(document.querySelector('[data-editor-playhead]').dataset.time)-${saved})<.001`));
  await ctx.click(`[data-editor-clip="${id}"]`);
}

// 场景在既有真实两片段工程中连续运行，不用重载让实例独立问题消失。
// 每组恢复临时副本或竖屏安排，后续原LIVE仍能核对完整时间模型。
// 截图和数据来自同一最终静态构建，源码指纹前提由外层harness守住。

// 纯模型反证不创建媒体；输入被冻结，可检测函数偷偷改写原片段或共享变换对象。
// 这里只加载两个纯TS模块，不能把任意路径或用户文本交给Function执行。
// 字段定义来自生产源码，但预期值独立写明，不能用被测结果推导答案再验证自己。
// 纯模型测试读取当前源码，不依赖构建产物中的私有压缩变量。
// 外层真实Electron先校验构建指纹，所以源码与运行界面仍属于同一次产物。
// 转译只是去掉类型，实际执行的仍是生产模型函数。
// 允许的依赖只有字段模型，意外新增运行时依赖应立即失败。
// 受限require不允许任意文件或网络地址，不能把测试加载器当插件系统。
// 入口名是脚本内固定字符串，不来自用户文件名或模型描述。
// 模型只需类型导入的媒体接口，转译后不会加载React或Electron。
// 这保持纯计算测试与真实媒体生命周期测试的职责分开。
// 未知依赖抛错交给harness失败，不能返回空对象让测试悄悄跳过。
// 预期中心、范围和适配结果在断言独立写出，不从模型常量复制答案。
// 这里没有mock updateClipTransform返回值，函数必须真的执行。
// 只读测试对象保护不可变约定，界面层测试则观察可见实际效果。
// 纯模型通过不能证明媒体解码，所以报告中与真实视频用例分开计证据。
// 转译器来自项目已有TypeScript依赖，不额外安装测试框架。
// 模型测试本身不创建窗口，仍在同一个串行Electron套件内运行。
// 加载失败应阻止后续宣称整套通过，不能只打印诊断后继续。
function loadTransformModel() {
  const ts = require("../../apps/next/node_modules/typescript");
  const directory = path.join(__dirname, "../../apps/next/src/view/toolBox/Tool/video/editor");
  function load(name) {
    if (!["clip-transform-model", "editor-property-model"].includes(name)) throw new Error("Unexpected runtime dependency");
    const output = ts.transpileModule(fs.readFileSync(path.join(directory, `${name}.ts`), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const result = {};
    new Function("exports", "require", output)(result, request => load(request.replace("./", "")));
    return result;
  }
  return load("clip-transform-model");
}
// 冻结原片段和数组，发现被测函数直接排序或覆盖输入时会失败。
// transform也冻结，保护嵌套对象不能被原地补丁修改。
// 第二个实例使用相同assetId，明确检验同源但不同clip.id的场景。
// 图片类型不是视频后缀猜测，由asset.kind明确提供。
// 图片X100与旋转-45应被接受，说明负角度与非默认中心是真实值。
// opacity0必须保留为零，不能因逻辑或运算回落为100。
// 第二实例X仍为960，第一实例输入对象仍指向原transform。
// start0/end5同时检查，空间参数不能改工程时间。
// NaN反例检测有限性校验，不允许生成NaN百分比污染DOM布局。
// scale0反例检测退化几何拒绝，最小合法缩放不等于零。
// opacity101检测独立百分比上界，不能沿用X/Y的大坐标范围。
// speed补丁检测键白名单，编译类型不能替代运行时边界。
// 锁定V1后合法X也应拒绝，排除只有非法值恰好被挡住的假锁验证。
// audioOnly虽引用image测试素材仍应拒绝，安排通道优先排除画面能力。
// 返回null意味着整次拒绝，不接受部分修改后的数组。
// 竖屏360×640在横工程的宽607.5、高1080作为精确适配预期。
// 低分辨率320×180也适配为1920×1080，明确100%不是源像素一比一。
// 竖屏项目1080×1920中心X应为540，排除把960硬编码到所有项目。
// 这些图片断言证明数据与适配，不是磁盘图片导入或图片解码证据。
// 多轨透明度混合没有在此模型执行，opacity0只属于当前片段参数。
// 冻结输入不包含真实文件句柄，测试不会访问或修改用户媒体。
// 本组没有覆盖工程持久化版本，因为保存和导出仍明确未接通。
// 项目配置固定为正尺寸，非法项目设置应由将来的工程设置契约验证。
// 正反例组合避免只用默认值通过，却没有真正接通字段范围和实例身份。
function checkTransformModel(ctx) {
  const model = loadTransformModel(), project = { width: 1920, height: 1080, fps: 30, duration: 5 };
  const origin = Object.freeze(model.defaultTransform(project));
  const clip = Object.freeze({ id: "one", assetId: "image", track: "V1", start: 0, end: 5, sourceIn: 0, sourceDuration: 5, transform: origin });
  const input = Object.freeze([clip, Object.freeze({ ...clip, id: "two", transform: { ...origin } })]);
  const assets = [{ id: "image", kind: "image" }], changed = model.updateClipTransform(input, assets, "one", { x: 100, rotation: -45, opacity: 0 }, project, []);
  ctx.smoke.check("Canvas model: still-image transform supports negative rotation and zero opacity independently", changed?.[0].transform.x === 100 && changed[0].transform.rotation === -45 && changed[0].transform.opacity === 0 && changed[1].transform.x === 960 && input[0].transform === origin && input[0].start === 0 && input[0].end === 5);
  ctx.smoke.check("Canvas model: invalid, unsupported, locked and audio writes are rejected atomically", [{ x: NaN }, { scale: 0 }, { opacity: 101 }, { speed: 2 }].every(patch => model.updateClipTransform(input, assets, "one", patch, project, []) === null) && model.updateClipTransform(input, assets, "one", { x: 50 }, project, ["V1"]) === null && model.updateClipTransform([{ ...clip, audioOnly: true }], assets, "one", { x: 50 }, project, []) === null);
// 基础适配结果是连续项目像素，607.5无需按视频帧率取整。
// 若提前round成608，窗口放大后选框与源比例会出现持续误差。
// 图片和视频都可消费同一适配函数，但解码生命周期不能因此合并。
// 320宽与640宽的同长宽比源在100%时应占据相同项目比例。
// 这明确区分基础适配与源分辨率，避免用户切源后构图大小突变。
// 竖屏工程的中心同时应随宽高变化，不因桌面窗口横屏而继续用960。
// 工程中心只由项目尺寸决定，不随素材列表当前高亮或主题改变。
// 函数没有DOM输入，测试不需要模拟窗口宽度才能得到确定项目结果。
// 屏幕缩放留给渲染层，模型测试不会把项目像素换算为CSS像素保存。
// 竖屏适配留边不是把源裁成横屏，而是整个源在项目中完整可见。
// 旋转随后围绕该基础盒中心执行，不因旋转90度自动重算contain。
// 将来的导出应消费相同参数，但当前没有输出比对证据。
// 本组预期是数字，不将这些数字画成假截图来冒充实际媒体呈现。
// 浮点精度只在字段提交按定义处理，基础几何不应无端截断。
// 此处的精确相等适用于所选整除/二分输入，不推广为任意浮点都可精确比较。
  const portrait = model.fittedSize(360, 640, project), small = model.fittedSize(320, 180, project);
  ctx.smoke.check("Canvas model: 100 percent contain uses project pixels for every source size", portrait.width === 607.5 && portrait.height === 1080 && small.width === 1920 && small.height === 1080 && model.defaultTransform({ ...project, width: 1080, height: 1920 }).x === 540);
}

// 专项入口只编排场景，不在这里修补产品状态以迎合预期。
// 纯模型先运行，若数值契约已错，不必再以视觉截图掩盖数据层问题。
// 随后读取实际两片段id，避免用固定UUID只在某一次运行中碰巧成功。
// 字段组把画面调整为非默认状态，后续拖动正是在该复杂构图上继续。
// 复制组依赖已提交位置，能检查数值跨命令继承，而非每组重建默认工程。
// 锁与重置组恢复默认，竖屏组才能独立检查contain基础几何。
// 竖屏组结束清理临时安排，原横屏两段关系不被本专项破坏。
// 播放头组放在最后，最后选择首段恢复原UI06的书签前置。
// 这条顺序避免每个测试都重载页面而漏掉状态清理问题。
// 真实文件由外层生产探测，不在helper中注入成功元数据。
// helper不拥有窗口退出权，失败码与看门狗继续由外层harness负责。
// 异常向外冒泡后保存日志，不能在本层catch后假报全部通过。
// 截图目录从外层传入，确保真实帧与原LIVE证据存放在同一次运行下。
// 公共组件回归在另一个串行套件执行，不能同时开多个Electron冒烟抢锁。
// 本专项不自行改变原生主题设置，避免影响用户应用或其他测试窗口。
// 不创建新的IPC通道，不需要绕过preload去读用户文件。
// 来自纯模型的断言与真实视频的断言都在日志中有明确不同名称。
// 桌面手工项不会因为这组自动通过而从待验变为通过。
// 静态图片数据支持只记录为模型证据，真实播放证据只属于本地视频。
// 没有多源同屏用例，因此不会报告多轨不透明度合成已经完成。
async function checkVideoCanvas(ctx) {
  checkTransformModel(ctx);
  const [first, other] = await ctx.clips();
  await checkFields(ctx, first.id); await checkDrag(ctx, first.id, other.id);
  await checkCopy(ctx, first.id); await checkLockAndReset(ctx);
  await checkPortraitAndSource(ctx, first.id); await checkPlayhead(ctx, first.id);
}
module.exports = { checkVideoCanvas };

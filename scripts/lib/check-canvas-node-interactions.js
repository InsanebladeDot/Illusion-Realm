// 在既有静态导出 Electron 窗口验证卡片手势，不启动第二个应用或操作用户桌面。
// 鼠标和键盘由 sendInputEvent 注入，属于自动验证，不写成人工验收。
// 断言读取实际计算样式和参数 DOM，不直接改 React 的选择或工程数据。
// 此模块依赖外层先创建文本、图片、视频和音频四种卡片。
// 它不自行渲染测试专用 NodeFixture，也不调用 reducer 插入样例对象。
// video 选择器指第一张视频节点，用于接续原拖动回归的同一对象。
// 这张卡片此时没有导入内容，避免媒体控件抢走按压测试的输入焦点。
// 真正媒体外壳另在后面的主题场景检查，不把空卡等同于已解码视频。
// 等待使用主进程计时，不依赖离屏窗口的 requestAnimationFrame 才能结束。
// 每段等待是给输入和有限 CSS 过渡留调度时间，不修改产品的加载状态。
// 条件等待与总超时仍由外层 harness 控制，失败不无限重试。
// 断言失败会保留非零退出码，即便后续场景继续收集了其他通过证据。
// 所有文件路径与窗口所有权仍属于外层临时测试环境。
// 不读取用户当前画布，不把测试节点保存到用户真实作品目录。
// 本文件的固定中文选择器对应已设为 zh-CN 的隔离会话。
// 它们不是新增的用户界面硬编码文案，也不参与产品语言切换逻辑。
// 若产品翻译名称变更，需要审查测试入口，不应换成访问 React 私有状态。
// 新断言与原连接校验共享实际页面，重复边和循环规则的旧检查没有被删除。
// 长按收起后会改变节点测量高度，后续端口场景重新测点来覆盖这个布局变化。
// 参数占用空间缩小不会被当成节点内容被删，图中四类卡片仍由旧回归约束数量。
// 微交互不创建新的历史事务，后面的工程撤销场景继续检验命令序列可用。
// 单纯生成了截图不能算通过，日志必须包含对应的状态或几何断言。
// 相反，状态通过也不能证明视觉舒适度，截图仍需单独查看浅框是否足够轻。
// DOMMatrix 接收 Chromium 绘制矩阵，其角度方向遵循屏幕 Y 轴向下的坐标系。
// 正的九十度对应右向箭头转到向下，因此选 b 为正一而不是负一。
// 本轮不验证其他旋转图标，避免把节点箭头需求扩大到全站控件。
// 对角度使用接近一的判断，允许浏览器浮点计算产生极小的余弦尾数。
// 不接受零度矩阵作为“动画开启”，开启必须同时有参数和正确朝向。
// 移动端口的二维差使用 hypot，不因为只有水平样例就放弃约束纵向上限。
// 二十像素测试点以当前矩形半径为前提，原端口尺寸变更时需要审查这一用例。
// 如果未来把端口变得非常小，应调整取样入口，而不是放宽十五像素上限。
// 倾斜截图只代表某一接近位置，不宣称覆盖了所有鼠标轨迹或所有硬件刷新率。
// 鼠标事件是 Electron 原生注入，但离屏窗口依然不等于用户实际桌面操作。
// 软件渲染的性能结果也不能用于推算用户 GPU 的多视频播放负载。
// 减少动态的最终断言关注实际是否写位移，不从 CSS 查询字样存在推导行为通过。
// 任一媒体查询恢复失败将向外抛错，不能在 finally 中悄悄忽略模拟环境异常。
// 容器外的导航按钮没有成为手势目标，测试不会因为误点导航离开画布而继续通过。
// 选择器消失会使下一次真实读取失败，防止页面已切走仍复用旧快照判断成功。
// 本模块没有截取或上传用户图片，所有截图只写入外层随机证据目录。
// 将截图复制进任务文档目录是交付整理，不是产品新增的工程导出能力。
// 当前测试结论仅针对本轮构建指纹对应的静态导出，不能转移到过期安装包。
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const video = '[data-kind=video]';
const arrow = `${video} button[aria-expanded]`;

// 点位包含镜头缩放；测试不用旧导航宽度或节点世界坐标猜屏幕位置。
// getBoundingClientRect 给出视口坐标，正好可以交给 Electron 的鼠标注入入口。
// 取中心避免一像素边线的抗锯齿影响命中判断。
// dx、dy 只用于在固定端口附近取样，不把它们直接写进产品 CSS 变量。
// 坐标四舍五入符合 sendInputEvent 的整型屏幕输入要求。
// selector 只来自用例常量，不拼接用户文件名或网络返回内容。
// 返回值不包含 DOM 对象，主进程不跨进程保存已失效的元素引用。
// 每次取点重新测量，因此参数展开后布局变化也能得到新的实际点位。
// 若目标不存在，DOM 读取直接失败，不能以默认零坐标冒充一次有效点击。
// 这里没有调用和生产相同的跟随计算，避免用同一个算法互相证明自己正确。
async function position(ctx, selector, dx = 0, dy = 0) {
  return ctx.run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2+${dx}),y:Math.round(r.y+r.height/2+${dy})}})()`);
}

// 保持指针不动超过阈值，专门反证“只有实际位移才算拖动”的错误实现。
// 前提是上一步通过正式按钮打开了视频参数，长按后必须真正移除这份表单。
// 先发 mouseMove，把实际命中位置移到标题图标，而不是沿用上一段测试的鼠标位置。
// 按下和松开使用相同点位，排除发生了四像素移动才触发收起的可能。
// 三百二十毫秒明显超过产品长按门槛，但远低于整轮看门狗，不掩盖卡死。
// 松手后再留调度时间，让浏览器补发 click；这能发现迟到 click 把参数重新打开。
// 只测试左键，右键菜单属于下一项独立场景，不能混为同一次按压。
// 这不是实体鼠标记录，不能据此宣称触摸板或触屏的长按手感已经人工验收。
// 测试没有设置 panelActive，没有手动触发业务的 startDrag 或 stopDrag。
// 成败来自产品正常事件传播后的真实 DOM。
// 若测试超时，外层会保存非零失败，不把长按等待解释成“环境跳过”。
async function hold(ctx, selector) {
  const point = await position(ctx, selector);
  ctx.win.webContents.sendInputEvent({ type: "mouseMove", ...point });
  ctx.win.webContents.sendInputEvent({ type: "mouseDown", ...point, button: "left", clickCount: 1 });
  await delay(320);
  ctx.win.webContents.sendInputEvent({ type: "mouseUp", ...point, button: "left", clickCount: 1 });
  await delay(120);
}

// 两次切换应顺时针转到九十度再归位，面板实际有无也须一致。
// 第一次短按标题恢复明确选择，避免上一场景停留在手掌或其他节点的焦点上。
// 初始面板应打开，随后点击箭头得到收起态，所以顺序本身也约束了点击入口。
// 使用 aria-expanded 定位实际按钮，不选参数表单里无关的模型或比例胶囊。
// 等一百八十毫秒超过箭头 CSS 过渡时间，读到的是最终朝向而非动画中间态。
// DOMMatrix 的 a 接近一表示右向图标未旋转，不直接比较某个内联角度字符串。
// 打开时检查 b 接近正一，能区分顺时针九十度和方向相反的负九十度。
// 同时检查原引用编辑器存在，防止图标转了而实际输入面板仍没有打开。
// 收起时反向检查原引用编辑器不存在，防止只是视觉隐藏留下不可见 Tab 目标。
// 键盘测试先把焦点放到真实按钮，再发送 Enter，不使用 DOM.click 代替键盘默认行为。
// 这样能检测图引擎父级把 Enter 当成节点选择而让按钮失去焦点的集成问题。
// 如果只检查 onClick 回调，无法发现这一类真实事件顺序冲突。
// 长按发生在同一张已选中卡上，验证不会因为 selected 已经为真就跳过识别。
// 长按之后再来一次短按，应重新打开同一份参数，不能把卡片永久锁死在拖动状态。
// 后续用箭头再次收起，为右键场景建立确切的关闭前提。
// 右键只打开现有菜单，不应该作为“非长按”分支打开提示词。
// Escape 关闭菜单之后再读参数，可发现菜单期间偷偷挂出的输入区。
// 右键菜单本身的条目与业务回归由原工程 helper 负责，这里只验证参数隔离。
// 截图在右键关闭后拍摄，保留最终收起状态，不能用动画中间画面代替断言。
// 短按和长按使用相同标题图标，区别只来自持续时间与移动，避免目标差异混淆结论。
// 标题图标为 SVG，顺便覆盖识别器不能只接受 HTMLElement 的边界。
// 原来已输入的提示词不在此更改，隔离数据归属仍由既有编辑回归检查。
// 每个步骤等待外层公共 click 或 key 完成，不并发发出相互覆盖的键鼠输入。
async function checkPress(ctx) {
  await ctx.pointer(`${video} header>svg`);
  // 初始短按也能发现前一场景 dragStop 清理没有释放输入的回归。
  // 第一张视频只有一个面板箭头，若错选到复制节点，后续作用域会找不到参数。
  // 不通过 count>0 放宽目标要求，所有表单读数都限定在同一 video 作用域。
  await ctx.click(arrow);
  // click 走组件绑定的真实回调，不能用修改 expanded 属性来让角度断言自证。
  // 参数由 React 挂载和卸载，DOM 没有被测试脚本 remove 或 append。
  await delay(180);
  ctx.smoke.check("Collapsed arrow points right and form is absent", await ctx.run(`!document.querySelector('${video} [contenteditable]')&&new DOMMatrix(getComputedStyle(document.querySelector('${arrow} svg')).transform).a>.99`));
  await ctx.run(`document.querySelector('${arrow}').focus()`);
  // focus 是测试前提，真正的键盘激活仍由 Electron 的 keyDown/keyUp 完成。
  // 若按键被父级消费，默认 click 不会出现，后面的引用编辑器断言会失败。
  // 因此这项专门覆盖画布与子按钮一起工作时的集成，不只是孤立组件单测。
  await ctx.key("Enter");
  // key 帮手不会替本模块调用按钮 click，也不把按键转换成 reducer 操作。
  // 父图引擎的选择行为仍真实运行，产品必须自己正确隔离这个控件。
  await delay(180);
  ctx.smoke.check("Keyboard opening rotates arrow clockwise 90 degrees", await ctx.run(`!!document.querySelector('${video} [contenteditable]')&&new DOMMatrix(getComputedStyle(document.querySelector('${arrow} svg')).transform).b>.99`));
  // 单独保留展开图，便于与长按收起截图对照右上角箭头和输入区。
  // 不复用只有卡片的旧截图来声称已经确认新的旋转方向。
  // 抓图发生在实际角度断言之后，动画未结束的中间帧不会被当作最终状态。
  await ctx.shot("33-node-arrow-expanded");
  await checkLongPressAndContext(ctx);
}

// 长按与右键属于非编辑手势，集中核对不会打开引用输入，继续沿用同一视频实例。
// 与前面的短按/键盘开合分开，失败能明确指向按压识别还是原生按钮激活。
async function checkLongPressAndContext(ctx) {
  await hold(ctx, `${video} header>svg`);
  // 长按之后应关闭整个输入区域，而不只是让引用编辑器失焦。
  // 如果实现用 blur 代替隐藏，输入 DOM 仍存在，这个断言会失败。
  // 若实现只检查鼠标位移，本测试保持静止，同样会暴露错误。
  ctx.smoke.check("Stationary long press does not open parameters", await ctx.run(`!document.querySelector('${video} [contenteditable]')`));
  await ctx.pointer(`${video} header>svg`);
  // 新一轮短按不能沿用上一轮 moved=true，否则用户将无法再次正常编辑。
  // 不通过刷新页面“修复”按压记录，必须在同一次组件挂载中恢复。
  ctx.smoke.check("A later short press reopens the same card", await ctx.run(`!!document.querySelector('${video} [contenteditable]')`));
  await ctx.click(arrow);
  const point = await position(ctx, `${video} header>svg`);
  // 右键采用 mouseDown 和 mouseUp 两个事件，符合原生 contextmenu 产生条件。
  // 不发送左键 click，也不使用 event.button 默认零值的 DOM 事件蒙混测试。
  for (const type of ["mouseDown", "mouseUp"]) ctx.win.webContents.sendInputEvent({ type, ...point, button: "right", clickCount: 1 });
  await delay(120);
  await ctx.key("Escape");
  // 菜单退出复用原页面焦点恢复，参数状态不应因为菜单关闭自动改变。
  // 这里的 Escape 不是撤销展开动作，错误展开不能被测试主动修正后再判通过。
  ctx.smoke.check("Right click leaves the parameter panel closed", await ctx.run(`!document.querySelector('${video} [contenteditable]')`));
  await ctx.shot("29-node-long-press");
}

// 用屏幕位移测量端口跟随，而不是只检查产品里写了十五这个常量。
// 外壳坐标必须不变，证明装饰没有把 React Flow 的连线锚点挪走。
// 此时镜头沿用前面的真实缩放操作，不假设比例正好是一。
// 在端口中心右侧二十五屏幕像素处采样，其中包含小圆本来的半径。
// 采样点处于边缘外二十像素以内，应该触发弱跟随，而不是必须压在线上。
// 视觉 span 的矩形与真实 Handle 的矩形分开读，测得二者在屏幕上的实际差值。
// 下限大于两像素，避免实现完全没有动却靠上限断言通过。
// 上限检查二维长度，不能横纵各十五像素而让对角线实际超过限制。
// 零点一像素容差只处理浏览器子像素布局，不放宽到可以肉眼看出超标的范围。
// 产品只写局部像素时，缩放后可能超出十五屏幕像素，这个独立测量会拒绝它。
// 开始连线使用已有文本 source Handle 的语义 click，不注入 connecting=true。
// 文本到视频是已有图模型允许的引用方向，不拿业务禁止方向制造倾斜状态。
// 指针再移到视频 target，测试接收端附近的三维反馈，而不是起点自己的摆动。
// 计算样式需要 matrix3d，只有二维平移或静态封面不会满足这一条件。
// 真实 Handle 的矩阵仍为单位矩阵，说明倾斜没有施加在连线逻辑坐标层。
// 此处不放下连线，因此图中边数量不应因悬停被自动增加。
// Escape 走正式取消入口，后续原连接、复制和删除回归仍能继续使用这份图。
// 指针移到窗口角落，专门触发离开端口，而不是测试脚本直接调用 resetMotion。
// 等待超过过渡时长后读取变量清理，防止只改类名却遗留内联追随位置。
// 角度与端口位移分别检查，两者清理不能只完成其中一部分。
// 截图保留未放下时的倾斜，连线成功与否仍由原有生产校验场景判定。
// 该项属于自动鼠标与语义连接混合证据，不写成实体鼠标拖线已验收。
async function checkMotion(ctx) {
  const selector = `${video} .target`;
  const center = await position(ctx, selector);
  // 端口中心记录在跟随开始之前，后续不以移动后的圆圈反算采样起点。
  // 若测量起点也追着视觉层移动，会错误地把漂移抵消，掩盖锚点被移动的问题。
  // 本场景只移动鼠标，没有修改节点世界坐标，后续原时间历史仍可使用。
  ctx.win.webContents.sendInputEvent({ type: "mouseMove", x: center.x + 25, y: center.y });
  await delay(200);
  // 两百毫秒超过一百毫秒的圆圈过渡，避免中途位置刚好落在上限内导致假通过。
  // 测量时使用完整屏幕矩形，CSS 局部 transform 的数值不会被误当成屏幕像素。
  // 端口边线本身仍可见，本断言不通过隐藏圆圈来消除超限。
  ctx.smoke.check("Port reacts inside the 20px perimeter with at most 15px displacement", await ctx.run(`(()=>{const e=document.querySelector('${selector}'),a=e.getBoundingClientRect(),b=e.firstElementChild.getBoundingClientRect();return b.x-a.x>2&&Math.hypot(b.x-a.x,b.y-a.y)<=15.1})()`));
  await ctx.click('[data-kind=text] .source');
  // 既有 source 回调和图库点击连线状态都会执行，不绕过其中任一层。
  // 视频的输入端与 source 属于不同节点，因此满足目标反馈的身份前提。
  // 此处只开始连接，不接受已有边的数量作为倾斜生效的替代证据。
  ctx.win.webContents.sendInputEvent({ type: "mouseMove", ...center });
  await delay(220);
  // 取样时间超过卡片倾斜过渡，使 matrix3d 来自实际最终绘制效果。
  // 如果误把属性写在 article 而内容板没有消费，板的矩阵不会发生预期变化。
  // 如果误把 Handle 自身也旋转，单位矩阵检查会发现逻辑命中层受到污染。
  // 同时读取内容层与端口层，比只检查 CSS 变量存在更能发现集成选择器错误。
  ctx.smoke.check("An incoming connection tilts only the video content plate", await ctx.run(`getComputedStyle(document.querySelector('${video} .hy-node-card')).transform.startsWith('matrix3d')&&new DOMMatrix(getComputedStyle(document.querySelector('${selector}')).transform).isIdentity`));
  await ctx.shot("30-node-connection-tilt");
  // capturePage 由真实 Electron 渲染器产生，不使用 HTML 转图片工具重画节点。
  // 画面中的工具条与卡片来自正式路由，截图不是孤立的设计样板。
  await ctx.key("Escape");
  ctx.win.webContents.sendInputEvent({ type: "mouseMove", x: 4, y: 4 });
  await delay(230);
  // 移开后不仅检查视觉回正，也检查没有继续持有旧内联偏移作为下一次起点。
  // 清空属性由生产监听完成，测试不调用 element.style.removeProperty。
  // 不把进入另一个节点当成永久保留当前倾斜的理由，原卡必须自行收尾。
  ctx.smoke.check("Escape and pointer leave reset all visual displacement", await ctx.run(`document.querySelector('${video}').style.getPropertyValue('--node-tilt-y')===''&&document.querySelector('${selector}').style.getPropertyValue('--port-x')===''`));
}

// 统一入口延续原场景已有节点，不制造第二套页面或假媒体结果。
// 先查按压再查跟随，确保长按定时器已结束，不让测试自身制造并发输入歧义。
// helper 不控制整个 Electron 的退出，所有结论由外层共同汇总。
// 任何异常向上传播，不能为收集截图而吞掉失败继续标记通过。
async function checkCanvasNodeInteractions(ctx) {
  await checkPress(ctx);
  await checkMotion(ctx);
  // 返回进入本组时的“视频参数打开”前提，后续音视频模式隔离测试才有可读控件。
  // 本组故意按箭头显式折叠，普通短按尊重折叠意图，不应指望后续点击偷偷取消它。
  // 通过真实箭头恢复，而不是修改测试预期或把字段不存在当作模式隔离通过。
  // 这个收尾只还原测试自身的展示副作用，不改变提示词、模式或节点业务数据。
  // 只有最后已关闭时才点开，避免无条件切换把原本打开的面板又关掉。
  await ctx.pointer(`${video} header>svg`);
  if (await ctx.run(`document.querySelector('${arrow}').getAttribute('aria-expanded')==='false'`)) await ctx.click(arrow);
}
module.exports = { checkCanvasNodeInteractions };

// 媒体回归留下的真实视频通过同一个外壳显示，浅深两种主题各拍一次。
// 前提来自原媒体与工程往返测试：当前节点已引用生产解码器打开的 MP4。
// real 选择器要求含真实媒体预览，不能误选前面用于手势测试的空视频卡。
// 使用“适配全部”的现有按钮让导入后的节点回到可见画布，不手写镜头 transform。
// 点击真实卡片标题选择它，而不是直接给 DOM 贴 data-selected=true。
// 边线宽度来自浏览器计算样式，旧资料的两像素规则如果漏覆盖会直接失败。
// 同时要求 boxShadow 为 none，防止一像素边框外仍有一圈阴影变相加粗。
// 浅色主题由前面的正式菜单操作建立，这里不另建测试专用 CSS 主题开关。
// 两张主题截图都包含相同的工程节点，换主题不应重建或丢弃媒体内容。
// 深色切换使用应用现有主题入口和 nativeTheme 信号，不往 document 直接写颜色。
// 等待真正的媒体查询结果，不能只等侧边栏选项高亮就截图旧配色。
// closeAppearance 只关闭主题菜单，使其不会覆盖节点和下方参数区域。
// reduced-motion 使用 CDP 的媒体特征模拟，属于自动环境覆盖，不是 Windows 设置实测。
// 模拟完成后等待 Hook 订阅读取新 matches，避免在旧监听未清理时提前下结论。
// 指针落到端口附近但不按下，单独检查“减少动态”是否真的停止位移计算。
// 空变量表示 Hook 没有继续写追随位移，不能只靠 transition:none 假装不动。
// 恢复媒体特征为空集合，把之后的用例交还给正常系统媒体决议。
// 这一步不启动视频播放，既有媒体 helper 已单独检验真实 currentTime 的推进。
// 截图中的视频帧证明导入内容仍在，不能由此宣称本模块验过所有视频格式。
// 窄窗口在原画布回归覆盖，此处只增加本轮改变的选框与减少动态边界。
// 系统显示缩放、触控板反馈、人工视觉舒适度仍保留待验，不从自动视口推导通过。
async function checkCanvasNodeVisuals(ctx) {
  const real = '[data-canvas-node]:has([data-canvas-media=video])';
  // :has 绑定真实媒体容器，避免仅凭标题中含“视频”两个字来猜节点类型。
  // 媒体容器仍由生产导入后的 data.media 驱动，测试不临时插入 video 元素。
  // 工程往返已经删除旧素材目录，当前帧依赖重新导入的受管真实文件。
  await ctx.click('[data-canvas-viewport] [aria-label="适配全部"]');
  await ctx.pointer(`${real} header>svg`);
  // 选择只用于让选框规则进入被测状态，不改变视频的原始尺寸或像素颜色。
  // 本轮要求边框接近无感，所以宽度与阴影作为稳定契约，具体色值留给截图审查。
  // 不锁定 RGB 精确常量，避免测试和 CSS 复制同一数字却不能说明实际视觉。
  ctx.smoke.check("Real video uses the same thin selected border", await ctx.run(`(()=>{const s=getComputedStyle(document.querySelector('${real} .hy-node-card'));return s.borderTopWidth==='1px'&&s.boxShadow==='none'})()`));
  await ctx.shot("31-node-real-video-light");
  // 浅色截图在原主题切换完成后拍摄，不能通过后期提亮深色截图伪造。
  // 文件名与截图内容对应，后续文档可以明确链接到本轮独立证据。
  await ctx.click('[data-theme-trigger]');
  await ctx.wait("document.querySelector('[data-theme-option=dark]')");
  await ctx.click('[data-theme-option=dark]');
  // 当前主题属于隔离用户文档，切换不会改变用户正在使用的正式窗口配置。
  // 主题变更仍经过生产 IPC，本测试没有 stub 一个恒真的 matchMedia 结果。
  await require("./sidebar-menu-fixture").closeAppearance(ctx.run);
  await ctx.wait("matchMedia('(prefers-color-scheme:dark)').matches");
  await ctx.shot("32-node-real-video-dark");
  // 深色截图保留同一真实素材，能够对照两种主题下边框的分层程度。
  // 不是用新建空图代替深色节点，从而绕过真实媒体和选中状态组合。
  await ctx.win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await delay(180);
  // 减少动态在组件保持挂载时切换，验证订阅能拆掉旧鼠标监听而不是仅首帧有效。
  // 若只在初次 render 读一次媒体查询，下面鼠标移动仍会写入端口位移并失败。
  const center = await position(ctx, `${real} .target`, 12);
  ctx.win.webContents.sendInputEvent({ type: "mouseMove", ...center });
  // 偏移十二像素在正常跟随范围内，选择它避免“根本没进范围”造成不动的假通过。
  // 固定 Handle 的命中区仍然可用，减少动态不能把连接入口一起禁用。
  await delay(150);
  ctx.smoke.check("Reduced motion disables actual pointer displacement", await ctx.run(`document.querySelector('${real} .target').style.getPropertyValue('--port-x')===''`));
  await ctx.win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [] });
  // 恢复动作不声称验证了用户系统设置，只保证本用例没有遗留模拟媒体条件。
  // 窗口最终销毁继续由外层 finally 负责，不在本模块提前结束整个冒烟。
}
module.exports.checkCanvasNodeVisuals = checkCanvasNodeVisuals;

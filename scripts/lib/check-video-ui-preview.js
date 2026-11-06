/**
 * UI-04 预览回归沿用主套件的隔离窗口、生产桥和 app:// 静态导出。
 * 测试像切换监看器的节目单：只换片段引用，不移动素材货架上的高亮标签。
 * 图片、时间码和画布比例从真实 DOM 读取，不访问 React 内部状态。
 * 所有状态通过页面显式场景按钮进入，不直接改 CSS 或禁用属性自证。
 * 黑场、等待、失败与空态分别验证，不能用一个占位元素替代全部预期。
 * 截图来自 capturePage，既不重新生成设计图也不裁掉溢出问题。
 * 本脚本不初始化视频播放器，不读用户素材，也不创建工程文件。
 * 外层零业务计数保证点击禁用按钮不会泄漏导入、处理和播放请求。
 */
const fs = require("node:fs"), path = require("node:path");
// preview 样板与原 UI-02/UI-03 A/B 使用不同数据标记，不能跨组误匹配。
// 作用域由固定测试常量构造，不包含用户文件名或外部 URL。
// 同名素材在两个实例都有，所有定位必须先限制实例身份。
const scope = id => `[data-editor-preview-sample=${id}]`;
// 预览状态标记由公共 ProgramPreview 输出，样板本身不能伪造这份结论。
// panel 用于读取图像、时间码和返回按钮，不从其他组件猜当前预览状态。
// 状态变化保持相同面板实例，可发现图片失败记忆是否错误串到另一个实例。
const panel = id => `${scope(id)} [data-editor-region=R03]`;

// 片段按钮通过真实 onClick 改局部选中 ID，再由 ProgramPreview 映射资源。
// 按索引定位使用固定五项演示片段顺序，文件名变化不应影响身份。
// 点击之后等待 React 提交，不用直接调用预览组件或改 data 属性。
// 条件判断在调用方读取真实结果，点击完成本身不算断言通过。
async function clip(ctx, index) {
  // 固定集合包含两个视频、一个图片和两份音频，不能按类型只取第一个匹配项。
  // 每次操作都限定 A，后续 B 不变是对状态共享错误的反证。
  // 文件名只用作用户可见标签，身份切换由按钮绑定的 clip.id 决定。
  // 不从样板按钮 pressed 推断封面正确，还要读取公共预览 img 的 alt 和时间。
  // 这能发现按钮已经变色但预览仍写死 scene-02 的实现。
  // 本轮不拖动轨道内容，也不派发 pointermove 来冒充片段修剪。
  // 选择动作不会改变工程 duration，时长仍由演示项目参数给出。
  // 短暂提交等待没有自动重试；错误结果会保留到下一条断言中。
  await ctx.run(`document.querySelectorAll('${scope("A")} [data-preview-clip-choices] button')[${index}].click()`);
  await ctx.delay(60);
}
// 场景定位用内部稳定键，不依赖当前语言的长状态文案。
// broken 场景必须再等真实图片错误回落，不能把点击按钮当成缺图成功。
// 这里的短等待只处理本地状态提交，没有网络或媒体解码超时重试。
// 切 ready 是显式恢复演示输入，不声称已经修复了用户损坏文件。
async function scenario(ctx, name) {
  // 场景按钮有稳定 data 键，翻译变化不会让脚本点错“加载”或“缺图”。
  // 这与片段按钮分成两个组，不把数据来源和故障状态混在一个选择器里。
  // 切 missing 不直接传 state=missing，因此能暴露资源引用查找的实际问题。
  // 切 broken 不伪造 onError，图片坏字节应由浏览器正常尝试解码。
  // error 夹具不建立网络请求，所以测试不能声称覆盖真实超时或断网恢复。
  // ready 仍复用相同组件实例，不通过重新挂载清掉错误来掩盖状态管理缺陷。
  // 如果正常封面恢复失败，后续 naturalWidth 等待会明确超时，不继续截旧图。
  // 场景切换是演示页的显式行为，产品默认工作区不出现这组按钮。
  await ctx.run(`document.querySelector('${scope("A")} [data-preview-scenario=${name}] button').click()`);
  await ctx.delay(60);
}
// 有限合成等待避免截图取得上一帧主题转场或场景切换的像素。
// 文件名由测试提供且只写隔离目录，不覆盖用户图片或设计基准。
// 图片写入成功不抵消之前的断言失败，最终结果仍归外层 harness。
// 截图保留窗口真实尺寸与宿主导航，不放大缩小来伪造断点验收。
async function shot(ctx, name) {
  // 默认图与样板图使用不同文件名，交付时能区分工程与故障演示。
  // A/B 样板的画布比例不同，截图必须保留两列，不能只截正常的 A。
  // 失败时输出仍保留，人工可以核对哪个实例或状态没有正确回落。
  // 页面滚动位置由调用方决定，本函数不偷偷滚到默认画面来让截图好看。
  // 写 PNG 属于测试产物，不是节目帧导出，不能算业务导出接通。
  // 不执行图片缩放或滤镜，运行像素直接反映实际主题与状态外观。
  await ctx.delay(200);
  fs.writeFileSync(path.join(ctx.root, `${name}.png`), (await ctx.win.webContents.capturePage()).toPNG());
}
// 主题使用应用真实外观菜单，不给根元素加 .dark 或手工改色值。
// 等转场结束后关菜单，再观察同一个预览实例的参数和错误状态。
// mode 限于内部 light/dark 常量，不接受用户输入作为 CSS 或脚本。
// 媒体内容不随主题换资源，画布也不对封面加反色滤镜。
// 等待由外层主进程计时兜底，隐藏窗口仍可结束。
// 本函数不重载页面，不能靠卸载实例掩盖主题切换导致的状态丢失。
// 菜单关闭也有明确条件，截图不能拿着遮住画面的菜单声称完整验收。
async function theme(ctx, mode) {
  // 这里等待 data-theme 是原有主题决议的结果，不直接修改该属性。
  // 前一主题菜单必须已关闭，否则第一次 click 会关闭它而不是打开新菜单。
  // 选项出现由 wait 判断，不依赖假设菜单动画永远在固定毫秒内结束。
  // 动画结束后再保存像素，避免把转场掩膜边界误当成布局错误。
  // 状态保持由后续片段 ID 和帧尾断言验证，主题开关完成不算独立性证明。
  // 主题改变不应把 B 的 24fps 改回 A 的 30fps。
  // 这组检查没有读系统缩放设置，100% CSS 视口不能冒充多 DPR 验证。
  // 用户真实偏好不受影响，菜单只写本测试隔离游客数据。
  await ctx.run("document.querySelector('[data-theme-trigger]').click()");
  await ctx.wait(`document.querySelector('[data-theme-option=${mode}]')`);
  await ctx.run(`document.querySelector('[data-theme-option=${mode}]').click()`);
  await ctx.wait(`document.documentElement.dataset.theme==='${mode}'&&!document.documentElement.classList.contains('theme-ripple')`);
  await ctx.run("document.querySelector('[data-theme-trigger]').click()");
  await ctx.wait("!document.getElementById('appearance-popover')");
}

// 两实例默认都选 clip-02，但 B 使用竖屏 24fps 与四分之一秒帧尾。
// 读取画布矩形比值，能发现 CSS 写了 aspect-ratio 却实际被父层拉伸的错误。
// A 选 clip-01 应显示 scene-01 封面和两秒工程位置，不能沿用 scene-02。
// B 继续保持 clip-02、12 秒 06 帧，证明参数与选择没有串状态。
// 随后选 A 的素材背景，节目仍必须显示 clip-01，不能拿素材选择代替片段。
// A 选图片片段后素材高亮仍是前一步背景，此处继续检查 B 原状态不受影响。
// 音频片段没有画面应有明确提示，不回退成上一次视频封面。
// 片段总数仍为五项，样板选择不是向主工程追加片段。
// program 时间展示工程位置，图片片段 20 秒起点加两秒应为 22 秒。
// selectedClip 与 selectedAsset 的变化从 ARIA 读取，不信任内部变量名称。
// 所有验证通过相同 ProgramPreview 的实际参数，默认页面也使用该公共实现。
// 音频提示不代表音频文件缺失；data 状态应是 audio 而不是 missing/error。
// 不检查媒体文件磁盘存在，因为本轮输入只有固定随包封面。
// 这组不验证时间轴剪辑命令，正式时间轴仍保持只读 clip-02。
// 两个实例虽共用静态资源，选择和失败缓存仍必须彼此隔离。
// 图片采用 contain，竖屏 B 不应该裁掉横向源封面两侧。
// 全部时间码都是暂停样例，没有通过计时器制造假播放进度。
async function mapping(ctx) {
  // A 初始 clip-02 在十秒开始，选 clip-01 后当前工程时间应回到两秒。
  // 不靠预览 img 节点引用判断切换，节点可复用但 src/alt 必须体现新素材。
  // 素材背景行被选中后，A 仍应引用 clip-01，而非自动选入 clip-bg。
  // 图片片段时间取 20+2=22 秒，不把图片 duration=null 当成零秒节目。
  // B 的素材高亮继续为 scene-02，A 的素材选择不能污染另一个实例。
  // 音频没有封面时必须卸载 img，防止上一次视频画面残留在底层。
  // 同时读音频提示文字，不能只靠隐藏图片就声称音频状态可理解。
  // 横屏与竖屏的比例容差小于百分之一，允许布局小数像素舍入。
  // ratio 从 frame 而不是整个中性 surface 读取，外层留边本就不是项目画布。
  // 帧尾检查 06 能发现把 24fps 当作毫秒或写死 30fps 的错误。
  ctx.smoke.check("Preview maps project ratios and 24fps frame tails from parameters", await ctx.run(`(()=>{const a=document.querySelector('${panel("A")} [data-editor-preview-frame]').getBoundingClientRect(),b=document.querySelector('${panel("B")} [data-editor-preview-frame]').getBoundingClientRect();return Math.abs(a.width/a.height-16/9)<.01&&Math.abs(b.width/b.height-9/16)<.01&&document.querySelector('${panel("B")} b').textContent==='00:00:12:06'})()`));
  await clip(ctx, 0);
  ctx.smoke.check("Selected video clip maps to its own cover and project time without changing B", await ctx.run(`document.querySelector('${panel("A")} img').alt.includes('scene_01.mp4')&&document.querySelector('${panel("A")} b').textContent==='00:00:02:00'&&document.querySelector('${panel("B")}').dataset.editorPreviewClip==='clip-02'`));
  await ctx.run(`document.querySelector('${scope("A")} [data-editor-asset=background]').click()`); await ctx.delay(60);
  ctx.smoke.check("Selecting a source asset never replaces the selected preview clip", await ctx.run(`document.querySelector('${scope("A")} [data-editor-asset=background]').getAttribute('aria-current')==='true'&&document.querySelector('${panel("A")}').dataset.editorPreviewClip==='clip-01'&&document.querySelector('${panel("A")} img').alt.includes('scene_01.mp4')`));
  await clip(ctx, 2);
  ctx.smoke.check("Image clip maps cover and project position without changing source selection", await ctx.run(`document.querySelector('${panel("A")} img').alt.includes('bg_01.png')&&document.querySelector('${panel("A")} b').textContent==='00:00:22:00'&&document.querySelector('${scope("B")} [data-editor-asset=scene-02]').getAttribute('aria-current')==='true'`));
  await clip(ctx, 3);
  ctx.smoke.check("Audio selection shows a clear no-picture state instead of a stale video", await ctx.run(`document.querySelector('${panel("A")}').dataset.editorPreviewState==='audio'&&!document.querySelector('${panel("A")} img')&&document.querySelector('${panel("A")}').textContent.includes('音频片段没有画面')`));
  await clip(ctx, 1);
}

// 同一预览实例连续切换状态，工具栏位置不应随着反馈文字长度变化。
// empty 清空片段参数，所以当前时间应归零，但项目总时长仍为 30 秒。
// missing 场景传未知 assetId，测试覆盖实际引用查找失败。
// loading 不能残留旧图片，且整个面板必须标记 busy。
// error 使用公共 alert，不能只让缩略图角落变红而没有文字原因。
// black 是明确黑场，不能把它标记为等待或永久缺图。
// B 保持正常静态画面，A 的状态不能覆盖另一台预览。
// broken 用坏字节让浏览器实际触发 onError，等待条件不派发假 error 事件。
// 换回正常封面后应恢复 ready，不能让失败记忆永久污染当前预览实例。
// 样板没有播放/导出回调，状态恢复只说明显示参数有效。
// 禁用按钮仍可保留提示，不允许禁用只是视觉灰色而实际发出处理请求。
// 长名在下一组另测，异常反馈与文件名截断不能互相代替。
// 记录控制栏 top 后逐状态比较，直接发现占位撑高画布挤走控制条的问题。
// 默认源图与场景资源均随包提供，本组无需外部网络稳定性作为前提。
// loading 的旋转关闭不影响文字提示，本轮未声明完成 reduced-motion 全套测量。
// 错误场景截图保留 B 正常画面，便于人工对比隔离与占位层级。
// 不在错误后提供空函数重试按钮，避免制造假修复交互。
// 所有 data 状态必须来自 ProgramPreview，不能仅按样板选中了哪个按钮判定。
// 没有片段时仍保留标题和控制栏，空态不能让节目面板高度塌陷。
// 场景切换不会写正式工程，离开页后默认 clip-02 继续不变。
async function states(ctx) {
  // error 的角色必须是 alert，只有 data 状态正确却没有可读反馈不能通过。
  // empty 的当前时间检查归零，防止无片段时还保留之前节目的十二秒。
  // 两个补充判据仍在同一状态循环里，不能切到另一个页面再验证正常样例。
  // 加载条件检查实际 busy 属性，错误场景不应借用 busy 持续冒充等待。
  // 占位语义来自公共 EditorPlaceholder，测试不替产品写额外 alert 节点。
  // top 在正常画面时记录，之后空态与错误都必须留在同一控制条位置。
  // 占位标题再长也不应把按钮推到面板之外，这是固定三行布局的实际边界。
  // 每个状态都检查 A 没有 img，等待/失败不能把旧图留给用户误读。
  // B 的状态为 ready，与 A 五种状态逐一比较，而非仅在循环结束后比较一次。
  // 循环不重新进入路由，所以一轮状态留下的错误属性可能被下一轮检测到。
  // broken 后等待 missing，读取的是公共面板的状态优先级结果。
  // 同时检查 B 仍有图片，可发现错误缓存被写成模块级共享变量。
  // 恢复 ready 后等待 naturalWidth 大于零，不能只凭 img 节点出现断言有效。
  // error 截图的文字来自独立翻译键，不用浏览器自带破图标满足异常展示。
  // 状态夹具本身不取消或修复文件，只控制当前静态预览的输入。
  const top = await ctx.run(`document.querySelector('${panel("A")} > div:last-child').getBoundingClientRect().top`);
  for (const state of ["empty", "loading", "missing", "error", "black"]) {
    await scenario(ctx, state);
    ctx.smoke.check(`Program ${state} state is explicit and preserves its transport boundary`, await ctx.run(`(()=>{const p=document.querySelector('${panel("A")}');return p.dataset.editorPreviewState==='${state}'&&!p.querySelector('img')&&Math.abs(p.lastElementChild.getBoundingClientRect().top-${top})<1&&document.querySelector('${panel("B")}').dataset.editorPreviewState==='ready'&&(${JSON.stringify(state)}!=='loading'||p.getAttribute('aria-busy')==='true')&&(${JSON.stringify(state)}!=='error'||!!p.querySelector('[role=alert]'))&&(${JSON.stringify(state)}!=='empty'||p.querySelector('b').textContent==='00:00:00:00')})()`));
  }
  await scenario(ctx, "error"); await shot(ctx, "ui-04-preview-error-dark");
  await scenario(ctx, "broken"); await ctx.wait(`document.querySelector('${panel("A")}').dataset.editorPreviewState==='missing'&&!document.querySelector('${panel("A")} img')`);
  ctx.smoke.check("Actual cover decoding failure falls back only in its own preview", await ctx.run(`!!document.querySelector('${panel("A")} [data-editor-placeholder=missing]')&&!!document.querySelector('${panel("B")} img')`));
  await scenario(ctx, "ready"); await ctx.wait(`document.querySelector('${panel("A")} img')?.naturalWidth>0`);
  ctx.smoke.check("A new valid cover recovers from the previous failed URL", await ctx.run(`document.querySelector('${panel("A")}').dataset.editorPreviewState==='ready'`));
}

// source 与 program 复用同一容器，进入素材查看后有明确返回入口。
// source 的两秒是片段局部时间，返回 program 后应恢复到 12 秒工程时间。
// 返回操作不得改变片段 ID、素材高亮或 B 的查看模式。
// 长名必须在标题行省略，完整 title 保留用于查看，而不是强迫标题换行。
// 按钮原因通过 aria-describedby 取实际节点，验证专属静态边界提示已接入。
// 五个走带动作都要原生禁用，不能只检查播放一个按钮。
// 禁用操作点击后外层统计仍为零，这里不自行重置业务计数掩盖副作用。
// 键盘通过原生 Enter 激活 source 开关，不直接调用组件方法。
// 先聚焦正确按钮，焦点圈须实际可见，不能只断言 DOM 可以 focus。
// 切模式不会开启隐藏 video/audio 标签，当前仍是静态图像查看。
// 样板 source 返回保持当前长名称场景，证明不是重载页面恢复默认状态。
// 同一实例返回后时间码改变来自模式参数，而不是时钟走了十秒。
// 真实 seek 不在本轮范围，不向拖动播放头注入任何事件。
// 对标题宽度的检查在真实样板列完成，后续窄屏再核对没有横向整页溢出。
// 此处检查完整 title 含 final_revision，不能只验证 text-overflow 样式存在。
// 如果文字没有发生实际溢出，长名样例不能通过这项省略反证。
// 时间码仍使用 30fps，B 竖屏 24fps 的参数不会串入 A。
// source 的总长来自片段 end-start=8，不误用 30 秒工程时长。
async function sourceMode(ctx) {
  // 名称夹具刻意长于宽列可用空间，以便验证实际省略，而非仅验证 CSS 声明。
  // 文件全名仍保留 .mp4，不能截掉数据再拿截断名称作为 title。
  // source 开关位于状态组末尾，返回按钮则在公共预览标题栏中。
  // 两个操作路径不同，可以发现按钮图标存在却遗漏 onBack 绑定的问题。
  // onBack 不重建 ProgramPreview，状态长名和素材背景选择应继续保留。
  // source 时间分母是八秒片段长度，不能继续显示工程总长三十秒。
  // 返回后工程时间恢复十二秒，不把局部两秒写回工程位置。
  // 五个按钮包括适应，不能因为它看似纯 UI 就误开启尚无实现的缩放动作。
  // 本组主动点击每个禁用按钮，外层业务计数能观察是否发生意外请求。
  // 全部原因节点必须存在且包含静态预览说明，title 有文字不代表读屏描述正确。
  await scenario(ctx, "long");
  ctx.smoke.check("Long preview names ellipsize and preserve their full title", await ctx.run(`(()=>{const s=document.querySelector('${panel("A")} header > span:last-child');return s.title.includes('final_revision')&&getComputedStyle(s).textOverflow==='ellipsis'&&s.scrollWidth>s.clientWidth})()`));
  await ctx.run(`document.querySelector('${scope("A")} [data-preview-state-choices] > span:last-child button').focus()`);
  ctx.win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" }); ctx.win.webContents.sendInputEvent({ type: "char", keyCode: "\r" }); ctx.win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
  await ctx.wait(`document.querySelector('${panel("A")}').dataset.editorPreviewMode==='source'`);
  // 用户要求焦点改为单根一像素线，旧用例的至少两像素期望与新视觉契约冲突。
  // 这里改为精确一像素，不能放宽为零或仅检查focus属性存在。
  // 原选中对象、A/B独立性和源时间断言继续保留，样式变化不应弱化业务回归。
  // 计算样式来自当前静态构建真实DOM，未在测试里直接给元素添加outline。
  ctx.smoke.check("Source view has a title, return action and local clip time", await ctx.run(`document.querySelector('${panel("A")} h2').textContent==='素材查看'&&document.querySelector('${panel("A")} b').textContent==='00:00:02:00'&&document.querySelector('${panel("A")} > div:last-child').textContent.includes('00:00:08:00')&&document.querySelector('${panel("B")}').dataset.editorPreviewMode==='program'&&parseFloat(getComputedStyle(document.activeElement).outlineWidth)===1`));
  await ctx.run(`document.querySelector('${panel("A")} header button').click()`); await ctx.delay(60);
  ctx.smoke.check("Returning restores program time without changing clip or asset selection", await ctx.run(`document.querySelector('${panel("A")}').dataset.editorPreviewMode==='program'&&document.querySelector('${panel("A")} b').textContent==='00:00:12:00'&&document.querySelector('${panel("A")}').dataset.editorPreviewClip==='clip-02'&&document.querySelector('${scope("A")} [data-editor-asset=background]').getAttribute('aria-current')==='true'`));
  ctx.smoke.check("All preview processing controls stay disabled with an accurate reason", await ctx.run(`(()=>{const buttons=[...document.querySelectorAll('${panel("A")} > div:last-child button')];buttons.forEach(b=>b.click());return buttons.length===5&&buttons.every(b=>b.disabled&&document.getElementById(b.getAttribute('aria-describedby')).textContent.includes('静态预览'))&&!document.querySelector('${panel("A")} video,${panel("A")} audio')})()`));
}

// 外层先验过素材区，这里进入新增节目样板，不重复造窗口或游客桥。
// 默认预览也截深色图，证明参数化没有改变主工作区的单节目布局。
// 样板引用通过现有组件预览入口到达，不创建只有测试才能打开的路由。
// 截图前把 A/B 带入视口，避免停在上一组素材样板的位置截错内容。
// 浅深主题切换保持长名称场景与选中，不能重建简单页面掩盖状态丢失。
// 窄窗口验证实际 700px 浏览器视口，应用移动导航仍可用。
// 预览控制栏允许自己的横向滚动，但页面不能被长标题撑宽。
// 画布与比例框都必须位于预览内部，不能靠父 overflow 隐藏越界内容。
// 结束通过原返回链接回默认工程，时间线仍应只选 clip-02。
// 主时间轴没有被启用，样板可选片段不代表 UI-06 交互已完成。
// 同一个 Electron 实例按顺序执行，各 helper 不并行竞争路由或主题。
// 未跑真实 Windows DPR、遮挡或读屏软件，不能由截图推断这些维度通过。
// 运行图包括宿主导航与窗口控制，不裁成概念图冒充整个程序状态。
// 回宽屏先让原 sizeHost 校准真实外壳占位，不拼旧导航宽度常量。
// 断言失败仍保留临时输出，最终退出由外层 harness 决定。
// 无视频音频元素是重要边界，但不替代外层 IPC 调用计数检查。
async function checkVideoUiPreview(ctx) {
  // 此时上一素材 helper 已恢复深色默认工程，首张图应为同一默认节目状态。
  // 预览样板在页面后部，显式 scrollIntoView 避免截到上一个素材分组。
  // A/B 外框共享 sampleGrid，改窄窗口后应只重排而不改变片段参数。
  // narrow 检查 frame 四边，防止仅看 scrollWidth 而遗漏纵向裁切。
  // 默认预览面板总数必须为一，样板节点不能永久隐藏在工作区里。
  // 返回时 clip-02 的边框仍在，A 的选择没有写入主时间轴状态。
  // helper 结束后旧视频/GIF 宿主还会被外层回归，保证局部样式不泄漏。
  // 后续 UI-05–UI-08 保持待办，测试通过只证明本次静态预览契约。
  await shot(ctx, "ui-04-default-dark");
  await ctx.run("document.querySelector('a[href=\"/tools/video/editor/samples\"]').click()"); await ctx.wait("document.querySelector('[data-editor-preview-sample=A]')");
  await ctx.run(`document.querySelector('${scope("A")}').scrollIntoView({block:'start'})`);
  await mapping(ctx); await states(ctx); await sourceMode(ctx); await shot(ctx, "ui-04-preview-samples-dark");
  await theme(ctx, "light");
  ctx.smoke.check("Theme switch preserves preview and source selection in both instances", await ctx.run(`document.querySelector('${panel("A")}').dataset.editorPreviewClip==='clip-02'&&document.querySelector('${scope("A")} [data-editor-asset=background]').getAttribute('aria-current')==='true'&&document.querySelector('${panel("B")} b').textContent==='00:00:12:06'&&getComputedStyle(document.querySelector('${panel("B")} img')).filter==='none'`));
  await shot(ctx, "ui-04-preview-samples-light");
  await ctx.win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 700, height: 900, deviceScaleFactor: 1, mobile: false }); await ctx.delay(200);
  await ctx.run(`document.querySelector('${scope("A")}').scrollIntoView({block:'start'})`);
  ctx.smoke.check("Narrow preview keeps its canvas, long title and transport within the panel", await ctx.run(`(()=>{const h=document.querySelector('[data-editor-samples]'),p=document.querySelector('${panel("A")}'),s=p.querySelector('[data-editor-preview-surface]').getBoundingClientRect(),f=p.querySelector('[data-editor-preview-frame]').getBoundingClientRect();return h.scrollWidth<=h.clientWidth+1&&f.width>0&&f.left>=s.left-1&&f.right<=s.right+1&&f.top>=s.top-1&&f.bottom<=s.bottom+1&&Math.abs(f.width/f.height-16/9)<.01&&p.lastElementChild.getBoundingClientRect().bottom<=p.getBoundingClientRect().bottom+1})()`));
  await shot(ctx, "ui-04-preview-samples-narrow");
  await ctx.run("document.querySelector('[data-editor-samples] > a').click()"); await ctx.wait("document.querySelector('[data-video-editor-ui]')"); await ctx.win.loadURL('app://app/tools/video/editor/samples/project'); await ctx.wait("document.querySelector('[data-video-editor-ui=\"UI-04\"]')"); await ctx.sizeHost(1600, 1000);
  ctx.smoke.check("Leaving preview samples restores the default project mapping", await ctx.run("document.querySelector('[data-video-editor-ui] [data-editor-region=R03]').dataset.editorPreviewClip==='clip-02'&&document.querySelector('[data-editor-clip=clip-02]').getAttribute('aria-pressed')==='true'&&document.querySelectorAll('[data-video-editor-ui] [data-editor-region=R03]').length===1"));
  await shot(ctx, "ui-04-default-light");
}
// UI-07也通过同一主题菜单切换，导出已有测试机制，避免两处维护不同点击顺序。
// 此导出只给测试helper复用，不添加到产品window或preload能力里。
// 主题状态仍由生产themeSignals决议，helper不能直接改data-theme自证。
module.exports = { checkVideoUiPreview, setVideoUiTheme: theme };

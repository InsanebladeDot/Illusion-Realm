/**
 * 本地与在线模型库共用一组伸缩回归，真实执行页面按钮与浏览器 CSS 过渡。
 * 夹具只替换各自的数据来源，不给生产组件新增动画测试开关。
 * 左栏收起必须让中间变宽，分类列与间隔一起归零，不能只隐藏文字。
 * 右栏关闭必须连同间隔一起释放，不能留下一个空的详情格。
 * 动画中间帧使用浏览器动画对象定位，类似暂停一段录像检查中间画面。
 * pause 与 currentTime 只控制真实 CSS 过渡的播放进度，不手改生产列宽。
 * 这样能检查真的存在中间宽度，不靠某个机器恰好在 150ms 内返回结果。
 * 最后恢复 play，仍需等待实际页面抵达目标几何。
 * 暂停发生在 click 后的首个可检查阶段，300ms 过渡仍应处于存活状态。
 * 浏览器 effect.getTiming 的 duration 是这个过渡真正采用的数值。
 * 设置 currentTime 后读取 DOMRect 会要求浏览器同步计算当前帧布局。
 * easing 可以不是线性，中点宽度只要求落在两端之间，不强求恰好数学平均值。
 * 相同起终点宽度无法通过这个检查，也不能靠透明度改变取得通过。
 * 为两端预留 2px 容差，避免浮点取整把刚起步或刚结束误判成中间帧。
 * querySelector 目标缺失会让 run 报错，不用可选链悄悄跳过实际检查。
 * 播放恢复只针对根网格的动画对象，不改变应用其他区域的动效设置。
 * 每个等待都由宿主的有界轮询处理，不依赖窗口 rAF。
 * 测试窗口单独模拟动效偏好，不修改操作系统或用户真实应用设置。
 * CDP 调试器在 finally 释放，不能影响同一脚本后续预览和下载回归。
 * run、click、wait、check 来自宿主，两个入口不各写一套容易分叉的断言。
 * 在线页使用模拟 HTTPS 模型，本地页使用真实扫描的临时权重占位文件。
 * 动画验证不要求这些占位文件能够推理，不会向 ComfyUI 提交生成请求。
 * 本 helper 不调用导入、下载、移动或删除，只读取几何与当前交互状态。
 * 用户的模型文件和用户文档均不属于该窗口的测试数据范围。
 * 初始详情可以没有选中对象，X 仍然必须执行同样的空间归还。
 * 左栏内部的分类组仍是原公共 CollapsiblePanel，不在测试中替换它的 JSX。
 * 本轮验证整列横向收起，与分类组纵向折叠的既有测试并存。
 * 根布局只出现一份模型列表，不能通过切换到另一个复制页面来得到终点截图。
 * sampleResize 查的是根网格，子内容 fade 动画即使存在也不能满足该测试。
 * CDP 的媒体覆盖仅存在于独立测试会话，不会改变 Windows 设置。
 * 初始正常动效与后续减少动效均需要等待 matchMedia 返回对应真值。
 * 浏览器状态是判定依据，不能仅相信命令发送成功就假定页面已切换。
 * 网格列变化触发的容器查询允许改变卡片列数，测试不强行固定列数掩盖真实布局。
 * 两端几何独立比较，卡片重排不应导致模型区宽度仍停留在旧位置。
 * 文件夹局部状态通过节点身份保留间接验证，宿主后续继续检查实际分类与选择。
 * 不能根据当前文件夹名称推断本次动画是否完成，名称在整个过程中本来就不变。
 * 动效时长仍由生产公共参数提供，测试的 0.3s 期望对应用户指定的原导航表现。
 * 不在页面注入自定义 style 来强制过渡，能发现构建漏掉 Tailwind 类的回归。
 * 每次宿主使用全新 Electron 进程，旧一轮动画对象不可能遗留到下一轮。
 * 错误继续交给现有 smoke harness，脚本不会只打印问题然后返回成功。
 * 截图仅用于人工核对终态，不把“截图文件存在”当成中间插值通过。
 * 长文本、缺图、两种主题仍由原宿主夹具覆盖，不复制第二套静态视觉样例。
 * 旧版没有动画时最终宽度也会正确，但 getAnimations 的独立检查会明确失败。
 */
async function sampleResize({ run, wait, check }, label, before, target) {
  // 先确认过渡存在，再定位中间帧；缺少 transition 时应失败而非等固定延时后放过。
  // 只查根网格动画，子节点的透明度变化不能冒充布局动画。
  // 中点以过渡自己的 duration 计算，不在这里复制一套产品时间常量。
  // 预期宽度的两端来自独立测量和需求值，不能拿同一个当前值互相比较。
  // 中点必须和两端都至少相差 2px，排除离散跳变的假动画。
  // 页面已被强制模拟为正常动效，因此此阶段没有减少动效的快速结束分支。
  await wait("document.querySelector('[data-model-library-workspace]').getAnimations().some(item=>item.transitionProperty==='grid-template-columns')");
  const width = await run("(()=>{const root=document.querySelector('[data-model-library-workspace]'),animation=root.getAnimations().find(item=>item.transitionProperty==='grid-template-columns');animation.pause();animation.currentTime=Number(animation.effect.getTiming().duration)/2;return document.querySelector('[data-model-library-catalog]').getBoundingClientRect().width})()");
  check(label, width > Math.min(before, target) + 2 && width < Math.max(before, target) - 2);
  // 原生过渡继续播放，测试不能只验证暂停的一帧就把页面留在半收起状态。
  // 如果用户快速反向点击，浏览器也会从当前布局接续，产品不需要旧定时器收尾。
  // 这里不使用动画 finished Promise，避免取消过渡时出现未接住的拒绝。
  await run("document.querySelector('[data-model-library-workspace]').getAnimations().forEach(item=>item.play());void 0");
}

/**
 * 截图必须呈现模型库，不让异步更新公告遮住当前需要验收的面板。
 * 公告读取晚于首帧，给它一次有限调度机会，再走它自己的关闭按钮。
 * 关闭只影响冒烟的临时会话，不修改产品 DOM、CSS 或真实用户公告记录。
 * 短等待用于截图合成与异步公告，不作为动画是否成功的判断依据。
 * 动画功能已经在调用此方法前通过真实中间宽度与最终宽度核验。
 * capture 由宿主注入，保存的是同一 BrowserWindow 的实际画面。
 * helper 不裁去应用 nav、标题栏和底部状态区，保留完整布局边界。
 * 如果公告不能正常关闭，wait 会失败，而不是截图时把遮罩隐藏掉。
 * 没有 capture 回调时不启动额外等待，纯行为验证不会无故变慢。
 * 两个来源使用同一截图前置条件，避免一边干净一边被公告遮住。
 * 不等待公网图片请求，这些冒烟图片全部来自各自固定夹具。
 * 该 Promise 最长 700ms，窗口不可见也可由主进程计时器结束。
 */
async function captureLayout({ run, wait, capture }, name) {
  await new Promise(resolve => setTimeout(resolve, 700));
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await wait("!document.querySelector('[aria-labelledby=update-announcement-title]')");
  await capture(name);
}

/**
 * 已展开左栏是前置条件，正常宽屏下原宽度为 205px。
 * 收起不保留窄轨道，模型区应得到原左栏宽度加左间隔的全部空间。
 * DOM 引用与应用 nav 状态同时保存，检查隐藏内容保活且开合互不串联。
 * 回归不读取或改写 Zustand 内部字段，所有切换都由真实按钮发出。
 * 捕获可选截图时仍保留 AppShell 与实际模型卡片，不能拿自制布局替代。
 * 当前模型文件夹和查询条件不在本 helper 里重新设置，宿主原来的选择必须保留。
 * 恢复后比较同一个内容节点，能发现条件渲染导致整棵目录树重建的回归。
 * 快速反向点击跨两个真实事件调度，避免 React 同批处理掩盖中途动画。
 * before.side 来自真实面板边界，包含边框，与 CSS 网格分配宽度口径一致。
 * root.children[1] 是宿主真实中心列，不根据标题文字查一个可能重名的内层容器。
 * 收起增量等于原左栏宽加 8px 间隔，恢复入口留在中心底部。
 * 捕获 __libraryNav 是只读快照，整个测试没有点击全局 nav 的开合按钮。
 * __librarySidebar 是真实内容节点，用严格引用比较区分保活与复制重建。
 * 折叠后必须找到 inert 内容，只有 opacity:0 仍会让 Tab 落进隐藏目录。
 * 恢复后的同一节点不能继续 inert，否则用户看到分类却无法点击。
 * 当前框架可能多次重渲染，引用检查针对最终 DOM，不依赖组件调用次数。
 * 两次反向点击各自 await 宿主 click，让浏览器先看到一次收起再看到展开。
 * 这覆盖常见的误双击，不使用长时间等待把可能的迟到隐藏操作藏起来。
 * 最后删除窗口临时槽，不把只用于比较的节点引用带到创建页测试。
 * 原目录树与在线筛选仍留在生产数据边界内，helper 不需要知道业务字段名称。
 */
async function verifySidebarMotion(context) {
  const { run, click, wait, check, capture } = context;
  const before = await run("(()=>{const root=document.querySelector('[data-model-library-workspace]'),sidebar=document.querySelector('[data-model-library-sidebar]');window.__librarySidebar=sidebar.lastElementChild;window.__libraryNav=document.querySelector('[data-app-nav]').getAttribute('aria-expanded');return {side:sidebar.getBoundingClientRect().width,center:root.children[1].getBoundingClientRect().width}})()");
  // 点击后先检查真实中间宽度，再等待收起完成，不能把最终宽度当动画存在的证据。
  // 左栏与间隔必须完全收起，恢复按钮放在中心底栏，不能残留一列。
  // 左间隔也归还，中心增量应等于侧栏本身宽度加八像素。
  // nav 的宽度与状态不应改变，否则说明错误复用了全局导航的 store。
  await click('[data-model-sidebar-toggle]');
  await sampleResize(context, "sidebar resize has a real intermediate model-area width", before.center, before.center + before.side + 8);
  await wait("getComputedStyle(document.querySelector('[data-model-library-sidebar]')).visibility==='hidden'&&document.querySelector('[data-model-library-sidebar]').getBoundingClientRect().width<=2");
  // 唯一开合按钮必须位于中心底栏，左侧第一行不能残留旧按钮。
  // 当前折叠状态显示向右双箭头，不能同时出现一左一右两颗按钮。
  // 数量仍在底栏右侧，按钮不会挤到数量文字或跟着目录滚走。
  // 原始分类状态仍保留，恢复时只改布局而不重新扫描或请求网络。
  // 整个侧栏 inert 与内部内容 inert 同时成立，不可见目录不会吸走 Tab。
  check("one subtle toggle lives at model footer left and count at right", await run("document.querySelectorAll('[data-model-sidebar-toggle]').length===1&&!!document.querySelector('[data-model-library-footer] [data-model-sidebar-toggle]')&&!document.querySelector('[data-model-library-sidebar] button[data-model-sidebar-toggle]')&&getComputedStyle(document.querySelector('[data-model-library-footer] [role=status]')).textAlign==='right'"));
  check("collapsed sidebar keeps a restore button, inert contents and independent nav", await run("document.querySelector('[data-model-library-sidebar] [inert]')&&document.querySelector('[data-model-sidebar-toggle]').getAttribute('aria-expanded')==='false'&&document.querySelector('[data-app-nav]').getAttribute('aria-expanded')===window.__libraryNav"));
  if (capture) await captureLayout(context, "sidebar-collapsed");
  // 重新展开等待原宽度，不能仅看 aria-expanded=true 就假设内容已完成恢复。
  // 节点身份保留意味着目录开合、局部滚动和原有选中项没有因收起而重建。
  // 快速反转再检查最终状态，防止迟到的隐藏操作把已展开面板清空。
  await click('[data-model-sidebar-toggle]');
  await wait(`Math.abs(document.querySelector('[data-model-library-sidebar]').getBoundingClientRect().width-${before.side})<1`);
  check("reopening keeps the same sidebar contents", await run("document.querySelector('[data-model-library-sidebar]').lastElementChild===window.__librarySidebar&&!window.__librarySidebar.inert"));
  await click('[data-model-sidebar-toggle]');
  await click('[data-model-sidebar-toggle]');
  await wait(`Math.abs(document.querySelector('[data-model-library-sidebar]').getBoundingClientRect().width-${before.side})<1&&document.querySelector('[data-model-sidebar-toggle]').getAttribute('aria-expanded')==='true'`);
  check("rapid sidebar reversal settles expanded without stale cleanup", await run("!document.querySelector('[data-model-library-sidebar] [inert]')"));
  await run("delete window.__librarySidebar;delete window.__libraryNav");
}

/**
 * 详情关闭前记录中心宽度，310px 详情加 8px 间隔应全部归还。
 * 关闭的空外框可以留在 DOM 中，但不能继续作为可访问的详情区域。
 * 焦点要移到模型区，不能停在已经 inert 的 X 上。
 * 中心右边缘与工作区内边界一致，能发现零宽第三列仍残留间隔的问题。
 * 选中模型资料由原宿主卸载；这里不把它伪装成透明但活跃的第二份页面。
 * 两个来源都在空详情状态调用，因此也覆盖首次未选模型就关闭的操作。
 * 这个操作之后不自动重开详情，宿主后续需要真实点击卡片才能恢复。
 * before 在关闭前读取，必须与后面的同一个中心节点比较。
 * 310px 与 8px 合计 318px，错误残留一个 grid gap 会少归还一段宽度。
 * 大于 317px 的增量容许像素取整，不能放过 8px 间隔未清除的回归。
 * root.lastElementChild 是宽屏保留的空详情外框，没有窄屏资源弹窗插在后面。
 * 业务 data 标记应移除，但 inert 外框留在 DOM 是本次连续轨道动画的设计。
 * 键盘焦点明确在中心 section 上，不能退到 body 或留在隐藏的关闭按钮。
 * 右边 4px 是工作区既有内边距，不在这里要求去掉确认过的外框留白。
 * 该边界检查能同时发现中心只扩一部分却仍被某个空列占位的错误。
 * 窄屏详情走原资源弹窗，宿主原测试继续核对它与 main 左边缘对齐。
 * 没有自动补选其他模型，X 关闭不应该触发网络查询或文件读取。
 * 截图前会正常关闭延迟公告，不能把遮罩删掉来获得看似干净的画面。
 */
async function verifyDetailsMotion(context) {
  const { run, click, wait, check, capture } = context;
  const before = await run("document.querySelector('[data-model-library-catalog]').getBoundingClientRect().width");
  // 318px 是详情与间隔的独立合计，不能只看模型区比原先略宽就通过。
  // 真正的插值检查与最终释放检查分开，失败时能区分动效缺失和空间未归还。
  // 收起左右两边时根网格仍有同样的轨道数量，是原生连续布局的前提。
  await click('[data-model-details-close]');
  await sampleResize(context, "closing details smoothly expands the model area", before, before + 318);
  await wait(`document.querySelector('[data-model-library-catalog]').getBoundingClientRect().width>${before}+317`);
  check("closed details return the full column and gap and leave focus in models", await run("(()=>{const root=document.querySelector('[data-model-library-workspace]'),catalog=document.querySelector('[data-model-library-catalog]');return !document.querySelector('[data-model-library-details]')&&root.lastElementChild.inert&&document.activeElement===catalog&&Math.abs(root.getBoundingClientRect().right-catalog.getBoundingClientRect().right-4)<1})()"));
  if (capture) await captureLayout(context, "details-closed");
}

/**
 * 减少动效仅改变时间，不应该取消用户的开合能力或遗留半展开宽度。
 * 先等媒体查询实际生效，不能把 CDP 命令返回当作页面已更新的证据。
 * 全局 1ms 兜底允许用户选择减少动效时立即到位。
 * 展开和收起按钮仍需工作，隐藏内容依然使用相同 inert 规则。
 * 本用例只操作左栏；右栏已经由前一组关闭，不引入虚构模型选中状态。
 * 同时关闭左右两侧不会把中心轨道压成零宽，模型区始终使用剩余空间。
 * 关闭后的恢复采用真实 Enter 键，证明图标按钮不是只有鼠标事件才能触发。
 * 浏览器默认按钮键盘行为需要 focus，测试先聚焦真正的展开按钮。
 * keyDown 与 keyUp 都发送，避免给后续步骤遗留按住状态。
 * 不手动 dispatch click 来冒充键盘，使用浏览器调试输入通道发出可信按键。
 * 输入仅发送到测试窗口，不向用户当前前台应用发送全局按键。
 * 检查最终宽度超过 200px，确保断言不是仅看到按钮状态变了却内容仍被裁掉。
 */
async function verifyReducedMotion(win, { run, click, wait, check }) {
  await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await wait("matchMedia('(prefers-reduced-motion:reduce)').matches");
  await click('[data-model-sidebar-toggle]');
  await wait("getComputedStyle(document.querySelector('[data-model-library-sidebar]')).visibility==='hidden'&&document.querySelector('[data-model-library-sidebar]').getBoundingClientRect().width<=2");
  check("reduced-motion mode keeps resizing usable with the global short duration", await run("parseFloat(getComputedStyle(document.querySelector('[data-model-library-workspace]')).transitionDuration)<=0.001"));
  await run("document.querySelector('[data-model-sidebar-toggle]').focus()");
  // 离屏窗口没有操作系统键盘焦点，sendInputEvent 会被环境丢弃。
  // 调试输入直接送到同一渲染器，仍执行浏览器的原生 Enter 激活语义。
  // 不靠调用 click 修补键盘断言，否则无法发现按钮并非原生可操作元素。
  // keyUp 与 keyDown 成对发送，finally 仍负责撤销该窗口的媒体模拟。
  // Windows 虚拟键码十三与标准 Enter 一致，不使用依赖键盘布局的字符猜测。
  await win.webContents.debugger.sendCommand("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await win.webContents.debugger.sendCommand("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await wait("document.querySelector('[data-model-library-sidebar]').getBoundingClientRect().width>200");
  check("sidebar restore supports the native Enter key", await run("document.querySelector('[data-model-sidebar-toggle]').getAttribute('aria-expanded')==='true'"));
}

/**
 * 详情关闭后可用宽度增大，普通网格应自动增加列数，不再硬锁四列。
 * 保留空轨道的 auto-fill 即使只有一个在线模型也能测出实际可用列数。
 * 对比的是浏览器实际 grid-template-columns，不从页面计数推断列数。
 * 普通卡片最小宽 160px，在更宽的真实窗口应至少能放八列。
 * 只改变测试窗口尺寸，不把模型区单独写成一个固定像素的假容器。
 * getSize 返回原窗口外宽与外高，结束时按同一口径恢复。
 * innerWidth 需要等待，setSize 返回不代表渲染器已完成重排。
 * 窗口没有改变模型查询条件，列数增加不应该导致在线重复搜索。
 * 最大化尺寸用于离屏布局验证，不要求用户显示器真实容纳该测试窗口。
 * 窄屏与详情弹窗仍由宿主原有响应式回归验证，不能拿宽屏截图替代。
 * 若只把单张卡片拉宽而没有增加列数，columns 比较会明确失败。
 * 卡片高度继续来自既有七比九比例，增加列数不允许横向压扁封面。
 * 此函数没有为验证添加产品开关，使用的都是正式 CSS 和同一份模型列表。
 * count 前后比较在不同宽度下读取两次，不沿用旧布局的计算结果。
 * finally 恢复窗口大小，断言异常也不会让后续点击跑在错误的宽屏断点。
 */
async function verifyGridGrowth(win, { run, wait, check }) {
  const original = win.getSize();
  const columns = "getComputedStyle(document.querySelector('[data-model-library-grid],[data-local-model-grid]')).gridTemplateColumns.split(' ').length";
  const before = await run(columns);
  try {
    win.setSize(2000, original[1]);
    await wait("innerWidth===2000");
    await wait(`${columns}>${before}`);
    check("wider model area automatically grows past four columns to eight or more", await run(`${columns}>=8`));
  } finally {
    win.setSize(original[0], original[1]);
    await wait(`innerWidth===${original[0]}`);
  }
}

/**
 * 整组只连接当前冒烟窗口的调试器，不操作用户正在运行的应用。
 * 正常动效与减少动效分开测试，不能只在系统偏好恰好匹配时才覆盖一个分支。
 * 所有环境覆盖在 finally 撤销，断言失败也不会污染后续页面验证。
 * 动画参数比较读取 nav 与模型区真实 computed style，不能只检查共享常量名字。
 * AppShell 的主区留白也应使用同一节奏，三者不能一个快、一个慢。
 * 参数相同还不够，上面的中间宽度检查才证明实际布局属性正在过渡。
 * 最后放大测试窗口检查八列，是实际中心宽度增加后的重排，不是修改 CSS 的列数。
 * setSize 后读取 innerWidth，再观察列数，避免宿主先返回而渲染层尚未收到新尺寸。
 * 窗口原始尺寸在 finally 恢复，后续截图及窄屏断言不继承本用例的超宽状态。
 * 这只覆盖 CSS 像素宽度，不能据此声称验证了所有 Windows 显示缩放比例。
 * 当前不改 3D 或图形缓冲区，卡片图片仍由普通 DOM 布局控制。
 * 调试会话先完整释放，宿主后续图片预览可以自行使用原键盘和焦点流程。
 * 若正常动画根本不存在，第一组有界等待会失败，不能跳过它直接验证减少动效。
 * 减少动效的终点几何仍需正确，缩短时长不是保留不可点击隐藏面板的理由。
 * 两个宿主都调用完整 helper，不以一处通过推断另一处共享接入已经正确。
 * 真实外站下载与模型推理速度不在动画 helper 的证据范围内。
 */
async function verifyModelLibraryMotion(win, context) {
  const { run, wait, check } = context;
  win.webContents.debugger.attach("1.3");
  try {
    await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    await wait("!matchMedia('(prefers-reduced-motion:reduce)').matches");
    check("model library reuses nav and AppShell resize duration and easing", await run("(()=>{const els=['[data-app-nav]','[data-app-content-layout]','[data-model-library-workspace]'].map(selector=>getComputedStyle(document.querySelector(selector)));return els.every(style=>style.transitionDuration==='0.3s'&&style.transitionTimingFunction===els[0].transitionTimingFunction)&&els[2].transitionProperty==='grid-template-columns'})()"));
    await verifySidebarMotion(context);
    await verifyDetailsMotion(context);
    await verifyReducedMotion(win, context);
    await verifyGridGrowth(win, context);
  } finally {
    await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [] });
    win.webContents.debugger.detach();
  }
}

module.exports = { verifyModelLibraryMotion };

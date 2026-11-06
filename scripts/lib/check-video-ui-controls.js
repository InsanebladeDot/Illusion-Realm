/**
 * UI-02 共享控件的运行回归，使用默认页面之外的两个真实样板实例。
 * 测试像给两张相同的桌子分别移动抽屉：操作 A 后，B 必须保持原样。
 * 产品组件仍通过自己的事件更新状态，不暴露测试专用的 store 写入口。
 * 截图、按键和点击使用同一个 Electron 窗口，不能与其他冒烟并行运行。
 * 样板只演示界面状态；不把字段提交成功称为工程保存或媒体处理成功。
 * helpers 中的 wait 有主进程上限，后台窗口也能结束等待。
 * 每组断言从 DOM 读取用户实际看到的值，不以内部 React 状态自证。
 * loading/error 来自显式夹具，不请求网络制造超时。
 */
const fs = require("node:fs"), path = require("node:path");
// 作用域总是带实例编号，避免 querySelector 总取 A 而漏测独立性。
// 选择器仅由脚本常量组成，用户输入不参与生成待执行代码。
// 公共组件无需知道 A/B，实例边界由样板的容器定义。
const scope = id => `[data-editor-sample=${id}]`;

// 草稿输入采用原生 setter 和 input 事件，走与用户键入相同的 React 通路。
// 不逐字校正是重要回归：先输入 1，再追加小数不应被字段限制截断。
// 输入后先等待事件提交，后续按键不是在上一帧旧值上执行。
// string 只用于 executeJavaScript，不经过 shell 或文件路径解析。
// 这里不使用直接设置 value 后调用组件函数的捷径。
async function draft(ctx, text) {
  await ctx.run(`(()=>{const el=document.querySelector('${scope("A")} input:not(:disabled)');el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ctx.delay(60);
}
// 键盘事件由 Chromium 的输入路径投递，而非直接调用 onKeyDown。
// 每次同时发送 keyDown/keyUp，避免 Escape 或 Enter 留在按下状态。
// 这只能证明本次隐藏窗口内的键盘语义，不冒充系统级快捷键验证。
// 当前样板不存在全局删除快捷键，按键不会操作用户文件。
async function key(ctx, name) {
  ctx.win.webContents.sendInputEvent({ type: "keyDown", keyCode: name });
  // Chromium 的原生 Enter 激活依赖字符事件；仅 keyDown 能触发 React 键处理，
  // 却不能证明原生 button 的默认激活，三段事件才对应一次真实按键。
  if (name === "Enter") ctx.win.webContents.sendInputEvent({ type: "char", keyCode: "\r" });
  ctx.win.webContents.sendInputEvent({ type: "keyUp", keyCode: name });
  await ctx.delay(60);
}
// 失焦与 Enter 均提交有效草稿，Escape 放弃未提交文本。
// 非法草稿必须保留并给出就地错误，不能悄悄改成最近的边界值。
// B 保持 1.25，证明共享字段组件没有共享数值或错误变量。
// 0–30 秒仅是样板字段规则，不更改真实项目或视频生成的参数限制。
// 非法输入用 99，独立于组件内部计算方式，避免恒真断言。
// 本组没有磁盘写入；“提交”仅指回调更新当前样板 useState。
// 最后的失焦由真实焦点移动产生，不派发一个未改变焦点的假 blur。
// 通过实际值检查精度，确认小数没有被 parseInt 截断。
async function fields(ctx) {
  const { run, smoke } = ctx;
  await draft(ctx, "1");
  smoke.check("float draft remains uncorrected while typing", await run(`document.querySelector('${scope("A")} input').value==='1'`));
  await draft(ctx, "2.75"); await key(ctx, "Enter");
  smoke.check("Enter commits decimals only in the current instance", await run(`document.querySelector('${scope("A")} input').value==='2.75'&&document.querySelector('${scope("B")} input').value==='1.25'`));
  await draft(ctx, "99"); await key(ctx, "Enter");
  smoke.check("invalid number retains draft with accessible inline error", await run(`document.querySelector('${scope("A")} input').value==='99'&&document.querySelector('${scope("A")} input').getAttribute('aria-invalid')==='true'&&!document.querySelector('${scope("B")} input[aria-invalid]')`));
  await key(ctx, "Escape");
  smoke.check("Escape restores the last committed number and clears error", await run(`document.querySelector('${scope("A")} input').value==='2.75'&&!document.querySelector('${scope("A")} input[aria-invalid]')`));
  // 空草稿必须报错，不能因为 Number 空串等于零就提交一个用户未填写的值。
  // 再次 Escape 应取最近的有效值，不应把前一次错误文本当作基准。
  // 输入与确认仍走同一个正式字段，不在测试中直接设置错误状态。
  await draft(ctx, ""); await key(ctx, "Enter");
  smoke.check("empty draft cannot become a successful zero", await run(`document.querySelector('${scope("A")} input').getAttribute('aria-invalid')==='true'`));
  await key(ctx, "Escape");
  await draft(ctx, "3.5");
  await run(`document.querySelector('${scope("B")} button').focus()`);
  await ctx.delay(80);
  smoke.check("blur commits using the same precision rule", await run(`document.querySelector('${scope("A")} input').value==='3.50'`));
}
// 数值回归的第一阶段只输入单个字符 1，不执行 Enter。
// 预期字段显示原草稿 1，而不是格式化成 1.00 或夹到其他值。
// 若此处失败，用户连续输入多位数字时可能再次被动态矫正卡住。
// 第二阶段提交 2.75，精确比较小数文本，能够发现整数解析误用。
// 同时检查 B 的 1.25，避免只验证 A 最终正确而忽略跨实例写入。
// 第三阶段输入超过上界的 99，确认范围校验发生在提交时。
// 非法文本应继续保留 99，不能静默改成 30 让用户不知道发生过校正。
// aria-invalid 同时证明错误与字段关联，不能只画一个没有解释的红边。
// B 不应出现 aria-invalid，因为它从未参与这次提交。
// Escape 后检查 2.75，证明还原的是已提交值而非最初默认 1.25。
// 错误属性应一起清除，不能值已恢复但界面仍声称输入非法。
// 失焦阶段使用 3.5，期望格式化为 3.50，单独覆盖精度规则。
// B 按钮接收焦点意味着浏览器真正换了活动元素，不只是发一个 blur 名称事件。
// 隐藏窗口必须启用 Chromium 焦点模拟，否则系统无焦点会抑制 focusout。
// 这项环境设置不修改产品组件，也不替产品绕过校验函数。
// 等待 80ms 是有界事件结算窗口，不把数秒后值没变当作可忽略抖动。
// 精确比较字段值比检查 toast 更可靠：样板本来就没有成功通知。
// 每次提交都经原生 input 事件进入 React，不能直接调用 setNumber 自证。
// Enter 在脚本中发送字符阶段，覆盖原生按钮默认激活所需的浏览器行为。
// Escape 不发送字符阶段，因为它是控制键，不应在文本框插入特殊字符。
// 样板字段不是持久化测试，离开页面后丢失本地值符合演示隔离要求。
// 因此本组不会检查用户 JSON 或保存文件是否变化。
// 若未来接入正式项目，本组只能覆盖共享控件，命令和落盘还需要业务回归。
// 对合法负数的支持由参数决定；这个演示字段 min 为零，不能把它当普遍限制。
// precision 与 unit 是调用参数，测试不会据此修改视频生成分辨率或时长规则。
// 数据输入不依赖系统区域设置的小数键盘，夹具明确使用 ASCII 小数点。
// 草稿容许临时不完整，并不代表最终允许 NaN、Infinity 或空白提交。
// 未接回调的第二字段保持禁用，不能通过这次草稿测试暗示它已接通。
// 失败时 harness 保留截图目录，能够对照字段错误和当前焦点位置。
// 测试的退出码不能被后续返回编辑器的正常导航覆盖。
// 素材选择只影响素材高亮，不暗中切换另一块样板的选中对象。
// 同一外壳还用于音频片段；锁定片段必须在原生控件层拒绝点击。
// 并不声明正式时间轴已经支持选择、修剪或编辑历史。
// 长文件名用 title 保留全名，视觉省略不得破坏整个实例宽度。
// 缺图、错误、加载分别验证，不用一张灰色卡代替所有状态。
// 保存没有回调，busy 也没有模拟完成计时器，两者均应禁用。
// 加载按钮被点击后不得变成成功状态或取消 busy。
// 这些断言同时检验两个调用位置对共享样式和语义的接入。
async function selections(ctx) {
  const { run, smoke } = ctx;
  await run(`document.querySelector('${scope("A")} [data-editor-asset=scene-01]').click()`);
  smoke.check("asset selection stays local and long names retain full labels", await run(`document.querySelector('${scope("A")} [data-editor-asset=scene-01]').getAttribute('aria-current')==='true'&&document.querySelector('${scope("B")} [data-editor-asset=scene-02]').getAttribute('aria-current')==='true'&&document.querySelector('${scope("A")} [data-editor-asset=scene-01]').title.includes('long_filename')`));
  await run(`document.querySelector('${scope("A")} [data-editor-clip=A-audio]').click()`);
  smoke.check("clip shell selects audio independently and keeps B selected", await run(`document.querySelector('[data-editor-clip=A-audio]').getAttribute('aria-pressed')==='true'&&document.querySelector('[data-editor-clip=B-video]').getAttribute('aria-pressed')==='true'`));
  // 同一 A 实例的素材与片段也必须隔离，不仅是 A/B 页面状态相互隔离。
  // 片段选择之后素材仍为刚选的 scene-01，不能被反向切成 voice。
  // 再选 scene-02 后，音频片段应继续选中，构成双向不串状态的对照。
  // 这项会抓住一个 selected 同时驱动两种对象的错误复用，而不是只核对变量名。
  smoke.check("clip selection does not overwrite the selected asset", await run(`document.querySelector('${scope("A")} [data-editor-asset=scene-01]').getAttribute('aria-current')==='true'`));
  await run(`document.querySelector('${scope("A")} [data-editor-asset=scene-02]').click()`);
  smoke.check("asset selection does not overwrite the selected clip", await run("document.querySelector('[data-editor-clip=A-audio]').getAttribute('aria-pressed')==='true'"));
  await run("document.querySelector('[data-editor-clip=A-locked]').click()");
  smoke.check("locked clip cannot steal selection", await run("document.querySelector('[data-editor-clip=A-locked]').disabled&&document.querySelector('[data-editor-clip=A-audio]').getAttribute('aria-pressed')==='true'"));
  smoke.check("loading missing error and empty states are explicit", await run(`['loading','missing','error','empty'].every(state=>document.querySelector('${scope("A")} [data-editor-placeholder='+state+']'))`));
  smoke.check("unconnected and busy actions remain disabled", await run(`(()=>{const buttons=[...document.querySelectorAll('${scope("A")} [data-editor-action]')];return !buttons[0].disabled&&buttons[1].disabled&&buttons[2].disabled&&buttons[2].getAttribute('aria-busy')==='true'})()`));
}

// 状态适配回归在独立样板执行，不能往默认编辑器堆叠全部错误样例。
// 资源缺封面与解码失败是两个入口，需要分别确认都进入共享占位外壳。
// 样板使用静态坏字节，浏览器必须实际触发图片错误后才满足等待条件。
// 仅检查 img.complete 不够，坏图也会 complete；这里要求图片节点已回退。
// 读屏描述从实际 aria-describedby 取节点，不能只检查存在一个同名属性。
// busy 描述应为等待，普通未接通描述应为不可用，不能都引用宿主通用文字。
// 两个实例的按钮说明各有 ID，跨实例使用不会发生重复 ID 或错误引用。
// 所有测试只读 DOM，不修改源图、样板状态或禁用条件来让断言通过。
// 错误占位仍由 MediaItem 渲染，不在测试里派发假 error 事件。
// 确认图片缺失时没有 SVG 波形，避免图片被错误表达成已读出的音频。
// 缺图行是合法可选素材，不把封面缺失升级为整个素材不可用。
// 后续截图保持当前真实回退结果，能人工核对长名和占位密度。
async function fallbackStates(ctx) {
  // 等正式图片错误事件完成；网络不参与这个固定 data URL 的失败过程。
  // 两个实例共享同一坏地址，但失败与选择状态不共享组件 state。
  // 如果错误处理丢失，img 会留下，此等待必须失败而不是继续拍截图。
  await ctx.wait(`!document.querySelector('${scope("A")} [data-editor-asset=A-missing] img')`);
  // 无封面分支检查图片背景项，不能把显式 missing 样例当作同一测试。
  // 使用 aria-current 验证前面选择操作未被加载回执覆盖。
  // 缩略图槽中只允许图标加文案，DemoWaveform 的 path 不应出现在图片项。
  ctx.smoke.check("visual assets without covers show missing state instead of audio waveform",await ctx.run(`!!document.querySelector('${scope("A")} [data-editor-asset=background] [data-editor-placeholder=missing]')&&!document.querySelector('${scope("A")} [data-editor-asset=background] svg[viewBox="0 0 120 32"]')`));
  // 图片错误只影响封面，原素材名和行外壳仍必须存在。
  // 这是实际图片解码回退，不用直接传 state=missing 得到恒真结果。
  ctx.smoke.check("failed cover decoding uses the shared missing placeholder",await ctx.run(`!!document.querySelector('${scope("A")} [data-editor-asset=A-missing] [data-editor-placeholder=missing]')`));
  // 一次读取 A/B 全部禁用按钮，描述节点必须存在且每个 ID 唯一。
  // 名称与原因各有用途，不能让按钮 label 同时冒充禁用原因。
  // 按钮图标或布局不影响文本来源，因此不依赖具体 CSS Module 哈希。
  // UI-03 在同一路由加入素材库样板，导入有更具体的真实禁用原因。
  // 本条仍只校验 UI-02 A/B 控件样板的默认说明，不要求其他业务使用通用词条。
  // 素材导入专属说明在 UI-03 另验，不放宽本条对 busy 和 ID 独立性的要求。
  const descriptions=await ctx.run(`(()=>{const buttons=[...document.querySelectorAll('[data-editor-sample] [data-editor-action]:disabled')];return buttons.map(button=>({id:button.getAttribute('aria-describedby'),busy:button.getAttribute('aria-busy')==='true',text:document.getElementById(button.getAttribute('aria-describedby'))?.textContent}))})()`);
  ctx.smoke.check("disabled and busy buttons describe their own actual reason",descriptions.every(item=>item.text===(item.busy?'加载中':'此功能尚未接通'))&&new Set(descriptions.map(item=>item.id)).size===descriptions.length);
}
// 素材选择反例：A 选择 scene-01，B 必须继续高亮 scene-02。
// 两个实例读取相同素材常量，因此很容易暴露错误的模块级选中变量。
// 不比较 React key 字符串，直接检查可访问的 aria-current 状态。
// 文件名 title 同时包含 long_filename，证明视觉省略之外仍保留全名。
// 这不是验证文件真的在磁盘存在，素材 URL 是随包静态资源。
// 音频壳选择后 A-video 应让出状态，B-video 的状态则不受影响。
// 共享样板故意用局部选择值关联本实例内容，跨实例是关键隔离边界。
// 锁定测试调用原生 button.click，disabled 必须在浏览器层阻止激活。
// 只检查透明度不足以证明锁定，因为 CSS 灰色不会阻止回调。
// 锁定后再次核对 A-audio，防止无效点击把选择清空。
// 三个异常素材分别注入 loading、missing、error，不能用同一空框通过。
// empty 占位在整个实例底部，不等同于缺少一张缩略图。
// 状态检查关注语义标记和可见内容入口，不依赖 CSS Module 的哈希类名。
// ready 的素材行继续可选，异常行没有回调且保持原生禁用。
// 第一个按钮有回调，应该可用，防止公共按钮被一律禁用后测试仍全绿。
// 第二个保存按钮没有回调，应该禁用，防止默认空函数制造假可用性。
// 第三个 busy 按钮同时检查 aria-busy，不能只有一个旋转装饰图标。
// busy 的按钮也必须 disabled，避免等待期间重复提交同一操作。
// 样板没有真实异步任务，因此不等待 busy 变成 false。
// 若它自动变成成功，反而是演示越过未接业务边界的错误。
// 错误行与缺图行继续显示文件名，不能整行退成无法识别来源的图标。
// 没有调用本地删除 IPC，本组所有点击均只影响本页状态。
// 默认节目预览仍由固定演示片段呈现，素材高亮不应启动真实播放。
// 这些选择测试不能替代 UI-06 的多选、拖动、吸附和时间轴命令验收。
// 后续真实素材接入时可以复用相同外壳，但应另查素材状态转换。
// 锁定外框没有添加新的 button 子节点，避免嵌套交互影响原生禁用。
// 长名测试同时由窄屏边界断言覆盖，保证不会仅在宽屏看起来正确。
// 缺封面状态通过明确参数注入，测试不需要网络出现 404 才能稳定复现。
// 开合操作由真实 Enter 触发，覆盖鼠标以外的路径。
// 收起保留草稿却设置 inert，不能 Tab 进一个看不见的字段。
// 两个分组使用 useId 独立关联，A 的 aria-controls 不能指向 B。
// 普通开关按钮的 pressed 同样按实例隔离，不是固定装饰属性。
// 聚焦外观从计算样式读取，避免仅断言源文件里写了 focus-visible。
// 这里没有弹窗或全局快捷键，不扩大成 UI-07 的完整键盘验收。
async function groups(ctx) {
  const { run, smoke } = ctx;
  await run(`document.querySelector('${scope("A")} [data-editor-group] button').focus()`);
  await key(ctx, "Enter");
  smoke.check("keyboard collapse keeps B expanded and hides A from tab order", await run(`document.querySelector('${scope("A")} [data-editor-group] button').getAttribute('aria-expanded')==='false'&&!!document.querySelector('${scope("A")} [inert]')&&document.querySelector('${scope("B")} [data-editor-group] button').getAttribute('aria-expanded')==='true'`));
  await key(ctx, "Enter");
  smoke.check("expanding restores its own committed draft", await run(`document.querySelector('${scope("A")} input').value==='3.50'&&!document.querySelector('${scope("A")} [inert]')`));
  smoke.check("expanded group fully contains the last numeric field", await run(`(()=>{const g=document.querySelector('${scope("A")} [data-collapsible-panel]'),items=g.querySelectorAll('input'),last=items[items.length-1];return last.getBoundingClientRect().bottom<=g.getBoundingClientRect().bottom+1})()`));
  await run(`document.querySelector('${scope("A")} [data-editor-action]').focus()`); await key(ctx, "Space");
  // 用户要求焦点改为单根一像素线，旧用例的至少两像素期望与新视觉契约冲突。
  // 这里改为精确一像素，不能放宽为零或仅检查focus属性存在。
  // 原选中对象、A/B独立性和源时间断言继续保留，样式变化不应弱化业务回归。
  // 计算样式来自当前静态构建真实DOM，未在测试里直接给元素添加outline。
  smoke.check("keyboard toggle changes only A and has a visible focus ring", await run(`document.querySelector('${scope("A")} [data-editor-action]').getAttribute('aria-pressed')==='true'&&document.querySelector('${scope("B")} [data-editor-action]').getAttribute('aria-pressed')==='false'&&parseFloat(getComputedStyle(document.activeElement).outlineWidth)===1`));
}
// 分组按键测试先把焦点移到 A 的第一个标题，而不是页面上任意按钮。
// 第一轮 Enter 应收起 A，并保持 B 的 aria-expanded 为 true。
// inert 检查的是 A 分组的后代，不能误取 B 中另一个禁用字段当作证明。
// 收起保留输入 DOM，故仅查输入存在不能证明它仍可进入 Tab。
// inert 是公共抽屉负责的机制，本组验证编辑器实际调用时没有漏传 open。
// 第二轮 Enter 应重新展开同一组，不切换到另一个分组或第二实例。
// 草稿已在前一组提交为 3.50，恢复它能够发现折叠时误卸载字段的问题。
// 末行输入的 bottom 必须不超出测量容器 bottom，防止展开末行被裁切。
// 这项几何反证覆盖实际截图发现的父子 margin 合并问题。
// 它不读取组件源码的 flow-root 字符串，因此替代实现也可被正确验证。
// 容许一像素舍入误差，不能放过整行高度或数像素边框的丢失。
// 不依赖 rAF 等待，隐藏窗口的布局测量仍由主进程节拍驱动。
// 样板分组没有重置动作，也应正确对齐标题，不能留下假按钮占位。
// 开关按钮使用 Space 激活，覆盖原生按钮的另一个常见键盘入口。
// A 的 pressed 变化与 B 不变共同验证状态归属，而非仅检查存在 aria 属性。
// outlineWidth 从 activeElement 的计算样式读取，证明实际焦点能被看到。
// 该检查不声称已完成全部颜色对比度测量，视觉截图还需人工复核。
// 反复按键不应新增分组内容或监听器，本轮没有全局快捷键注册。
// 测试不把空格当作播放键，样板没有真实媒体播放能力。
// 如果 focus 没到标题，原生 Enter 不会正确折叠，断言应失败而非跳过。
// 使用原生字符事件比手动 dispatch click 更能覆盖默认按钮激活。
// 键盘事件只发给隔离窗口，不向操作系统或用户正在使用的应用广播。
// 关闭分组不写用户偏好，测试离开页面后不期待保存展开状态。
// 多个 useId 关联应唯一，A 的 aria-controls 不能引用 B 的内容节点。
// 样板通过产品链接进入，再从真实返回入口离开，不留隐藏的状态面板。
// 浅深主题均使用产品菜单，不给 DOM 临时加 .dark 掩盖主题接入问题。
// 窄窗口检查滚动区域可容纳长文件名，截图保留完整应用外壳。
// wait 对每一步都有上限；截图失败同样由外层 harness 报非零退出。
// 输出目录归本轮隔离测试所有，不触及用户项目或素材路径。
// 返回后默认片段仍为 scene_02，样板选择不污染工程示例。
async function checkVideoUiControls(ctx) {
  // 隐藏窗口没有系统焦点，Chromium 默认不派发完整的 focusout 事件。
  // 使用浏览器的焦点模拟保持原生焦点路径，不给产品派发人工 blur 绕过逻辑。
  await ctx.win.webContents.debugger.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: true });
  await ctx.run("document.querySelector('a[href=\"/tools/video/editor/samples\"]').click()");
  await ctx.wait("document.querySelector('[data-editor-samples]')");
  // 新回退检查与原草稿、选择、折叠共用当前 A/B 实例，避免重新挂载掩盖串状态。
  // 原几何、主题和 GIF 宿主回归在外层继续执行，不为新增检查删减原验证。
  // 图片错误等待受外层主进程计时器约束，不依赖窗口可见时的 rAF。
  await fields(ctx); await selections(ctx); await groups(ctx); await fallbackStates(ctx);
  await ctx.delay(200);
  fs.writeFileSync(path.join(ctx.root, "ui-02-samples-dark.png"), (await ctx.win.webContents.capturePage()).toPNG());
  await ctx.run("document.querySelector('[data-theme-trigger]').click()");
  await ctx.wait("document.querySelector('[data-theme-option=light]')");
  await ctx.run("document.querySelector('[data-theme-option=light]').click()");
  await ctx.wait("document.documentElement.dataset.theme==='light'&&!document.documentElement.classList.contains('theme-ripple')");
  await ctx.run("document.querySelector('[data-theme-trigger]').click()");
  await ctx.delay(200);
  fs.writeFileSync(path.join(ctx.root, "ui-02-samples-light.png"), (await ctx.win.webContents.capturePage()).toPNG());
  await ctx.win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 880, height: 950, deviceScaleFactor: 1, mobile: false });
  await ctx.delay(200);
  ctx.smoke.check("narrow samples keep content inside their scroll host", await ctx.run("(()=>{const h=document.querySelector('[data-editor-samples]');return h.scrollWidth<=h.clientWidth+1})()"));
  fs.writeFileSync(path.join(ctx.root, "ui-02-samples-narrow.png"), (await ctx.win.webContents.capturePage()).toPNG());
  await ctx.run("document.querySelector('[data-editor-samples] a').click()");
  await ctx.wait("document.querySelector('[data-video-editor-ui]')"); await ctx.win.loadURL('app://app/tools/video/editor/samples/project'); await ctx.wait("document.querySelector('[data-video-editor-ui=\"UI-04\"]')");
  ctx.smoke.check("sample selection never changes the default project clip", await ctx.run("document.querySelector('[data-editor-clip=clip-02]').getAttribute('aria-pressed')==='true'&&!document.querySelector('[data-editor-samples]')"));
}
// 样板导航前默认工作区已经通过禁用业务操作检查，二者验证边界互补。
// 导航使用产品工作栏链接，证明独立路由不是只有测试才能到达。
// wait 检查样板根节点出现，不用固定 sleep 猜测 Next 路由已完成。
// Chromium 焦点模拟仅存在于自动化调试会话，不随安装包分发给用户。
// 它维持隐藏页面的焦点事件语义，并不修改页面 CSS 或业务返回值。
// 深色截图先捕获交互完成的同一 A/B 实例，防止新建页面丢掉隔离证据。
// 浅色通过现有主题菜单选择，不能直接在 document 上写 data-theme 绕过信号。
// 等待 theme-ripple 结束后再截图，避免半浅半深的过渡帧冒充主题错误。
// 关闭菜单后保留无遮挡的控件截图，错误和禁用状态仍在真实页面上。
// 窄视口改动只影响调试窗口，不修改应用全局最小尺寸或产品断点。
// 狭窄布局检查 scrollWidth 和 clientWidth，能发现长文件名撑开宿主的问题。
// 内容允许纵向滚动，因此不把正常高度增长误报为溢出。
// 同一 DOM 顺序在两列和一列间重排，不能复制移动版后误用另一份状态。
// capturePage 保存当前渲染像素，不把设计图重新编码当作运行截图。
// 文件名包含主题和窄屏信息，文档不会误把窄图标成宽屏验收。
// 返回通过样板自身链接，避免直接 loadURL 掩盖应用内路由清理错误。
// 默认时间轴 clip-02 仍选中，证明样板选择没有进入共享正式状态。
// 样板根节点离开后必须消失，不接受永久隐藏样板来伪装状态保留。
// 随后继续访问 legacy/GIF，可以发现样板样式是否泄露到普通工具。
// 截图只能佐证外观，所有交互结果仍由独立断言决定成功或失败。
// 即使截图写入成功，前面的任一断言失败都应让冒烟返回非零。
// 文件系统写入只保存隔离截图，不创建用户工程或输出视频。
// 这一路由没有真实模型和导出请求，不能把通过结果描述为媒体功能可用。
// 深浅截图的素材图片引用不变，主题不应给节目封面加反相滤镜。
// 真实系统 DPR、遮挡生命周期和完整读屏验收属于本轮未覆盖的维度。
// UI-03–UI-08 不因这个共享控件回归通过而自动变成完成状态。
// 覆盖范围说明：当前 hover 由共享样式和运行图人工检查，没有逐像素打分。
// focus 断言读取实际 outline，不仅检查元素可被 programmatic focus。
// disabled 的副作用在默认区检查，样板区补充 busy 和保存入口的语义。
// selected 同时从素材行和两种片段内容验证，避免只在按钮样例生效。
// empty 在实例底部，窄屏可以滚动到达，不要求一屏强塞全部状态。
// loading 固定夹具检验图标、文字和禁用，不声称覆盖真实异步请求超时。
// error 使用字段错误与素材错误两个不同位置，公共 UI 不共享业务错误变量。
// long text 采用资源文件名，中文翻译的极端长度仍需具体语言人工检查。
// missing 使用明确状态，不以浏览器自带破图标满足设计要求。
// 样板截图在交互后拍摄，因此 A/B 有意显示不同选中和数值状态。
// 窄截图沿用这一状态，能够发现断点切换后组件被卸载重置的问题。
// 键盘 Tab 的完整路线没有逐项自动枚举，本组重点检验隐藏分组 inert。
// 未实现的分隔拖动和轨道控制不在本 helper 中合成虚假成功事件。
// 字段精度比较对 3.50 使用字符串，因为单纯数值相等无法发现显示规则错误。
// 空格切换检查 pressed，不把颜色变化当作唯一开关证据。
// 当前主题由应用菜单写入隔离游客文档，不更改用户真实主题偏好。
// capturePage 不包含操作系统窗口装饰，但包含应用自定义标题栏与控制按钮。
// 独立样板没有第二个标题栏，所以截图可用于检查宿主是否重复。
// 软件渲染环境的通过不能代表真实 GPU、Windows 缩放或多个屏幕布局都通过。
// 后续真实媒体解码若改变内容高度，应重新运行几何与折叠测量回归。
// 没有轮询产品业务状态的后台循环，测试等待在 helper 返回后自然结束。
// debugger 会随被测窗口销毁清理，不需要给产品添加焦点模拟开关。
// 若路由跳转失败，明确根节点等待会超时，不继续截旧页面冒充新样板。
// 若静态图片解码失败，其他截图检查和 renderer error 检查会保留问题证据。
// 本组不覆盖完整读屏软件的实时播报，需要真实辅助技术环境进一步验收。
// 禁用原因文本与实际未接通能力一致，不能用“即将开放”代替明确说明。
// 错误状态没有假重试按钮，避免用户点击后得到并不存在的恢复结果。
// 回归完成后只返回默认路由，不写任何新视频工程或保存演示预设。
module.exports = { checkVideoUiControls };

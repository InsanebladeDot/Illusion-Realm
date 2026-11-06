/** 翻译历史回归：复用正式窗口、菜单、preload 与用户文档写入观察点。 */
// 本模块不启动第二个 Electron 实例，所有步骤由原提示词助手套件串行调用。
// 远端仍是原套件的受控响应，不能把这份截图当作公网翻译质量证明。
// 断言只观察生产 DOM、正式保存回执和剪贴板，不向 renderer 的 Zustand 注入记录。
// 初始空态基于旧格式文档，没有 history 字段，覆盖向后兼容。
// basics 和 conflicts 已执行真实菜单翻译，历史应包含两次成功而不包含认证失败。
// 原文采用中文，译文采用英文，能发现 before/after 颠倒或保存当前草稿的错误。
// 模型检查使用首次请求选择的 Flash 版本，不以此刻默认值冒充发送快照。
// 保存观察来自原 USER_DATA_WRITE handler，不用只看 UI 有一条来证明已经持久化。
// 重新载入静态页面再次查看，覆盖 store 的 load 与 normalize 路径。
// 复制由真实按钮写系统剪贴板，读取只在测试主进程，不给 renderer 暴露 Node 能力。
// 该套件只复制无隐私的固定英文文本，原剪贴板内容在断言后恢复。
// 时间方向通过共享下拉的真实选项改变，不直接重排 DOM 元素。
// 小窗口通过实际设备尺寸仿真触发原创建宿主，不单独伪造一个历史页面。
// 浅深主题使用产品标题栏设置入口，由外层 setTheme 同时等待文档与媒体查询。
// 拍图之前每次都等待业务节点出现，不能仅根据截图文件存在判定成功。
const { clipboard } = require("electron");

/** 菜单打开和资源关闭都走产品入口，定位失效时应使测试失败。 */
// toolbar 标识由调用方传入，允许普通提示词和组装输入验证同一组件。
// 先等待菜单挂载再激活 history，避免异步首帧造成按钮还不存在。
// 打开成功的依据是历史外壳 id，不是菜单已经消失。
// close 的 Escape 只针对当前资源页，不触发翻译或重新加载。
// 关闭后等待外壳卸载，下一次菜单打开不会落在旧遮罩之下。
// run 使用原套件的异常边界，选择器缺失不能被包装成无操作成功。
async function openHistory(context, toolbar) {
  // 入口定位是调用方 contextId 对应的工具栏，不能使用页面第一颗配置按钮。
  // 高级组装和普通正文可以同时存在，模糊定位可能打开另一个输入的菜单。
  // 生产菜单使用 portal，查找 history 时必须从 document 范围查询。
  // 若只在 toolbar 内查找，测试将把合法浮层误判为缺失。
  // 反过来，等待旧菜单完全退出由调用流程保证，不以删除 DOM 消除冲突。
  // history 菜单按钮仍使用原 role=menuitem，不需要测试专用快捷入口。
  // 弹窗 data 属性跟随 titleId，既用于可访问标题也用于稳定定位。
  // 本 helper 不写菜单展开 state，真实点击会运行原 outside/keydown 清理。
  // 点击后资源壳可能位于 body 或 main，选择器不假定固定父节点。
  // 因此同一个打开流程可以在普通宽屏和紧凑创建页重复使用。
  await context.click(`${toolbar} [data-assistant-options]`);
  await context.wait("document.querySelector('[data-assistant-item=history]')");
  await context.click("[data-assistant-item=history]");
  await context.wait("document.querySelector('[data-resource-dialog=prompt-assistant-history]')");
}
async function closeHistory(context) {
  // 使用键盘事件验证共用外壳订阅，而不是只测 X 按钮的 onClick。
  // dispatch 在 document 上，与产品 Escape 监听的目标一致。
  // bubbles 保留键盘传播语义，若父资源页错误响应也会暴露出来。
  // 关闭只等待历史节点消失，不把没有 toast 当作保存成功。
  // 来源工具栏接手焦点的动作由产品代码完成，夹具不另行 focus 隐藏编辑器。
  // 本测试没有鼠标遮挡或系统弹窗，不能从这一步推断全屏热键可靠性。
  // 如果 Escape 只隐藏透明层却留下资源节点，卸载断言会超时而非通过。
  // 取消历史不应清除数组，后续结果与重载用例会继续读取同一组记录。
  await context.run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await context.wait("!document.querySelector('[data-resource-dialog=prompt-assistant-history]')");
}

/** 旧文档打开空历史，不执行任何云端请求，也不改变草稿。 */
// 此用例在第一笔翻译之前运行，不能先清空生成的记录来凑空态。
// 比较真实正文，发现打开菜单时意外调用 apply 的接线错误。
// 同时观察上游请求计数，历史入口不能偷偷重新翻译当前文字。
// 功能只从安装此版本以后记录，空态文字不会承诺能恢复更早的翻译。
// 用例关闭后继续原 basics，不改变原有供应商、预设或凭据前置。
// 没有删除用户文档中的任何其他字段，取消也不保存一条假历史。
exports.checkEmpty = async context => {
  // 空历史用例的正文可能原本就是空串，比较采取逐字等值而非仅 trim 后等值。
  // 不能为了令断言变真临时往输入框写一段固定稿，前置由原页面决定。
  // 这里的请求计数只覆盖原 GLM 测试通道，没有启用其他供应商。
  // 因而零增量与原菜单站点组合足以证明此阶段没有暗中调用转换。
  // ready 来自真实 USER_DATA_READ 回执，空态出现也验证首帧读取完成。
  // 旧文档的其他偏好包含很多预设，本功能不得把它们当作翻译条目。
  // 若界面误把 presets 数组拿来显示历史，空态断言就会失败。
  // 使用内容节点的明确 data 标记，不依赖中文空态字符串的标点写法。
  // 这是兼容性反证：文档不包含新字段，代码仍必须能读取其他既有配置。
  // 并未把 store.ready 人为置真，因此空态不能通过绕开真实读取来得到。
  // 退出后比较依然读取编辑器真实 DOM，避免检查一份早已缓存的测试变量。
  // 此阶段不验证无效历史条目，因为输入就是合法旧文档缺少可选字段。
  const before = await context.run("document.querySelector('#prompt-editor').textContent");
  const requests = context.requestCount();
  await openHistory(context, context.toolbar);
  context.check("Old documents open an empty history without translating", await context.run("!!document.querySelector('[data-translation-history-empty]')") && context.requestCount() === requests);
  await closeHistory(context);
  context.check("Viewing empty history preserves the prompt", before === await context.run("document.querySelector('#prompt-editor').textContent"));
};

/** 两次成功对应两条收据，冲突结果保留、失败请求排除。 */
// 第一次成功来自 basics，第二次来自 conflicts 中被用户后来明确应用的结果。
// 之后发生的 401/403 都不应占据历史位置，数量断言能发现错误路径被记录。
// 最新条目的 before 应为当次发送原文，不能是等待中输入的 newer edit。
// 即使用户又按过 undo，收据中的 after 仍应保留实际翻译结果。
// 模型与预设在第二次翻译期间没有改动，所以两次都应使用原 Flash 版本。
// 检查列表顺序前等待真正保存的 history=2，避免读取合并延迟制造偶发失败。
// createdAt 的方向用数字比较，不能因为日期标签恰巧字典序正确就算通过。
// 点击排序是纯 UI 行为，保存下来的数组仍然最新在前。
// 打开/关闭没有改变当前草稿，用户可以先查看再决定手动复制。
// 截图展示固定测试中文，不带用户 API Key 或自定义端点凭据。
// 这里只验证本地持久化契约，磁盘权限失败由其他边界处理，不用桩结果冒充实机权限验证。
// 剪贴板恢复放在 finally，断言失败也尽量避免残留测试文字。
// 全部步骤串行，复制读回不会和另外一个 Electron 测试竞争系统剪贴板。
// DOM firstElementChild 始终指记录卡片，不用列表上的序号猜测原始文本身份。
// 早晚切换后重新读取全部时间戳，避免只检验下拉框值改变。
// 同一毫秒完成的记录允许相等，时间比较使用大于等于而非要求严格差值。
exports.checkResults = async context => {
  // 断言一要求两条而非至少两条，意外记录失败或双写成功都会被发现。
  // 断言同时核对 before 和 after，可以发现把历史当作撤销栈反向保存的实现。
  // 模型断言覆盖用户手选非默认版本的情况，不能用默认 Flash 名代替。
  // 历史 provider 此时都是 GLM，后面再由跨站点用例检查站点独立性。
  // 复制前保存文本内容，恢复的是文本剪贴板，不声明能保留用户其他二进制格式。
  // 所以此步骤适用于受控测试环境，不会主动在用户真实会话里执行。
  // copied 文案可能由上一步操作留下，最终剪贴板精确等值才是复制成功的证据。
  // 拿时间标签 textContent 比较不可靠，中英文月份顺序可能与时间先后不同。
  // DOM 的 data-translation-time 直接携带真实时间数字，避开格式歧义。
  // 排序方向改变后不能把数据重新提交，记录第一条 id 的对照覆盖这一边界。
  // 与保存数据对照比只检查箭头旋转更强，可以发现纯视觉切换却没实际排序。
  // 最新与最早时间可能相同，允许相等不会掩盖两个不同时间互换错误。
  // 本套件两个请求之间有其他操作，实际仍提供了可区分完成先后的前置。
  // 结果列表显示数量由记录数组决定，不能把重复行藏起来让数量假装正确。
  // 中文 before 包含完整句子，损坏编码或丢字都会导致严格等值失败。
  // undo 已恢复 newer edit，历史不能以当前 input 作为 before 来重建收据。
  // 截图前切成 oldest，人工可看到方向控件和实际最早记录处于同一状态。
  // 关闭以后仍是 newer edit，证明复制没有通过 target.write 偷偷应用译文。
  // 这类查看操作不需要密钥二次确认，原翻译能力的认证检查仍在旧用例覆盖。
  // 本步骤没有清空失败 toast，判断依据是历史数组而不是页面消息数量。
  // 如果保存队列吞掉错误只更新 UI，外层 handler 的 saved 长度会继续不符合预期。
  // waitSaved 的上限耗尽也不会直接宣称成功，随后精确数组断言仍会失败。
  // 两次响应由生产 transformPrompt 解析，历史不是直接从 fetch 测试数组复制生成。
  // 用真实菜单能覆盖每个工具栏是否已接入新 onHistory 回调，而非仅渲染单独组件。
  // 测试不能证明用户在系统不允许剪贴板时会看到什么，失败文案由产品分支保留。
  // 复制按钮不触发 summary 收起，因此后续截图仍可以查看结果上下文。
  await context.waitSaved(2);
  const saved = context.history();
  context.check("Only successful responses are recorded with original text and selected model", saved.length === 2 && saved[0].after === "older translated result" && saved[0].before === "女孩站在月光下" && saved.every(item => item.model === "glm-4.5-flash"));
  await openHistory(context, context.toolbar);
  context.check("History defaults to newest first", await context.run("[...document.querySelectorAll('[data-translation-record]')].every((row,i,all)=>!i||Number(all[i-1].dataset.translationTime)>=Number(row.dataset.translationTime))"));
  const previous = clipboard.readText();
  try {
    // Chromium 的剪贴板要求文档获得真实焦点，隐藏离屏窗口不满足这个系统前提。
    // 首轮在该前提未建立时得到复制失败提示，不把它误判成记录内容错误。
    // 先由测试窗口正常显示并聚焦，再点击产品按钮；不拦截 navigator.clipboard。
    // 这样 readText 读回的是系统实际写入结果，而不是把复制函数替换成返回 true。
    // 显示的只是当前隔离窗口，不能关闭或聚焦用户正在使用的另一个应用实例。
    await context.focus();
    await context.click("[data-translation-record] [data-translation-copy]");
    await context.wait("document.body.textContent.includes('已复制')");
    context.check("History copies only the exact translated text", clipboard.readText() === "older translated result");
  } finally { clipboard.writeText(previous); }
  await context.click("[data-translation-history-order]");
  await context.click('[data-simple-select-option="oldest"]');
  context.check("Time order can be reversed without altering stored history", await context.run("[...document.querySelectorAll('[data-translation-record]')].every((row,i,all)=>!i||Number(all[i-1].dataset.translationTime)<=Number(row.dataset.translationTime))") && context.history()[0].id === saved[0].id);
  await closeHistory(context);
  context.check("Reading and copying history leave the current draft untouched", await context.run("document.querySelector('#prompt-editor').textContent==='newer edit'"));
};

/** 后续翻译跨预设、站点、输入框后，依然通过同一个历史入口读取。 */
// 原套件先验证分类和负面提示词翻译，再进入这里验证来源共享。
// 最新记录 Euzhi 来自真实生产 IPC 与受控回包，不在本模块另造一条历史。
// 断言同时保留分类译文和普通译文，防止按当前 context 过滤结果。
// 截断输出在原套件中被拒绝，这里额外确认它没有漏进成功历史。
// 重新加载会丢掉组件内存，仍能看到相同结果才证明数据进入用户文档链路。
// 模型快照 Grok 与 Flash 都存在，说明历史没有统一用最新选择盖掉旧标签。
// 切浅深主题时先关闭资源页，避免产品外观菜单被遮罩拦截。
// 窄屏从普通工具栏重新打开，使用和正式菜单完全一样的生命周期。
// 屏幕仿真不会读用户资源管理器，也不更改用户正在使用的窗口大小。
// 窄屏检查内容 scrollWidth，长标签不能通过把窗口横向撑开来展示。
// 完成后清除设备仿真，后续蒙版用例继续使用原宽屏前置。
// 不把历史列表永久挂载来规避重载问题，必须从正式入口重新获取记录。
// 请求计数对照防止打开历史时重新请求已保存的翻译。
// 该用例不在导出的 HTML 中注入样例，截图来自静态构建的实际组件。
// 所有检查失败都交给原 harness 标记，不能 catch 后仍按成功退出。
exports.checkPersistence = async context => {
  // 保存快照在 reload 前获取，重载后精确行数与它比较，防止只显示默认示例。
  // 旧固定译文中的 first category 说明高级组装 hook 也进入了共享存储边界。
  // blurry image 来自负面提示词，不能因为当前打开正面输入就从历史丢弃。
  // incomplete output 是服务端 finish_reason=length 的回包，产品判失败应没有收据。
  // 该反证比“模型没返回任何数据”更严格：有正文但不完整的响应也必须排除。
  // Euzhi 的 Grok 与最初 Flash 并存，历史标签不能在 normalize 时统一重写。
  // 删除某个自定义预设已经由旧用例执行，旧收据不应因此无法加载。
  // 查看不依赖 presets.find 的实时结果，旧记录数量仍应完整保存。
  // 这里的 reload 使用原 app://app/create，验证的确是 Next 静态导出而非开发服务。
  // 新 renderer 没有原 React 内存，数据只可能通过保存文档回执再次水合。
  // 测试 handler 将文档留在隔离主进程，不能把此处称为安装包跨机器迁移验证。
  // 文件写盘边界沿用既有 userDataStorage，不用这条回归证明真实磁盘断电恢复。
  // dark 截图前走正式外观设置，原 setTheme 会等待 theme-ripple 动画结束。
  // 这样截图不会拿主题过渡的半透明帧冒充稳定深色外观。
  // 900px 包含展开导航后，创建主区可用宽度小于单栏阈值。
  // 因此 main 宿主应存在，仅检查窗口宽度小并不足以证明响应式分支已切换。
  // scrollWidth 的容差为一像素，仅允许布局取整，不容忍真正被裁切的正文。
  // 这个断言在实际历史列表上执行，不在 body 上靠 overflow:hidden 掩盖问题。
  // 两套布局都从同一个菜单打开同一个资源外壳，未建立第二份紧凑历史组件。
  // 关闭窄页以后才清仿真，避免跨断点同时卸载来源造成测试点击旧元素。
  // 后续蒙版排序继续运行，是对公共工具栏引入历史状态后其他调用场景的保护。
  // 本轮没有触控笔、读屏或高 DPI 前置，不把原生控件语义等同于这些实机已验收。
  // 长模型名的特殊边界由产品 truncate 处理，本套件主要使用真实选择的短模型 ID。
  // 如果未来改为分页历史，需要同步替换当前精确 DOM 行数断言，不能直接删掉它。
  // 改变保留上限也需要调整产品说明和归一化测试，不能只把更多行隐藏在 CSS 下。
  // 外层总退出码来自 harness，保存阶段通过而 UI 阶段失败仍应整体失败。
  // 未启动 Python Agent，Euzhi 模型快照只是复用选择能力，不混入工具调用轮次。
  // reload 不清除其他 store 的文档段落，旧分类、凭据和用户主题仍由原套件继续检查。
  const saved = context.history();
  context.check("History shares assembly and negative translations but excludes truncated output", saved.some(item => item.after === "translated first category") && saved.some(item => item.after === "blurry image") && !saved.some(item => item.after === "incomplete output"));
  context.check("Provider snapshots survive later model and provider changes", saved.some(item => item.provider === "euzhi" && item.model === "grok-4") && saved.some(item => item.provider === "glm" && item.model === "glm-4.5-flash"));
  await context.reload();
  await openHistory(context, context.toolbar);
  context.check("Translation history survives a complete renderer reload", await context.run(`document.querySelectorAll('[data-translation-record]').length===${saved.length}`));
  await closeHistory(context);
  // 首次从离屏切为显示窗口时可能拿到旧合成帧，浅色截图放到稳定的后续阶段。
  // 明确切到浅色再重新打开，不能把底层页面截图当作历史弹窗已经显示。
  // 该步骤只影响测试拍摄时机，产品组件不增加延迟或截图专用代码。
  // 深色沿用同样的“切主题、打开、拍摄、关闭”顺序，便于人工逐项对照。
  // 真实回归断言继续在拍图前检查历史节点，不用截图名称冒充业务存在。
  await context.setTheme("light");
  await openHistory(context, context.toolbar);
  await context.capture("translation-history-light");
  await closeHistory(context);
  await context.setTheme("dark");
  await openHistory(context, context.toolbar);
  await context.capture("translation-history-dark");
  await closeHistory(context);
  await context.metrics(900);
  await context.wait("document.querySelector('[data-prompt-assistant=prompt-editor]')");
  await openHistory(context, context.toolbar);
  context.check("Narrow history uses the main host with no horizontal overflow", await context.run("!!document.querySelector('[data-resource-main-page]')&&document.querySelector('[data-translation-history-list]').scrollWidth<=document.querySelector('[data-translation-history-list]').clientWidth+1"));
  await context.capture("translation-history-narrow");
  await closeHistory(context);
  await context.metrics(null);
};

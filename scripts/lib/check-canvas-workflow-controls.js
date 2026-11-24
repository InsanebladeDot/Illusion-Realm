// 正式画布配置回归：菜单和输入都通过产品 DOM，保存读真实隔离 JSON。
// Electron 输入、DOM click 和 input 事件是自动证据，不写成人工鼠标或键盘验收。
// 本模块复用主冒烟窗口，不能再启动第二个 Electron 争抢实例锁。
// 没有注入节点成功结果，也不绕过画布命令直接更新 React Flow 状态。
const fs = require("node:fs");

// 先定位当前真实图片节点，之后所有参数操作都保留同一稳定身份。
// 保存按钮走原用户文档服务，不用测试返回值夹具冒充文件写入成功。
// 主脚本提供实际临时文档路径，读取不会访问用户的正式 user JSON。
// 等待写盘内容而非按钮变灰，能发现 UI 已改但白名单漏字段的保存故障。
// 同一 save helper 用于模板切换、数量和文本，防止每组采用不同保存捷径。
// 失败由原看门狗和退出护栏处理，不捕获后继续打印总通过。
// 节点仍可能没有 media，本组不把它算作真实媒体解码验证。
// 基础冒烟后续继续验证真实视频、音频和工程交换。
// 本组只检查配置行为，没有网络生成或 LoRA 权重文件加载。
// 保存快照从磁盘读取，不能拿 UI 内存对象自证持久化通过。
// 等待保存状态包含已保存，再读盘，避免异步节流写尚未完成时误判。
// 不强制改变产品保存节流，也不加入假延时成功反馈。
// 数据来源分三层：页面按钮表达用户意图，preload 进入生产写入器，最后直接读磁盘。
// 如果仅 UI 缓存正确而保存白名单没登记字段，最后一层断言会发现丢失。
// 如果写盘失败，已保存状态不会出现，有限 wait 必须以失败退出。
// 如果按钮只是显示假成功但没有真实写盘，旧 JSON 也会使后续值比较失败。
// 这种独立读回是为了避免产品自己返回自己刚传入的对象造成假通过。
// save 不读取 React 私有 fiber，也不访问 zustand 内部 setter。
// 文档中的其他保留段继续由原写盘器合并，本模块不直接覆盖用户文档。
// 此辅助函数从同一临时文档读回，不能从上次运行残留目录读取旧成功结果。
// 每次冒烟根由主脚本分配，平行 Node 纯测试不会改动该目录。
// 主脚本只有一个 BrowserWindow，资源生命周期断言仍由原流程负责。
async function save(ctx) {
  await ctx.click('.hy-project-header [aria-label="保存画布"]');
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  return require("./canvas-library-fixture").readCanvas(ctx);
}

// 级联三层都经原公共菜单执行，父项只是导航，最后叶子才修改工作流。
// 标记来自正式菜单项身份，不能用文案猜测或绕过组件 action。
// 触发器限定在图片页脚，避免点到视频菜单或设置图标。
// 每层出现后再下一步，窄窗逐级模式和宽窗多列模式均可沿身份定位。
// 点击当前叶子仍应打开配置，不能用“编号没变”作为阻止设置的理由。
// 非本地使用已接入的服务菜单；本组只验证本地设置，不推断远端推理效果。
// 本 helper 不直接写 workflow，保存结果必须由正式 UI 的 onChange 产生。
// 选择模板后侧栏属于当前节点，其他节点的选中态不会替换目标身份。
// 原菜单负责关闭和焦点，测试不手动删除 portal 来伪造收起。
// 这是自动菜单调用，不把它当触屏或屏幕阅读器验证。
// 本地→Anima→标准文生图应保存 anima，不能保存路径标签字符串。
// 本地→SDXL→标准文生图应保存 sdxl，重名叶子依靠父级系列消除歧义。
// 图片编辑叶子的身份仍为 anima-edit，旧工程不必因菜单改版升级版本。
// 导航父列后叶子列表出现，证明确实使用 children 展开而非一个平铺假菜单。
// 本 helper 在当前选中图片内定位，防止同画布视频按钮恰好文本相同。
// 选择当前模板也打开设置，用于验证图标与菜单是两条有效配置入口。
// 同一入口打开侧栏后父菜单必须收起，否则 Escape 会有两个竞争处理器。
// wait 只检查真实侧栏挂载，不直接设置 open 状态或附加 DOM 占位。
// 横向空间足够时仍由公共菜单多列定位，测试不手动设置 left/top。
// 资源来源标签不参与业务执行，配置编号由叶子 action 独立产生。
// 选择后没有任何生成成功断言，不能用配置面板出现代表生成能力已完成。
// 若 workflow 只是改了按钮文字但未进入节点，后续保存的参数归属断言会失败。
async function workflow(ctx, series, leaf) {
  // 指针选择与动态菜单挂载都经过 React 提交，先等实际触发器，避免读取未出现的节点控件。
  // 该等待不会替用户选择目标；若选择未生效仍会有界失败，不能伪造成功状态。
  await ctx.wait("document.querySelector('[data-kind=image][data-selected=true] [data-canvas-workflow] > .hy-chip')");
  await ctx.click('[data-kind=image][data-selected=true] [data-canvas-workflow] > .hy-chip');
  await ctx.wait("document.querySelector('[data-assistant-item=local]')");
  await ctx.click('[data-assistant-item=local]');
  await ctx.click(`[data-assistant-item=${series}]`);
  // 保留真正展开后的多列菜单截图，来源入口与当前本地系列在同一菜单。
  // 截图在执行叶子前采集，不能用收起后的胶囊代替级联状态证据。
  await ctx.shot(`64-workflow-${series}-${leaf}`);
  await ctx.click(`[data-assistant-item=${leaf}]`);
  ctx.smoke.check("Workflow selection does not open parameter settings", await ctx.run("!document.querySelector('.hy-image-sidebar')"));
  await ctx.click('[data-kind=image][data-selected=true] .hy-panel-submit [data-canvas-workflow] button');
  await ctx.wait("document.querySelector('.hy-image-sidebar')");
}

// 编辑原公共 contenteditable，input 事件必须经过 PromptInput 的受控写回。
// 不从全局固定 prompt-editor id 读写，避免串到创建页原草稿。
// 该事件属于自动接线验证，真实输入法和实体打字手感仍待人工。
// 选择器范围限定在侧栏，正向框和负面框各有自己的稳定 DOM id。
// 测试文字是明确夹具，不调用翻译服务或伪造异步翻译结果。
// 设 textContent 只准备输入，实际参数必须通过后续 input 事件进入节点事务。
// 无法输入时应失败，不以直接修改磁盘数据替代 UI 更新。
// 保存后再验证正文，排除纯 DOM 改了而 React state 仍旧的假象。
// contenteditable 不是 textarea，不能沿用 HTMLTextAreaElement.value setter 做假输入。
// 因此测试明确修改正文 textContent 后发送 input，走原 PromptInput.write。
// 正向和负面输入分别指定区域，工具助手的独立 contextId 由产品组件提供。
// 若侧栏复制了创建页固定 id，DOM 查询或回写会命中错误区域，后续磁盘比较会暴露。
// text helper 不去模拟 IME composition，中文输入法仍应列为人工待验。
// 它也不验证系统剪贴板，因此不会把 DOM 写入等同 Ctrl+V 人工粘贴。
// 输入后不直接调用保存器，后续 save 仍从正式页面入口触发。
// 文字留存不依赖侧栏保持打开，关闭和切换工作流后仍应从节点恢复。
async function text(ctx, selector, value) {
  await ctx.run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();e.textContent=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
}

// 图片原本已存在且已选中，先操作数量而不是注入带参数的初始节点夹具。
// 展开条复用比例组件，因此验证已选焦点、Escape 与保存三条真实行为。
// ×6 是生成意图，测试不把它写成六张图片已经生成成功。
// 配置按钮必须是实际设置图标，不能保留不能点击的费用横杠。
// 数量变化只改当前节点，不改变视频或音频节点的任何参数。
// 截图包含正式外壳，样板 HTML 与本轮真实运行证据分开。
// 标题名称从当前节点数据读取，不使用静态样例参数冒充可编辑对象。
// Escape 只收起数量条，必须返回原触发器，不删除底层节点。
// 独立组件复用还要检查主模型与 LoRA 的内层会话不会同时打开。
// 模型扫描为空只用于检查空资源状态，不能声称已验证本机模型权重加载。
// 参数修改保存后再切系列，证明每套默认配置互不污染。
// 删除快捷键在侧栏按钮上按下也必须隔离，不能只检查文本框内的 Delete。
// 本组不触发生成；真实按钮、批量回填与取消由生成专项独立验证。
// 本组结束时关闭侧栏，让基础冒烟继续自己的比例、主题和真实媒体场景。
// 关闭不会撤回已确认参数，后续保存恢复能继续看到同一数据。
// 原数量是缺省一张，打开时已选按钮应该真正获得焦点。
// 焦点比较使用 document.activeElement，不以 CSS class 或 aria-selected 代替。
// 截图六十记录实际展开条，而不是预先绘制的样板图片。
// Escape 后弹层 DOM 应消失，触发器 activeElement 仍可继续键盘操作。
// 二次打开选择六张，之后回读磁盘的 batchSize 必须为数字六。
// 如果选项只改临时 UI 而没有 onChange，磁盘断言会得到缺字段并失败。
// 原 Settings 图标和模型菜单都复用同一参数外壳，不可出现互不一致的配置。
// 参数侧栏应同时包含主模型、已选扩展和公共输入，而不是一个只有标题的空框。
// 内容以真实组件 data 标记定位，不用逐字匹配静态样板内容自证复用。
// checkSidebar 关注内层弹窗和回写，checkIsolation 关注不同模板参数归属。
// checkLayout 关注正式绘制的主题颜色与可用主区边界。
// checkCopies 关注同一来源复制出的节点能否单独修改嵌套附表。
// 各场景顺序执行，没有并发修改同一 JSON 或产生独立计时生成任务。
// 最后关闭侧栏验证卸载，隐藏输入不能继续进入 Tab 顺序。
// 后续基础场景仍能选择原节点和操作时间，不因配置流程留下遮罩。
// 数据验证通过不代表人工点击体验通过，报告会保持两种证据分类。
async function checkCanvasWorkflowControls(ctx) {
  const { run, click, wait, smoke, key, shot } = ctx;
  await click('[data-kind=image] [data-canvas-batch] > button');
  smoke.check("Batch strip focuses confirmed count", await run("document.activeElement===document.querySelector('[data-canvas-batch] [aria-pressed=true]')"));
  await shot("60-batch-strip");
  await key("Escape");
  smoke.check("Batch Escape restores trigger focus", await run("!document.querySelector('.hy-ratio-popup')&&document.activeElement.matches('[data-canvas-batch] > button')"));
  await click('[data-kind=image] [data-canvas-batch] > button');
  await click('[data-canvas-batch] button[aria-label="×6"]');
  smoke.check("Batch ×6 persists in actual node JSON", (await save(ctx)).nodes.find(node => node.data.kind === "image").data.batchSize === 6);
  await workflow(ctx, "anima-series", "anima");
  smoke.check("Settings sidebar contains original controlled image widgets", await run("!!document.querySelector('.hy-image-sidebar [data-model-cover-select]')&&!!document.querySelector('.hy-image-sidebar [data-selected-extensions]')&&!!document.querySelector('.hy-image-sidebar [id$=\"-negative\"]')"));
  await checkSidebar(ctx);
  await checkWholePanel(ctx);
  await checkSizeSync(ctx);
  await checkIsolation(ctx);
  await checkLayout(ctx);
  await checkCopies(ctx);
  await checkRestore(ctx);
  await click('.hy-image-sidebar header button');
  smoke.check("Closed sidebar removes hidden editable controls", await run("!document.querySelector('.hy-image-sidebar')"));
  // 返回焦点应指向实际节点工作流触发器，不是 body 或已卸载的菜单叶子。
  // 这里用真实 activeElement 检查，不能仅凭触发器仍存在就判定返回正常。
  smoke.check("Sidebar close restores the node workflow trigger", await run("document.activeElement.matches('[data-kind=image] [data-canvas-workflow] button')"));
}

// 主模型资源页和 LoRA 页是两类会话，不能共用 open 布尔同时弹出。
// 空模型索引下仍应展示原选择器的空态，不插入演示封面充数。
// 内层 Escape 只关闭资源页，外层参数和正文保持可见。
// 用节点总数验证 Delete 隔离，不能只看错误弹窗有没有出现。
// 输入回写同时检查节点页脚原引用编辑器，证明侧栏不是另一份脱节草稿。
// 负面词与正文分开保存，不可用全局 DOM id 导致互相覆盖。
// 关闭后再次打开应该恢复确认文本，不能只在第一次挂载显示正确。
// 已确认的数量继续存在，文本编辑不能用完整旧快照覆盖先前数量。
// 所有保存通过生产文件写入器，文件字节从隔离目录实际读取。
// 模型资源夹具只提供空列表，不验证真实封面请求或目录扫描性能。
// 原选择器的关闭和焦点路径由产品实现，测试不手动改 inert 属性。
// 截图中主模型名来自实际模板，不是测试伪造的服务成功输出。
// 设置回归不发起生成任务；费用与真实推理质量不属于该组自动证据。
// 获取节点数量来自 DOM，仅用于断言 UI 修改没有删掉实体节点。
// 若内层列表已开但仍显示 LoRA 弹窗，两个 dialog 会使明确数量断言失败。
// Delete 在关闭按钮拥有焦点时发送，覆盖非输入字段上的快捷键隔离。
// 单测只在文本框按 Delete 会漏掉按钮事件冒泡导致整张节点被删的缺陷。
// 节点总数前后相同才说明删除命令没穿透，侧栏仍可见不足以证明安全。
// 打开主模型页后原 LoRA 选择器不应一起打开，dialog 数量必须恰好为一。
// 该断言专门防止 modelSelecting 与 loraSelecting 被错误合成同一个 open。
// Escape 先关闭主模型资源页，再检查侧栏仍在且资源 dialog 已消失。
// 外层正文应保持原值，测试继续写两份不同文字以检查受控目标身份。
// 正向文字写 node.prompt，负面文字写 imageParameters.anima.negative。
// 两个字段都从磁盘回读，不能仅检查可见编辑器内 textContent。
// 同时确认 batchSize 仍为六，避免表单写回采用旧 data 整份覆盖。
// 节点原引用编辑器也必须更新，证明侧栏与节点没有各存一份 prompt。
// 模型文件未选中不影响正文设置，配置可以离线保存。
// 截图六十一保留实际模板文件名、侧栏正文和节点正文同屏对照。
// 主模型的空封面仍使用原组件布局，不以下载一张随机图伪装当前模型。
// 不在这里检查视觉接近度百分比，该百分比需要用户或独立图像对照评估。
// 图片正文从textarea切换为原引用编辑器，仍须保留设置侧栏与节点共用prompt的契约。
// 这一组继续从设置侧栏写回，再读取节点真实textContent，不只比较显示装饰。
// textContent必须仍是原纯文本，若标签的文件主体混进来，侧栏同步检查就会失败。
// 原模型和扩展的弹窗互斥检查保留，不能因输入换了组件就省略旧资源调用方。
// 负面词仍在原图片表单中，不因为正向支持@就复制一套负面输入。
// 使用通用fill helper发送input，不能设置contenteditable元素无效的value属性。
// 侧栏回调与节点回调都进入同一个节点事务，关闭后重新打开仍检查同一组已确认参数。
// 修改正文不自动发起生成，真实输出回填由独立生成专项检查。
// 复制和重开场景继续读取同一编辑器，选择器更新不降低原实例隔离覆盖。
async function checkSidebar(ctx) {
  const { run, click, wait, smoke, key, shot } = ctx;
  const before = await run("document.querySelectorAll('[data-canvas-node]').length");
  await key("Delete");
  smoke.check("Sidebar button Delete does not delete node", await run(`document.querySelectorAll('[data-canvas-node]').length===${before}`));
  await click('.hy-image-sidebar [data-model-cover-select]');
  await wait("document.querySelector('[role=dialog]')");
  smoke.check("Main model picker opens one resource dialog", await run("document.querySelectorAll('[role=dialog]').length===1"));
  await key("Escape");
  smoke.check("Model Escape retains sidebar", await run("!!document.querySelector('.hy-image-sidebar')&&!document.querySelector('[role=dialog]')"));
  await ctx.fill('[data-kind=image] [data-video-prompt]', "侧栏节点独立正文");
  await text(ctx, '.hy-image-sidebar [id$=\"-negative\"]', "独立负面词");
  const data = (await save(ctx)).nodes.find(node => node.data.kind === "image").data;
  smoke.check("Sidebar prompt and negative persist independently", data.prompt === "侧栏节点独立正文" && data.imageParameters.anima.negative === "独立负面词" && data.batchSize === 6);
  smoke.check("Node prompt reflects sidebar edits", await run("document.querySelector('[data-kind=image] [data-video-prompt]').textContent==='侧栏节点独立正文'"));
  await shot("61-sidebar-anima-dark");
}

// 侧栏仍是原组件，但本轮明确移除了正向、尺寸与生成底栏，不能沿用上一轮完整表单断言。
// 原指南、反向、高级采样与加载设置继续可用；正文/尺寸在节点工具条统一编辑。
// 全局草稿前后比较检验参数隔离，不把独立节点配置写到创建页。
async function checkWholePanel(ctx) {
  const globalBefore = JSON.stringify(JSON.parse(fs.readFileSync(ctx.documentPath, "utf8")).createForm);
  await ctx.click('.hy-image-sidebar [data-prompt-guide-series]');
  await ctx.wait("document.querySelector('[role=dialog]')");
  await ctx.key("Escape");
  ctx.smoke.check("Original guide Escape retains settings sidebar", await ctx.run("!!document.querySelector('.hy-image-sidebar')&&!document.querySelector('[role=dialog]')"));
  ctx.smoke.check("Settings reuse original groups without duplicate prompt size or submit", await ctx.run("!!document.querySelector('.hy-image-sidebar [data-advanced-settings]')&&!document.querySelector('.hy-image-sidebar [id$=\"-positive\"],.hy-image-sidebar [data-create-size],.hy-image-sidebar [data-generate-button]')"));
  await checkSchedulers(ctx);
  await save(ctx);
  ctx.smoke.check("Node settings leave Create global draft untouched", JSON.stringify(JSON.parse(fs.readFileSync(ctx.documentPath, "utf8")).createForm) === globalBefore);
}

// 调度器通过原高级设置展开，不挂载另一套测试专用选单。
// 选项名称和排列来自用户两张菜单截图，而不是从产品清单生成预期。
// 精确比较九项可发现漏掉尾部选项、大小写美化和重复项。
// 菜单滚动只改变可见窗口，不应改变已经确认的节点参数。
// 选择末项覆盖菜单底部的可达性，不能只验证默认 simple。
// 点击仍经过 OptionSelect 的原回调，不直接写入节点或全局 store。
// save 从隔离工程真实读盘，标签变化不能代替持久化证明。
// 当前高级区初始可能折叠，读取原开关状态后再决定是否展开。
// 若已经展开则不再次点击开关，避免测试把所需控件收起。
// 调度器 aria-label 使用原双语词条，本轮窗口语言固定中文。
// 只定位侧栏内的选择器，不能误点其他工作区的相同标签。
// 九项完全保留 ComfyUI 原名称，下划线属于实际参数值的一部分。
// 截图先记录顶部，再把最后一项滚入视口记录底部。
// 这两张截图来自正式静态构建，不把用户参考图当成实施证据。
// 选择 kl_optimal 后关闭菜单，由产品管理 open 状态。
// 本组没有调用真实 GPU，因此保存成功不代表服务器支持全部调度算法。
// 工作流参数直通还由纯源码构建测试独立检查。
// 创建页与画布共用枚举；全局草稿不串值由外层前后比较继续检查。
// 新清单不强行重置旧 scheduler，历史工程读取仍按原字符串恢复。
// 失败时保留实际 DOM 供看门狗截图，不回退默认项让断言通过。
// 末项的数据值必须进入 imageParameters.anima，而不是只留在菜单按钮。
// 此处未验证手工滚轮、读屏或系统缩放，报告不能把自动事件记成人工验收。
// 菜单的通用悬停与选择反馈直接沿用原 OptionSelect，没有引入专属样式副本。
// 浅色和窄窗仍由后续同组件回归覆盖，参数选择不应受主题影响。
// 选后继续原工作流切换与重载，可暴露新值被白名单或旧默认误覆盖的问题。
// 自动事件与磁盘读回是两种证据，均不涉及供应商 API 密钥。
async function checkSchedulers(ctx) {
  const selector = '.hy-image-sidebar [aria-label="调度器"][aria-haspopup="listbox"]';
  if (!await ctx.run("document.querySelector('.hy-image-sidebar [data-advanced-settings-toggle]').getAttribute('aria-expanded')==='true'")) await ctx.click('.hy-image-sidebar [data-advanced-settings-toggle]');
  await ctx.click(selector);
  const { workflowList, checkWorkflowOptionVisible } = require('./select-workflow-option');
  const list = await workflowList(ctx, selector);
  ctx.smoke.check("Scheduler menu matches all nine reference names in order", await ctx.run(`JSON.stringify([...document.querySelector(${JSON.stringify(list)}).querySelectorAll('[role=option]')].map(e=>e.textContent.trim()))===JSON.stringify(['simple','sgm_uniform','karras','exponential','ddim_uniform','beta','normal','linear_quadratic','kl_optimal'])`));
  await ctx.shot("69-schedulers-top-dark");
  ctx.smoke.check("Scheduler last option is visible and clickable beyond the parent clip", await checkWorkflowOptionVisible(ctx, list, 'kl_optimal'));
  await ctx.shot("69-schedulers-bottom-dark");
  await ctx.click(`${list} [data-simple-select-option=kl_optimal]`);
  ctx.smoke.check("New scheduler persists as its exact workflow value", (await save(ctx)).nodes.find(node => node.data.kind === "image").data.imageParameters.anima.scheduler === "kl_optimal");
}

// 尺寸浮层与提交共用原附表；这里验证实际保存的两个边长，不只读取1K/2K标签。
// 非法草稿保持弹层并显示错误，Escape丢弃它，不能污染此前确认的像素。
// 比例切换保留2K长边，数量六不参与像素计算。
// 前置节点仍为 Anima、竖屏九比十六、批量六，反向词已经独立保存。
// 先关闭原设置侧栏，让画质入口在真实节点面板上可操作。
// 两千选项必须通过同一 ParameterPopover，不能直接向文档写测试尺寸。
// 首次保存读出一千一百五十二乘两千零四十八，能发现只更新长边的错误。
// 画质截图在菜单再次展开后采集，包含已确认像素与选项状态。
// 自定义子视图的第一项故意输入十五，这是唯一非法变化。
// 按应用后浮层应留在屏幕并出现 role=alert，不能仅靠控制台错误说明拒绝。
// 字段没有提交时原尺寸仍应保留，不允许部分保存另一边。
// Escape 关掉局部浮层后再保存，验证无效草稿没有混入工程。
// 不能在测试中先把十五改回合法值，再声称取消保护通过。
// 随后选择十六比九，原两千档保持，短边变成一千一百五十二。
// batchSize 仍是六，说明选择比例没有误调用数量回调。
// 这一对断言从磁盘读值，不依赖按钮上显示 2K 或 16:9。
// 自定义合法验证独立成 helper，因为错误拒绝与正常提交是两类行为。
// 结束恢复九比十六，使后面的工作流切换前提保持可预测。
// 最后通过真实菜单重新打开 Anima 设置，后续仍测试同一份原表单。
// 这个恢复动作不能抹掉刚才保存的反向与采样覆盖。
// 若设置 variant 错误保留第二个尺寸入口，前面的重复 DOM 检查应先失败。
// 若新画质选择另存一套字段，实际 imageParameters.size 断言会失败。
// 若草稿每次输入即保存，Escape 后一千一百五十二的断言会失败。
// 若比例切换总是回一千档，两千零四十八断言会失败。
// 若两千档乘了旧倍率，最终边长与这里明确数字不符。
// 若只改 ratio 不改 size，横屏短边与外层比例将不一致。
// 若把卡片宽高当输出像素，生成提交检查也会进一步失败。
// 四项反例分别对应显示、确认、取消和实际数据，不以总通过数代替逐项观察。
// 菜单关闭后不存在隐藏输入，原 Tab 路径不会残留未确认草稿。
// 此用例没有真实模型运行，输出像素链另由专项 HTTP 服务验证。
// 它也没有实际操作 Windows 缩放，窗口几何证据不能写成系统 DPI 通过。
// 选项点击属于自动 DOM 事件，鼠标实体手感由人工验收保留。
// 所有变更仍在本轮隔离用户文档，不改变用户正式画布的比例和数量。
async function checkSizeSync(ctx) {
  await ctx.click('.hy-image-sidebar header button');
  await ctx.click('[data-kind=image] [data-canvas-parameter=quality] > button');
  await ctx.click('[data-canvas-quality] button:nth-child(2)');
  let data = (await save(ctx)).nodes.find(node => node.data.kind === "image").data;
  ctx.smoke.check("2K stores exact portrait output pixels", data.imageParameters.anima.size.customWidth === 1152 && data.imageParameters.anima.size.customHeight === 2048);
  await ctx.click('[data-kind=image] [data-canvas-parameter=quality] > button');
  await ctx.shot("66-quality-2k-dark");
  await ctx.click('[data-canvas-quality] button:nth-child(3)');
  await ctx.fill('.hy-quality-custom input', "15");
  await ctx.click('.hy-quality-custom > button');
  ctx.smoke.check("Invalid size remains a local draft with inline error", await ctx.run("!!document.querySelector('.hy-quality-custom [role=alert]')"));
  await ctx.key("Escape");
  data = (await save(ctx)).nodes.find(node => node.data.kind === "image").data;
  ctx.smoke.check("Invalid draft and Escape preserve confirmed 2K", data.imageParameters.anima.size.customWidth === 1152);
  await ctx.click('[data-kind=image] [data-canvas-image-ratio] > button');
  await ctx.click('[data-canvas-image-ratio] button[aria-label="16:9"]');
  data = (await save(ctx)).nodes.find(node => node.data.kind === "image").data;
  ctx.smoke.check("Ratio and quality update same parameters independently of count", data.ratio === "16/9" && data.imageParameters.anima.size.customWidth === 2048 && data.imageParameters.anima.size.customHeight === 1152 && data.batchSize === 6);
  await checkCustomSize(ctx);
  await ctx.click('[data-kind=image] [data-canvas-image-ratio] > button');
  await ctx.click('[data-canvas-image-ratio] button[aria-label="9:16"]');
  await workflow(ctx, "anima-series", "anima");
}

// 合法自定义用真实输入和 Enter 提交，落盘像素必须与输入完全一致。
// 与非法草稿用例互补：只测拒绝会漏掉“永远无法应用”的假校验。
// 最后恢复 2K，使后续模板隔离用例继续使用它原来的明确前提。
// 合法输入样本固定为一千五百三十六乘八百六十四，两边都是八的倍数。
// 先展开质量菜单，再点击第三项，验证自定义确实有可达入口。
// 两个输入分开发送 React 受控事件，第二次可以看到第一次已完成更新。
// width 字段清空再写值，不能直接改 HTML value 却不触发产品 onChange。
// height 使用 label 范围定位，避免误把乘号或确认按钮当第二字段。
// 按 Enter 验证键盘与应用按钮共用 commit，不只测试鼠标确认分支。
// 成功后读盘宽高应和输入逐个相等，禁止静默四舍五入迁就测试。
// 反向词仍是独立负面词，证明尺寸补丁没有替换整个工作流参数对象。
// 批量仍是六，证明输出尺寸和结果张数没有互相覆盖。
// 重新展开检查 output，确保只读摘要也从当前确认值读取。
// 如果只读标签仍显示上次两千档像素，说明 UI 与执行数据存在两份状态。
// 截图六十七记录这个自定义菜单状态，不能沿用两千档图声称自定义已展示。
// 最后选择两千档，用实际控件恢复后续测试前提。
// 恢复不是撤回前面断言，合法自定义已由真实写盘独立证明。
// 自定义像素读回也能发现 shared 或主进程白名单漏掉 size 的问题。
// 若 UI 编辑成功但序列化丢字段，save 的结果会回到缺省并失败。
// 如果保存层把整数存成字符串，严格数值比较会失败。
// 如果控件只更新宽，height 不等于八百六十四会失败。
// 如果按 Enter 触发生成而不是应用尺寸，菜单不会正常提交，本断言会失败。
// 此处未按 Shift，因此不应该进入统一生成快捷键。
// 确认时只有一笔 onChange，原撤销仍记录完整尺寸对象。
// 没有调用产品内部 canvasSizePatch 来准备预期，预期数字独立于实现。
// 两条不同断言分别检查持久化与当前显示，不能用一个内部对象替代二者。
// 不宣称这组验证了自定义模型生成质量，只验证参数真实接线。
// 长文件名和媒体卡片样式仍由后续原全画布场景覆盖。
// 同一 data 还保留其他模板，后续切 SDXL 继续验证跨模板隔离。
// 如果自定义把整个 imageParameters 覆盖掉，后续恢复 SDXL 值也会失败。
// 非法草稿与合法确认分开，防止一个总是拒绝所有输入的实现骗过测试。
// 固定选择器来自当前正式 UI，不用文案汉字猜尺寸输入顺序。
// 这个 helper 返回时菜单已关闭，后续键盘不会被旧表单截获。
async function checkCustomSize(ctx) {
  // DOM click 不包含真实 pointerdown，前一场景的浮层可能仍开着；建立“打开”前提而非盲目切换。
  // 这里只读 aria-expanded，不改组件状态；真正需要打开时仍点击正式触发器。
  if (!await ctx.run("document.querySelector('[data-kind=image] [data-canvas-parameter=quality] > button').getAttribute('aria-expanded')==='true'")) await ctx.click('[data-kind=image] [data-canvas-parameter=quality] > button');
  await ctx.wait("document.querySelector('[data-canvas-quality]')");
  await ctx.click('[data-canvas-quality] button:nth-child(3)');
  await ctx.fill('.hy-quality-custom input', "1536");
  await ctx.fill('.hy-quality-custom label:nth-of-type(2) input', "864");
  // fill 会主动失焦以覆盖普通字段提交；此表单要求显式确认，先恢复真实字段焦点再发送 Enter。
  // 不把发给 body 的按键等同于输入框键盘确认，否则测试会错误地归咎产品没有提交。
  await ctx.run("document.querySelector('.hy-quality-custom label:nth-of-type(2) input').focus()");
  await ctx.key("Enter");
  const data = (await save(ctx)).nodes.find(node => node.data.kind === "image").data;
  ctx.smoke.check("Custom dimensions commit exact pixels and retain unrelated values", data.imageParameters.anima.size.customWidth === 1536 && data.imageParameters.anima.size.customHeight === 864 && data.imageParameters.anima.negative === "独立负面词" && data.batchSize === 6);
  await ctx.click('[data-kind=image] [data-canvas-parameter=quality] > button');
  ctx.smoke.check("Output label reads committed custom dimensions", await ctx.run("document.querySelector('[data-canvas-output-pixels]').textContent==='1536 × 864 px'"));
  await ctx.shot("67-quality-custom-dark");
  await ctx.click('[data-canvas-quality] button:nth-child(2)');
}

// 在同一节点切换 SDXL，再回 Anima，验证附表按模板身份隔离。
// 空负面文本是 SDXL 尚未编辑的状态，不能带入 Anima 的上一份草稿。
// 主正向 prompt 刻意共用，切系列不会清空用户已有的构图描述。
// 两个工作流的负面词可以同时保存，不能用最后操作的模板覆盖整个表。
// 非本地项用原生 disabled 阻止 click，而不是可点击后才给假成功反馈。
// 菜单三层通过原公共级联组件，分级标签并不改变保存编号。
// 这组验证模板隔离，复制节点的参数独立另外在图模型和后续场景中检查。
// 当前节点数量保持不变，选模板不能创建一张新图片结果。
// 保存读盘后再断言，避免侧栏自己的临时 state 冒充作品配置。
// 模板设置有空态，但不能把空负面文本填充成创建页的默认全局预设。
// 图片编辑叶子仅为 anima-edit，不提供 inpaint 或 edge 模板。
// 图片编辑与文生图共享节点类型，旧连线不应因切换配置被移除。
// 进入 SDXL 时先前 Anima 的负面词必须不出现，缺省空串是有效状态。
// shared negative 预设记忆不等于当前节点模板草稿，不能借挂载 effect 自动回填。
// 填入 SDXL 专属文字后再切回 Anima，应该恢复先前的“独立负面词”。
// 若只用一个全局 negative 字段，两次切换后必然会看到最后写入的 SDXL 文本。
// 保存后的表同时存在 anima 和 sdxl 两个键，且各自保留不同正文。
// 这是模板归属检查，不是验证两个不同服务端都已可以运行。
// 切换没有改 kind，节点仍是同一个 image，因此端口连接应由原图保留。
// 选择菜单关闭由产品负责，测试不手动卸载节点或重建表单来制造隔离。
// 当前原始 prompt 刻意保留同一份，隔离并不意味着所有字段都必须复制成两份。
// 文本目标由节点与模板两层身份共同决定，不能只靠侧栏标题显示正确。
async function checkIsolation(ctx) {
  // 两次 workflow 调用都重新展开父级菜单，没有复用上次已卸载的叶子DOM。
  // Anima侧栏关闭后再打开SDXL，React的组件key应重建表单会话，不能借局部state留存值。
  // SDXL输入之前先检查空文本，这样能区分“正确恢复空值”和“后写的文本覆盖了串值”。
  // 回到Anima后不仅检查显示，还查磁盘里两个键，防止 UI 私藏一份恢复缓存。
  // 检查 negative 时用 textContent，避免把助手按钮或预设说明文字误算为用户正文。
  // 工作流切换由叶子动作产生，不能用切换前节点对象来计算预期的磁盘附表。
  // 同名“标准文生图”叶子使用独立编号，若菜单错误接到同一action，SDXL键会缺失。
  // 该场景失败应先核对节点workflow及附表键，不应通过清空旧负面词来消除串值表象。
  await ctx.click('.hy-image-sidebar header button');
  await workflow(ctx, "sdxl-series", "sdxl");
  ctx.smoke.check("SDXL has independent negative draft", await ctx.run(`document.querySelector('.hy-image-sidebar [id$=\"-negative\"]').textContent===''`));
  await text(ctx, '.hy-image-sidebar [id$=\"-negative\"]', "SDXL负面词");
  await ctx.click('.hy-image-sidebar header button');
  await workflow(ctx, "anima-series", "anima");
  ctx.smoke.check("Returning to Anima restores its negative", await ctx.run(`document.querySelector('.hy-image-sidebar [id$=\"-negative\"]').textContent==='独立负面词'`));
  const data = (await save(ctx)).nodes.find(node => node.data.kind === "image").data;
  ctx.smoke.check("Both template parameter tables persist", data.imageParameters.sdxl.negative === "SDXL负面词" && data.imageParameters.anima.negative === "独立负面词");
}

// 复制使用原画布 Ctrl+D，副本读取确认后的配置，但后续编辑必须互不影响。
// 先关闭侧栏使焦点回到画布，再发送快捷键，不能在输入框中误测文本复制。
// 副本有新节点身份，不能用数组顺序或相同素材路径当成原卡。
// 修改副本数量和负面文本后读取真实磁盘，验证两个对象分别保留自己的值。
// 原卡六张与副本二张同时存在，能发现只按工作流全局存值的错误。
// 同一模板名下的负面词也要隔离，不能只测 primitive 数量绕过嵌套对象问题。
// 副本删除仍走 Delete，之后原节点继续存在，历史与磁盘都不涉及删除素材文件。
// 操作结束重新打开原卡，后续主题与侧栏关闭回归仍具有相同前提。
// 这是同一画布内两个真实节点实例，不声称已经挂载两个独立画布工作区。
// 多画布同时打开的状态隔离仍列为未验证，不能借这一组扩大验收范围。
// original 根据稳定 ID 记目标，不依赖最新选中顺序。
// 保存等待真实已保存状态，参数被 schema 剥离会在文件断言发现。
// 若复制参数对象被原地修改，修改副本负面词后原卡断言必须失败。
// 本测试不直接调用 reducer 或在页面中注入 store 来制造正确状态。
// 图片缺媒体不会影响参数隔离，真实媒体复制另由原工程回归验证。
// 副本临时删除不释放用户资产，图删除和磁盘文件删除是不同业务。
// 复制本身是一次历史事务，数量和文本也是已确认事务，不能混成假成功。
// original 从 data-canvas-node 读取，UUID 与资源路径没有绑定关系。
// Ctrl+D 必须在工作区焦点执行，关闭侧栏后仍显式 focus 根以满足真实快捷键路径。
// duplicate 命令会产生新选择集，下一次页脚操作只限定 selected=true 的副本。
// 副本的默认数量应继承六张，然后选择二张形成一笔新的节点事务。
// 原节点仍存在，磁盘同时列出两张 image，不拿同一对象前后快照冒充两个实例。
// 附表正文修改为副本专属内容，能发现浅拷贝后原地修改嵌套对象的错误。
// 原卡数量六、负面词独立负面词应同时保持，不能只检查其中一个 primitive。
// 副卡数量二、负面词副本负面词应同时成立，说明回写确实命中副本。
// 删除副卡后重新选择 original，验证保存目标没被留在已不存在的 UUID 上。
// 只删除临时节点，不删除媒体资产；同源文件的引用计数不在此处更改。
// 工作区的原历史模型继续生效，测试不从内部清空 past/future 规避错误。
// 若已有节点不止一张图片，原主脚本前提会变化，应调整夹具而不是模糊断言。
// 本场景当前使用一原件一副本的明确前提，防止 find 取到无关第三张卡。
// 测试结束仍有原卡侧栏，供最外层统一关闭和焦点返回检查。
async function checkCopies(ctx) {
  // pointer点卡片标题的小图标，避开正文输入以及侧栏可能覆盖的世界坐标区域。
  // 选择目标后页脚只挂在当前选中节点，selected限定能避免读到原卡的×6标签。
  // UUID来自产品，不由测试预测复制序号；对比id避免同标题卡片带来的定位歧义。
  // 节点标题允许重名，所以若只用“图片”文字查找，很可能把副本操作写回原件。
  // 删除前把焦点放回根是必要前提：配置表单会有意隔离Delete，不能在那里测试图删除。
  // 磁盘查询使用同一保存时刻的nodes数组，避免先后两次读取恰好只看到一个副本。
  // 副本正文和数量使用不同值，能同时反证浅层字段共享及嵌套附表共享两类问题。
  // 测试没有重新命名副本，证明身份隔离不依赖用户先手动给两张卡起不同名称。
  const original = await ctx.run("document.querySelector('[data-kind=image][data-selected=true]').dataset.canvasNode");
  await ctx.click('.hy-image-sidebar header button');
  await ctx.run("document.querySelector('[data-infinite-canvas]').focus()");
  await ctx.key("D", ["control"]);
  await ctx.pointer('[data-kind=image][data-selected=true] header>svg');
  await ctx.click('[data-kind=image][data-selected=true] [data-canvas-batch] > button');
  await ctx.click('[data-canvas-batch] button[aria-label="×2"]');
  await workflow(ctx, "anima-series", "anima");
  await text(ctx, '.hy-image-sidebar [id$=\"-negative\"]', "副本负面词");
  const nodes = (await save(ctx)).nodes.filter(node => node.data.kind === "image");
  ctx.smoke.check("Copied nodes retain independent count and nested parameters", nodes.find(node => node.id === original).data.batchSize === 6 && nodes.find(node => node.id === original).data.imageParameters.anima.negative === "独立负面词" && nodes.find(node => node.id !== original).data.batchSize === 2 && nodes.find(node => node.id !== original).data.imageParameters.anima.negative === "副本负面词");
  await ctx.click('.hy-image-sidebar header button');
  await ctx.run("document.querySelector('[data-infinite-canvas]').focus()");
  await ctx.key("Delete");
  await ctx.pointer(`[data-canvas-node="${original}"] header>svg`);
  await workflow(ctx, "anima-series", "anima");
}

// 完整刷新销毁 React state 和表单 DOM，参数应从真实用户文档恢复。
// 这与简单关开侧栏不同，能发现字段只停留在内存、未被序列化的问题。
// 刷新前用正式保存入口等待落盘，不能把未完成的异步写入误判成恢复故障。
// 重载不会保留节点选择，这是原工程约定；重新点选同一原图片才打开配置。
// 参数还原从产品 UI 读取，不能把测试预先写好的 JSON 直接展示成结果。
// 原 Anima 和 SDXL 的两个负面草稿都应该仍在同一参数表里。
// 主正向提示词属于节点公共字段，不应因模板重开而丢失。
// batchSize 六张应该在页脚显示，不能只在磁盘有字段但 UI 固定成一张。
// 刷新后系统和主题仍由应用初始化，测试不手工设置节点 open 或 selected。
// LoRA 与主模型配置若缺省仍继承模板，恢复不会虚构真实模型加载成功。
// 本场景不打开第二个 BrowserWindow，遵守串行单实例回归约束。
// 实际页面来源仍为 app:// 静态导出，不切换开发服务或使用 HTML 样板。
// reload 后等待已保存表示用户数据水合完成，不能在加载中点击空节点。
// 新侧栏的输入 id 可变化，使用语义后缀定位而非依赖上次 useId 的具体数字。
// 原形状数据中的媒体引用不变，后续真实媒体回归继续使用同一工程。
// 自动刷新不是人工退出整个应用再启动，因此后者仍明确列为未验证。
// 保存回读与重载恢复两种证据分别保留，不以其中一个替代另一个。
// 截图六十五记录重开后的原参数，可和六十一在相同主题下对照。
async function checkRestore(ctx) {
  // 导航开始后原来的ctx.run仍指向同一个webContents，但页面JavaScript上下文已经更换。
  // 因此不能把刷新前取得的DOM元素句柄用到刷新后，所有选择器都重新执行。
  // wait可选链允许初始化阶段节点尚不存在；它应继续轮询而不是因null读取提前抛错。
  // did-finish-load只说明页面装载结束，用户文档异步水合还需等待保存状态出现。
  // 本次保存的内容已包含副本删除结果，重开后应只保留原卡，不能恢复临时测试副本。
  // 后续save再读盘能确认恢复过程没有用默认SDXL空表覆盖已经存在的正文。
  // 刷新前侧栏曾开启，但打开状态不属于工程；重载后必须再次明确选择和进入设置。
  // 这里先关闭旧浏览器上下文，再重新操作入口，区别于同一表单隐藏后再次显示。
  await save(ctx);
  // reload 本身返回 void，直接 await 它不会等导航，旧页面可能短暂满足“已保存”。
  // 先订阅新页面完成事件再刷新，排除在旧 DOM 上点击成功的假恢复证据。
  // 导航挂起仍由主脚本单步看门狗终止，不能因该事件丢失而无限等待。
  await new Promise(resolve => {
    ctx.win.webContents.once("did-finish-load", resolve);
    ctx.win.webContents.reload();
  });
  await require("./canvas-library-fixture").openProject(ctx);
  await ctx.wait("document.querySelector('[data-canvas-save-status]')?.textContent.includes('已保存')");
  // 用户文档保存状态可先于 React Flow 节点布局出现，等待真实目标后再发送实体指针。
  // 不用固定延时掩盖恢复竞态，也不在目标未挂载时直接调用页面内部选择 setter。
  await ctx.wait("document.querySelector('[data-kind=image] header>svg')");
  await ctx.pointer('[data-kind=image] header>svg');
  await workflow(ctx, "anima-series", "anima");
  ctx.smoke.check("Full reload restores count and both template drafts", await ctx.run(`document.querySelector('[data-kind=image] [data-canvas-batch] > button').textContent==='×6'&&document.querySelector('.hy-image-sidebar [id$=\"-negative\"]').textContent==='独立负面词'&&document.querySelector('[data-kind=image] [data-video-prompt]').textContent==='侧栏节点独立正文'`));
  const data = (await save(ctx)).nodes.find(node => node.data.kind === "image").data;
  ctx.smoke.check("Restored state keeps the independent SDXL parameters", data.imageParameters.sdxl.negative === "SDXL负面词");
  await ctx.shot("65-sidebar-restored");
}

// 同一侧栏在浅色和窄容器保持可读且关闭按钮可达。
// nativeTheme 是应用既有主题来源，不给画布另建一套 .dark 状态。
// CSS 窗口尺寸属于自动布局验证，不代表系统 DPI 或人工显示缩放通过。
// 保留原窗口大小，验证结束后还原，避免后续基准截图条件改变。
// 真实几何矩形取自工作区，不拿 window.innerWidth 猜应用导航剩余空间。
// 表单比可视高度长时必须在自身滚动，画布不产生整体纵向滚动。
// 减少动态效果无需额外假等待，侧栏本身没有入场动画。
// 深浅主题截图来自同一实际工作区数据，不能使用静态 HTML 对照替代。
// 原生主题调用通过 preload，仍使用本轮唯一 Electron 窗口。
// 验证完还原深色，基础冒烟已有的主题断言继续按原条件运行。
// 对比度判断只确认不是白底白字，完整人工视觉接近度仍需用户验收。
// 窄窗口不隐藏内部字段，键盘和滚动仍能到达下方参数。
// 保存状态只反映参数变化，主题与窗口变更不产生作品修改。
// 第一次诊断发现单改 nativeTheme 会被应用保存的深色偏好再次覆盖。
// 因此正式用例改走应用主题菜单，而非把瞬时 matchMedia=true 当作绘制成功。
// 真实颜色条件必须等侧栏 computed background 成为纯白后才截图。
// 主题菜单本身复用原关闭夹具，防止它遮在侧栏前面污染截图。
// 浅色通过要求看到白色背景，不以“背景色不等于文字色”这种过宽条件替代。
// 窄窗口使用 960×720，应用导航仍占据左侧，面板应只使用剩余主区宽度。
// 实际 DOM 矩形比较左右下边界，能发现拼接固定导航偏移导致的越界。
// 高度不足时内容区 scrollHeight 应大于 clientHeight，说明字段仍在可滚区域。
// 若直接隐藏下方字段，滚动断言会失败，不允许靠裁切掩盖溢出。
// 若把滚动交给整个页面，内容区 overflowY 不会是 auto，也会失败。
// 侧栏的 close 固定在头部，不随长文本向上滚走。
// 恢复深色同样等待实际 rgb(23,23,25)，不只看设置状态已切换。
// 最后恢复1600×1000，让后续原始暗色截图具有一致尺寸和布局条件。
// 这一组没有改 Windows 显示缩放，不写成系统百分之一百或一百五十验证。
// 应用主题和业务参数没有关联，切换后文件内模型和数量不应重置。
// 若未来增加第三种应用主题，应扩展公共机制，测试不引入私有画布主题。
// 最终证据目录只归档确认过颜色的截图，不把早期黑色诊断图命名为浅色通过。
// 侧栏现在直接继承创建页主题，深色不再要求画布专属的固定灰色 RGB。
// 这项布局验证只确认原组件随原主题切换，不能给它新增侧栏专用颜色断言。
// 原组件间距和工具排列不在此脚本另定标准，避免测试反过来驱动第二套 UI。
// 本轮复用调整后，侧栏正文仍由原 ImageCreatePanel 的滚动容器负责。
// 设置形态没有生成底栏，但不能把整个侧栏改成随页面主区一起滚动。
// 界面主题通过正式主题菜单切换，不能只改 document 样式让一张截图看起来像浅色。
// 颜色断言等待的是最终 computed background，不是只看 theme 字符串。
// 主题波纹覆盖层消失后再截图，避免把旧主题快照当成新主题证据。
// 模型与反向词在主题切换中不变，外观操作不应重建参数业务状态。
// 九百六十窗口只是 Electron CSS 布局测试，不代表用户实机分辨率设置。
// 导航占据的宽度已经体现在画布矩形里，不能再手动减一个常量导航宽。
// 侧栏四边与可用主区比较，能发现相对窗口定位而非相对画布定位的错误。
// 标题栏和底部状态栏占高也被画布矩形包含，不能按整窗高度把侧栏压出去。
// 正文滚动不等于裁掉字段，scrollHeight 要能说明隐藏区域仍可抵达。
// 固定头部关闭按钮必须可见，用户不应先滚到最顶才退出设置。
// 如果只有把字段 display none 才不溢出，滚动和后续原控件检查应失败。
// 恢复一千六百窗口后再回深色，让后续既有截图与拖动坐标条件保持一致。
// 本轮画质菜单共享原主题变量，因此深色菜单和浅色菜单必须来自同一套 DOM。
// 主题不参与计算像素，画质值和批量不能因为换背景重新取默认。
// 本组没有切颜色预设，创建页原颜色预设由原创建回归负责。
// 减少动态效果保留原项目机制，侧栏本身没有额外飞入动画。
// 自动主题证据可以说明变量继承，但不替代人眼对比度和视觉接近度验收。
// 图片内容没有加 CSS 滤镜，不能为了浅色 UI 修改真实生成图片颜色。
async function checkLayout(ctx) {
  // 使用computed background的最终RGB值而非主题名称断言，能发现语义变量被门户继承覆盖。
  // 对比aside与工作区矩形，应用导航实际占宽已经体现在左边界中，无需假设固定导航尺寸。
  // 窗口设为960不是要求侧栏本身960宽；面板应在剩余主区按自己的最大宽度停靠。
  // 同时检查bottom防止Electron标题栏占高后，面板沿整窗定位而遮住应用底部状态。
  // scrollHeight来自原组件真实内容，未注入额外占位块来让滚动断言虚假满足。
  // overflowY由原创建表单正文持有，外壳头部和原生成底栏保持固定。
  // 真实颜色等待在截图前执行，主题波纹结束的另一条等待避免旧主题覆盖层被误当作新截图。
  // 退出布局场景还原原尺寸，避免后续媒体卡拖动使用窄窗裁切条件而改变测试前提。
  await ctx.click('[data-theme-trigger]');
  await ctx.click('[data-theme-option=light]');
  await require("./sidebar-menu-fixture").closeAppearance(ctx.run);
  await ctx.wait("getComputedStyle(document.querySelector('.hy-image-sidebar')).backgroundColor==='rgb(255, 255, 255)'");
  // 颜色先正确不代表波纹过渡已经结束，截图还需等待原动画清理信号。
  // 等待有界使用主进程轮询，不靠 rAF 使隐藏窗口永远不结束。
  await ctx.wait("!document.documentElement.classList.contains('theme-ripple')");
  await ctx.shot("62-sidebar-light");
  await checkLightQuality(ctx);
  ctx.win.setSize(960, 720);
  await ctx.shot("63-sidebar-narrow");
  ctx.smoke.check("Sidebar fits actual narrow workspace", await ctx.run("(()=>{const a=document.querySelector('[data-infinite-canvas]').getBoundingClientRect(),b=document.querySelector('.hy-image-sidebar').getBoundingClientRect();return b.left>=a.left&&b.right<=a.right&&b.bottom<=a.bottom})()"));
  ctx.smoke.check("Sidebar owns vertical scroll and neutral colors", await ctx.run("(()=>{const e=document.querySelector('.hy-image-sidebar [data-create-rail-scroll]'),s=getComputedStyle(document.querySelector('.hy-image-sidebar'));return e.scrollHeight>e.clientHeight&&getComputedStyle(e).overflowY==='auto'&&s.backgroundColor!==s.color})()"));
  ctx.win.setSize(1600, 1000);
  await ctx.click('[data-theme-trigger]');
  await ctx.click('[data-theme-option=dark]');
  await require("./sidebar-menu-fixture").closeAppearance(ctx.run);
  await ctx.wait("matchMedia('(prefers-color-scheme: dark)').matches&&getComputedStyle(document.querySelector('.hy-image-sidebar')).backgroundColor!=='rgb(255, 255, 255)'");
  await ctx.wait("!document.documentElement.classList.contains('theme-ripple')");
}
// 浅色画质必须在正式主题切换后展开，不能用 CSS 覆盖生成一张样板图。
// 关闭再恢复侧栏，保证后续窄容器仍检验同一份原创建组件。
// 侧栏与画质浮层都在同一个画布工作区，先关侧栏避免菜单被它挡住。
// 关闭会把焦点返回原工作流入口，随后明确点击画质胶囊。
// 浅色状态用 matchMedia 的当前值读取，不能仅凭已经点击浅色选项判断。
// 背景和文字色比较确认不是同色，完整视觉效果仍通过随后真实截图检查。
// closest 定位外层实际浮层表面，内层菜单背景透明不应被误判成黑色。
// 同一 data 的已确认尺寸继续显示，主题操作没有写参数补丁。
// 截图名独立为六十八，不把深色菜单文件简单重命名冒充浅色。
// Escape 仍走外壳真实处理，菜单应卸载并恢复触发焦点。
// 随后经三级模型菜单重新打开原设置侧栏，不直接改组件 open 状态。
// 这样后续九百六十容器检查拥有与先前一致的前提。
// 重新选择当前工作流只打开设置，不应把尺寸或反向值恢复默认。
// 自动 DOM 事件是证据来源，当前函数未做 Windows 手工主题操作。
// 背景可读性断言不是百分比视觉还原评分，交付不宣称已人工量化接近度。
// 若菜单仍继承深色固定白字，真实截图会与变量检查一起暴露问题。
// 没有动态添加覆盖 CSS，所看到的样式来自最终静态构建。
// 没有新开窗口，所以菜单和原侧栏共享同一应用主题信号。
// 关闭菜单不会修改画布镜头，两个截图可以与深色同尺寸对照。
// 本轮没有修改系统 DPI，不能把窗口宽度检查当系统缩放验证。
// 这个 helper 不保存工程，因为主题不是画布生成参数。
// 后续 save 仍可以读回不变尺寸，确认显示和业务分离。
async function checkLightQuality(ctx) {
  await ctx.click('.hy-image-sidebar header button');
  await ctx.click('[data-kind=image] [data-canvas-parameter=quality] > button');
  ctx.smoke.check("Light quality menu uses a readable real theme surface", await ctx.run("(()=>{const e=document.querySelector('[data-canvas-quality]'),s=getComputedStyle(e.closest('.hy-ratio-popup'));return !matchMedia('(prefers-color-scheme:dark)').matches&&s.backgroundColor!==s.color})()"));
  await ctx.shot("68-quality-light");
  await ctx.key("Escape");
  await workflow(ctx, "anima-series", "anima");
}
module.exports = { checkCanvasWorkflowControls };

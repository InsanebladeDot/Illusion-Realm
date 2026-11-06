/** 属性检查器的公开DOM回归；复用现有Electron窗口和样板路由，不模拟媒体效果。 */
const fs = require("node:fs"), path = require("node:path");
// 本文件只验证属性UI，不把样板的局部覆盖值当成工程效果已经生效。
// 窗口、协议、preload和静态产物检查由主套件建立，不在helper复制启动流程。
// 所有选择都经过公开按钮，不能直接改React状态或调用内部commit函数。
// 观察到input变字还不够，切对象后再读值，才能区分草稿与确认值。
// A/B是同组件的两个独立实例，B用于反证错误、选择和覆盖值没有串用。
// 样板有确定的五项素材，测试用固定名字定位，避免按页面第一个input误点。
// 真正文件导入和媒体解码仍由LIVE回归负责，本组没有创建视频源。
// 若这里失败，外层harness保留非零退出码，截图不能把失败覆盖成通过。
// 中文标签是此隔离游客文档的当前语言，不从生产LABELS导入预期字段。
// 这样生产误把旋转标题映射到缩放时，测试不会跟着相同配置一起误过。
// 数值比较看格式化后的确认显示，同时结合类型组合检查是否存在错误字段。
// Enter、Escape和input由DOM派发，是自动事件证据，不能标成人工键盘操作。
// focus与blur发生在真实Chromium文档内，但不需要抢用户系统桌面焦点。
// 外层显式启用焦点模拟，避免隐藏窗口不产生focusout而误把草稿当确认结果。
// 每次查找限定 A/B，防止总取第一个实例掩盖状态串用。
// label来自已确认的中文界面，测试不读取生产字段配置来自证。
const scope = id => `[data-inspector-sample=${id}]`;
const field = (id, label) => `${scope(id)} label`;

// 以标签文字定位真实输入，不依赖CSS哈希，也不访问React私有状态。
// 模拟事件只作为UI自动化证据，不能当成人工键盘或媒体处理证明。
// 焦点和失焦真实发生在Chromium文档内，Enter/Escape走公共字段处理。
async function edit(ctx, label, text, key = "Enter") {
  // 使用原生value setter通知React受控输入，直接改HTML属性不能代表用户输入。
  // input事件冒泡到公共字段，产品自己的onChange负责保存临时字符串。
  // 输入字符串可以是负号、空白或错误文本，不能在测试里先替产品矫正。
  // 键事件与input分两次调用，让React先提交草稿，再执行确认或取消。
  // 短等待只让当前UI提交，没有循环重试直到碰巧读到预期值。
  // 每次先focus目标字段，使后续document.activeElement确实是本次输入。
  // label限定到A，B作为观察对照，不应被编辑helper顺带改写。
  // key为Tab时只保留草稿，真正失焦由下一步.focus触发，不用假blur代替。
  // 这是因为合成Tab不会自动执行浏览器默认焦点跳转，测试须说明证据边界。
  // onKeyDown仍处理Enter/Escape，不能直接调用onCommit跳过范围校验。
  await ctx.run(`(()=>{const e=[...document.querySelectorAll('${field("A", label)}')].find(e=>e.firstElementChild.textContent===${JSON.stringify(label)}).querySelector('input');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ctx.delay(60);
  await ctx.run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true}))`);
  await ctx.delay(60);
}
// 取值是观察，不把输入value改成预期结果；确认来源仍是产品回调后的显示。
// 同一标签在不同实例可能不同，域参数使A的修改不能误读成B也已生效。
function value(ctx, id, label) {
  // label找不到返回undefined，类型字段不应出现时可以明确断言不存在。
  // 找到但值为空会返回空串，与字段缺失不同，混合值要另读placeholder。
  // 不将读值转Number，否则空串会变成零，掩盖混合状态误提交问题。
  // 这里不读取data中的预设值，而读用户实际看到的受控input.value。
  // 调用者可比较80.00与80，发现提交后的精度格式化是否执行。
  // 同一个标签必须带域参数，不能用全局querySelector把A当作B读取。
  return ctx.run(`(()=>{const e=[...document.querySelectorAll('${field(id, label)}')].find(e=>e.firstElementChild.textContent===${JSON.stringify(label)});return e?.querySelector('input')?.value})()`);
}
async function choose(ctx, label) {
  // 选择用原按钮click，样板根据稳定ID计算selected，检查器重新组合目标。
  // helper不直接拼一个targets数组传给组件，所以能覆盖公开调用链。
  // 选择完成后有界等待本地提交，不执行重新加载来清掉旧字段状态。
  // 切换类型后若残留旧字段，下方查询会明确失败而非读取旧缓存。
  // 这里不滚动画面或截取像素，行为断言与截图记录分别完成。
  await ctx.run(`document.querySelector('${scope("A")} button[aria-label=${JSON.stringify(label)}]').click()`);
  await ctx.delay(80);
}

// 混合值先验证横线，再统一为80；80恰等于第二项原值，用来发现仅按首项比较的漏提交。
// 切回各对象读确认值，不能仅看当前混合框的临时文本就宣称两项都已改变。
// A/B从相同演示数据开始，B保持100说明共享组件没有共享覆盖值。
async function checkMixed(ctx) {
  // 初始首视频缩放100，第二视频80；两个对象并非相同默认参数的重复副本。
  // 切混合后先看横线，防止控件直接显示首项100造成统一值假象。
  // 输入80后第一对象应改变，第二对象本来就是80也必须继续保持。
  // 再逐个切回单选，可以发现只改临时代表值而没更新选择集合的实现。
  // B始终保留初始100，反证局部覆盖没有写进DEMO_ASSETS或模块级共享缓存。
  // 第一对象的确认值在前一组已重置为100，条件不是依赖刚输入的草稿。
  // 选择第二对象不会清第一对象的覆盖，否则切回时会恢复100被后续测试发现。
  // 这里验证统一数值，不声明完成多选时间线操作或批量媒体处理。
  // 属性目标数量来自样板选择，正式时间线当前仍是独立单选。
  // 本组不读取React内部state，只通过同一个ClipInspector的可见字段反查结果。
  // 混合的placeholder是“—”，不是输入value，不能把符号交Number解析。
  // 等于代表值仍回调的边界也由公共控件语义保障，不能简单用value相等早退。
  await choose(ctx, "多选混合");
  ctx.smoke.check("UI05: mixed selection displays a dash instead of the first value", await ctx.run(`document.querySelector('${scope("A")} input[data-editor-mixed]').placeholder==='—'`));
  await edit(ctx, "缩放", "80");
  await choose(ctx, "scene_01.mp4");
  ctx.smoke.check("UI05: mixed commit updates the first selected target only in A", await value(ctx, "A", "缩放") === "80.00" && await value(ctx, "B", "缩放") === "100.00");
  await choose(ctx, "scene_02.mp4");
  ctx.smoke.check("UI05: the other selected target receives the same confirmed value", await value(ctx, "A", "缩放") === "80.00");
}

// 类型切换检查的是字段交集，不以文件名后缀推断应显示的字段。
// 音频不能有画面变换，图片不能有视频速度；无选择展示项目事实。
// 重置与折叠分别验证值和布局，不用一条模糊“无异常”替代两个职责。
async function checkTypes(ctx) {
  // 音频测试同时要求音量存在、缩放缺失，不能只检查标题从视频变成音频。
  // 淡入提交0.25，用非整数覆盖共用字段的精度处理。
  // 切图片要求十秒安排长度，不把图片没有duration当作零秒。
  // 图片没有speed，能反证之前视频字段没有因同组件复用而残留。
  // 无选择必须没有input，不能只在旧表单上盖一句“未选择”。
  // 项目分辨率来自样板项目1920×1080，不能显示素材的缩略图尺寸。
  // 无选择时保留项目总长，不代表清空工程片段。
  // 音频淡入只改变该目标的样板确认值，不生成音频文件或波形。
  // 本组不检查真实声音变化，因为正式效果尚未接入。
  // 当前source素材是固定演示数据，不需要联网或扫描用户磁盘。
  await choose(ctx, "voice_01.wav");
  ctx.smoke.check("UI05: audio exposes volume and fades, with no visual transform", await value(ctx, "A", "音量") === "100.0" && await value(ctx, "A", "缩放") === undefined);
  await edit(ctx, "淡入", "0.25");
  await choose(ctx, "bg_01.png");
  ctx.smoke.check("UI05: image exposes its arranged duration, not speed or volume", await value(ctx, "A", "时长") === "10.00" && await value(ctx, "A", "速度") === undefined);
  await choose(ctx, "无选择");
  // 此时先前已确认过音频淡入和图片选择，空态还可反证旧字段没有残留。
  // dl中的项目尺寸是工程事实，不是“无选择”按钮写入的一份新项目配置。
  // 输入节点数量为零比disabled为true更严格，空选择不应显示虚构视频参数。
  // 空选择不删除targets，随后回到scene_01仍能测试原先的覆盖与重置。
  // B保持自己的单视频选择，A的无选择不会把B也切成项目事实面板。
  ctx.smoke.check("UI05: no selection shows project resolution and fps without stale fields", await ctx.run(`document.querySelector('${scope("A")} [data-editor-region=R04]').textContent.includes('1920 × 1080')&&!document.querySelector('${scope("A")} input')`));
}

// 组合按钮只传目标集合，交集由正式检查器计算；预期字段由测试独立列出。
// 画面与音频无交集时必须给出明确空态，不能随机显示首项整张表。
// 视频和图片共有变换，不应把时长或速度借给另一个类型。
async function checkCombinations(ctx) {
  // 0-2对应视频加图片，预期只保留五个画面字段。
  // 0-3对应视频加音频，预期只保留淡入和淡出。
  // 2-3对应图片加音频，没有公共属性，仍应保留选中对象数量。
  // 0-2-3把三类一起传入，交集为空不能退化成第一视频整张表。
  // 预期标签数组独立写出，不调用生产inspectorFields给自己生成答案。
  // 比较有序标签集合，既发现漏字段，也发现多出无效字段或重复分组。
  // 每次操作仍通过样板组合按钮，组件本身负责计算交集而不是测试筛选。
  // 组合循环不重建页面，上一组合的字段不能靠路由重载被清除。
  // 第一轮reset先恢复100，为后面的“确认值不变”反例建立准确前提。
  // 随后输入invalid并按Enter，错误草稿留在本地，确认值仍为100。
  // 第二次reset写回同一个100，旧value没有变化，恰能发现只靠value同步的漏洞。
  // 正确实现须同时清除aria-invalid与非法文本，单改红框不算恢复。
  // 不通过Escape清掉错误后再测reset，那样无法证明reset本身有效。
  // 折叠使用真实组标题按钮，B的aria-expanded必须保持true。
  // 这条只检查公开折叠语义，原公共控件回归还检查inert与字段可见范围。
  // 最后恢复A展开，让后面的运行截图展示实际字段而非只有折叠标题。
  // 所有覆盖更新都留在A，混合类型选择不应把B自动切成同一集合。
  // 这里没有文件导入成功提示，不用“按钮被点到”替代字段结果断言。
  for (const [selection, labels] of [["0-2", ["缩放", "位置 X", "位置 Y", "旋转", "不透明度"]], ["0-3", ["淡入", "淡出"]], ["2-3", []], ["0-2-3", []]]) {
    await ctx.run(`document.querySelector('${scope("A")} [data-inspector-selection="${selection}"] button').click()`); await ctx.delay(80);
    const actual = await ctx.run(`[...document.querySelectorAll('${scope("A")} label')].map(e=>e.firstElementChild.textContent)`);
    ctx.smoke.check(`UI05: ${selection} selects only common fields`, JSON.stringify(actual) === JSON.stringify(labels));
  }
  await choose(ctx, "scene_01.mp4");
  await ctx.run(`document.querySelector('${scope("A")} button[aria-label="重置"]').click()`); await ctx.delay(80);
  // 这一行前置reset不可删除：若确认值仍是80，再reset到100会发生value变化。
  // value变化本来就会刷新草稿，那样无法检验“确认值未变”的真实漏洞。
  // 先把确认值置100，再输入invalid，第二次重置仍为100才有反证价值。
  // 错误状态在Enter后产生，不是测试手工添加aria-invalid或红边。
  // invalid选用明显非数字字符串，避免不同浏览器对科学计数法的合法解析差异。
  // 公开input是text型数字草稿，故浏览器不会先把invalid自动清成空串。
  // reset之后要求文本100.00，既证明丢弃错误，也证明精度初始化仍正确。
  // 仅仅去掉error属性但留下invalid文本不会通过此断言。
  // 第一个重置针对变换组，当前该组包含缩放、位置、旋转和不透明度。
  // 错误输入只在缩放，不需要为每个字段复制一份同构reset测试。
  // 共用字段保证同样生命周期规则也用于位置与旋转，差异由范围参数表达。
  // 类型组合返回空字段后再选视频，分组应重新按有效字段生成，而非复用音频组。
  // 折叠后仍可从标题展开，测试最后这一步不是重建整个样板页面。
  // 若A收起导致B也收起，可能是共享open布尔值，断言会明确指出隔离错误。
  // 如果只是把内容透明而标题仍报expanded，后续公共控件可见范围断言会发现。
  await edit(ctx, "缩放", "invalid");
  await ctx.run(`document.querySelector('${scope("A")} button[aria-label="重置"]').click()`); await ctx.delay(80);
  ctx.smoke.check("UI05: reset clears an invalid draft even when its confirmed default is unchanged", await value(ctx, "A", "缩放") === "100.00" && await ctx.run(`!document.querySelector('${scope("A")} input[aria-invalid]')`));
  await ctx.run(`document.querySelector('${scope("A")} [data-editor-group] button[aria-expanded]').click()`); await ctx.delay(80);
  ctx.smoke.check("UI05: collapsing A leaves B expanded and its fields reachable", await ctx.run(`document.querySelector('${scope("A")} [data-editor-group] button').getAttribute('aria-expanded')==='false'&&document.querySelector('${scope("B")} [data-editor-group] button').getAttribute('aria-expanded')==='true'`));
  await ctx.run(`document.querySelector('${scope("A")} [data-editor-group] button[aria-expanded]').click()`);
}

// 先输入非法数，再Escape，确认错误草稿没有污染已经确认的100。
// 合法小数用实际焦点转移提交，覆盖Enter之外的公共blur路径。
// 重置用真实按钮，不能直接调用样板setState把值改回默认。
// B与A同页，折叠A变换组之后B仍展开，验证分组生命周期独立。
async function checkDrafts(ctx) {
  // 缩放下限大于零，-2是明确非法值，不依赖浏览器本身的number类型夹限。
  // 文本输入仍保留-2，产品在Enter时报告错误而非打字时强行改成最小值。
  // B的错误属性不存在，检查的是错误状态隔离而不仅仅是B数字相同。
  // Escape恢复已确认100.00，不能把错误草稿变成最近一次确认值。
  // X坐标12.34合法，提交后精度保留两位，不取整为12。
  // 使用切焦到B按钮触发A失焦，覆盖Enter以外的实际blur通路。
  // A确认12.34时B仍为960，坐标源没有被误保存在共享项目对象中。
  // 分组重置根据项目中心恢复960，不应误取首素材宽度的一半。
  // reset按钮定位当前A的第一个组，该时刻A明确处于视频变换表单。
  // 如果前置选择不对，读值会是undefined，不能被Number转换成零误过。
  // 每条断言在操作之后读取UI，测试没有向确认值属性写入预期结果。
  // 草稿确认与失焦分步执行，可以发现回调值没有回流到受控输入的问题。
  await edit(ctx, "缩放", "-2");
  ctx.smoke.check("UI05: invalid draft stays local and does not mark B invalid", await ctx.run(`!!document.querySelector('${scope("A")} input[aria-invalid=true]')&&!document.querySelector('${scope("B")} input[aria-invalid]')`));
  await ctx.run("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await ctx.delay(60);
  ctx.smoke.check("UI05: Escape restores the confirmed scale", await value(ctx, "A", "缩放") === "100.00");
  await edit(ctx, "位置 X", "12.34", "Tab");
  // 合成Tab只把该键交给输入处理，不自动模拟操作系统的焦点导航。
  // 下方.focus才造成真实文档内的blur，因此报告不能写“人工Tab已验证”。
  // 这一区分也防止以后把代码改成dispatchEvent('blur')而没有真实焦点前提。
  // A的确认值需在失焦后再读取，失焦前看到12.34仍可能仅仅是草稿。
  // B项目中心960从同一项目参数得到，但样板values不同份。
  // B如果也变成12.34，说明不是字段格式化问题，而是共享状态归属错误。
  // 鼠标点击reset通常也会触发blur，单独的blur路径提前验证可帮助定位失败阶段。
  await ctx.run(`document.querySelector('${scope("B")} button').focus()`); await ctx.delay(60);
  ctx.smoke.check("UI05: blur commits decimal project coordinates in A only", await value(ctx, "A", "位置 X") === "12.34" && await value(ctx, "B", "位置 X") === "960.00");
  await ctx.run(`document.querySelector('${scope("A")} button[aria-label="重置"]').click()`); await ctx.delay(60);
  // 默认中心通过确认结果读取，不从propertyDefaults导入答案，避免同错一起通过。
  // 960来自已知1920宽的工程，不允许用素材640宽的一半320替代。
  // 同时保留Y与其他字段的显示，组重置应是参数集合操作而不是清空检查器。
  // 这条重置先测确认值变化，另一组专门测确认值不变但草稿错误的边界。
  // 两种条件不同，不能用一次“reset按钮能点”替代两个数据路径。
  // 测试不要求真实视频画面移动，因为样板没有接入画布变换。
  // 这避免把纯UI确认成功错误包装成实际效果验收。
  ctx.smoke.check("UI05: group reset uses current project center", await value(ctx, "A", "位置 X") === "960.00", String(await value(ctx, "A", "位置 X")));
}

// 专项入口仍由原冒烟检查构建指纹、协议、preload和错误收集。
// 截图来自capturePage，不重画组件，也不把静态样板当真实效果截图。
// 仅导航到公开samples入口，不新增测试专用产品状态写接口。
async function checkVideoUiInspector(ctx) {
  // 进入公开样板路由，不给正式工作区塞模拟值或替换媒体IPC响应。
  // 首个输入出现才开始编辑，页面未水合时不能把点击丢失算作产品行为。
  // 运行结束保留实际截图，能同时看到A与B的参数和能力说明。
  // screenshot目录来自外层临时工作区，不覆盖设计参考图。
  // 新图片不是“缩放已经作用于视频”的证据，仅证明同一个检查器真实运行。
  // 最后选择视频用于清楚展示字段，前面的异常和混合断言仍保留在运行日志。
  // 不重置外层错误集合，早先状态回归失败会继续导致整套非零退出。
  // 与原控件、素材和预览回归顺序执行，不开第二个Electron争抢单实例锁。
  await ctx.win.loadURL("app://app/tools/video/editor/samples");
  await ctx.wait("document.querySelector('[data-inspector-sample=A] input')");
  // 隐藏窗口需焦点模拟才会产生真实focusout；否则读到的可能只是未确认草稿。
  await ctx.win.webContents.debugger.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: true });
  await checkDrafts(ctx); await checkMixed(ctx); await checkTypes(ctx); await checkCombinations(ctx);
  await choose(ctx, "scene_01.mp4");
  await ctx.run("document.querySelector('[data-inspector-sample=A]').scrollIntoView()");
  // scrollIntoView仅用于截图取景，不在行为断言前修改容器尺寸或裁掉错误提示。
  // 截图时A明确单选视频，B保留独立默认视频，可直接比较两个检查器来源说明。
  // 截图不叠加测试通过水印，避免遮住长名称、省略和滚动边界。
  // 运行证据保存到外层root，文档链接只复制最终一次静态构建对应文件。
  // 旧失败日志仍保留，最终通过并不删除曾经发现的样板兼容问题。
  // 关闭此页后A/B覆盖状态释放，正式页不会恢复练习输入。
  // 这里没有本地存储断言，因为样板根本不具备持久化能力。
  fs.writeFileSync(path.join(ctx.root, "ui-05-inspector.png"), (await ctx.win.webContents.capturePage()).toPNG());
}
module.exports = { checkVideoUiInspector };

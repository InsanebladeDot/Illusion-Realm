// 正式 app:// 入口验证原编译页面，不再引用已经删除的重写版引擎或 DOM。
// 内部按钮点击与输入属于自动事件；截图来自 Electron 实际 WebGL 画面。
// 临时文档由外层冒烟持有，测试不会改用户当前工作区或真实作品。
const fs = require("node:fs");
const path = require("node:path");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// iframe 是同源原页面，读取内部 DOM 只用于断言与操作真实控件。
// 不暴露场景 store，不用反射 Vue 私有状态改位置、机位或保存结果。
// 每次重新找 document，重开后不会继续操作已经卸载的旧页面。
async function child(ctx, body) {
  const result = await ctx.run(`(()=>{try{const d=document.querySelector('[data-original-director]')?.contentDocument;if(!d)throw Error('iframe not loaded');const w=d.defaultView;return {value:(()=>{${body}})()};}catch(error){return {failure:String(error),stack:error.stack};}})()`);
  if (result?.failure) throw Error(`${result.failure}\n${body}\n${result.stack}`);
  return result?.value;
}

// 正式添加菜单创建场景节点，再通过节点自己的入口打开导演台。
// ready 是消息握手，canvas 是原 WebGL 容器，两者都需要成立。
// 不通过独立 HTML 演示页截图冒充幻域正式入口已经接通。
async function open(ctx, add = false) {
  if (add) {
    await ctx.click("[data-canvas-toolbar] .hy-dock-add");
    await ctx.click('[data-node-kind="scene"]');
    await dragScene(ctx, "empty");
  }
  await ctx.click('[data-kind="scene"] .hy-chip');
  await ctx.wait("document.querySelector('[data-director-state=ready]')");
  await ctx.wait("document.querySelector('[data-original-director]')?.contentDocument?.querySelector('canvas')");
  await delay(1500);
}

// 兼容图标按钮的 title 与 aria-label，不按按钮在 DOM 中的偶然序号定位。
// 精确文字优先，避免把“关闭帮助”误点成退出整个场景。
// 找不到按钮直接失败，不跳过用例或用宿主状态强行完成动作。
async function button(ctx, label) {
  await child(ctx, `const b=[...d.querySelectorAll('button')].findLast(b=>b.textContent.trim()===${JSON.stringify(label)}||b.title===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)});if(!b)throw Error('missing button: '+${JSON.stringify(label)});b.click();`);
  await delay(120);
}

// 实际退出按钮应产生预览保存，宿主必须等图片与 JSON 写入后才卸载。
// 轮询使用主进程定时器，窗口被遮挡时也有明确上限。
// 文件存在性检查在主进程完成，不能把 DOM 的成功文案当落盘证据。
async function close(ctx) {
  await child(ctx, "d.querySelector('.composer-close-action').click();");
  await ctx.wait("!document.querySelector('[data-original-director]')");
}

// 卡片空白区和真实取景缩略图都必须能作为抓取面，不能只让标题可拖。
// 前提是正式添加的场景节点已经存在，且导演台窗口尚未打开。
// 首次添加测 empty，真实保存后测 preview；两个分支运行同一条输入路径。
// 这像搬相框时抓住框内的空白位置，不能被盖在上面的透明“禁止移动”层挡住。
// 这里的透明层对应祖先 nodrag，测试不靠扫描这个类名判断通过。
// 以实际屏幕矩形为证据，可以同时发现图片原生拖拽抢走事件的问题。
// 只注入 Electron 鼠标事件，不调用节点更新、拖动回调或 React 私有状态。
// 一旦内容区不能拖动，后面的画布镜头也不能代替节点移动来满足断言。
async function dragScene(ctx, state) {
  // 磁盘上有预览文件不代表浏览器已解码，带图场景先等待真正的图片就绪。
  // 否则拖到的可能仍是空容器，无法覆盖原生图片拖拽与节点移动的冲突。
  // 等待由外层有界轮询负责，缺图会明确失败，不伪造 complete 或自然尺寸。
  if (state === "preview") await ctx.wait("document.querySelector('[data-kind=scene] img')?.complete&&document.querySelector('[data-kind=scene] img')?.naturalWidth>0");
  // 每次从当前内容区读边界，预览生成后重新测量，不沿用旧图片尺寸。
  // 返回的是普通矩形数据，不把 DOM 元素带进主进程或下一次页面实例。
  // 选择左上留白作为抓取点，避免误按中央“打开导演台”的真实按钮。
  const bounds = () => ctx.run("document.querySelector('[data-kind=scene] .hy-node-empty').getBoundingClientRect().toJSON()");
  const before = await bounds();
  // 首次创建与重开后的节点都可能处在不同视图位置，前后图各自保留现场。
  // 这张图拍摄在按下之前，不能用松手后的同一截图重复充当“拖动前”。
  // 证据文件只进入本次临时根，由交付步骤按需复制，不进入用户的素材目录。
  await ctx.shot(`director-node-${state}-before`);
  // 同时记录镜头，专门反证“拖了整个画布，看起来卡片动了”的假通过。
  // 屏幕位移直接与输入位移比较，不把默认 zoom=1 当成测试前提。
  // 镜头缩放可能来自前序真实操作，但同一次卡片拖动不应改变它。
  const viewport = await ctx.run("document.querySelector('.react-flow__viewport').style.transform");
  // 抓取点横向内移二十像素、纵向取正文四分之一处，排除标题、端口和中央按钮。
  // 新节点靠近画布顶边时，从最上方抓取会触发引擎正常的边缘自动平移。
  // 因此取内部点隔离“只搬节点”的场景，不关闭产品的边缘平移来迁就测试。
  // 这里不通过标题拖动绕开故障，必须从用户截图中的大块正文区域开始。
  // 整型坐标满足 Electron 输入接口，子像素差在最终断言保留容差。
  const point = { x: Math.round(before.x + 20), y: Math.round(before.y + before.height / 4) };
  // 先将鼠标真正移到目标上，避免上一用例留下的 hover 或光标位置影响按下。
  // 按住左键与后续移动分开送达，图引擎必须自己开始一次真实拖动事务。
  // 自动事件仍不是人工鼠标手感验收，证据记录继续区分两者。
  ctx.win.webContents.sendInputEvent({ type: "mouseMove", ...point });
  ctx.win.webContents.sendInputEvent({ type: "mouseDown", ...point, button: "left", clickCount: 1 });
  // 给按下事件一轮主进程调度时间，不用页面 rAF，窗口隐藏也能结束。
  // 这个等待只分开输入时序，不修改作品坐标、不伪造拖动完成状态。
  // 前后都有真实位置读取，因此单纯等待不会使错误实现得到通过。
  await delay(50);
  // 分两步移动能覆盖原生图片 dragstart；一次直接瞬移更容易漏掉这类冲突。
  // 每一步明确保留左键，不能把普通 hover 误认为用户抓住卡片在搬动。
  // 最终目标在原位置右下方，避开应用导航与其他窗口按钮。
  for (const distance of [60, 120]) {
    ctx.win.webContents.sendInputEvent({ type: "mouseMove", x: point.x + distance, y: point.y + distance / 2, modifiers: ["leftButtonDown"] });
    // 让浏览器处理本步输入后再发下一步，不依赖机器刚好一次处理所有事件。
    // 延时固定且有限，失败由几何断言暴露，不自动重试掩盖故障。
    await delay(50);
  }
  // 松手的位置与最后一步相同，避免额外的鼠标位移改变预期抓取偏移。
  // 原编辑器在松手后提交历史，测试没有绕开其保存或撤销模型。
  // 点击入口必须保持关闭，拖动不能在浏览器补发 click 时打开导演台。
  ctx.win.webContents.sendInputEvent({ type: "mouseUp", x: point.x + 120, y: point.y + 60, button: "left", clickCount: 1 });
  // 等待只给 React 提交与布局测量留余量；实际成功仍由下面的矩形判断决定。
  // 不读取内部 selected 或节点数组来给测得的结果补上一个预期位置。
  await delay(180);
  const after = await bounds();
  // 同时比较横纵位移，卡在单方向、只滚动画布或完全不动都会失败。
  // 两像素只容纳整数输入与子像素布局，不允许缩小预期来迁就回归。
  // 预览分支以实际图片存在为前提，不能把空节点重复测两遍冒称带图已通过。
  const moved = Math.abs(after.x - before.x - 120) < 2 && Math.abs(after.y - before.y - 60) < 2;
  // 几何失败时保留两次原始读数，区分布局尚未稳定、位移错误和镜头变化。
  // 这里只打印测试卡片矩形，不输出真实用户的文件路径或场景内容。
  // 日志不参与判定，不能把打印出的预期值回填给页面让断言变绿。
  console.log("DIRECTOR_NODE_DRAG", state, JSON.stringify({ before, after, viewport, moved }));
  // 空场景失败说明抓取面被控件隔离标记覆盖，带图失败还可能是原生图片拖拽。
  // 分开标记两种状态，使将来回归时能区分组件结构与图片事件的不同故障来源。
  // 测试不会把其中一种失败换成只拖标题，从而保留用户报告的实际命中路径。
  // 图片来自前一次真实退出保存的 JPEG，不由测试塞一张 data URL 冒充带图节点。
  // 如果图片服务失败，前序落盘检查已经失败，本项不会替它生成假预览。
  // 节点拖动沿用原工程事务，因此后续打开读取的仍是同一个场景身份。
  // 此处不重新添加节点，避免新建空场景掩盖真实预览卡片的移动问题。
  // 独立导演台的三维人物移动不在本断言范围，不能把节点移动等同于模型手柄验收。
  // 页面不能出现导演台 iframe，说明正文拖动没有误触打开入口。
  // 镜头矩阵未变加上卡片位移，才说明移动的是独立节点而非整个工作区。
  // 后续 open 继续点击同一真实按钮，沿用原保存、重开和模型回归。
  ctx.smoke.check(`${state} director card drags from its body without opening or panning`, moved && await ctx.run(`document.querySelector('.react-flow__viewport').style.transform===${JSON.stringify(viewport)}&&!document.querySelector('[data-original-director]')`));
  // 保留松手后的正式工作区截图，交付时可看见移动后的卡片与原画布网格。
  // state 只是文件名和断言标签，不参与产品数据，也不改变被测节点类型。
  await ctx.shot(`director-node-${state}-dragged`);
}

// DOM 摘要帮助追踪原组件控件与状态，最终证据仍以真实截图和磁盘内容为准。
// 只记录控件文字与类名，不记录用户令牌或任何真实用户场景。
// 这是本次隔离测试夹具中的页面，不向生产页面增加调试入口。
async function inspect(ctx) {
  const dom = await child(ctx, "return {buttons:[...d.querySelectorAll('button')].map(b=>({text:b.textContent.trim(),title:b.title,aria:b.getAttribute('aria-label'),class:b.className})),inputs:[...d.querySelectorAll('input,select')].map(e=>({tag:e.tagName,type:e.type,value:e.value,class:e.className,html:e.outerHTML})),canvases:[...d.querySelectorAll('canvas')].map(e=>({width:e.width,height:e.height,parent:e.parentElement.className})),text:d.body.innerText};");
  fs.writeFileSync(path.join(ctx.root, "original-dom.json"), JSON.stringify(dom, null, 2));
}

// 普通输入遵循原组件自己的 focus/input/blur 提交流程。
// 事件构造器来自 iframe 所属窗口，不用父窗口原型绕过子页面的输入逻辑。
// 修改的始终是可见属性字段，不直接写 Vue store 或场景对象。
async function field(ctx, selector, value) {
  await child(ctx, `const e=d.querySelector(${JSON.stringify(selector)});if(!e)throw Error('field missing');e.focus();e.value=${JSON.stringify(String(value))};e.dispatchEvent(new w.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));e.blur();`);
  await delay(100);
}

// 图层选择与属性页面均使用原按钮，标签取实际保存对象而不是假定固定 ID。
// 选相机和选人物共享同一路径，可发现检查器未随图层切换的问题。
// 选择对象不会通过重新打开 iframe 清空原组件的撤销历史。
async function select(ctx, label) {
  await button(ctx, "图层");
  await child(ctx, `const e=[...d.querySelectorAll('.item-label')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw Error('layer missing');e.click();`);
  await button(ctx, "属性");
}

// 真实跟踪闭环：先绑定人物，再移动人物并等自动保存，最后从磁盘核对目标与坐标。
// 不把保存夹具的返回值作为成功证明；这里使用生产 JSON 写入与实际原组件事件。
// DOM 输入属于自动验证，真实鼠标拖动的手感仍需人工验收。
async function editAndTrack(ctx, scene) {
  await child(ctx, "d.querySelector('.help-close')?.click();");
  await select(ctx, scene.characters[0].label);
  await field(ctx, ".num-input", 1.25);
  await button(ctx, "撤销");
  ctx.smoke.check("native undo restores the edited character position", await child(ctx, "return Number(d.querySelector('.num-input').value)===0;"));
  await button(ctx, "重做");
  await select(ctx, scene.cameras[0].label);
  await field(ctx, ".prop-select", scene.characters[0].id);
  await select(ctx, scene.characters[0].label);
  await button(ctx, "姿势");
  ctx.smoke.check("all 28 original posture presets are present", await child(ctx, "return d.querySelectorAll('.pose-grid button').length===28;"));
  await child(ctx, "d.querySelector('.pose-grid button').click();");
  await button(ctx, "属性");
  await field(ctx, ".num-input", 2.5);
  await inspect(ctx);
  await ctx.shot("original-03-tracking");
  await delay(10500);
  const saved = JSON.parse(fs.readFileSync(ctx.documentPath, "utf8")).infiniteCanvas.nodes.find(node => node.data.kind === "scene").data.scene;
  ctx.smoke.check("native autosave records movement and camera tracking target", saved.characters[0].position.x === 2.5 && saved.cameras[0].lookAtTarget === saved.characters[0].id);
}

// 持久化失败通过生产写盘入口抛错，磁盘原文必须保持不变。
// 原组件 emit 后会先关闭自身；嵌入桥接要恢复最近快照，不能卸载宿主。
// 恢复会重建原组件，因此撤销栈不保证跨失败保留，文档必须说明这一限制。
// 恢复后再次退出走同一生产写盘器，不把失败开关关闭等同于保存成功。
async function failureAndConfirm(ctx) {
  const before = fs.readFileSync(ctx.documentPath, "utf8");
  ctx.setFailWrites(true);
  await child(ctx, "d.querySelector('.composer-close-action').click();");
  await ctx.wait("document.querySelector('[data-director-state=error]')");
  ctx.smoke.check("failed exit retains native scene and original disk", fs.readFileSync(ctx.documentPath, "utf8") === before && await child(ctx, "return !!d.querySelector('.composer-container');"));
  await ctx.shot("original-04-save-error");
  ctx.setFailWrites(false);
  await close(ctx);
  await open(ctx);
  // 原组件未选机位时第一次确认只选机位，测试遵守原步骤，不改成一次点击强制输出。
  await select(ctx, "机位1");
  await child(ctx, "d.querySelector('.composer-generate-action').click();");
  await ctx.wait("!document.querySelector('[data-original-director]')");
  const saved = JSON.parse(fs.readFileSync(ctx.documentPath, "utf8")).infiniteCanvas;
  const scene = saved.nodes.find(node => node.data.kind === "scene");
  const image = saved.nodes.find(node => node.data.kind === "image");
  ctx.smoke.check("native confirmation creates a real JPEG image node and edge", !!image && fs.existsSync(image.data.media.path) && saved.edges.some(edge => edge.source === scene.id && edge.target === image.id));
  await ctx.shot("original-05-confirmed-image");
}

// PNG 使用原页面截图按钮，经专线交给浏览器/Electron 真正下载。
// 保存路径只改到本测试目录，避免系统下载弹框覆盖用户正在使用的桌面。
// 字节签名和文件大小来自实际下载文件，不把点击按钮当成导出完成。
// 定时器只给下载设失败上限，成功依赖 DownloadItem 的 completed 事件。
async function downloadPng(ctx) {
  const file = path.join(ctx.root, "original-capture.png"), session = ctx.win.webContents.session;
  let handler, timer;
  const done = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(Error("native-png-download-timeout")), 10000);
    handler = (_event, item) => {
      item.setSavePath(file);
      item.once("done", (_event, state) => state === "completed" ? resolve() : reject(Error(state)));
    };
    session.once("will-download", handler);
  });
  try {
    await button(ctx, "截图");
    await done;
    const bytes = fs.readFileSync(file);
    ctx.smoke.check("original screenshot downloads an actual local PNG", bytes.subarray(1, 4).toString() === "PNG" && bytes.length > 10000);
  } finally { clearTimeout(timer); session.removeListener("will-download", handler); }
}

// 体型切换必须加载供应的第二个 GLB，不能只改属性按钮或复用旧几何人偶。
// 原画面和图层仍来自同一 iframe；恢复标准体型后继续验证其动画工具。
// 动画面板只通过原按钮打开，不把自制时间轴当作“原功能已经还原”。
async function nativePanels(ctx) {
  await button(ctx, "女性素体");
  await delay(1200);
  ctx.smoke.check("female body uses the supplied local bodychan GLB", ctx.modelResponses.some(item => item.url.endsWith("/director/models/bodychan.glb") && item.status === 200) && await child(ctx, "return !!d.querySelector('.bodytype-chip.active')&&!!d.querySelector('canvas');"));
  await ctx.shot("original-06-female-model");
  await button(ctx, "标准素体");
  await button(ctx, "相机动画");
  await ctx.shot("original-07-animation");
  await inspect(ctx);
  await downloadPng(ctx);
  await button(ctx, "相机动画");
}

// 首轮闭环先证明真实原组件打开、写盘、预览和重开恢复。
// 更细的模型姿势、跟踪与异常场景沿同一窗口继续验证，不能套用旧版本结果。
// 所有 check 都来自实际页面或磁盘；没有用预设成功返回值代替保存服务。
async function checkDirectorRuntime(ctx) {
  // app:// 的资源不保证出现在 Performance Timing 中，使用真实网络响应记录模型加载。
  // 这里只观察 Chromium 返回的状态，不用额外 fetch 伪造“模型加载成功”。
  ctx.modelResponses = [];
  await ctx.win.webContents.debugger.sendCommand("Network.enable");
  ctx.win.webContents.debugger.on("message", (_event, method, data) => {
    if (method === "Network.responseReceived" && data.response.url.includes("/director/models/")) ctx.modelResponses.push(data.response);
  });
  await open(ctx, true);
  await inspect(ctx);
  await ctx.shot("original-01-open");
  ctx.smoke.check("native iframe uses the app protocol and isolated original DOM", await child(ctx, "return d.URL.startsWith('app://')&&!!d.querySelector('.composer-container');"));
  await close(ctx);
  const disk = JSON.parse(fs.readFileSync(ctx.documentPath, "utf8")).infiniteCanvas;
  const scene = disk.nodes.find(node => node.data.kind === "scene").data.scene;
  ctx.smoke.check("native scene and JPEG written through real host services", scene.version === 3 && scene.characters.length === 1 && scene.cameras.length === 1 && fs.existsSync(scene.previewPath));
  await dragScene(ctx, "preview");
  await open(ctx);
  await editAndTrack(ctx, scene);
  await ctx.shot("original-02-reopen");
  ctx.smoke.check("reopen uses original objects without the removed rewrite", await child(ctx, "return !!d.querySelector('canvas')&&!d.querySelector('.three-host');"));
  await nativePanels(ctx);
  await failureAndConfirm(ctx);
  console.log("ORIGINAL_DIRECTOR_EVIDENCE", ctx.root);
}
module.exports = { checkDirectorRuntime };

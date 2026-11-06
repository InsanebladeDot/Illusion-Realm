/** 漫画对话框回归：真实Electron静态页面、正式preload、真实模板PNG与浏览器图片编码。 */
// 只隔离账户和用户文档，不用mock组件代替产品页面。
// 背景使用仓库里的真实JPEG，错误文件则是明确的无效图片字节。
// 按钮选择通过页面真实控件，文件输入通过CDP绑定实际磁盘文件。
// CDP不证明系统文件选择器已由人手点击；这项人工验证单独列为未验证。
// 下载监听等待真实PNG完成，再检查尺寸和像素，而不是只看成功文案。
// 所有用户数据与下载都写入本轮临时目录，不读取用户真实模型和密钥。
// 不启动Python、ComfyUI、FFmpeg或任何云端服务。
// 冒烟读取Next静态导出，构建指纹过期必须以环境退出码结束。
// 每个检查都读实际DOM或输出文件，不按源码里是否出现某个函数名判断通过。
// 画布内容与文字输入独立验证，能发现Delete误删和同模板状态污染。
// 主题使用生产nativeTheme handler，截图不是手动给HTML加一套dark类。
// 单轮只创建本脚本自己的窗口，不能关闭用户正在使用的Electron应用。
// 隐藏窗口也关闭后台节流，等待由主进程计时，避免页面rAF暂停导致挂死。
// 本测试不宣称验证了真实前台遮挡，显式遮挡维度仍由harness判断环境。
// 窗口、CDP、事件和下载都在本轮进程生命周期内，退出交给统一护栏。
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { app, BrowserWindow, nativeImage } = require("electron");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "cartoon-dialogue", timeoutMs: 120000 });
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const chrome = require("../apps/electron/src/main/core/windows/window-chrome");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-cartoon-smoke-"));
let win, downloaded = "";
const errors = [], run = smoke.createRun(), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// 临时浏览器目录不共享生产客户端的单实例锁、Cookie或localStorage。
// 禁用GPU只作用于测试，PNG仍由Chromium真实绘制和Canvas编码。
// 看门狗覆盖启动与所有等待，失败不能只打印日志然后返回零退出码。
// app协议在ready前注册，静态资源路径与正式桌面客户端一致。
// 生产标题栏需要配套窗口参数和handler，不能省略后说门牌未显示。
// 账户返回未登录，使用已有游客夹具挂载本地工具，不生成假登录凭据。
// 模型下载列表为空，不扫描本机磁盘，也不会产生真正后台下载。
// IPC公告为空；静态更新公告仍通过正式关闭按钮确认后再继续。
// 所有handler通过registerHandle封装，保持正式IpcResult契约。
// handler替身只属于这个进程，不修改应用源代码或用户设置文件。
// 这里只验证编辑与布局，不把空模型清单当作模型扫描能力证明。
// 未注册任意文件写入API，图片导入仍通过浏览器File机制执行。
// 背景data URL来自真实文件解码，不在页面直接写入一段假SVG背景。
// 测试输入路径只用于CDP，不向截图、日志和产品文案输出私人目录。
// 环境退出与断言失败不同，harness保留各自退出码。
app.setPath("userData", path.join(root, "browser")); app.disableHardwareAcceleration();
smoke.setWorkDir(root); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
require("../apps/electron/src/main/core/windows/window.handlers").registerWindowHandlers();
require("./lib/guest-session-fixture").installGuestDocumentFixture();
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHENTICATED" } }));
registerHandle(C.MODELS_DOWNLOAD_LIST, () => ({ revision: 0, tasks: [] }));
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root);
registerHandle(C.MODELS_SCAN, () => []); registerHandle(C.CHANGELOG_READ, () => "");
// GIF只检查共享宿主，明确提供缺少FFmpeg状态，不启动或伪装转码成功。
registerHandle(C.VIDEO_FFMPEG_STATUS, () => ({ available: false, path: "", source: "missing" }));

// 等待的节拍在主进程，窗口不可见时不会依赖页面动画帧继续推进。
// 每次条件只读取一个真实状态，100次仍未命中就抛错而不是报告SKIP。
// expression写进失败消息，能定位是资源未挂载、弹窗未关闭还是PNG未完成。
// delay只是给React提交机会，断言仍以DOM为准，不拿固定时间当作成功。
// click使用真实按钮事件，不读取React私有fiber或直接调用组件内部函数。
// wait不会主动修改产品状态，因此不会把失败“修好”后再断言。
// capturePage保存原始PNG，不裁掉溢出区域或用缩放掩盖布局问题。
// 截图与导出文件存放同一临时目录，便于对照画面与产物。
// 测试结束保留证据，不递归删除工作区、安装目录或用户数据。
// capture与输入helper都不写源码，构建指纹不会被测试过程改坏。
// 文本输入使用原生setter并派发input，React受控onChange才会真正执行。
// 直接设element.value而不发事件会绕开真实状态，不能作为编辑能力通过。
// 输入节点可能是search或textarea，helper依据真实tag选择对应原型。
// 字符串通过JSON传给executeJavaScript，不拼接成能执行用户正文的代码。
// copy与剪贴板本轮不涉及，测试不会覆盖用户系统剪贴板。
async function wait(expression) {
  for (let index = 0; index < 150; index++) { if (await run(`Boolean(${expression})`)) return; await delay(60); }
  throw new Error("Dialogue condition timed out: " + expression);
}
async function click(selector) { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(80); }
async function capture(name) { await delay(200); fs.writeFileSync(path.join(root, name + ".png"), (await win.webContents.capturePage()).toPNG()); }
async function input(selector, value) {
  // 正文现在默认锁定，既有编辑用例先通过真实双击事件入口解锁。
  // 不能只用原生setter绕过readOnly，否则会掩盖双击编辑未接线的回归。
  // 数值和搜索仍正常输入，不把所有控件误改为同一个正文编辑模式。
  await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(e?.tagName==='TEXTAREA'&&e.readOnly)e.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));})()`);
  await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await delay(80);
}

// 入口的焦点归还需要真实鼠标按下；HTMLElement.click不会像用户点击那样聚焦按钮。
// 使用可见几何中心，不读取React内部属性，遮挡或零尺寸会使真实点击无法生效。
// pointer设备只属于当前测试窗口，不向系统桌面发送鼠标消息。
async function clickTemplateTrigger() {
  const point = await run("(()=>{const r=document.querySelector('[aria-label=\"选择模板样式\"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
  win.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
  win.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point });
  await wait("document.querySelector('[data-dialogue-search]')");
}

// 模板入口按翻译后的可访问名称查找，不往产品加只服务测试的操作后门。
// 用户先打开弹窗再选择，测试不能直接把模板对象塞进编辑器状态。
// 每次打开检查真实素材卡，能发现默认布局还残留固定素材栏的回归。
// 关闭后等待弹窗真正卸载，再读画布，避免把动画中间态当最终结果。
// 过滤所有48张卡包含透明素材，borderless本身空白不算加载失败。
// 空筛选不应更改当前画布，测试会在已添加图层后再次查询。
// 同款模板多次选择必须产生多个实例，而不是复用同一个templateId当图层id。
// 此helper本身不修改文字，新增默认值仍来自正式创建逻辑。
// 默认样例中文来自实际词条，不能把英文模板误当作用户内容。
// focus检查定位真实document.activeElement，不能只看autofocus属性存在。
// Escape由真实键盘事件关闭资源外壳，不直接移除DOM。
// 弹窗期间Delete不能穿透画布，关闭后选中项仍应保持。
// 选择完成后的模板列表释放，避免隐藏卡片仍参与键盘顺序。
async function choose(id) {
  await clickTemplateTrigger();
  await wait("document.querySelector('[data-dialogue-library]')");
  await click(`[data-dialogue-template-card="${id}"] > button`);
  await wait("!document.querySelector('[data-dialogue-library]')");
}

// 文件输入通过CDP挂载本机文件，随后由生产onChange读取并解码。
// 这是实文件导入边界测试，未模拟系统对话框的原生鼠标点击。
// 空files模拟浏览器取消后的无文件事件，不应该清空当前背景。
// 文件名与字节都由真实File对象提供，不使用已废弃的File.path。
// 损坏文件使用.png后缀，确保回归能检查解码失败而不仅是扩展名校验。
// CDP先定位input节点，找不到时立即失败，不能绕过UI直接改文档。
// DOM.getDocument只查看本轮页面，不访问其他窗口的文件或元素。
// 触发同一个onChange入口，因此重复选择也会走同一文件流程。
// 本轮不验证拖入背景，产品没有为此新增一个未经授权的导入通道。
// 导入自然尺寸随后进入SVG viewBox，宽高断言不依赖产品提示文案。
// 错误发生后busy应解除，允许用户重选有效图片。
// 文件列表为空时保留当前选择，用户不需要再从头添加模板。
// 资源上传没有联网，不把文件内容传给任何在线模型。
// FileReader与Image超时在产品内部受限，测试另有总看门狗兜底。
async function setFile(file) {
  const { root: node } = await win.webContents.debugger.sendCommand("DOM.getDocument");
  const { nodeId } = await win.webContents.debugger.sendCommand("DOM.querySelector", { nodeId: node.nodeId, selector: "[data-dialogue-file]" });
  await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", { nodeId, files: file ? [file] : [] });
  await run("document.querySelector('[data-dialogue-file]').dispatchEvent(new Event('change',{bubbles:true}))");
}

// 首屏必须只有画布与属性，素材库按需出现，符合本轮最新两栏要求。
// 以实际区域位置判定两栏，不能因为文件里写了grid就认为布局正确。
// 工具门牌使用共用标题槽，页面内不应再次显示素材设置大标题。
// 先添加两种模板，再改其中一层文字，能够发现参数串层问题。
// Delete在textarea焦点下只能编辑文字，不删除整个气泡实例。
// 把焦点移到SVG图层后Delete才走图层删除，检验真实键盘路径。
// undo恢复被删层，redo再次删除，整个流程都通过正式按钮。
// 模板弹窗打开时再按Delete，确认背后画布不会穿透响应。
// 搜索无结果后清除，可以恢复48种模板，证明查询状态仅属于资源面板。
// 最后留下实际编辑内容供后续导出与主题截图使用。
// 不用手动setState或外部注入图层，所以结果能覆盖UI回调是否接通。
// 所有断言失败会进入harness记录，继续截图不能把失败改成成功。
// 单个输入字符与换行保留由实际DOM文本比较，不能只看textarea有非空值。
// 画布中text节点是正式SVG内容，导出后仍会使用它们。
async function checkEditing() {
  // 进入规范路由，兼容/cartoon的重定向不参与首屏两栏几何比较。
  // 等到SVG出现才比较区域，不能把导航占位或页面骨架当作正式舞台。
  // 此时临时文档没有customAssets，默认目录应只包含本轮48种内置样式。
  // 首屏无library断言检查DOM不存在，而不是仅检查它的display是否none。
  // 若固定素材栏只是藏起来仍保留布局占位，属性区的实际左右位置能够辅助发现。
  // 标题槽检查漫画名称，不能只判断公共槽存在，因为本地库也会使用同一外壳。
  // 第一个模板保留自己的中文默认文字，第二个通过textarea输入不同内容。
  // 两份正文不同是串层检测前提；只检查图层数量为2不足以证明内容独立。
  // 尖括号作为负向输入，实际textContent应保留字面内容，不能变成HTML标签。
  // Delete前明确给输入框焦点，测试不能依赖上一动作恰好留下的activeElement。
  // 输入框删除后仍为2层，说明按键没有穿透到window监听删除选中实例。
  // 随后把焦点移到SVG层，使用同一个keydown事件，删除预期应反转为成功。
  // 删除后数量为1只能证明减少一层，因此撤销还检查被删除层的具体文字。
  // 若删除错误目标，恢复后的顺序和正文断言会暴露问题。
  // 重复添加classic-left后应有3个不同UUID，不能只检查templateId不同。
  // 这条反例对应用户多次使用相同气泡轮廓的常见编辑场景。
  await win.loadURL("app://app/tools/image/cartoon"); await wait("document.querySelector('[data-dialogue-svg]')");
  // 正式公告来自静态changelog，空IPC不会阻止它出现；按真实按钮确认后再测。
  // 等待出现与消失两端，不能把尚未挂载误当作已关闭。
  // 清理只影响临时用户文档，不改用户真实公告阅读状态。
  await wait("document.querySelector('[aria-labelledby=update-announcement-title]')");
  await click("[aria-labelledby=update-announcement-title] button"); await wait("!document.querySelector('[aria-labelledby=update-announcement-title]')");
  smoke.check("Two-column workspace starts without a persistent template library", await run("!document.querySelector('[data-dialogue-library]')&&document.querySelector('[data-dialogue-properties]').getBoundingClientRect().left>document.querySelector('[data-dialogue-stage]').getBoundingClientRect().left"));
  smoke.check("Tool description uses the shared caption slot", await run("document.querySelector('[data-window-titlebar-content=cartoon]')?.textContent.includes('漫画对话框')"));
  await choose("classic-left"); await choose("oval"); await input("[data-dialogue-text]", "第一层对白\nLine two <literal>");
  smoke.check("Adding and editing templates creates two independent layers", await run("document.querySelectorAll('[data-dialogue-layer]').length===2&&document.querySelectorAll('[data-dialogue-layer]')[0].textContent.includes('我们从这里出发')&&document.querySelectorAll('[data-dialogue-layer]')[1].textContent.includes('第一层对白')"));
  await run("document.querySelector('[data-dialogue-text]').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}))");
  smoke.check("Delete in the text field preserves bubble instances", await run("document.querySelectorAll('[data-dialogue-layer]').length===2"));
  await run("document.querySelectorAll('[data-dialogue-layer]')[1].focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}))"); await delay(80);
  smoke.check("Delete on the selected bubble removes exactly that instance", await run("document.querySelectorAll('[data-dialogue-layer]').length===1"));
  await run("[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')==='撤销').click()"); await delay(80);
  smoke.check("Undo restores the deleted bubble and its text", await run("document.querySelectorAll('[data-dialogue-layer]').length===2&&document.querySelectorAll('[data-dialogue-layer]')[1].textContent.includes('第一层对白')"));
  await choose("classic-left");
  smoke.check("Choosing the same template twice creates distinct layer IDs", await run("new Set([...document.querySelectorAll('[data-dialogue-layer]')].map(e=>e.dataset.dialogueLayer)).size===3"));
}

// 弹窗仍使用真实共享外壳，缩窄时可以变成主区资源页，不假定必须居中遮罩。
// 输入一串不存在的词作为负向数据，不能以空query冒充无结果用例。
// 搜索清空使用同一受控input通道，避免直接替换卡片列表绕过筛选逻辑。
// 等待所有预览完成后检查naturalWidth，可以发现静态导出遗漏public资源。
// 模板图片不会从文档目录直接加载，正式页面不依赖开发者的D盘文件。
// 删除保护以已有3层为前提，默认空画布无法检出穿透删除的错误。
// Escape关闭后检查选中实例数量没变，关闭动作不能暗中创建或删除内容。
// 这些用例不调用模型、不花token，所有资源均为已打包静态文件。
// 取消模板选择只改变展示状态，不把取消写为一次内容撤销。
// 深浅主题截图安排在实际内容建立后，不能用空白页代替主题覆盖。
// 图片失败fallback仍由LibraryCard负责，当前正向用例必须确认48张真图可读。
// png透明像素不等于缺图，naturalWidth是区分是否解码成功的实际依据。
// 不要求用户在执行时切回桌面，截图使用本轮隐藏窗口。
// 返回工具箱的真实导航会在最后覆盖，确保门牌不残留到其他页面。
async function checkPicker() {
  // 真实入口点击已登记trigger，再断言activeElement是搜索框，证明打开时焦点进入。
  // 焦点越界用例在弹窗存在时主动聚焦背后层，不去修改任何编辑器业务数据。
  // Tab事件设置cancelable，preventDefault才有与浏览器真实默认动作一致的意义。
  // 回到dialog内即可通过，不硬编码关闭按钮在宽窄布局中的顺序差异。
  // 所有48张图片检查以naturalWidth为准，响应200但图片损坏仍不能通过。
  // 把loading改成eager只改变下载时机，不改变生产资源的内容或路径。
  // 无结果关键字包含数字，避免翻译或默认用途恰巧命中测试词。
  // 无结果时仍检查3层，能发现把visible模板列表误用成图层列表的错误。
  // 清空关键词后Delete测试位于搜索框，不能拿已卸载的旧input派发事件。
  // 弹窗保护以保留图层为准，不把Delete没有出现错误日志当作保护成功。
  // 截图在48图加载和查询恢复之后，避免交付一张虚假的空模板库。
  // Escape走公共外壳的文档事件，不通过测试强行把picker.open设false。
  // 关闭后同时检查DOM卸载与焦点回到trigger，这两个契约各自可能独立回归。
  // 若焦点只回到body，鼠标用户可能看不出问题，但键盘断言必须失败。
  // 画布内容并未因关闭重新创建，所以下一步拖动沿用这次验证的3份实例。
  await clickTemplateTrigger();
  smoke.check("Opening the template dialog focuses its search field", await run("document.activeElement===document.querySelector('[data-dialogue-search]')"));
  // 模拟焦点意外回到背后图层，Tab必须回到弹窗，不能继续遍历属性区。
  // 断言包含关系而不是指定第一个按钮，适配紧凑页和宽屏弹窗不同的关闭控件。
  await run("document.querySelector('[data-dialogue-select]').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}))");
  smoke.check("Tab brings escaped focus back into the template dialog", await run("document.querySelector('[data-dialogue-library]').closest('[role=dialog]').contains(document.activeElement)"));
  // 仅解除浏览器懒加载等待，让隐藏在列表下方的实际PNG也进行真实解码。
  // 不替换src或图片内容，能检出任何一个静态资源缺失。
  // 用户正常滚动会触发同一批资源加载，此处为了有界测试一次性请求。
  await run("document.querySelectorAll('[data-dialogue-template-list] img').forEach(e=>e.loading='eager')");
  await wait("[...document.querySelectorAll('[data-dialogue-template-list] img')].every(e=>e.complete&&e.naturalWidth>0)");
  smoke.check("All 48 new template images load through the real app protocol", await run("document.querySelectorAll('[data-dialogue-template-card]').length===48"));
  await input("[data-dialogue-search]", "NO_MATCH_012345");
  smoke.check("Search empty state leaves the artwork unchanged", await run("document.querySelectorAll('[data-dialogue-template-card]').length===0&&document.querySelectorAll('[data-dialogue-layer]').length===3"));
  await input("[data-dialogue-search]", "");
  await run("document.querySelector('[data-dialogue-search]').dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}))");
  smoke.check("Delete does not pass through the open template dialog", await run("document.querySelectorAll('[data-dialogue-layer]').length===3"));
  await capture("templates-light");
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await wait("!document.querySelector('[data-dialogue-library]')");
  smoke.check("Closing the template dialog restores focus to its trigger", await run("document.activeElement?.getAttribute('aria-label')==='选择模板样式'"));
}

// 真指针事件经过Chromium命中测试和SVG指针捕获，不手工派发pointermove冒充拖动。
// 起点取最上层气泡中心，确保重叠时实际拖动的是用户看见的那个实例。
// 比较transform可检出缩放坐标未换算、事件没有接通或目标串层。
// 一次拖动后一次撤销必须恢复起点，不能要求用户逐帧撤销。
async function checkDrag() {
  // before数组按真实SVG绘制顺序采样，末项就是当前画面最上层气泡。
  // 指针先移动再按下，避免测试宿主保留在上次模板卡位置导致命中偏离。
  // 起点由包围盒中心取整数，符合Electron输入事件要求的CSS像素坐标。
  // 移动量80乘30在当前画稿范围内，不以边界夹值掩盖坐标计算错误。
  // 两次短等待仅让事件队列提交，最终判断仍读transform而不是等待时长。
  // after前两项必须逐字相等，证明不是所有同款模板一起被移动。
  // before末项与after末项必须不同，证明真实鼠标路径触发了onPatch。
  // 撤销通过正式按钮执行，不能调用测试私有的历史恢复函数绕过UI接线。
  // 恢复比较全部transform数组，不能只看选框大致回到画面中心。
  // 该用例验证普通窗口缩放下的指针拖动，不声称覆盖所有触摸设备或DPR。
  const before = await run("[...document.querySelectorAll('[data-dialogue-layer]')].map(e=>e.getAttribute('transform'))");
  const point = await run("(()=>{const r=[...document.querySelectorAll('[data-dialogue-layer]')].at(-1).getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
  win.webContents.sendInputEvent({ type: "mouseMove", ...point });
  win.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
  await delay(50);
  win.webContents.sendInputEvent({ type: "mouseMove", x: point.x + 80, y: point.y + 30 });
  await delay(50);
  win.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, x: point.x + 80, y: point.y + 30 });
  await delay(80);
  const after = await run("[...document.querySelectorAll('[data-dialogue-layer]')].map(e=>e.getAttribute('transform'))");
  smoke.check("Pointer dragging moves only the top selected bubble", before[2] !== after[2] && before[0] === after[0] && before[1] === after[1]);
  await run("[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')==='撤销').click()");
  await delay(80);
  smoke.check("A single undo restores an entire drag gesture", await run(`JSON.stringify([...document.querySelectorAll('[data-dialogue-layer]')].map(e=>e.getAttribute('transform')))===${JSON.stringify(JSON.stringify(before))}`));
}

// 缩放与移动共用真实指针发送，不向页面直接派发伪pointer事件。
// 起点是手柄实际屏幕中心，坐标来自SVG矩阵，旋转后仍对应用户看得见的位置。
// 主进程节拍给React提交机会，窗口隐藏时不依赖rAF继续运行。
// 鼠标按下、移动、松开覆盖正式捕获路径，而不是调用resizeDialogue函数代替交互。
// 这里只向本次webContents发送事件，不占用用户系统桌面的鼠标焦点。
// 结束后等待一次提交再读取字段，不能把手势尚未结束的状态当最终撤销结果。
async function dragPointer(point, dx, dy) {
  // point必须是已舍入的屏幕CSS坐标，Electron输入接口不接收DOMPoint对象。
  // 先发mouseMove让浏览器命中正确控件，不能依赖上一个测试的鼠标位置。
  // mouseDown使用左键，产品对右键有显式忽略分支，不把右键菜单当缩放。
  // mouseMove后的松开位置与终点一致，避免丢失捕获时又产生一段隐含移动。
  // clickCount只影响浏览器鼠标序列，不直接调用模板卡或气泡的业务回调。
  // 两段等待是主进程计时器，因此offscreen窗口也能稳定收到后续事件。
  // 它们不模拟作品进度，只为异步事件提交留机会，最终仍由状态断言判成功。
  // 此helper不选择层，起点命中哪个真实手柄就必须由产品选择哪个实例。
  // 没有自动重试鼠标操作，失败应检查命中和坐标，而非重复拖到碰巧成功。
  win.webContents.sendInputEvent({ type: "mouseMove", ...point });
  win.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
  await delay(50);
  // 拖动帧也要携带左键仍按下的修饰符，Chromium据此维持pointer capture。
  // 只发mouseDown而让后续move的buttons归零，等于测试告诉浏览器用户已经松手。
  // 这会随焦点环境产生丢捕获，不能据此改产品的旋转公式或关闭失焦验证。
  win.webContents.sendInputEvent({ type: "mouseMove", modifiers: ["leftButtonDown"], x: point.x + dx, y: point.y + dy });
  await delay(50);
  win.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, x: point.x + dx, y: point.y + dy });
  await delay(80);
}

// 读取四角中点而非包围盒边缘，描边和命中区变化不会让测试抓到框体拖动。
// getScreenCTM包含根画稿缩放和气泡旋转，期望锚点在实际屏幕坐标下保持不动。
// index取最后一层对应现有3层实例测试，前两层仍是串层对照数据。
// 返回宽度字段事实，不从被测数学函数自己生成预期结果。
// 不读取React私有状态，DOM与可见数值就是用户可观察结果。
function resizeState(corner) {
  // 属性宽度是自然像素，不能拿getBoundingClientRect的屏幕宽当图层width。
  // 当前公共字段顺序为字号、行高、字距、宽度，索引3读取的是确切宽度事实。
  // 此读取不focus输入，因此不会意外确认一个尚未提交的数字草稿。
  // 所有transform同时返回，后续能比较非目标层是否发生串改。
  // SVG手柄处于旋转后的g内，直接用其getBBox中心还不是屏幕坐标。
  // getScreenCTM补上嵌套scale、rotate及根画稿的留白平移。
  // 返回整形屏幕坐标避免测试宿主拒绝浮点事件；锚点断言因此允许2px误差。
  // 查不到手柄会真实抛错，由harness记录失败，不能回落到画布中心假装拖动。
  // 只读UI无副作用，不改变产品选中层、撤销历史或资源目录。
  return run(`(()=>{const e=document.querySelector('[data-dialogue-resize="${corner}"]'),r=e.getBBox(),p=new DOMPoint(r.x+r.width/2,r.y+r.height/2).matrixTransform(e.getScreenCTM());return {x:Math.round(p.x),y:Math.round(p.y),width:Number(document.querySelectorAll('[data-dialogue-fields] input')[3].value),transforms:[...document.querySelectorAll('[data-dialogue-layer]')].map(n=>n.getAttribute('transform'))}})()`);
}

// 每个角都从相同初始宽度开始：向外拖应变大，而非左上角方向反了变小。
// 对角位置比较能检出只改scale却未调整中心导致整个气泡四周同时扩张的回归。
// 前两层transform不变证明没有误把同款模板一并缩放。
// 宽度来自右栏公共控件，数值变化证明画布参数已回流，而非仅CSS视觉放大。
// 一次撤销比较完整transform，不能只看width恢复却留下错误位置。
// 四个方向复用同一检查，避免每个角各写一套宽松判据。
// 允许2px锚点误差用于输入整数与描边中心，不容忍明显的对角漂移。
// 普通角使用正负屏幕增量，旋转测试另用旋转后的外向向量。
async function checkResizeCorner(corner, opposite, dx, dy) {
  // 角手柄出现在选框四角而不是白框的可见边缘，定位必须依靠控件本身。
  // 透明尾巴留白属于模板画片，不把图像视觉白色范围当缩放边界。
  // 宽度增长后对角保持原地意味着中心必然变化，这与普通整体平移的判据相反。
  // 例如右下外拖60px，左上应稳定；若只改center跟鼠标走，这里会立即失败。
  // 选择角与对角成对传入，nw-se和ne-sw分别验证两条对角线。
  // 这两条对角线共享公式但符号不同，可发现只有一条斜线能正确缩放的问题。
  // before与anchor在按下前分别采样，不能从放大后的width反推一个期望锚点。
  // 每次测试前选中最后实例，因此只有它有四角，查询不会命中后方其他层。
  // 目标宽度必须严格大于初值，能检出左角符号写反而缩小的情况。
  // fixed来自对角手柄位置，气泡中心变化是设计行为，不应被误判成整体漂移。
  // 使用欧式距离比较二维锚点，不能只检查x而漏掉上下跳动。
  // 检查前两层完整transform而非仅宽度，其他实例不应被移动作为缩放副作用。
  // 当前字段精度为整数，宽度只用于大于比较，不要求字段包含所有拖动小数。
  // 撤销恢复逐字比较SVG变换，既检查中心也检查旋转和尺寸。
  // 每个角都先撤销再测下一个，不能累积放大让最后角碰到最大值从而失去判据。
  // 如果撤销多记了一帧，单次按钮之后完整transform比较会失败。
  // 锚点公差覆盖318与320画片边界的细小区别，不允许明显几十像素移位。
  const before = await resizeState(corner), anchor = await resizeState(opposite);
  await dragPointer({ x: before.x, y: before.y }, dx, dy);
  const after = await resizeState(corner), fixed = await resizeState(opposite);
  smoke.check("Corner " + corner + " resizes independently and fixes the opposite corner", after.width > before.width && Math.hypot(fixed.x - anchor.x, fixed.y - anchor.y) <= 2 && before.transforms[0] === after.transforms[0] && before.transforms[1] === after.transforms[1]);
  await run("[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')==='撤销').click()");
  await delay(80);
  smoke.check("One undo restores " + corner + " resize size and position", JSON.stringify((await resizeState(corner)).transforms) === JSON.stringify(before.transforms));
}

// 同一公共数值输入既用于普通字段，也作为手柄缩放的键盘等价入口。
// Enter确认沿生产commit路径，不直接改layer或调用patch。
// 字段按FIELDS稳定顺序定位，query只用在本工具的明确data容器内。
// 聚焦后调用input helper，Delete保护和原生编辑边界与用户操作相同。
// 使用共享EditorFloatField的双击策略，验证六项实际编辑与画布参数回流。
// 数字输入区域滚入属性视口后截图，不用隐藏溢出掩盖输入框仍然只有几像素。
async function setDialogueField(index, value) {
  // label:nth-child只作用于新标记的字段容器，不会数入画布比例或文字对齐菜单。
  // 传入字符串保留输入过程，不能用赋值number绕过公共控件的草稿验证。
  // focus可能让右栏滚动到此字段，这是用户键盘编辑的正常行为。
  // 上一个字段失焦时也会commit，但同值应由共享控件阻止重复历史步骤。
  // input helper使用原生setter与input事件，使React实际接收新草稿。
  // keydown携带bubbles让正式onKeyDown处理Enter，不调用其闭包中的commit。
  // cancelable允许控件preventDefault，避免测试和真实浏览器默认行为不同。
  // 确认后稍后读取可检出属性更新是否真正回流到SVG，不能只读瞬时input值。
  // helper不清空选中状态，切字段应继续修改同一气泡。
  const selector = `[data-dialogue-fields] label:nth-child(${index + 1}) input`;
  await run(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  // 既有数值回归也要先经过生产双击入口，不通过setter把只读框伪装成可编辑。
  // input helper只为正文自动解锁，数字的许可在这里显式创建，便于追踪两种规则。
  // 等待一次React提交再输入，不能把同一事件批次中的旧readOnly闭包当新状态。
  await run(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  await delay(40);
  await input(selector, value);
  await run(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);
  await delay(80);
}

// 六个字段逐一实际提交，检验字号/行高/字距/宽度/旋转/透明度都能改变作品。
// 断言SVG的字号、字长、行高、transform和alpha，不把输入框值变化当业务接通证明。
// 使用两行短文本让lineHeight有可观察坐标差异，单行无法检出行距未应用。
// 先保留已有三层，最后撤销六次恢复原参数，避免干扰后续真实导出尺寸检查。
// 不触碰前两层，通过选中最后一层继续验证实例级属性。
// 数字最小宽度100px是防回归阈值，能检出截图中只剩竖线的输入布局。
// 等宽值不需要逐像素一致，实际主题和浏览器字体可以保留正常差异。
// 本项未覆盖所有非法数字，公共控件原范围校验不在本轮重写。
async function checkDialogueFields() {
  // 右栏本身保持280px，不通过加宽整个页面掩盖原双列嵌套布局错误。
  // 检查输入的实际rect宽度，不只查CSS是否写了grid-cols-1。
  // 属性滚动位置可能因focus改变，但width不会随纵向滚动变化。
  // 测量包括六个框，即使某个框当前在滚动视口外，仍应拥有正常布局宽度。
  // 浮点字号期望值允许0.01误差，避免浏览器字符串格式化差异造成假失败。
  // 行高使用两个基线相减，抵消安全区居中和文字基线系数的共同偏移。
  // 输入两行不同内容，text节点必须至少有两个，才有有效的行高差值可比较。
  // 字号32与初始24不同，能发现控件编辑了草稿却未提交的接线问题。
  // 行高2应使两个SVG基线相差64自然像素，再按画片scale换算局部数值。
  // 字距4应增加textLength，若宽度仍与没有间距时相同则共享排版没有消费参数。
  // width600相对素材640得到0.9375缩放，断言不依赖被测resize函数的输出。
  // rotation30写入外层transform，而不是只让输入框显示一个30。
  // opacity0.5检查真实模板image属性，不能只看到色板或字段变淡就认为生效。
  // 六个input都测宽度，可检出只把第一项修宽、其余仍被双列压扁的布局回归。
  // 阈值在280px右栏下留有足够余量，并非要求所有系统字号下精确相同像素。
  // 截图在输入最后一项后发生，属性自动滚入视口，方便核对全部字段的可读性。
  // 六次撤销应只撤回六个参数变化，新增文本保留用于后续画面观察。
  // 若Enter与blur重复压栈，六次撤销不能正确复位，后面的导出和transform检查有机会暴露。
  await input("[data-dialogue-text]", "测试文字\n第二行");
  for (const [index, value] of ["32", "2", "4", "600", "30", "0.5"].entries()) await setDialogueField(index, value);
  smoke.check("All six property fields remain readable and update the selected SVG layer", await run("(()=>{const g=[...document.querySelectorAll('[data-dialogue-layer]')].at(-1),texts=g.querySelectorAll('text');return [...document.querySelectorAll('[data-dialogue-fields] input')].every(e=>e.getBoundingClientRect().width>=100)&&g.getAttribute('transform').includes('rotate(30) scale(0.9375)')&&g.querySelector('image').getAttribute('opacity')==='0.5'&&Math.abs(Number(texts[0].getAttribute('font-size')||texts[0].parentElement.getAttribute('font-size'))-32/0.9375)<0.01&&Math.abs(Number(texts[1].getAttribute('y'))-Number(texts[0].getAttribute('y'))-64/0.9375)<0.01&&Number(texts[0].getAttribute('textLength'))>120})()"));
  await capture("editor-properties");
  for (let index = 0; index < 6; index++) {
    await run("[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')==='撤销').click()");
    await delay(50);
  }
}

// 正式场景先测四角，再加30度旋转测试，确保缩放不只在rotation=0偶然有效。
// 旋转后右下角的外向向量约(32,64)，不是继续沿未旋转的同一屏幕斜线。
// 第一次宽度恢复与旋转撤销都走正式按钮，历史步骤不能被测试强行重置。
// 末尾独立检查六字段，和缩放结果回填的断言互为补充。
// 画面保存前已经存在真实气泡和文字，不以空白默认图冒充功能可用。
// 此验证未新增后台计时器模拟缩放，所有动画帧由实际指针与React提交驱动。
async function checkResizeAndFields() {
  // 本冒烟使用离屏隐藏窗口，没有真实系统焦点时Chromium会抑制原生focusout。
  // 沿用视频公共控件回归的焦点模拟，使真实焦点迁移能产生完整blur事件。
  // 这只设置测试窗口环境，不给产品手工派发blur，不改输入框的readOnly或状态。
  // 若不启用，activeElement虽已换成第二项，第一项的提交与重锁处理也可能根本没收到事件。
  // 因此不能把该测试环境缺口误修成产品端轮询焦点或添加全局鼠标监听。
  // 真实用户窗口已有系统焦点；此设置不占用当前桌面鼠标，也不证明前台遮挡场景。
  await win.webContents.debugger.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: true });
  // 四组数据明确覆盖nw、ne、sw、se，不能只测右下然后假定全部共用代码就不会出错。
  // 负dx或负dy是左角、上角的真实外向拖动方向，组合不同能检出符号分支遗漏。
  // 右下旋转场景先通过公共旋转输入提交30度，保持与实际用户入口相同。
  // 旋转缩放后先撤销缩放再撤销旋转，独立动作不能混进同一个手势历史。
  // 素材实例仍有三份，同款classic-left位于顶层，继续覆盖相同模板的独立性。
  // 宽度回填在每次resizeState读取，因此手柄只改CSS、不改文档的实现无法通过。
  // 不需要加载真实背景才可测缩放，白画稿上的气泡已包含真实PNG轮廓。
  // 背景导入和导出仍在后续原有回归中验证，本函数不会篡改它们的文件前提。
  // 所有测试共享一个Electron窗口，避免多冒烟同时争抢单实例或GPU状态。
  // 任一断言失败仍由harness保留失败结果，截图可生成但不能把结果覆盖成通过。
  for (const [corner, opposite, x, y] of [["se", "nw", 60, 38], ["nw", "se", -60, -38], ["ne", "sw", 60, -38], ["sw", "ne", -60, 38]]) await checkResizeCorner(corner, opposite, x, y);
  await setDialogueField(4, "30");
  await checkResizeCorner("se", "nw", 32, 64);
  await run("[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')==='撤销').click()");
  await delay(80);
  await checkDialogueFields();
  // 字段锁定紧接实际参数回流测试，两者共享已恢复的原始字号和当前实例。
  // 归入现有数值交互分组，主进程入口只负责窗口、协议和各回归分区的生命周期。
  await checkNumberLock();
}

// 每次数字双击都通过Chromium命中真实输入，不能只派发自造的业务“解锁”事件。
// 先滚入属性视口再取坐标，窄栏纵向滚动后不能沿用已不在屏幕内的旧位置。
// 系统鼠标不会被占用，sendInputEvent只送到本轮隔离Electron窗口。
// clickCount序列1、2由浏览器识别双击，生产onDoubleClick负责解锁。
// 单击路径只发1，测试能独立证实单击后普通按键依旧不会进入输入。
// 此helper不读React内部对象，不直接修改editing state或readOnly属性。
// 最后等待提交再返回，后续input事件必须由已生效的新许可处理。
// 不用超时猜测点击次数；固定短等待仅为React状态提交提供机会。
  // 输入解锁按组件实例发生，不需要等待模型、文件导入或任何网络响应。
  // 不使用File.path或Node能力触碰作品；此次输入测试完全在真实页面控件上完成。
  // helper不选择模板或新增实例，因此前两层的隔离对照在整轮测试中仍然存在。
  // 数字单击锁定与画布单击选择是不同事件目标，不用画布双击结果替代数字双击证据。
  // 连续两个不同字段的单击不能被浏览器识别成同一个input的双击。
  // 截图保留锁定帮助文案，未以屏幕上无差异为由声称实际输入行为已经测试。
async function clickNumber(index, double = false) {
  // 点击前不主动focus，否则单击焦点行为可能被测试预处理掩盖。
  // 锁定输入不是disabled，所以真实命中之后应正常成为activeElement。
  // 浏览器自己的双击选择文字可能发生，但业务是否解锁仍取决于正式回调。
  // 测试不会用只读属性的setter直接修改许可，所有状态变化都来自生产事件。
  // 每次读取最新rect，属性栏因提示文案出现而变化高度时也不会误点相邻行。
  // index0和index1选不同字段，能发现使用一个全局editing布尔值的错误。
  // 这只验证鼠标路径，触摸系统的双击识别不在本用例证据范围。
  // 连续点击没有引入产品端延时判定，Chromium负责区分单双击。
  // index按已有FIELDS顺序确定实例，不依赖中文标签或生成的React id。
  // scrollIntoView使用nearest，尽量不改变整个画布的正常视口位置。
  // 原输入若正在编辑，切换时自然触发生产blur，测试不会私自先提交它。
  // 两次坐标保持一致，不能把两次点不同输入误称为一个字段双击。
  // 点击真实input而非label空白区，覆盖浏览器原生只读和焦点行为。
  // 坐标舍入符合Electron事件接口，避免浮点位置导致宿主拒绝输入。
  // mouseUp与mouseDown使用同一clickCount，保证浏览器能生成dblclick。
  // 无重试点击循环，命中失败应由后面的只读断言实际报错。
  const point = await run(`(()=>{const e=document.querySelectorAll('[data-dialogue-fields] input')[${index}];e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  win.webContents.sendInputEvent({ type: "mouseMove", ...point });
  for (const count of double ? [1, 2] : [1]) {
    win.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: count, ...point });
    win.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: count, ...point });
  }
  await delay(80);
}

// 原生按键必须包含按下和抬起，不能让Escape等键在后续旋转测试中一直处于按下状态。
// 这和用户敲击一次键盘相同，不给产品派发人工blur或直接调用控件闭包。
// 完整按键序列避免测试设备状态遗留，不把发送按下事件等同于一次完整敲击。
// 本helper只描述一次完整按键，不更改document.activeElement或输入许可。
// 真实焦点仍由前面的鼠标点击建立，发给错误控件时断言应实际失败。
// 等待发生在整次按键之后，事件处理和React提交都有机会完成。
// F2、Enter、Escape复用相同设备顺序，避免每个测试各写一套半截输入序列。
// 没有系统全局按键注入，只作用于隔离窗口的webContents。
// 后续指针拖动不应受到本测试遗留按键状态干扰。
// 不重复按键直到通过，失败仍由明确的UI状态断言报告。
async function numberKey(keyCode) {
  win.webContents.sendInputEvent({ type: "keyDown", keyCode });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode });
  await delay(60);
}

// 所有字段默认锁定，真实单击再输入9不应改变已提交数字或可见文本。
// 双击仅解锁当前字号，另外五项必须继续只读，避免一个布尔状态锁全组。
// Escape取消草稿并锁回，随后有效Enter确认实际改变SVG而非只显示输入值。
// 字号使用原始24为基线，最后撤销恢复原稿，保留后续字体和导出用例前提。
// 按键使用当前窗口真实焦点，不能通过给readOnly=false绕开浏览器保护。
// 空态、背景与其他图层均不改，测试只围绕这一个公共控件策略。
// 宽度回流仍由原四角测试覆盖，锁定不表示画布手柄也被禁用。
// 初始值从DOM采样，避免写死24使其他有效默认参数变化造成假失败。
async function checkNumberLock() {
  // 前面的六字段测试已把参数恢复，因此原始字号与最终作品状态一致。
  // ordinary char不是自造input事件，原生readOnly真的会阻止它写入DOM。
  // 原值同时作为可见文本比较，能检出只阻止提交、却让数字框显示错误草稿的半修复。
  // 所有字段可聚焦而非disabled的断言，确保双击入口没有被原生禁用状态挡住。
  // 第一次双击后不用立刻提交，先验证其他五个字段仍锁定。
  // 输入40再Escape，和原值不相同，避免用无变化草稿冒充取消验证。
  // Escape后应同时恢复值和只读属性，只有其中一个恢复都不能通过。
  // 之后输入32走确认，证明控件不是永久锁住而只能看不能改。
  // 有效Enter后只读状态也需恢复，防止一旦解锁就永久进入输入模式。
  // 调用正式撤销后再进入失焦测试，不让前一条内容变化污染新用例的历史基线。
  // 此处对input.value的比较属于控件许可验证，图层效果由已有SVG断言负责。
  // 同一字号在两类测试中复用相同配置，范围校验和草稿逻辑只有公共组件一份。
  // 把focus留在输入框再发char，能发现单击意外激活时真的接受了键盘输入。
  // 直接读取全部六个readOnly状态，不把一个字段锁住当作全组已修复。
  // 原生readonly允许复制和选中，不要求input被disabled，这是本次明确的语义。
  // Escape预期原值，Enter预期新值，两条路径区分取消与确认。
  // 真实字号回流由原六字段SVG测试一并覆盖，此处重点检验许可与重锁。
  // 各次操作都重新等待DOM提交，避免在同一闭包中读到前一帧许可。
  // 操作过当前字段后仍保留同一层选择，不增加或移除图层。
  // 独立历史恢复使用正式撤销按钮，不调用内部文档快照。
  const original = await run("document.querySelector('[data-dialogue-fields] input').value");
  await clickNumber(0);
  win.webContents.sendInputEvent({ type: "char", keyCode: "9" }); await delay(60);
  smoke.check("All six numeric fields stay read-only after a single click and ordinary typing", await run(`[...document.querySelectorAll('[data-dialogue-fields] input')].every(e=>e.readOnly&&!e.disabled)&&document.querySelector('[data-dialogue-fields] input').value===${JSON.stringify(original)}`));
  await clickNumber(0, true);
  smoke.check("Real double click unlocks only the targeted numeric field", await run("[...document.querySelectorAll('[data-dialogue-fields] input')].every((e,i)=>e.readOnly===(i!==0))"));
  await input("[data-dialogue-fields] input", "40");
  await numberKey("Escape");
  smoke.check("Escape discards the numeric draft and locks the field again", await run(`document.querySelector('[data-dialogue-fields] input').readOnly&&document.querySelector('[data-dialogue-fields] input').value===${JSON.stringify(original)}`));
  await setDialogueField(0, "32");
  smoke.check("A valid Enter commits the number and restores its lock", await run("document.querySelector('[data-dialogue-fields] input').readOnly&&document.querySelector('[data-dialogue-fields] input').value==='32'"));
  await click('[aria-label="撤销"]');
  await checkNumberBlur(original);
}

// F2为无法使用鼠标双击的用户提供等价入口，普通Enter不能从只读状态隐式解锁。
// 越界字号999不能确认，错误必须留在当前字段并保持可修正状态。
// 合法草稿失焦后才提交，下一项被单击仍只读，不继承前项的编辑许可。
// 失焦操作使用真实第二个输入点击，不调用组件内部blur函数。
// 撤销后原值回填也必须只读，不能因为外部value变化自动进入编辑。
// 此测试与视频控件的默认直接输入回归配合，验证可选策略没有扩散到其他调用方。
// 没有后台定时器或轮询解锁产品字段，许可只由明确用户意图改变。
// 最后保持所有数字锁定，以便后续顶部旋转用例验证手柄仍能更新属性。
async function checkNumberBlur(original) {
  // F2前先单击可确保焦点在真实输入，不能把发给body的按键当控件键盘入口。
  // 数字999超过已有字号200上限，正向草稿30则在范围内，正反数据有明确区别。
  // 不向控件注入临时max，测试使用漫画正式配置验证范围与激活策略共同生效。
  // 错误Enter保留可编辑状态，用户可原地修正而不必重新寻找双击提示。
  // 修正通过正常input触发，组件应清除此前aria-invalid，不改DOM错误节点骗过结果。
  // 接着点击第二项自然失焦，证明锁回不是依赖另一个“完成”按钮。
  // 第二项仅被单击，所以它也必须保持readOnly，不能因焦点转移自动解锁。
  // 全组六项只读断言能发现只把当前项锁回而上一项仍持有许可的竞态。
  // 失焦只创建一次不同数值提交，撤销一次回到original能揭示重复或漏记历史。
  // 撤销按钮的点击还会使第二项失焦，只读字段不应再提交其旧草稿。
  // 这也检验只读onBlur分支不会制造额外内容步骤或覆盖外部更新。
  // 截图保留正常锁定值，不把非法999留在交付画面里假装完成。
  // 右栏在测试中被真实滚动到数字区，截图可核对帮助提示是否可发现。
  // 后续旋转手柄仍操作同一实例，它的角度回填不能受到输入锁阻止。
  // 最终状态不修改背景、字体或模板目录，继续复用原完整页面回归。
  // 本项未验证所有非法格式，小数精度和空串等由视频公共控件原有回归补充。
  // 视频回归不传editActivation，应继续允许普通单击输入，形成策略默认值对照。
  // 若默认策略意外变成双击，视频的原生输入草稿测试会失败，不能只靠漫画通过交付。
  // 重新点第一个字段后，焦点输入F2；此时真实只读状态是有效前置条件。
  // invalid Enter不锁回，避免用户必须反复双击才能改正一个越界数字。
  // 校验错误通过aria-invalid关联，不能只在输入框外出现无来源的红字。
  // 修正为30不触发即时提交，直至点击第二个字段发生原生失焦。
  // 第二项默认仍锁定，证明激活策略按组件实例持有。
  // 撤销只需要一次，Enter失败与F2解锁都不应制造内容历史。
  // 这里测错误范围而非图片排版，排版范围已由前面的六字段实际SVG断言约束。
  // 通过DOM确认外部原值回填，不能用测试保存的数字直接写回输入。
  await clickNumber(0);
  await numberKey("F2");
  smoke.check("F2 provides an explicit keyboard unlock for a focused number", await run("!document.querySelector('[data-dialogue-fields] input').readOnly"));
  await input("[data-dialogue-fields] input", "999");
  await numberKey("Enter");
  smoke.check("Invalid Enter retains the editable draft and its accessible error", await run("!document.querySelector('[data-dialogue-fields] input').readOnly&&document.querySelector('[data-dialogue-fields] input').getAttribute('aria-invalid')==='true'"));
  await input("[data-dialogue-fields] input", "30");
  await clickNumber(1);
  smoke.check("Blur commits a valid draft and leaves both fields locked", await run("[...document.querySelectorAll('[data-dialogue-fields] input')].every(e=>e.readOnly)&&document.querySelector('[data-dialogue-fields] input').value==='30'"), await run("JSON.stringify([...document.querySelectorAll('[data-dialogue-fields] input')].map(e=>({value:e.value,readOnly:e.readOnly,active:e===document.activeElement})))"));
  await click('[aria-label="撤销"]');
  smoke.check("Undo updates locked numeric fields without unlocking them", await run(`document.querySelector('[data-dialogue-fields] input').readOnly&&document.querySelector('[data-dialogue-fields] input').value===${JSON.stringify(original)}`), await run("JSON.stringify([...document.querySelectorAll('[data-dialogue-fields] input')].map(e=>({value:e.value,readOnly:e.readOnly,active:e===document.activeElement})))"));
  await capture("editor-number-lock");
}

// 选中和正文编辑是两个不同状态，真实双击需要由Chromium识别clickCount序列。
// 测试先单击图层再输入被锁的正文，确认单击不会让用户误改内容。
// 双击后焦点应进入右栏唯一textarea，不依靠测试手工设editing状态。
// 顶部旋转用真实图标命中，角度变化不能伴随中心移动或宽度变化。
// 所有工具仍归一次手势历史，旋转结束一次撤销必须完整回到原变换。
// 本用例在同款模板多实例场景运行，其他实例transform需保持原样。
// 线宽断言读取实际SVG属性，焦点断言读取computedStyle，不只查源码class。
// 非100%DPR与触摸没有在此伪装验证，坐标按当前窗口CSS像素发送。
async function checkTextAndRotation() {
  // 单击只读断言发生在双击之前，不能用刚进入页面的默认只读状态替代选中后的行为。
  // point取模板中心，不取文字节点中心，因为多行文字可能偏离图层中心。
  // 这里不调用HTMLElement.click，SVG选择使用真实鼠标入口，覆盖捕获与释放。
  // clickCount=2让Chromium生成dblclick，正式组件不会看到测试专属解锁指令。
  // 不要求textarea所有内容被选中，产品契约只保证进入同一个输入框。
  // Escape同时要求层仍选中，能检出冒泡到全局clear的错误。
  // faint断言针对非缩放描边0.75像素，而非模板原画中不可编辑的黑色线条。
  // 后续旋转从已锁定正文开始，避免把输入焦点默认状态混入旋转结果。
  // 单击和双击都不要求新增图层，所以原来三份实例数保持不变。
  // 本步骤未拖动角手柄，四角能力由前面的独立真实指针用例覆盖。
  // 先点最上层中心，与普通用户选中气泡的入口一致。
  // dragPointer零位移只做点击，不应增加内容历史。
  // 顶部图标在根矩阵里定位，不能拿旋转g包围盒的顶部误算命中。
  // text.value在单击后保留原文，后续用真实双击解锁再测试输入。
  // readonly不阻止复制，测试只验证不能通过产品onChange修改正文。
  // 双击后的焦点进入由产品effect完成，不在断言前手动focus。
  // 右栏属性仍与选中层绑定，不因解锁多创建一个气泡实例。
  // body读取transform数组，不能只看最后一层角度改变就漏掉串层。
  // 四角和旋转图标共用data-dialogue-selection，导出会统一排除。
  // 旋转恢复必须包含平移和比例，保证撤销没有只恢复数值框。
  const point = await run("(()=>{const g=[...document.querySelectorAll('[data-dialogue-layer]')].at(-1),p=new DOMPoint(0,0).matrixTransform(g.getScreenCTM());return{x:Math.round(p.x),y:Math.round(p.y)}})()");
  await dragPointer(point, 0, 0);
  smoke.check("Single click selects styles while keeping text locked and the outline faint", await run("document.querySelector('[data-dialogue-text]').readOnly&&document.querySelector('[data-dialogue-layer][aria-pressed=true]>rect').getAttribute('stroke-width')==='0.75'"));
  // 属性焦点读取公共fieldInput的实际边线，防止只改选框却遗漏数字框的粗光圈。
  // 父span就是公共控件的输入外框，不在生产CSS添加调用方私有DOM覆盖。
  // 字段聚焦不应解锁正文，单击样式调整与双击文字输入保持两个入口。
  // 当前焦点用原有1px边框变色，不额外叠outline；内框也不能再画第二圈。
  // 验证的是实际细边线而非绑定某个CSS实现，正文和数值仍应保持各自的只读锁。
  // 下一次真实画布双击会自然把焦点交给正文，不在此提前模拟产品焦点效果。
  // 这里不修改数值，所以不会给旋转撤销用例增加额外内容历史。
  await run("document.querySelector('[data-dialogue-fields] input').focus()");
  smoke.check("Numeric focus uses one thin border without extra rings and leaves text locked", await run("(()=>{const e=document.querySelector('[data-dialogue-fields] input'),p=getComputedStyle(e.parentElement);return p.borderLeftWidth==='1px'&&p.outlineStyle==='none'&&getComputedStyle(e).outlineStyle==='none'&&e.readOnly&&document.querySelector('[data-dialogue-text]').readOnly})()"));
  win.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 2, ...point });
  win.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 2, ...point });
  await delay(100);
  smoke.check("Double click unlocks the one text editor and moves focus into it", await run("!document.querySelector('[data-dialogue-text]').readOnly&&document.activeElement===document.querySelector('[data-dialogue-text]')"));
  await run("document.querySelector('[data-dialogue-text]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  smoke.check("Escape locks text while retaining the selected layer", await run("document.querySelector('[data-dialogue-text]').readOnly&&Boolean(document.querySelector('[data-dialogue-layer][aria-pressed=true]'))"));
  await checkRotatePointer();
}

// 旋转在独立函数中保持明确前后状态，测试不调用rotateDialogue生成期望角度。
// 把鼠标向右下拖，应该得到有限且非零角度；中心与scale仍与起点完全一致。
// 对比的是根坐标里的矩阵平移，当前rotation会改变a/b但不改变e/f。
// 顶部手柄自身随旋转移动，起点必须按下前采样，不能用更新后的点作为起点。
// 前两层是同模板隔离对照，完整字符串应保持不变。
// 鼠标释放后通过正式撤销按钮恢复，不直接写SVG属性骗过测试。
// 键盘旋转数值框仍保留，手柄不是唯一操作方式。
async function checkRotatePointer() {
  // point对应圆形手柄中心，描边变浅不会改变实际命中区域。
  // 图标内部path设为pointer-events:none，能命中外围g而非一条细曲线。
  // 拖动70和30像素只用来确保角度变化明显，不把这些屏幕距离当期望角度。
  // 角度公式的正确性由中心与宽度不变、实际朝向变化共同约束。
  // 首两层作为反例，能发现patch意外更新所有相同templateId的实例。
  // 比较原transform前缀确定translate不变，防止旋转和普通移动同时执行。
  // 宽度读取右栏事实，选中轮廓包围盒会随角度变化，不能拿其宽度当比例。
  // 撤销等待后重新读所有transform，不能从此前after对象推测恢复成功。
  // 这条历史断言可检出pointerup与lostpointercapture各压一次历史的回归。
  // 若一次撤销后仍保留半段旋转，即使角度变小也必须失败。
  // 选中的末层已经处在原始零度，右移旋转手柄应出现顺时针变化。
  // getScreenCTM的e/f就是图层中心，和图像透明边界无关。
  // width取SVG变换比例，不能把旋转后的包围盒宽度当图层宽度。
  // 旋转前后差异与撤销恢复共同验证一次手势的开始、移动和结束接线。
  // 数据在同一页面中读取，不调用历史快照内部方法。
  // 延迟只给React提交时间，结果仍以实际DOM状态为准。
  const before = await resizeState("se");
  const point = await run("(()=>{const e=document.querySelector('[data-dialogue-rotate]'),p=new DOMPoint(0,0).matrixTransform(e.getScreenCTM());return{x:Math.round(p.x),y:Math.round(p.y)}})()");
  await dragPointer(point, 70, 30);
  const after = await resizeState("se");
  smoke.check("Top rotation control rotates only the selected layer without changing width", after.transforms[2] !== before.transforms[2] && before.width === after.width && before.transforms[0] === after.transforms[0] && before.transforms[1] === after.transforms[1] && after.transforms[2].split(" rotate")[0] === before.transforms[2].split(" rotate")[0], JSON.stringify({ before, after, point }));
  await run("[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')==='撤销').click()");
  await delay(80);
  smoke.check("A single undo restores the entire rotation gesture", JSON.stringify((await resizeState("se")).transforms) === JSON.stringify(before.transforms));
}

// 通过生产菜单选择字体，等待真实FontFace与资源读取，不在页面注入测试字体。
// 选项身份来自静态目录，不按翻译显示名猜测实际CSS family。
// 等待font标记回流到SVG且face状态为loaded，不能只读菜单显示文字。
// 系统字体不创建FontFace，因此它的完成以标记变为system为准。
// 菜单点击使用共用SimpleSelect行为，可检出选项回调没有接通的回归。
// 一次只选择一项，避免测试自己制造竞争再把中间态当失败。
async function chooseFont(id) {
  // 文案或菜单顺序变化不影响value定位，因此双语显示名不是测试契约。
  // 当前值尚未变化时等待会继续，FontFace正常解码必须真实完成才能返回。
  // 错误用例不调用本helper，以免错误状态被等待成功的超时掩盖。
  // 选择后的菜单自动关闭和焦点回归仍由SimpleSelect的生产逻辑承担。
  // 不向菜单传入临时options，十项数据就是正式应用发布目录。
  // 同字体再次选择可能命中共享缓存，这是产品有意去重而非测试跳过读取。
  // trigger位于明确的字体容器，不会误打开横竖排或画布比例菜单。
  // 菜单用portal挂载到body，因此选项不要求是右栏的DOM后代。
  // 请求正常完成前原fontId保留，wait据此阻止把加载中的旧值当新值。
  // 测试未在此模拟外网，因为产品只读取app协议下的本地静态文件。
  // 失败时wait会超时并由看门狗失败退出，不偷偷跳过缺失字体。
  // id通过JSON编码进入脚本，测试输入不被拼成任意可执行代码。
  await click("[data-dialogue-font-picker] button[aria-haspopup]");
  await click(`[data-simple-select-option="${id}"]`);
  await wait(`[...document.querySelectorAll('[data-dialogue-layer]')].at(-1).querySelector('[data-dialogue-font]')?.getAttribute('data-dialogue-font')===${JSON.stringify(id)}`);
}

// 导出真实PNG并读取像素，不拿SVG里的family字符串证明成品字体正确。
// will-download继续隔离输出位置，但浏览器SVG解码与Canvas编码走完整产品路径。
// 同名文件会复用测试目录，不写入用户下载目录。
// 清空完成标记避免上次成品让本次等待提前通过。
// nativeImage解码PNG后比较bitmap，避免PNG压缩和元数据差异造成误报。
// 下载结束才读字节，不能在文件尚未写完时生成一张假“差异图”。
async function fontExportBitmap() {
  // 同一文件名连续下载时done标记需要重置，不然很容易读到上一张成品。
  // 等待按钮解除busy不能替代下载完成，二者是编码与文件写入两个不同阶段。
  // for循环上限只约束下载等待，不伪造生成进度或在产品里加入计时器。
  // 缺下载时主动抛错，不能让nativeImage读取空路径后得到空图再继续比较。
  // 返回解码后的bitmap，压缩器随机性或文件时间信息不会制造假字形差异。
  // 输出目录是本轮隔离目录，路径不打印到产品界面或发送远端。
  // 两次导出使用相同画布尺寸，因此有效位图长度应该一致。
  // 长度相同之外仍要求内容不同，不能只把一次成功下载当字体完整导出证明。
  downloaded = "";
  await click("[aria-label=\"导出 PNG\"]");
  await wait("!document.querySelector('[aria-label=\"导出 PNG\"]').disabled");
  for (let index = 0; index < 100 && !downloaded; index++) await delay(50);
  if (!downloaded) throw new Error("Font export did not complete");
  return nativeImage.createFromPath(downloaded).toBitmap();
}

// 十种字体逐项真加载，正文选中层使用实际资源，其他两层不应被同步改字体。
// 七种中文展示/手写与三种英文漫画字体的适用范围由菜单明确区分。
// 额外导出同一文字的两种漫画字体，像素应不同，验证导出未丢失内嵌字体。
// 最后选择中文站酷快乐体截图，让交付画面展示当前生产UI的真实字体效果。
// 无系统预装假设，所有资源由app协议从本次静态导出读取。
// 本测试不声称每个汉字都有字形，生僻字与英文字体中文使用系统回落。
// 字体切换不修改正文、中心和大小，原有实例隔离继续成立。
// 字体选择回调只提交成功资源，加载错误的专门断言另列而不以正常循环代替。
async function checkFonts() {
  // 至少十项要求以真实loaded字体对象数量核对，不能用十个标签指向同一个默认family。
  // 每个文件都通过正式fetch路径，缺文件、HTML误响应或损坏TTF都会导致失败。
  // 检查集合不使用字体名字是否出现在CSS文本里这种静态判据。
  // 文档中字体id写入最后一层，前两层仍没有标记，可检出全局font-family覆盖错误。
  // 内置字体不用临时object URL，测试不需要通过残存URL维持解码成功。
  // 拉丁字体的中文回落不能用来证明中文有十种样式，所以像素比较专用英文文本。
  // BANG含直线和弧线字形，Bangers与Comic Neue在相同字格下仍应明显不同。
  // textLength保持固定字格，字形差异来自字体，不依靠不同字号或不同文本放大差异。
  // 选择站酷快乐体后再次改中文，截图体现的是中文资源，不让系统回落冒充中文字体。
  // 保存截图前等待选择完成，避免交付仍显示加载中的假完成界面。
  // 本用例使用内置48轮廓之一，真实模板PNG与字体同时参与SVG导出。
  // 所有选择依次串行，同一主进程只开一个冒烟窗口。
  // 目录从源码JSON读取只提供测试数据，产品仍经过正式渲染和真实字体加载。
  // face集合检查具体family与loaded状态，document.fonts.check对未知family可能回true。
  // 因此不用check的回落结果声称字体文件已成功解码。
  // 对照层没有fontId，应继续使用原系统字体而非被全局CSS覆盖。
  // 两种英文字体使用相同BANG文本，使字形变化成为唯一图像差异来源。
  // bitmap比较不接受只有一个PNG存在；空位图会先作为失败处理。
  // 图片轮廓、层叠顺序和画稿尺寸在两次导出中完全相同。
  // 差异证明实际字形被消费，但不作为每个字体每个字的金标栅格测试。
  // 中文最后切回以便人工检查截图，英文选项仍保留给英文漫画创作。
  const fonts = require("../apps/next/src/view/cartoon/dialogue-fonts.json");
  await checkFontFailure();
  for (const font of fonts) await chooseFont(font.id);
  smoke.check("All ten bundled fonts decode through the real application protocol", await run(`[...document.fonts].filter(f=>f.family.startsWith('Dialogue-')&&f.status==='loaded').length===${fonts.length}`));
  smoke.check("Font selection remains independent for each bubble", await run("[...document.querySelectorAll('[data-dialogue-layer]')].slice(0,2).every(g=>!g.querySelector('[data-dialogue-font]'))"));
  await input("[data-dialogue-text]", "BANG! COMIC TEST");
  await chooseFont("bangers"); const bangers = await fontExportBitmap();
  await chooseFont("comicneue"); const comic = await fontExportBitmap();
  smoke.check("Two offline comic fonts produce different real exported glyph pixels", bangers.length > 0 && comic.length === bangers.length && !comic.equals(bangers));
  await chooseFont("zcoolkuaile");
  await input("[data-dialogue-text]", "漫画对白\n砰！出发！");
  await capture("editor-fonts");
  // 打开真实共享菜单补拍十种字体选项，不能只交付目录JSON截图。
  // 截图后通过同一trigger关闭，保留当前站酷快乐体而不误选默认项。
  // 这仅改变菜单展示，不新增作品历史或更改后续导入背景的前提。
  // 菜单最大高度沿公共组件，底部选项可能需要滚动；十项解码断言已逐项覆盖它们。
  // 截图只记录一个时刻的视口，不把截图可见条数当实际字体总数。
  // 菜单中的作者中文名是资源名，英文分类说明仍按当前语言翻译。
  // 菜单关闭后的正文和字体值保持原样，下一步背景导入继续用同一份作品。
  // 这份截图不做图像后处理，真实focus边框和当前滚动位置都会保留。
  // 模板素材窗和字体菜单不是同一种弹窗，本次只复用已有SimpleSelect的小菜单。
  // 字体菜单不设置aria-modal，页面其余样式控件不应被永久遮罩锁住。
  // 若它意外残留，后续导出按钮点击与主题操作会受影响并使真实回归失败。
  await click("[data-dialogue-font-picker] button[aria-haspopup]");
  await capture("editor-font-menu");
  await click("[data-dialogue-font-picker] button[aria-haspopup]");
}

// 在本测试窗口拦截一份尚未加载字体，明确这是故障注入，不是成功字体的替身。
// 真实fetch收到失败，UI必须保留系统字体并显示错误；随后解除拦截验证可重试。
// 不修改磁盘字体文件，避免构建指纹失效或影响其他正在使用的应用。
// hook只属于本测试session，finally清理后不拦截任何后续导出。
// 这个用例和十字体真实解码并列，错误注入不能被当成实机资源成功证明。
// 预期字体选择失败不会删除气泡、清空正文或生成已应用的假状态。
// Bangers在此之前从未被选择，因此不会被成功缓存绕过fetch故障。
// 断言以SVG仍无字体标记为准，菜单旧文字独自不能证明文档没有误提交。
// 清理webRequest时传null，不能留下一个永远cancel的回调影响后续用例。
// 如果失败缓存未删除，后面的chooseFont重试将超时并真实报错。
async function checkFontFailure() {
  // 取消目标是app协议字体文件，账户、模板PNG和Next脚本仍正常加载。
  // 拦截发生在首次请求前，避免浏览器或模块缓存使负向断言失去前提。
  // 原fontId为空，失败后仍为空意味着未提交无效资源，不只是菜单回落了标签。
  // 失败错误位于字体容器，不能用其他背景导入错误来误认本项成功。
  // finally在wait抛错时也解除拦截，不把后续所有用例变成同一种网络失败。
  // 产品fetch拒绝由choose捕获，本用例还隐含核验没有未处理Promise导致窗口崩溃。
  // 重新选择同字体走成功路径时会创建新请求，验证失败缓存确实被删除。
  // 原三层数量不变与原字体保留共同限定错误恢复边界。
  // 此类故障注入不要求改系统防火墙，也不会影响用户的前台软件网络。
  // 测试退出后整个session销毁，故障拦截不存在跨运行残留。
  win.webContents.session.webRequest.onBeforeRequest({ urls: ["app://app/dialogue-fonts/Bangers-Regular.ttf"] }, (_details, callback) => callback({ cancel: true }));
  try {
    await click("[data-dialogue-font-picker] button[aria-haspopup]");
    await click('[data-simple-select-option="bangers"]');
    await wait("document.querySelector('[data-dialogue-font-picker] [role=alert]')");
    smoke.check("Font read failure reports an error and preserves the previous font", await run("![...document.querySelectorAll('[data-dialogue-layer]')].at(-1).querySelector('[data-dialogue-font]')&&document.querySelectorAll('[data-dialogue-layer]').length===3"));
  } finally { win.webContents.session.webRequest.onBeforeRequest(null); }
}

// 背景导入先走有效真实文件，再走取消与损坏文件，顺序能证明失败保留旧内容。
// 默认场景图是仓库已有资源，不使用用户私人截图作为测试夹具。
// 下载监听保存到临时目录，系统不会在用户下载文件夹多出测试图片。
// 编码输出按PNG签名和实际尺寸解码检查，不把download事件等同于正确文件。
// 将输出与源背景像素比较，确认气泡和文字确实进入图片而不是只导出背景。
// 这个比较不声称实现逐像素视觉金标，模板风格仍要人工查看截图。
// 损坏图片导入发生在气泡已有内容之后，回归必须确认原背景地址不变。
// 导出前重新清掉错误用有效文件，截图只展示当前可继续编辑的真实状态。
// PNG导出产生的控制选框必须不存在，作品之外的UI不参与序列化。
// CDP路径绑定只能证明文件读取与解码，原生选择器取消仍需人工检查。
// 文件对话框不由测试自动点击，避免占用用户当前桌面或关闭其他程序。
// 相同文件可再次导入，因为产品在change事件后清空input值。
// 背景尺寸写入viewBox，导出检查应该读取背景真实尺寸而不是固定1280x720。
// download.done失败也必须抛错，不能因为文件名已出现就跳过写入完成检查。
async function checkImportAndExport() {
  // JPEG尺寸独立由Electron nativeImage读取，不从产品自己的doc.width取期望值。
  // 因此产品如果错误固定导出1280乘720，1080方图夹具能够检出。
  // setFile空路径只创建空files，模拟取消后的内容边界；不是OS对话框自动操作证明。
  // 保存原href再导入坏图，才能证明失败保留的是原图而非另一个非空占位图。
  // 损坏字节文件在本轮临时目录创建，不改写仓库logo或用户选择过的文件。
  // 错误提示出现只证明失败可见，还需单独核对旧href保持一致。
  // 重选同一JPEG能测试input值已清空，否则浏览器可能不再触发同文件change。
  // 导出监听等待下载completed，不把一个已开始但随后失败的下载记为成品。
  // PNG实际解码非空再比较宽高，不能只按文件扩展名判定格式正确。
  // 像素比较要求成品与源不同，用于检测导出只画了背景、漏掉气泡的回归。
  // 它不比较精确文字栅格，不把平台字体差异当作本轮逐像素金标检查。
  // 此处没有为作品画面修图，截图就是导入、模板添加和文字编辑后的实际结果。
  // 当前保留的选框属于编辑UI，下载文件通过产品标记移除；本项未单独做边框像素判定。
  // 明确这条未覆盖边界，避免把“PNG与源不同”夸大为成品所有像素均正确。
  // 系统下载路径没有弹窗自动确认，本测试使用will-download仅隔离写入位置。
  // 使用真实1080像素JPEG，避免把视频样例的微型封面误当作高清背景。
  // Electron nativeImage对WebP的读取支持不同于Chromium Image，不能据此误判产品导出尺寸。
  // JPEG在浏览器和nativeImage均能真实解码，独立像素对照有明确共同前提。
  const file = path.resolve(__dirname, "../apps/next/src/assets/logo/logo.jpg");
  await setFile(file); await wait("document.querySelector('[data-dialogue-svg] > image')");
  // 方图不能只因宽高相等就被显示成竖版3:4，属性必须报告实际1080方图。
  // 读取正式尺寸选择器的文字，与前面独立原图尺寸事实相对应。
  // 这不执行尺寸变更，后续导出仍使用真实导入尺寸。
  smoke.check("Imported square image shows its actual dimensions", await run("document.querySelector('[data-dialogue-properties] button[aria-label=画布]')?.textContent.includes('1080 × 1080')"));
  const href = await run("document.querySelector('[data-dialogue-svg] > image').getAttribute('href')");
  await setFile(""); await delay(100);
  smoke.check("Cancel leaves the imported image and all bubbles intact", await run(`document.querySelector('[data-dialogue-svg] > image').getAttribute('href')===${JSON.stringify(href)}&&document.querySelectorAll('[data-dialogue-layer]').length===3`));
  const broken = path.join(root, "broken.png"); fs.writeFileSync(broken, "not a valid image"); await setFile(broken); await wait("document.querySelector('[data-dialogue-error]')");
  smoke.check("Decode failure reports an error and preserves the existing background", await run(`document.querySelector('[data-dialogue-svg] > image').getAttribute('href')===${JSON.stringify(href)}`));
  await setFile(file); await wait("!document.querySelector('[data-dialogue-properties] [aria-busy=true]')");
  // 字体验证在本轮前面已经导出两次，不能复用上次完成标记提前读取旧尺寸。
  // 每个导出先清标记，再等will-download的completed事实，避免串用旧PNG。
  // 这修复的是测试等待归属，产品导出仍使用当前真实画稿尺寸。
  downloaded = "";
  await run("[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')==='导出 PNG').click()");
  for (let attempt = 0; attempt < 150 && !downloaded; attempt++) await delay(60);
  const output = downloaded && nativeImage.createFromPath(downloaded), source = nativeImage.createFromPath(file);
  smoke.check("Export creates a real PNG at the artwork dimensions", !!output && !output.isEmpty() && JSON.stringify(output.getSize()) === JSON.stringify(source.getSize()));
  smoke.check("Export contains artwork layers, rather than only the source background", !!output && !output.toBitmap().equals(source.toBitmap()));
  await capture("editor-light");
}

// 与漫画共用标题槽的另一个实际调用方是本地模型库，必须从其正式切换按钮进入。
// 扫描返回空列表只用于隔离模型文件，本项证明门牌外壳兼容，不声称扫描已验证。
// 在线请求被本轮会话取消，避免布局回归意外访问第三方或消耗账户额度。
// 把窄窗恢复到宽屏再断言门牌，否则生产隐藏策略会使可见性结论失真。
async function checkSurroundingTools() {
  // webRequest只登记本测试会话，不改全局代理或用户网络设置。
  // 返回模型库时默认在线，因此先阻断第三方请求再导航，避免意外联网。
  // 线上失败不作为本地门牌断言的通过证据，仍需点击local实际挂载LocalModelLibrary。
  // 本地空扫描仍有发布者，标题槽应该显示本地模型库而不残留漫画说明。
  // 切到GIF后应完全移除内容槽，不能仅把漫画文字改成空串留下分隔线。
  // GIF保持普通page宿主，以data-tool-workspace不存在检查共享布局没有被全局改动。
  // 缺少FFmpeg通过明确fixture返回，不把这次宿主检查称作真实GIF转码回归。
  win.webContents.session.webRequest.onBeforeRequest({ urls: ["https://civitai.red/*", "https://civitai.com/*"] }, (_details, done) => done({ cancel: true }));
  await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
  await win.loadURL("app://app/tools/models/civitai");
  await wait("document.querySelector('[data-model-library=local]')");
  await click("[data-model-library=local]");
  await wait("document.querySelector('[data-model-library-location]')");
  smoke.check("The local model library retains its content in the shared title slot", await run("document.querySelector('[data-window-titlebar-content=model-library]')?.textContent.includes('本地模型库')&&!document.querySelector('[data-window-titlebar-content=cartoon]')"));
  await win.loadURL("app://app/tools/video/gif");
  await wait("document.querySelector('[data-app-main]')");
  smoke.check("Leaving the editor clears its caption and preserves the ordinary GIF host", await run("!document.querySelector('[data-window-titlebar-content]')&&!document.querySelector('[data-tool-workspace]')"));
}

// 外观先走正式菜单，再等待根主题与涟漪结束，截图才代表稳定的深色布局。
// 720px与540px分别覆盖两栏收缩和容器查询堆叠，不只检查一档手机宽度。
// 窄窗允许属性区竖向滚动，但整个document不得产生横向卷轴。
// 最小窗口里导出入口仍在属性区，不靠隐藏按钮消除溢出。
async function checkResponsive() {
  // 真实主题选择经nativeTheme handler，根dataset是渲染侧实际同步结果。
  // 等涟漪类消失再截图，避免记录切换过渡半明半暗的中间帧。
  // 720px下主区还有两列，检查整体宽度不会被280px属性栏和画布共同撑开。
  // 540px下容器查询应变成上下排列，比较区域top可以识别断点是否实际生效。
  // 两次截图都沿用同一份3层作品，不能重新挂空页面逃避真实内容溢出。
  // Emulation只改变本窗口媒体尺寸，不改变操作系统缩放或用户屏幕分辨率。
  // 不要求下方属性在首屏全部可见；允许纵向滚动是当前窄屏设计的明确行为。
  // 测试未滚到窄屏属性底部逐字段点击，因此文档不声称所有小屏输入都完成手工验证。
  await click("[data-theme-trigger]");
  await wait("document.querySelector('[data-theme-option=dark]')");
  await click("[data-theme-option=dark]");
  await wait("document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('theme-ripple')");
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
  await wait("!document.getElementById('appearance-title')");
  await capture("editor-dark");
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 720, height: 900, deviceScaleFactor: 1, mobile: false });
  await delay(200);
  smoke.check("Narrow viewport keeps the page within the available width", await run("document.documentElement.scrollWidth<=window.innerWidth+1"));
  await capture("editor-narrow");
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 540, height: 900, deviceScaleFactor: 1, mobile: false });
  await delay(200);
  smoke.check("Small workspace stacks the same canvas and properties without overflow", await run("document.documentElement.scrollWidth<=window.innerWidth+1&&document.querySelector('[data-dialogue-properties]').getBoundingClientRect().top>document.querySelector('[data-dialogue-stage]').getBoundingClientRect().top"));
  await capture("editor-small");
}

// 最后跑主题和窄窗，不在两个Electron进程中并行争抢窗口与GPU资源。
// theme使用生产preload接口，prefers-color-scheme和页面语义变量由正式链路更新。
// 对窄窗检查的是document.scrollWidth，局部属性区的独立纵向滚动仍允许。
// 不要求整个48模板列表永久挂载，关闭后应释放到两栏布局。
// 模板选择前后，背景图与气泡数量必须保持同一份文档。
// 返回其他路由后门牌消失，不能让漫画说明残留在GIF或工具箱顶栏。
// GIF调用同一个ToolPageFrame默认模式，此次workspace修改不能改变其宿主。
// 公共卡片的默认cover分支由其他资料库专项保留，当前contain分支验证新素材完整展示。
// 本测试没有下载模型、导入音频或视频，不将无关业务纳入通过结论。
// 未捕获的React渲染或水合错误会单独失败，不因截图看起来正常而忽略。
// 关闭窗口在finally执行，初始化或断言抛错也不留下本轮测试窗口。
// harness的finish接收allPassed，失败断言不能被app.quit丢成零退出码。
// 静态构建陈旧时不继续截图，不能把旧产品图当作本轮验证证据。
// webContents事件只监听自己的实例，不向用户真实窗口注入代码。
// finally只释放自己创建的遮挡对象和窗口，不枚举关闭用户进程。
// 截图路径打印给调用者，文档中交付时复制有意义的最终图。
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  win = new BrowserWindow({ ...chrome.windowChromeOptions(), width: 1500, height: 950, show: false, webPreferences: { additionalArguments: chrome.windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  smoke.attachWebContents(win.webContents); const occlusion = await smoke.hardenWindow(win);
  win.webContents.debugger.attach("1.3");
  win.webContents.on("console-message", event => { if (event.level === "error" && /hydration|Minified React|while rendering/.test(event.message)) errors.push(event.message); });
  win.webContents.session.on("will-download", (_event, item) => { const file = path.join(root, item.getFilename()); item.setSavePath(file); item.once("done", (_done, state) => { if (state === "completed") downloaded = file; }); });
  try {
    await checkEditing(); await checkPicker(); await checkDrag(); await checkResizeAndFields(); await checkTextAndRotation(); await checkFonts(); await checkImportAndExport();
    await checkResponsive(); await checkSurroundingTools();
    smoke.check("No React rendering or hydration errors", errors.length === 0);
    console.log("CARTOON_SCREENSHOTS", root);
  } finally { occlusion.dispose(); win.destroy(); }
  smoke.finish({ app, ok: smoke.allPassed() });
}
// 顶层拒绝仍写入harness失败摘要，不吞掉文件、页面加载或断言异常。
// 不提供“失败后重试直到通过”的循环，先定位环境再按规则单独重跑。
// 此出口不会删除临时证据，PNG与截图可以用于人工复核。
// 自动测试没有声称证明用户已在系统保存对话框中确认过文件。
main().catch(error => { console.error(error.message); smoke.finish({ app, ok: false, error }); });

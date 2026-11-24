// 延续生成专项中的真实 PNG，检查命名标签、实际文件改名与工程引用闭环。
// 像给同一本书换书名，同时核对两张借书卡和参考目录都指向新书名。
// 生成像素来自已有 HTTP/返回夹具，不是模型真实推理；文件改名服务没有 mock。
// 页面输入、鼠标与键盘由 Electron 自动发送，不把这些动作报告成人工验收。
// 所有目录来自宿主随机临时根，不能读写用户已打开工程或原始图片。
// 先验证已有名字，再改名、取消与冲突，最后验证图片节点同样复用引用编辑器。
// 保存读回直接读磁盘 JSON，不能从刚发给组件的预期对象推断保存成功。
const fs = require("node:fs");
const path = require("node:path");

// 每次重读真实文件；组件可能已经卸载，不能沿用旧 DOM 或内存快照自证恢复。
// 本 helper 不改变节点顺序或补默认值，字段丢失必须原样暴露给断言。
// JSON 解析失败会使专项失败，不返回一个空工程绕过错误。
// 当前JSON由生产写盘器维护，infiniteCanvas之外的账户和设置不会拿来当图数据。
// 文档缺失意味着保存或测试前提错误，不能从调用方传入的旧document兜底。
// 本读取不触发渲染层水合，因此能独立发现“界面正确但磁盘漏字段”。
// 不重新序列化节点再比较，避免同一产品序列化错误同时出现在预期和实际两边。
// 不按标题查节点，因为本场景刻意让同源节点显示相同的文件主体。
// 节点id由前序图夹具明确提供，文件系统的随机目录不能决定节点身份。
// 读取整个当前画布是为了同时核对源节点和下游手动输入，而非只看当前选中卡。
// 空文件或损坏JSON属于真实失败，脚本不会补一个默认节点后继续。
// 该函数仅在已知写盘完成的步骤使用，不用同步读取强制等待异步保存。
// 文件内容可能包含其他既有分段，测试不删除它们来简化预期。
function document(ctx) {
  return require("./canvas-library-fixture").readCanvas(ctx);
}

// 双击标题走产品既有编辑入口，输入和失焦继续使用宿主的原生 setter/事件。
// 这里的 DOM 双击是自动事件，专门避开上方项目头遮挡，不宣称实体双击手感。
// 不直接改节点 title、media 或 React store，真正文件名由后续生产服务决定。
// 等待输入框出现才能填值，异步提交尚未完成时不能向旧的 strong 写文字。
// name 是文件主体，不含路径；后缀由原图片改名服务保留。
// ctx.fill 最后触发失焦，和 Enter 的产品提交路径相同，不调用私有提交函数。
// 新资源名只有生产服务确认后才进入图；失败仍由画布消息解释。
// MouseEvent使用bubbles保证React委托监听能收到双击，不只对原生节点派一个孤立事件。
// 单击不能开始标题编辑，测试明确走双击而不是直接查找一个常驻input。
// 输入定位同时限定稳定节点id和header，不能误填下方提示词或尺寸字段。
// 每次改名重新查询input，上一轮输入失焦后可能已经卸载。
// 取消与提交共用这处正式编辑入口，差异由后续键盘或失焦决定。
// 前序图有两个同源图片，只操作image-2标题，另一张必须依靠产品引用修复更新。
// 若测试逐个修改两个标题，就无法发现产品只修了一张卡的集成缺陷。
// 本helper不创建新目标文件，重名和成功的条件分别由调用场景准备。
// 输入文字与原资源token无关，改标题不需要重打视频提示词来保持引用。
// 返回前ctx.fill只保证事件完成，保存结果仍由后面的有界wait和读盘确认。
// 这些输入不是系统选择框、资源管理器重命名或云端对象改名。
// 失败交由宿主保留故障截图，helper不会改回旧标题后掩盖失败过程。
async function rename(ctx, name) {
  await ctx.run("document.querySelector('[data-canvas-node=image-2] [data-canvas-title]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await ctx.wait("document.querySelector('[data-canvas-node=image-2] header input')");
  await ctx.fill('[data-canvas-node=image-2] header input', name);
}

// 每个标签都检查实际 naturalWidth，不能用空 img 或固定灰块冒充缩略图。
// 固定 20×20 是 CSS 像素，不等于操作系统 DPI 或原图本身的像素尺寸。
// 标签显示名与底层 token 同时比较，防止用户看到了名字却提交了错误资源。
// getComputedStyle 的伪元素 content 是实际展示名；textContent 仍应保留 @picture1。
// title 提供完整名字，长主体被省略时也不会失去核对来源的入口。
// 同一检查同时用于视频和图片输入，避免仅修改视频组件而漏掉图片入口。
// 查找范围限定当前已选节点，后台保活输入不应被错算为当前成功证据。
// label 通过 JSON 字符串传入脚本，名字里的引号不会变成执行代码。
// dataset中的主体精确比较，不能只要求包含“Image”而接受带png后缀的错误名称。
// 伪元素content是带引号的CSS计算值，JSON.stringify产生对应的可比较表示。
// 不读取innerText判断规范正文，因为伪元素是显示层，不能作为提交协议来源。
// naturalWidth来自实际已解码封面，与img标签的CSS宽度是两个不同证据。
// 一张坏图即使被CSS设置20像素也无法满足naturalWidth条件。
// 缩略图宽高同时检查，排除只固定高度而让横图按原比例延展的实现。
// 节点当前缩放为前序场景的默认百分百；窗口尺寸不会改变世界缩放。
// 这项矩形结果不推广到其他缩放比例下的视觉像素，画布自身缩放有独立测试。
// 图片标签必须保留编号一，显示名字不能替代接口要求的Picture顺位。
// 若装饰误将文件主体追加进真实正文，textContent相等断言会直接失败。
// 伪元素即使显示正确，但资源编号串到第二张，也同样不能通过。
// kind限定只决定查询范围，图片与视频没有各自独立的期望实现。
// label不来自页面现有标签，否则错误显示值会反过来成为预期导致自证。
// 缺少标签或缩略图时表达式返回假，不调用产品修复方法制造一张替代图。
// 此检查只读取原始像素的解码结果，不评判模型是否理解了生成提示词。
async function badge(ctx, kind, label) {
  return ctx.run(`(()=>{const e=document.querySelector('[data-kind=${kind}][data-selected=true] [data-reference-label]'),i=e?.querySelector('img'),r=i?.getBoundingClientRect();return e?.dataset.referenceLabel===${JSON.stringify(label)}&&e.textContent==='@picture1'&&getComputedStyle(e,'::after').content===JSON.stringify(${JSON.stringify(label)})&&i?.naturalWidth>0&&r.width===20&&r.height===20})()`);
}

// 先保留源文件正文，再比较改名后的字节；名称变化不能顺带重编码或丢内嵌 Meta。
// 两个来源节点在前序场景共用同一真实文件，第三处引用是视频的手动输入。
// 文件主体来自最后一个点之前，多点名称用 Renamed.Image 作为反例。
// 旧位置应消失，新位置应真实存在，不能只检查节点标题变了一次。
// 原提示词规范 token 保留，重命名显示名字不应将正文改成任意用户文件名。
// 改名后等待实际保存完成，再读盘，避免把还未提交的旧状态当结果。
// 没有读取生产服务返回值作为断言预期，路径根据目标目录和固定主体独立构造。
// 每次运行的目录不同，历史成功文件不可能让 existsSync 偶然通过。
// 原生成结果的扩展名保留，不把新主体里的点误当成用户指定的新格式。
// 视频仍使用自己的独立 prompt，源图片 prompt 不应被标签刷新覆盖。
// 截图保留整个正式工作区，能复查实际显示名字、缩略图和当前节点选择。
// 字节比较来自 Node 读磁盘，和渲染 DOM 的名称断言构成两份独立证据。
// original取自刚刚保存的image-2媒体，不能从页面title反推磁盘文件名。
// bytes在改名前读取，能检测图片元数据被改名流程意外删掉或正文遭替换。
// prefix由测试侧path.extname计算，与产品取前缀函数独立，不共用被测实现。
// 截图时视频仍被选中，能够看到已插入的原子标签而非只看候选菜单。
// 固定新主体含有内部点，专门反证使用第一个点截断的错误实现。
// 目标扩展来自真实原文件，不预设全部受支持图片都必须是png。
// 源目录保持不变，改名不能把文件挪到项目根或创建另一个临时工程。
// 等待title和已保存状态同时成立，旧页面的已保存文本不能提前结束等待。
// current必须在等待之后读取，不能沿用请求前的文件对象判断新媒体地址。
// 两个图片节点都检查path和title，避免只改可见文字但仍指向旧媒体。
// 下游手动参考检查的是输入数组第一项地址，不把连线图片的临时URL当落盘值。
// 源地址消失与目标存在配对，复制一份新图但保留旧文件也不能冒充实际改名。
// 字节完全一致比文件大小相同更严格，同长度的错误图片不能通过。
// 返回新路径只供后续冲突场景使用，不返回产品刚刚声称的成功状态。
// 任何一次读文件失败都会抛出，不能把磁盘失败当成一张不参与比较的缺图。
async function checkRename(ctx) {
  const original = document(ctx).nodes.find(node => node.id === "image-2").data.media;
  const bytes = fs.readFileSync(original.path);
  const prefix = path.basename(original.name, path.extname(original.name));
  ctx.smoke.check("Video mention displays actual square thumbnail and filename prefix", await badge(ctx, "video", prefix));
  await ctx.shot("76-video-filename-reference");
  await rename(ctx, "Renamed.Image");
  await ctx.wait("document.querySelector('[data-canvas-node=image-2] [data-canvas-title]').title==='Renamed.Image'&&document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  const current = document(ctx);
  const next = path.join(path.dirname(original.path), `Renamed.Image${path.extname(original.path)}`);
  ctx.smoke.check("Node rename really renames PNG while retaining complete image bytes", !fs.existsSync(original.path) && fs.existsSync(next) && bytes.equals(fs.readFileSync(next)));
  ctx.smoke.check("Both same-source nodes and manual reference persist new name and path", current.nodes.filter(node => node.data.kind === "image").every(node => node.data.media.path === next && node.data.title === "Renamed.Image") && current.nodes.find(node => node.id === "video").data.inputImages[0].path === next);
  return next;
}

// 重名冲突使用真实的第二张 PNG，不替换改名 IPC 为强制失败返回值。
// 预先存在的目标必须保留原字节，原选中图片也不能因为冲突被删除或替换。
// 文件改名失败继续显示原已确认名字，输入草稿不能作为假成功留下。
// 取消输入先用真实 Escape，再通过失焦结束，确保不产生新文件。
// 失败提示来自正式消息区，测试不能仅看到 Promise 结束就宣称已处理错误。
// 碰撞文件用专门主体，避免和本专项已确认的新文件撞在一起造成混淆。
// 不用改预期文件大小或缩短名称来迁就失败；内容比较和正式路径都必须成立。
// 测试不声称资源管理器里的外部改名监听已接入，这里仅验证应用自身改名动作。
// Cancelled是未提交草稿，若Escape错误触发改名，原路径存在断言就会失败。
// 先改input.value再发送Escape，确保并非空按Escape就宣称取消逻辑有效。
// cancelDraft会把输入恢复成已确认主体，随后blur必须走不产生请求的同值分支。
// 取消后检查页面真实title，排除文件没动但UI错误显示草稿的另一类故障。
// 冲突目标在相同目录创建，跨目录同名不应被误判为同一文件冲突。
// 目标扩展与原图一致，不能用不受支持的格式错误冒充同名校验生效。
// copyFileSync创建的是隔离测试资产，生成模型服务的fixture未参与这个错误条件。
// Taken与当前Renamed.Image不同，因此不能走产品的“同值无需操作”快速路径。
// 正式错误消息必须出现，证明失败已被异步边界接住并提供可理解反馈。
// 如果整个画布因busy锁未释放，后续重开和图片引用步骤也无法顺利继续。
// 冲突后旧的确认媒体必须还在，不能因为先删除再rename导致资产丢失。
// 测试没有删除冲突文件重试到成功，保留第一次真实冲突作为反证。
// 这项失败不等于磁盘满、ACL拒绝或旁车移动失败均已覆盖，交付要分开报告。
// 图片的原始导入来源不在当前受管目录，测试不会触碰生成前的外部源文件。
// 输入错误不会写进prompt或引用显示名，随后恢复场景仍应显示原确认主体。
async function checkCancelAndConflict(ctx, currentPath) {
  await ctx.run("document.querySelector('[data-canvas-node=image-2] [data-canvas-title]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await ctx.wait("document.querySelector('[data-canvas-node=image-2] header input')");
  await ctx.run("document.querySelector('[data-canvas-node=image-2] header input').value='Cancelled'");
  await ctx.key("Escape");
  ctx.smoke.check("Escape keeps actual filename and confirmed node title", fs.existsSync(currentPath) && await ctx.run("document.querySelector('[data-canvas-node=image-2] [data-canvas-title]').title==='Renamed.Image'"));
  const conflict = path.join(path.dirname(currentPath), `Taken${path.extname(currentPath)}`);
  fs.copyFileSync(currentPath, conflict);
  await rename(ctx, "Taken");
  await ctx.wait("document.querySelector('[data-app-toast=error]')?.textContent.includes('重命名失败')");
  ctx.smoke.check("Real filename collision retains original asset and confirmed title", fs.existsSync(currentPath) && fs.existsSync(conflict) && await ctx.run("document.querySelector('[data-canvas-node=image-2] [data-canvas-title]').title==='Renamed.Image'"));
}

// 为图片引用建立合法的单输入编辑工程：这部分图关系是明确的初始夹具。
// 不是实体拉线验证；后续 @ 输入、选择、显示和保存均走正式页面。
// 两个图片同源但不同 id，能验证标签显示不依赖源地址去重。
// 把目标放到可见区，避免项目头挡住标题；不改变图片本身尺寸来方便断言。
// 重开销毁前一份组件局部状态，图片不能靠视频保活的 DOM 假装有引用能力。
// 保留文档其他设置，主题、公告确认和用户分段仍从前一轮真实保存结果恢复。
// 文生图不允许输入图片，所以目标明确使用原文字改图工作流和单图模式。
// @ 仍插入 @picture1，主体显示由共用候选表派生，不写一份图片专属标签协议。
// 当前两张图同名是故意的，选择必须靠资源 id 与连接关系而非名字相等。
// 带有文件前缀的标签截图属于真实已解码图片，不能冒充真实模型推理质量证据。
// 重开后等待当前文件名和节点出现，不能让旧页面残留满足就绪条件。
// 没有网络上传，引用选择只在当前画布的输入图表中查找。
// source和target从成功改名后的实际文档选取，不人工构造一个正确新路径替代产品结果。
// 这一步只调整关系和可见位置，媒体地址必须继续使用上一步的真实保存数据。
// 两个节点保留独立id，后续候选id必须是source而不是目标自己的输出。
// 旧视频节点从这份夹具移出，避免它的保活输入被当成图片输入的成功结果。
// 没有保留已插入的视频prompt，图片入口需要从空提示词重新完成一次@选择。
// 手动输入不在目标节点上额外补图，因此候选来自唯一明确的上游连线。
// 只有一条合法边，若候选实现误读取全图库，菜单里会出现不应存在的自身图片。
// 正式ReactFlow仍从磁盘恢复世界坐标，测试不通过store.setState直接选中目标。
// 指针先点目标标题图标，确保参数面板由真实节点选择挂载。
// 等待data-video-prompt证明图片实际调用原引用编辑器，不是留下旧textarea。
// Electron.insertText输入的是未完成别名，菜单必须通过原补全hook打开。
// 菜单项使用稳定源id定位，不能按两个同名图片的显示文字猜测来源。
// Enter提交保留原补全键盘路径，不直接调用onChoose或手写一个资源span。
// 在图像画面下方捕获标签，能核对新输入没有被隐藏到单独的设置弹窗。
// 新页面仍经原preload恢复用户文档，不能把旧组件引用留在模块变量中跨重载使用。
// 目标工作流的图片输入上限仍是一个，夹具不为本次标签外观放开数量限制。
// 恢复验证不代表便携归档已重新导入，那条完整闭环仍由全画布专项单独报告。
// 此处不点击生成，标签选择不应该消耗一次模型任务或把目标媒体替换成空白。
async function checkImageAndReopen(ctx) {
  const value = { infiniteCanvas: require("./canvas-library-fixture").readCanvas(ctx) };
  const source = value.infiniteCanvas.nodes.find(node => node.id === "image-2");
  const target = value.infiniteCanvas.nodes.find(node => node.id === "image-10");
  source.position = { x: 650, y: 140 }; target.position = { x: 150, y: 140 };
  target.data = { ...target.data, prompt: "", workflow: "anima-edit", mode: "image" };
  value.infiniteCanvas.nodes = [source, target];
  value.infiniteCanvas.edges = [{ id: "named-image-input", source: source.id, target: target.id, sourceHandle: "out", targetHandle: "in" }];
  await require("./canvas-library-fixture").writeCanvas(ctx, value.infiniteCanvas);
  await ctx.win.loadURL("app://app/canvas");
  await require("./canvas-library-fixture").openProject(ctx);
  await ctx.wait("document.querySelector('[data-canvas-node=image-10] [data-canvas-title]')?.title==='Renamed.Image'");
  await ctx.pointer('[data-canvas-node=image-10] header>svg');
  await ctx.wait("document.querySelector('[data-kind=image][data-selected=true] [data-video-prompt]')");
  await ctx.pointer('[data-kind=image][data-selected=true] [data-video-prompt]');
  await ctx.win.webContents.insertText("@picture");
  await ctx.wait("document.querySelector('[data-prompt-media-option=image-2]')");
  await ctx.key("Enter");
  ctx.smoke.check("Reopened image node reuses named square reference badge", await badge(ctx, "image", "Renamed.Image"));
  await ctx.shot("77-image-filename-reference");
}

// 这三个流程顺序共享同一真实文件，改名后的输入会成为重开场景的初始数据。
// 上一项失败直接抛出，总护栏保留失败码，不偷偷从 fixture 恢复后继续装作通过。
// 原生成专项仍负责取消、批量回填与图片质量参数，本模块不替代那些断言。
// 工程包导入导出由全画布回归承担，这里的重开只证明用户文档恢复。
// 系统 DPI、完整 IME、读屏、实体鼠标和外部文件监听均不在本自动证据范围内。
// 成功改名产生的next由独立磁盘检查确认，不能把一段预计字符串直接传给冲突场景。
// 失败场景结束时仍保留有效当前文件，重开才有真实资产可以解码。
// 模块没有自建BrowserWindow，沿用宿主已经核对的新鲜静态产物。
// 所有断言进入同一smoke护栏，后续恢复正常不允许清掉前面的失败计数。
// 模块不调用app.quit或重写process.exitCode，退出状态仍由统一宿主负责。
// 若首轮失败，要先定位截图与前提，不能不断刷新直到某次返回成功。
// 像素文件、用户文档与渲染标签分别取证，三层中任一层错误都不能算功能完成。
async function checkCanvasMediaNames(ctx) {
  const next = await checkRename(ctx);
  await checkCancelAndConflict(ctx, next);
  await checkImageAndReopen(ctx);
}
module.exports = { checkCanvasMediaNames };

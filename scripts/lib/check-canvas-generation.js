// 正式画布的生成集成回归：自动控件事件、HTTP模型夹具、远端返回值夹具分别记录。
// 每次成功还读真实工程JSON和PNG像素，不能只凭一条“成功”通知验收。
// 测试分为可独立观察的四种结果，不用一个布尔成功覆盖全部阶段。
// 第一种是控件状态：工具展开、选择焦点与正文装饰在真实 DOM 上检查。
// 第二种是请求状态：本机 HTTP 与远端 transport 分别登记生产提交内容。
// 第三种是磁盘状态：真实 PNG 可被解码，路径属于当前画布 Picture。
// 第四种是工程状态：独立 JSON 读回检查 ID、节点总数、边与参数。
// 四种结果互相补充，任何一层不满足都不能声称生成闭环已经通过。
// 例如 JSON 有路径但文件不存在，磁盘层会失败。
// 例如文件存在但节点 ID 重复，工程层会失败。
// 一次六张需要一次提交和六个不同的落盘路径，两项都由实际界面触发验证。
// 例如远端重复提交两笔 n=2，请求边界的调用次数会暴露重复收费风险。
// 例如菜单显示 picture1 却引用 i10，DOM 资源 ID 会暴露文字与来源不一致。
// 例如保存按钮文字已变但没有写盘，独立 JSON 仍保留旧状态。
// 例如编辑没有上传图片，uploadBytes 不会因单纯保存结果增加。
// 例如工作流仅多了无连接的宽高节点，edit-scale 与 encode 连线断言会失败。
// 这些是针对真实行为的反证，不是检查源码里是否出现某个函数名。
// 测试使用固定视觉内容，因此不会比较图像语义与提示词是否一致。
// 不记录用户私密提示词，所有测试正文都是仓库脚本明确生成的夹具。
// 原媒体路径来自隔离目录，任何错误日志与截图都能交付给审查而不接触用户作品。
// 用户并没有在本测试中点击系统选择框，导入人工项不能被顺带标通过。
// 这里的 restore 明确标为工程夹具，不假装执行过鼠标完整建图。
// 图关系夹具用于稳定验证排序，真实连线交互仍由原基础冒烟覆盖。
// 本模块不对用户数据进行迁移，测试文件写入只发生在新建临时根。
// 所有 helper 的等待都有宿主上限，不会把页面卡死变成无限执行。
// 任务取消的竞态遵守生产队列规则，不通过清空测试状态模拟成功。
// 保存中取消的完整临界时序没有在这个小样本强制复现，需要保持验证边界。
// 页面卸载的资源保护也由全画布和原队列回归共同覆盖，不宣称压力条件全部通过。
// 大于两千的自定义真实模型负载没有运行，UI 校验成功不构成显存承诺。
// 不同模型文件与 GPU 环境需要真实推理补验，HTTP 图像固定缩放无法代替。
// 当产品改了预期语义，应先更新需求契约，再调整测试，不能反过来迁就报错。
// 本轮不能通过减少图片数量或缩小输出尺寸使原有失败消失。
const fs = require("node:fs"), path = require("node:path");
const { nativeImage } = require("electron");
const { isDeepStrictEqual } = require("node:util");

// 这里保存的是正式页面当前工程，不从生成 hook 直接获取内部 React 对象。
// 按钮可用且状态写成已保存后，仍要独立从磁盘读取 infiniteCanvas。
// 这像先看收据再查仓库，不能只看屏幕提示就说文件已经存在。
// 工程路径来自宿主新建的隔离文档，不扫描用户正式 user 目录。
// 保存使用同一个 helper，普通生成、编辑、远端和引用不会采用不同成功标准。
// 读取用户文档中的画布段，其他保留段仍由生产写入器管理。
// JSON.parse 失败应终止用例，不能回退成空节点数组继续验收。
// 自动保存可能已完成，但显式保存仍走正式入口以确认当前观察数据。
// 没有直接调用 writeUserData 伪造当前 UI 已提交。
// 保存状态等待有时间上限，写盘失败不会让冒烟永远挂住。
// 读取发生在 await 之后，不能在 React 更新尚未完成时比较旧文件。
// 后续断言使用这个快照，不把 UI textarea 的文字当作独立持久化证据。
// 真实媒体路径再交给 fs.existsSync 与 nativeImage 检查，JSON 有字段仍不等于文件有效。
// 这里没有检查真实云端保存，当前任务继续使用本地单文件工程。
// 如果通知假成功但文件没更新，后续 ID、数量或像素断言会失败。
// 如果文件只部分更新，深层参数断言也会暴露不一致。
// 同一用户文档可包含其他状态，本测试不会为了简化读取而重写整个数据结构。
// 保存工程引用不代表已经导出便携包，便携能力仍由原全画布用例单独回归。
async function save(ctx) {
  await ctx.click('.hy-project-header [aria-label="保存画布"]');
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  return require("./canvas-library-fixture").readCanvas(ctx);
}
// 生成入口限定当前图片面板，避免误点击导航或其他媒体的同名按钮。
// 等待 ready 数量而不是固定睡眠，能发现结果文件没有真正解码的问题。
// 精确等于 count 可抓到额外重复回填，而不仅是至少出现一张。
// 首轮 count=1，第二轮 count=6，当前图中的结果总量前提由场景顺序明确建立。
// 这不是每次都追加 count；第一张必须替换发起节点媒体。
// 只等待成功标记无法发现 UI 已成功但图片无法访问的错误。
// 超时保留真实截图和表达式，不能吞掉错误后直接增加成功计数。
// 点击触发真实生成，测试不调用内部队列或直接填充结果。
// 原执行器会生成、保存再导入受管目录，helper 没有跳过其中任一步。
// 任务失败场景使用另一个 helper，不让这里在失败时偷偷改 count 迁就结果。
// 返回保存快照供后续独立断言，不从 UI 自己标记的已完成数量推测落盘。
// 参考编辑也复用 generate，所以它必须满足同样的可解码图片标准。
// 远端返回值夹具同样经过生产写盘，不能直接把 count 个占位节点塞进图。
async function generate(ctx, count) {
  // 选中后参数面板要经过 React 提交，先等真实输入框，不能在同一时刻读取尚未挂载的表单。
  // 这是有界就绪等待；若实体选择一直无效仍会超时失败，不重复点击掩盖产品问题。
  // 不直接设置 selected 或 panelActive，后续焦点与请求仍由原组件负责。
  await ctx.wait("document.querySelector('[data-kind=image] [data-video-prompt]')");
  await ctx.run("document.querySelector('[data-kind=image] [data-video-prompt]').focus()");
  await ctx.click('[data-kind=image] .hy-submit');
  await ctx.wait(`document.querySelectorAll('[data-canvas-media=image][data-media-status=ready]').length===${count}`);
  return save(ctx);
}

// 工具展开只改变显示，不能产生节点或写入模型任务；创建页默认仍展示完整工具。
// 一次六张必须得到六个真实文件引用，第一张保持发起节点ID。
// 后续五张是深拷贝的新节点，而不是五条指向原节点的新增输入边。
// 从空工程通过原添加入口新建图片节点，测试没有预先注入一张已选媒体卡。
// 添加位置让参数面板处于视口内，不能用被项目头遮住的命中点判断选择坏了。
// 先等原工具条出现，动态导入完成之前不读取 children 数量。
// 记录发起 ID，后续第一张图片必须继续使用它。
// 初始五个 children 代表四个业务入口加一个展开箭头。
// 展开后八个 children 代表七个业务入口加同一个收起箭头。
// 如果只是把全部按钮藏进 CSS 而仍可 Tab 到，DOM 数量断言会暴露与设计不符。
// 收回工具以后再输入，避免悬浮资源菜单挡住生成按钮。
// 输入字符串明确说明不调用真实模型，截图中的这段词不是生产示例提示词。
// 画质用真实菜单第二项选两千档，而不是预先在工程夹具塞入 outputSize。
// nativeImage 直接读取生产保存的 PNG，宽二千零四十八不能只从标签文本取得。
// 首节点 ID 比较防止错误地新增一张而保留发起空卡。
// 接着在唯一数量入口选择六，不能保留原先无效的独立乘一按钮。
// 第二轮预期总共六节点，表示第一张回原节点，另外新增五张。
// 七次本机服务请求等于先一张再六张，能发现重复 submit 或漏掉后五张。
// 节点 ID 的 Set 大小同样为六，避免六条数组元素却共享一个业务身份。
// 图上没有新增边，防止实现把输出图片自动串成下一轮输入。
// 路径存在检查与 Picture 父目录检查共同确认受管归属。
// 路径还必须位于隔离 root/user 内，不能仅凭目录名恰好叫 Picture 就通过。
// 返回图片数量正确但文件仍在 gallery 外部时，这组必须失败。
// 截图取真实 ready 状态，不在结果返回前先画一个成功封面。
// 撤销前把焦点移到画布根，避免原文字编辑器消费 Ctrl+Z。
// 一次撤销后只剩原一张，验证整批回填是一笔历史事务。
// 重做后恢复六张，验证新增 ID 与媒体引用保存在原历史快照。
// 如果逐张 setNodes 六次，撤销一次不会回到一张，因此断言能抓到非原子回填。
// 如果撤销顺带删除磁盘文件，后续重新使用第一张真实受管图的编辑场景也会失败。
// 本场景不检查真实模型多样性，因为 HTTP 返回固定视觉夹具。
// 它也不检查供应商收费 n 的含义，远端请求次数另有独立断言。
// 同一窗口运行完再进入失败场景，保留真实结果作为失败必须保护的旧图。
// 第一张图被编辑失败覆盖为空时，后面的 JSON 比较将给出明确反证。
// 整批数量与像素都是从真实路径读回，不依据内部 pending 对象自证。
// 没有在测试里调用 resultNodes 或 applyDocument 生成预期图。
// 每次 save 仍走生产写入，自动保存订阅也在原页面持续运行。
// 用例返回的是六张成功后的真实文档，后续输入源来自该文档。
// 这份文档可复用作恢复夹具，但报告应把恢复夹具与人工创建场景分开。
async function checkLocal(ctx, state) {
  await ctx.add("image", 250, 160);
  await ctx.wait("document.querySelector('[data-create-prompt-tools]')");
  const id = await ctx.run("document.querySelector('[data-kind=image]').dataset.canvasNode");
  ctx.smoke.check("Anima displays all six tools without the Moss composition editor", await ctx.run("document.querySelectorAll('[data-prompt-tool]').length===6 && !document.querySelector('[data-moss-edit]')"));
  await ctx.fill('[data-kind=image] [data-video-prompt]', "本地生成回归，不调用真实模型");
  await ctx.click('[data-canvas-parameter=quality] > button');
  await ctx.click('[data-canvas-quality] button:nth-child(2)');
  let document = await generate(ctx, 1);
  ctx.smoke.check("Single image generation keeps original ID and writes 2K pixels", document.nodes[0].id === id && nativeImage.createFromPath(document.nodes[0].data.media.path).getSize().width === 2048);
  await ctx.click('[data-canvas-batch] > button');
  await ctx.click('[data-canvas-batch] button[aria-label="×6"]');
  document = await generate(ctx, 6);
  // 请求计数和传入的批次值一起检查，六个节点必须来自同一次提交。
  const latent = Object.values(state.requests.at(-1).prompt).find(node => node.class_type === "EmptyLatentImage");
  ctx.smoke.check("A single workflow request receives batch_size=6", state.requests.length === 2 && latent?.inputs.batch_size === 6);
  ctx.smoke.check("Six returned files create five extra nodes with distinct paths", document.nodes.length === 6 && new Set(document.nodes.map(node => node.data.media.path)).size === 6 && document.edges.length === 0);
  ctx.smoke.check("All generated images belong to canvas Picture directory", document.nodes.every(node => fs.existsSync(node.data.media.path) && path.basename(path.dirname(node.data.media.path)) === "Picture" && node.data.media.path.startsWith(path.join(ctx.root, "user"))));
  // 单图加六张批量结果，磁盘上应有七份文件。
  const gallery = path.join(ctx.root, "gallery");
  ctx.smoke.check("Canvas generation makes no gallery copies or duplicate project files", (!fs.existsSync(gallery) || fs.readdirSync(gallery).filter(name => name.endsWith(".png")).length === 0) && fs.readdirSync(path.dirname(document.nodes[0].data.media.path)).filter(name => name.endsWith(".png")).length === 7);
  await ctx.shot("70-local-2k-six-results");
  await ctx.run("document.querySelector('[data-infinite-canvas]').focus()");
  await ctx.key("z", ["control"]);
  ctx.smoke.check("One undo restores entire batch atomically", (await save(ctx)).nodes.length === 1);
  await ctx.key("z", ["control", "shift"]);
  ctx.smoke.check("Redo restores all independent result nodes", (await save(ctx)).nodes.length === 6);
  return document;
}

// 失败与取消都保留发起节点已有图片，不能以空媒体覆盖用户之前的成果。
// hold任务持续轮询，取消必须在生产主进程确认服务队列已移除本任务后结束。
// 通过请求计数验证重复点击和快捷键不会额外提交一笔收费/推理任务。
// 旧结果必须存在才开始故障注入，空卡失败无法证明旧图保护。
// 点击图片正文选择实际节点，避免标题靠近项目悬浮头导致测试点到错误控件。
// 等待 selected 面板后再触发任务，确保用的是发起卡的统一请求按钮。
// before 从磁盘读取六张节点和参数，用于失败前后独立比较。
// fail 模式让真实 HTTP 返回拒绝，由实际生成请求触发错误轻提示。
// 页面应出现通用生成失败提示，而不是把夹具响应正文原样暴露。
// 节点 JSON 整体不变可以发现失败时清空旧媒体或误重置参数。
// 比较 nodes 而不是整份用户文档，因为任务历史或保存时间可能合法变化。
// 恢复之前不手动把旧图片塞回图，旧图保护必须由产品自己实现。
// hold 模式接受任务但永不完成，给真实取消路径提供稳定前提。
// 等待 status 中取消按钮出现，不能在任务尚未建立前发送一笔无关 cancel。
// 点击的是正式工作区取消入口，原队列和主进程必须识别同一 request ID。
// 按钮消失意味着等待已结束，仍继续读工程确认没有丢掉已有六张结果。
// 取消之后服务 state 会记录准确任务被移除，不允许 clear all 假停止。
// 已有图库文件不应在取消时被删除，原成果不是这次未完成请求的临时资源。
// 检查完恢复 normal，使后续编辑 golden 不受前一个故障注入污染。
// 不靠重复提交直到成功来掩盖失败状态恢复错误。
// 失败与取消各执行一次，报告保留预期 IPC 错误而不把它们算未处理异常。
// 这组与保存失败不同，模型没有成功时还没进入画布文件导入。
// 本地取消结果由生产 Comfy 取消确认，不把远端停止等待语义套给本地。
// 如果 cancel 只改 UI 没停止服务队列，原队列的确认等待会让测试失败。
// 如果 pending 未在 finally 释放，后续编辑任务不会启动，集成会继续失败。
// 如果取消后又启动批量下一张，服务请求数会偏离后续预期。
// 本专项不测网络断线后收费退款，也不宣称已经取消供应商计费。
// 纯手工点击的手感和按钮可达性仍需人工，这里只有自动控件路径。
// 任务进度与图节点是两套记录，取消不能把原节点从图中删除。
async function checkFailures(ctx, state) {
  await ctx.pointer('[data-kind=image] img');
  await ctx.wait("document.querySelector('[data-kind=image][data-selected=true] .hy-submit')");
  const before = await save(ctx);
  state.mode = "fail";
  await ctx.click('[data-kind=image][data-selected=true] .hy-submit');
  await ctx.wait("document.querySelector('[data-app-toast=error]')?.textContent.includes('生成失败')");
  ctx.smoke.check("Service failure retains graph and existing result", JSON.stringify((await save(ctx)).nodes) === JSON.stringify(before.nodes));
  state.mode = "hold";
  await ctx.click('[data-kind=image][data-selected=true] .hy-submit');
  await ctx.wait("!!document.querySelector('[data-infinite-canvas] [data-canvas-node-loading] button')");
  await ctx.click('[data-infinite-canvas] [data-canvas-node-loading] button');
  await ctx.wait("!document.querySelector('[data-infinite-canvas] [data-canvas-node-loading] button')");
  ctx.smoke.check("Cancelled generation retains all prior results", (await save(ctx)).nodes.length === before.nodes.length);
  state.mode = "normal";
}

// 为编辑与引用场景装载标准工程夹具，仍通过生产恢复校验进入ReactFlow。
// 这是工程输入夹具，不宣称测试做过实体鼠标连线或资源管理器导入。
// 文件引用来自前面生产保存链的真实受管PNG，未手造不存在的成功路径。
// 恢复动作通过标准用户文档再重新加载正式路由，不访问 React 私有 fiber。
// 夹具保持工程格式，只替换 infiniteCanvas，保留游客身份与服务配置。
// 直接写盘只用于准备场景前提，不用于伪造场景操作之后的保存结果。
// 因此后续生成仍要经过真实 UI、队列和生产写入器。
// reload 返回 void，不能直接 await reload 以为新页面已经就绪。
// 先登记 did-finish-load，再调用 reload，防止事件在订阅前已经发生。
// 导航完成只表示资源加载，仍需等用户文档恢复显示已保存。
// 最后等节点出现，避免旧窗口卸载阶段的状态短暂满足条件。
// 每份恢复夹具都复用前面真实生成的媒体路径，而非不存在的 dummy 文件。
// 新图的节点数量、位置和工作流是明确的测试输入，不宣称通过鼠标完成了这些布置。
// 同一个 BrowserWindow 保持串行，不能为每个场景开新 Electron 绕过资源清理。
// 原页面卸载应清理 pending 与订阅，重开才能使用新的实例。
// 服务与受管目录仍属于同一个测试根，恢复不会意外连接正式服务器。
// JSON 写入失败直接抛出，不以重新初始化空工程假装恢复成功。
// 缺失媒体应按产品显示错误，本 helper 不把解码错误强制改为 ready。
// 恢复没有执行便携导入；便携格式和媒体正文另由原全画布回归覆盖。
// 这一步的证据分类必须写工程输入夹具，不能写人工打开工程通过。
// 后续读取的文件是产品再次保存的结果，与前提写入是不同阶段。
async function restore(ctx, document) {
  await require("./canvas-library-fixture").writeCanvas(ctx, document);
  await new Promise(resolve => { ctx.win.webContents.once("did-finish-load", resolve); ctx.win.webContents.reload(); });
  await require("./canvas-library-fixture").openProject(ctx);
  await ctx.wait("document.querySelector('[data-canvas-save-status]')?.textContent.includes('已保存')");
  await ctx.wait("document.querySelector('[data-canvas-node]')");
  // 卡片正文可先于图引擎的尺寸测量出现，此时外层仍 hidden，不能据它计算点击坐标。
  // 等所有实际节点完成可见布局后再发送一次指针，避免首次测量改变命中位置。
  // 这里检查的是 Chromium 最终可见性，不加假节点或用固定睡眠绕过异步布局。
  await ctx.wait("[...document.querySelectorAll('.react-flow__node')].every(e=>getComputedStyle(e).visibility==='visible'&&e.getBoundingClientRect().width>0)");
}

// 编辑使用同一Anima参考链，只替换本次确切输出画框，验证实际提交的ImageScale。
// 原创作页不传outputSize，旧MP行为由独立纯函数回归继续核对。
// 编辑前提只有一个节点，batchSize 为二，inputImages 恰好一张真实受管图片。
// workflow 明确改为 anima-edit，不能仍用文生图请求却把界面叫做编辑。
// 先前 Anima 两千尺寸属于另一模板项，编辑未配置时应按自己缺省一千档执行。
// 两次请求都必须出现 ImageScale，不能只在 UI 显示一千档。
// width 必须是一千零二十四，验证工作流提交与读出的输出规格一致。
// 两个编辑任务顺序复用原队列，每张结果必须真实落盘并 ready。
// uploadBytes 大于零防止产品跳过参考图片却用纯文生图假装编辑成功。
// 请求数在 before 之后恰好加二，不把前面七张普通图或取消任务计为编辑。
// 截图与返回图像由固定媒体服务提供，本项不声称看到了语义编辑效果。
// 原 MP 链的兼容性已在纯构建回归验证，这里重点是显式输出尺寸链。
// 编辑模型列表使用原模板资源名，不能通过删掉默认编辑 LoRA 来绕过缺模型。
// 随后恢复远端节点，remoteImage 指定真实产品枚举中的 Sunburst。
// text 模式清空参考图，防止把编辑的 inputImages 残留带进文生图请求。
// 远端批量二对应一笔 n=2 的收费接口请求，而非两次自动重复调用。
// endpoint 必须是 generations，不能误走需要图片的 edits。
// state.remote 从传输边界读取，模型选择必须真正进入请求而不只是改按钮文案。
// 远端结果仍通过同一个回填规则，首张占原节点、另一张新增独立节点。
// 这个统一规则不意味着把远端鉴权逻辑搬到渲染层。
// 测试只替换 transport，专用凭据槽和主进程 PNG 保存继续运行。
// 返回方图与当前远端 size literal 一致，不借用本地两千尺寸声称供应商支持。
// 旧 source media 仅作为 prior result，文生图不自动上传它。
// 这可抓到实现把节点结果与节点参考图混为一谈的错误。
// 两个服务场景之间通过重开恢复隔离，pending 必须已释放。
// 若取消遗留状态没有清掉，编辑或远端都会在这个场景失败。
// 远端截图文件名带 fixture，避免归档后被误读成真实供应商推理截图。
// 没有真实 API Key，因此也没有验证供应商可用性、费用或请求限流。
// 本地和远端的成功消息都来自实际落盘之后，不由测试提前显示。
// 所有用例失败保留现场，不能降低 count 为一或缩小图片来迁就错误。
async function checkEditAndRemote(ctx, state, document) {
  const original = document.nodes[0];
  const node = { ...original, position: { x: 150, y: 100 }, data: { ...original.data, workflow: "anima-edit", batchSize: 2, inputImages: [original.data.media] } };
  await restore(ctx, { ...document, nodes: [node], edges: [] });
  await ctx.pointer('[data-kind=image] header>svg');
  const before = state.requests.length;
  await generate(ctx, 2);
  ctx.smoke.check("Edit batch reuses original reference workflow at actual 1K output", state.requests.length === before + 2 && state.requests.slice(before).every(item => item.prompt["edit-scale"].class_type === "ImageScale" && item.prompt["edit-scale"].inputs.width === 1024) && state.uploadBytes > 0);
  await checkRemoteImages(ctx, state, { ...document, nodes: [node], edges: [] });
}

// 从新节点开始时只跑远端场景，避免本机 Anima 配置影响付费接口回归。
async function checkRemoteImages(ctx, state, saved) {
  if (!saved) await ctx.add("image", 250, 160);
  const document = saved ?? await save(ctx);
  const node = document.nodes[0];
  // 卡片标题移开工程工具栏，指针才能选中实际节点。
  const remote = {
    ...node, position: { x: 420, y: 150 },
    data: { ...node.data, workflow: "anima", mode: "text", inputImages: [], batchSize: 2,
      prompt: "Sunburst batch fixture", remoteImage: { provider: "euzhi", model: "gpt-image-2.5-sunburst", size: "1024x1024", quality: "medium" } },
  };
  await restore(ctx, { ...document, nodes: [remote], edges: [] });
  await ctx.pointer('[data-kind=image] header>svg');
  await generate(ctx, 2);
  ctx.smoke.check("Remote images share result fan-out with local generation", state.remote.length === 1 && state.remote[0].endpoint === "generations" && Number(state.remote[0].input.n) === 2);
  await ctx.shot("71-remote-results-fixture");
  await checkFlare(ctx, state, document, remote);
  await checkRemoteSize(ctx, state, document, remote);
}

// 用用户跑通的单张请求做对照，并通过 ready 状态确认 URL 响应得到可读图片。
async function checkFlare(ctx, state, document, remote) {
  const prompt = "A serene koi pond at sunset, ukiyo-e style.";
  const data = { ...remote.data, media: undefined, batchSize: 1, prompt,
    remoteImage: { ...remote.data.remoteImage, model: "gpt-image-2.5-flare" } };
  await restore(ctx, { ...document, nodes: [{ ...remote, data }], edges: [] });
  await ctx.pointer('[data-kind=image] header>svg');
  const result = await generate(ctx, 1);
  const sent = state.remote.at(-1);
  ctx.smoke.check("Flare sends the working 1024x1024 template once",
    state.remote.length === 2 && sent?.endpoint === "generations"
    && isDeepStrictEqual(sent.input, { model: "gpt-image-2.5-flare", prompt, size: "1024x1024", n: 1 }));
  const file = result.nodes[0]?.data.media?.path;
  ctx.smoke.check("Flare URL result is decoded and saved to the canvas Picture folder",
    !!file && path.basename(path.dirname(file)) === "Picture"
    && isDeepStrictEqual(nativeImage.createFromPath(file).getSize(), { width: 1024, height: 1024 }));
}

// 从旧工程的方图出发，用实际按钮确认比例和档位都会写回请求尺寸。
async function checkRemoteSize(ctx, state, document, remote) {
  const node = { ...remote, data: { ...remote.data, ratio: "4/3", media: undefined, batchSize: 1 } };
  await restore(ctx, { ...document, nodes: [node], edges: [] });
  await ctx.pointer('[data-kind=image] header>svg');
  await ctx.click('[data-canvas-parameter=ratio] > button');
  ctx.smoke.check("Saved square output takes precedence over the old local ratio",
    await ctx.run("document.querySelector('[data-canvas-parameter=ratio] [aria-label=\"1:1\"]').getAttribute('aria-pressed')==='true'"));
  await ctx.click('[data-canvas-parameter=ratio] [aria-label="16:9"]');
  await ctx.click('[data-canvas-parameter=quality] > button');
  await ctx.wait("document.querySelector('[data-canvas-output-pixels]')?.textContent === '1024 × 576 px'");
  await ctx.click('[data-canvas-quality] button:nth-child(2)');
  await ctx.click('[data-canvas-parameter=quality] > button');
  await ctx.wait("document.querySelector('[data-canvas-output-pixels]')?.textContent === '2048 × 1152 px'");
  await ctx.click('[data-canvas-parameter=quality] > button');
  const result = await generate(ctx, 1);
  ctx.smoke.check("Selected 2K wide size reaches the request and the saved project",
    state.remote.at(-1).input.size === "2048x1152" && result.nodes[0].data.remoteImage.size === "2048x1152"
    && result.nodes[0].data.ratio === "16/9");
}

// 连线顺序故意与ID顺序相反；手动导入第三张，验证三处编号都以节点ID为准。
// 点击编辑器再发送实际键盘文本，能发现ReactFlow onNodeClick抢走输入焦点的回归。
// 文本装饰和菜单使用创作页原组件，不从测试直接调用组件内部状态。
// i2 与 i10 使用相同真实图片仍是两个独立来源身份，测试不按文件内容去重。
// 边数组刻意先 second 再 first，确保连接建立顺序与期待引用顺序相反。
// 视频模式选择 minimax-reference，图片数量前提允许三项输入。
// 手动输入借用第一张媒体，应该出现在两个连线来源之后。
// 恢复后点击视频并打开参数，再点击真正 contenteditable。
// activeElement 必须是原编辑器，能抓到外层 onNodeClick 抢焦点的历史问题。
// insertText 走 Electron 输入，不直接调用编辑器内部 save 或 mentions.replace。
// 输入 @picture 后等待 listbox，候选必须由原公共补全 hook 产生。
// 截图在候选打开时采集，可核对三项顺位与主题可读性。
// Enter 由原菜单选中当前候选，而不是测试直接写 @picture1。
// 装饰 span 的 data-media-reference 应指向 i2，不仅是显示一段正确文字。
// span 原文还必须含 @picture1，资源身份和展示编号两者都要一致。
// 如果 ID 正确但编号错，后续真实服务规范化仍会引用错误素材。
// 保存后视频 prompt 必须含 picture1，证明 contenteditable 不是只改 DOM。
// 原图片 prompt 保持之前正文，能发现回调错误写进来源节点。
// 两个图片名相同也不影响 ID 检查，避免按 title 找资源的偶然通过。
// 真实 picture 菜单不等于已提交视频，本专项不触发未接通的视频生成。
// 候选图片地址由 localfile 加载，但实际媒体上传不在引用选择阶段发生。
// 本次 source 关系来自工程夹具，不把它宣称为实体鼠标拉线验证。
// 旧全画布用例还会回归端口与连接，两个证据互不代替。
// 候选缺媒体时的空号保护在纯测试覆盖，这里使用可解码图片验证真实装饰。
// 不修改原 editor 的光标方法，界面必须直接复用创作页组件。
// 如果装饰导致光标跳到另一个输入，activeElement 或保存正文断言会暴露问题。
// 如果菜单只显示但无法 Enter 选择，data-media-reference 等待会超时。
// 如果第一项按边数组排列成 i10，稳定 ID 断言会失败。
// 如果手动图抢到第一号，ID 同样不是 i2，不能靠相同封面蒙混过去。
// 保存路径仍通过生产按钮，不从测试读内部 state 自证正文已确认。
// 恢复其他对象不会修改这个输入的历史值，实例隔离由后续完整画布继续覆盖。
async function checkReferences(ctx, document) {
  const first = { ...document.nodes[0], id: "image-2", position: { x: 20, y: 20 } };
  const second = { ...first, id: "image-10", position: { x: 20, y: 400 } };
  const video = { id: "video", position: { x: 500, y: 100 }, data: { kind: "video", title: "视频引用", prompt: "", content: "", ratio: "16/9", workflow: "minimax-reference", inputImages: [first.data.media] } };
  const edges = [second, first].map(node => ({ id: `edge-${node.id}`, source: node.id, target: video.id, sourceHandle: "out", targetHandle: "in" }));
  await restore(ctx, { ...document, nodes: [first, second, video], edges });
  await ctx.pointer('[data-kind=video] header>svg');
  await ctx.pointer('[data-kind=video] [contenteditable]');
  ctx.smoke.check("Video original reference editor retains actual focus", await ctx.run("document.activeElement.matches('[data-kind=video] [contenteditable]')"));
  await ctx.win.webContents.insertText("@picture");
  await ctx.wait("!!document.querySelector('[role=listbox]')");
  await ctx.shot("72-video-picture-menu");
  await ctx.key("Enter");
  await ctx.wait("!!document.querySelector('[data-media-reference]')");
  ctx.smoke.check("Mention picks lowest linked node ID before manual import", await ctx.run("document.querySelector('[data-media-reference]').dataset.mediaReference==='image-2'&&document.querySelector('[data-media-reference]').textContent.includes('@picture1')"));
  const saved = await save(ctx);
  ctx.smoke.check("Video mention writes only its node prompt", saved.nodes.find(node => node.id === "video").data.prompt.includes("@picture1") && saved.nodes.find(node => node.id === "image-2").data.prompt === first.data.prompt);
}

// 场景按先成功、再失败取消、再编辑远端、最后引用的顺序执行。
// 前一场景的真实结果成为后一场景输入，故意不并发运行。
// 顺序可以检测公共队列 pending 或取消标志未清理的问题。
// 所有场景使用宿主已有窗口、preload、主题和受管目录。
// 这里不创建新的 Electron 进程，避免单实例与任务资源互相影响。
// 证据摘要明确区分本机 HTTP 与远端返回值夹具。
// realInference 固定为 false，成功图片像素不能证明模型语义质量。
// manual 固定为 false，Electron 的 key 和 pointer 仍属自动注入。
// localHttpFixture 读取实际 requests.length，不写一个预计总数作为完成证明。
// remoteReturnFixture 读取传输边界调用次数，不能与返回图片数混用。
// 摘要仅在全部 await 完成后输出，中途异常不能打印本专项完成。
// 宿主最终还会检查 renderer 错误，单个用例通过不掩盖 React hydration 回归。
// 关闭服务与窗口由宿主 finally 统一执行，模块不另造一个退出路径。
// 没有 app.quit 或 process.exit，避免把已有失败退出码掩盖成成功。
// 性能限制仍需报告：软件渲染与小样本不是大图长时间压力测试。
// 源码和发布静态产物新鲜度由宿主在任何场景前验证，不能拿旧页面截图交付。
// 缩窄真实工具条，检查选项同排、右箭头可点、滚动后有返回入口。
async function checkToolScroll(ctx, selector) {
  const root = 'document.querySelector(' + JSON.stringify(selector) + ')';
  const viewport = root + ".querySelector('[data-prompt-tool-scroll]')";
  const arrow = selector + ' [data-prompt-tool-scroll-to=right]';
  const previous = await ctx.run(root + '.style.maxWidth');
  await ctx.run(root + ".style.maxWidth='145px'");
  try {
    await ctx.wait("document.querySelector(" + JSON.stringify(arrow) + ") && " + viewport + '.scrollLeft===0');
    await ctx.click(arrow);
    await ctx.wait(viewport + '.scrollLeft>0');
    const oneRow = 'new Set([...'+ viewport + '.firstElementChild.children].map(child => child.offsetTop)).size===1';
    ctx.smoke.check('Tool row scrolls right without wrapping (' + selector + ')', await ctx.run(oneRow + ' && !!' + root + ".querySelector('[data-prompt-tool-scroll-to=left]')"));
    await ctx.click(selector + ' [data-prompt-tool-scroll-to=left]');
    await ctx.wait(viewport + '.scrollLeft===0');
  } finally {
    await ctx.run(root + '.style.maxWidth=' + JSON.stringify(previous));
  }
}

// 在真实桌面窗口移动指针，直接读取绘制结果，能发现画布重置样式盖掉背景。
async function checkToolHover(ctx, selector, inner = '') {
  const element = `document.querySelector(${JSON.stringify(selector)})`;
  const style = `getComputedStyle(${inner ? `${element}.querySelector('${inner}')` : element})`;
  const background = `${style}.backgroundColor`;
  const clear = "'rgba(0, 0, 0, 0)'";
  const position = await ctx.run(`(() => {
    const rect = ${element}.getBoundingClientRect();
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
  })()`);
  const send = (type, point) => ctx.win.webContents.sendInputEvent({ type, ...point, button: 'left', clickCount: 1 });
  send('mouseMove', { x: 4, y: 4 });
  await ctx.wait(`${background} === ${clear}`);
  send('mouseMove', position);
  await ctx.wait(`${background} !== ${clear}`);
  if (inner) {
    // 圆角比例和无边框共同约束圆底，避免把常驻描边误当成悬停效果。
    ctx.smoke.check('Prompt tool mark has a round hover fill (' + selector + ')', await ctx.run(
      `parseFloat(${style}.borderTopLeftRadius) >= parseFloat(${style}.width) / 2 && ${style}.borderTopWidth === '0px'`));
    return;
  }
  await ctx.wait(`${element}.getAnimations().length === 0`);
  const hover = await ctx.run(background);
  ctx.smoke.check('Prompt tool hover uses a rounded square', await ctx.run(
    `parseFloat(${style}.borderTopLeftRadius) === 6`));
  send('mouseDown', position);
  await ctx.wait(`${background} !== ${JSON.stringify(hover)}`);
  send('mouseUp', position);
}

// 展开项与常显项同排。验证只翻转角标时才改变常显清单。
async function checkMossTools(ctx) {
  const root = '[data-create-prompt-tools]';
  const more = root + ' [data-prompt-tools-more]';
  const listed = `[...document.querySelectorAll('${root} [data-prompt-tool-listed=true]')].map(element => element.dataset.promptTool).join(',')`;
  await ctx.wait(`${listed} === 'background,view3d,pose'`);
  await ctx.wait(`document.querySelector('${more}').textContent.trim() === '+3'`);
  await ctx.shot('90-moss-canvas-prompt-tools');
  await checkToolHover(ctx, more);
  await ctx.wait(`document.querySelectorAll('${root} [data-prompt-tool-add]').length === 3`);
  await checkToolScroll(ctx, root);
  await checkToolHover(ctx, '[data-prompt-tool-add=artist]', 'span');
  await ctx.shot('90a-moss-canvas-prompt-tools-expanded');
  // 按文字所在行不会设置显示，只有右上角的勾才提交。
  await ctx.click('[data-prompt-tool=artist] span');
  await ctx.wait(`document.querySelector('[data-prompt-tool=artist]').dataset.promptToolListed === 'false'`);
  await ctx.click('[data-prompt-tool-add=artist]');
  await ctx.wait(`${listed} === 'background,view3d,pose,artist' && document.querySelector('${more}').textContent.trim() === '+2'`);
  await ctx.click(more);
  await ctx.wait("document.querySelector('[data-prompt-tool-remove=artist]').textContent === '×'");
  await checkToolHover(ctx, '[data-prompt-tool-remove=artist]', 'span');
  await ctx.click('[data-prompt-tool-remove=artist]');
  await ctx.wait(`${listed} === 'background,view3d,pose' && document.querySelector('${more}').textContent.trim() === '+3'`);
  ctx.smoke.check('Canvas Moss adds and removes tools directly using inline marks', true);
}

// 离屏 Chromium 用实际键盘事件触发按钮默认行为；Enter 需要带回车文本。
async function activateToolbarKey(ctx, key, windowsVirtualKeyCode) {
  const keyboard = ctx.win.webContents.debugger;
  const options = { key, code: key, windowsVirtualKeyCode };
  await keyboard.sendCommand('Input.dispatchKeyEvent', {
    ...options, type: 'keyDown', ...(key === 'Enter' ? { text: '\r' } : {}),
  });
  await keyboard.sendCommand('Input.dispatchKeyEvent', { ...options, type: 'keyUp' });
}

async function checkCreateToolbar(ctx) {
  const more = '[data-create-prompt-tools] [data-prompt-tools-more]';
  const remove = '[data-prompt-tool-remove=artist]';
  // Anima 首次全部常显，用键盘打开编辑、操作角标、退出，验证焦点回到开关。
  await ctx.wait(`document.querySelector('${more}')?.textContent.trim() === '编辑'`);
  await ctx.run(`document.querySelector('${more}').focus()`);
  await activateToolbarKey(ctx, 'Enter', 13);
  await ctx.wait(`document.activeElement === document.querySelector('${remove}')`);
  await activateToolbarKey(ctx, 'Enter', 13);
  await ctx.wait(`document.activeElement.matches('${more}') && document.activeElement.textContent.trim() === '+1'`);
  await activateToolbarKey(ctx, 'Enter', 13);
  await ctx.wait("document.querySelector('[data-prompt-tool-add=artist]').textContent === '✓'");
  await ctx.shot('90b-create-prompt-tools-expanded');
  await activateToolbarKey(ctx, 'Escape', 27);
  await ctx.wait(`document.activeElement.matches('${more}') && !document.querySelector('[data-prompt-tool=artist]')`);
  ctx.smoke.check('Create toolbar supports keyboard editing and restores focus on close', true);
}

// 从生成按钮旁打开超分，确认开关保留并关闭，避免影响后续批次用例。
async function checkCanvasPostUpscale(ctx) {
  const panel = '[data-canvas-parameter=post-upscale]';
  const trigger = panel + ' > button';
  const toggle = panel + ' [role=switch]';
  ctx.smoke.check('Post upscale lives in generation actions', await ctx.run(`!!document.querySelector('.hy-panel-submit ${trigger}') && !document.querySelector('.hy-panel-options ${panel}')`));
  await ctx.click(trigger);
  await ctx.click(toggle);
  ctx.smoke.check('Enabling post upscale shows the multiplier on the button', await ctx.run(`document.querySelector('${trigger}').textContent.includes('×2') && document.querySelector('${toggle}').getAttribute('aria-checked') === 'true'`));
  await ctx.shot('91-moss-canvas-post-upscale');
  await ctx.click(trigger);
  await ctx.click(trigger);
  ctx.smoke.check('Post upscale stays enabled after reopening its popover', await ctx.run(`document.querySelector('${toggle}').getAttribute('aria-checked') === 'true'`));
  await ctx.click(toggle);
  await ctx.click(trigger);
}

async function setupMoss(ctx, document) {
  const node = { ...document.nodes[0], data: { kind: 'image', title: 'Moss fixture', prompt: '', content: '', ratio: '1/1', media: document.nodes[0].data.media } };
  // 保留已有结果作为点击目标，通过正式菜单切换工作流并重新生成。
  await restore(ctx, { ...document, nodes: [node], edges: [] });
  await ctx.pointer('[data-kind=image] img');
  await ctx.wait("document.querySelector('[data-kind=image][data-selected=true] [data-canvas-workflow] > .hy-chip')");
  await ctx.click('[data-kind=image] [data-canvas-workflow] > .hy-chip');
  for (const id of ['local', 'moss-series', 'moss']) await ctx.click('[data-canvas-workflow-menu] [data-assistant-item=' + id + ']');
  await checkMossTools(ctx);
  await checkCanvasPostUpscale(ctx);
  await ctx.click('[data-kind=image] .hy-panel-submit [data-canvas-workflow] button');
  const advanced = '.hy-image-sidebar [data-advanced-settings-toggle]';
  await ctx.wait("document.querySelector('" + advanced + "')");
  if (!await ctx.run("document.querySelector('" + advanced + "').getAttribute('aria-expanded')==='true'")) await ctx.click(advanced);
  const slg = '.hy-image-sidebar [role=switch][aria-label=SLG]';
  await ctx.wait("document.querySelector('" + slg + "')?.getAttribute('aria-checked')==='false'");
  await ctx.click(slg);
  await ctx.click('.hy-image-sidebar header button');
  await ctx.fill('[data-kind=image] [data-video-prompt]', MOSS_PROMPT);
  await ctx.click('[data-moss-edit]');
  await ctx.wait("document.querySelector('[data-moss-apply]')?.disabled===false" );
  // 在实际构图页核对其独立入口，角色库和背景库仍应可用。
  const libraries = "[...document.querySelectorAll('button')].map(button => button.textContent.trim())";
  ctx.smoke.check('Moss composition keeps character and background libraries while removing snippets', await ctx.run(`(labels => labels.includes('角色库') && labels.includes('背景库') && !labels.includes('片段'))(${libraries})`));
  await ctx.click('[data-moss-apply]');
  await ctx.click('[data-canvas-batch] > button');
  await ctx.click('[data-canvas-batch] button[aria-label="×2"]');
}

const MOSS_PROMPT = JSON.stringify({ summary: { caption: 'Moss canvas fixture' },
  items: [{ label: 'object', caption: 'a ladder', bbox: [-256, -256, 0, 0] }], bbox_coord_space: 'abs_centralized', bbox_format: 'yxyx' });

async function checkMoss(ctx, state, document) {
  const before = state.requests.length;
  await setupMoss(ctx, document);
  const saved = await generate(ctx, 2);
  const nodes = Object.values(state.requests.at(-1).prompt);
  // 两张图应来自同一个 Moss 请求，构图 JSON 和 SLG 也要出现在请求体里。
  const latent = nodes.find(node => node.class_type === 'EmptyFlux2LatentImage');
  const switchNode = nodes.find(node => node.class_type === 'ComfySwitchNode');
  ctx.smoke.check('Moss submits one two-image request with SLG and Kitchen', state.requests.length === before + 1 && latent?.inputs.batch_size === 2 && switchNode?.inputs.switch === true && nodes.some(node => node.class_type === 'ModelAttentionBackend' && node.inputs.attention === 'comfy kitchen attention'));
  const data = saved.nodes[0].data;
  ctx.smoke.check('Moss saves SLG and submits the same structured prompt kept on canvas', data.workflow === 'moss' && data.imageParameters?.moss?.slg === true && data.prompt === MOSS_PROMPT && nodes.some(node => node.class_type === 'CLIPTextEncode' && node.inputs.text === data.prompt));
}

/** 两个真实入口走同一 HTTP 夹具，创作页还要验证用户图库收到整批。 */
async function checkWorkflowBatch(ctx, state) {
  const document = await checkLocal(ctx, state);
  await checkMoss(ctx, state, document);
  await ctx.click('nav a[href="/create"]');
  await ctx.wait("document.querySelector('#prompt-editor')?.isContentEditable");
  await checkCreateToolbar(ctx);
  await ctx.fill('#prompt-editor[contenteditable="plaintext-only"]', 'workflow batch fixture');
  await ctx.click('[data-image-count-trigger]');
  await ctx.click('[data-image-count-option="4"]');
  const before = state.requests.length;
  await ctx.wait("document.querySelector('[data-generate-button]')?.disabled === false");
  await ctx.click('[data-generate-button]');
  await ctx.click('[data-window-generation]');
  await ctx.click('[data-generation-tab=history]');
  await ctx.wait("document.querySelector('#generation-history-panel [data-generation-task-status=completed] [data-generation-timing]')?.closest('li')?.textContent.includes('workflow batch fixture')");
  const gallery = path.join(ctx.root, 'gallery');
  const files = fs.readdirSync(gallery, { recursive: true }).filter(name => name.endsWith('.png'));
  const latent = Object.values(state.requests.at(-1).prompt).find(node => node.class_type === 'EmptyLatentImage');
  ctx.smoke.check('Create sends one batch_size=4 request and saves four images', state.requests.length === before + 1 && latent?.inputs.batch_size === 4 && files.length === 4);
}

async function checkCanvasGeneration(ctx, state) {
  const document = await checkLocal(ctx, state);
  await require("./check-canvas-suspended-generation").checkSuspendedGeneration(ctx, state);
  await checkFailures(ctx, state);
  await checkEditAndRemote(ctx, state, document);
  await checkReferences(ctx, document);
  // 已生成的真实 PNG 继续用于文件改名与标签回归，不再启动一套假结果画布。
  // 测试读取正式用户 JSON 和真实路径，生成传输夹具不替换文件操作。
  // 新模块与前面的生成、失败、取消和引用顺序执行，遵守单窗口串行回归。
  await require("./check-canvas-media-names").checkCanvasMediaNames(ctx);
  console.log("CANVAS_GENERATION_EVIDENCE", { automatedEvents: true, localHttpFixture: state.requests.length, remoteReturnFixture: state.remote.length, realInference: false, manual: false });
}
// 回归没有强行操作用户剪贴板，也不声称完成资源管理器拖放。
// 实际焦点路径包含 Electron 输入，但仍是自动注入，不等于人手键盘验收。
// 同尺寸截图可复查布局和真实像素内容，无法由截图推断声音或模型质量。
// 所有结果来自同一个静态构建，最终源码改变后需要重建再复跑。
// 后续公共组件调用方回归仍要独立执行，专项不能替代创建页完整场景。
// 若完整创建页有失败，必须记录失败位置，不能因为专项通过而写全项目通过。
// 尚未接通的视频生成继续保持禁用，不用本次图片结果假装视频已完成。
// 保存工程包和导出视频没有在这个模块被扩展，范围仍按本轮用户需求。
// 人工未测项不会由 fixture 通过自动清零，保持原验收状态。
// 所有截图文件以自动证据归档，不使用参考资料原图冒充项目运行结果。
module.exports = { checkCanvasGeneration, checkRemoteImages, checkWorkflowBatch };

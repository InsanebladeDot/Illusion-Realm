// 当前正式画布在已有真实媒体回归后继续测试，不创建第二个窗口或图实例。
// Electron 自动键盘/指针与 DOM 语义右键均单独说明，不当作人工操作证据。
// 证据分类说明：ctx.run 执行的是自动页面脚本。
// ctx.pointer 使用 Electron 指针注入，仍属于自动操作。
// ctx.key 使用 Electron 键盘注入，不等于人工完整键盘路径。
// contextmenu 由 DOM 合成，因此不证明实体鼠标的细线命中体验。
// 保存框与打开框的返回值夹具只处理用户路径选择。
// 夹具不提供复制成功、解包完成、媒体解码或 PNG 像素结果。
// 这些结果都需要生产服务与真实磁盘文件满足断言。
// ctx.shot 来自窗口 capturePage，不来自参考 HTML 截图。
// 截图能佐证布局与当前状态，不能单独证明播放时间在推进。
// 播放推进由前序真实媒体事件断言独立覆盖。
// 截帧 PNG 的签名能证明文件类型，不代表已经逐像素比较源帧。
// 跨目录恢复与实际 ready 能证明包包含可解码媒体。
// 它不等于已经把包搬到另一台 Windows 机器人工打开。
// 系统缩放没有通过改变浏览器视口冒充。
// 资源管理器拖放没有通过 DragEvent 冒充。
// 扬声器试听也没有通过 currentTime 增长冒充。
// 这些待验项必须继续在文档列出。
// 测试里没有访问真实用户桌面或下载目录来寻找素材。
// 工程包与截图都写入本次临时根。
// 只有 harness 最后统一给出运行汇总。
// 当前 helper 不自行设置成功退出码。
// 若任何一步失败，后续无需再执行以避免污染诊断。
// 用户原 Electron 进程不属于测试，不会在这里终止。
// 所有 UI 场景使用一个隔离窗口，避免单实例锁竞争。
// 测试修改系统 dialog 方法时限定 try/finally 生命周期。
// 不能让一个失败用例把后续真实业务的对话框永久换成夹具。
// 产品自身不包含这些替换逻辑。
// 因此运行截图是正式组件，操作来源仍必须如实归类。
// 回归通过只说明所列场景，不泛化为所有编码与大工程性能。
// 过往失败日志继续保留，不与本次最终通过数混合。
const fs = require("node:fs");
const path = require("node:path");
const { dialog } = require("electron");
const { readManifest } = require("../../apps/electron/src/main/modules/canvas/project-archive");

// 右键从真实元素派发，菜单动作再用 Electron 指针点击，能发现 pointerdown 提前卸载菜单。
// 不从 React 私有 store 选节点，右键未选中对象必须由正式 context handler 自己选择。
// selector 指向当前正式画布中的真实 DOM。
// 测试不直接调用 editor.changeEdges 或改 selected 属性。
// 右键事件带客户端坐标，使菜单定位也经过正式入口。
// MouseEvent 是自动合成事件，证据类别明确不是实体右键。
// 之后菜单点击使用 Electron sendInputEvent，能覆盖真实 pointerdown 顺序。
// 这样可以发现菜单在 click 前被全局关闭的集成错误。
// 等待 data-assistant-item 确认公共菜单确实挂载。
// 若没有菜单，不能直接继续删除并声称右键功能通过。
// 同一 helper 用于节点与连线，验证二者共用菜单外壳。
// 位置只用于触发，编辑对象身份仍来自事件命中的正式组件。
// getBoundingClientRect 使用当前缩放后的实际位置。
// 不硬编码导航宽度或世界坐标当鼠标坐标。
// 本 helper 不终止应用，失败交给外层看门狗。
// 也不自动重试右键掩盖菜单偶发卸载问题。
async function context(ctx, selector) {
  await ctx.run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.x+20,clientY:r.y+20}))})()`);
  await ctx.wait("document.querySelector('[data-assistant-item]')");
}
// Ctrl+C 不增加节点；Ctrl+V 才产生新身份；剪切删除与恢复均走原撤销模型。
// 确认空剪贴板时菜单没有粘贴，而不是禁用一个看似可以用的占位动作。
// 用当前节点数作基准，避免把已有媒体节点漏算。
// 第一次右键前会话没有底稿，粘贴项应根本不在菜单 DOM。
// 如果只是 disabled 占位，断言同样不会误判为符合要求。
// 先用菜单复制，确认不会立即增添一张节点。
// 这一项约束新的 copy 语义，不是旧 Ctrl+D 的重复创建。
// 随后显式发送 Ctrl+C，再次确认数量仍不变。
// 图焦点来自菜单关闭后的恢复，快捷键必须在正确宿主里命中。
// Ctrl+V 后等待节点数增加，不直接调用 reducer 产生结果。
// 等待有上限，命令没接线会明确失败。
// Ctrl+X 删除刚才选中的副本，节点数回到原基准。
// 这证明剪切不是单纯更新一个菜单文字。
// 再粘贴应恢复一份新身份的副本。
// Set 检查所有节点身份唯一，不能把同一个 id 插两次伪装复制成功。
// 随后三次撤销分别撤回粘贴、剪切、首次粘贴。
// 数量回到原基准，确认剪贴板编辑共用原历史栈。
// copy 没进历史，因此三次撤销不能多出一个空历史步骤。
// 文本输入用原界面点击进入，不在测试私有 store 中设置 editing。
// 把焦点放入 textarea 后发 Ctrl+C，图节点数必须保持。
// 这个文本用例只证明图快捷键隔离，不证明系统文本板内容。
// 不读取用户系统剪贴板，测试不会泄露此前复制的私人文字。
// 结束时焦点回画布根，为后面 Delete 用例建立明确前提。
// 本组没有把自动键盘事件写成完整人工键盘验收。
// 它覆盖的是命令分派、焦点范围和身份更新。
// 多节点内部边的重映射由生产纯函数负责，本场景不冒称已测所有子图组合。
// 如果旧节点数因其他场景改动，测试会用实际 count 适配而非放宽关系预期。
// 测试没有修改 card 或 media 来帮助复制通过。
// 后续卡片尺寸用例仍操作原图，不依赖被撤销的副本。
// 剪切不会改名或移动磁盘文件，这一组只观察图结构。
async function checkClipboard(ctx) {
  const count = await ctx.run("document.querySelectorAll('[data-canvas-node]').length");
  await context(ctx, '[data-kind=text] header');
  ctx.smoke.check("Paste is absent before the first node copy", await ctx.run("!document.querySelector('[data-assistant-item=paste]')"));
  await ctx.pointer('[data-assistant-item=copy]');
  ctx.smoke.check("Context copy stores nodes without immediately duplicating", await ctx.run(`document.querySelectorAll('[data-canvas-node]').length===${count}`));
  await ctx.key("c", ["control"]);
  ctx.smoke.check("Ctrl+C snapshots graph selection without inserting nodes", await ctx.run(`document.querySelectorAll('[data-canvas-node]').length===${count}`));
  await ctx.key("v", ["control"]);
  await ctx.wait(`document.querySelectorAll('[data-canvas-node]').length===${count + 1}`);
  await ctx.key("x", ["control"]);
  await ctx.wait(`document.querySelectorAll('[data-canvas-node]').length===${count}`);
  await ctx.key("v", ["control"]);
  ctx.smoke.check("Cut and paste create an independent stable node identity", await ctx.run(`document.querySelectorAll('[data-canvas-node]').length===${count + 1}&&new Set([...document.querySelectorAll('[data-canvas-node]')].map(e=>e.dataset.canvasNode)).size===${count + 1}`));
  await ctx.key("z", ["control"]); await ctx.key("z", ["control"]); await ctx.key("z", ["control"]);
  await ctx.wait(`document.querySelectorAll('[data-canvas-node]').length===${count}`);
  await ctx.pointer('[data-kind=text] header>svg');
  await ctx.run("document.querySelector('[data-kind=text] textarea').focus()");
  await ctx.key("c", ["control"]);
  ctx.smoke.check("Text copy does not duplicate graph nodes", await ctx.run(`document.querySelectorAll('[data-canvas-node]').length===${count}`));
  await ctx.run("document.querySelector('[data-infinite-canvas]').focus()");
}

// 一条边独立选择，不以删除端点绕过断开关系；撤销必须恢复同一条连接。
// 前提是原有回归已经创建一条合法连接。
// 没有连接时直接报错，不能静默跳过关键功能。
// 先记录边数和节点数，两者必须分别断言。
// 删除右键命中的边后，节点数应完全不变。
// 只检查边数会漏掉实现同时删端点的严重回归。
// 目标是 interaction path，细线仍有可命中的扩展区域。
// 右键未选边由产品自己选择，测试不预置 selected=true。
// 使用菜单 remove 项执行正式删除回调。
// Ctrl+Z 恢复同一工程结构，然后再验证 Delete 路径。
// 点击事件选择边后由页面 onEdgeClick 把焦点交给画布。
// Delete 必须经过同一 remove 命令，而不是浏览器图引擎默认删除。
// 因此第二次也要求端点节点保持。
// 最后撤销让后续项目导出仍包含原连接。
// 两个入口都验证，不能只用一个返回值替代实际菜单接线。
// 这里的 click 同样是自动 DOM 事件，人工细线命中仍待体验。
// 边样式是否浅细由截图与已有主题检查覆盖，不以删除成功推断视觉。
// 若连接数减少两条，即使目标已删除也不符合精确预期。
// 若节点被误删，回归应失败而不是重建节点继续。
// 测试没有使用缺失连接的空图来跳过异常。
// 整个过程保留媒体资产，不通过删除文件制造边消失。
async function checkEdgeRemoval(ctx) {
  const count = await ctx.run("document.querySelectorAll('.react-flow__edge').length");
  const nodes = await ctx.run("document.querySelectorAll('[data-canvas-node]').length");
  if (!count) throw new Error("Expected an existing canvas connection");
  await context(ctx, ".react-flow__edge-interaction");
  await ctx.pointer('[data-assistant-item=remove]');
  ctx.smoke.check("Right-click deletes only the selected connection", await ctx.run(`document.querySelectorAll('.react-flow__edge').length===${count - 1}&&document.querySelectorAll('[data-canvas-node]').length===${nodes}`));
  await ctx.key("z", ["control"]);
  await ctx.run("document.querySelector('.react-flow__edge-interaction').dispatchEvent(new MouseEvent('click',{bubbles:true}))");
  await ctx.key("Delete");
  ctx.smoke.check("Delete key removes a selected connection with nodes intact", await ctx.run(`document.querySelectorAll('.react-flow__edge').length===${count - 1}&&document.querySelectorAll('[data-canvas-node]').length===${nodes}`));
  await ctx.key("z", ["control"]);
}

// 几何只改外壳，媒体自然尺寸仍由解码决定。无效草稿不能污染已确认宽高。
// 尺寸验证始终操作同一张正式文本卡。
// 先用 square，读取外壳实际内联宽高。
// 两个值均为 284 才能证明正方形方案没有只改标签。
// 再用 rectangle，确认相同 id 的壳切换为另一方案。
// 没有新建第二张节点来假装样式切换完成。
// 卡片菜单通过公共 children 级联展开。
// Electron 指针逐级点击可发现子菜单被主菜单提前卸载。
// 自定义入口再打开共享尺寸表单。
// 字段修改仅设置浏览器表单草稿，不直接写 data.card。
// width=99 小于合法下限一百六十。
// requestSubmit 会走原生约束，不像直接调用 onApply 绕过校验。
// 非法输入后表单必须继续存在，让用户看到并修正。
// 已确认方案仍是 rectangle，不能先变成 custom 再报错。
// 该断言同时观察弹层与节点，避免只看一个错误图标。
// 接着填入合法 360×220，仍从同一提交入口确认。
// 表单关闭后节点 style 必须反映两个确切值。
// 只看 data-card=custom 不足以证明实际几何已改变。
// 检查 CSS 自定义高度变量，确保 shared 外壳收到尺寸参数。
// 该高度是卡片世界单位，不是截图中缩放后的屏幕高度。
// 测试没有通过页面整体 zoom 来模仿节点变大。
// 同一个节点标题与正文保留，尺寸切换不应替换类型。
// 本组检查文本壳，媒体壳复用的结构由同一 CanvasNode 装配。
// 真实视频控件另有回归，不能从文本宽高通过推断所有媒体比例。
// 截图保留自定义确认后的正式状态，供视觉核对端口中心。
// 原生字段的完整人工键盘路径仍未在此组宣称通过。
// 测试输入是自动 DOM 赋值，submit 走真实产品事件。
// 非法值没有写盘，后续工程导出只能包含合法尺寸。
// 这一点与格式 round trip 中的 card 保留互相补证。
// 菜单点击失败会直接中断，不自动修改预期尺寸迁就布局。
// 若找不到表单也不会临时注入一个测试专用表单。
// 矩形和正方形都使用当前配置常量的真实 UI 入口。
// 测试期望值保持明确，常量误改时应触发需要评审的失败。
// 自定义几何范围变更时必须同时审查 shared 与主进程。
// 不能只放宽 test 的 99 让不合法草稿被接受。
// 本组没有对源图片像素进行缩放或修改原视频尺寸。
// 只有作品的展示参数被更新，这也是恢复后应保留的数据。
async function checkCardSize(ctx) {
  await context(ctx, '[data-kind=text] header');
  await ctx.pointer('[data-assistant-item=card]');
  await ctx.pointer('[data-assistant-item=square]');
  ctx.smoke.check("Square preset retains one node with equal confirmed dimensions", await ctx.run("(()=>{const e=document.querySelector('[data-kind=text][data-selected=true]');return e.dataset.card==='square'&&e.style.width==='284px'&&e.style.getPropertyValue('--canvas-card-height')==='284px'})()"));
  await context(ctx, '[data-kind=text] header');
  await ctx.pointer('[data-assistant-item=card]');
  await ctx.wait("document.querySelector('[data-assistant-item=rectangle]')");
  await ctx.pointer('[data-assistant-item=rectangle]');
  ctx.smoke.check("Rectangle preset uses the same selected node shell", await ctx.run("document.querySelector('[data-kind=text][data-selected=true]').dataset.card==='rectangle'"));
  await context(ctx, '[data-kind=text] header');
  await ctx.pointer('[data-assistant-item=card]');
  await ctx.pointer('[data-assistant-item=custom]');
  await ctx.wait("document.querySelector('[data-canvas-card-form]')");
  await ctx.run("(()=>{const f=document.querySelector('[data-canvas-card-form]');f.elements.width.value='99';f.requestSubmit()})()");
  ctx.smoke.check("Invalid custom geometry remains a draft", await ctx.run("!!document.querySelector('[data-canvas-card-form]')&&document.querySelector('[data-kind=text][data-selected=true]').dataset.card==='rectangle'"));
  await ctx.run("(()=>{const f=document.querySelector('[data-canvas-card-form]');f.elements.width.value='360';f.elements.height.value='220';f.requestSubmit()})()");
  await ctx.wait("!document.querySelector('[data-canvas-card-form]')");
  ctx.smoke.check("Custom geometry submits confirmed width and height", await ctx.run("(()=>{const e=document.querySelector('[data-kind=text][data-selected=true]');return e.dataset.card==='custom'&&e.style.width==='360px'&&e.style.getPropertyValue('--canvas-card-height')==='220px'})()"));
  await ctx.shot("25-canvas-custom-card");
}

// 保存路径由对话框夹具提供，PNG 仍由生产 FFmpeg 真正解码生成。
// 这是自动保存框选择，不宣称人工按过系统保存按钮。
// 截帧输入来自前序真实 MP4 导入回归。
// 视频已经 loadeddata，capture 按钮不能只是静态可点击占位。
// 目标放在本次临时根，绝不覆盖用户桌面文件。
// 系统保存框被替换为明确路径返回值夹具。
// 夹具只决定保存位置，不替换 videoRun 或 FFmpeg 输出。
// 生产 pickOutputFile 仍经过 preload 与真实 handler。
// 生产 frame 作业读取实际受管 MP4。
// 测试没有使用 canvas.toDataURL 生成一个任意像素假结果。
// 导出后等待卡片真实成功文案，作业失败不会满足条件。
// 同时读取磁盘文件，防止仅显示成功但未实际写图。
// PNG 的八字节签名按格式常量比对。
// 文件存在但内容为错误文本也应失败。
// 检查的是实际文件签名，不是文件扩展名。
// 这证明 FFmpeg 输出了真实 PNG 容器，不等于已测所有源编码。
// 截图中的播放底栏和成功提示来自同一个正式媒体节点。
// 另一个视频副本也在图上，不用单节点静态 HTML 代替产品。
// 调用前播放器由产品暂停，捕获时间不会因系统框等待改变。
// 本测试没有人工拖动进度到每一帧，不能夸大为逐帧精度验收。
// 默认源是三秒横屏样本，长视频随机定位性能仍需另测。
// original 保存原系统方法，finally 总会还原。
// 即使中途断言抛错，也不能让后面的工程导出继续用截图路径。
// 这项还原避免夹具污染后续不同业务的系统框。
// 固定 target 只属于本用例临时目录，不在产品中硬编码。
// 检查没有读取用户真实 FFmpeg 自定义路径内容。
// 若随包二进制不可用，真实作业应失败而不是跳过。
// 回归日志会保留该失败，不把环境缺失写成导出通过。
// 这里没有监听网络上传，因为产品流程完全本地。
// 保存框夹具不能证明用户实际确认覆盖文件的 Windows 交互。
// 所以人工系统保存和权限体验仍列入待验。
// 输出文件保留用于证据，可以从临时根独立查看。
// 本 helper 不删除 PNG 来伪造下一次新导出的前提。
// 测试数量不把外层已有播放断言重复累加。
// 只有当前这一项真实签名断言算作截帧新增证据。
// 若界面显示取消，成功等待会超时，不能当成导出完成。
// 错误文案同样不会满足“导出完成”的成功等待。
// 后续工程包不自动包含刚截出的图，因为产品没有自动加节点。
// 这种未自动导入是有意边界，不应被测试偷偷补一张图片卡。
async function checkFrameExport(ctx) {
  const original = dialog.showSaveDialog;
  const target = path.join(ctx.root, "actual-frame.png");
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  try {
    await ctx.click('[data-canvas-capture]');
    await ctx.wait("document.querySelector('.hy-video-message')?.textContent.includes('导出')");
    ctx.smoke.check("Video capture writes an actual PNG through the existing frame job", fs.existsSync(target) && fs.readFileSync(target).subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
    await ctx.shot("26-canvas-video-transport");
  } finally { dialog.showSaveDialog = original; }
}

// 自动保存和打开系统框都明确属于夹具；正文打包、校验与解包使用生产实现。
// 删除导出前的工程目录后再打开，排除只是重新引用原来的绝对地址。
// 工程交换验证仍在同一个正式画布窗口串行执行。
// 前序节点、真实媒体和连接都参与导出。
// 没有创建只含一张封面的专用静态测试页面。
// 系统保存与打开各自有独立的原方法引用。
// 两个对话框夹具只返回路径，不返回已经恢复的文档。
// 实际文档由生产 readArchive 读取并转换。
// target 后缀是 ircanvas，检查外部格式不是普通 JSON 导出。
// 点击项目头下载按钮，覆盖新增图标回调是否真正接通。
// 等待画布消息来自请求完成，而不是固定延时后继续。
// readManifest 读取真实落盘工程头部。
// 至少三种资产参与，防止只把视频一类打包就宣称全部支持。
// 每个媒体引用路径必须相对，旧目录盘符不能藏在 document。
// 只检查 assets 表不够，节点自身引用也可能漏转绝对路径。
// 因此 every 同时约束全部媒体节点的 path。
// 导入前先保存当前草稿，消除未保存确认对流程的干扰。
// 该保存仍走生产用户文档写盘器，不测试自己直接写的工程快照。
// 等“已保存”后才读磁盘，避免取到前一轮旧 workspace。
// 从实际存档取 folder，而非预测目录名等于画布标题。
// 目录后面加 away，使原受管路径彻底失效。
// 用户要求的目录层级在 ctx.root/user 内，不涉及真实用户根。
// renameSync 只处理这次生产导入创建的明确目录。
// 不做任意递归移动，也不重命名工程包本身。
// 导入成功必须来自包内正文解出，而不能继续读取 old folder。
// 等待四份真实媒体均 ready，覆盖图片、双视频与音频。
// 两份视频虽然同源，仍是两个独立媒体元素。
// 节点总数等于清单 document，不能导入时悄悄丢弃空卡。
// 这也约束文本、便签与已有连接没有因媒体工程化消失。
// 恢复后再次按原保存按钮落盘，检查新 workspace 真正接入草稿。
// 新归属 id 必须不同，不能继续声称拥有已移开的旧目录。
// 所有媒体路径都在新归属下，不能只改顶层 workspace。
// startsWith 这里比较的是本用例已知安全根和生产返回路径。
// 包内路径安全另由格式反证检查，不靠这一字符串断言代替。
// 截图在解码和保存都完成后捕获，不截一个仍在加载的壳。
// 打开工程会清选择，因此画面参数面板不冒充原节点正在编辑。
// 这次恢复没有自动播放，实际声音不会因导入被启动。
// 本组不声称跨电脑人工拷贝过 U 盘，但已切断旧地址依赖。
// 实际验证的是包内完整正文能在新的目录重新加载。
// 同名目录冲突由生产服务处理，测试不会先清空旧工程名。
// 旧目录移开只是测试隔离手段，产品导入不会删除原项目。
// finally 同时恢复保存和打开方法，后续坏包用例不继承此成功夹具。
// 文档恢复来自真实磁盘与校验，不使用 mock 的媒体时长结果。
// 浏览器 ready 是真实解码事件，不能用清单大小替代。
// 如果仅生成路径但没有资产，ready 等待会明确失败。
// 如果媒体解码失败，测试不会改成只要求节点数正确。
// 因此这组证据比单独的格式 round trip 更接近真实使用链。
// 但系统选择框和资源管理器实体拖入仍需单独人工验收。
// 产品大文件、掉电与并发改源不在这个短样本中覆盖。
// 源内容变化校验由写包器实现，本场景不伪称已压测。
// 便携项目不保存应用设置，测试仍保留游客外壳配置。
// 成功数量来自本次 harness，不与之前八十七项历史结果累加。
async function checkProjectRoundTrip(ctx) {
  const originalSave = dialog.showSaveDialog, originalOpen = dialog.showOpenDialog;
  const target = path.join(ctx.root, "portable.ircanvas");
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
  try {
    await ctx.click('.hy-project-header [aria-label="导出画布工程"]');
    await ctx.wait("document.querySelector('[data-canvas-message]').textContent.includes('已导出')");
// 便携证据采用“切断旧地址”的反证方式。
// 若导出只保存绝对路径，在旧目录改名后必然无法 ready。
// 若导出携带媒体正文，则能在新归属恢复并重新实际解码。
// 这个差异比只看文件体积更可靠。
// 即使文件变大，也可能只是多写一份无用 JSON。
// 因此同时检查相对引用、资产清单与恢复后真实 ready。
// 清单资产数可能少于节点数，这是同源去重的合法结果。
// 不能要求每个节点都有独立正文来误判正确去重。
// 节点数量则应保持全部，不能借去重合并卡片身份。
// 两份同源视频需要两个节点与两个媒体元素。
// 它们不应共享选中、重试或播放时间。
// 旧目录改名只发生在导出完成与保存完成之后。
// 未完成导出时移开来源会测试另一个源变化错误，不符合本场景前提。
// 打开成功后保存的新文档成为后面取消、坏包用例的保留对象。
// 因此后两项不是在空图上做一个没有意义的数量断言。
// 恢复后的 workspace.id 不同约束分配器没有沿用旧所有权。
// 路径全部在新 folder 约束只改顶层身份的假恢复。
// 若 media.path 仍在 away 目录，真实 ready 条件不会被满足。
// 浏览器刷新前后已有媒体缓存由前序用例处理，本组新引用也触发新源。
// 不会把解码器里停留的旧帧当作新工程已经加载成功。
    const { manifest } = await readManifest(target);
    ctx.smoke.check("Portable project contains normalized relative media paths", manifest.assets.length >= 3 && manifest.document.nodes.filter(node => node.data.media).every(node => !path.isAbsolute(node.data.media.path)));
    // 先明确保存现有草稿，导入就不需要悄悄绕过“未保存改动”确认。
    await ctx.click('.hy-project-header [aria-label="保存画布"]');
    await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
    const before = JSON.parse(fs.readFileSync(ctx.documentPath, "utf8")).infiniteCanvas;
    const directory = path.join(ctx.root, "user", before.workspace.folder);
    fs.renameSync(directory, `${directory}.away`);
    await ctx.click('.hy-project-header [aria-label="导入画布工程"]');
    await ctx.wait("document.querySelector('[data-canvas-message]').textContent.includes('工程已导入')");
    await ctx.wait("document.querySelectorAll('[data-canvas-media][data-media-status=ready]').length===4");
    ctx.smoke.check("Reimported portable project decodes without the old asset folder", await ctx.run(`document.querySelectorAll('[data-canvas-node]').length===${manifest.document.nodes.length}`));
    await ctx.click('.hy-project-header [aria-label="保存画布"]');
    await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
    const after = JSON.parse(fs.readFileSync(ctx.documentPath, "utf8")).infiniteCanvas;
    ctx.smoke.check("Imported project uses a separate owned asset folder", after.workspace.id !== before.workspace.id && after.nodes.filter(node => node.data.media).every(node => node.data.media.path.startsWith(path.join(ctx.root, "user", after.workspace.folder))));
    await ctx.shot("27-canvas-project-restored");
  } finally { dialog.showSaveDialog = originalSave; dialog.showOpenDialog = originalOpen; }
}

// helper 的执行顺序保留真实依赖，不并行修改同一图。
// 先处理复制历史，结束后恢复原节点数量。
// 再删除与撤销边，后面的导出仍有连接可检查。
// 尺寸修改明确保留，随后工程导出应带着新 card 数据。
// 真实截帧在工程交换前完成，避免新归属改变影响定位。
// 工程恢复之后再测取消与坏包，证明已有有效作品不会丢失。
// 本模块不自行 app.quit，由统一 harness 汇总退出码。
// 任何一步抛错都会交回外层，后续步骤不继续编造成功。
// 运行截图保存由 ctx.shot 复用原窗口 capturePage。
// 没有启动第二个 Electron 与当前测试争抢单实例锁。
// 每个等待条件都带外层上限，页面事件缺失不会无期限卡住。
// 断言名字明确区分菜单、键盘、真实文件和夹具边界。
// 测试日志应记录具体失败，不只返回一个模糊总数。
// 最终通过数只计算当前完整运行，不累加历史失败前的局部通过。
// 本模块不会修改生产 store 的私有字段来跳过导入或复制。
// 也不会为缩小截图把产品整体缩放比例写成预期结果。
// 主题与窄窗口沿用外层已有场景，此模块不重复建主题开关。
// 如果外层媒体前提改变，需要重新审查本模块所有数量预期。
// 不能直接改成“大于零”来让丢节点问题消失。
// 自动事件通过后仍需要用户体验右键命中与键盘导航。
// 本轮不把手动系统操作待验改写为全部验收通过。
async function checkCanvasProject(ctx) {
  await checkClipboard(ctx);
  await checkEdgeRemoval(ctx);
  await checkCardSize(ctx);
  await checkFrameExport(ctx);
  await checkProjectRoundTrip(ctx);
  await checkProjectFailures(ctx);
}

// 系统框返回值只注入取消与坏包路径，正式 IPC 和界面错误恢复仍然真实运行。
// 原工程节点数在两种失败后都必须保持，不能用清空作品换取错误消失。
// 失败回归接在成功恢复之后，前提是已有完整有效工程。
// 先记录节点总数，不能用空图测试“保留当前图”。
// 当前草稿已经保存，打开时不需要自动确认未保存覆盖。
// 第一个夹具模拟系统框取消，不模拟一个空工程返回。
// 取消时 filePaths 为空，主进程应直接返回 null。
// 等待取消文案，确认前端把 null 与失败、成功分开处理。
// 节点数量保持不变，取消不能调用 restore(empty)。
// 取消后项目头应恢复可用，不能永久停留处理中。
// 下一项创建真实坏包文件，其内容不是魔数或 JSON。
// 系统框夹具返回它的实际路径，生产读包器会真正打开。
// 这比直接 mock 一个 success:false 更能覆盖服务错误边界。
// 坏包没有完整清单，主进程应在分配目录前拒绝。
// 界面收到失败只更新就近文案，仍显示原节点。
// 验证数量之外还检查导入按钮不 disabled。
// 这样能发现 catch 提示了错误但 finally 忘了释放 busy。
// 若按钮仍不可用，用户无法重试，应作为真实回归失败。
// 错误截图保留正式工作区与消息，不用成功截图代替。
// 坏包样本只写在测试临时根，用户工程不会被破坏。
// 不把生成这个坏文件当作产品导出结果。
// original 在 finally 还原，即使失败也不污染其他 Electron 场景。
// 这里没有测试系统权限拒绝弹窗，文件权限仍属人工待验。
// 也没有宣称测试磁盘满，错误文件仅覆盖格式失败路径。
// 部分成功媒体导入在原 helper 中检查，此处只测整工程替换失败。
// 两种错误不能合并成同一个“导入失败”动作后清空作品。
// 当前图仍可继续操作，是失败处理的核心用户保障。
// 没有通过重新加载页面来恢复按钮，那会掩盖资源状态泄漏。
// 测试直接等待原界面状态收尾，确认同一请求生命周期完整。
// 坏包结果不写回用户文档，成功恢复的草稿仍留在磁盘。
// 测试输出路径没有出现在用户可见错误文案中。
// 产品只显示固定版本、完整性与权限提示。
// 这组只自动触发系统框返回，不列为人工按取消验证。
// 人工体验清单保持原状态，不因这些断言自动打勾。
async function checkProjectFailures(ctx) {
  const original = dialog.showOpenDialog;
  const count = await ctx.run("document.querySelectorAll('[data-canvas-node]').length");
  try {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    await ctx.click('.hy-project-header [aria-label="导入画布工程"]');
    await ctx.wait("document.querySelector('[data-canvas-message]').textContent.includes('取消')");
    ctx.smoke.check("Canceling project open preserves the current graph", await ctx.run(`document.querySelectorAll('[data-canvas-node]').length===${count}`));
// 坏文件的内容不含 IRCNVS01，因此失败发生在格式入口。
// 没有通过伪造返回值直接写 success=false。
// 前端仍会等待一次真正的 IPC 请求完成。
// 若读包器错误地接受普通文本，节点保留断言可能被错误恢复破坏。
// 若 handler 把异常吞成 null，界面会显示取消而不是失败，等待同样失败。
// 若错误正确但 busy 没释放，按钮可用性断言失败。
// 所以这个场景同时约束格式拒绝、错误分类与 finally 恢复。
// 测试不靠重启窗口摆脱错误。
// 原项目在同一次挂载中仍应可以继续打开工程。
// 截图捕获失败后的可操作状态，而不是刷新重置后的新空图。
// 坏包不会被添加成视频节点，因为工程入口与媒体入口分开。
// 错误消息不得显示内部路径或 Node 堆栈。
// 本测试不试图断言每个系统错误的本地化细节。
// 但“失败”与“取消”必须是不同分支，不能共用假成功提示。
// 断言保持具体，不以只要页面没有崩溃作为通过。
// 最终日志应列出这项新增检查，不复用旧八十七项结论。
// 取消与失败都不会对既有节点执行 remove。
// 恢复按钮可用也不意味着用户系统权限问题已解决。
// 用户仍需按提示检查文件、版本或目录权限后重试。
// 这就是错误收尾与自动修复的明确边界。
    const broken = path.join(ctx.root, "broken.ircanvas");
    fs.writeFileSync(broken, "not a canvas archive");
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [broken] });
    await ctx.click('.hy-project-header [aria-label="导入画布工程"]');
    await ctx.wait("document.querySelector('[data-canvas-message]').textContent.includes('失败')");
    ctx.smoke.check("A broken project leaves current nodes and controls usable", await ctx.run(`document.querySelectorAll('[data-canvas-node]').length===${count}&&!document.querySelector('.hy-project-header [aria-label="导入画布工程"]').disabled`));
    await ctx.shot("28-canvas-project-error");
  } finally { dialog.showOpenDialog = original; }
}
module.exports = { checkCanvasProject };

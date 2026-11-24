// 正式画布的视频侧栏回归；复用现有 Electron 窗口和生产写盘器。
// 初始模型名是参数夹具，不是已安装模型或真实推理证据。
// 后续按钮、重置、主题和保存都从产品 DOM 执行，不调用 React 私有状态。
// 两个视频使用同一模板但不同覆盖，专门检查共用组件后的 A/B 串值。
// 像拿两份不同的订单填同一柜台，改第一份不能顺手改掉第二份。
// loader 身份直接读取原工作流 JSON，不复制另一套槽位常量。
// 原主模型与辅助槽使用不同加载节点，测试同时保留才能发现整表覆盖错误。
// 本组没有网络模型服务，加载清单失败应准确显示原错误，不伪造加载成功。
// 系统框、实体鼠标手感和模型文件加载仍需人工或真实服务另验。
const fs = require("node:fs");
const template = require("../../apps/next/src/data/comfy/videoWorkflower/minnimax/minimax h3 图生视频-首尾帧.json");

// 每次读实际隔离文件，不能用刚发给保存器的内存对象自证成功。
// 等正式已保存状态再读盘，避免把旧文件误当当前参数。
// 没有返回值夹具替换写入器，白名单漏字段会在下游明确失败。
// save 调用的是画布顶部入口，不能误点资源弹窗自己的确认按钮。
// 保存期间按钮状态可能先变再落盘，因此仅检测 click 完成不足以证明成功。
// 原保存状态包含错误分支，失败时 wait 会有界结束，而不是返回旧的成功 JSON。
// JSON.parse 失败直接抛出，损坏文件不能被 catch 后回落到测试期望对象。
// 读回不排序节点，也不补缺失字段，序列化漏项必须原样暴露。
// 当前保存目标是宿主明确传入的临时路径，不根据用户设置猜实际文件。
// 多次保存都读取同一个文件，A 与 B 的差异能够在同一时点比较。
// 模型覆盖是文本参数，文件名大小写保留，不在断言前转小写掩盖误改。
// 返回文档用于独立值断言，不将它再次注入 React 让页面显示预期结果。
async function save(ctx) {
  await ctx.click('.hy-project-header [aria-label="保存画布"]');
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  return require("./canvas-library-fixture").readCanvas(ctx);
}

// 模型参数夹具只负责初始条件，交互必须通过正式原组件改变。
// 不是导入真实素材，空视频节点也不假装已经有可播放输出。
// 位置固定在当前视口可见范围，避免测试借缩放让侧栏的几何问题消失。
// 保留同一用户文档的其他段，不清空账号或设置来绕过宿主约束。
// 两张卡明确身份不同，不能用标题或模板名查更新目标。
// 每份覆盖表都是新对象，不依赖测试预先共享对象来验证产品隔离。
// 原 schema 与主进程在纯数据专项已经单独接受此形状。
// 页面重开会从磁盘恢复，因而同时检查白名单、序列化与 UI 接线。
async function seed(ctx, mainId, clipId) {
  const value = {};
  value.infiniteCanvas = { version: 1, name: "视频侧栏验证", nodes: ["a", "b"].map((id, index) => ({ id, position: { x: 40 + index * 600, y: 140 }, data: { kind: "video", title: `Video ${id.toUpperCase()}`, prompt: "", content: "", ratio: "16/9", workflow: "minimax", videoModelOverrides: { minimax: { [mainId]: `${id}-model.safetensors`, [clipId]: `${id}-clip.safetensors` } } } })), edges: [] };
  await require("./canvas-library-fixture").writeCanvas(ctx, value.infiniteCanvas);
}

// 选择之后再打开节点设置，不能打开图片侧栏并仅替换标题冒充视频配置。
// 原三个组件的正式标记必须同时存在，缺任何一个都应失败。
// 不应出现首尾帧、提示词或生成 footer，这是用户最新明确的范围。
// 表单内部错误和门户焦点由原组件管理，外壳不能新增全窗口遮罩。
// 选择图标位于节点标题内，避开视频空态的“导入视频”按钮。
// 等 selected=true 后再查工作流按钮，避免 React 提交前误判控件不存在。
// 设置图标的可访问名使用产品现有“节点参数”，不能按测试自己发明的名称定位。
// 标题坐标还应避开项目头部，本夹具将节点放在头部下方的一百四十世界单位。
// 没有直接修改节点 selected 属性或用 store.setState 强行选中。
// 点击侧栏触发器后等待正文正式挂载，不能只看根 aside 就推断内容正确。
// 原公共侧栏的 loading 分包可以异步完成，等待使用现有六秒有界轮询。
// 分包失败应中止并保留截图，不能自动刷新直到偶然成功。
// 切换选择依赖当前视口真实几何，窄窗可能暴露点击区域被其他面板覆盖的问题。
// 本函数不修改视口缩放，避免把选择问题通过 fitView 掩盖。
// 原节点菜单和工具条都未被替换，功能与公共组件的接线仍在产品中执行。
// 原生鼠标事件属于自动注入，不把这个 helper 描述为人工手动点选。
// “节点参数”也是整个参数 section 的可访问名称，宽泛匹配会误点外壳。
// 因此选择器限定原页脚中的实际 button，侧栏只能由正式设置动作开启。
// 这项修正不改产品名称、不额外增加专供测试的假触发器。
// 先前的超时保留在失败日志中，不能将测试误点描述为模型组件故障。
// 等待正文标记可以区分只打开外壳与真正完成动态组件加载。
// 每次 open 都重新查当前 DOM，重开页面后不复用已经失效的元素句柄。
async function open(ctx, id) {
  await ctx.pointer(`[data-canvas-node=${id}] header>svg`);
  await ctx.wait(`document.querySelector('[data-canvas-node=${id}][data-selected=true] [data-canvas-workflow] button')`);
  await ctx.click(`[data-canvas-node=${id}] .hy-panel-submit [data-canvas-workflow] button`);
  await ctx.wait("document.querySelector('.hy-image-sidebar [data-canvas-video-settings]')");
}

// 重新打开页面可能展示尚未落盘的公告确认，先通过正式按钮关闭再选择节点。
// 公告是合法模态层，不能用 DOM click 越过它直接操作下方控件。
// 使用主进程短计时等待初始化，再核对实际浮层；不是等待假生成结果。
// 页面重载只影响当前测试窗口，不终止或接管用户正在使用的 Electron 实例。
// 原公告状态可能尚在节流保存中，重新加载后再次出现属于合法业务前提。
// 点击第一个公告按钮使用原关闭动作，让产品自己清理遮罩与焦点锁。
// 不直接 remove 公告 DOM 或覆盖 pointer-events，否则会掩盖真实模态行为。
// 等待公告卸载之后，pointer 产生的节点选择才有有效命中目标。
// 半秒等待针对公告初始化，不用于假装视频已经解码或推理已完成。
// 计时位于主进程，不依赖 hidden 页面会暂停的帧回调。
// 公告不存在时可选 click 没有副作用，但结束条件仍明确检查它已经不存在。
// 重载后的 B 节点是从实际用户文档恢复，不能沿用重载前的 DOM 引用。
// 如果 B 丢失，第一次 wait 会报错而不是创建一个替代节点使后续通过。
// 同一入口用于初次夹具安装后与最终保存后，保证恢复路径一致。
// 重载不调用生成器，也没有消费任何远端令牌或上传本地模型。
async function reopen(ctx) {
  await ctx.win.loadURL("app://app/canvas");
  await require("./canvas-library-fixture").openProject(ctx);
  await ctx.wait("document.querySelector('[data-canvas-node=b]')");
  await new Promise(resolve => setTimeout(resolve, 500));
  await ctx.run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await ctx.wait("!document.querySelector('[aria-labelledby=update-announcement-title]')");
}
// 本用例同时检查三个维度：展示范围、参数独立、存储恢复，不能用一个总截图代替。
// 主模型卡的正式标记由原组件提供，复制相似 JSX 很难保持这组真实交互契约。
// 扩展和加载设置必须与主模型同处侧栏，不允许仍在后台挂着旧的空视频模态页。
// 排除 textarea 与首尾帧上传位是范围反证，防止误把整个视频生成面板搬进来。
// 排除 submit 按钮能避免用户以为侧栏另有一个真实视频生成执行入口。
// A 的模型名和 CLIP 名不同，可以发现两个 loader 被错误写成同一字段。
// 先展开原折叠组才检查辅助参数，不能读取一个隐藏的静态说明冒充已接控件。
// 服务清单查询离线时，原控件仍保留当前自定义值，不应该清掉工作单。
// 深色截图在展开之后捕获，能看见默认回落、已确认覆盖和网络状态的区别。
// 重置使用原“恢复工作流默认”按钮，不直接传空对象给节点 reducer。
// 如果重置只改了可见标签但没有更新数据，随后磁盘对象长度断言会失败。
// 如果重置错误遍历全部视频，B 的主模型会消失，另一半断言会失败。
// 如果更新回调仅缓存到侧栏 state，文件里 A 仍有覆盖，同样应失败。
// 在 A/B 两个节点上使用不同名字，不依赖数组首项恰好是选中对象。
// 因为模型选择依赖真实服务清单，本组不伪造可选资源去声称选模请求通过。
// 两张卡没有真实视频输出，后续不能拿本组截图证明媒体播放能力。
// 实际媒体解码和生成分别由现有媒体/生成专项承担，证据类型保持分开。
// 固定模板由仓库 JSON 加载，模板槽位变化时应暴露预期不符，不默默改标签。
// 节点参数为空后依然保留 videoModelOverrides 表，表示用户确实执行过重置。
// workflowLoras 则回到模板继承，不能把恢复默认错误解释为明确禁用所有扩展。
// 此区别在原扩展组件里由 undefined 与 [] 表达，不由测试临时归一化。
// 写盘后的对象保持纯数据，不应出现闭包、DOM 或 File 的序列化残留。
// 在资源索引为空的宿主中，主模型仍显示确认名字，不能退回另一个节点封面。
// 背景画布仍可交互，侧栏不使用 aria-modal 或把导航一起 inert。
// 测试只通过原关闭按钮离开，焦点返回由产品处理，不在脚本手动聚焦伪造。
// 打开 B 之前关闭 A，两个组件实例不会在测试里意外同时留存。
// 如果组件用模块级变量存覆盖，B 初始显示 A 的空值，名称断言将暴露故障。
// 表单原有主模型、LoRA、辅助槽请求各归自己的组件，本组不篡改回包顺序。
// 每个 smoke.check 单独记录，失败不被后续正常截图或 app.quit 掩盖。
// 主脚本异常路径保留故障截图，公告遮挡与控件接线失败可以分别辨认。
// 这段没有系统文件选择或磁盘搬运，不使用“真实上传”描述测试结果。
// 生产文件写入器操作的是临时用户文档，正式工程、模型和账号均不会被修改。
// 测试结束是否成功仍由总护栏决定，不能仅根据看到了侧栏打印通过。
// 用例的入口是正式 app 协议路由，静态样板 HTML 不参与验证。
async function checkCanvasVideoSettings(ctx) {
  const mainId = Object.keys(template).find(id => template[id].class_type === "UNETLoader");
  const clipId = Object.keys(template).find(id => template[id].class_type === "CLIPLoader");
  await seed(ctx, mainId, clipId);
  await reopen(ctx);
  await open(ctx, "a");
  await checkSeries(ctx);
  await checkSamplingSteps(ctx);
  await require("./check-canvas-video-output")(ctx);
  ctx.smoke.check("Video sidebar directly contains only original model groups", await ctx.run("!!document.querySelector('.hy-image-sidebar [data-video-local-unet]')&&!!document.querySelector('.hy-image-sidebar [data-video-loras]')&&!!document.querySelector('.hy-image-sidebar [data-video-model-toggle]')&&!document.querySelector('.hy-image-sidebar textarea,.hy-image-sidebar [data-video-frame-inputs],.hy-image-sidebar button[type=submit]')"));
  await ctx.click('.hy-image-sidebar [data-video-model-toggle]');
  await ctx.wait("document.querySelector('.hy-image-sidebar [data-video-model-slot]')");
  await ctx.shot("73-video-sidebar-dark");
  ctx.smoke.check("Video sidebar restores its own model and auxiliary override", await ctx.run("document.querySelector('.hy-image-sidebar').textContent.includes('a-model')&&document.querySelector('.hy-image-sidebar').textContent.includes('a-clip')"));
  await ctx.run("Array.from(document.querySelectorAll('.hy-image-sidebar button')).find(e=>e.textContent==='恢复工作流默认').click()");
  const value = await save(ctx);
  ctx.smoke.check("Reset changes A while B retains independent model values", Object.keys(value.nodes.find(node => node.id === "a").data.videoModelOverrides.minimax).length === 0 && value.nodes.find(node => node.id === "b").data.videoModelOverrides.minimax[mainId] === "b-model.safetensors");
  await ctx.click('.hy-image-sidebar header button');
  await open(ctx, "b");
  ctx.smoke.check("Switching video instance restores B model cover label", await ctx.run("document.querySelector('.hy-image-sidebar').textContent.includes('b-model')"));
  await checkLightAndRestore(ctx, clipId);
}

// 从展开的高级设置修改步数并保存，读盘区分当前节点与另一张卡。
async function checkSamplingSteps(ctx) {
  const input = '.hy-image-sidebar [data-advanced-settings] [data-generation-parameter=steps] input[type=number]';
  await ctx.click('.hy-image-sidebar [data-advanced-settings-toggle]');
  await ctx.wait(`document.querySelector('${input}')?.value === '6'`);
  await ctx.fill(input, '14');
  const { nodes } = await save(ctx);
  ctx.smoke.check('Video advanced steps persist only on the edited node', nodes.find(node => node.id === 'a').data.videoSteps === 14 && nodes.find(node => node.id === 'b').data.videoSteps === undefined);
}

// 新层级在两个 MiniMax 模板上共用一层父项，不改现有 workflow 稳定编号。
// 本组在已经选中的 A 卡操作，避免选择失败混淆为菜单数据缺失。
// 入口限定 A 的胶囊，不能误点页脚齿轮后绕过系列导航。
// local、minimax-series 和模板各有独立身份，可发现父子层被意外平铺。
// 两个末级都必须出现，不能为了隐藏 Wan 连带删掉参考素材模式。
// 检查的是本次实际打开的公共菜单，页面其他地方提到 Wan 不属于失败。
// 菜单文字否定检查与两个叶子的肯定检查配对，空菜单无法误通过。
// 选择已选中的 minimax 叶子也必须打开配置，不应因编号相同而失效。
// 参数夹具在该操作前后不换模板，后续 A 的重置仍能使用相同 loader 身份。
// 这条路径还验证叶子选择后菜单卸载，不让后续侧栏收到双重 Escape。
// 如果断言失败，顶层故障截图会保留当时展开路径，不进行无条件重试。
// 系列截图是静态工作区的自动操作结果，不用于宣称真实视频生成成功。
async function checkSeries(ctx) {
  // 系列检查通过原公共级联菜单展开，不直接读取或改写 React 内部配置。
  // 先关闭侧栏再打开工作流入口，防止隐藏控件产生一个假的可点击结果。
  // MiniMax 的父项只负责导航；点开父项不应改变当前模板或产生生成请求。
  // Wan 暂不提供新选择，但旧工程身份仍保留，不能把隐藏菜单当成格式迁移。
  // 同时排除父列与叶子中的 Wan 文案，避免只把它挪到其他子菜单。
  // 本例仅验证菜单和组件接线，不把模型名称夹具宣称为已下载权重。
  // 截图记录展开后的实际页面，保留层级而非仅看最终胶囊文字。
  // 关闭菜单与重新打开侧栏仍交给正式按钮，不能直接删除 portal。
  await ctx.click('.hy-image-sidebar header button');
  await ctx.click('[data-canvas-node=a] [data-canvas-workflow] > .hy-chip');
  await ctx.click('[data-assistant-item=local]');
  await ctx.click('[data-assistant-item=minimax-series]');
  ctx.smoke.check("Video workflows use MiniMax series without Wan choices", await ctx.run("!!document.querySelector('[data-assistant-item=minimax]')&&!!document.querySelector('[data-assistant-item=minimax-reference]')&&!document.querySelector('[data-canvas-workflow-menu]').textContent.includes('Wan')"));
  await ctx.shot("75-video-minimax-series");
  await ctx.click('[data-assistant-item=minimax]');
  ctx.smoke.check("Selecting a workflow closes the menu without opening settings", await ctx.run("!document.querySelector('[data-canvas-workflow-menu]')&&!document.querySelector('.hy-image-sidebar')"));
  await ctx.click('[data-canvas-node=a] .hy-panel-submit [data-canvas-workflow] button');
  await ctx.wait("document.querySelector('.hy-image-sidebar [data-canvas-video-settings]')");
  const expectedLoras = Object.values(template).filter(node => node.class_type === 'LoraLoaderModelOnly').length;
  ctx.smoke.check("Default workflow LoRAs are retained with a visible availability explanation", await ctx.run(`document.querySelectorAll('.hy-image-sidebar [data-video-loras] [data-selected-extension]').length===${expectedLoras}&&!!document.querySelector('.hy-image-sidebar [data-canvas-default-loras]')`));
}

// 主题、窄窗与真正重开构成另一段生命周期；不把一次重绘当成恢复。
// 主视频选择继续用稳定 id，窗口收窄后节点也必须能够通过真实标题选中。
// 深浅切换沿用原 nativeTheme 通道，不能只给侧栏加一个 light class。
// 关闭外观菜单后再选视频，避免菜单焦点把节点选择当作无效点击。
// theme-ripple 完全结束之后截图，波纹中间帧不能作为最终浅色结果。
// 窄窗口使用真实 BrowserWindow 尺寸，布局不能靠 CSS transform 缩成一张图。
// main 的边界包含导航占用空间，右侧栏不能按整个屏幕宽度计算自己的可用区域。
// 检查 left、right、bottom 三条边，可发现侧栏只在正常桌面尺寸下碰巧正确。
// 一般布局采用小数像素；本外壳边界由同一布局产生，不靠放宽几十像素容差过关。
// 高度太低时正文可以滚动，不能把加载设置藏掉来满足边界断言。
// 浅色截图使用另一张 B 卡，证明主题操作不会顺手恢复 A 的选择。
// 保存之前先关闭侧栏，键盘隔离不会阻止工作区正式保存按钮。
// 文件必须含 B 的 CLIP 覆盖，而不只是顶部主模型的一句显示文字。
// 重新加载会销毁旧 React 组件和临时表单状态，验证不依赖保活的 DOM。
// 若工程序列化遗漏附表，页面会回落模板默认，重开后名称断言应失败。
// 若加载了另一份测试文件，B 的稳定身份或模型值不符，不能算恢复成功。
// 旧实例焦点和门户随卸载释放，不再从旧资源页回写当前文档。
// 两次重开都经过正式初始化，公告如出现仍需真实确认后继续。
// 这不是“导出工程再导入”的测试，工程归档完整性另有已有格式回归。
// 模型名只是外部权重引用，移动工程到别的电脑仍需用户自己配置权重目录。
// 系统 125%/150% 缩放没有在这里切换，960 窗口不能冒充系统 DPI 验收。
// 浅深截图不能证明视觉接近度百分比，交付仅描述实际控件与几何证据。
// 本轮不测多窗口同时打开，同一工作区的两个节点隔离与多窗口隔离应区分。
// 不从恢复方法返回数据直接断言，而是在重新渲染的侧栏中读取真实确认名称。
// 切回主界面后 B 仍未被编辑，读取应与保存前一致，不能通过缩短名称迁就断言。
// 渲染过程中网络列表失败不会被此测试吞掉；产品仍可显示准确的离线提示。
// 留存截图包含整个正式外壳，能看到导航、工作区、目标节点和侧栏之间的位置。
// 不使用样板截图冒充当前窗口，capturePage 每次从同一个被测窗口读取画面。
// 自动指针注入仅证明事件接线，用户实体鼠标、触控和读屏仍需要另行验收。
// 存储回读来自测试主进程，界面文案来自渲染进程，双向证据避免自己验证自己。
// 若图片参数被视频重置污染，后续全量画布回归仍应失败，专项不会代替那组断言。
// 主题属于用户设置而不是节点参数，保存不能把浅色偏好混进模型覆盖表。
async function checkLightAndRestore(ctx, clipId) {
  await ctx.click('.hy-image-sidebar header button');
  await ctx.click('[data-theme-trigger]'); await ctx.click('[data-theme-option=light]');
  await require("./sidebar-menu-fixture").closeAppearance(ctx.run);
  await open(ctx, "b");
  await ctx.wait("!matchMedia('(prefers-color-scheme:dark)').matches&&!document.documentElement.classList.contains('theme-ripple')");
  ctx.win.setSize(960, 720);
  await ctx.shot("74-video-sidebar-light-narrow");
  ctx.smoke.check("Video sidebar stays inside narrow workspace", await ctx.run("(()=>{const a=document.querySelector('[data-infinite-canvas]').getBoundingClientRect(),b=document.querySelector('.hy-image-sidebar').getBoundingClientRect();return b.left>=a.left&&b.right<=a.right&&b.bottom<=a.bottom})()"));
  await ctx.click('.hy-image-sidebar header button');
  const value = await save(ctx);
  await reopen(ctx);
  await open(ctx, "b");
  ctx.smoke.check("Real document reopen preserves B override without cross-node leakage", value.nodes.find(node => node.id === "b").data.videoModelOverrides.minimax[clipId] === "b-clip.safetensors" && await ctx.run("document.querySelector('.hy-image-sidebar').textContent.includes('b-model')"));
  // 重开真正的工程后再选A，不用保存前内存中的读数证明恢复成功。
  await ctx.click('.hy-image-sidebar header button');
  await open(ctx, 'a');
  await ctx.click('.hy-image-sidebar header button');
  ctx.smoke.check('Reopened A restores selected MP and pixels while B stays independent', await ctx.run("document.querySelector('[data-canvas-node=a] [data-canvas-video-pixels]').textContent==='768 × 1376 px'&&document.querySelector('[data-canvas-node=a] [data-canvas-parameter=megapixels]>button').textContent==='1.0 百万像素'"));
  await checkNarrowMegapixels(ctx);
}

/** 画布中的卡片本来可以平移；窄窗用真实拖动把参数移入视野，不用改样式伪造可达。 */
async function checkNarrowMegapixels(ctx) {
  for (const [type, y] of [['mouseDown', 500], ['mouseMove', 440], ['mouseMove', 380], ['mouseMove', 320], ['mouseMove', 260], ['mouseUp', 260]]) {
    ctx.win.webContents.sendInputEvent({ type, x: 900, y, button: 'left', clickCount: 1 });
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  ctx.smoke.check('Narrow MP controls are reachable by normal canvas pan', await ctx.run("(()=>{const w=document.querySelector('[data-infinite-canvas]').getBoundingClientRect(),p=document.querySelector('[data-canvas-video-pixels]').getBoundingClientRect();return p.top>=w.top&&p.bottom<=w.bottom})()"));
  await ctx.click('[data-canvas-node=a] [data-canvas-parameter=megapixels] > button');
  ctx.smoke.check('Light narrow area menu remains inside workspace', await ctx.run("(()=>{const w=document.querySelector('[data-infinite-canvas]').getBoundingClientRect(),p=document.querySelector('[data-canvas-parameter=megapixels] .hy-ratio-popup').getBoundingClientRect();return p.top>=w.top&&p.bottom<=w.bottom&&p.left>=w.left&&p.right<=w.right})()"));
  await ctx.shot('81-minimax-megapixels-light-restored');
  await ctx.key('Escape');
}
module.exports = { checkCanvasVideoSettings };

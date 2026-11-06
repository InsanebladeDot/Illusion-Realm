/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * protocol：使用客户端的 app:// 与 localfile:// 协议实现。
 * window.handlers：窗口和主题 IPC 隶属 core 的系统交互边界。
 * window-chrome：复用同一份窗口装饰配置与启动参数。
 * index：窗口加载迁移后的真实 preload 桥接文件。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * protocol：Next 静态资源含绝对 URL，必须保持应用同源加载。
 * window.handlers：handler 仍通过统一结果封装注册，不因移动改变参数和错误码。
 * window-chrome：窗口样式和传给 preload 的标记必须配套，不能各自猜测当前装饰模式。
 * index：contextIsolation 保持启用，CommonJS 本地依赖仍需要 sandbox 为 false。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 */
/** Real renderer layout and input regression with local IPC fixtures; no account server or model runs. */
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { app, BrowserWindow, nativeImage } = require('electron');
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const smoke = require('./lib/smoke-harness').createSmokeHarness({ name: 'create-layout', timeoutMs: 90000 });
// 移动专项沿用这个唯一临时根，而不是为共享图库另建独立测试应用。
// 每次 mkdtemp 都产生新路径，上一轮成功搬走的文件不会影响下一轮前置。
// root 会作为目录选择的越界负向样本；真正可整理输出根是其 history-move 子目录。
// 这样既能验证边界失败，也不会触碰系统临时目录外的真实文件。
// 专项在生产文件 handler 接管前仍保留原窗口与游客夹具，认证不成为额外依赖。
// 磁盘用例把小 PNG 写在这个根下；现有普通布局用例继续使用自身固定列表。
// 夹具目录名字只是测试定位，产品的同名保护仍以完整文件路径为身份。
// 截图文件由外层 shot 写入相同根，人工复核时可以对照搬运后的目录。
// 该根保留给诊断，不在异常 catch 里递归删除，避免失败后丢掉文件证据。
// 运行没有修改用户设置里的实际输出路径，setOutput 仅更新当前内存文档。
// 文件服务可以产生正常业务错误，测试最后必须由 harness 保留失败退出码。
// --history-move-only 只缩小场景，仍执行原静态产物校验和渲染错误检查。
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-create-layout-'));
const folder = path.join(root, 'empty-folder');
const errors = [], requests = [], saved = [], savedPayloads = [];
// 保存后的预览夹具单独记录，只有图片生成回归开启后才加入磁盘列表。
// 前面的图库分页仍使用原来的 12 项，不能为修预览破坏旧用例前提。
// 记录实际 handler 返回路径，用于覆盖保存重命名后的去重，而非按原名猜测。
let trackPreviewFiles = false;
const previewFiles = [];
// 文字编辑专项沿用同一个隔离窗口和受限 IPC 夹具，不另起并发 Electron 冒烟。
// 模型可用开关只影响前置检查；uploads/cancellations 记录真实跨桥调用次数。
// 这些记录仅存在测试进程，不读取用户实际模型、账号或服务。
let win, imageFailure = false, folderFailure = false, finish, failGeneration, showFiles = false, editModelsAvailable = true;
// 补丁列表与 LoRA 列表独立开关，能够证明缺补丁在上传前被明确拒绝。
// 恢复后通过相同表单重试，不刷新页面掩盖错误状态恢复问题。
// 所有模型只是假服务的名称列表，不声称读取了真实模型权重。
let editPatchesAvailable = true;
const editUploads = [], editCancellations = [];
// 编辑输入字节只在本轮临时记录，用于确认非法输入和缺模型没有偷偷上传。
// 生成延迟回包可在主进程精确控制，停止与断线检查不依赖模型执行时长。
// 两个错误场景都走 registerHandle 的真实 IpcResult 包装。
// 常规文生图也复用这个 handler，默认套件继续验证原队列串行与保存行为。
// 选择器使用的扫描路径与服务返回路径故意不同，覆盖模型名称解析边界。
// 扫描夹具增加的 UNet 只属于 Anima 目录，不让 SDXL 页面获得虚假候选。
// 模型元数据返回空列表，布局成功不能被解读为 safetensors 文件解析成功。
// 全部记录在同一 Electron 进程内收集，避免并行冒烟的单实例锁相互影响。
// focused 开关只选择用例，仍执行静态产物新鲜度和通用退出码护栏。
// 断言通过与否依赖真实操作结果，不因 focused 模式而改用另一套产品代码。
// 编辑专项结束恢复普通图片入口，完整套件的主题/语言用例仍使用原前置。
// 保存回包仅模拟路径，真实 GPU 推理与磁盘权限需要独立联调。
const fixtureImages = Array.from({length:12},(_,i)=>({filePath:path.join(root,`artwork-${i+1}.png`),fileName:`artwork-${i+1}.png`,modifiedAt:Date.now()-i*1000}));
// 文档清理不能使布局回归失去输入；六张原样图已逐字节迁移到独立测试目录。
// fixtures 不参与产品打包，也不读取用户的模型、图库或账号数据。
// 保持文件内容与迁移前一致，让本轮断言仍能验证同一组图片尺寸与原字节上传。
const fixtureCover = 'data:image/webp;base64,' + fs.readFileSync(path.join(__dirname, 'fixtures/create-layout/hero.webp')).toString('base64');
// 两个隔离 LoRA 版本供嵌套选择器走真实分类/版本流程；路径仅指向临时夹具目录。
let userData = { version: 1, settings: { paths: { lorasPath: path.join(root, 'loras'), diffusionModelsPath: path.join(root, 'diffusion_models') }, theme: 'light', locale: 'zh-CN', outputPath: root } };
app.disableHardwareAcceleration(); app.setPath('userData', path.join(root, 'browser'));
smoke.setWorkDir(root); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
// 自定义 head 首次挂载会查询系统最大化状态，布局夹具也要安装真实受限窗口 handler。
// 不模拟窗口状态常量，确保新控件在创建页初始化时没有未注册通道错误。
// 窗口动作的实际最小化、最大化及关闭验证仍由顶栏专项单独负责。
require("../apps/electron/src/main/core/windows/window.handlers").registerWindowHandlers();
registerHandle(C.USER_DATA_READ, () => ({ data: require('./lib/guest-session-fixture').withGuestSession(userData), filePath: '', isNew: false }));
registerHandle(C.USER_DATA_WRITE, (_e, data) => { userData = data; return { data, filePath: '' }; });
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => '');
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: 'UNAUTHENTICATED' } }));
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root);
registerHandle(C.CHANGELOG_READ, () => '');
registerHandle(C.MODELS_DOWNLOAD_LIST, () => ({ revision: 0, tasks: [] }));
// 主进程扫描用例返回两个同分类模型，覆盖版本子页；不读取磁盘模型或用户目录。
registerHandle(C.MODELS_SCAN, (_e, dirPath) => dirPath.endsWith('loras') ? [
  { id: 'fixture-lora-a', name: 'Fixture Style', filePath: path.join(dirPath, 'Anima', 'Style'), iconPath: fixtureCover, type: 'lora', versions: [{ id: 'fixture-a', name: 'Version A', filePath: path.join(dirPath, 'Anima', 'Style', 'a.safetensors') }] },
  { id: 'fixture-lora-b', name: 'Fixture Style', filePath: path.join(dirPath, 'Anima', 'Style'), iconPath: fixtureCover, type: 'lora', versions: [{ id: 'fixture-b', name: 'Version B', filePath: path.join(dirPath, 'Anima', 'Style', 'b.safetensors') }] },
] : dirPath.endsWith('diffusion_models') ? [{ id: 'fixture-unet', name: 'Custom Anima', filePath: path.join(dirPath, 'Anima', 'Custom'), iconPath: fixtureCover, type: 'checkpoint', versions: [{ id: 'custom-unet', name: 'custom_unet', filePath: path.join(dirPath, 'Anima', 'Custom', 'custom_unet.safetensors') }] }] : []);
// 元数据读取只返回合法空结果；封面与滑块布局断言不依赖真实 safetensors 文件。
// 这样主进程不会打印未注册 handler 错误，同时也不伪造模型元数据成功数据。
registerHandle(C.MODELS_READ_METADATA, () => []);
// 角色库的布局测试只需一个已完成的空响应；不访问真实 Animadex 服务。
// 显式返回分页字段，使外壳可以进入空状态而不是卡在加载中或缺少 IPC handler。
// 这个夹具不验证角色搜索、账户权限或服务端分页正确性。
// 使用真实 AnimadexSearchResult 契约但返回空页；验证页面挂载与空态，不模拟远端检索行为。
registerHandle(C.ANIMADEX_SEARCH, () => ({ results: [], total: 0, page: 1, pageSize: 24, pages: 0 }));
// 名称故意使用与模板不同的子目录，证明唯一同名模型能够正确映射服务端路径。
// 缺模型负向对照必须在上传前失败，而不是提交后由模拟生成替它兜底。
// 普通图片布局仍返回空 checkpoints，继续保持原有图像生成断言的前置。
// 补丁故意位于与模板不同的文件夹，成功提交必须经过真实名称匹配。
// 缺补丁时其他模型仍齐全，不能把 LoRA 校验失败误当成补丁校验成功。
// 两种补丁分别对应边缘与透明蒙版，不允许两个模式提交同一个默认文件。
registerHandle(C.COMFY_LIST_MODELS, () => ({ checkpoints: [], loras: editModelsAvailable ? ['edit/AnimeEditV2.safetensors', 'edit/a.safetensors', 'edit/b.safetensors'] : [], diffusionModels: ['edit/anima_aestheticV11.safetensors', 'edit/custom_unet.safetensors'], clips: ['edit/anima_baseV10_txt.safetensors'], vaes: ['edit/qwen_image_vae.safetensors'], modelPatches: editPatchesAvailable ? ['patches/anima-lllite-any-test-like-v2.safetensors', 'patches/anima-lllite-inpainting-v2.safetensors'] : [] }));
// 最新图可能与旧图同一目录，列表必须真实包含它，才能重现重复缩略图。
// 图片路径来自保存夹具，临时预览仍由正式生成队列创建。
// 不修改渲染 store 来伪造去重成功；刷新仍经过原列表 IPC。
registerHandle(C.FILES_LIST_GENERATED_IMAGES, () => { if(imageFailure)throw new Error('fixture unreadable images'); return [...previewFiles, ...(showFiles ? fixtureImages : [])]; });
registerHandle(C.FILES_LIST_OUTPUT_FOLDERS, () => {
  if(folderFailure)throw new Error('fixture unreadable folders');
  return [{ dirPath: folder, name: 'Empty folder', parentDirPath: null, depth: 1, imageCount: 0, modifiedAt: Date.now() }];
});
// 图库仍沿用12项记录映射六张固定图片，只迁移物理位置，不改变分页与多选数据。
// 删除 docs 原型后，此读取必须只依赖测试目录，否则开发启动成功也会掩盖回归缺图。
// 不认识的路径仍返回 null，不能把任意本机文件当作有效夹具图片读取。
// 保存夹具提供真实 PNG 字节，最新文件与临时预览确实来自同一张图。
// 只有登记过的测试路径可读取，未知路径仍沿用原来的 null 回落。
// 最新图读到的 Meta 也是正式保存转换后的内容，不重新编造工作流。
registerHandle(C.FILES_READ_IMAGE_DATA_URL, (_e,file) => previewFiles.find(image=>image.filePath===file)?.dataUrl ?? (showFiles && fixtureImages.some(image=>image.filePath===file) ? 'data:image/webp;base64,'+fs.readFileSync(path.join(__dirname,`fixtures/create-layout/${file.endsWith('1.png')?'hero':'file-'+((fixtureImages.findIndex(image=>image.filePath===file)%5)+1)}.webp`)).toString('base64') : null));
registerHandle(C.FILES_SAVE_GENERATED_IMAGES, (_e, output, files) => {
  // 沿用原请求记录；生成回归额外模拟生产的重名文件改名。
  // promptId 前缀相同且时间相近时，不能让两个结果占用同一路径。
  // 实际返回值与扫描条目一致，测试不把源文件名误当成最终身份。
  saved.push(output); savedPayloads.push({output,files});
  const paths = files.map(file => path.join(output, trackPreviewFiles ? `${savedPayloads.length}-${file.filename}` : file.filename));
  // 正式保存字节已经包含 Meta，base64 包装只供受限读取 handler 回放。
  // 这不是访问真实磁盘，仍不承诺测试覆盖模型推理和本机权限。
  // 新结果排在前面，与用户截图中最新图相邻的历史缩略图保持同一情形。
  if (trackPreviewFiles) files.forEach((file,index) => previewFiles.unshift({ filePath: paths[index], fileName: path.basename(paths[index]), modifiedAt: Date.now(), dataUrl: `data:image/png;base64,${file.dataBase64}` }));
  return paths;
});
// 生成保持可控的异步边界，专项能够在等待期间点击停止或模拟断线。
// 上传回包改名并带子目录，断言必须使用服务端名称而非本地原文件名。
// 取消夹具只确认指定请求，不伪造真实服务已经执行过模型推理。
// 失败通过已有 IpcResult 包装返回，用于验证页面错误分支与保存抑制。
registerHandle(C.COMFY_GENERATE, (_e, prompt) => new Promise((resolve, reject) => { requests.push(prompt); finish = resolve; failGeneration = reject; }));
registerHandle(C.COMFY_UPLOAD_IMAGE, (_e, _server, payload) => { editUploads.push(payload); return { name: 'server-renamed.png', subfolder: 'anima-input', type: 'input' }; });
registerHandle(C.COMFY_CANCEL, (_e, id) => { editCancellations.push(id); finish({ promptId: 'cancelled-edit', images: [], videos: [] }); return true; });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = smoke.createRun();
async function wait(source) {
  for(let i=0;i<100;i++) { if(await run(`Boolean(${source})`))return; await delay(60); }
  // 超时保留当前页面截图和结构，区分测试前置未满足与产品布局错误。
  // 仅收集对话框标记、工作区隐藏状态和图库按钮选择，不输出用户文档或文件路径。
  // 控制台错误来自隔离测试窗口，便于发现渲染边界捕获后未冒泡的异常。
  // 快照在最终销毁窗口前读取，避免只留下一个没有上下文的超时堆栈。
  // 不用截图结果替代断言；诊断完成仍向上抛错并以失败退出。
  // 截图只写入本轮临时工作目录，不覆盖仓库资源或真实用户图片。
  await shot('condition-failure'); console.log('CONDITION_DIAGNOSTIC',await run("({dialogs:[...document.querySelectorAll('[role=dialog]')].map(d=>({data:{...d.dataset},title:d.getAttribute('aria-labelledby')})),workspaceHidden:document.querySelector('[data-create-workspace-content]')?.hidden,gridButtons:[...document.querySelectorAll('[data-history-grid] > button')].map(b=>({pressed:b.getAttribute('aria-pressed'),label:b.getAttribute('aria-label')})),alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent.slice(0,180))})"),errors);
  throw new Error('Layout condition timed out: '+source);
}
async function click(selector) { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(100); }
async function shot(name) { await delay(100); fs.writeFileSync(path.join(root,name+'.png'),(await win.webContents.capturePage()).toPNG()); }
async function metrics(width,height=900,dpr=1) {
  await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:false});
  await delay(220);
  // 使用容器实际宽度等待布局稳定，不再用窗口820px断点覆盖真实可用空间。
  // 导航缩窄30px后同一窗口会多出工作区；等待逻辑必须与产品分栏定义一致。
  // 后续独立边界断言仍会验证759/760/1039/1040，避免只验证同一表达式。
  // 工具替换期间后台工作区hidden，零宽不应被解释为single。
  // 保留原分栏才不会卸载承载图片详情的图库；返回可见后再校验实际宽度。
  // 页面形态另读常驻父区域，宽度切换用例会测量其真实四边。
  await wait("document.querySelector('[data-create-workspace-content]')?.hidden||document.querySelector('[data-create-layout]')?.dataset.createLayout===(()=>{const w=document.querySelector('[data-create-layout]').getBoundingClientRect().width;return w>=1040?'three':w>=760?'two':'single'})()");
}
async function checkLayouts() {
  await run("window.__promptNode=document.getElementById('prompt-editor');window.__negativeNode=document.getElementById('negative-prompt-editor');window.__promptNode.textContent='A long landscape prompt, '.repeat(45);window.__promptNode.dispatchEvent(new Event('input',{bubbles:true}));window.__negativeText=window.__negativeNode.textContent");
  smoke.check('Negative preset initializes and stays editable',await run("!!window.__negativeText&&document.querySelector('[data-negative-editor-panel]').getAttribute('data-negative-editor-panel')==='true'"));
  await metrics(1440);
  // 入口仍独占一行，但恢复 Git HEAD 原版 40px 底盘、24px 加号和上下各 12px 内边距。
  // 比较实际矩形而非 h-10 类名，能发现 CSS 覆盖或仅修改标记未恢复几何的回归。
  // 指南必须位于入口上方；恢复尺寸不能把二者重新挤回并排的小按钮。
  // 这只验证页面几何，不调用真实模型或远程扩展服务。
  smoke.check('Original 40px extension entry follows the guide on its own row',await run("(()=>{const guide=document.querySelector('[data-prompt-guide-series]'),section=document.querySelector('[data-create-extension-section]'),trigger=section?.querySelector('[data-extension-picker-trigger]'),a=guide?.getBoundingClientRect(),b=trigger?.getBoundingClientRect(),icon=trigger?.querySelector('span')?.getBoundingClientRect(),plus=trigger?.querySelector('svg')?.getBoundingClientRect();return !!a&&!!b&&b.top>=a.bottom&&b.width>=section.getBoundingClientRect().width-2&&icon?.width===40&&icon.height===40&&plus?.width===24&&plus.height===24&&b.height===64})()"));
  await shot('create-extension-entry');
  // 单栏900px用于验证替换；宽屏弹窗由独立配对用例覆盖。
  // 导航仍保持展开，使创建区真实可用宽度小于760px。
  // 不使用窗口宽度直接推断主区是否进入紧凑分支。
  await metrics(900);
  await click('[data-extension-picker-trigger]');
  // useLayoutEffect 登记页面栈后才可测量；先出现属性再出现可见内容是 React 的正常提交顺序。
  await wait("document.querySelector('[data-resource-main-page=\"true\"]:not([hidden])')");
  // 主区替换必须继承父容器的真实矩形，不能用 fixed/absolute 盖在创建表单上。
  // 工作区隐藏但不卸载，借此确认输入节点仍是同一实例且返回时能恢复。
  const replacementCheck = await run("(()=>{const p=document.querySelector('[data-resource-main-page=\"true\"]'),host=document.querySelector('[data-create-page-host]'),workspace=document.querySelector('[data-create-workspace-content]'),r=p?.getBoundingClientRect(),h=host?.getBoundingClientRect(),s=p?getComputedStyle(p):null;return {ok:!!r&&!!h&&Math.abs(r.left-h.left)<1&&Math.abs(r.top-h.top)<1&&Math.abs(r.width-h.width)<1&&s?.position==='static'&&workspace?.hidden&&!document.querySelector('[data-resource-backdrop]')&&document.getElementById('prompt-editor')===window.__promptNode,r:r?.toJSON(),host:h?.toJSON(),position:s?.position,hidden:workspace?.hidden,backdrop:!!document.querySelector('[data-resource-backdrop]')}})()");
  smoke.check('Extension selection fills main area without overlay or losing editor',replacementCheck.ok,JSON.stringify(replacementCheck));
  await click('[data-resource-dialog-back]');
  await wait("!document.querySelector('[data-resource-main-page]')");
  for(const [w,h,dpr] of [[1566,1004,1],[1920,1080,1],[1440,900,1],[1100,800,1],[900,700,1],[820,800,1],[390,844,1],[320,500,1],[1440,900,1.25],[1440,900,1.5]]) {
    await metrics(w,h,dpr);
    smoke.check(`Create ${w}x${h} DPR${dpr}: layout fits and editors survive`,await run(`(()=>{
      const root=document.querySelector('[data-create-layout]'), rail=document.querySelector('[data-create-rail]'),r=root.getBoundingClientRect();
      return document.getElementById('prompt-editor')===window.__promptNode&&window.__promptNode.textContent.includes('landscape')
        &&document.getElementById('negative-prompt-editor')===window.__negativeNode&&window.__negativeNode.textContent===window.__negativeText
        &&r.right<=innerWidth+1&&r.left>=0&&document.documentElement.scrollWidth<=innerWidth
        &&rail.scrollWidth<=rail.clientWidth+1&&document.querySelector('[data-generate-button]').getBoundingClientRect().bottom<=innerHeight;
    })()`));
    // 对每个视口独立检查实际可见列，防止标签状态正确而隐藏了错误的面板。
    // two 必须留下文件管理且隐藏预览；single 则隐藏两者，按用户指定顺序收缩。
    // 模式条应始终贴在表单顶部，不能残留旧固钉的48px/80px顶部占位。
    // getComputedStyle 返回 CSS 的 none，而不是 Tailwind 类名 hidden；断言以浏览器实际值为准。
    smoke.check(`Create ${w}px: preview hides before files and mode bar has no top gap`,await run("(()=>{const r=document.querySelector('[data-create-layout]'),rail=document.querySelector('[data-create-rail]'),bar=document.querySelector('[data-create-mode-tabs]'),stage=getComputedStyle(document.querySelector('[data-create-stage]')).display,side=getComputedStyle(document.querySelector('[data-create-side]')).display;return (r.dataset.createLayout==='three'?stage==='flex'&&side==='flex':r.dataset.createLayout==='two'?stage==='none'&&side==='flex':stage==='none'&&side==='none')&&bar.getBoundingClientRect().top-rail.getBoundingClientRect().top<=2&&bar.getBoundingClientRect().height===55&&getComputedStyle(rail).paddingTop==='0px'&&!document.querySelector('[data-create-view-tabs]')})()"));
    await shot(`create-${w}x${h}-dpr${dpr}`);
  }
  // 单栏保持同一提示词节点，三个入口分别控制表单、预览和文件管理。
  // 390px 用例使用实际页面和隔离文件夹，验证竖排固钉悬浮在完整表单的右边界内。
  // 三个按钮的x相同、y递增，能区分目标竖排和曾经的横向模式切换条。
  await metrics(390,844);
  // 仅检查正式控件几何与可见性，不向页面注入假固钉或覆盖样式。
  // 表单必须可见且编辑节点相同，防止通过隐藏整栏来规避重叠断言。
  // 阶段数据不清空；后续生成用例仍会读取这一个表单。
  smoke.check('Single-column fills the surface with an overlaid vertical page pin',await run("(()=>{const p=document.querySelector('[data-history-pin]'),b=[...p.querySelectorAll('button')].map(e=>e.getBoundingClientRect()),r=document.querySelector('[data-create-rail]').getBoundingClientRect();return document.getElementById('prompt-editor')===window.__promptNode&&getComputedStyle(document.querySelector('[data-create-rail]')).display==='flex'&&b.length===3&&b[0].x===b[1].x&&b[1].x===b[2].x&&b[0].bottom<=b[1].top&&b[1].bottom<=b[2].top&&Math.abs(r.right-document.querySelector('[data-create-layout]').getBoundingClientRect().right)<1&&p.getBoundingClientRect().left<r.right&&p.getBoundingClientRect().right<=r.right+1&&getComputedStyle(p).position==='absolute'})()"));
  // 保存真实单栏画面，用于对照图6去掉顶部切换栏后的布局。
  // 截图包括固钉的三个页面入口，不裁切后补画按钮。
  // 此用例没有调用真实模型，测试图片仍来自隔离夹具。
  await shot('create-mobile-pin');
  await metrics(1440);
  await click('[data-advanced-prompt-toggle]');
  smoke.check('Wide assembly has exactly one instance',await run("document.querySelectorAll('[data-prompt-assembly]').length===1&&document.querySelector('[data-create-side]').contains(document.querySelector('[data-prompt-assembly]'))"));
  await metrics(900);
  smoke.check('Narrow assembly has exactly one instance inside form',await run("document.querySelectorAll('[data-prompt-assembly]').length===1&&document.querySelector('[data-create-rail]').contains(document.querySelector('[data-prompt-assembly]'))&&document.getElementById('prompt-editor')===window.__promptNode"));
  await click('[data-advanced-prompt-toggle]');
  await run("document.getElementById('prompt-editor').textContent='library retention sentinel';document.getElementById('prompt-editor').dispatchEvent(new Event('input',{bubbles:true}))");
  // 900px 展开158.75px侧栏后主区为单栏，文件管理通过竖向固钉进入。
  // 点击文件管理入口，保留后续图库、返回与编辑器同一性的检查。
  // 不修改导航偏好来制造测试条件；产品必须在用户当前布局下正常工作。
  await click('[data-history-pin-option=history]'); await wait("document.querySelector('[data-create-subpage=history]')");
  smoke.check('Narrow library stays in main area with navigation and editor retained',await run("document.querySelector('[data-create-subpage=history]').getBoundingClientRect().left>=document.querySelector('[data-app-nav]').getBoundingClientRect().right&&document.getElementById('prompt-editor')===window.__promptNode"));
  await click('[data-subpage-back]'); await wait("!document.querySelector('[data-create-subpage=history]')");
  smoke.check('Returning from library restores the same prompt',await run("document.getElementById('prompt-editor')===window.__promptNode&&window.__promptNode.textContent==='library retention sentinel'"));
}
async function checkGallery() {
  await metrics(1440); await wait("document.querySelector('[data-images-empty]')");
  await run("[...document.querySelectorAll('[data-history-sidebar] button')].find(b=>b.textContent.includes('Empty folder')).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await wait("document.querySelector('[data-browse-all]')"); await delay(400);
  smoke.check('Empty folder is selected as generation output',userData.historyFolders?.selectedFolderId===folder);
  await click('[data-browse-all]'); await delay(400);
  smoke.check('Browse-all changes browsing only, keeping generation output and mode',userData.historyFolders?.selectedFolderId===folder&&userData.historyFolders?.openedFolderId!==folder&&userData.historyFolders?.outputMode==='free');
  imageFailure = true; folderFailure = true;
  await metrics(900); await metrics(1440);
  await wait("document.querySelector('[data-images-error]')&&document.querySelector('[data-folders-error]')");
  smoke.check('Read failures show separate errors rather than empty data',await run("!document.querySelector('[data-images-empty]')&&document.querySelectorAll('[data-history-sidebar] [role=alert]').length===2"));
  imageFailure=false; folderFailure=false;
  await click('[data-folders-error] button'); await click('[data-images-error] button');
  await wait("!document.querySelector('[data-images-error]')&&!document.querySelector('[data-folders-error]')&&document.querySelector('[data-images-empty]')");
  smoke.check('Retry recovers and failed folder reads preserve output selection',userData.historyFolders?.selectedFolderId===folder);
}
async function prepareSizeDraftChecks() {
  // 主流程已经加载真实创建页和受限 preload，此处不重复创建窗口或登录。
  // 先选择自定义，避免去修改预设卡片的只读展示值。
  // 使用当前模式按钮切到视频，证明两个真实调用方都接入了公共输入。
  // 等视频尺寸区域挂载后才寻找自定义入口，避免测试跑在旧图片 DOM 上。
  // 这些操作只改变本轮隔离用户文档，不会修改用户真实保存的分辨率。
  // 完成后回到图片，为后续原有队列和结果去重回归恢复模式前提。
  // 隐藏窗口也需要真实焦点事件，单改 activeElement 不会触发 React 的 blur。
  // CDP 只模拟本轮测试页面的焦点，不抢占用户正在使用的应用窗口。
  // 这仍调用生产输入事件，不直接调用组件内部的提交回调。
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  await run("document.querySelector('[data-create-size]').open=true");
  await click('[data-create-size] [data-size-preset=custom]');
  // 两个入口使用同一尺寸输入，先检查逐字草稿再继续原有大图生成回归。
  // 视频仅切换表单，不上传素材或提交任务；返回后沿用当前图片草稿。
  // 测试失败累计到现有 smoke 护栏，后续通过不能覆盖输入被截断的问题。
  await checkSizeInputDraft('[data-create-size]', 1208, 1232);
  await run("[...document.querySelectorAll('[data-create-mode-tabs] button')].find(b=>b.textContent.includes('视频')).click()");
  await wait("document.querySelector('[data-video-resolution]')");
  await click('[data-video-resolution] [data-size-preset=custom]');
  await checkSizeInputDraft('[data-video-resolution]', 1216, 1248);
  await run("[...document.querySelectorAll('[data-create-mode-tabs] button')].find(b=>b.textContent.includes('图片')).click()");
  // 模式切换会重新挂载原生 details，必须重新展开才能真实聚焦尺寸输入。
  // 对隐藏输入强塞 DOM 值不能证明用户可以编辑，更不能触发失焦提交。
  // 前面的草稿验证与后面的 4K 参数提交使用同一个可见表单入口。
  await run("document.querySelector('[data-create-size]').open=true");
}
async function preparePreviewGeneration() {
  // 本组覆盖两个相关入口：图片输入的大尺寸和保存后的结果合并。
  // 先设置尺寸再发起生成，才能检查提交值与可见摘要是否一致。
  // 不能只在生成结束后改输入，那样旧尺寸进入工作流也可能误过。
  // 两张输出仍由原串行任务产生，新增测试不手动插入全局任务。
  // 准备函数只调整当前表单，不触碰安装目录或真实用户配置。
  // 启用扫描回填发生在提交之前，第一张生成完成就会触发真实刷新。
  // 因而覆盖了第二张尚未完成时，首张已经进入历史列表的交错情况。
  // 大分辨率只作为参数传递，回包图片尺寸由已有小图夹具决定。
  // 测试不能据此声称本机 GPU 已完成 4096×2160 的推理。
  // 数值输入继续保留像素对齐，不把 HTML max 删除当成全部修复。
  // 后面摘要与 latent 节点的比较约束真正提交时的二次规范化。
  // 草稿专项短暂切换视频，真正的生成提交仍只在图片页进行。
  // 视频合法区间另外由独立的 28740 组回归保护。
  // 图片缩放的纯函数回归另外检查，避免恢复草稿时又出现隐藏截断。
  // 等待来自已有主进程计时器，窗口不可见时仍能结束输入收尾。
  // 任何选择器失效会进入原 main 的错误处理，不吞异常继续报告成功。
  // 本组复用已有窗口和 preload，不启动与其他冒烟争抢锁的第二个应用。
  // 此后保存结果真实回填列表，不能只用临时预览通过生成成功断言。
  // 前面文件操作用例已结束，开启后不会改变原分页与多选数量。
  // 字节与文件身份都来自同一次正式保存 IPC。
  trackPreviewFiles = true;
  await prepareSizeDraftChecks();
  // 通过原生输入事件设置大尺寸，不直接修改表单 store。
  // 两个输入都需要回显，才能证明界面没有残留 max=1500。
  // 后面的真实请求节点会核对摘要，不能仅检查输入框里的字符串。
  // 两次输入分开交还渲染循环，第二次才能读取第一边更新后的受控值。
  // 不在同一个批次用旧闭包改两边，否则夹具自身会把宽度改回旧值。
  // 等待只用于真实输入收尾，不绕过正式 onChange 的尺寸规范化。
  for (const [side, value] of [['width','4096'],['height','2160']]) {
    // 夹具也按用户的输入完成动作提交，不能继续依赖逐字符自动校正。
    // 必须先聚焦再 blur，单纯给未聚焦 input 发 blur 无法触发真实提交。
    // 每条边独立完成，下一次回调能取得上一条边已经确认的值。
    await setSizeInputDraft(`[data-create-size] [data-size-dimension=${side}]`, value);
    await run(`document.querySelector('[data-create-size] [data-size-dimension=${side}]').blur()`);
  }
  // 分开断言范围和回显，大尺寸不能只是被输入框临时接受、随后又被夹回去。
  // MiniMax 的保留约束由纯算法专项配对检查，不在图片页伪造视频成功。
  // 本次生成夹具只回传小 PNG，不为测试 4K 参数真的分配大图内存。
  smoke.check('Image custom dimensions have no HTML maximum and preserve 4096 by 2160',await run("[...document.querySelectorAll('[data-create-size] [data-size-dimension]')].every(el=>!el.hasAttribute('max'))&&document.querySelector('[data-size-summary]').textContent==='4096 × 2160'"));
}
// 尺寸专项共用输入动作，禁止将组件的私有回调当作测试入口。
// selector 带图片或视频作用域，不会误选保留在后台的其他工作区。
// 聚焦后再写值，后续 blur 才有真实的前后焦点变化。
// 直接赋 el.value 会同步 React 的值跟踪器，可能让 input 事件被忽略。
// 因此使用原生 setter，仅修改 DOM，再由生产事件处理器接收草稿。
// 传入空串覆盖全选删除的状态，不能换成数字零。
// 函数不点击生成，不发送图片上传，不申请真实模型资源。
// 主进程等待给 React 留出提交局部状态的机会，不依赖隐藏窗口 rAF。
// 若等待超时，现有 run 看门狗负责失败退出，不无限等待输入恢复。
// 此处不触发 blur，调用方才能独立断言编辑尚未结束时的显示。
// 与纸表类比，这一步只负责写字，不负责交表或检查画框尺寸。
// 最终摘要仍来自正式组件，测试不另算一个假摘要覆盖页面。
async function setSizeInputDraft(selector, value) {
  await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await delay(40);
}
// 草稿像还没填完的表格，先保留原笔迹，交表时才检查数字。
// 图片和视频分别调用，证明复用组件不会把两套像素步进混为一谈。
// expected 是同一未对齐输入 1209 的最终合法值，由独立常量给出。
// 这里不读取 store 私有方法，只通过生产 input、焦点和键盘事件交互。
// 每次 input 后让 React 完成更新，能发现首个 1 被替换成 8 的旧行为。
// 循环记录各步值而非只看最终 1200，防止累计输入掩盖中间被截断。
// 等待来自主进程计时器，隐藏窗口也不会因 rAF 暂停导致永不结束。
// 错误记录交给 smoke.check，测试日志能够区分输入草稿与提交校正。
async function checkSizeInputDraft(scope, expected, enterExpected) {
  // 本组先记录原尺寸，避免把尚未提交的草稿误认为已经生效。
  // 图片和视频使用不同默认宽度，因此不用硬编码初始摘要。
  // expected 与 enterExpected 都来自独立测试常量，不调用生产取整函数求答案。
  // 这能发现公共组件错误地把视频步进套到图片上的回归。
  // 不根据文件体积或目录名猜模型，不参与 Agent 选模逻辑。
  // 测试仅测输入与参数传递，不证明显卡可以承受任意图片宽高。
  // 原始图片尺寸开放上限的既有断言仍在后面单独执行。
  // 视频最终请求节点由另一份工作流冒烟核对，本组侧重可见编辑过程。
  // 每项失败保留具体 scope，日志可以直接区分图片和视频入口。
  // 两套输入都必须通过，不能以图片成功抵消视频回归。
  const selector = `${scope} [data-size-dimension=width]`;
  const before = await run(`document.querySelector('${scope} [data-size-dimensions]').textContent`);
  // 模拟清空、单个数字及完整宽度；只改 DOM 草稿，不先触发 blur。
  // 空字符串是正常编辑状态，不应即时转换成 0 或最小边长。
  // 与用户一样逐步检查回显，不能只一次性塞入完整四位数。
  const observed = [];
  // 1、12、120 都是未完成的正常输入，不应触发最小尺寸或步进校正。
  // 1200 则确认用户最终能写完四位数，而非一直困在 8 或 64。
  // 逐步保存回显，可以发现首个数字失败后后续赋值偶然恢复的假成功。
  // 同时比较摘要，防止 UI 留下草稿但后台已经写入错误的中间参数。
  // 清空是循环第一步，覆盖全选替换这条常见操作路径。
  // 不清空父层尺寸，允许空稿取消时恢复已有合法值。
  for (const value of ['', '1', '12', '120', '1200']) {
    await setSizeInputDraft(selector, value);
    observed.push(await run(`document.querySelector(${JSON.stringify(selector)}).value`));
  }
  // 摘要仍应显示已确认的尺寸，未完成草稿不能提前写入生成参数。
  // 这里同时检查空值和 1，正是旧实现最容易强制变成 8/64 的阶段。
  // 失败后仍继续后面的边界，日志不能只留一句模糊的输入错误。
  smoke.check(`${scope} preserves empty and incremental drafts without changing confirmed size`, observed.join('|') === '|1|12|120|1200' && before === await run(`document.querySelector('${scope} [data-size-dimensions]').textContent`));
  // 在 1200 后改为未对齐的 1209，只有结束输入才允许采用各自步进。
  // 单独读取 blur 前数值，不能把最终 1208/1216 当作输入过程中也可覆盖。
  // 调用已聚焦元素 blur，触发的正是用户点击输入框外面的提交路径。
  await setSizeInputDraft(selector, '1209');
  // 1209 与两套步进都不对齐，输入阶段保留原文才说明没有动态纠正。
  // 预期 1208 与 1216 不同，可抓到复用控件偷偷固定 step=8 的错误。
  // 先检查原文再失焦，不能用最终合法值替代用户正在输入时的体验。
  // blur 是鼠标点击外部和 Tab 离开的共同提交入口，不依赖按钮点击逻辑。
  // 回车继续复用同一 DOM 输入，覆盖提交后再次编辑而非重新挂载的情况。
  // 1233 与前一稿不同，若草稿闭包过期会返回上次值并导致测试失败。
  smoke.check(`${scope} keeps unaligned text until editing ends`, await run(`document.querySelector(${JSON.stringify(selector)}).value==='1209'`));
  await run(`document.querySelector(${JSON.stringify(selector)}).blur()`); await delay(40);
  // 图片 8 像素与 H3 32 像素对齐均须在 blur 后才回显。
  // 回车随后仍使用这一边，验证没有只接通鼠标失焦、遗漏键盘确认。
  // 两种触发途径采用不同的期望值，不能凭上次 blur 的结果误过。
  smoke.check(`${scope} normalizes only on blur`, await run(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(String(expected))}`));
  // 换成 1233 后回车，图片应变为 1232，视频应变为 1248。
  // 两者与上一轮值不同，若 Enter 没真正提交就无法通过。
  // 事件可取消，真实处理器必须阻止默认表单提交并交给 blur 校正。
  await setSizeInputDraft(selector, '1233');
  await run(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`); await delay(40);
  smoke.check(`${scope} Enter confirms and aligns the complete number`, await run(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(String(enterExpected))}`));
  await setSizeInputDraft(selector, '');
  // 空稿取消必须恢复这次 Enter 刚确认的值，不能恢复最初的默认分辨率。
  // 因此这里复用 enterExpected，而不是前面记录的 before 摘要。
  // 不把空值当作零提交，可以避免无意间丢掉用户上一轮尺寸选择。
  // 对焦点的断言与值断言独立含义不同：一个确认编辑结束，一个确认数据恢复。
  // 事件沿输入框冒泡至 React 根节点，未调用全局生成或队列方法。
  // 真实推理的 OOM、服务断线等问题不由本次输入交互测试覆盖。
  // 现有生成测试继续检查队列与提交尺寸，不因本组通过而被跳过。
  await run(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`); await delay(40);
  // 清空后回车恢复之前确认值，不误提交生成，也不把空稿持久化为零。
  // focus 校验确保 Enter 真正结束编辑，而非只修改了屏幕上的字符串。
  // 后续原生成流程会按正式确认后的尺寸提交，不绕过尺寸适配层。
  smoke.check(`${scope} Enter restores an empty draft and ends editing`, await run(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(String(enterExpected))}&&document.activeElement!==document.querySelector(${JSON.stringify(selector)})`));
}
async function checkGenerate() {
  await preparePreviewGeneration();
  // 前提：真实创建表单已挂载，生成IPC使用可手动完成的本地夹具，不连接ComfyUI。
  // 数量菜单先选2，操作右段只能改变数量，不能提交任何生成请求。
  // 验证两块按钮同父、同高且无嵌套，避免视觉整合后引入非法嵌套点击。
  // 分隔线使用20px伪元素，不能成为贯穿55px按钮的整高边框。
  // group自身应持有渐变背景，两侧按钮只继承，不单独绘制色带。
  // 后面的两次真实生成IPC证明选择的数量传入原队列，而非只改显示数字。
  // 任务执行中再将下一次数量改为1，当前已冻结的双图任务仍必须完成两张。
  // 生成按钮仍可排队，选择数量的操作不会取消当前任务或额外插入新任务。
  // 测试最终恢复×1，后续模式切换及截图不沿用本组临时数量。
  // 所有图片字节由nativeImage夹具生成，只验证UI和IPC参数链，不代表模型画质。
  // 实际尺寸与反向提示词仍由原断言验证，本次不绕过原来的参数构造路径。
  // 外部菜单关闭事件只作用于数量菜单，不删除已有任务状态或生成结果。
  // ×2选择通过正式选项点击完成，不直接修改组件内部React状态。
  // 菜单打开时按钮不产生提交，确保右段没有冒泡到左侧提交处理器。
  // 请求清单保持为空也是前置自检，能发现其它UI操作误触生成的回归。
  await click('[data-image-count-trigger]'); await click('[data-image-count-option="2"]');
  smoke.check('Unified generate control changes count without submitting and retains a short separator',requests.length===0&&await run("(()=>{const g=document.querySelector('[data-generate-control]'),b=g.querySelector('[data-generate-button]'),c=g.querySelector('[data-image-count-trigger]'),r=b.getBoundingClientRect(),s=c.getBoundingClientRect(),d=c.parentElement;return b.parentElement===d.parentElement&&!b.contains(c)&&Math.abs(r.height-s.height)<1&&r.height===55&&getComputedStyle(g).backgroundImage.includes('gradient')&&getComputedStyle(d,'::before').height==='20px'&&c.textContent.includes('× 2')&&!c.textContent.includes('图片')&&c.getAttribute('aria-label').includes('图片')})()"));
  await run("document.getElementById('prompt-editor').textContent='landscape test';document.getElementById('negative-prompt-editor').textContent='bad anatomy, blurry';document.querySelector('[data-generate-button]').click()");
  for(let i=0;i<100&&!finish;i++)await delay(60);
  if(!finish)throw new Error('Generate fixture was not called');
  const nodes=Object.values(requests[0]);
  smoke.check('Collapsed negative is submitted through the real generation path',nodes.some(n=>n.inputs?.text==='bad anatomy, blurry'));
  const latent=nodes.find(n=>typeof n.inputs?.width==='number'&&typeof n.inputs?.height==='number');
  const summary=await run("document.querySelector('[data-size-summary]').textContent");
  smoke.check('Visible size summary matches actual submitted dimensions',!!latent&&summary===`${latent.inputs.width} × ${latent.inputs.height}`);
  smoke.check('Generate stays available for enqueue',await run("!document.querySelector('[data-generate-button]').disabled"));
  // 当前生成仍在等待夹具，修改下一次提交数量不能改变已冻结的双图任务。
  // 右段会维持当前按钮组高度，队列文案变长时数量入口不应掉到第二行。
  // 两次IPC最终完成后再检查请求总数，能排除仅界面文案变成×2的假通过。
  await click('[data-image-count-trigger]'); await click('[data-image-count-option="1"]');
  await completeImagePair();
  try { await wait("!document.querySelector('[data-stage-generating]')&&document.querySelector('[data-create-stage] img')?.naturalWidth===640"); }
  catch(error) { await shot('create-generation-failure'); console.log('GENERATION_DIAGNOSTIC',await run("({status:document.querySelector('[data-stage-generating]')?.textContent,thumbnails:[...document.querySelectorAll('[data-preview-thumbnail]')].map(b=>[b.dataset.previewThumbnail,b.getAttribute('aria-pressed')]),images:[...document.querySelectorAll('[data-create-stage] img')].map(i=>[i.naturalWidth,i.naturalHeight,i.src.slice(0,80)])})"),errors);throw error; }
  smoke.check('Generated image uses contain within available stage',await run("getComputedStyle(document.querySelector('[data-create-stage] img')).objectFit==='contain'"));
  smoke.check('Browse-all did not redirect generated output',saved.includes(folder));
  // 完成后任务仍恰好两次，数量选择没有触发第三个请求；右段显示后续×1。
  // 这条与上方第二请求等待形成配对，既不能少生成，也不能因冒泡而多生成。
  // 样例输出目录仍由原断言确认，不把数量样式改动混入路径选择行为。
  smoke.check('Selected count reaches the frozen generation task and later selection applies only to future tasks',requests.length===2&&await run("document.querySelector('[data-image-count-trigger]').textContent.includes('× 1')"));
  await shot('create-generated-landscape');
  await checkMergedPreview();
}
// 两次返回属于同一个批量任务，不能新建第二个任务假装串行完成。
// 每次完成由主进程掌握，避免使用推理耗时猜测何时触发下一轮。
// 第二次请求必须实际到达 IPC，finish 才会指向第二轮的回包函数。
// 等待 requests.length 的循环有固定上限，生成链中断时明确失败。
// 第一轮已保存时磁盘列表可以刷新，第二轮继续持有同一个队列身份。
// 此交错正是临时预览与本地图片重复的前置，不能把保存合并到最后。
// 两次输出使用相同像素但不同服务端文件名，测试按保存路径保留作品。
// 客户端保存时另有重命名，身份不能只依赖这里的 filename。
// 原数据结构继续包含 nodeId 和 output 类型，不缩减真实解析边界。
// 小 PNG 回包仍经过正式 Blob 创建与 Meta 嵌入保存流程。
// 不覆盖浏览器 URL API 来伪造内存回收或预览复用的结论。
// 此函数只交付结果，完成状态仍由原生成队列写入。
// 未进入第二轮即抛错，外层 main 负责截图与退出护栏。
// 后续检查先等待生成标记消失，再核对图片实际解码宽度。
// 这样不能靠让页面一直保留旧图来通过结果去重断言。
// 本例不代表 GPU 实测，尺寸进入工作流与画质是不同的验证目标。
async function completeImagePair() {
  const dataUrl=nativeImage.createFromBitmap(Buffer.alloc(640*320*4,160),{width:640,height:320}).toDataURL();
  // 先释放第一张，再等待同一任务第二次请求，证明仍沿用原串行逐张生成队列。
  // 第二张使用另一文件名，保存回调不能依赖覆盖第一张来伪造双图完成。
  // 每一步等待有上限，未进入第二请求时应抛错并返回非零退出码。
  finish({promptId:'layout-fixture-1',images:[{nodeId:'9',filename:'layout-fixture-1.png',subfolder:'',folderType:'output',dataUrl}],videos:[]});
  for(let i=0;i<100&&requests.length<2;i++)await delay(60);
  if(requests.length!==2)throw new Error('Selected two-image task did not issue its second generation request');
  finish({promptId:'layout-fixture-2',images:[{nodeId:'9',filename:'layout-fixture-2.png',subfolder:'',folderType:'output',dataUrl}],videos:[]});
}
async function checkMergedPreview() {
  // 总数期望来自两个独立来源：原始图库条目和保存回包条目。
  // 不用页面实际行数当作期望，因此不能把多出来的临时项算作正常项。
  // 预览去重只针对精确路径，不对像素相同的不同作品进行内容去重。
  // 两张夹具的像素故意相同但路径不同，必须同时保留两条磁盘结果。
  // 如果按图像内容或 data URL 去重，数量检查反而会少一张而失败。
  // 保存时重命名通过 handler 回包记录，不从原 Comfy 文件名反推。
  // 这会发现仅给临时 key 换名字、却没有关联真实文件身份的假修复。
  // 最新项必须仍排第零位，否则切回后 src 比较会发现误配。
  // 选择第一张历史结果后再回首图，覆盖过滤磁盘项引起的索引变化。
  // 主图和结果卡分别读取 src，不能只检查缩略图高亮看似正确。
  // 结果卡允许显示同一张图的不同视图，问题是列表重复登记同一文件。
  // 不删除结果卡来获得数量正确，用户浏览旧图时仍可看到最新产出。
  // 上方 iframe 或弹层都不参与选择器，断言只查询正式创建 stage。
  // 菜单检查必须在真实右键事件之后进行，不直接调用动作层私有方法。
  // 没有文件身份的临时项不能通过菜单检查，能反证路径关联是否完整。
  // 收尾只关闭菜单并关掉后续扫描注入，不清空生产任务或预览地址。
  // 两张批量结果已进入磁盘清单，但临时预览只对应最后一张。
  // 统计实际缩略图数：旧版会比扫描清单多一项，不能仅看相似像素。
  // 使用正式保存回包的路径，重命名不会让身份映射失效。
  const expected = fixtureImages.length + previewFiles.length;
  await wait(`document.querySelectorAll('[data-preview-thumbnail]').length>=${expected}`);
  smoke.check('Saved result and temporary preview occupy one thumbnail entry',await run(`document.querySelectorAll('[data-preview-thumbnail]').length===${expected}`));
  // 临时预览、主图与结果卡继续复用同一地址，不另创建展示专用 Blob。
  // 切换到后面的磁盘图片再切回，验证去重后的索引没有沿用旧偏移。
  // 选择历史不能改变“最新生成结果”的来源。
  const latestSrc = await run("document.querySelector('[data-preview-thumbnail=\"0\"] img').src");
  await click('[data-preview-thumbnail="1"]'); await click('[data-preview-thumbnail="0"]');
  smoke.check('Deduplicated thumbnail selection restores the actual latest preview',await run(`document.querySelector('[data-preview-thumbnail="0"]').getAttribute('aria-pressed')==='true'&&document.querySelector('[data-create-stage] .create-preview-image img').src===${JSON.stringify(latestSrc)}&&document.querySelector('[data-create-result] img').src===${JSON.stringify(latestSrc)}`));
  // 最新图保留实际路径，右键菜单必须仍能找到原图库对象。
  // 事件发在合并后的首个缩略图对应主图，走原有文件操作层。
  // 测试仅打开菜单，不执行删除，避免把去重和文件清理混为一谈。
  await run("document.querySelector('[data-create-stage] .create-preview-image').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:700,clientY:300}))");
  smoke.check('Latest merged preview retains its file context menu',await run("!!document.querySelector('[role=menu] [role=menuitem]')"));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  // 回归后恢复夹具，编辑专项不继承文生图临时的扫描注入开关。
  // 原任务和两张生成结果仍留在全局队列，不能清空 store 来通过检查。
  // 后续编辑结果会使用各自的保存回包，避免假目录条目交叉污染。
  trackPreviewFiles = false;
}
async function checkTools() {
  // 本组只验证单栏工具替换；居中分支另有宽屏配对。
  // 仍经真实提示词按钮打开工具，不直接注入测试子页。
  // 900px保持导航展开，剩余展示区不足双栏。
  await metrics(900);
  await run("document.getElementById('prompt-editor').textContent='layout sentinel'");
  for(const tool of ['pose','background','expression']) {
    const before=await run("document.getElementById('prompt-editor').textContent");
    await click(`[data-${tool}-library-trigger]`); await wait(`document.querySelector('[data-${tool}-card] button')`);
    await checkMainPage(`[data-resource-main-page="true"]:not([hidden])`,tool);
    if(tool==='pose') await shot('create-pose-main-page');
    await click(`[data-${tool}-card] button`); await click(`[data-${tool}-apply]`);
    const after=await run("document.getElementById('prompt-editor').textContent");
    smoke.check(`${tool} tool opens, applies tags and preserves existing prompt`,after.startsWith(before)&&after.length>before.length);
  }
  await run("document.getElementById('negative-prompt-editor').textContent='bad anatomy, blurry';document.querySelector('label[for=negative-prompt-editor]').parentElement.querySelector('button').click()");
  smoke.check('Negative edit survives re-collapse',await run("document.getElementById('negative-prompt-editor').textContent==='bad anatomy, blurry'&&document.querySelector('[data-negative-editor-panel]').dataset.negativeEditorPanel==='false'"));
}
// 工具必须真正落在父宿主中；只检查它遮住表单会漏掉原来的 fixed 覆盖实现。
// 比较四条边而非窗口大小，确保标题栏、nav 和底部状态栏仍占各自区域。
// 页面只隐藏原工作区，编辑器节点及其内容不能因工具打开被重建。
async function checkMainPage(selector, name) {
  const state = await run(`(()=>{const page=document.querySelector(${JSON.stringify(selector)}),host=document.querySelector('[data-create-page-host]'),workspace=document.querySelector('[data-create-workspace-content]'),r=page?.getBoundingClientRect(),h=host.getBoundingClientRect();return {ok:!!r&&host.contains(page)&&['left','top','right','bottom'].every(k=>Math.abs(r[k]-h[k])<1)&&!['fixed','absolute'].includes(getComputedStyle(page).position)&&workspace.hidden&&document.getElementById('prompt-editor')===window.__promptNode,rect:r?.toJSON(),host:h.toJSON()}})()`);
  smoke.check(`${name} is a full parent-host page, preserving the editor`,state.ok,JSON.stringify(state));
}
// 自定义工具不经过 ResourceDialogShell，单独覆盖它们的打开、全屏与返回路径。
// 3D 使用内置程序化模特；不导入用户模型，也不向 ComfyUI 提交任务。
// 快捷短语只打开列表然后退出；用户隔离夹具中没有短语也应能正常显示空状态。
async function checkCustomTools() {
  // 单栏验证完整替换与返回，宽屏路径另测，避免旧始终替换的假设。
  // 宽度改变只影响外壳，原有工具数据和扩展草稿仍由真实组件持有。
  // 测试使用本地夹具，不向真实模型或远端服务提交。
  await metrics(900);
  // 角色服务不是这次布局夹具的范围；只等外壳，避免拿远程列表是否加载当布局前提。
  // 按钮标记来自 promptTools 注册表的 rowTestId，完整 DOM 属性为 data-character-picker-trigger。
  // 等待角色库主区而非远程结果，确认 portal 已进入创建页宿主即可。
  const characterEntry = await run("(()=>{const buttons=[...document.querySelectorAll('[data-character-picker-trigger]')];return {count:buttons.length,visible:buttons.filter(b=>getComputedStyle(b).display!=='none'&&b.getClientRects().length).length,advanced:document.querySelector('[data-advanced-prompt-toggle]')?.getAttribute('aria-checked'),promptTools:document.querySelector('[data-create-prompt-tools]')?.getBoundingClientRect().toJSON()}})()");
  smoke.check('Character tool entry is rendered in the active prompt section',characterEntry.count>0&&characterEntry.visible>0,JSON.stringify(characterEntry));
  if (!characterEntry.visible) throw new Error('No visible character entry: '+JSON.stringify(characterEntry));
  await run("[...document.querySelectorAll('[data-character-picker-trigger]')].find(b=>getComputedStyle(b).display!=='none'&&b.getClientRects().length).click()");
  await wait("document.querySelector('[data-character-main]')");
  await checkMainPage('[data-resource-main-page="true"]:not([hidden])','character');
  await click('[data-resource-dialog-back]');
  await run("[...document.querySelectorAll('[data-create-prompt-tools] button')].find(b=>b.textContent==='片段').click()");
  await wait("document.querySelector('[data-quick-phrase-main-page]')");
  await checkMainPage('[data-quick-phrase-main-page]','quick phrases');
  // 短语页过去把返回与标题分成两行，这里测真实高度和标题中线。
  // 保留说明与搜索列表，只压缩页头；测试不靠隐藏标题来满足40px。
  // 该控件属于单栏主区替换，宽屏弹窗的独立布局在后面配对验证。
  smoke.check('Quick phrase replacement has a vertically centered 40px header',await run("(()=>{const h=document.querySelector('[data-quick-phrase-header]'),r=h.getBoundingClientRect(),b=h.querySelector('button').getBoundingClientRect();return r.height===40&&Math.abs((b.top+b.bottom-r.top-r.bottom)/2)<1&&!!h.querySelector('h2')})()"));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await wait("!document.querySelector('[data-quick-phrase-main-page]')");
  await click('[data-view3d-trigger]'); await wait("document.querySelector('[data-view3d-dialog-fullscreen=none]')");
  await checkMainPage('[data-view3d-dialog-fullscreen=none]','3D');
  // 3D普通替换页使用同一40px标题，场景全屏仍由下一条独立验证。
  // 页头按钮不能因原py-3超过可用高度，必须上下居中在标题区域中。
  // 不涉及画布绘制或模型导入结果，只读取现有工具的布局矩形。
  smoke.check('3D replacement has a compact centered 40px header',await run("(()=>{const h=document.querySelector('[data-view3d-dialog-fullscreen=none] > header').getBoundingClientRect(),b=document.querySelector('[data-view3d-back]').getBoundingClientRect();return h.height===40&&Math.abs((b.top+b.bottom-h.top-h.bottom)/2)<1})()"));
  await click('[data-view3d-fullscreen-window]'); await wait("document.querySelector('[data-view3d-dialog-fullscreen=window]')");
  // Electron 的 emulation viewport 可能出现亚像素取整；比较四边并附带尺寸，定位真实几何差异。
  // 这仅验证 CSS 窗口全屏尺寸，不覆盖系统无边框模式或真实显示器缩放。
  const fullscreenGeometry = await run("(()=>{const e=document.querySelector('[data-view3d-dialog-fullscreen=window]'),r=e.getBoundingClientRect();return {ok:Math.abs(r.left)<1&&Math.abs(r.top)<1&&Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1,rect:r.toJSON(),viewport:{width:innerWidth,height:innerHeight},position:getComputedStyle(e).position}})()");
  smoke.check('3D explicit window fullscreen still fills the window',fullscreenGeometry.ok,JSON.stringify(fullscreenGeometry));
  await click('[data-view3d-fullscreen-exit]'); await wait("document.querySelector('[data-view3d-dialog-fullscreen=none]')");
  await checkMainPage('[data-view3d-dialog-fullscreen=none]','3D after fullscreen');
  await click('[data-view3d-back]');
  await wait("!document.querySelector('[data-create-workspace-content]').hidden");
}
// 扩展选择走实际本地资源目录与原组件的草稿提交；只替换图片/账户 IPC，不制造选择结果。
// 先返回再重新打开，可分辨取消路径与确认路径，避免把已经选中的旧状态当成新提交。
// 重新打开读取当前表单已经加载的两份 LoRA，不依赖第一次选择器的旧实例。
// 两份夹具位于同一分类，能够暴露“分类已选但内层只剩第一项”的回归。
// 分类角标和底部总数都应该是二，不能把分类数量一当成模型数量。
// 已有多项时自动开启多选，用户无需再次切换开关才能看到完整状态。
// 内层两个模型都须 aria-pressed=true，分类上的绿色边框不能代替模型级检查。
// 原添加按钮重新创建会话，验证的是打开时初始化而不是在旧弹窗里继续点选。
// 这与主模型单选的业务不同：夹具来自扩展入口，不改变主模型确认限制。
// 分类入口仍由共享资源选择器生成，测试没有创建只为通过断言的假卡片。
// 只有元数据图片被模拟，模型列表与版本 ID 继续由真实扫描适配器产生。
// 脚本不会读取用户的实际 LoRA 文件，所有选中项都属于独立临时目录。
// 进入版本层只检查回显，不选择新的模型，避免把旧项丢失掩盖成一次新添加。
// 截图记录内层两张已选卡片，外层恢复由独立计数断言确认。
// 图片内容不作为选择依据，即使两份模型共用封面仍必须按各自 ID 标记。
// 图片解码速度不会影响 aria-pressed 的真实性，等待只针对版本层出现。
// 当前搜索为空，因此两份版本应同时可见，不靠筛选结果意外缩小检查范围。
// 两个总数分别来自分类卡片和 footer，可发现一处保留全部而另一处仍按首项显示。
// 使用原 DOM 按钮完成进出，不直接调用 React setState 或修改 store。
// 原子模型选中状态由同一 activeIds 传入，版本层不能另建只记最后点击项的列表。
// 本组取消返回，不向外层业务提交一次空选择或重复追加已加载模型。
// 取消不需要移除表单模型，之后的滑块回归会继续验证两份项仍然可编辑。
// 最后一份移除后空态仍由后面的已有断言覆盖，不在此复制移除流程。
// 窄屏内层和分类层分属主区页栈，返回先关版本再关分类，不能只关最外层。
// 这样检查页面栈的正常返回路径，避免留下隐藏选择器干扰后续工具入口。
// 本 helper 没有新增监听或定时器，失败由现有 harness 统一终止窗口与报告。
// 单步等待由宿主的有界轮询控制，窗口不可见时也不会等待无上限动画帧。
// 截图只供人工核对，断言仍以真实选中数和开关状态独立判定。
// 本组没有调用生成，因此通过不表示模型兼容性或推理效果已经验证。
// 图片、视频和音频共用选择器；这里证明图片入口的多模型恢复，其他模式另行验证。
async function checkRestoredExtensions() {
  await click('[data-extension-picker-trigger]');
  await wait("document.querySelector('[data-resource-model-picker]')");
  smoke.check('Reopened extension category counts all loaded LoRAs and starts multiple',await run("document.querySelector('[data-resource-selected-count=\"2\"]')&&document.querySelector('[data-resource-total-selected=\"2\"]')&&document.querySelector('[data-resource-selection-mode=multiple]').getAttribute('aria-checked')==='true'"));
  await click('[data-resource-model-picker]');
  await wait("document.querySelector('[data-model-version-main-page]')");
  smoke.check('Reopened nested models mark both loaded LoRAs selected',await run("document.querySelectorAll('[data-resource-model-option][aria-pressed=true]').length===2"));
  await shot('create-extension-restored');
  await click('[data-resource-model-done]');
  await click('[data-resource-dialog-back]');
}
async function checkExtensionSelection() {
  // 单栏验证完整替换与返回，宽屏路径另测，避免旧始终替换的假设。
  // 宽度改变只影响外壳，原有工具数据和扩展草稿仍由真实组件持有。
  // 测试使用本地夹具，不向真实模型或远端服务提交。
  await metrics(900);
  // 取消路径确认打开主区子页后返回不会提前写入选择，也不会替用户清空原列表。
  await click('[data-extension-picker-trigger]');
  await wait("document.querySelector('[data-resource-main-page]')");
  await click('[data-resource-dialog-back]');
  await wait("!document.querySelector('[data-resource-main-page]')");
  smoke.check('Cancelling extension selection returns without changing selected items',await run("!document.querySelector('[data-selected-extension]')&&document.querySelector('[data-extension-picker-trigger]')"));
  // 再从空态重新打开，下面验证多选版本确认与已选行，避免取消用例污染状态。
  await click('[data-extension-picker-trigger]');
  await wait("document.querySelector('[data-resource-model-picker]')");
  // 多选模式允许在版本页连续选择后通过确认返回；单选会按产品契约选择后立即返回。
  await click('[data-resource-selection-mode=multiple]');
  await click('[data-resource-model-picker]');
  await wait("document.querySelector('[data-model-version-main-page]')");
  await checkMainPage('[data-model-version-main-page]','extension versions');
  smoke.check('Nested version page hides its parent without a backdrop',await run("!!document.querySelector('[data-resource-main-page][hidden]')&&!document.querySelector('[data-lora-model-backdrop]')"));
  await shot('create-extension-versions');
  // 同分类两个版本均通过真实卡片按钮选择，验证multiple不是只有名称的单选模式。
  // 选择后先返回分类再最终确认，保留原有两层草稿提交契约。
  // 不直接构造已选扩展数组，最终表单必须实际出现两个独立可移除项。
  await run("document.querySelectorAll('[data-resource-model-select]').forEach(b=>b.click())"); await click('[data-resource-model-done]');
  await wait("!document.querySelector('[data-model-version-main-page]')");
  await checkMainPage('[data-resource-main-page]:not([hidden])','extension category after return');
  await click('[data-resource-confirm]');
  await wait("document.querySelector('[data-selected-extension]')&&!document.querySelector('[data-resource-main-page]')");
  smoke.check('Confirmed extension keeps cover, weight slider and remove action',await run("(()=>{const e=document.querySelector('[data-selected-extension]');return document.querySelectorAll('[data-selected-extension]').length===2&&!!e.querySelector('img')&&!!e.querySelector('[role=slider],input[type=range]')&&!!e.querySelector('button[aria-label]')})()"));
  await shot('create-extension-selected');
  await checkRestoredExtensions();
  // 使用原生 input value setter 触发 React 的受控滑块更新，不能只改 DOM 值伪造成功。
  await run("(()=>{const slider=document.querySelector('[data-selected-extension] input[type=range]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(slider,'0.75');slider.dispatchEvent(new Event('input',{bubbles:true}));slider.dispatchEvent(new Event('change',{bubbles:true}))})()");
  smoke.check('Extension weight updates through its original controlled slider',await run("document.querySelector('[data-selected-extension] input[type=range]').getAttribute('aria-valuenow')==='0.75'&&document.querySelector('[data-selected-extension]').textContent.includes('0.75')"));
  // 两个版本分别移除，最后一个移除时才应恢复原版空态入口。
  // 每次点击后等待React提交，不能在同一旧DOM上重复点击第一个按钮。
  // slider断言仍先验证第一项权重，第二项是否独立存在由数量断言证明。
  await click('[data-selected-extension] button[aria-label]'); await click('[data-selected-extension] button[aria-label]');
  // 最后一项移除后必须恢复原版空态，不能因为经历过确认而残留紧凑的已选态追加按钮。
  // 64px 是 40px 底盘加上下各 12px 内边距；检查高度防止恢复成之前的 76px 放大入口。
  // 不直接修改已选列表，仍通过真实行内移除按钮驱动 React 状态变化。
  smoke.check('Removing the last extension restores original 64px row',await run("!document.querySelector('[data-selected-extension]')&&document.querySelector('[data-extension-picker-trigger]').getBoundingClientRect().height===64"));
}
// 宽屏配对使用1100px：保留展开导航后创建区为双栏，但整个窗口还不到1280px。
// 这可发现资源外壳仍错误使用窗口媒体查询、把双栏当成紧凑页的回归。
// 姿势工具走共享外壳，扩展还需覆盖嵌套版本、多选草稿和响应式切换。
// 所有资源来自隔离LoRA夹具；没有账号网络请求和真实生成副作用。
async function checkWideDialogs() {
  await checkWideCustomTools();
  await metrics(1100); await click('[data-pose-library-trigger]'); await wait("document.querySelector('[data-resource-backdrop]')");
  // 宽屏必须有居中模态语义及原遮罩，同时父工作区保持可见。
  // 仅检查没有main-page属性不够：错误实现可能根本没有打开工具。
  // 姿势卡也必须出现，证明不是另一层残留弹窗或空壳。
  smoke.check('Two-column tools use original modal below 1280px window width',await run("!!document.querySelector('[data-pose-card]')&&!!document.querySelector('[role=dialog][aria-modal=true]')&&!document.querySelector('[data-create-workspace-content]').hidden&&!document.querySelector('[data-resource-main-page]')"));
  // Escape沿用原关闭流程，随后打开扩展以验证不同资源入口。
  // 两次打开间等待节点清理，防止用旧遮罩误判新弹窗已经就绪。
  // 不直接调用React store，所有动作都经过现有UI事件。
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await wait("!document.querySelector('[data-resource-backdrop]')"); await click('[data-extension-picker-trigger]'); await wait("document.querySelector('[data-resource-model-picker]')");
  // 分类下的同名模型由夹具提供两个独立版本，按多选方式进入嵌套层。
  // 打开内层前选择multiple，避免单选点击后自动退出导致没有持久草稿可测。
  // 保持父分类未确认，才能验证取消、返回和resize不会提前提交。
  await click('[data-resource-selection-mode=multiple]'); await click('[data-resource-model-picker]'); await wait("document.querySelector('[data-lora-model-backdrop]')");
  // 检查真实卡片矩形：宽约200px，封面按4:5，不允许宽容器按三列拉大。
  // 两张夹具都必须存在；空列表的every不能被当作卡片尺寸通过。
  // 弹窗位置需为fixed，父资源遮罩同时存在，证明仍是原嵌套模态层。
  // 先测弹窗再缩窄，避免仅测试替换模式而遗漏宽屏卡片放大。
  smoke.check('Wide nested model modal retains 200px cards and 4:5 covers',await run("(()=>{const cards=[...document.querySelectorAll('[data-resource-version-grid] > div')];return cards.length===2&&cards.every(c=>{const r=c.getBoundingClientRect(),cover=c.firstElementChild.getBoundingClientRect();return Math.abs(r.width-200)<1&&Math.abs(cover.width/cover.height-.8)<.01})&&getComputedStyle(document.querySelector('[data-resource-model-scroll]').parentElement).position==='fixed'&&!!document.querySelector('[data-resource-backdrop]')})()"));
  await click('[data-resource-model-select]'); await shot('create-versions-modal-two-columns');
  // 在内层保持打开和已选状态时跨到单栏，测试栈登记顺序和草稿存活。
  // ResizeObserver应读取创建父区域，不读取已经隐藏后变成零宽的工作区。
  // 只调整窗口尺寸，不重开选择器、不重新选择，避免掩盖状态重置。
  await metrics(900); await wait("document.querySelector('[data-model-version-main-page]')"); await checkMainPage('[data-model-version-main-page]','nested models after narrowing');
  // 只显示栈顶版本页，父分类保留挂载但隐藏。
  // 已选卡的aria-pressed必须仍真，验证选中草稿不是只保留了DOM标题。
  // 窄页头40px且含返回按钮；固定高度不能靠隐藏标题实现。
  // 窄屏不保留全局灰色遮罩，返回按钮之外的nav与head继续可用。
  smoke.check('Narrow nested page preserves draft and has a compact 40px back header',await run("!!document.querySelector('[data-resource-main-page][hidden]')&&!!document.querySelector('[data-resource-model-option][aria-pressed=true]')&&document.querySelector('[data-model-version-main-page]').firstElementChild.getBoundingClientRect().height===40&&!!document.querySelector('[data-resource-model-back]')&&!document.querySelector('[data-lora-model-backdrop]')"));
  // 留存完整应用截图，确认40px页头位于main内，而不是窗口顶部的另一个浮层。
  // 截图保留nav、head和底栏，便于核对所有区域都仍可见且没有灰色遮罩。
  // 图像来自实际渲染组件，不向页面注入参考图或额外的卡片DOM。
  await shot('create-versions-page-narrow');
  // 同一次选择再回到宽屏，内层及外层都必须退出主区栈。
  // 工作区恢复可见，不能留下隐藏父页或窄屏的完整占位层。
  // 这里使用1440px覆盖三栏，与最初1100px双栏形成配对。
  await metrics(1440); await wait("document.querySelector('[data-lora-model-backdrop]')&&!document.querySelector('[data-create-workspace-content]').hidden");
  // 已选草稿需跨两次宽度变化继续保留，直到用户确认或取消。
  // prompt节点身份同时检查，防止通过重建整个创建页来清理布局。
  // 这里只验证本地暂存；本组最终会取消扩展，不修改后面的生成参数。
  smoke.check('Widening nested dialogs preserves draft and the original prompt node',await run("!!document.querySelector('[data-resource-model-option][aria-pressed=true]')&&!document.querySelector('[data-model-version-main-page]')&&document.getElementById('prompt-editor')===window.__promptNode"));
  // 捕获阶段Escape只关闭内层，父分类和自己的遮罩应继续存在。
  // 不点击最上层X来替代此检查，因为那样测不到两个监听同时退出的风险。
  // 关闭后等内层消失，再读取父层，保证判断的是同一次返回后的稳定结果。
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await wait("!document.querySelector('[data-lora-model-backdrop]')");
  smoke.check('Nested Escape leaves original extension modal open',await run("!!document.querySelector('[data-resource-backdrop]')&&!!document.querySelector('[data-resource-confirm]')"));
  // 外层第二次Escape取消整个草稿，原表单不能出现已提交扩展。
  // 这也为后续文件管理回归恢复没有资源弹窗遮挡的初始条件。
  // 不能通过确认按钮清理，因为那会把本组草稿混入真实生成夹具。
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await wait("!document.querySelector('[data-resource-backdrop]')");
  smoke.check('Cancelling responsive extension flow does not submit its draft',await run("!document.querySelector('[data-selected-extension]')&&!document.querySelector('[data-create-workspace-content]').hidden"));
}
// 片段与3D没有使用共享资源外壳，必须独立验证其宽屏弹窗分支。
// 两栏视口1100px同时覆盖旧1280px窗口媒体查询可能错误触发紧凑页的风险。
// 只打开和返回，不创建短语、不导入3D模型，也不连接真实ComfyUI。
async function checkWideCustomTools() {
  await metrics(1100); await run("[...document.querySelectorAll('[data-create-prompt-tools] button')].find(b=>b.textContent==='片段').click()"); await wait("document.querySelector('[aria-labelledby=quick-phrase-dialog-title]')");
  // 片段对话框应固定居中且有全局模态语义，工作区不能被页面栈隐藏。
  // 真实标题存在才判定打开，避免只读空的main-page属性得到恒真结果。
  // 返回使用Escape，与列表新建子层关闭行为继续共享原监听机制。
  smoke.check('Two-column quick phrases retain their original centered modal',await run("(()=>{const d=document.querySelector('[aria-labelledby=quick-phrase-dialog-title]');return d.getAttribute('aria-modal')==='true'&&getComputedStyle(d).position==='fixed'&&!document.querySelector('[data-create-workspace-content]').hidden&&!document.querySelector('[data-quick-phrase-main-page]')})()"));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await wait("!document.querySelector('[aria-labelledby=quick-phrase-dialog-title]')"); await click('[data-view3d-trigger]'); await wait("document.querySelector('[data-view3d-dialog-fullscreen=none]')");
  // 3D普通模式应与短语一致恢复弹窗，显式窗口全屏仍在单栏配对中验证。
  // 比较布局宽度小于展示区，能识别错误沿用整区紧凑宽度的情况。
  // 本用例不判断WebGL模型质量，仍使用内置程序化模特作为场景输入。
  smoke.check('Two-column 3D uses modal presentation without hiding the workspace',await run("(()=>{const d=document.querySelector('[data-view3d-dialog-fullscreen=none]');return d.getAttribute('aria-modal')==='true'&&getComputedStyle(d).position==='fixed'&&!document.querySelector('[data-create-workspace-content]').hidden})()"));
  // 原版3D弹窗通过标题关闭按钮退出；此用例不假设它额外支持Escape。
  // 点击现有按钮而非直接改变open，验证调用者的onOpenChange链路仍然有效。
  // 等普通模式对话框卸载，确保后续姿势工具的遮罩不会与它叠加。
  await run("[...document.querySelectorAll('[data-view3d-dialog-fullscreen=none] > header button')].find(b=>b.textContent==='关闭').click()"); await wait("!document.querySelector('[data-view3d-dialog-fullscreen]')");
}
// 单栏预览复用原stage并铺满展示区，文件管理沿用原组件和返回路径。
// 输入节点在三页之间保持同一实例，不能通过卸载表单换取整区布局。
// 入口必须只改变当前页，不覆盖图库的网格/堆栈/收藏偏好。
async function checkNarrowNavigation() {
  await metrics(900); await click('[data-history-pin-option=preview]');
  // 真实stage的四边必须与创建区相同，而不是只在原中栏宽度内显示。
  // 同时确认表单隐藏，避免两个flex子项挤占宽度而碰巧看见预览图。
  // 不要求真实模型图片；图库夹具已提供可显示的预览来源。
  // 无最新生成结果时缩略图应贴齐stage底部，不能遗留54vh高度上限后的空白。
  // 比较内容内边缘时扣除stage本身1px边框；边框不是额外内容空白。
  smoke.check('Preview pin fills the entire creation surface without reserved rail space',await run("(()=>{const root=document.querySelector('[data-create-layout]').getBoundingClientRect(),stage=document.querySelector('[data-create-stage]').getBoundingClientRect();return ['left','top','right','bottom'].every(k=>Math.abs(root[k]-stage[k])<1)&&Math.abs(document.querySelector('[data-create-filmstrip]').getBoundingClientRect().bottom-(root.bottom-parseFloat(getComputedStyle(document.querySelector('[data-create-stage]')).borderBottomWidth)))<1&&getComputedStyle(document.querySelector('[data-create-rail]')).display==='none'&&document.querySelector('[data-history-pin-option=preview]').getAttribute('aria-pressed')==='true'&&!document.querySelector('[data-create-result]')})()"));
  // 预览截图同时保留三个浮动入口，检查它们没有随表单隐藏一起消失。
  // 空的最近生成区已移除，历史图片应获得剩余高度而不是和无内容卡片平分。
  // 下一步直接切入文件管理，覆盖从非表单页面进入第三项的导航路径。
  await shot('create-preview-page-narrow'); await click('[data-history-pin-option=history]'); await wait("document.querySelector('[data-history-grid] > button')");
  // 从文件管理真实图片按钮进入详情，必须替换父展示区而不是盖在窗口坐标上。
  // 保留原文件页在下面，返回后才能继续同一分页、目录和选择现场。
  // 使用同一checkMainPage四边检查，不能只验证详情存在。
  await click('[data-history-grid] > button'); await wait("document.querySelector('[data-generated-image-main-page]')"); await checkMainPage('[data-generated-image-main-page]','narrow gallery image details');
  // 返回前留存详情替换画面，包含真实夹具封面及无内嵌工作流的说明状态。
  // 本地夹具图片没有生成Meta，因此不把警示说明解释为参数读取失败。
  // 点击当前详情标题中的返回按钮，避免误用后台文件页仍挂载的按钮。
  await shot('create-image-details-narrow');
  // 从整页图库发起的详情也要跨断点保留，不能只修复侧栏来源。
  // 两栏时详情恢复模态，但来源文件页继续存在，直到当前详情关闭。
  // 这一对照能发现 showHistoryPage 随宽度变化卸载父组件的问题。
  await metrics(1100,900); await wait("document.querySelector('[data-generated-image-detail]')&&!document.querySelector('[data-generated-image-main-page]')");
  // 回到单栏再检查四边，证明迁移的是同一会话而不是关闭后重新点击。
  // 背景图库未被新的侧栏实例替换，原文件页在关闭详情后仍可继续使用。
  // 不使用固定延时代替条件，入口不存在时应响亮失败。
  smoke.check('Page-origin image details survive expansion into a two-area modal',await run("document.querySelector('[data-generated-image-detail]').getAttribute('aria-modal')==='true'&&!!document.querySelector('[data-create-subpage=history]')"));
  // 收尾恢复原窄屏前提，后续返回与固钉导航断言仍验证原来的用户路径。
  // 主区宿主四边检查继续覆盖完整占用展示区的要求。
  // 关闭当前详情只恢复文件页，不跳回创建表单。
  await metrics(900); await wait("document.querySelector('[data-generated-image-main-page]')"); await checkMainPage('[data-generated-image-main-page]','page-origin details after resizing');
  await click('[data-generated-image-main-page] > div:first-child > button'); await wait("!document.querySelector('[data-generated-image-main-page]')");
  // 详情返回仍处于文件管理页，不应跳回表单或重置当前输出路径。
  // 最后通过第一个固钉回到创建，原输入节点应重新可见。
  // 这条返回不依赖文件管理页头，验证三个固钉之间可直接切换。
  smoke.check('Image detail returns to the selected file-manager page',await run("!!document.querySelector('[data-create-subpage=history]')&&document.querySelector('[data-history-pin-option=history]').getAttribute('aria-pressed')==='true'"));
  await click('[data-history-pin-option=form]'); await metrics(1566,1004);
}
// 图片与文件夹菜单使用同一份真实创建页，动作对象来自当前图库而非组件替身。
// helper只开关菜单与采集证据，不改变父用例的分页、多选或预览前置。
// 先关闭图片菜单再打开文件夹菜单，避免同时存在两份role=menu混淆查询。
// 最后Escape恢复无菜单状态，后续网格切换不被菜单遮挡。
// 两种业务分别核对对象名与动作数，共享视觉不意味着共享当前目标。
// helper内没有增加文件删除操作，因此夹具图片数量应保持不变。
// 原图片菜单断言在新helper中继续运行，不能为新增文件夹检查删除原覆盖。
// 图片与文件夹的名称是两类内容，分别截屏能发现菜单目标没有随右键更新。
// 188px预期来自用户确认的创建图片菜单，不随当前文件夹标题长度动态放大。
// 长标题应在底部省略，不能通过增宽整个菜单迁就名称。
// r.bottom比较真实窗口高度，加入标题栏限制后仍须完整落在可见区。
// 本组未点击破坏操作，避免视觉回归改变后续九宫格的夹具数量。
// Escape通过文档监听关闭，不能只隐藏菜单让旧监听继续存在。
// 新增helper不会改变showFiles，它沿用父用例已经恢复的真实图库前置。
// 文件夹动作数固定三项，用来抓住误保留图片菜单或叠出两份菜单的情况。
// 截图仍使用有限延迟与capturePage，没有加载本地静态菜单截图冒充运行状态。
// 点击外部关闭由公共组件承担；此用例主要覆盖Escape与窗口边缘避让。
// 后续漫画用例再覆盖独立状态与子菜单，不能从图片菜单通过推断漫画也通过。
async function checkFileContextMenus() {
  await run("document.querySelector('[data-history-grid] > button').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:innerWidth-10,clientY:innerHeight-10}))");
  await wait("document.querySelector('[role=menu] [role=menuitem]')");
  // 新增移动后仍保留原保存、改名和删除，菜单边界继续按真实窗口校验。
  // 精确四项同时核对移动标签，不能因为出现任意多余按钮就算新增动作接通。
  // 这里测公共菜单几何，实际磁盘搬运由history-move专项另行验证。
  // 名称底栏不是menuitem，不应为凑动作数量被错误计入。
  smoke.check('Image right-click retains save, rename, move, delete and clamps to viewport',await run("(()=>{const m=document.querySelector('[role=menu]'),r=m.getBoundingClientRect();return m.querySelectorAll('[role=menuitem]').length===4&&!!m.querySelector('[aria-label=\"移动到…\"]')&&r.right<=innerWidth&&r.bottom<=innerHeight&&r.top>=44})()"));
  // 截图来自已挂载的创建图片菜单，底部名称由真实列表记录传入。
  // 不能截尚未打开的普通浮层来代替用户指定的右键基准。
  await shot('shared-image-context-menu');
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  // 同一创建页立即切到文件夹右键，检验两种业务不会共享旧目标。
  // 文件夹来自隔离IPC列表；不是对磁盘真实目录进行删除的测试。
  // 故意在右下角唤出，公共尺寸由实际菜单内容测量而非固定高度猜算。
  // 对象名与动作数分别读取，防止图片菜单未卸载导致假通过。
  await run("[...document.querySelectorAll('[data-history-sidebar] button')].find(b=>b.textContent.includes('Empty folder')).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:innerWidth-2,clientY:innerHeight-2}))");
  await wait("document.querySelector('[role=menu] [role=menuitem]')");
  // role=menu的入场缩放会暂时缩小getBoundingClientRect，必须等动画结束再量188px。
  // offsetWidth不受transform影响；同时检查最终矩形边界，不能只验证布局宽度。
  await wait("getComputedStyle(document.querySelector('[role=menu]')).opacity==='1'");
  smoke.check('Folder right-click targets its own name and fits the viewport',await run("(()=>{const m=document.querySelector('[role=menu]'),r=m.getBoundingClientRect();return m.getAttribute('aria-label')==='Empty folder'&&m.querySelectorAll('[role=menuitem]').length===3&&r.right<=innerWidth&&r.bottom<=innerHeight&&m.offsetWidth===188})()"));
  await shot('shared-folder-context-menu');

  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
}

async function checkFileInteractions() {
  showFiles=true;
  await metrics(900); await metrics(1566,1004);
  await run("[...document.querySelectorAll('[data-history-sidebar] button')].find(b=>b.textContent.includes('Empty folder')).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await wait("document.querySelectorAll('[data-history-grid] > button').length===9&&document.querySelector('[data-preview-thumbnail=\"2\"]')");
  const geometry=await run("Object.fromEntries(['[data-window-titlebar]','[data-app-nav]','[data-create-rail]','[data-create-side]','[data-create-stage]'].map(s=>[s,document.querySelector(s).getBoundingClientRect().toJSON()]))");
  // 展开导航按本次要求从127px加宽25%至158.75px，表单与文件管理保持原型尺寸。
  // 允许不足半像素的过渡舍入，仍要求顶栏44px、表单464px和右栏336px。
  // stage必须实际占据中间空间，避免隐藏后宽度为0却被几何检查漏过。
  // 使用独立数值作为期望，防止导航和主区同时读错变量时仍然通过。
  smoke.check('Reference geometry uses 44px head and 158.75/464/336px columns',geometry['[data-window-titlebar]'].height===44&&Math.abs(geometry['[data-app-nav]'].width-158.75)<0.5&&Math.abs(geometry['[data-create-rail]'].width-464)<1&&geometry['[data-create-side]'].width===336&&geometry['[data-create-stage]'].width>480,JSON.stringify(geometry));
  // head 改为全宽自定义控件，原生叠加层不再预留空白；账户仍必须能点击而不是拖动窗口。
  // 实际最小化/最大化/关闭 IPC 由独立顶栏专项覆盖，此处只检查创建页的布局契约。
  // 读取整个 header 的矩形可发现旧 calc(100%-138px) 规则仍残留的问题。
  smoke.check('Custom caption fills window and account remains no-drag',await run("document.querySelector('[data-window-titlebar]').getBoundingClientRect().right===innerWidth&&document.querySelectorAll('[data-window-controls] button').length===3&&getComputedStyle(document.querySelector('[data-caption-account]')).getPropertyValue('-webkit-app-region')==='no-drag'"));
  await click('[data-preview-thumbnail="0"]');
  await click('[data-negative-collapsed-hint] button');
  await run("document.getElementById('prompt-editor').textContent='';document.getElementById('negative-prompt-editor').textContent=window.__negativeText;document.querySelector('[data-create-rail-scroll]').scrollTop=0");
  await shot('create-reference-grid');
  await click('[data-history-toolbar] button[aria-label="堆栈"]');
  await wait("document.querySelector('[data-history-grid=stack]')");
  smoke.check('File list paginates real items into readable rows',await run("document.querySelectorAll('[data-history-grid=stack] > button').length===6&&document.querySelector('[data-history-grid=stack] > button').getBoundingClientRect().height<100&&document.querySelector('[data-history-page]').textContent==='1 / 2'"));
  await shot('create-reference-list');
  await checkFileContextMenus();
  await click('[data-history-toolbar] button[aria-label="网格"]');
  smoke.check('Nine-grid mode displays nine real images in three columns',await run("getComputedStyle(document.querySelector('[data-history-grid=grid]')).gridTemplateColumns.split(' ').length===3&&document.querySelectorAll('[data-history-grid=grid] > button').length===9"));
  await click('[data-history-pagination] button[aria-label="下一页"]');
  smoke.check('Next page displays remaining images',await run("document.querySelectorAll('[data-history-grid=grid] > button').length===3&&document.querySelector('[data-history-page]').textContent==='2 / 2'"));
  await click('[data-history-pagination] button[aria-label="上一页"]');
  await click('[data-history-toolbar] button[aria-label="批量选择"]');
  await run("(()=>{const b=document.querySelectorAll('[data-history-grid] > button');b[0].click();b[1].click()})()");
  smoke.check('Multiselect toggles two independent image selections',await run("document.querySelectorAll('[data-history-grid] > button[aria-pressed=true]').length===2"));
  await run("[...document.querySelectorAll('[data-history-sidebar] button')].find(b=>b.textContent.trim()==='全选').click()");
  smoke.check('Select all retains current page selections',await run("document.querySelectorAll('[data-history-grid] > button[aria-pressed=true]').length===9"));
  await click('[data-history-pagination] button[aria-label="下一页"]');
  smoke.check('Select all retains selections on the next page',await run("document.querySelectorAll('[data-history-grid] > button[aria-pressed=true]').length===3"));
  await click('[data-history-pagination] button[aria-label="上一页"]');
  await click('[data-history-toolbar] button[aria-label="退出选择"]');
  // 至少两栏宽度时恢复原图片详情弹窗，不能再强制替换整个 main。
  // 通过正式图片点击进入，核对实际 portal 位置和后台工作区可见性。
  // 缩略图条的独立大图预览仍由后面的原用例覆盖，不混淆两个入口。
  await click('[data-history-grid] > button'); await wait("document.querySelector('[data-generated-image-detail]')");
  // 宽屏必须同时满足 fixed、模态语义和没有主区占位页，单看居中外观不够。
  // 后台工作区仍可测量，防止隐藏父树导致右侧图库卸载、详情随之丢失。
  // 夹具没有模型 Meta，版式成功不能据此宣称参数二创读取已验证。
  smoke.check('Wide gallery image details use the original modal',await run("(()=>{const p=document.querySelector('[data-generated-image-detail]');return p.getAttribute('aria-modal')==='true'&&getComputedStyle(p).position==='fixed'&&!p.hasAttribute('data-generated-image-main-page')&&!document.querySelector('[data-create-workspace-content]').hidden})()"));
  // 保持同一详情会话，缩到单栏后必须完整填充父宿主，不允许浮层只盖住一部分。
  // 宽度变化不能要求用户重新点击原图，资源与元信息状态仍在原组件里。
  // 复用原四边几何断言，保留此前单栏填充修复的回归价值。
  await metrics(900); await wait("document.querySelector('[data-generated-image-main-page]')"); await checkMainPage('[data-generated-image-main-page]','wide-origin detail after narrowing');
  // 1100px 是两栏但低于旧全局 1280px 断点，能抓到错误视口分支优先的回归。
  // 扩宽后主区栈应退出，背景工作区恢复，详情同时继续可见。
  // 最后恢复宽屏截图并关闭同一详情，而不是重开一个弹窗掩盖迁移失败。
  await metrics(1100,900); await wait("document.querySelector('[data-generated-image-detail]')&&!document.querySelector('[data-generated-image-main-page]')");
  smoke.check('Two-area width restores the image modal after narrowing',await run("!document.querySelector('[data-create-workspace-content]').hidden&&document.querySelector('[data-generated-image-detail]').getAttribute('aria-modal')==='true'"));
  await metrics(1566,1004); await shot('create-image-details-wide'); await click('[data-generated-image-detail] button[aria-label=关闭]'); await wait("!document.querySelector('[data-generated-image-detail]')");
  await checkNarrowNavigation();
  await click('[data-preview-thumbnail="1"]');
  smoke.check('Filmstrip changes actual current preview',await run("document.querySelector('[data-preview-thumbnail=\"1\"]').getAttribute('aria-pressed')==='true'"));
  await run("(()=>{const z=document.querySelector('[data-preview-zoom]');z.value='1.5';z.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await delay(350);
  smoke.check('Zoom transforms preview image',await run("getComputedStyle(document.querySelector('[data-create-stage] .create-preview-image img')).transform.includes('1.5')"));
  await click('[data-preview-expand]'); await wait("document.querySelector('[role=dialog][aria-modal=true]')");
  smoke.check('Expand opens the existing real image overlay',await run("!!document.querySelector('[role=dialog][aria-modal=true] img')"));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await click('[data-account-menu-trigger]'); await wait("document.querySelector('[data-sidebar-account-menu]')");
  // 设置迁入账户菜单后，检查实际链接及菜单高度，避免只添加文字却没有路由。
  // 保留语言和退出检查，防止新增一行挤掉原有入口或越过窗口底边。
  // 这里使用真实菜单 DOM；账户与文件数据仍由隔离 IPC 夹具提供。
  smoke.check('Head account menu contains settings, language and logout within viewport',await run("(()=>{const m=document.querySelector('[data-sidebar-account-menu]'),r=m.getBoundingClientRect();return r.top>=44&&r.bottom<=innerHeight&&!!m.querySelector('a[href=\"/settings\"]')&&!!m.querySelector('[data-language-trigger]')&&!!m.querySelector('[data-auth-logout]')})()"));
  // 菜单截图同时记录新设置行的位置及其图标，不在截图前注入假菜单。
  await shot('account-settings-menu');
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await checkImport();
  await run("(()=>{const z=document.querySelector('[data-preview-zoom]');z.value='1';z.dispatchEvent(new Event('change',{bubbles:true}))})()");
}
async function checkImport() {
  const before=savedPayloads.length;
  // 上传字节对照也从同一测试目录读取，避免只修封面路径却漏掉上传回归。
  // 文件未重新编码；保存断言继续比较完整原字节，验证迁移未改变图片内容。
  // 该测试模拟本地上传，不向真实输出目录保存任何文件。
  const bytes=fs.readFileSync(path.join(__dirname,'fixtures/create-layout/hero.webp')).toString('base64');
  await run(`(()=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(${JSON.stringify(bytes)}),c=>c.charCodeAt(0))],'original.webp',{type:'image/webp'}));const input=document.querySelector('[data-file-manager-head] input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await wait("!document.querySelector('[data-file-upload]').disabled");
  smoke.check('Local upload preserves original bytes and uses the browsed directory',savedPayloads.length===before+1&&savedPayloads.at(-1).output===folder&&savedPayloads.at(-1).files[0].dataBase64===bytes&&/^original-[a-f0-9-]+\.webp$/.test(savedPayloads.at(-1).files[0].filename));
  await run("(()=>{const dt=new DataTransfer();dt.items.add(new File(['bad'],'bad.txt',{type:'text/plain'}));const input=document.querySelector('[data-file-manager-head] input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await delay(100);
  smoke.check('Invalid file is rejected before save IPC',savedPayloads.length===before+1&&await run("document.body.textContent.includes('请选择 PNG、JPEG 或 WebP')"));
}
// 漫画使用真实路由和既有五格布局，菜单动作不能把面板数组当图片文件删除。
// 当前截图和事件均发生在隔离Electron页面，不是操作系统桌面右键证据。
// 保留其左右展开子菜单；共享菜单行不能让父容器的overflow裁掉子菜单。
// 删除只移除选中格的图片内容，格子几何和其余四格仍应保留。
// 恢复动作重新启用同一格，不创建第六格或给所有格子换图。
// 两次菜单都通过同一公开contextmenu入口打开，不调用漫画内部setState。
// 移除后必须关闭菜单，证明共享行仍执行原业务run回调。
// 子菜单通过公开按钮展开，能够覆盖鼠标hover之外的可点击路径。
// focus检查读取真实activeElement，避免统一样式时丢失键盘入场焦点。
// 截图时子菜单实际展开，不能仅凭HTML节点存在宣称可见。
// 这组没有替换、保存或导出文件，因此不需要打开系统对话框。
// src恢复结果通过真实img节点判断，不比较UI成功通知文字。
// 源图属于项目静态资源，不会上传到网络或改写原文件。
// 切到漫画后本函数不返回创建页，专项在此结束并由原finally释放窗口。
// 这避免绕过原创建页初始水合，也不引入第二套窗口或preload。
// 本用例故意把菜单锚点放在右下角，迫使父菜单走窗口边缘避让路径。
// 父菜单右移空间不足时子菜单应向左，elementFromPoint能发现被画布裁切的情况。
// elementFromPoint的期望是button本身或后代，SVG与span命中都属合法。
// 只检查按钮矩形在窗口内还不足以排除透明遮挡，所以再检查命中关系。
// 删除前有五张img，删除后只剩四张，数量变化限定在漫画内容区。
// 不把菜单本身的装饰图标当img样本，查询作用域严格限制data-comic-panel。
// 恢复后仍要求五个格子，避免错误地重新套用一份默认模板覆盖用户布局。
// 菜单项名称读当前中文词条，删除图片与删除格子有不同的语义。
// 恢复项可能是子菜单的第二个按钮，选择器限定在子菜单里取末个button。
// 如果根菜单图标后新增别的装饰节点，这个选择器仍不会误点根删除动作。
// 每次open等待菜单实际挂载，不能在同一帧立刻点击尚未提交的子节点。
// loadURL新文档把创建页的测试变量隔离，不能把旧图库身份带到漫画。
// 本场景没有用系统鼠标，因此不声称验证从全屏程序切换后的焦点行为。
// 也没有验证触屏长按菜单，当前验收仅针对桌面应用右键调用链。
// 截图与删除/恢复断言都来自同一菜单实现，避免展示共享菜单但业务仍调用旧副本。
// 专项复用原脚本已初始化的正式创建页与隔离IPC，不再启动第二个测试应用。
// showFiles仅控制夹具枚举，刷新路由后仍由生产列表读取与封面解码路径挂载。
// 如果只改开关而不刷新，旧页面已缓存空库，菜单前置会不成立。
// 先让目录真实出现在列表，再双击进入，不能直接操作store伪造当前目录。
// 双击与右键是两个不同意图，先浏览目录才能同时验证图片与目录菜单。
// 1600窗口保留足够三栏空间，避免目录树被单栏资源页策略切换隐藏。
// 等图片按钮出现后才打开菜单，不能在空库上用固定字符串构造假目标。
// showFiles使用12项已有夹具，断言不要求实际下载模型或生成新图片。
// 每个读取返回仍通过原registerHandle封装，没有给渲染层增加Node权限。
// 图库右键结束后路由切到漫画，新的菜单状态由新页面实例持有。
// 漫画自己的静态源与创建图库夹具分开，不因共同菜单行共用图片数组。
// 专项不运行ComfyUI生成，因此不会在用户当前任务队列里新增请求。
// 其结果只能证明客户端菜单交互，不是生产服务器删除权限的联调证明。
// 原全量套件入口保留不变，新开关只缩小当前右键样式回归所需场景。
// 构建新鲜度、渲染错误收集和退出码护栏在main中仍无条件执行。
// 错误会冒泡到原finally销毁窗口，不用捕获后打印“成功”掩盖失败。
// 专项截图写入原root随机目录，不覆盖用户图片或历史成功证据。
// 运行时一次只有一个BrowserWindow，遵守串行Electron冒烟约束。
// 这个helper本身不删除任何原目录，破坏动作只作用于漫画临时格子状态。
// 验证顺序模拟先看图库再开漫画的日常路径，没有复制独立菜单演示页。
async function checkSharedContextMenus() {
  showFiles = true;
  win.setSize(1600,1000);
  await win.loadURL('app://app/create');
  await wait("[...document.querySelectorAll('[data-history-sidebar] button')].some(b=>b.textContent.includes('Empty folder'))");
  await run("[...document.querySelectorAll('[data-history-sidebar] button')].find(b=>b.textContent.includes('Empty folder')).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await wait("document.querySelector('[data-history-grid] > button')");
  await checkFileContextMenus();
  await checkComicContextMenu();
}

async function checkComicContextMenu() {
  await win.loadURL('app://app/tools/image/comic');
  await wait("document.querySelectorAll('[data-comic-panel]').length===5");
  const open = async () => {
    await run("document.querySelector('[data-comic-panel]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:innerWidth-3,clientY:innerHeight-3}))");
    await wait("document.querySelector('[data-image-context-menu]')");
  };
  await open();
  smoke.check('Comic menu focuses its first action',await run("document.activeElement===document.querySelector('[data-image-context-menu] button')"));
  await click('[data-image-context-menu] button[aria-label="删除图片"]');
  // 带后代的querySelector会找到第二格图片；先取第一格再查img才是目标格检查。
  // 仍要求其余四格图像保留，修正观察范围不会放宽删除行为预期。
  smoke.check('Shared destructive row removes only the selected comic image',await run("!document.querySelector('[data-image-context-menu]')&&!document.querySelector('[data-comic-panel]').querySelector('img')&&document.querySelectorAll('[data-comic-panel]').length===5&&document.querySelectorAll('[data-comic-panel] img').length===4"));
  await open(); await click('[data-image-tools-menu]');
  smoke.check('Comic submenu remains visible beside the shared parent',await run("(()=>{const m=document.querySelector('[data-image-tools-submenu]'),b=m.querySelector('button:last-of-type'),r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&b.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})()"));
  await shot('shared-comic-context-menu');
  await click('[data-image-tools-submenu] button:last-of-type');
  smoke.check('Comic restore retains panel identity and other images',await run("document.querySelectorAll('[data-comic-panel]').length===5&&document.querySelectorAll('[data-comic-panel] img').length===5&&!document.querySelector('[data-image-context-menu]')"));
}

async function checkModesAndLanguage() {
  // 现有创建页已移除角色占位入口，切换回归应覆盖实际保留的四个模式。
  // 旧夹具寻找已移除的按钮会抛错，不能把这类过期前置当成图片修复回归。
  // Role TTS 保留独立的 roleTts 身份，不改成已经下线的 roleCover。
  // 遍历全部模式并回到图片，既验证入口未丢失，也给后续图片回归恢复前置条件。
  // 本地夹具只验证面板切换，不把角色语音或视频服务的执行结果当成已联调。
  for(const [text,mode] of [['视频','video'],['编辑','edit'],['Role TTS','roleTts'],['图片','image']]) {
    await run(`[...document.querySelectorAll('[data-create-mode-tabs] button')].find(b=>b.textContent.includes(${JSON.stringify(text)})).click()`); await delay(180);
    smoke.check(`Mode ${text} remains reachable`,await run(`document.querySelector('[data-create-layout]').dataset.createMode===${JSON.stringify(mode)}&&document.querySelector('[data-create-rail]').getBoundingClientRect().width>0`));
  }
  await click('[data-theme-trigger]'); await wait("document.querySelector('[data-theme-option=dark]')");
  await click('[data-theme-option=dark]');
  await click('button[data-color-preset=rose]'); await delay(400);
  // 渐变现在属于生成按钮组，检查其父表面才能同时覆盖生成与数量右段。
  // 自选配色仍使用原create-gradient token，不将参考图配色硬编码到按钮里。
  // 主题测试仍走正式外观入口，不向页面注入测试专用CSS来形成渐变。
  smoke.check('Existing color preset applies inside creation workspace',await run("document.documentElement.dataset.colorPreset==='rose'&&getComputedStyle(document.querySelector('[data-generate-control]')).backgroundImage.includes('gradient')"));
  await shot('create-rose-dark'); await click('button[data-color-preset=default]');
  await require('./lib/sidebar-menu-fixture').closeAppearance(run);
  await wait("document.documentElement.dataset.theme==='dark'"); await shot('create-dark');
  // 正式暗色主题下开启多选，不注入 CSS 或伪造选中 DOM。
  // 选中一张使框线与圆点都出现在截图里，检查与用户反馈相同的实际图库场景。
  // 默认目录和当前分页沿用前面生成与文件管理夹具，不读取用户图库。
  await click('[data-history-toolbar] button[aria-label="批量选择"]'); await click('[data-history-grid] > button');
  // 读取 Chromium 计算出的阴影，必须是一像素 ring，不能只比较 Tailwind 类名。
  // 半透明红色在不同 Chromium 中可序列化为 rgba、color 或 color-mix，均须体现三成强度。
  // 旧两像素加 offset 的粗框不能通过，即使颜色碰巧变淡也仍属于回归。
  // 不用截图像素估计线宽，避免系统 DPR 和缩略图图像内容造成误判。
  // 卡片有 200ms box-shadow 过渡；中间帧线宽并非最终的一像素。
  // 有界等待实际动画结束后再读最终样式，不靠固定延迟猜完成时间。
  // 等待仍有统一超时，卡死或持续动画不能被当作通过。
  await wait("document.querySelector('[data-history-grid] > button[aria-pressed=true]').getAnimations().every(a=>a.playState==='finished')");
  smoke.check('Dark selected image outline is one pixel with a subtle tint',await run("(()=>{const s=getComputedStyle(document.querySelector('[data-history-grid] > button[aria-pressed=true]')),c=s.getPropertyValue('--tw-ring-color');return s.boxShadow.includes('1px')&&!s.boxShadow.includes('2px')&&(s.boxShadow.includes('0.3')||c.includes('30%')||c.includes('0.3'))})()"));
  // 只保存本轮隔离截图；退出多选后继续原语言回归，不污染其按钮定位前提。
  // 圆点仍保留白勾，整体多选行为由原选择计数与跨页断言共同保证。
  // 此验证限于浏览器计算样式与布局，不把模拟截图称为所有显示器色彩已校准。
  await shot('create-dark-subtle-selection'); await click('[data-history-toolbar] button[aria-label="退出选择"]');
  await require('./lib/sidebar-menu-fixture').revealSidebarPreference(run,'[data-language-trigger]');
  await click('[data-language-trigger]');
  await run("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='English')?.click()"); await delay(250);
  smoke.check('English workspace uses translated labels',await run("document.querySelector('[data-create-stage] header').textContent.startsWith('Preview')&&document.querySelector('[data-create-size] summary').textContent.includes('Size settings')"));
  await shot('create-english-dark');
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({app});
  const chrome=require("../apps/electron/src/main/core/windows/window-chrome");
  win=new BrowserWindow({...chrome.windowChromeOptions(),show:false,width:1440,height:900,webPreferences:{additionalArguments:chrome.windowChromeArguments(),offscreen:true,preload:path.join(__dirname,"../apps/electron/src/preload/index.js"),contextIsolation:true,nodeIntegration:false,sandbox:false,backgroundThrottling:false}});
  // 沿用生产窗口事件桥接，系统最大化/全屏变化时 head 应获得真实通知。
  // 与 registerWindowHandlers 配对，前者负责通知、后者负责有限请求，不直接暴露窗口对象。
  // 注册只影响隔离测试窗口，不连接用户已运行的应用或修改真实窗口偏好。
  chrome.registerWindowChrome(win);
  smoke.attachWebContents(win.webContents); win.webContents.debugger.attach('1.3');
  win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
  try {
    await win.loadURL('app://app/create'); await wait("document.getElementById('prompt-editor')");
    await wait("document.querySelector('[aria-labelledby=update-announcement-title]')");
    await click('[aria-labelledby=update-announcement-title] button');
    await wait("!document.querySelector('[aria-labelledby=update-announcement-title]')"); await delay(450);
    await metrics(1440); await shot('create-desktop-light');
    // 移动专项复用同一真实创建页与窗口，只有文件管理接口切到生产磁盘实现。
    // 专项会在独立输出子目录创建图片，避免原布局夹具的虚构路径冒充真实移动。
    // 不继续运行需要原假图片清单的生成用例，两类测试的前置条件不同。
    if (process.argv.includes('--context-menus-only')) {
      await checkSharedContextMenus();
    } else if (process.argv.includes('--history-move-only')) {
      // 专项仍使用同一个窗口和静态页面，不另外启动一个排序测试应用。
      // readOrder 只暴露隔离 handler 收到的顺序名单，用于等待正常合并保存完成。
      // 这个观察器不读取 Zustand 私有状态，也不向 renderer 注入排序更新函数。
      // 返回空数组代表尚未写到该目录，专项必须继续等待或明确超时。
      // setOutput 继续只改变夹具设置，不能把用户真实输出目录传给文件测试。
      // 新增 readOrder 不改变原全量布局回归的接口和其他场景前置。
      await require('./lib/check-history-move')({ smoke, win, run, click, wait, metrics, shot, root, readOrder: folder => userData.historyFolders?.imageOrderByFolder?.[folder] ?? [], setOutput: value => { userData.settings.outputPath = value; } });
    } else {
      // 单独的编辑专项复用同一启动夹具，避免复制登录/窗口初始化造成假测试。
      // 默认仍执行原完整回归，再追加文字改图，不跳过九宫格、多选与右键断言。
      // 专项环境变量只缩小执行范围，不绕过构建新鲜度或退出码护栏。
      // 全程一次仅运行一个 Electron 窗口，截图与数据写入本轮临时目录。
      // helper 接收已有桥接记录，断言比较操作前后增量，不假定之前没有生成过。
      if (!process.env.SMOKE_ANIMA_EDIT_ONLY && !process.env.SMOKE_MASK_STUDIO_ONLY) { await checkLayouts(); await checkBreakpoints(); await checkGallery(); await checkTools(); await checkCustomTools(); await checkExtensionSelection(); await checkWideDialogs(); await checkFileInteractions(); await checkGenerate(); }
      // 蒙版专项复用同一个正式窗口、preload 和隔离 IPC 记录。
      // 专项仅缩小测试集合，构建指纹和失败退出码规则不变。
      // 不创建第二个 Electron 进程，避免并发单实例锁和遮挡干扰。
      // 默认完整套件仍运行文字编辑、图库、队列和布局原断言。
      // 导出测试读取正式 Blob 字节；拦下系统下载对话框避免写入用户默认目录。
      // 仅隔离这个测试窗口的下载会话，实际产品按钮仍使用正常下载器。
      win.webContents.session.on('will-download', event => event.preventDefault());
      await require(process.env.SMOKE_MASK_STUDIO_ONLY ? './lib/check-mask-studio' : './lib/check-anima-edit')({ smoke, run, click, wait, metrics, shot, root, requests, savedPayloads, uploads: editUploads, cancellations: editCancellations, resolve: value => finish(value), reject: error => failGeneration(error), setModels: value => { editModelsAvailable = value; }, setPatches: value => { editPatchesAvailable = value; }, input: event => win.webContents.sendInputEvent(event) });
      if (!process.env.SMOKE_ANIMA_EDIT_ONLY && !process.env.SMOKE_MASK_STUDIO_ONLY) { await checkModesAndLanguage(); await checkContainerSignals(); }
    }
    smoke.check('No hydration or renderer-state errors',!errors.some(message=>/hydration|while rendering|Minified React error/.test(message)));
  } finally { win.destroy(); }
  console.log('CREATE_LAYOUT_SCREENSHOTS',root); smoke.finish({app,ok:smoke.allPassed()});
}
async function checkBreakpoints() {
  await metrics(1440);
  for(const [width,expected] of [[759,'single'],[760,'two'],[1039,'two'],[1040,'three']]) {
    await run(`void(document.querySelector('[data-create-layout]').style.width='${width}px')`);
    await wait(`document.querySelector('[data-create-layout]').dataset.createLayout==='${expected}'`);
    smoke.check(`Container breakpoint ${width}px selects ${expected}`,await run(`Math.abs(document.querySelector('[data-create-layout]').getBoundingClientRect().width-${width})<1`));
  }
  await run("document.querySelector('[data-create-layout]').style.removeProperty('width')");
  await metrics(1280); const before=await run("document.querySelector('[data-create-layout]').dataset.createLayout");
  // 1280px 默认展开 nav，底边、头像和顺序检查均使用真实静态导出的创建页。
  // 账户身份仍来自隔离用户文档，只验证尺寸，不把演示头像当作真实账号返回。
  // 这组检查在收起 nav 前执行，避免隐藏插画后产生零矩形误报。
  smoke.check('Home precedes Create and nav shares an opaque borderless shell with head',await run("(()=>{const nav=document.querySelector('[data-app-nav]'),links=nav.querySelectorAll('a'),s=getComputedStyle(nav);return links[0].getAttribute('href')==='/'&&links[1].getAttribute('href')==='/create'&&s.borderRightWidth==='0px'&&s.backgroundColor===getComputedStyle(document.querySelector('[data-window-titlebar]')).backgroundColor&&getComputedStyle(document.querySelector('[data-window-titlebar]')).borderBottomWidth==='0px'&&s.backgroundColor!=='rgba(0, 0, 0, 0)'})()"));
  // 整个右下 main 拥有边框与内边距，不能用 head 横线或 nav 竖线替代。
  // 检查真实内容盒的起止坐标，证明四周留白存在，工具宿主也不会越过此框。
  // 同时核对四边以捕获只加顶部边框、底部却贴边的布局偏差。
  // 此处使用静态导出与隔离数据，只验证客户端布局，不推断真实模型生成效果。
  // 外框紧贴 head，4px 缝隙仍保留；创建展示层归零padding，不干扰其他路由。
  smoke.check('Main keeps its 4px outer gap while creation surface has zero padding',await run("(()=>{const m=document.querySelector('[data-app-main]'),s=getComputedStyle(m),r=m.getBoundingClientRect(),c=m.firstElementChild.getBoundingClientRect(),p=getComputedStyle(m.firstElementChild),h=document.querySelector('[data-window-titlebar]').getBoundingClientRect();return r.top===h.bottom&&['Top','Right','Bottom','Left'].every(side=>s['border'+side+'Width']==='1px'&&s['padding'+side]==='4px'&&p['padding'+side]==='0px')&&Math.abs(c.left-r.left-5)<1&&Math.abs(c.top-r.top-5)<1&&Math.abs(r.right-c.right-5)<1&&Math.abs(r.bottom-c.bottom-5)<1})()"));
  // 立绘容器底边与 main 对齐，容差允许屏幕缩放后的亚像素取整。
  // 空账户槽即使隐藏内容也不能保留 flex gap；本断言读取最终几何而非 display 类名。
  // 不要求立绘图片内透明像素填满底部，检查的是布局盒，保留原插画完整比例。
  smoke.check('Nav artwork bottom aligns with main bottom',await run("Math.abs(document.querySelector('[data-sidebar-art]').getBoundingClientRect().bottom-document.querySelector('[data-app-main]').getBoundingClientRect().bottom)<1"));
  // 头像由 40px 缩小五分之一到 32px，按钮仍填满 44px head，不能缩小点击区域。
  // 分隔符来自 18px 伪元素，容器自身不能留有贯穿高度的 border。
  // 箭头旋转为下拉指示，原按钮仍整体可点击，无额外键盘停靠点。
  // 字体与背景值从浏览器读取，避免只写上预期类名却被旧外壳规则覆盖。
  // 同时测量品牌、说明文字、导航伸缩、工具、账户和三个窗口图标的可见布局盒。
  // 全部中点须与 head 中点相差不足 1px，隐藏元素不参与几何判定。
  // 这是隔离页面布局检查，不覆盖真实账户头像下载或账号服务。
  smoke.check('Head contents share one centerline with 32px avatar and short separator',await run("(()=>{const head=document.querySelector('[data-window-titlebar]'),h=head.getBoundingClientRect(),box=head.querySelector('[data-caption-account]'),button=box.querySelector('button'),r=button.firstElementChild.getBoundingClientRect(),b=button.getBoundingClientRect(),label=button.querySelector('span:nth-child(2)>span'),arrow=button.querySelector('svg'),rects=[...head.querySelectorAll(':scope > div:first-child > svg, :scope > div:first-child > span, [data-sidebar-toggle], :scope > div:nth-child(2) > button > svg, [data-account-menu-trigger] > span:first-child, [data-account-menu-trigger] > span:nth-child(2) > span:first-child, [data-account-menu-trigger] > svg, [data-window-controls] svg')].map(n=>n.getBoundingClientRect()).filter(a=>a.width&&a.height);return rects.length>=12&&rects.every(a=>Math.abs((a.top+a.bottom-h.top-h.bottom)/2)<1)&&r.width===32&&r.height===32&&b.height===44&&r.top>=h.top&&r.bottom<=h.bottom&&getComputedStyle(box).borderLeftWidth==='0px'&&getComputedStyle(box,'::before').height==='18px'&&getComputedStyle(box,'::before').width==='1px'&&getComputedStyle(box,'::before').top==='22px'&&getComputedStyle(label).fontSize==='14px'&&getComputedStyle(arrow).transform==='matrix(0, 1, -1, 0, 0, 0)'})()"));
  // 展开态以真实导航链接为样本，避免把顶栏的品牌图形或工具按钮算进 nav 图标。
  // 必须有五个业务入口；空列表不能通过 every() 得到无意义的成功。
  // 读取实际布局尺寸而非 h-4 类名，确保能发现外壳 CSS 再次放大 SVG 的回归。
  // 设置已迁入账户菜单，nav 和顶栏都不应再出现独立的 /settings 链接。
  // 密度断言读取每行实际高度与组间距，防止 Tailwind 类名被全局样式覆盖。
  // 五个入口均须为 36px；2px 间距与 16px 图标共同对应用户紧凑参考。
  smoke.check('Expanded nav uses compact spacing and 16px icons without standalone settings',await run("(()=>{const n=document.querySelector('[data-app-nav]'),icons=[...n.querySelectorAll('a > svg')],links=[...n.querySelectorAll('a')];return n.getAttribute('aria-expanded')==='true'&&icons.length===5&&icons.every(i=>i.getBoundingClientRect().width===16&&i.getBoundingClientRect().height===16)&&links.every(a=>a.getBoundingClientRect().height===36)&&getComputedStyle(n.firstElementChild.firstElementChild).rowGap==='2px'&&!n.querySelector('a[href=\"/settings\"]')&&!document.querySelector('[data-window-titlebar] a[href=\"/settings\"]')})()"));
  // 此截图来自实际静态导出，与用户给的展开态图对照；不改写图标或导航 DOM。
  await shot('nav-expanded');
  await click('[data-window-titlebar] button[aria-expanded]:not([aria-haspopup])'); await delay(400);
  // 通过正式顶栏按钮折叠，连同 Zustand 状态及 CSS 过渡一起验证。
  // 图标应继续保持 16px；收起状态不能重新显示仅图标形式的设置入口。
  // 检查图标的宽高两个方向，防止只恢复宽度造成纵向拉伸。
  // 收起时只隐藏文字，行高和组间距必须沿用展开态，防止切换后密度反弹。
  // 明确要求五个图标，避免因整个导航消失而误判尺寸检查通过。
  smoke.check('Collapsed nav keeps compact spacing and original icon size',await run("(()=>{const n=document.querySelector('[data-app-nav]'),icons=[...n.querySelectorAll('a > svg')];return n.getAttribute('aria-expanded')==='false'&&icons.length===5&&icons.every(i=>i.getBoundingClientRect().width===16&&i.getBoundingClientRect().height===16)&&[...n.querySelectorAll('a')].every(a=>a.getBoundingClientRect().height===36)&&getComputedStyle(n.firstElementChild.firstElementChild).rowGap==='2px'&&!n.querySelector('a[href=\"/settings\"]')})()"));
  // 独立保存收起态，便于确认紧凑点击区域与原业务入口仍在。
  await shot('nav-collapsed');
  smoke.check('Compact nav preserves room for three panels',before==='three'&&await run("document.querySelector('[data-create-layout]').dataset.createLayout==='three'&&document.querySelector('[data-app-nav]').getBoundingClientRect().width===68"));
  await click('[data-window-titlebar] button[aria-expanded]:not([aria-haspopup])'); await delay(400);
  // 再展开一次，检查设置未因切换重新出现，同时保留创建页的选中路由。
  // 本用例只验证本地导航渲染，不把隔离 IPC 夹具当成真实账号或模型验证。
  // 紧接着的原图库用例继续覆盖九宫格、多选和图片右键业务。
  smoke.check('Re-expanding nav preserves create route without settings',await run("document.querySelector('[data-app-nav]').getAttribute('aria-expanded')==='true'&&!document.querySelector('[data-app-nav] a[href=\"/settings\"]')&&!!document.querySelector('[data-app-nav] a[href=\"/create\"][aria-current=page]')"));
}
async function checkContainerSignals() {
  await win.webContents.debugger.sendCommand('Page.enable');
  for(const blockObserver of [false,true]) {
    const source=`(() => {
      window.__observerCalls=0;window.__blockedObserverCalls=0;window.__blockedSignals=0;
      const match=window.matchMedia.bind(window);window.matchMedia=query=>{const media=match(query),add=media.addEventListener.bind(media);media.addEventListener=(type,...args)=>{if(type==='change'){window.__blockedSignals++;return;}add(type,...args)};return media;};
      for(const [target,type] of [[window,'resize'],[document,'visibilitychange']]) {const add=target.addEventListener.bind(target);target.addEventListener=(event,...args)=>{if(event===type){window.__blockedSignals++;return;}add(event,...args)};}
      const Observer=window.ResizeObserver;window.ResizeObserver=class extends Observer {constructor(callback){let first=true;super((entries,observer)=>{if(${blockObserver}&&!first){window.__blockedObserverCalls++;return;}first=false;window.__observerCalls++;callback(entries,observer)});}};
    })()`;
    const {identifier}=await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source});
    await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await win.reload(); await wait("document.querySelector('[data-create-layout]')?.dataset.createLayout==='three'"); await delay(250);
    await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:900,height:700,deviceScaleFactor:1,mobile:false}); await delay(400);
    const state=await run("({layout:document.querySelector('[data-create-layout]').dataset.createLayout,width:document.querySelector('[data-create-layout]').getBoundingClientRect().width,blocked:window.__blockedObserverCalls,delivered:window.__observerCalls,signals:window.__blockedSignals})");
    // 900px 下保留展开的 158.75px 导航，主区小于 760px，正常观测应切成单栏。
    // 负向对照仍要求旧三栏不变，并确认阻断计数，防止用固定成功值掩盖信号丢失。
    // 这里只验证通知丢失，不代表真实遮挡或账号、模型服务验证。
    smoke.check(blockObserver?'Negative control: blocking container notifications prevents layout update':'Container observer updates layout with media/resize/visibility signals disabled',state.width<760&&state.layout===(blockObserver?'three':'single')&&state.signals>0&&state.delivered>0&&(!blockObserver||state.blocked>0),JSON.stringify(state));
    await win.webContents.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument',{identifier});
  }
}
main().catch(error=>{console.error(error.stack);smoke.finish({app,ok:false})});

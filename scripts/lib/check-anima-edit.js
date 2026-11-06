/**
 * 文字改图集成检查：由创建页冒烟传入真实渲染窗口与隔离 IPC 记录。
 * 操作正式 React 控件，使用本地图片与模拟 ComfyUI 回包，不运行真实模型。
 * 不另起 Electron，不读取用户目录，复用原冒烟的新鲜度和退出码护栏。
 */
const fs = require('node:fs'), path = require('node:path');
const { nativeImage } = require('electron');
// 该模块只能在既有 Electron 冒烟的主进程运行，nativeImage 负责准备确定性素材。
// fs 只读取仓库夹具，不读取当前用户图库或模型文件。
// 每个操作通过 ctx.run 进入真实页面，产品代码没有添加测试后门。
// 断言由共享 smoke.check 汇总，任一 false 最终都影响进程退出码。
// ctx.requests 记录已跨过 preload 的生成 prompt，不读取组件内部状态充当实际提交。
// ctx.uploads 记录上传调用，前置失败需证明没有产生这个副作用。
// ctx.savedPayloads 记录保存 IPC，不能只依靠界面成功文字推断落盘请求。
// resolve 与 reject 是测试服务的可控边界，允许在生成未完成时执行停止操作。
// 本模块不启动 HTTP 服务，也不访问真实 ComfyUI，推理性能不属于其验证范围。
// 图片字节在本地生成，不能把截图里的夹具结果描述成模型已经生成。

/**
 * 使用原生 value setter 触发 React 受控输入，避免直接赋值绕过其变更追踪。
 * textarea 与 input 采用各自原型，可编辑文本区写入 textContent 后派发 input。
 * 选择器和值由 JSON 编码进入页面脚本，不能把输入内容解释成可执行片段。
 * 此辅助不调用组件内部 setter，也不暴露 React fiber 或测试专用产品接口。
 */
async function fill(ctx, selector, value) {
  // React 会追踪元素实例上的 value，直接赋值可能使 input 事件看起来没有变化。
  // 调用原型 setter 后派发事件，模拟真实编辑器会接收的值变更。
  // 文本按 JSON 字面量传入，包含引号、中文或换行时也不能破坏脚本边界。
  // 根据真实控件选择原型 setter 或纯文本编辑事件，不直接调用产品状态 setter。
  // 每次调用重新查询 DOM，弹窗卸载后不能继续操作已经失效的旧控件。
  // 选择器不存在时应直接失败，不静默跳过用户原本无法完成的输入步骤。
  // contentEditable 的 input 事件和原生文本控件不同，没有 value setter。
  // 因而只对可编辑 div 写 textContent，保留浏览器实际的文本读取契约。
  // 使用 isContentEditable 避免把被锁定的 div 当成正常输入继续修改。
  // 当前用例的 input 和 seed 仍走原型 setter，不削弱原来的受控输入覆盖。
  await ctx.run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(e.isContentEditable)e.textContent=${JSON.stringify(value)};else{const p=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});}e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}

/**
 * 文件通过真实隐藏 input 进入产品导入逻辑，不能直接把对象 URL 塞进 state。
 * 解码素材由产品 PNG 封面缩放而来，控制其真实像素尺寸。
 * 损坏图片和非图片使用相同入口，验证提交前的格式/解码拒绝路径。
 * 这里不检查模型画质；回包中的图片同样来自固定的本地测试字节。
 */
async function importFile(ctx, bytes, type = 'image/png') {
  // 使用 DataTransfer 给 file input 提供真正的 FileList，而非伪造普通数组。
  // bytes 明确复制到 Uint8Array，跨页面边界不依赖主进程 Buffer 对象。
  // 测试使用同名 input.png，证明校验依据不只是文件扩展名。
  // MIME 可以故意设错，用来验证上传前的错误处理。
  // change 事件冒泡，让原 VideoImageUpload 的 React handler 正常处理。
  // 无需点击文件系统对话框，仍完整覆盖文件选择后的产品校验与解码逻辑。
  // 此方法不覆盖操作系统文件选择器的可访问性或平台窗口行为。
  // 文件接受过滤只是对话框辅助，程序输入仍需经过真实校验。
  await ctx.run(`(()=>{const e=document.querySelector('[data-anima-source] input[type=file]'),d=new DataTransfer();d.items.add(new File([new Uint8Array(${JSON.stringify([...bytes])})],'input.png',{type:${JSON.stringify(type)}}));e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}

/**
 * 从保存 IPC 的真实 PNG 字节读取 prompt 块，独立验证提交与落盘对象一致。
 * 不只检查界面出现“成功”，否则保存前丢参数的回归仍可能漏过。
 * 长度与偏移按照 PNG chunk 格式遍历，文本只经 JSON.parse 读取。
 * 这里不复用产品的 Meta 写入器，避免同一个错误同时污染实际值与期望值。
 */
function pngText(base64, keyword) {
  // 此读取只比较写入契约，不负责二创界面的所有参数展示行为。
  // 两个关键字分开读取，避免一个函数总是返回同一块而形成恒真对照。
  // JSON 对比包括用户 LoRA 数组映射后的节点输入，不只比较正向文本。
  // 保存回包的 promptId 由模拟服务指定，与 requestId 不要求相同。
  // 选择了不同服务器目录后保存块也必须同步，不能残留本地扫描绝对路径。
  // 输入图文件名同样属于完整工作流，精确比较能发现保存时恢复旧上传名。
  // 输入是保存 IPC 中的实际 dataBase64，不能拿提交前的 prompt 重新生成预期字节。
  // PNG 前八字节为签名，各 chunk 长度不包含长度、类型和 CRC 自身。
  // 按 chunk 长度跳转，图片压缩数据中的类似文本不能误匹配为元数据。
  // tEXt 的关键字与正文由 NUL 分隔，比较精确名称而非模糊包含。
  // prompt 和 illusionRealmMeta 分别读取，版本标记不能靠 prompt 内嵌字段替代。
  // latin1 对应 tEXt 字节承载方式，JSON 转义后的数据可由 JSON.parse 恢复。
  // helper 仅用于受控夹具回包，不实现通用恶意 PNG 的完整 CRC 校验器。
  // 缺块直接抛错，防止使用 undefined 默认值让 Meta 断言假通过。
  const bytes = Buffer.from(base64, 'base64');
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset), kind = bytes.toString('ascii', offset + 4, offset + 8), data = bytes.subarray(offset + 8, offset + 8 + length);
    if (kind === 'tEXt' && data.subarray(0, data.indexOf(0)).toString('latin1') === keyword) return JSON.parse(data.subarray(data.indexOf(0) + 1).toString('latin1'));
    offset += length + 12;
  }
  throw new Error('Missing PNG text block: ' + keyword);
}

/**
 * 新共用输入的回归同时检查受控文本、三千字限长与真实助手入口。
 * 手动输入通过 DOM input 事件进入领域 store，再用预设覆盖验证反向同步。
 * 负面词从原折叠区进入，确认编辑指令和负面词没有共享错误的上下文。
 * 只验证本地交互，不请求翻译服务，也不把一个图标当成翻译服务已联通。
 */
async function checkSharedInputs(ctx) {
  // 该用例验证组件层限长，而不是只验证工作流 builder 的最终裁剪。
  // 受控编辑指令必须在页面上先形成三千字正文，再交给后续提交流程。
  // 负面词单独填写，用来确认两个输入各自拥有独立的 assistant contextId。
  // 截图只作人工核对，断言仍读取 DOM 和真实控件属性，避免视觉证据代替行为证据。
  // 用例完成后恢复滚动位置，后续模型选择操作不能因测试滚动停在折叠区而失效。
  // 长度故意超过一，确认组件会同步修正正文与字数，而不只是显示警告。
  // 恢复真实背景预设后继续后面的工作流检查，避免超长夹具污染推理参数。
  // 负面词选择明确普通文本，可在提交图中继续核对其真实编码输入。
  // 助手上下文 id 独立，正反向各一个，不靠创建两个装饰图标通过。
  await fill(ctx, '[data-anima-instruction]', 'x'.repeat(3001));
  ctx.smoke.check('Shared edit input enforces its controlled text limit', await ctx.run("document.querySelector('[data-anima-instruction]').textContent.length===3000&&document.querySelector('[data-anima-instruction]').getAttribute('role')==='textbox'"));
  await ctx.click('[data-anima-preset=background]');
  await fill(ctx, '#anima-edit-negative', 'edit negative fixture');
  // 预设必须直接替换可编辑正文，旧的三千字内容不能残留在隐藏 DOM。
  // 负面助手沿用同一真实组件，异步翻译能力由原助手专项验证。
  // 输入背景与边框仍来自主题 token，不使用 textarea 的平台默认外观。
  // 截图前仅滚动表单内容，固定 footer 与主画布的布局均不改变。
  ctx.smoke.check('Instruction and negative reuse the functional prompt assistant', await ctx.run("document.querySelector('[data-anima-instruction]').textContent.includes('樱花')&&document.querySelector('#anima-edit-negative').textContent==='edit negative fixture'&&!!document.querySelector('[data-prompt-assistant=anima-edit-instruction] [data-assistant-options]')&&!!document.querySelector('[data-prompt-assistant=anima-edit-negative] [data-assistant-options]')"));
  await ctx.run("document.querySelector('[data-anima-instruction]').scrollIntoView({block:'center'})"); await ctx.shot('anima-edit-shared-inputs');
  await ctx.run("document.querySelector('[data-anima-form] fieldset').parentElement.scrollTop=0");
}

/**
 * 通过真实 nav 返回创建页并选择编辑，不假设本地模式状态能跨路由保留。
 * 路由卸载是本次回归的关键前提，不能用显示隐藏代替。
 * 等待真实组件出现后再操作，避免转场过程中点击退出页面的旧节点。
 * 未等待到目标会响亮失败，不把导航失败当成状态恢复成功。
 */
async function returnToEdit(ctx) {
  // sidebar 常驻在 AppShell，路径点击由产品 Next router 接管。
  // 不能 loadURL 整页重载，否则会销毁整个进程内模块状态而改变测试命题。
  // 等待 pathname 和模式标签同时成立，确认目标页面完成实际挂载。
  // 编辑模式本身是创建页本地选择，重进时显式选择它是正常用户操作。
  await ctx.click('[data-app-nav] a[href="/create"]'); await ctx.wait("location.pathname==='/create'&&document.querySelector('[data-create-mode-tabs]')");
  await ctx.run("[...document.querySelectorAll('[data-create-mode-tabs] button')].find(b=>b.textContent.trim()==='编辑').click()"); await ctx.wait("document.querySelector('[data-anima-run]')");
}

/**
 * 进入正式编辑标签，确认没有额外第三列挤占参考图所需的功能展示区。
 * 无原图提交必须在本地停止，不能出现上传或生成 IPC。
 * 错误值输入后恢复合法图片，证明错误不是只能通过刷新清除。
 * 导入原图后默认仍显示结果空态，必须显式切换才能看到原图。
 * 这对照能发现直接把输入图当结果显示的伪成功行为。
 * 快捷指令只填文本，不增加上传次数或生成请求。
 * 默认编辑 LoRA 必须显示在标准已选列表中，强度修改沿用公共控件。
 * 模型与 LoRA 入口使用真实资源选择器，不能渲染一组不工作的样例卡片。
 */
async function checkInput(ctx, source) {
  // before 允许默认套件先执行普通图片生成，新增检查只比较自己的请求增量。
  // 进入标签通过用户看到的按钮文本完成，不能直接修改 createMode store。
  // 等待 data-anima-run 确认正式组件已经挂载，不根据固定延时猜测切换完成。
  // 宽度检查确认编辑器真正参与布局，而非只在隐藏 DOM 里保留一个空节点。
  // 原 side 必须隐藏，为两列编辑画布释放整个内容展示区。
  // 蒙版标签同时存在，用于发现新工具接入时误删原编辑功能的回归。
  const { run, wait, click, smoke, requests, uploads } = ctx, before = requests.length;
  await run("[...document.querySelectorAll('[data-create-mode-tabs] button')].find(b=>b.textContent.trim()==='编辑').click()"); await wait("document.querySelector('[data-anima-run]')");
  smoke.check('Text editing fills main with the original mask tool still reachable', await run("document.querySelector('[data-anima-edit]').getBoundingClientRect().width>0&&getComputedStyle(document.querySelector('[data-create-side]')).display==='none'&&!!document.getElementById('mask-edit-tab')"));
  await click('[data-anima-run]'); smoke.check('Missing source is rejected before upload or generation', requests.length === before && uploads.length === 0 && await run("document.querySelector('[data-anima-status]').textContent.includes('原图')"));
  // 先触发缺原图再导入坏文件，专门覆盖旧运行错误遮盖新导入错误的顺序问题。
  // text/plain 与 .png 文件名冲突，必须按真实 MIME 拒绝而不是只信任后缀。
  // 等待新提示也能确认导入 handler 确实执行，不能用初始空态冒充拒绝结果。
  // 同时检查上传与生成次数，避免展示错误后仍继续产生远端副作用。
  await importFile(ctx, Buffer.from('not an image'), 'text/plain'); await wait("document.querySelector('[data-anima-status]').textContent.includes('25 MB')");
  smoke.check('Invalid image is rejected without server upload', uploads.length === 0 && requests.length === before);
  // 合法图片跟随失败导入，验证界面能在同一会话恢复，不要求刷新或重新进页。
  // naturalWidth 验证字节实际解码，而不是仅出现了一个带 src 的 img 标签。
  // 原图为 64×32，和后续模拟生成的 640×320 可明确区分。
  // 结果空态必须保留，下载按钮不得因已有输入素材就启用。
  await importFile(ctx, source); await wait("document.querySelector('[data-anima-source] img')?.naturalWidth===64");
  smoke.check('Imported original does not masquerade as a generated result', await run("!!document.querySelector('[data-anima-empty]')&&document.querySelector('[data-anima-download]').disabled"));
  await click('[data-anima-view=original]'); await wait("document.querySelector('[data-anima-stage] img')?.naturalWidth===64");
  // 显式看原图可以出现输入图；切回结果仍应为空，不能共用同一个展示数据槽。
  // 预设只修改指令，不连接服务，也不把当前原图自动排队。
  // 默认 LoRA 数量精确为一，避免预载逻辑在重新渲染时不断追加。
  // 添加入口必须是公共扩展选择器，保证后面的额外 LoRA 测试走真实 UI。
  await click('[data-anima-view=result]'); await wait("document.querySelector('[data-anima-empty]')");
  await click('[data-anima-preset=background]');
  smoke.check('Instruction presets do not submit and edit LoRA is preloaded visibly', requests.length === before && uploads.length === 0 && await run("document.querySelector('[data-anima-instruction]').textContent.includes('樱花')&&document.querySelectorAll('[data-anima-models] [data-selected-extension]').length===1&&!!document.querySelector('[data-anima-models] [data-extension-picker-trigger]')"));
}

/**
 * 在实际资源窗口选择不同 UNet，并在已预载编辑 LoRA之外追加一个本地 LoRA。
 * 这一步防止“可打开选择器”掩盖“提交仍使用固定默认文件”的实现错误。
 * 通过公共权重编辑框修改预载项，后面的工作流断言验证该值真正进入节点。
 * 采样器与调度器使用自定义 OptionSelect 菜单，不能用浏览器默认 select 替代。
 * 同时修改 Seed，保证比较的是用户设置而不是刚好相同的模板默认值。
 * 每个选择都通过正式按钮确认，未注入内部 store 或改写工作流对象。
 */
async function checkChoices(ctx) {
  // 主模型选择不消耗新的上传调用，网络副作用仍只由运行入口触发。
  // LoRA 权重编辑会失焦提交，Enter 用例避免依赖随后的偶然按钮点击才写入。
  // 本测试不校验所有采样器组合能生成，它校验共享枚举参数能正确传递。
  // 也不判断不同 UNet 与编辑 LoRA 的语义兼容性，真实模型联调需单独进行。
  // 公共选择器的取消、搜索和多选回归由外层完整创建页套件继续执行。
  // 这里使用资源实际字段和值，不从截图里的模型图片识别任何参数。
  // 本地扫描夹具提供 Custom Anima，与模板 aesthetic 默认名称不同。
  // 真正选中不同 UNet 才能发现“界面变了但工作流仍固定”的参数传递缺陷。
  // 主模型窗口内选择与 footer 确认分别执行，取消/草稿契约仍由原组件保留。
  // wait 等待真实选择窗口出现，避免页面切换过渡中点到背景旧按钮。
  const { run, click, wait } = ctx;
  await click('[data-anima-models] [data-model-cover-select]'); await wait("document.querySelector('[aria-labelledby=model-select-dialog-title] [data-resource-confirm]')");
  await run("[...document.querySelectorAll('[aria-labelledby=model-select-dialog-title] button')].find(b=>b.textContent.trim()==='选择').click()"); await click('[aria-labelledby=model-select-dialog-title] [data-resource-confirm]');
  // 添加窗口仍带已有预载项，但本次选择另一实际本地文件作为追加 LoRA。
  // 两个 Style 版本故意归在同分类，要求原有嵌套模型选择功能也能复用。
  // 不在测试中直接向 selectedExtensions 写入数据，否则看不到菜单接线问题。
  // 第一个真实版本 a.safetensors 与默认 AnimeEditV2 的名字明确不同。
  await click('[data-anima-models] [data-extension-picker-trigger]'); await wait("document.querySelector('[aria-labelledby=extension-select-dialog-title] [data-resource-confirm]')");
  // 分类里有两个实际文件，先进入原版模型页选择第一项，再确认外层草稿。
  // 单选返回分类页不代表提交，缺少外层确认会让工作流仍只有预载 LoRA。
  await click('[aria-labelledby=extension-select-dialog-title] [data-resource-model-picker]');
  await wait("document.querySelector('[data-resource-model-select]')"); await click('[data-resource-model-select]');
  await wait("!document.querySelector('[data-resource-model-select]')"); await click('[aria-labelledby=extension-select-dialog-title] [data-resource-confirm]');
  // 预载项权重通过原版双击数值框编辑，验证它不是只读的固定强度字段。
  // native setter 输入 0.8 后按 Enter，要求公共编辑框提交草稿。
  // 下一步工作流检查读取 strength_model，不能只比对界面显示字符串。
  // 高级区通过共用折叠按钮展开，不直接修改组件内部状态。
  // heun/karras 与默认 euler_ancestral/simple 不同，可发现字段未传递的回归。
  // seed 选固定且非默认的 123456，使模拟请求每次可确定比较。
  // 两个 OptionSelect 都通过正式 listbox 选项完成，不用默认 select API 绕过 UI。
  await run("document.querySelector('[data-anima-models] [data-selected-extension] p span').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))"); await fill(ctx, '[data-anima-models] [data-selected-extension] input', '0.8'); await run("document.querySelector('[data-anima-models] input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
  await run("document.querySelector('[data-anima-form] [data-advanced-settings-toggle]').click()");
  await click('[data-anima-form] button[aria-label=采样器]'); await click('[data-anima-form] [role=option][data-value=heun]');
  await click('[data-anima-form] button[aria-label=调度器]'); await click('[data-anima-form] [role=option][data-value=karras]'); await fill(ctx, '[data-anima-seed]', '123456');
}

/**
 * 操作数量始终按调用前增量计算，兼容在已有文生图回归之后执行。
 * 缺少服务端编辑 LoRA时必须在上传之前拒绝，而非把缺模型交给假成功回包。
 * 恢复模型列表后使用同一表单重试，证明错误状态可恢复。
 * 上传回包故意改名并带子目录，实际 LoadImage 必须使用回包路径。
 * 模型子目录与模板不同，最终 UNet 路径应来自实时服务端列表。
 * 标准文生图采样器与 LoRA 注入链必须经过参考节点，不能覆盖成旧固定模型链。
 * 当前结果来自纯解码输出，不得包含 ImageStitch。
 * 运行中左栏禁用但停止入口可用，防止修改本次已冻结的原图和参数。
 * 结果由本地 PNG 夹具模拟，只验证 UI、IPC 与 Meta 契约，不声明真实推理效果。
 */
async function checkExecution(ctx) {
  // 先让服务端 LoRA 列表为空，本地选择仍存在，用来模拟文件被移走的场景。
  // 预期本地存在性检查拒绝，上传和生成计数都不变。
  // 若仅生成后收到错误，上传计数会增加，因此无法通过这个负向对照。
  // 恢复列表不重新导入原图或重填指令，证明错误状态可直接修正重试。
  const { run, click, wait, smoke, requests, uploads, savedPayloads } = ctx, before = requests.length, uploadCount = uploads.length;
  // 超出安全整数的 seed 若被 Number 默默取整，会让用户以为复现用了自己输入的值。
  // 此负向输入故意只比安全上限大一，区别格式拒绝与空输入错误。
  // 仍通过真实文本框填写，确保限制不仅存在于脱离 UI 的工具函数。
  // 错误需要明确提到 Seed，不能被上一轮的导入或运行提示遮住。
  // 非法参数必须在任何模型生成或图片上传之前停止。
  // 成功拒绝后恢复刚才用户选定的 123456，为后续正向链路保持明确前置。
  // 不重载组件验证修复输入能直接重试，避免把一次性错误做成不可恢复状态。
  // 计数快照来自本函数入口，当前场景没有生成请求可以靠假回包兜底。
  await fill(ctx, '[data-anima-seed]', '9007199254740992'); await click('[data-anima-run]'); await wait("document.querySelector('[data-anima-status]').textContent.includes('Seed')");
  smoke.check('Unsafe integer seed is rejected before upload and submission', requests.length === before && uploads.length === uploadCount);
  await fill(ctx, '[data-anima-seed]', '123456');
  ctx.setModels(false); await click('[data-anima-run]'); await wait("!document.querySelector('[data-anima-run]').disabled");
  smoke.check('Missing model prevents upload and generation', requests.length === before && uploads.length === uploadCount && await run("document.querySelector('[data-anima-status]').textContent.includes('AnimeEditV2')"));
  ctx.setModels(true); await click('[data-anima-run]');
  // 主进程轮询使用有界 timer，不依赖窗口可见性敏感的 requestAnimationFrame。
  // requests 增量精确为一，连续状态更新不能导致重复提交。
  // 超过等待上限直接抛错，不把迟迟没有 IPC 当成“没有异常”的成功。
  for (let attempt = 0; attempt < 100 && requests.length === before; attempt++) await new Promise(resolve => setTimeout(resolve, 60));
  if (requests.length !== before + 1) throw new Error('Text edit did not reach generate IPC');
  const prompt = requests.at(-1), nodes = Object.values(prompt), sampler = nodes.find(n => n.class_type === 'KSampler'), reference = nodes.find(n => n.class_type === 'ApplyCosmosReferenceLatent');
  // 读到的是 handler 收到的完整 prompt，不能引用产品 builder 给自己生成预期结果。
  // sampler.model 必须指向参考节点，而不是直接绕过参考补丁连接 LoRA。
  // 参考节点必须接最后一个 LoRA 101，101 再接预载项 100，验证完整链顺序。
  // 编辑 LoRA 的强度 0.8 必须来自刚才的 UI 操作，不能仍固定为一。
  // 额外 LoRA 名称必须映射到服务端 edit 子目录，不保留本地临时绝对路径。
  // UNet 必须是所选 custom 文件，不能只是默认文件存在于模型列表就算正确。
  // sampler、scheduler 与 seed 都要匹配用户值，防止仅模型选择接通。
  // ImageStitch 不应存在，原图与结果不被后端拼成一个下载文件。
  smoke.check('Text edit submits chosen UNet, stacked LoRAs and custom sampler through the image builder', sampler && reference && sampler.inputs.model[0] === 'edit-reference' && reference.inputs.model[0] === '101' && prompt['101'].inputs.model[0] === '100' && prompt['100'].inputs.lora_name === 'edit/AnimeEditV2.safetensors' && prompt['100'].inputs.strength_model === 0.8 && prompt['101'].inputs.lora_name === 'edit/a.safetensors' && sampler.inputs.sampler_name === 'heun' && sampler.inputs.scheduler === 'karras' && sampler.inputs.seed === 123456 && nodes.some(n => n.class_type === 'UNETLoader' && n.inputs.unet_name === 'edit/custom_unet.safetensors') && !nodes.some(n => n.class_type === 'ImageStitch'));
  smoke.check('Upload reply filename is submitted and running form is locked', prompt['edit-source'].inputs.image === 'anima-input/server-renamed.png' && await run("document.querySelector('[data-anima-run]').disabled&&!document.querySelector('[data-anima-stop]').disabled&&!document.querySelector('[data-anima-instruction]').isContentEditable"));
  // 上传夹具故意返回 server-renamed.png 与子目录，断言能发现误用请求名。
  // 运行中直接检查 isContentEditable，fieldset 禁用本身不能锁住可编辑 div。
  // 停止入口必须保持可操作，不能因外层 fieldset 禁用而一并失效。
  // 输出使用另一组真实像素尺寸的 PNG，结果尺寸不能误取输入的 64×32。
  // nodeId 对应基础图片流的 PreviewImage，不沿用旧独立模板的 297。
  // nativeImage 的文件解码不保证支持 WebP，使用原生 PNG 素材避免制造空输入。
  // 该封面仅是模拟回包，断言关注尺寸与字节契约，不评价生成内容。
  const dataUrl = nativeImage.createFromBuffer(fs.readFileSync(path.join(__dirname, '../../apps/next/src/assets/icon/create/model.png'))).resize({ width: 640, height: 320 }).toDataURL();
  // 先在生成仍未返回时查看公共任务卡片，证明编辑没有绕过现有任务列表。
  // 记录真实卡片 id，与后续切页和完成后的同一任务对照。
  // 打开的是正式标题栏入口，不从 store 注入或读内部变量充当 UI 证据。
  // 此时模拟服务保持 pending，正常运行的请求数不应因为导航增加。
  // 公共计数应恰好为一；早先失败的终态记录不能被算进活动数量。
  // 正式任务卡片中必须包含本次具体指令，不能只是通用“生成中”提示。
  // 抽屉打开不会创建新请求，handler 计数继续作为副作用的独立证据。
  // 保存 id 供终态追踪，避免后面的历史页误检查到另一张旧卡片。
  await click('[data-window-generation]'); await wait("document.querySelector('[data-generation-task-status=generating]')");
  await run("window.__editTaskId=document.querySelector('[data-generation-task-status=generating]').dataset.generationTask");
  // 提示词和活动数量同时成立才通过，避免将旧任务卡片误当成本次编辑。
  // 卡片内容来自实际提交摘要，测试不从编辑草稿重新拼一份预期界面。
  // 后续路由测试继续跟踪同一请求，不为每个场景重新启动服务夹具。
  smoke.check('Text editing appears in the shared task list immediately', await run("document.querySelector('[data-generation-task-status=generating]').textContent.includes('樱花')&&document.querySelector('[data-window-generation-count]').textContent==='1'"));
  await click('#window-generation-center button[aria-label=关闭]');
  // 真正跨 Next 路由会卸载创建页；只在蒙版 tab 间切换无法证明修复。
  // 生成回包仍未释放，所以离开或返回都不能触发取消接口。
  // 返回后重新进入编辑模式，核对草稿、模型和真实忙碌状态恢复。
  // 记录取消数量作为负向证据，界面显示 loading 不足以说明远端仍在执行。
  // 取消记录由主进程夹具捕获，组件卸载意外调用 cancel 时这里能观察到。
  // 比较增量而非总数为零，允许先前用例确实执行过合法停止。
  // /inspect 是正式应用路由，导航成功要求编辑 DOM 已离开文档。
  // 单独检查徽标可确认不在创建页时任务仍被全局状态订阅。
  const cancelCount = ctx.cancellations.length;
  await click('[data-app-nav] a[href="/inspect"]'); await wait("location.pathname==='/inspect'&&!document.querySelector('[data-anima-run]')");
  smoke.check('Generation survives leaving the creation route', ctx.cancellations.length === cancelCount && requests.length === before + 1 && await run("document.querySelector('[data-window-generation-count]').textContent==='1'"));
  // 回到编辑页不重新导入素材、不重新选模型，恢复依靠正式领域状态。
  // 原图 naturalWidth 为64，与生成回包640严格区分，不能检查错图片。
  // 两个扩展来自前面的真实选择器操作，验证用户额外 LoRA 没有丢失。
  // 按钮仍禁用证明回到的是正在执行的任务，而不是新建的空闲会话。
  await returnToEdit(ctx);
  smoke.check('Returning restores running task, source and selected parameters', await run("document.querySelector('[data-anima-run]').disabled&&document.querySelector('[data-anima-instruction]').textContent.includes('樱花')&&document.querySelector('[data-anima-source] img').naturalWidth===64&&document.querySelectorAll('[data-anima-models] [data-selected-extension]').length===2") && ctx.cancellations.length === cancelCount);
  // 再次离开后释放成功回包，验证保存与结果更新不需要编辑组件挂载。
  // 完成通知来自 AppShell 常驻组件，能确认任务在其他路由仍完成到落盘阶段。
  // 返回后下载应直接可用，无需重传素材或点击第二次运行。
  // 真实请求数必须保持一条，防止“恢复”实际创建了重复任务。
  await click('[data-app-nav] a[href="/inspect"]'); await wait("location.pathname==='/inspect'&&!document.querySelector('[data-anima-run]')");
  ctx.resolve({ promptId: 'text-edit-result', images: [{ nodeId: '8', filename: 'edited.png', subfolder: '', folderType: 'temp', dataUrl }], videos: [] });
  // 成功提示只有收到保存回包后出现，不能把 ComfyUI 的生成回包当保存完成。
  // 此时编辑 DOM 不存在，所以状态更新必须来自常驻任务而非局部 effect。
  // 图片预览 URL 返回后还应可解码，能发现卸载 cleanup 错误 revoke 的回归。
  // handler 请求数不增加，证明恢复结果没有通过偷偷重新生成来实现。
  await wait("document.querySelector('[data-generation-notice=success]')");
  await returnToEdit(ctx);
  await wait("!document.querySelector('[data-anima-run]').disabled&&!document.querySelector('[data-anima-download]').disabled");
  // 按钮解锁早于 img 完成异步解码，完整套件图片较多时两者不能视为同一时刻。
  // 必须等待真实 naturalWidth，不能以保存成功或存在 img 标签代替可显示结果。
  // 使用既有有界 wait，解码失败会明确失败，不引入无限等待或固定长延时。
  await wait("document.querySelector('[data-anima-stage] img')?.naturalWidth===640");
  smoke.check('Editing finishes away from the route and restores its downloadable result', requests.length === before + 1 && ctx.cancellations.length === cancelCount && await run("document.querySelector('[data-anima-stage] img')?.naturalWidth===640"));
  const saved = savedPayloads.at(-1), embedded = pngText(saved.files[0].dataBase64, 'prompt'), marker = pngText(saved.files[0].dataBase64, 'illusionRealmMeta');
  // 等待下载可用意味着执行器已处理保存返回，不能在仍生成时读取空 payload。
  // 精确 JSON 对比覆盖节点和输入，不能只检查文件包含某个模型名字。
  // 版本标记要求独立块，保持与当前图片 Meta 格式约定一致。
  // saved.output 需要非空，证明保存请求有明确目标目录。
  // 模拟保存只返回路径，不证明本机真实文件权限、磁盘空间或编码写入成功。
  // contain 的实际 computedStyle 用于发现 CSS 覆盖，不能只匹配 class 字符串。
  smoke.check('Saved editing output keeps the exact submitted workflow and independent Meta version', JSON.stringify(embedded) === JSON.stringify(prompt) && marker.version === 1 && saved.output);
  smoke.check('Actual output dimensions are decoded and result keeps contain geometry', await run("document.querySelector('[data-anima-dimensions]').textContent==='640 × 320'&&getComputedStyle(document.querySelector('[data-anima-stage] img')).objectFit==='contain'"));
}

/**
 * 普通图片和编辑必须使用同一串行队列，不能只是把卡片补到列表。
 * 普通图片夹具持续等待，编辑提交只能排队，不能提前上传或创建生成 IPC。
 * 先撤回一次排队编辑，确认没有上传副作用也没有后端取消调用。
 * 再次提交后结束前一个普通任务，下一次实际 IPC 才允许出现编辑工作流。
 * 全部通过真实模式标签、按钮和公共任务卡片操作，测试不访问调度器内部。
 * 固定 PNG 回包只用于验证契约，不运行 GPU，也不证明真实模型质量。
 */
async function checkSharedQueue(ctx) {
  // 这组断言把普通图片作为前置任务，直接验证两种工作流共享一个 drain。
  // 编辑任务的 queued 状态必须来自全局 store，而不是编辑表单自己的 loading 文案。
  // 撤回测试在前一个任务仍 pending 时执行，才能证明没有提前上传源文件。
  // 完成前置任务后再观察第二次请求，区分“排队显示”与“真正放行”。
  // 路由切换覆盖组件卸载，不能用同页 tab 隐藏替代用户实际离开创建页。
  // 失败场景保留任务卡片，后续断言读取终态而不是清空 store 后重新开始。
  const { run, click, wait, requests, uploads, smoke } = ctx;
  // 请求、上传、取消分别取进入本场景时的快照，不受前一成功用例干扰。
  // 这三个独立计数区分“排队”“已上传”“远端停止”三个不同阶段。
  // 测试结束保留正常历史记录，和产品实际任务列表的行为一致。
  // 不清空全局任务 store，避免把列表恢复缺陷掩盖在测试重置中。
  const count = requests.length, uploadCount = uploads.length, cancelCount = ctx.cancellations.length;
  // 从当前编辑草稿切到图片，组件会卸载，但原图、LoRA 与参数应保留。
  // 普通图片只发一张，前面用例已经恢复数量选择为一。
  // 明确填写一条新提示词，让队列摘要可区别于编辑指令。
  // 输入仍走原有命令式 DOM 契约，验证提取共用组件没有破坏普通生成。
  await run("[...document.querySelectorAll('[data-create-mode-tabs] button')].find(b=>b.textContent.trim()==='图片').click()"); await wait("document.querySelector('[data-generate-button]')");
  // 普通图片提示词由共享组件的无 value 模式保存，直接工具写入仍应有效。
  // 显式点击按钮经过原参数构建器，不能直接调用队列函数制造前置任务。
  // 前一测试已恢复真实模型资源，普通生成的前置模型校验应自然通过。
  // 请求不出现就明确失败，不把无法建立前置队列算作跳过成功。
  await run("document.getElementById('prompt-editor').textContent='queue ordering fixture';document.querySelector('[data-generate-button]').click()");
  for (let n = 0; n < 100 && requests.length === count; n++) await new Promise(resolve => setTimeout(resolve, 60));
  if (requests.length !== count + 1) throw new Error('Image task did not start before queued editing');
  // 编辑组件重建后仍须恢复两个 LoRA 和原图，不能靠用户再次导入绕过生命周期。
  // 此时后台普通任务尚未完成，所以编辑按钮的提交只应新增 queued 卡片。
  // 等待可见的排队文字，而不是仅靠一个固定延时推测任务已入队。
  // 上传计数必须不变，这能发现适配器在真正放行前就上传的错误。
  await run("[...document.querySelectorAll('[data-create-mode-tabs] button')].find(b=>b.textContent.trim()==='编辑').click()"); await wait("document.querySelector('[data-anima-run]')"); await click('[data-anima-run]');
  await wait("document.querySelector('[data-anima-status]').textContent.includes('排队')"); await click('[data-window-generation]'); await wait("document.querySelector('[data-generation-task-status=queued]')");
  smoke.check('Image and edit tasks share one FIFO without early edit upload', requests.length === count + 1 && uploads.length === uploadCount && await run("document.querySelectorAll('[data-generation-task-status=generating]').length===1&&document.querySelectorAll('[data-generation-task-status=queued]').length===1"));
  // 公共卡片撤回排队项，不能发送针对正在运行图片任务的 interrupt。
  // 卡片消失后表单应解锁，同时普通图片的生成请求仍未结束。
  // 零上传和零取消增量形成配对，不把“没有保存结果”当作撤回成功的唯一证据。
  // 再次排队前关闭任务浮层，保证点击的是用户可见的正式表单按钮。
  // 撤回使用 queued 卡片自己的 id，不能只点击“停止全部”后观察空列表。
  // 当前普通图保持 pending，故无后端取消增量意味着没有误中断活动任务。
  // 表单重新可用后还要再次提交，证明撤回释放了编辑草稿的门闩。
  // 再次提交会产生新 id，不应复用已 abort 的旧 controller。
  await click('[data-generation-task-status=queued] [data-generation-cancel]'); await wait("!document.querySelector('[data-anima-run]').disabled");
  smoke.check('Withdrawing pending edit neither uploads nor interrupts the running image task', uploads.length === uploadCount && requests.length === count + 1 && ctx.cancellations.length === cancelCount);
  await click('#window-generation-center button[aria-label=关闭]'); await click('[data-anima-run]'); await wait("document.querySelector('[data-anima-status]').textContent.includes('排队')");
  // queued 的第二次提交仍使用原来素材；结束前一项后才进入上传与生成。
  // 原普通图输出节点是 PreviewImage 9，编辑图输出节点则为 8。
  // 两种节点分别回包，不能用同一假对象绕过不同工作流的结果筛选。
  // 先等待编辑 IPC，再断言源节点存在，证明真正轮到了编辑执行器。
  const dataUrl = nativeImage.createFromBuffer(fs.readFileSync(path.join(__dirname, '../../apps/next/src/assets/icon/create/model.png'))).resize({ width: 640, height: 320 }).toDataURL();
  ctx.resolve({ promptId: 'queue-image', images: [{ nodeId: '9', filename: 'queue-image.png', subfolder: '', folderType: 'output', dataUrl }], videos: [] });
  for (let n = 0; n < 100 && requests.length === count + 1; n++) await new Promise(resolve => setTimeout(resolve, 60));
  // 观察到新的真实 IPC 后再核对编辑源节点，避免只检查列表排列的假串行。
  // uploads 增量恰好一，第一次撤回的编辑不能留下延迟上传。
  // requests 增量恰好二，分别对应普通图和重新排队的编辑图。
  // 取消的第一次编辑不应该贡献任何生成请求或产生一份隐藏输出。
  smoke.check('Edit is submitted only after the previous image has completed', requests.length === count + 2 && uploads.length === uploadCount + 1 && !!requests.at(-1)['edit-source']);
  // 编辑任务主动停止收尾，后续断线与布局检查不能留下尚在运行的夹具 Promise。
  // 这里的停止走正式表单入口，远端取消回包由既有隔离 handler 控制。
  // 本用例验证串行次序和撤回，不将其描述成客户端完整重启恢复测试。
  await click('[data-anima-stop]'); await wait("!document.querySelector('[data-anima-run]').disabled");
}

/**
 * 停止在生成等待期间触发，模拟主进程确认指定 requestId 已停止。
 * 确认请求标识非空，不能仅隐藏忙碌 UI 而不请求后端。
 * 取消后不得落盘新的结果，也不能保留“已生成”状态。
 * 第二次模拟断线使用 IPC 错误码，区别用户主动停止与异常中断。
 * 两种失败都必须重新启用运行入口，使用户可修复服务后重试。
 * 错误测试不伪造 GPU 中断、真实网络断开或 ComfyUI queue 行为。
 * 它覆盖产品消费已有安全桥接返回值的边界，服务端会话由既有专项测试负责。
 */
async function checkFailures(ctx) {
  // 取消回包为空图片，若执行器漏掉 aborted 检查，会落入无结果而非真正取消路径。
  // 因此还验证后端取消标识，不能仅凭“没有保存”判定主动停止实现完整。
  // 断线 fixture 的错误正文只是诊断标记，用户反馈由已知错误码翻译。
  // 不把模拟取消完成耗时写成性能指标，测试没有真实网络或 GPU 调度等待。
  // 测试没有杀死服务进程，不会影响开发者当前正在运行的 ComfyUI。
  // 原主进程的请求隔离、取消其他客户端保护由 verify-comfy-generation 独立验证。
  // 两轮均从同一配置重试：第一轮在等待生成时停止，第二轮模拟服务断开。
  // 每轮保存计数单独快照，取消后上一轮成功记录不能掩盖新一次误写入。
  // 开始运行时旧结果应清空，因此失败后下载必须禁用。
  // 取消 fixture 只确认取消调用，不实际运行 GPU，也不证明远端物理中断速度。
  // 断线通过 COMFY_DISCONNECTED 错误码进入已有 IPC 包装，仍走正式错误消费路径。
  // 这里验证的是页面异常反馈与禁止伪成功，网络存活性由主进程专项覆盖。
  const { run, click, wait, smoke, requests, cancellations, savedPayloads } = ctx;
  for (const cancelled of [true, false]) {
    const count = requests.length, saved = savedPayloads.length;
    await click('[data-anima-run]'); for (let n = 0; n < 100 && requests.length === count; n++) await new Promise(resolve => setTimeout(resolve, 60));
    if (requests.length !== count + 1) throw new Error('Retry did not reach ComfyUI fixture');
    // 明确等到 generate handler 被调用后再停止，确保覆盖的是远端取消分支。
    // 如果太早点击，只会测到本地 AbortSignal，无法证明取消 API 接线存在。
    // cancellations 记录 requestId，非空标识是停止准确定位任务的最小契约。
    // 停止与断线都等恢复运行按钮后再断言，覆盖 finally 清理门闩的行为。
    // 状态文字必须非空，用户不能只看到按钮恢复却不知道上一轮为何结束。
    if (cancelled) await click('[data-anima-stop]'); else ctx.reject(Object.assign(new Error('fixture disconnected'), { code: 'COMFY_DISCONNECTED' }));
    await wait("!document.querySelector('[data-anima-run]').disabled");
    smoke.check(cancelled ? 'Stop reaches backend with request id and saves no result' : 'Disconnect restores form and saves no false success', savedPayloads.length === saved && (!cancelled || cancellations.at(-1)?.length > 0) && await run("document.querySelector('[data-anima-download]').disabled&&document.querySelector('[data-anima-status]').textContent.length>0"));
  }
  // 用户明确要求编辑 LoRA 仅预载，因此再验证移除全部扩展后的真实提交。
  // 仅看到删除按钮不足以证明可移除，builder 可能偷偷补回默认 LoRA。
  // 一次移除两个已选项，公共函数式更新应保留每次删除而不互相覆盖。
  // 通过原有 aria-label 识别行内删除按钮，不能直接修改扩展数组。
  // 移除后先等待 DOM 行数归零，再提交下一次生成。
  // 只有列表真空才测试，避免把未完成的 React 更新误判为 builder 缺陷。
  // 新生成仍使用前面所选 custom UNet 和参考图，不回退到另一种模式。
  // 本次缺省 LoRA 的模型补丁必须直接接 UNETLoader 输出。
  // 检查被引用节点的 class_type，比硬编码基础 UNet 编号更能表达语义。
  // 同时排除所有 LoraLoaderModelOnly，防止多余孤立节点仍残留在图中。
  // 无 LoRA 只证明参数和结构允许删除，不承诺模型不带编辑 LoRA 时的画质。
  // 参考节点仍不可移除，它承担本工具输入图像的模型参考机制。
  // 这一请求无需假造成功结果，检查提交后主动停止即可完成契约验证。
  // 停止复用正式入口，测试结束不能留下 pending Promise 影响后续用例。
  // 本次检查不重新打开页面，能发现组件渲染后自动补回默认项的错误。
  // 空态添加入口仍保留，用户后续可以重新选择编辑 LoRA 或其他扩展。
  await run("document.querySelectorAll('[data-anima-models] [data-selected-extension] button[aria-label]').forEach(b=>b.click())"); await wait("document.querySelectorAll('[data-anima-models] [data-selected-extension]').length===0");
  const count = requests.length; await click('[data-anima-run]');
  for (let n = 0; n < 100 && requests.length === count; n++) await new Promise(resolve => setTimeout(resolve, 60));
  if (requests.length !== count + 1) throw new Error('Editing without LoRAs did not reach generation');
  const prompt = requests.at(-1), reference = Object.values(prompt).find(node => node.class_type === 'ApplyCosmosReferenceLatent');
  smoke.check('Removing preloaded and extra LoRAs submits a reference chain directly from chosen UNet', !Object.values(prompt).some(node => node.class_type === 'LoraLoaderModelOnly') && prompt[reference.inputs.model[0]].class_type === 'UNETLoader');
  await click('[data-anima-stop]'); await wait("!document.querySelector('[data-anima-run]').disabled");
}

/**
 * 骰子只是启用随机模式；生成请求仍必须来自显式点击生成。
 * 在测试页面暂时替换随机源，让两次提交的 seed 有独立且确定的期望值。
 * 第一轮固定为四分之一区间，第二轮为四分之三区间，避免概率式断言。
 * 请求由真实 IPC 夹具捕获，不读取组件草稿充当已经发出的工作流。
 * 每轮用正式停止入口释放 pending 推理，不写入伪造结果。
 * finally 恢复原随机源和自定义模式，不污染后续资源与布局回归。
 */
// 随机源替换的表达式返回undefined，不能让executeJavaScript尝试克隆函数对象。
// 原始Math.random引用仅保存在测试页面window，不跨preload或IPC传输。
// 所有产品代码仍通过真实按钮和共享store响应，不暴露测试专用参数setter。
// 四分之一区间的期望为1073741824，四分之三区间为3221225472。
// 二者来自0到4294967295的闭区间，与产品helper没有函数复用。
// 若产品在点击骰子时仅生成一次，第二轮提交仍是旧值，会被明确拒绝。
// 若产品完全忽略random模式，先前固定123456也无法通过任一轮。
// 同时记录上传增量，骰子误触生成在远端副作用发生前后都可观察。
// 只用aria-pressed不能证明未生成，因此必须结合requests和uploads计数。
// 共用seed输入禁用表示用户无法误输入一个不会被采用的值。
// 展开高级区只在aria-expanded为false时点击，不用切换两次猜当前状态。
// 高级区使用正式按钮，避免修改details.open绕过组件状态。
// 每轮生成等待requests恰好增加一，完全没提交和重复提交均失败。
// 采样器从实际prompt节点查找，不读取settings草稿充当发出的参数。
// 停止后等待运行按钮解锁，保证上一轮pending请求已被释放。
// 每轮Math.random固定为不同常数，任务ID相关采样不会改变预期序列。
// 不依赖两次自然随机恰好不同，消除小概率偶发失败。
// finally即使断言抛错也恢复随机源，不能污染全局组件后续行为。
// 切回custom后继续保留123456，不能用随机结果覆盖用户记住的种子。
// 已存在的正向提交断言继续确认123456完整进入KSampler，不仅检查输入框。
// random状态跨工具共享，后面的蒙版和边缘检查不会建立第二份随机标志。
// 夹具最终仍不运行真实模型，种子验证仅代表提交参数契约。
// 这个检查不统计随机分布质量，只验证每次提交读取当前随机源。
// 测试不会把固定随机源写入产品源码或用户配置。
// 运行窗口由外层隔离目录持有，不改变用户正常应用进程。
// 错误提示与停止结果仍由现有会话逻辑处理，测试不手动清taskId。
// 本段仅新增确定性行为检查，保留此前错误输入和Meta保存回归。
// 请求快照在点击骰子前取得，不受之前成功和失败任务数量影响。
// 读取最后请求前要求计数增加，避免拿上一次旧prompt误判通过。
// 随机模式的输入占位不作为实际种子，实际值只能从提交工作流中确认。
// 按模式按钮切回custom也应是非submit操作，不能新增额外上传。
// 确认状态后下一步资源回归可继续使用原自定义值，无需重建整个页面。
async function checkRandomSeeds(ctx) {
  const { run, click, wait, smoke, requests, uploads } = ctx;
  const before=requests.length, uploaded=uploads.length;
  // 只替换 Math.random，不接管产品提交函数或模型构建器。
  // 随机源还可能用于任务 id，因此按一轮固定值而非计数器顺序返回。
  // 两轮由停止分隔，确保公共串行队列不会混淆请求归属。
  await run("void(window.__originalSeedRandom=Math.random)");
  try {
    await click('[data-anima-form] [data-random-seed]');
    smoke.check('Dice enables random mode without submitting or uploading',requests.length===before&&uploads.length===uploaded&&await run("document.querySelector('[data-anima-form] [data-random-seed]').getAttribute('aria-pressed')==='true'"));
    // 展开真实参数块，验证按钮状态和共享输入确实同步。
    // 参数区若已经打开就保持原状，不靠连点偶数次猜测折叠状态。
    // 随机模式下自定义输入禁用，不能让用户误以为该数字会提交。
    await run("(()=>{const b=document.querySelector('[data-anima-form] [data-advanced-settings-toggle]');if(b.getAttribute('aria-expanded')==='false')b.click()})()");
    smoke.check('Random mode disables the shared custom seed input',await run("document.querySelector('[data-anima-form] [data-anima-seed]').disabled"));
    for(const [fraction,expected] of [[.25,1073741824],[.75,3221225472]]) {
      await run('void(Math.random=()=>'+fraction+')'); const count=requests.length; await click('[data-anima-run]');
      // 主进程定时轮询不依赖被遮挡窗口的动画帧。
      // 必须恰好新增一条请求，重复提交和完全没提交都不能通过。
      // 期望值从 32 位无符号区间独立计算，不调用产品 seed helper。
      for(let i=0;i<100&&requests.length===count;i++)await new Promise(resolve=>setTimeout(resolve,60));
      const sampler=Object.values(requests.at(-1)).find(node=>node.class_type==='KSampler');
      smoke.check('Random submission samples the current source '+fraction,requests.length===count+1&&sampler.inputs.seed===expected);
      await click('[data-anima-stop]'); await wait("!document.querySelector('[data-anima-run]').disabled");
    }
    // 切回 custom 后应恢复之前记住的值，而不是用刚生成的随机值覆盖草稿。
    // 固定种子的精确提交已经由正向工作流断言覆盖，此处验证模式往返。
    await click('[data-anima-form] [data-seed-mode=custom]');
    smoke.check('Custom seed survives random submissions',await run("document.querySelector('[data-anima-form] [data-anima-seed]').value==='123456'&&!document.querySelector('[data-anima-form] [data-anima-seed]').disabled"));
  } finally { await run("Math.random=window.__originalSeedRandom;delete window.__originalSeedRandom;document.querySelector('[data-anima-form] [data-seed-mode=custom]')?.click()"); }
}

/**
 * 在同一编辑会话中往返蒙版与图库，检查父区替换没有卸载文字输入节点。
 * 原蒙版仍可导入真实图片，并显示其原尺寸，不能只留下空标签。
 * 工具切换回来后指令与原图保持，两个工具没有共享一份素材 state。
 * 文件管理使用既有真实主区子页，返回后不重建当前编辑器。
 * 七组视口分别检查表单、画布和整个页面横向溢出。
 * 宽屏应有两列，窄屏应上下排列，不能用隐藏结果区来通过溢出检查。
 * 截图来自生产静态导出，不使用模板 HTML 冒充已接入的产品。
 * 最后恢复图片模式，既有主题、语言和容器事件回归可以继续执行。
 */
module.exports = async function checkAnimaEdit(ctx) {
  // 蒙版回归在此只验证入口、导入和切换状态，不能声称已重新覆盖每种画笔算法。
  // 结果区截图能辅助看布局，但不代替程序化尺寸和溢出断言。
  // 七种宽度按序复用同一会话，也会覆盖跨断点时组件误卸载的问题。
  // 宽屏表单内部滚动时结果保持可见，窄屏结果在下方并由外层滚动触达。
  // 纵向布局不要求结果落在首屏，避免为了截图把必要输入控件缩得不可操作。
  // 输入、结果与生成阶段分别有断言，成功空壳不能只靠一个截图通过所有检查。
  // 暗色和英语在外层完整套件经原入口验证，此 helper 不注入主题 CSS。
  // focused 模式不运行外层主题用例，因此专项通过不能独立宣称主题回归全绿。
  // 本次无真实用户账号，权限和远端用户数据接口不在编辑能力的模拟范围。
  // 不验证应用重启后编辑表单恢复，当前实现明确是内存会话。
  // 全部本地文件路径只指向受控测试输入，诊断不会列出用户文件夹。
  // 发生失败仍由外层 finally 关闭测试窗口并保留临时证据，避免残留单实例锁。
  // 起始视口统一为 1440，资源选择会走宽屏原版弹窗，而不是紧凑替换分支。
  // source resize 确定原图尺寸，与实际 fixture 存储尺寸无关，断言可独立比较。
  // 一系列操作只创建一个组件会话，不通过刷新规避状态恢复问题。
  // 成功截图在故障测试前保存，便于人工检查真实结果布局。
  // 失败测试后仍保留源图与指令，用于后续跨工具状态保持验证。
  // window.__editInstruction 只保存节点引用，不调用 React 内部方法。
  // 比较同一 DOM 对象可发现隐藏/返回实际上偷偷卸载重建的问题。
  // 原蒙版导入走其真实 file input，不能只检查它的标签还在。
  const { run, wait, click, metrics, shot, smoke } = ctx;
  // 主进程 PNG 解码是夹具准备前置，空结果必须响亮失败，不能误判成产品上传缺陷。
  const source = nativeImage.createFromBuffer(fs.readFileSync(path.join(__dirname, '../../apps/next/src/assets/icon/create/model.png'))).resize({ width: 64, height: 32 }).toPNG();
  if (!source.length) throw new Error('PNG input fixture could not be prepared');
  await metrics(1440, 900); await checkInput(ctx, source); await checkSharedInputs(ctx); await checkChoices(ctx); await checkExecution(ctx); await shot('anima-edit-result'); await checkSharedQueue(ctx); await checkFailures(ctx); await checkRandomSeeds(ctx);
  // 快速加载在原执行与失败回归后运行，避免改变已有工作流断言的固定资源前提。
  // 专项 helper 使用真实 PNG 元数据与公共选择器，继续共享同一隔离 IPC 记录。
  // 它最终恢复编辑模式，再由原用例检查蒙版互不干扰与七档响应式布局。
  await require('./check-anima-edit-resources')(ctx, source, importFile, fill);
  await run("window.__editInstruction=document.querySelector('[data-anima-instruction]')"); await click('#mask-edit-tab'); await wait("document.querySelector('[data-mask-editor]')");
  await run(`(()=>{const e=document.querySelector('[data-mask-import]'),d=new DataTransfer();d.items.add(new File([new Uint8Array(${JSON.stringify([...source])})],'mask-source.png',{type:'image/png'}));e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait("document.querySelector('[data-mask-size]')?.textContent.includes('64 × 32')");
  // 新控制链复用同一窗口和当前蒙版素材，实际画笔、导出和提交在专项中检查。
  // 该专项会恢复原文字模式，不改变后面的原始输入身份和响应式断言前置。
  // 真实模型推理不在此夹具范围，提交和保存仍经过正式 IPC 代码。
  await require('./check-anima-control')({ ...ctx, sourceBytes: source, resultDataUrl: nativeImage.createFromBuffer(fs.readFileSync(path.join(__dirname, '../../apps/next/src/assets/icon/create/model.png'))).resize({ width: 640, height: 320 }).toDataURL() }, fill);
  await click('#anima-edit-tab');
  // 从蒙版回来后原图仍应为 64 像素宽，不能与蒙版内部素材 state 混用。
  // 文件管理通过正式入口进入，检查 main 区替换后仍可返回当前文字编辑器。
  // 返回等待替换页消失，避免过渡期间同时测到两个表面的宽度。
  // 继续比较指令节点身份，不能只用内容相等掩盖重新挂载带来的状态丢失。
  smoke.check('Original mask import remains usable and returning keeps text input identity', await run("window.__editInstruction===document.querySelector('[data-anima-instruction]')&&document.querySelector('[data-anima-source] img').naturalWidth===64"));
  await click('[data-edit-history]'); await wait("document.querySelector('[data-create-subpage=history]')"); await click('[data-subpage-back]'); await wait("!document.querySelector('[data-create-subpage=history]')");
  smoke.check('Editing file manager replaces main and returns without losing the original', await run("window.__editInstruction===document.querySelector('[data-anima-instruction]')&&document.querySelector('[data-anima-edit]').getBoundingClientRect().width>0"));
  // 边缘测试会经过图片/编辑模式重挂载，因此在局部工具DOM身份检查完成后执行。
  // 草稿仍由常驻store恢复，后续七档布局继续使用真实源图和结果数据。
  // 这一步只重新创建页面组件，不会恢复默认参数或启动另一个生成队列。
  await require('./check-anima-control').checkEdge({ ...ctx, sourceBytes: source });
  // 七种宽高包含桌面、平板、竖屏和 320 小宽度，不只测试一个漂亮截图。
  // 实际布局以功能容器为准，880 的判断不能拿浏览器窗口宽度代替。
  // 宽屏检查 stage 在 form 右侧，窄屏检查 stage 在 form 下方。
  // 两个区域都要求 width>0，隐藏结果不能作为避免横向溢出的修复。
  // grid.scrollWidth 捕捉内部溢出，document.scrollWidth 捕捉整页被撑开。
  // 一像素容差只覆盖小数布局取整，不容许多余侧边宽度。
  // metrics 使用既有桌面模拟机制，未伪造真实显示器 DPR 测试结果。
  // 窄屏截图保留在本轮临时目录，不覆盖用户给出的视觉参考。
  // 收尾恢复图片标签和桌面宽度，让后续旧回归仍在预期前置运行。
  // 不关闭其他 Electron 窗口，整个测试仅管理自己创建的隔离进程。
  for (const [width, height] of [[1920, 1080], [1440, 900], [1024, 768], [900, 700], [768, 1024], [390, 844], [320, 568]]) {
    await metrics(width, height);
    smoke.check(`Text edit keeps form and result within ${width}x${height}`, await run("(()=>{const grid=document.querySelector('[data-anima-grid]'),form=document.querySelector('[data-anima-form]').getBoundingClientRect(),stage=document.querySelector('[data-anima-stage]').getBoundingClientRect();return grid.scrollWidth<=grid.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1&&form.width>0&&stage.width>0&&(grid.getBoundingClientRect().width>=880?stage.left>=form.right:stage.top>=form.bottom)})()"));
    if ([1440, 390, 320].includes(width)) await shot(`anima-edit-${width}`);
  }
  await metrics(1440, 900); await run("[...document.querySelectorAll('[data-create-mode-tabs] button')].find(b=>b.textContent.trim()==='图片').click()");
};


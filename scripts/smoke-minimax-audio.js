/**
 * Role TTS 页面冒烟：真实静态页面、preload 和文件保存 handler。
 * 仅替换 ComfyUI 推理回包，受控 WAV 音频用于验证播放和落盘。
 * 测试不访问真实模型，不使用用户文档或用户 ComfyUI 服务。
 * 所有窗口属于本套件，退出时只销毁这些窗口。
 */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron'), { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels"), { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/src/main/core/windows/window-chrome"), smoke = require('./lib/smoke-harness').createSmokeHarness({ name: 'minimax-audio', timeoutMs: 90000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-audio-ui-')), prompts = [], uploads = [], run = smoke.createRun(), delay = ms => new Promise(resolve => setTimeout(resolve, ms)); let win, release, held = true;

// WAV 为单声道 8 kHz 的一秒静音，不用无效占位字节假装完成浏览器解码。
// 生成结果与参考音频可共用这个夹具，但模板选择必须依据用户是否导入参考。
// RIFF 与 data 长度保持真实一致，播放器 duration 应为一秒。
// 测试不评价声音自然度，静音只用于验证媒体链路和控制条。
// 文件保存通过正式 files handler 执行，不能仅返回一串伪路径。
// 音频和截图都留在当前临时目录，不改用户实际 output 目录。
const wav = Buffer.alloc(16044); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);
app.setPath('userData', path.join(root, 'browser')); app.disableHardwareAcceleration(); smoke.setWorkDir(root); smoke.installWatchdog(app); require("../apps/electron/src/main/core/protocol").registerAppProtocol();

// 启动文档使用正式长期游客格式，不需要账户服务器允许生成。
// settings.outputPath 指向测试目录，让正式保存 handler 的副作用可检查。
// 输出模式恢复前，PATHS_GET_DEFAULT_OUTPUT 也返回同一隔离目录。
// 账户读取只返回未登录状态，测试不能触碰用户现有登录令牌。
// 模型扫描只返回一个改名 MiniMax 夹具，不读取用户的大权重目录。
// 服务端列表同时提供它的相对名，覆盖本地选择与远端名称解析。
// 静态导出水合用正式 userData 读写契约，写入仅保存在本进程变量。
// 其他模式的图片图库保持空列表，不以旧图片制造音频结果。
require("../apps/electron/src/main/modules/images/files.handlers").registerFileHandlers(); require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers(); require("../apps/electron/src/main/core/windows/window.handlers").registerWindowHandlers();
// 指定隔离根目录，让正式模型分类器能够识别 Minimax 子目录。
// 夹具只用于选模，推理仍被受控 WAV 回包替换，不创建虚假的模型权重。
// 其版本绝对路径与服务器相对名分别验证共享选择器的路径转换。
const modelRoot = path.join(root, 'models', 'diffusion_models'), renamed = 'Minimax/Renamed/renamed-audio.safetensors', modelFolder = path.join(modelRoot, 'Minimax', 'Renamed');
let documentData = require('./lib/guest-session-fixture').withGuestSession({ version: 1, settings: { locale: 'zh-CN', theme: 'light', paths: { diffusionModelsPath: modelRoot }, outputPath: root } });
registerHandle(C.USER_DATA_READ, () => ({ data: documentData, filePath: '', isNew: false })); registerHandle(C.USER_DATA_WRITE, (_event, value) => { documentData = value; });
// type=checkpoint 是项目 UNet 扫描既有分类，不伪装为音频专用模型类型。
// 只有一个版本时公共资源弹窗走直接选择，再由 footer 确认提交。
// LoRA 扫描不会返回这个主模型，防止测试把不兼容资源放入扩展菜单。
registerHandle(C.MODELS_SCAN, (_event, _directory, type) => type === 'lora' ? [] : [{ id: 'renamed', name: 'Renamed', filePath: modelFolder, iconPath: null, type: 'checkpoint', category: 'Minimax', versions: [{ id: 'custom', name: 'renamed-audio', filePath: path.join(modelFolder, 'renamed-audio.safetensors') }] }]);
for (const channel of [C.FILES_LIST_GENERATED_IMAGES, C.FILES_LIST_OUTPUT_FOLDERS]) registerHandle(channel, () => []);
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false } })); registerHandle(C.MODELS_DOWNLOAD_LIST, () => ({ revision: 0, tasks: [] })); registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root); registerHandle(C.CHANGELOG_READ, () => '');

// 模型列表直接来自用户工作流，两份模板的 VAE 和 LoRA 名称必须可以解析。
// pixel_space 特意不放入磁盘模型列表，覆盖内置 VAE 的特殊契约。
// 加速 LoRA 是模板中的实际中文子目录名，不能因名称含中文而丢失。
// 整图输出通过统一 comfyGenerate IPC 返回，保留 requestId 供任务身份断言。
// 第一次请求 held 时挂起，期间用户会离开并重新进入创建页。
// 本替身不声称验证 HTTP 传输；HTTP 由 verify-minimax-audio 独立检查。
// 输出种类使用 audio，而不是给图片字段添加一个 wav 文件名。
// 文件夹类型为 temp，与 PreviewAudio 的实际历史格式一致。
const template = require('../apps/next/src/data/comfy/audioWorkflower/Audio_Minimax.json'), nodes = Object.values(template);
registerHandle(C.COMFY_LIST_MODELS, () => ({ checkpoints: [], diffusionModels: [...nodes.filter(n => n.class_type === 'UNETLoader').map(n => n.inputs.unet_name), renamed], clips: nodes.filter(n => n.class_type === 'CLIPLoader').map(n => n.inputs.clip_name), vaes: nodes.filter(n => n.class_type === 'VAELoader' && n.inputs.vae_name !== 'pixel_space').map(n => n.inputs.vae_name), loras: nodes.filter(n => n.class_type === 'LoraLoaderModelOnly').map(n => n.inputs.lora_name) }));
registerHandle(C.COMFY_UPLOAD_IMAGE, (_event, _server, input) => { uploads.push(input); return { name: 'accepted.wav', subfolder: 'references', type: 'input' }; });
registerHandle(C.COMFY_GENERATE, async (_event, graph, _server, id) => { prompts.push({ graph, id }); if (held) await new Promise(resolve => { release = resolve; }); return { promptId: id, images: [], videos: [{ nodeId: 'out', filename: 'fixture.wav', subfolder: 'preview', folderType: 'temp', kind: 'audio', dataUrl: `data:audio/wav;base64,${wav.toString('base64')}` }] }; });

// 有界轮询运行在主进程，避免窗口被遮挡时 rAF 停止导致测试卡死。
// 每次都读取当前 DOM，不依赖 matchMedia 事件一定派发。
// 找不到元素必须抛错，不把前置条件缺失算成跳过后的绿灯。
// 控件交互使用真实 click 和 input 事件，不调用 Zustand 私有方法注入状态。
// 提示词输入是 contentEditable，因此 textContent 与 input 事件都必须发生。
// 文件导入使用 DataTransfer 建立真实 FileList，生产 onChange 负责保存 File。
// 文件名故意包含中文，实际上传 payload 名称必须为英文 UUID。
// 参考移除后无需本套件手工重置工作流标志，产品根据 File 决定。
async function wait(expression) { for (let i = 0; i < 160; i++) { if (await run(`Boolean(${expression})`)) return; await delay(60); } throw new Error('Audio UI wait: ' + expression); }
async function click(selector) { await wait(`document.querySelector(${JSON.stringify(selector)})`); await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(80); }
async function selectAudio() { await run("[...document.querySelectorAll('[data-create-mode-tabs] button')].find(b=>b.textContent.includes('Role TTS')).click()"); await wait("document.querySelector('[data-audio-create]')"); }
async function inputPrompt(value) { await run(`(()=>{const e=document.querySelector('#audio-prompt');e.textContent=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}))})()`); await delay(60); }
/**
 * 通过真实键盘输入 @ 打开视频同款菜单，不能直接插入最终 token 冒充选中。
 * 参考音频已导入，分类只有 audio；图片和视频即使空分类也不能出现。
 * Enter 选择高亮的唯一素材，复用既有键盘分支而非鼠标专用捷径。
 * 选择后原稿仍为 @audio1，展开预览才看到官方 <Audio 1>。
 * 预览使用文本节点，尖括号不得被浏览器吞成未知 HTML 标签。
 * 不触发生成，随后 flow 的真实生成步骤检查最终节点 prompt。
 */
async function selectAudioMention() {
  // 原文字尾增加 @，让光标位于合法补全位置，避免根本未触发查询的假绿。
  // Selection 放在正文内部，生产 hook 自行读取偏移并定位浮层。
  // 不访问 Zustand 私有方法，最终文本只能由真实编辑器事件回写。
  await inputPrompt('Follow ');
  // range 先选择完整正文再收缩到末尾，不能沿用其他控件已经失效的选区。
  // focus 与 range 缺一时，insertText 可能写到页面外而不是被测编辑面。
  // 在这里不调用生产 restoreEditorOffset，避免相同缺陷同时影响输入和期望。
  await run("(()=>{const e=document.querySelector('#audio-prompt');e.focus();const r=document.createRange();r.selectNodeContents(e);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r)})()");
  // Electron insertText 模拟真实输入，React onInput 和补全更新必须自行触发。
  // 只写一个 @，而非预置 @audio1 后声称验证了选择菜单。
  await win.webContents.insertText('@');
  await wait("document.querySelector('[data-prompt-media-category=audio]')");
  // 三个分类的正反对照一起检查，不能菜单完全没出现却被算作仅音频。
  // 浮层属于 portal，选择器从 document 查找，不局限音频 form 子树。
  // 原菜单内部仍有返回分类能力，不为音频复制新的一套导航。
  smoke.check('Role TTS mentions expose only the audio category', await run("document.querySelectorAll('[data-prompt-media-category]').length===1&&Boolean(document.querySelector('[data-prompt-media-category=audio]'))"));
  await click('[data-prompt-media-category=audio]');
  // 菜单 mousedown 不抢正文焦点，Enter 应继续交给编辑器的候选处理器。
  // 这是从分类到素材的第二步，根分类高亮不应直接插入一个没有身份的 token。
  // 键盘选择会关闭 portal，后续等待同时确认文本和浮层状态。
  await win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});
  await wait("document.querySelector('#audio-prompt').textContent.includes('@audio1')&&!document.querySelector('[data-prompt-media-menu]')");
  // 原助手能力不得因更换编辑器而丢失，工具条仍以同一 contextId 操作正文。
  // details 真实点击展开，不靠修改 innerHTML 伪造显示结果。
  // 只检查必要内容，保留编辑器自动追加空格这一既有插入行为。
  await click('[data-audio-create] [data-prompt-conversion] summary');
  smoke.check('Audio reference preview uses official H3 text labels', await run("document.querySelector('[data-audio-create] [data-prompt-conversion-text]').textContent.includes('<Audio 1>')&&Boolean(document.querySelector('#audio-prompt [data-media-reference]'))"));
  // 原音频提示词助手仍位于真实输入旁，不能复用 @ 时把翻译复制入口删掉。
  // 工具条和预览是两个独立操作，不让点击助手误触生成表单。
  // 检查可见入口存在，不把所有助手网络服务都描述为本套件已验证。
  smoke.check('Reference editor preserves the existing prompt assistant', await run("Boolean(document.querySelector('[data-audio-create] [data-assistant-options]'))"));
}

/**
 * 删除唯一参考后保留原稿，用户能看见错误并决定重导入或改写描述。
 * 通过正式移除按钮和生成按钮验证，不能靠直接调用 builder 代替 UI 回归。
 * 提交数与上传数均不增加，说明失败发生在网络副作用之前。
 * 原有生成结果仍存在，错误引用不能顺手清空历史播放器。
 * 结尾重导入仅用于恢复布局截图，绝不自动再生成一次。
 */
async function missingReference() {
  const before = prompts.length, beforeUploads = uploads.length;
  // before 是已成功生成四项后的快照，不是重置服务数组掩盖额外请求。
  // 成功生成图已通过其他断言，这里只观察移除参考造成的新错误路径。
  // 异常处理应消费拒绝，不让 Electron 的未处理 Promise 报错替代用户反馈。
  // name 属性无关紧要，按实际移除按钮的中文无障碍标签识别用户操作。
  // 不使用 DOM.remove 假装删除素材，正式 onRemove 必须更新 File 状态。
  // 当前提示词保留 @audio1，与删参考后改成普通文字形成有区别的错误路径。
  await click('[data-audio-create] button[aria-label="移除参考音频"]');
  await click('[data-audio-create] [data-generate-button]');
  // 表单错误由现有 store.catch 接收；预览也应立刻显示引用不存在。
  // 既有四个成功播放器仍在，只检查错误不能证明历史结果未被误删。
  // 上传数固定防止“先传完再报引用错误”的不必要副作用。
  await wait("document.querySelector('[data-audio-create] [role=alert]')");
  // 标记正文含不存在，说明预览重算了当前素材，而非仍展示已删除音频的旧标签。
  // 播放器数量检查当前渲染结果，不从磁盘文件数反推页面一定没清空。
  // 两个请求计数分开检查，生成被拦住不代表上传也一定没有发生。
  // 段落只是用户错误反馈，不把这个负向测试的预期失败记为套件断言失败。
  smoke.check('Removing referenced audio blocks upload and generation', prompts.length === before && uploads.length === beforeUploads && await run("document.querySelector('[data-audio-create] [data-prompt-conversion-text]').textContent.includes('不存在')&&document.querySelectorAll('[data-audio-results] audio').length===4"));
  // 重新导入不能自动提交，恢复后的预览须再次匹配当前音频槽。
  // 提示词本身无需替换，引用仍指向唯一参考编号一。
  // 生成失败的错误历史保留，不在测试里直接清空 error 字段制造假成功。
  await upload();
  await wait("document.querySelector('[data-audio-create] [data-prompt-conversion-text]').textContent.includes('<Audio 1>')");
}
async function upload() { await run(`(()=>{const e=document.querySelector('[data-audio-create] input[type=file]'),data=new DataTransfer();data.items.add(new File([new Uint8Array(${JSON.stringify([...wav])})],'中文参考.wav',{type:'audio/wav'}));e.files=data.files;e.dispatchEvent(new Event('change',{bubbles:true}))})()`); }

// 通过原生 input setter 触发 React 受控输入，不直接修改 store。
// 目标包含参数区限定，不能误操作后台仍挂载的图片表单。
// change/input 都派发以模拟输入提交，真实 onChange 负责数值校验。
async function inputValue(selector, value) { await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`); await delay(80); }

/**
 * 默认页面不再显示角色入口，Role TTS 点击后可进入真实表单。
 * 无参考时加速 LoRA 默认出现，提示行应指向 Audio_Minimax。
 * 第一次提交只生成一项，检查原模板的 steps=10 和 32×32 未被视频规则改写。
 * 生成等待时点击主页再返回创建页，旧表单组件实际经历卸载和重挂载。
 * 返回后提示词、当前任务与生成状态不应丢失。
 * 放行原请求后，生成结果应自动写回当前草稿并成为可播放音频。
 * 浏览器 load 后检查 duration，而不是仅检查 DOM 出现 audio 元素。
 * 实际保存文件必须逐字节等于生成回包，路径存在不等于内容正确。
 */
// 模式条的断言既检查角色不存在，也检查 Role TTS 仍存在。
// 缺少整个模式条不能靠空数组 every 假通过，后一个 some 提供正向条件。
// 默认扩展标题从真实组件 DOM 读取，不由测试自行插入卡片。
// 仅有主模型扫描结果时仍显示默认加速 LoRA，覆盖模板名后备显示。
// prompt 输入事件必须由生产 PromptInput 回写 store，离开后才能恢复。
// 生成请求捕获 id 并断言非空，防止音频适配丢掉可取消会话身份。
// 原始 steps=10 的断言来自用户 JSON，不使用生成图自我推导期望。
// 宽度=32 证明没有误走视频分辨率归一化逻辑。
// 真实路由跳到首页后等待表单卸载，不能只隐藏表单声称验证了切页。
// 回创建页后重新点击 Role TTS，面板组件重新创建而状态应仍在。
// 等待中的原请求只有一项，不因重挂载自动再发一项。
// 当前草稿恢复和任务活动恢复是两个条件，缺一个都不能通过。
// release 放行原 Promise，返回页应接到异步结果而不是需要用户刷新。
// 播放器主动 load 之后 duration=1，验证 WAV 头和音频字节可解码。
// 仅出现 audio 标签不是可播放的证据，所以额外等待 metadata。
// 正式保存 handler 写入后的文件数必须恰好为一，检测重复提交或保存。
// 磁盘内容比较包含 WAV 头和 PCM 主体，不只检查文件长度。
// 第二轮参考导入通过正式 AudioUpload onChange，不能直接 patch store。
// 第二轮提示行变为 5 秒，说明 UI 的自动模式已与 File 状态一致。
// 第二轮图检查 LoadAudio.accepted 路径，证明不是只改变了提示行。
// 第二轮默认 steps=8，与第一轮独立验证，不能统一成一个音频默认值。
// 第二轮上传名检查英文 UUID，中文原名不应直接出现在 multipart 中。
// 第二轮产物加入列表，不应覆盖第一轮已经生成的音频。
// 两轮请求都使用同一个全局 FIFO，本套件不向页面注入独立调度器。
async function flow() {
  smoke.check('Role entry removed, Role TTS retained', await run("[...document.querySelectorAll('[data-create-mode-tabs] button')].every(b=>b.textContent.trim()!=='角色')&&[...document.querySelectorAll('[data-create-mode-tabs] button')].some(b=>b.textContent.includes('Role TTS'))")); await selectAudio();
  smoke.check('Default acceleration LoRA and text workflow visible', await run("document.querySelector('[data-audio-create]').textContent.includes('minimax_h3_fl2v_turbo')&&document.querySelector('[data-audio-workflow]').textContent.includes('Audio_Minimax')"));
  // 这一步只读实际共享参数输入，未提交前应与原图十步一致。
  // 主模型卡片应显示模板文件的 basename，尚不能显示改名夹具。
  // 此断言与后面八步和十七步配对，区分默认值与用户覆盖。
  smoke.check('Shared model card and steps follow text template', await run("document.querySelector('[data-audio-create] input[name=audio-steps]').value==='10'&&document.querySelector('[data-audio-create] [data-video-local-unet]').textContent.includes('minimax')"));
  await inputPrompt('Gentle voice says hello'); await click('[data-audio-create] [data-generate-button]'); await wait("document.querySelector('[data-audio-create] [data-generate-button]').textContent.includes('添加生成任务')"); assert.equal(prompts.length, 1); assert.equal(prompts[0].graph['153:9'].inputs.steps, 10); assert.equal(prompts[0].graph['153:104'].inputs.width, 32); assert(prompts[0].id);
  await click('nav a[href="/"]'); await wait("!document.querySelector('[data-create-workspace]')&&!document.querySelector('[data-audio-create]')"); await click('nav a[href="/create"]'); await wait("document.querySelector('[data-create-mode-tabs]')"); await selectAudio();
  smoke.check('Leaving route preserves draft and active generation', await run("document.querySelector('#audio-prompt').textContent==='Gentle voice says hello'&&document.querySelector('[data-audio-create] [data-generate-button]').textContent.includes('添加生成任务')")); held = false; release(); await wait("document.querySelector('[data-audio-results] audio')");
  await run("document.querySelector('[data-audio-results] audio').load()"); await wait("[...document.querySelectorAll('[data-audio-results] audio')].some(a=>a.duration===1)"); smoke.check('Generated WAV decodes and plays through audio controls', true);
  const files = fs.readdirSync(root).filter(name => name.startsWith('IR_audio_')); assert.equal(files.length, 1); assert.deepEqual(fs.readFileSync(path.join(root, files[0])), wav); smoke.check('Production save handler writes exact audio bytes', true);
  // 导入之后先经过真正 @ 选择，再提交参考图，验证 UI 与构图的整条连接。
  // 上传仍只有一次，打开菜单与预览不能提前产生上传副作用。
  // 保留原有文件名及步数断言，新引用不改变英文上传名与参考默认参数。
  await upload(); await wait("document.querySelector('[data-audio-workflow]').textContent.includes('5 秒')"); await selectAudioMention(); await click('[data-audio-create] [data-generate-button]'); await wait("document.querySelectorAll('[data-audio-results] audio').length>=2"); assert.equal(uploads.length, 1); assert.match(uploads[0].filename, /^ir_audio_[a-z0-9-]+\.wav$/); assert.equal(prompts[1].graph['164'].inputs.audio, 'references/accepted.wav'); assert.equal(prompts[1].graph['157:9'].inputs.steps, 8); smoke.check('Reference file switches workflow and uses English upload name', true);
  // 实际主进程图应已不含 UI 的 @ 标记，预览转换不能只停留在屏幕上。
  // 末尾空格来自原补全插入行为，比较时 trim 不改变被提交图本身。
  // 序号一对应唯一 LoadAudio，而不是素材文件名里的任意数字。
  assert.equal(Object.values(prompts[1].graph).find(node => node.class_type === 'MiniMaxH3ReferenceToVideo').inputs.prompt.trim(),'Follow <Audio 1>');
}

/**
 * 同一表单直接操作图片共享的种子按钮组、底部骰子和数量菜单。
 * 先自定义再点骰子，输入应被禁用；随后切回自定义并填写四十二。
 * 控件的 aria-pressed 与 disabled 都检查，避免只变颜色不变逻辑。
 * 有参考时未编辑的步数应为八，改成十七后才成为显式覆盖。
 * 模型卡片弹窗从真实扫描夹具中选择重命名的 MiniMax UNet。
 * 弹窗使用公共“选择”和“确认”两步，不调用内部选择函数。
 * 只打开数量菜单或选择二不能生成任务，检查请求数保持不变。
 * 点击生成才产生两次真实队列提交，两项都检查模型和步数。
 * 首项使用固定四十二，第二项仍按批次规则使用合法随机种子。
 * 每次提交保留参考音频，不能因公共数量逻辑绕开参考工作流。
 * 等待两个新播放器，证明不是只有请求次数变化而保存结果缺失。
 * 保存仍使用生产 handler，每个输出逐字节比对 WAV。
 * 测试复用真实 UI 组件，不以相似 CSS 或复制按钮当成复用证据。
 * 未访问外部 ComfyUI，不把夹具选模描述为已验证该权重兼容推理。
 * 队列释放由原 flow 完成，本组不与挂起请求并行制造额外时序依赖。
 * 数量最终恢复一只用于截图，下拉交互仍不得增加第五个请求。
 */
async function sharedControls() {
  // 参考文件仍来自 flow 的正式导入，八步不是脚本主动写进去的值。
  // 骰子使用公共 data-random-seed，与图片和编辑页面同一个组件。
  // 自定义切换先改变 random 状态，输入四十二才应被生产 onChange 接收。
  // disabled 的反向检查防止只变 aria-pressed 而仍允许随机模式编辑。
  // 步数输入 name 来自公共 GenerationParameterControl 的宿主参数。
  // 模型弹窗限定 titleId，不能点到标题栏或 LoRA 弹窗的确认按钮。
  // 选择后等待卡片文本变化，异步模型列表解析完成才允许继续提交。
  // 模型列表包含新名称，解析器应保留服务器的正斜杠形式。
  // 打开数量菜单前记录请求数，避免在原四个任务总数上错认新提交。
  // 二项选择只改变 GenerateFooter 内部数量，不需要音频专用数量状态。
  // click 之后等待四个结果，前两项来自基础流程，新增两项来自此批次。
  // 两份新增图都是参考工作流，id 前缀应继续使用 157。
  // LoadAudio 的路径应是上传返回名，不能使用本地中文原文件名。
  // 第一项四十二的断言保护 custom 模式真正传入采样图。
  // 两项都比较 UNet 和 scheduler，避免首项改对但第二项落回模板。
  // 最后只恢复菜单数量，不重置模型、步数或种子，截图反映真实用户编辑态。
  // 字节比较继续读生产 handler 的输出，而非播放 Blob 的内存副本。
  smoke.check('Reference template updates shared steps to eight', await run("document.querySelector('[data-audio-create] input[name=audio-steps]').value==='8'"));
  await click('[data-audio-create] [data-seed-mode=custom]'); await click('[data-audio-create] [data-random-seed]');
  smoke.check('Shared dice enables audio random mode', await run("document.querySelector('[data-audio-create] [data-seed-mode=random]').getAttribute('aria-pressed')==='true'&&document.querySelector('[data-audio-create] [data-seed-value]').disabled"));
  await click('[data-audio-create] [data-seed-mode=custom]'); await inputValue('[data-audio-create] [data-seed-value]', 42); await inputValue('[data-audio-create] input[name=audio-steps]', 17);
  await click('[data-audio-create] [data-video-local-unet] button'); await wait("document.querySelector('[aria-labelledby=model-select-dialog-title]')");
  await run("[...document.querySelectorAll('[aria-labelledby=model-select-dialog-title] button')].find(b=>b.textContent.trim()==='选择').click()"); await click('[aria-labelledby=model-select-dialog-title] [data-resource-confirm]');
  await wait("document.querySelector('[data-audio-create] [data-video-local-unet]').textContent.includes('renamed-audio')"); smoke.check('Shared model picker selects renamed local UNet', true);
  const before = prompts.length; await click('[data-audio-create] [data-image-count-trigger]'); await click('[data-audio-create] [data-image-count-option="2"]'); assert.equal(prompts.length, before); smoke.check('Shared quantity menu does not submit', true);
  // 用真实数字输入事件设置小数秒，不直接调用 store.patch 伪造 UI 成功。
  // 当前有参考素材，最终图必须改写 157:111 而非无参考图的节点。
  // 摘要同步变更证明旧“默认五秒”文案已不再遮蔽用户输入。
  // 数量菜单操作不产生请求，自定义也不能意外触发表单提交。
  // 已有后续生成步骤会提交两项，用于验证新增控件确实接入批次快照。
  await inputValue('[data-audio-create] input[name=audio-duration]', 7.5);
  smoke.check('Audio duration input updates current workflow summary', await run("document.querySelector('[data-audio-workflow]').textContent.includes('7.5')"));
  await click('[data-audio-create] [data-generate-button]'); await wait("document.querySelectorAll('[data-audio-results] audio').length===4"); assert.equal(prompts.length, before + 2);
  for (const item of prompts.slice(before)) { assert.equal(item.graph['157:6'].inputs.unet_name, renamed); assert.equal(item.graph['157:9'].inputs.steps, 17); assert.equal(item.graph['164'].inputs.audio, 'references/accepted.wav'); }
  // 断言主进程收到的实际图，不能仅以界面值变化宣称实现。
  // 两项均使用 7.5 秒，排除只把时长应用到批次第一项的遗漏。
  // 此冒烟返回固定 WAV，不用其一秒播放长度冒充真实模型时长验证。
  for (const item of prompts.slice(before)) assert.equal(item.graph['157:111'].inputs.value, 7.5);
  assert.equal(prompts[before].graph['157:15'].inputs.noise_seed, 42); smoke.check('Shared generate count freezes model, steps and first fixed seed', true);
  const files = fs.readdirSync(root).filter(name => name.startsWith('IR_audio_')); assert.equal(files.length, 4); for (const file of files) assert.deepEqual(fs.readFileSync(path.join(root, file)), wav);
  await click('[data-audio-create] [data-image-count-trigger]'); await click('[data-audio-create] [data-image-count-option="1"]'); assert.equal(prompts.length, before + 2);
}

// 同一结果区在宽屏 stage 与窄屏 rail 中切换，不能撑出展示区域。
// 几何读数来自当前 CSS 布局，不能只检查组件是否挂载。
// 音频种子和扩展应在低高度下通过参数区滚动访问，footer 仍位于边界内。
// 两个截图使用完整窗口，保留 nav、head 和 main 供人工比较。
// 截图不裁剪外围空白，避免隐藏布局溢出问题。
// 这里不重新提交模型，布局检查不会增加请求数。
// audio controls 不启用 autoplay，截图和重排不会突然播放声音。
// 文件查看按钮不在自动化中点击，避免为了验证布局打开用户 Explorer。
// 1500px 用于覆盖有中间预览列的桌面布局，音频结果应占用 stage。
// 720px 用于覆盖缺少 stage 时的表单内结果展示，不能把结果藏在不可见列。
// 几何检查读取主操作按钮真实边界，不能仅以 footer 的 CSS 类名断定固定。
// scrollWidth 检查保护窄窗口不出现横向溢出。
// 结果区域可以纵向滚动，但应用 document 不应被扩展卡片撑宽。
// 截图发生在窗口尺寸改变和状态提交之后，等待由主进程 timer 保证。
// 保存两种尺寸的完整截图，便于人工确认默认扩展卡片和生成按钮比例。
// 这些布局断言不检验语音质量，也不代替服务端节点依赖是否安装的验收。
async function layout() {
  // 输入阶段使用浅色，布局阶段切深色，检查复用控件是否继承真实系统主题。
  // 点击真实外观菜单，让 store、DOM 信号及 nativeTheme 一起更新。
  // 仅直接改 nativeTheme 时，已保存的浅色偏好可能立即把它覆盖回去。
  // 等媒体查询与 DOM 同时为深色，防止截图仍是旧配色却声称覆盖深色。
  // 主题写入只保存在隔离测试文档，不修改用户保存的实际设置。
  // 关闭菜单复用现有测试助手，避免浮层遮挡新增时长控件。
  await click('[data-window-appearance]');
  await click('[data-theme-option=dark]');
  await wait("document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('theme-ripple')&&matchMedia('(prefers-color-scheme: dark)').matches");
  await require('./lib/sidebar-menu-fixture').closeAppearance(run);
  for (const width of [1500, 720]) { win.setContentSize(width, 860); await delay(200); const geometry = await run("(()=>{const f=document.querySelector('[data-audio-create]'),b=f.querySelector('[data-generate-button]').getBoundingClientRect(),r=f.getBoundingClientRect();return {inside:b.bottom<=innerHeight&&b.right<=innerWidth,width:r.width,scroll:document.documentElement.scrollWidth<=innerWidth}})()"); smoke.check(`${width}px audio footer stays inside main`, geometry.inside && geometry.scroll && geometry.width > 0); win.webContents.invalidate(); await delay(80); fs.writeFileSync(path.join(root, `audio-${width}.png`), (await win.webContents.capturePage()).toPNG()); }
}

// ready 后再创建窗口，正式 preload 的 require 可以按项目约定工作。
// sandbox=false 由根规则要求，安全边界仍是 contextIsolation 与最小 API。
// offscreen 窗口只供本套件截图，不抢占用户正在操作的客户端。
// backgroundThrottling=false 保证遮挡时异步状态和布局通知仍能推进。
// 先核对构建指纹，避免在旧 out 上误判新源码有回归。
// 关闭更新公告使用正式按钮，不能删 DOM 伪造无遮挡状态。
// finally 只销毁本窗口和本套件遮挡窗口，不全局杀 Electron 进程。
// 失败交给 smoke.finish 返回非零退出，截图成功不能覆盖之前的失败。
// 请求次数在最后核对，页面切换不能偷偷重跑原请求。
// 受控素材与截图保留在临时目录，以便复查实际界面。
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app }); win = new BrowserWindow({ ...windowChromeOptions(), show: false, width: 1500, height: 860, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } }); smoke.attachWebContents(win.webContents); const occlusion = await smoke.hardenWindow(win);
  // 缺失引用检查在四项正常生成后执行，不能让负向前置破坏成功基准。
  // 末尾请求数仍为四，菜单、预览、失败恢复和截图都不能增加隐式生成。
  // 每个阶段按顺序等待，窗口清理不与未完成的编辑器操作竞争。
  try { await win.loadURL('app://app/create'); await wait("document.querySelector('[data-create-mode-tabs]')"); await wait("document.querySelector('[aria-labelledby=update-announcement-title]')"); await click('[aria-labelledby=update-announcement-title] button'); await flow(); await sharedControls(); await missingReference(); await layout(); assert.equal(prompts.length, 4); console.log('AUDIO_SCREENSHOTS', root); } finally { occlusion.dispose(); win.destroy(); }
  smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch(error => smoke.finish({ app, ok: false, error }));

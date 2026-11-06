/**
* LLLite 集成回归：正式画笔导出透明 PNG，再经共享编辑表单和公共队列提交。
* 同窗口验证边缘检测的实际 Worker 输出，所有推理结果仍由 IPC 夹具模拟。
* 不连接真实 ComfyUI、不加载模型权重，不把 UI 回包称为真实生成效果。
*/
const zlib = require('node:zlib');
// 独立读取保存PNG的prompt块，不能只在二进制中搜索补丁文件名。
// 按PNG长度字段跳过IDAT，压缩数据里的同名字节不能制造假通过。
// 只匹配精确的prompt关键字，不读取workflow或illusionRealmMeta代替。
// 保存器对非ASCII文本已按既有约定转义，latin1还原tEXt容器字节。
// 解析后与实际IPC提交对象逐节点比较，模型路径和蒙版引用都不能漂移。
// 缺块抛错而不是返回空对象，失败仍进入外层退出码护栏。
// 这里只检查正式保存请求中的字节，不承诺模拟IPC已经写进真实磁盘。
// 版本块契约由原编辑回归与check:meta的往返测试分别覆盖。
function savedWorkflow(bytes) {
  for (let offset = 8; offset + 12 <= bytes.length;) { const size = bytes.readUInt32BE(offset), kind = bytes.toString('ascii', offset + 4, offset + 8), value = bytes.subarray(offset + 8, offset + 8 + size), split = value.indexOf(0); if (kind === 'tEXt' && value.subarray(0, split).toString('latin1') === 'prompt') return JSON.parse(value.subarray(split + 1).toString('latin1')); offset += size + 12; }
  throw new Error('Saved inpainting PNG has no prompt block');
}
// 导出器当前使用无滤波 RGBA PNG，独立解码以检查透明像素的 RGB 是否还在。
// 不使用 nativeImage 解码上传 PNG，因为预乘 alpha 会丢掉全透明处的颜色证据。
// 不使用产品 mask-image 的编码函数制造期望，避免相同错误自证通过。
// 各 chunk 依据长度遍历，压缩数据里相同字符不能被误认为块名称。
// 只处理本测试正式导出器的 PNG，不宣称此辅助是通用 PNG 解码器。
// 非零过滤方式直接失败，不能错位读取像素后碰巧得到正确 alpha。
// 调用方读取涂抹中心和未涂抹边角，两者应分别透明和不透明。
// PNG 文件只在内存处理，不生成用户图片、不写入真实输出目录。
function pixels(base64) { const bytes = Buffer.from(base64, 'base64'), data = []; let width, height; for (let offset = 8; offset < bytes.length;) { const size = bytes.readUInt32BE(offset), kind = bytes.toString('ascii', offset + 4, offset + 8), chunk = bytes.subarray(offset + 8, offset + 8 + size); if (kind === 'IHDR') { width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4); } if (kind === 'IDAT') data.push(chunk); offset += size + 12; } const raw = zlib.inflateSync(Buffer.concat(data)), stride = width * 4 + 1;
for (let row = 0; row < height; row++) if (raw[row * stride] !== 0) throw new Error('Unexpected mask PNG filter'); return (x, y) => [...raw.subarray(y * stride + 1 + x * 4, y * stride + 5 + x * 4)]; }

// 以真实鼠标事件涂抹，不能直接调用 sketch ref 加载路径绕过用户交互。
// scrollIntoView 后有界等待命中区域，防止布局尚未提交时点到旧坐标。
// 当前输入是64×32，中心笔刷覆盖图中一部分，边角仍留不透明对照。
// 鼠标抬起完成 Canvas 像素笔迹，再触发正式导出按钮。
// 测试不依赖 rAF 作为节拍，被其他桌面窗口遮住也应能继续。
// data-mask-surface 是原功能已有标记，不向产品暴露测试专用绘画方法。
// 下载预览的图片从本地 Blob 读取，不能请求外部服务器拿一张替代蒙版。
// 手动上传验证入口已移除，本用例从正式生成入口检查上传。
// 每个异步等待复用外层看门狗，超时仍使整条冒烟失败。
// 当前画布与正式导出器共同参与，空 UI 壳或伪造 PNG 不能通过。
async function drawMask(ctx) { await ctx.run("document.querySelector('[data-mask-surface]').scrollIntoView({block:'center'})"); const point = await ctx.run("(()=>{const r=document.querySelector('[data-mask-surface]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()"); await ctx.wait(`document.elementFromPoint(${point.x},${point.y})?.closest('[data-mask-surface]')`); ctx.input({ type: 'mouseMove', ...point }); ctx.input({ type: 'mouseDown', button: 'left', clickCount: 1, ...point }); ctx.input({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
await ctx.wait("Number(document.querySelector('[data-mask-surface]').dataset.maskRevision)>0"); await ctx.click('[data-mask-export]'); await ctx.wait("document.querySelector('[data-mask-preview=image]')?.naturalWidth>0&&!document.querySelector('[data-mask-export]').disabled"); }

/**
* 准备是原用例导入的64×32原图，当前正处于蒙版工具。
* 先真实涂抹并导出，再验证交接仅导入草稿，没有提前上传或开始生成。
* 缺少补丁时点击运行，预期错误点名具体文件，上传和生成计数都不变。
* 恢复补丁后同一草稿重试，真实提交必须使用服务改名后的 input 路径。
* 原RGB、反向alpha、IMAGE输出零和MASK输出一都必须同时正确。
* 成功回包选择当前图的真实 PreviewImage ID，不能用固定旧图ID兜底。
* 结果保存走正式 writer，检查生成工作流完整写入PNG的精确prompt块。
* 原文字模式通过显式按钮恢复，后续原功能回归不能继承新模式污染。
* 边缘测试在其后单独执行，最后再返回编辑保持已有后续测试前置。
*/
// 本模块收到的是正式工作区和上游导入素材，不能重新手工挂载一个简化编辑器。
// 中心RGB在涂抹前读取，随后上传的透明中心必须保留这份独立期望。
// 透明RGB验证不使用Canvas读回上传图，否则全透明颜色可能被预乘清零。
// 导出字节从实际Blob读取，路径和服务回包由主进程夹具另行记录。
// 没有手动上传验证入口，只有点击真实生成后才允许上传计数增加。
// 缺补丁时其他模型均有效，错误必须点名特定model_patches文件。
// 上传计数不变比错误文本更关键，能发现提示失败后仍继续上传。
// 恢复补丁后继续同一草稿，验证错误不会永久锁住表单。
// 服务返回改名与子目录，LoadImage应使用返回名而非本地请求名。
// LLLite Apply的IMAGE和MASK必须来自同一个上传节点。
// 采样器模型必须连到补丁输出，孤立存在一个Apply节点不能算接线成功。
// 蒙版流程不应再出现Cosmos参考节点，它属于文字改图的另一条模型链。
// 边角仍不透明与中心透明共同证明mask方向正确，而非全图清空。
// 保存PNG的prompt与实际提交对象逐字JSON比较，不能只检查含有模型名称。
// 输出回包使用真实图内PreviewImage节点id，旧固定节点不能代替当前工作流。
// 这里的保存handler记录字节，不声称磁盘权限和真实ComfyUI节点已验证。
// 生成完成才出现下载入口，输入素材不能提前冒充输出图。
// 边缘流程独立比较Worker的转换字节，蒙版流程通过不代表Canny正确。
// Canny反转前后每个RGB通道互补，alpha持续不透明。
// 改变反转立即使旧结果不可生成，不能等新结果回来才禁用。
// 控制图上传必须与转换Blob字节相同，避免错把源图或旧缓存发给服务。
// edge模板只接IMAGE，不需要从LoadImage取MASK。
// 生成期间按钮禁用，重复点击不能产生第二条远端请求。
// 停止走共用队列入口，测试不会另开一个无法追踪的控制任务。
// 页面切换返回保留参数，结果生命周期由领域store而非组件effect管理。
// 模拟推理不加载权重，不报告GPU速度或生成图像质量结论。
// 所有等待均受外层看门狗约束，超时会形成非零退出而不是静默成功。
// 源PNG元数据没有在此修改，本测试只检查生成输出的落盘Meta。
// 模型路径采用服务端相对名，不把本地临时绝对路径当模型文件名。
// 测试素材来自隔离夹具目录，任何用户真实素材和输出均不在修改范围。
// 调用方在检查结束后负责切回文字模式，避免改变DOM身份断言前置。
// 本模块不创建Electron实例，冒烟脚本串行运行约束仍有效。
// 截图辅助人工观察，像素与节点断言是功能结论的实际依据。
// 断言失败仍由统一harness记录，不用console日志代替失败退出。
// 直接提交与保存分别捕获，能区分参数丢在builder还是落盘编码阶段。
// 上传过程不是只检查Promise被调用，而是比较真实dataBase64参数。
module.exports = async function checkAnimaControl(ctx, fill) { const { run, wait, click, smoke, requests, uploads, savedPayloads } = ctx;
// 独立读取原图中心像素，透明处RGB必须与该像素逐通道一致。
// 解码发生在涂抹和导出之前，不能拿导出结果自身充当原图期望。
// 原图中心不透明，读取中心RGB不会受全透明预乘清零影响。
// 夹具角点自身半透明，未涂抹处必须保留原alpha，不能强制补成255。
// 两个期望在绘制前取自正式导入位图，不以导出结果自身充当正确答案。
// 显示canvas此刻没有蒙版和虚线，可独立检查输入采样的RGB及alpha。
// 这不修改素材，仍覆盖原64×32半透明PNG的真实导入和上传路径。
// 中心与角点分别检查覆盖和保留，防止把整幅alpha清零也误判成功。
const originalPixels = await run("(()=>{const i=document.querySelector('[data-mask-surface]'),c=document.createElement('canvas');c.width=64;c.height=32;const x=c.getContext('2d');x.drawImage(i,0,0);return {center:[...x.getImageData(32,16,1,1).data],corner:[...x.getImageData(0,0,1,1).data]}})()"); await drawMask(ctx);
// 保存实际导出图字节作为独立观察值，交接和上传不得重新编码这份PNG。
// 只从本页 blob URL 读取，不把数据发送到其他服务或磁盘。
// FileReader 转base64仅用于跨浏览器/主进程比较，不参加产品上传流程。
const exported = await run("fetch(document.querySelector('[data-mask-preview=image]').src).then(r=>r.blob()).then(b=>new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result.split(',')[1]);f.onerror=reject;f.readAsDataURL(b)}))"); const count = requests.length, uploaded = uploads.length; smoke.check('Mask workspace keeps shared generation controls beside the canvas without upload', requests.length === count && uploads.length === uploaded && await run("document.querySelector('[data-control-form=inpaint]')&&document.querySelector('[data-mask-size]').textContent.includes('64 × 32')"));
// 独立关闭补丁清单，其他 UNet/LoRA/CLIP/VAE 都仍存在。
// 错误必须发生在上传之前，不能仅让模拟生成服务拒绝工作流。
// 表单恢复可操作意味着异步失败已被消费，不留下永久忙碌状态。
// 原提示词由资源测试保留，继续使用可解释的非空指令，避免校验空文本抢先失败。
await fill(ctx, '#mask-positive', 'repaint masked region'); ctx.setPatches(false); await click('[data-control-form=inpaint] [data-control-run]'); await wait("!document.querySelector('[data-control-form=inpaint] [data-control-run]').disabled"); smoke.check('Missing inpainting patch fails before upload and names the missing file', requests.length === count && uploads.length === uploaded && await run("document.querySelector('[data-control-form=inpaint] [data-control-status]').textContent.includes('anima-lllite-inpainting-v2.safetensors')")); ctx.setPatches(true); await click('[data-control-form=inpaint] [data-control-run]');
await wait("document.querySelector('[data-control-form=inpaint] [data-control-stop]')&&!document.querySelector('[data-control-form=inpaint] [data-control-stop]').disabled");
// 按主进程记录等待真实生成IPC，状态进入generating并不等于handler已收到。
// 计数必须严格增加一，交接后组件重渲染不能重复提交同一任务。
// 请求仍被夹具挂起，下面检查的是实际跨桥参数而非build函数的中间值。
for (let n = 0; n < 100 && requests.length === count; n++) await new Promise(resolve => setTimeout(resolve, 60)); if (requests.length !== count + 1) throw new Error('Inpainting did not reach generation IPC'); const prompt = requests.at(-1), nodes = Object.values(prompt), apply = nodes.find(node => node.class_type === 'AnimaLLLiteApply'), sampler = nodes.find(node => node.class_type === 'KSampler');
smoke.check('Inpainting routes uploaded IMAGE and MASK through LLLite before sampler', prompt['edit-source'].inputs.image === 'anima-input/server-renamed.png' && JSON.stringify(apply.inputs.mask) === JSON.stringify(['edit-source', 1]) && apply.inputs.image[0] === 'edit-source' && prompt[sampler.inputs.model[0]].class_type === 'AnimaLLLiteApply' && nodes.some(node => node.class_type === 'ModelPatchLoader' && node.inputs.name === 'patches/anima-lllite-inpainting-v2.safetensors') && !nodes.some(node => node.class_type === 'ApplyCosmosReferenceLatent'));
// PNG上传必须与预先导出逐字节相同，避免队列准备时又编码成旧版本输入。
// 未涂抹角点延续源alpha，软透明原图不能被mask补值错误地恢复成不透明。
// 中心alpha归零且RGB保留，符合ComfyUI的IMAGE加反向MASK输入契约。
// 独立filter-0解码器直接读字节，不经过浏览器全透明像素的RGB清零。
const uploadedMask = uploads.at(-1).dataBase64, pixel = pixels(uploadedMask); smoke.check('Mask upload preserves exact PNG, source RGB and alpha outside painted pixels', uploadedMask === exported && pixel(32, 16)[3] === 0 && pixel(0, 0)[3] === originalPixels.corner[3] && JSON.stringify(pixel(32, 16).slice(0, 3)) === JSON.stringify(originalPixels.center.slice(0, 3)));
// 返回当前图真实预览ID，实际输出尺寸640×320与64×32输入严格不同。
// 证明结果尺寸来自解码而非输入预估，不验证GPU生成品质或显存使用。
// 保存完成才允许下载，等待正式保存返回后再检查精确工作流元数据。
// 这张结果来自现有受控夹具，禁止将源图或边缘图冒充真实模型输出。
const previewId = Object.keys(prompt).find(id => prompt[id].class_type === 'PreviewImage'); ctx.resolve({ promptId: 'inpaint-fixture', images: [{ nodeId: previewId, filename: 'inpaint.png', subfolder: '', folderType: 'output', dataUrl: ctx.resultDataUrl }], videos: [] }); await wait("Boolean(document.querySelector('[data-control-download]'))&&!document.querySelector('[data-control-form=inpaint] [data-control-run]').disabled"); const buffer = Buffer.from(savedPayloads.at(-1).files[0].dataBase64, 'base64');
smoke.check('Inpainting saves the submitted patch and mask workflow in PNG metadata', JSON.stringify(savedWorkflow(buffer)) === JSON.stringify(prompt)); await ctx.shot('anima-inpainting-result'); 
// 此处只恢复文字模式，主用例继续检查同一指令DOM的身份。
// 边缘测试稍后单独经过模式重挂载，不污染局部工具切换的身份前置。
// 文字模式恢复只改mode，不清空LoRA或输入，不隐式触发新生成。

};

// 图片页已有高级设置中开关检测，使用正式Worker生成64×32边缘图。
// 调用方提供本地输入PNG，不把手写黑白图片直接塞进组件状态。
// 检测后读输出Blob字节，与真正上传的PNG逐字节比较。
// 两次点击生成在第一个回包前只允许一个上传和生成请求。
// 后一个任务必须排队，取消全部时撤回待执行项并停止当前任务。
// 停止在公共任务列表操作，验证边缘任务没有另开无法取消的队列。
// 测试结束关闭检测并返回编辑，避免污染主题与布局后续断言。
// 仍不验证真实自定义节点安装，服务端回包是明确的隔离模拟。
async function checkEdge(ctx) {
  const { run, wait, click, smoke, requests, uploads } = ctx;
  await click('#edge-edit-tab'); await wait("document.querySelector('[data-canny-source] input')");
  smoke.check('Editor edge inversion starts enabled', await run("document.querySelector('[data-canny-invert]').getAttribute('aria-pressed')==='true'"));
  await run("(()=>{const e=document.querySelector('[data-canny-source] input'),d=new DataTransfer();d.items.add(new File([new Uint8Array(" + JSON.stringify([...ctx.sourceBytes]) + ")],'edge-source.png',{type:'image/png'}));e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await wait("document.querySelector('[data-canny-output]')?.naturalWidth>0");
  // 反转必须改变真实像素，按钮状态变化不足以证明送入控制图的是反转结果。
  // 阈值变化先清旧结果，转换期间生成入口必须同步禁用。
  // 平坦输入与其他图均适用：逐通道比较两次图像互补关系。
  const readPixels = () => run("(()=>{const i=document.querySelector('[data-canny-output]'),c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);return [...x.getImageData(0,0,c.width,c.height).data]})()");
  const first = await readPixels(); await click('[data-canny-invert]');
  smoke.check('Changing inversion invalidates old generation input immediately',await run("document.querySelector('[data-control-form=edge] [data-control-run]').disabled&&!document.querySelector('[data-canny-output]')"));
  await wait("document.querySelector('[data-canny-output]')?.naturalWidth>0"); const second = await readPixels();
  smoke.check('Canny inversion changes actual pixels to their complements',first.length===second.length&&first.every((v,i)=>v===(i%4===3?255:255-second[i])));
  await click('[data-canny-invert]'); await wait("document.querySelector('[data-canny-output]')?.naturalWidth>0");
  const edgeBytes = await run("fetch(document.querySelector('[data-canny-output]').src).then(r=>r.blob()).then(b=>new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result.split(',')[1]);f.onerror=reject;f.readAsDataURL(b)}))");
  const before = requests.length, uploaded = uploads.length; await click('[data-control-form=edge] [data-control-run]');
  for (let n = 0; n < 100 && requests.length === before; n++) await new Promise(resolve => setTimeout(resolve, 60));
  if (requests.length !== before + 1) throw new Error('Edge control did not reach generation IPC');
  const nodes = Object.values(requests.at(-1)), apply = nodes.find(node => node.class_type === 'AnimaLLLiteApply');
  smoke.check('Editor uploads exact converted bytes and edge patch without MASK', uploads.length === uploaded + 1 && uploads.at(-1).dataBase64 === edgeBytes && apply && !('mask' in apply.inputs) && nodes.some(node => node.class_type === 'ModelPatchLoader' && node.inputs.name.includes('any-test-like')));
  smoke.check('Active edge generation prevents duplicate submission', await run("document.querySelector('[data-control-form=edge] [data-control-run]').disabled"));
  await click('[data-control-form=edge] [data-control-stop]'); await wait("!document.querySelector('[data-control-form=edge] [data-control-stop]')");
  await click('#anima-edit-tab');
}

// 独立导出给主套件在原DOM身份断言之后调用，避免模式重挂载改变其前置。
// 该导出仍共用同一Electron窗口，不新建进程或绕过新鲜度检查。
// 真正的跨模式草稿恢复由已有领域store回归覆盖，DOM身份仅针对局部工具切换。
module.exports.checkEdge = checkEdge;

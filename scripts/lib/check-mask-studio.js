/**
 * 蒙版工作区真实交互回归。运行正式静态导出和 preload，服务端推理由 IPC 夹具控制。
 * 使用固定纯色原图和独立 PNG 解码，避免产品导出函数自证正确。
 * 不连接用户 ComfyUI，不声称验证真实模型画质或 GPU 性能。
 */
const zlib = require('node:zlib');
// 导出器是无滤波 RGBA PNG，逐行检查过滤字节后读取像素。
// 透明像素保留 RGB，不能用 nativeImage 的预乘解码判断它们。
// 缺少尺寸或未知滤波必须失败，不把解析失败当作透明黑像素。
// PNG 解码器只接受正式导出器当前产生的filter-0格式，不覆盖全部PNG标准。
// 逐块读取IDAT并解压后，透明RGB可以脱离浏览器预乘行为独立观察。
// 尺寸取IHDR，不能拿输入素材的已知尺寸伪装成实际导出尺寸。
// 一个像素按RGBA四字节读取，灰度mask仍应该有三个相同颜色通道。
// 过滤字节不为零立即抛错，防止偏移错误被误解释为某个正确像素。
// 实际编码器变化时应同步扩展独立解码，不可跳过像素断言。
// 夹具字节完全在内存中，解码失败不使用默认黑色返回。
// 该辅助不检查CRC，不作为读取任意不可信文件的产品解析器。
function decode(base64) {
  const buffer = Buffer.from(base64, 'base64'), chunks = []; let width = 0, height = 0;
  for (let p = 8; p < buffer.length;) { const n = buffer.readUInt32BE(p), kind = buffer.toString('ascii', p + 4, p + 8), data = buffer.subarray(p + 8, p + 8 + n); if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); } if (kind === 'IDAT') chunks.push(data); p += n + 12; }
  const raw = zlib.inflateSync(Buffer.concat(chunks)), stride = width * 4 + 1;
  if (!width || !height) throw new Error('PNG dimensions missing');
  for (let y = 0; y < height; y++) if (raw[y * stride]) throw new Error('Unexpected PNG row filter');
  return { width, height, pixel: (x, y) => [...raw.subarray(y * stride + 1 + x * 4, y * stride + 5 + x * 4)] };
}
// 从实际缩略图 URL 取出正式输出字节，不直接读取 store 或私有文档对象。
// 每次导出等待新图解码，避免读到上一次的旧预览。
// 这些等待受外层单步超时和总看门狗保护。
// 导出按钮是产品真实控件，生成Blob的路径与用户操作相同。
// 结果从hidden图像的实际src获取，不调用store.export直接得到预期对象。
// 每次输出类型可选择mask/image/painting，检查同一文档不同通道含义。
// FileReader失败需reject，否则浏览器异常会让测试无期限等待。
// 等待naturalWidth保证图像真实可解码，不只看到一个src字符串。
// 外层导出点击自带一次等待，当前同步编码路径已发布新exports后才取图。
// 下载会由隔离会话拦截，测试不在用户Downloads目录制造文件。
// 正式Blob仍读取完整字节，因此拦截下载不削弱编码契约检查。
async function output(ctx, kind = 'mask') {
  await ctx.click('[data-mask-export]'); await ctx.wait("document.querySelector('[data-mask-preview=" + kind + "]')?.naturalWidth>0");
  return ctx.run("fetch(document.querySelector('[data-mask-preview=" + kind + "]').src).then(r=>r.blob()).then(b=>new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result.split(',')[1]);f.onerror=reject;f.readAsDataURL(b)}))");
}
// 输入事件通过 DOM 原生 setter 进入 React，数值控件和业务校验均参与。
// 提示词是 contenteditable，因此使用 input 事件，不修改 Zustand 内部状态。
// onChange 执行后有界等待下一任务拍，不以页面 rAF 作为节拍。
// input控件使用原型setter，避免React追踪把直接value赋值误认为没有变化。
// contenteditable使用textContent和input事件，匹配公共提示词组件的读取方式。
// 选择器与值经JSON编码，不把测试文字拼成可执行页面代码。
// 输入字段不存在时应失败，不能悄悄跳过用户无法执行的操作。
// 变化后等待主进程timer，避免依赖被遮挡页面的rAF节拍。
// 只编辑正式控件，不从React fiber提取内部setter绕过UI。
async function field(ctx, selector, value) {
  await ctx.run("(()=>{const e=document.querySelector(" + JSON.stringify(selector) + ");if(e.isContentEditable)e.textContent=" + JSON.stringify(String(value)) + ";else Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e," + JSON.stringify(String(value)) + ");e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await new Promise(resolve => setTimeout(resolve, 80));
}
// 真实鼠标按下、移动、抬起覆盖 pointer capture 和屏幕到原图的坐标换算。
// 位置相对于 canvas 的实际矩形，不假设画布从窗口左上角开始。
// 每笔先滚动到可见区域，避免测试坐标落在滚动容器之外。
// 画布矩形在滚动后读取，窗口断点改变时不复用过时的坐标。
// 传入位置是相对于图像的比例，不是相对于整个视口的固定像素。
// 鼠标事件由Electron送入真实页面，产品坐标换算和pointer capture都参与。
// 水平拖动分八段，覆盖快速笔迹插值而不是只测试单击。
// 抬起坐标等于最后移动点，能够观察重复stamp造成透明度叠加的回归。
// 完成后由正式导出读取PNG，屏幕叠加色不能代替实际mask覆盖率。
// 此辅助只支持水平线，套索等二维路径由独立geometry helper覆盖。
// 每次笔迹仍是一个撤销步骤，不能因八个move创建八份历史。
async function paint(ctx, x, y, toX = x) {
  await ctx.run("document.querySelector('[data-mask-surface]').scrollIntoView({block:'center'})");
  const box = await ctx.run("(()=>{const r=document.querySelector('[data-mask-surface]').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()");
  const at = value => ({ x: Math.round(box.x + box.w * value), y: Math.round(box.y + box.h * y) });
  const p = at(x); ctx.input({ type: 'mouseMove', ...p }); ctx.input({ type: 'mouseDown', button: 'left', clickCount: 1, ...p });
  if (toX !== x) for (let i = 1; i <= 8; i++) ctx.input({ type: 'mouseMove', ...at(x + (toX - x) * i / 8) });
  ctx.input({ type: 'mouseUp', button: 'left', clickCount: 1, ...at(toX) }); await new Promise(resolve => setTimeout(resolve, 100));
}
// 面板通过正式按钮展开，参数更改后收起，避免遮挡后续落笔位置。
// 大小/硬度/透明度读取正式表单输入，覆盖值域和 React 状态更新。
// 每组参数只影响后续笔迹，历史像素不重新计算。
// 浮层通过正式设置按钮打开，不能直接修改brush store。
// 逐字段操作现有数值控件，值域和受控回调同时被测试。
// 设置完主动关闭，避免浮层挡住后续鼠标坐标。
// 大小、硬度和强度故意改变，后面的像素差异能发现未连接回调的控件。
// 参数只影响后续落笔，不应重新绘制旧历史内容。
// 没有请求任何模型服务，颜色和alpha结果由本地工具计算。
async function brush(ctx, values) {
  await ctx.click('[data-mask-settings]');
  for (const [key, value] of Object.entries(values)) await field(ctx, '[name=mask-' + key + ']', value);
  await ctx.click('[data-mask-settings]');
}

/**
 * 基线：512×320，RGB=(180,100,20)，保证透明处颜色能独立计算。
 * 先验证当前导出和旧能力，再测试软笔刷、反转、变换和颜色选择。
 * 文档宽高与颜色断言由固定输入推导，不以产品返回作为期望值。
 * 每个状态操作后读取 PNG，可以发现“按钮有反应但输出没改变”的错误。
 * 新工具检查结束后恢复可运行草稿，继续验证队列和实际上传字节。
 */
// 初始画布512×320和RGB=(180,100,20)均由测试独立创建。
// 纯色底图让mask覆盖与颜色变化可分开判断，避免纹理差异掩盖问题。
// 导入经过真实FileList和change事件，产品解码、尺寸检查及初始化都参与。
// 同名solid.png不作为文档身份依据，后续流程读取实际像素尺寸。
// 进入编辑和蒙版使用正式标签，不手工创建工作区实例。
// 普通文生图页面先检查没有Canny，防止旧入口残留造成两套状态。
// 空蒙版中心应黑色不透明，而非透明空白或默认全白。
// 硬笔拖动中心应白色，未碰边角应黑色，两者构成正负对照。
// 原图透明输出中心保留RGB并alpha=0，边角则保持alpha=255。
// 这一对照能发现把mask.alpha直接当上传alpha而没有反向的错误。
// 擦除中心必须减少mask覆盖率，而不是只把屏幕叠加颜色变淡。
// 撤销恢复擦除前覆盖，重做再次去除，验证两方向历史都实际工作。
// 软笔使用100像素直径、零硬度和0.5强度，预期中心约128而非255。
// 边缘点必须非零且弱于中心，单纯全图半透明不能冒充软边笔刷。
// 允许少量8bit取整范围，避免把浏览器像素中心差异当作功能回归。
// 反转中心与旧值相加255，未绘制边角同时由黑变白。
// 只比较按钮aria状态不足以证明所有灰度都确实求补值。
// 旋转后宽高交换为320×512，非中心边界点按90度映射检查。
// 如果只交换尺寸没有转像素，独立坐标读取将不能通过。
// 保存先建立检查点，清空再取消应恢复该点，而非新建空文档。
// RGB绘画另存painted，image通道中心仍必须是未改色的原图。
// painting通道中心则是画笔色，证明绘画不仅存在于屏幕提示层。
// 颜色选择读取RGB合成，画笔色中心被选中，纯色背景排除。
// 连通桶点击背景后覆盖边角，却不能跨过中央不同颜色区域。
// 几何和滤镜专项随后执行，并各自恢复必要状态供队列验证。
// 反向预设返回实际控件文字，后面提交prompt必须含完全同一文本。
// 当前控制素材为最新composite通道，painted颜色与mask必须同时进入工作流。
// 模型补丁清单先设为空，其余资源保持有效，隔离单个缺失条件。
// 错误需要点名inpainting补丁，而不是被空指令或缺原图抢先拒绝。
// 上传和生成记录均不得增加，证明失败发生在任何远端副作用之前。
// 恢复补丁后直接重试同一草稿，不刷新绕过错误恢复问题。
// 上传字节与导出composite的base64严格相等，重新编码或选择错通道都会失败。
// 工作流的IMAGE和MASK必须来自同一个上传LoadImage节点。
// MASK输出索引为1，IMAGE为0，错接可见图像不能当作蒙版通过。
// 共享任务列表中应出现正在运行记录，证明没有另起独立调度。
// 正式停止入口结束pending夹具，测试不能留一个未释放的队列项。
// 这里检查IPC请求契约，真实GPU推理和自定义节点安装不在范围。
// 窄屏依次使用900、390、320像素，覆盖双栏到页内切换的实际断点。
// 检查document和grid内部溢出，不能只看最外层是否裁掉内容。
// 设置入口切换后右侧表单必须有实际宽度，隐藏一切不能算适配成功。
// 返回canvas再切工具，导出像素仍要与之前一致，不能靠展示旧截图。
// 桌面恢复1440宽后再切主题，避免把窄屏隐藏当作暗色缺失。
// 主题通过正式菜单操作，不手工写CSS颜色伪装产品支持。
// 等待theme-ripple结束才截图，过渡快照不代表最终配色。
// 暗色画笔设置浮层须仍能打开和关闭，不能只有静态画布有颜色。
// 结束前恢复亮色，后续边缘专项拥有可控主题前置。
// 边缘专项继续使用当前隔离窗口，不启动第二个Electron进程。
// 最终回到蒙版保留截图，便于核对本轮实际产品UI。
// 素材、URL和隔离用户目录全部属于测试夹具，不读取真实用户相册。
// 所有检查仍走外层smoke.check，失败会影响进程退出码。
// 测试的截图只是辅助证据，核心结论依赖DOM几何和实际PNG字节。
// 不把本地回包图称作真实模型生成，也不记录模型画质或性能结论。
// 生成任务和页面草稿来自不同生命周期，切页不能自动取消任务。
// 缩放相关检查仅改变图像CSS尺寸，导出的自然像素仍应保持512×320。
// 显示透明度、蒙版颜色和图层显隐都不应该改变上述工作流输入约定。
// 当前回归保留旧涂抹/擦除能力，同时为新工具提供独立反证。
// 任何单项抛异常都由外层finally保留证据并关闭自己的窗口。
// 主进程timer和看门狗确保等待有上限，不能用永久pending冒充没有失败。
// 测试过程不会修改真实ComfyUI模型目录或下载用户权重。
// 跨路由保持只验证同一渲染进程内草稿，不承诺应用重启后的编辑恢复。
// 裁剪尺寸与保存PNG参数分别验证，画布UI正确不等于文件契约正确。
// 正反向提示词有不同contextId，预设应用不应污染编辑指令。
// 正式生成入口会重新导出最新文档，不依赖用户先点击预览或下载。
// 手动导出不应自行调用上传接口，这个负向条件由独立计数检查。
// mask与image的方向约定保留旧格式，已有工作流无需读取新增特殊字段。
// 数据读取使用当前结果而非组件内部草稿，能发现显示成功但实际提交错误。
// 当前脚本没有构造框架级mock组件，UI交互均在生产静态导出上执行。
// 构建新鲜度由外层门禁检查，源码与产物不一致时不得判定为产品回归。
// 硬笔中心与未触及角落同时检查，防止只产生全白或全黑输出而误通过。
// 保留原RGB的透明PNG直接读取解压字节，不用系统图片预览代替。
// 半透明软笔中心区间刻意排除75%重复盖章结果。
// 旋转后的像素位置来自已知90度映射，不复用产品变换函数。
// 取消操作前先保存，再清空，避免空初始状态让取消看似有效。
// RGB画笔与mask保持分层，后续颜色选择必须基于合成RGB。
// 颜色工具匹配的是画笔颜色，蒙版预览紫色不可参与判断。
// 连通区域检查中央未选，确保油漆桶不会无条件全图涂满。
// control生成先设置明确非空指令，缺补丁场景不被文本校验抢先截获。
// 模拟服务端补丁列表恢复后不重新导入素材，验证用户可直接重试。
// 每次请求都读取最后一条实际IPC记录，不能拼一份本地工作流自证。
// 比较完整base64可以发现提交时多次PNG重编码导致的字节漂移。
// 模型Apply节点必须连上sampler，孤立节点不能证明补丁生效。
// 在任务中心检查活动卡片，避免控制工具另开不受管理的任务通道。
// 停止通过真实按钮，后续断点回归不继承仍在运行的锁定状态。
// 宽度900时容器实际可用空间不足880，仍需正确切到窄栏访问方式。
// 宽度390与320分别覆盖常见窄屏和最小宽度，不仅检查桌面缩窄一点。
// 反向预设只保留一个编辑器id，隐藏的重复输入同样应被排除。
// 工具往返后读取具体背景点，不能仅看到文件名就断言像素草稿保留。
// 主题截图等待过渡结束，保留最终画布和浮层的实际颜色。
// 亮色恢复也通过原菜单，避免遗留测试专用样式。
// Canny专项经过真实Worker，这里不会手写边缘PNG塞进产品state。
// fixture图片不包含用户内容，截图和字节记录只写隔离临时目录。
// 测试无论成功失败都由外层关闭自己的BrowserWindow。
// 没有对现有桌面Electron进程进行全局终止或复用。
// 本组通过代表这些交互与契约成立，不扩大为真实模型推理成功。
// PNG解析器与产品编码分开，能发现原RGB或alpha方向同时错写的回归。
// 缺文件提示检查包含模型文件名，不能用任意非空错误文字代替。
// 下载是显式动作，普通画笔move不应执行PNG压缩和网络上传。
// 工具偏好与像素历史分开，撤销不会突然把用户笔刷改回默认值。
// 源图尺寸由自然缓冲提供，放大镜倍率不应写入模型宽高。
// 阶段和副作用计数相互对照，只有UI显示成功不足以通过测试。
// 队列结果必须经正式保存返回，生成回包不能直接伪造下载完成。
// 脚本复用外层退出码护栏，失败后app.quit也不能返回成功。
// 本次未建立视觉像素金图，布局断言使用几何不变量以减少主题差异误报。
// 回归后文档和参数仍可继续操作，不通过整页刷新清掉失败状态。
// 测试原图和模拟输出尺寸不同，能发现把输入图误认作结果的缺陷。
// 轮询次数与每步超时都有边界，异常迟迟不返回仍会明确失败。
// 选择文件使用真实DataTransfer，导入MIME、内容解码与文件名路径相互独立。
// 新工具的undo必须恢复原始RGB和mask两类数据，不能只修复屏幕观感。
// 工具结果是本地像素输出，服务端自定义节点是否安装需另行联调。
// 当前图片Meta读取使用源File，不依赖已经裁剪旋转的Canvas重新编码。
module.exports = async function checkMaskStudio(ctx) {
  const { run, wait, click, smoke, metrics, shot } = ctx;
  smoke.check('Ordinary image mode has no Canny controls', await run("!document.querySelector('[data-canny-enable]')&&!document.querySelector('[data-canny-panel]')"));
  await run("[...document.querySelectorAll('[data-create-mode-tabs] button')].find(b=>b.textContent.trim()==='编辑').click()"); await click('#mask-edit-tab');
  const source = await run("(()=>{const c=document.createElement('canvas');c.width=512;c.height=320;const x=c.getContext('2d');x.fillStyle='rgb(180,100,20)';x.fillRect(0,0,512,320);return c.toDataURL('image/png').split(',')[1]})()");
  await run("(()=>{const e=document.querySelector('[data-mask-import]'),d=new DataTransfer();d.items.add(new File([Uint8Array.from(atob(" + JSON.stringify(source) + "),c=>c.charCodeAt(0))],'solid.png',{type:'image/png'}));e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()"); await wait("document.querySelector('[data-mask-size]')?.textContent.includes('512 × 320')");
  smoke.check('Empty mask exports black at original dimensions', decode(await output(ctx)).pixel(256,160).join() === '0,0,0,255');
  // 自由选色先验证真实 RGB 笔迹，再撤销并恢复默认画笔供旧能力回归。
  // 蒙版显示色的反证比较正式导出字节，不能只检查按钮值变了。
  // 使用同一个隔离窗口串行操作，选色弹层与画布不并发抢焦点。
  await require('./check-color-picker')(ctx,{output,decode,paint,field});
  await paint(ctx,.3,.5,.7); const hard = decode(await output(ctx)), alpha = decode(await output(ctx,'image'));
  smoke.check('Hard brush preserves legacy mask semantics', hard.pixel(256,160)[0] === 255 && hard.pixel(0,0)[0] === 0);
  smoke.check('Transparent mask PNG retains original RGB exactly', alpha.pixel(256,160).join() === '180,100,20,0' && alpha.pixel(0,0).join() === '180,100,20,255');
  await click('[data-mask-mode=erase]'); await paint(ctx,.5,.5); smoke.check('Erase removes coverage', decode(await output(ctx)).pixel(256,160)[0] === 0);
  await click('[data-mask-action=undo]'); smoke.check('Undo restores erased pixels', decode(await output(ctx)).pixel(256,160)[0] === 255);
  await click('[data-mask-action=redo]'); smoke.check('Redo restores erased state', decode(await output(ctx)).pixel(256,160)[0] === 0);
  await click('[data-mask-action=clearCanvas]'); await click('[data-mask-mode=draw]'); await brush(ctx,{size:100,hardness:0,opacity:.5}); await paint(ctx,.5,.5);
  const soft=decode(await output(ctx)); smoke.check('Soft brush exports graded coverage and honors opacity', soft.pixel(256,160)[0]>110 && soft.pixel(256,160)[0]<140 && soft.pixel(290,160)[0]>0 && soft.pixel(290,160)[0]<soft.pixel(256,160)[0]);
  await click('[data-mask-action=invert]'); const inverted=decode(await output(ctx)); smoke.check('Invert is exact complement including soft pixels', inverted.pixel(256,160)[0]===255-soft.pixel(256,160)[0] && inverted.pixel(0,0)[0]===255);
  await click('[data-mask-action=undo]'); await click('[data-mask-action=rotate]'); const rotated=decode(await output(ctx)); smoke.check('Rotation swaps dimensions and transforms mask pixels', rotated.width===320 && rotated.height===512 && rotated.pixel(159,256)[0]===soft.pixel(256,160)[0]);
  await click('[data-mask-action=undo]'); await click('[data-mask-action=save]'); await click('[data-mask-action=clearCanvas]'); await click('[data-mask-action=cancel]'); smoke.check('Cancel restores explicitly saved mask', decode(await output(ctx)).pixel(256,160)[0]===soft.pixel(256,160)[0]);
  await click('[data-mask-action=clearCanvas]'); await brush(ctx,{size:40,hardness:1,opacity:1}); await click('[data-mask-mode=paint]'); await paint(ctx,.5,.5);
  const original=decode(await output(ctx,'image')), painted=decode(await output(ctx,'painting'));
  smoke.check('RGB brush changes paint composite without modifying original export', original.pixel(256,160).slice(0,3).join()==='180,100,20' && painted.pixel(256,160).slice(0,3).join()==='255,85,119');
  await click('[data-mask-mode=select]'); await paint(ctx,.5,.5); const selected=decode(await output(ctx)); smoke.check('Color selection selects painted color and excludes background', selected.pixel(256,160)[0]===255 && selected.pixel(0,0)[0]===0);
  await click('[data-mask-action=clearCanvas]'); await click('[data-mask-mode=fill]'); await paint(ctx,.1,.1); const filled=decode(await output(ctx)); smoke.check('Connected fill follows image color boundary', filled.pixel(10,10)[0]===255 && filled.pixel(256,160)[0]===0);
  await click('[data-mask-action=flipX]'); await click('[data-mask-action=undo]');
  const negativePreset = await require('./check-mask-tools')(ctx,{output,decode,paint,field});
  await shot('mask-studio-desktop');
  // 下一阶段只模拟服务端回包；上传和保存仍走正式桥接与编码代码。
  // 缺补丁先失败且不上传，恢复后同一页面重试必须能够成功入队。
  // 运行时按钮禁用和公共任务卡片同时验证，不能只检查一个 loading 文案。
  // 通过独立组装回归生成非空分类草稿，避免只验证普通输入的旧路径。
  // 返回值保留真实工具结果，后面沿采样器正向连线检查其确实提交。
  // 此调用保持高级打开，任务期间继续验证分类编辑被锁定。
  const positivePrompt = await require('./check-mask-prompt')(ctx,field);
  // 正式 DOM 检查三个观察通道与导出入口，不能仅检查源码中移除了按钮。
  // 导出位于导入同一工具条，标签必须是新名称，原卡片下载动作应消失。
  // 第四个内部合成 PNG 仍用于上传像素对照，但没有可见通道按钮。
  // 控制模式必须从自己的模板初值开始，不继承前面文字编辑的 LoRA。
  // 通过实际输入事件调整强度和区间，随后从真实生成 IPC 验证参数。
  // 先把起点越过终点检查夹取，再退回合法范围，两个端点不能交叉。
  // 测试只模拟推理回包，不用生成的假图证明 GPU 质量或节点兼容性。
  // 参数区在桌面正常可访问，窄屏布局会在后续既有循环继续覆盖。
  // 所有数值期待独立写出，不能调用产品默认读取器生成测试预期。
  // 公共滑块通过真实 input 事件改变受控值，不直接操作 Zustand。
  // 当前默认固定种子保留，随机能力仍可由用户显式开启。
  // 缺补丁的后续失败应发生于上传前，调参不能绕过模型前置检查。
  smoke.check('Only three channels remain and export is beside import',await run("document.querySelectorAll('[data-mask-channel]').length===3&&!document.querySelector('[data-mask-channel=composite]')&&!document.querySelector('[data-mask-download]')&&document.querySelector('[data-mask-export]').textContent.includes('导出当前图片')&&document.querySelector('[data-mask-export]').parentElement===document.querySelector('[data-mask-import]').parentElement.parentElement"));
  smoke.check('Control defaults are visible in shared strength and dual range inputs',await run("document.querySelector('[data-control-form=inpaint] input[name=anima-control-strength]').value==='1'&&document.querySelector('[data-control-form=inpaint] [data-interval-lower]').value==='0'&&document.querySelector('[data-control-form=inpaint] [data-interval-upper]').value==='1'&&document.querySelectorAll('[data-control-form=inpaint] [data-extension-item]').length===0"));
  await field(ctx,'[data-control-form=inpaint] [data-interval-upper]',0.8);await field(ctx,'[data-control-form=inpaint] [data-interval-lower]',0.95);
  smoke.check('Dual range prevents crossing endpoints',await run("document.querySelector('[data-control-form=inpaint] [data-interval-lower]').value==='0.8'&&document.querySelector('[data-control-form=inpaint] [data-interval-upper]').value==='0.8'"));
  await field(ctx,'[data-control-form=inpaint] input[name=anima-control-strength]',0.65);await field(ctx,'[data-control-form=inpaint] [data-control-endpoint=controlStart]',20);
  // 调参完成后切到右侧组装视图，footer 生成入口仍必须有效。
  // 下方正文保持高级合并结果，隐藏参数不应重置已填写强度或区间。
  // 缺模型及随后成功提交都在该视图执行，验证替换后不是只剩静态面板。
  await click('[data-mask-advanced]');
  const before=ctx.requests.length, uploads=ctx.uploads.length; ctx.setPatches(false); await click('[data-control-form=inpaint] [data-control-run]'); await wait("document.querySelector('[data-control-form=inpaint] [data-control-status]').textContent.includes('inpainting-v2')");
  smoke.check('Missing patch fails before upload',ctx.requests.length===before&&ctx.uploads.length===uploads);ctx.setPatches(true);
  // 既有 RGB 硬笔中心是粉色，外侧连通 mask 保持覆盖，二者来自真实工具操作。
  // 原图通道不含粉色，因此先确认两份 RGB 确实不同，防止空绘画的恒真比较。
  // 中心保留、不透明；角落重绘、透明，同时检查 RGB 与 alpha 的独立含义。
  // 比较整份 composite 字节后再核对上传像素，不能只证明上传某个 PNG 成功。
  // 切到黑白预览再生成，实际输入仍必须固定为编辑合成而不跟随选中通道。
  // 服务端为隔离 IPC 夹具，这里证明请求字节正确，不代表真实 GPU 推理已验证。
  const expected=await output(ctx,'composite'), editedInput=decode(expected), originalInput=decode(await output(ctx,'image'));
  smoke.check('Generation fixture distinguishes edited RGB and masked alpha',editedInput.pixel(256,160).join()==='255,85,119,255'&&originalInput.pixel(256,160).slice(0,3).join()==='180,100,20'&&editedInput.pixel(0,0)[3]===0);
  await click('[data-mask-channel=mask]');await click('[data-control-form=inpaint] [data-control-run]');
  for(let i=0;i<100&&ctx.requests.length===before;i++)await new Promise(resolve=>setTimeout(resolve,60));
  if(ctx.requests.length!==before+1)throw new Error('Mask generation did not reach IPC');
  // 接收端记录实际上传载荷，与正式导出的编辑合成逐字节核对。
  // 这条断言能拦截退回 result.image 的实现，即使蒙版仍然正确也会失败。
  // 当前预览是黑白 mask，上传内容仍须含粉色 RGB 与原图背景。
  smoke.check('Generation uploads edited composite RGB plus latest mask alpha',ctx.uploads.at(-1).dataBase64===expected);
  // 明确沿 KSampler 的正负输入连线检查，孤立的同文节点不能冒充有效提示词。
  // 两段文字来源独立：正向来自分类工具，负向来自右侧公共预设。
  // 检查字段方向可发现 UI 位置已换但实际参数仍然反接的错误。
  const submitted=ctx.requests.at(-1), conditioning=Object.values(submitted).find(node=>node.class_type==='KSampler').inputs;
  smoke.check('Assembled positive and side negative reach their respective sampler inputs',submitted[conditioning.positive[0]].inputs.text===positivePrompt&&submitted[conditioning.negative[0]].inputs.text===negativePreset);
  // 原生 fieldset 禁用覆盖 textarea，高级开关显式禁用，避免运行中改写草稿。
  // 这里确认任务真正在运行后才检查，不使用手动 disabled 属性伪造忙碌态。
  // Portal 的迟到写入另由常驻草稿动作读取实时任务门闩拒绝。
  smoke.check('Running mask task locks category editor and advanced switch',await run("document.querySelector('[data-mask-advanced]').disabled&&document.querySelector('[data-mask-assembly] [data-prompt-tab-input]').matches(':disabled')"));
  const prompt=ctx.requests.at(-1),apply=Object.values(prompt).find(n=>n.class_type==='AnimaLLLiteApply');smoke.check('Mask workflow uses IMAGE and MASK from uploaded image',apply.inputs.image[0]==='edit-source'&&apply.inputs.mask[1]===1);
  // 比较跨桥最终参数，不以表单显示值代替真正送入补丁的节点值。
  // 采样参数没有被用户修改，应保持 JSON 的步数、CFG、调度器和种子。
  // 无 LoRA 是该模板基准的一部分，不能继承文字编辑预载扩展。
  // 控制修改不能改变 LoadImage 尺寸链或蒙版 IMAGE/MASK 输出约定。
  // 这里的请求由隔离 IPC handler 捕获，尚未执行真实 ComfyUI GPU 节点。
  // 任务已进入公共队列，随后既有停止测试继续验证唯一任务门闩。
  const sampler=Object.values(prompt).find(n=>n.class_type==='KSampler');
  smoke.check('Control UI writes strength and start/end into actual submitted workflow',apply.inputs.strength===0.65&&apply.inputs.start_percent===0.2&&apply.inputs.end_percent===0.8);
  smoke.check('Inpainting submission preserves template sampling and has no hidden edit LoRA',sampler.inputs.steps===15&&sampler.inputs.cfg===3&&sampler.inputs.seed===1116671677902762&&sampler.inputs.sampler_name==='euler'&&sampler.inputs.scheduler==='simple'&&sampler.inputs.denoise===1&&!Object.values(prompt).some(n=>n.class_type==='LoraLoaderModelOnly'));
  await click('[data-window-generation]');await wait("document.querySelector('[data-generation-task-status=generating]')");smoke.check('Mask task is present in the common queue',true);await click('#window-generation-center button[aria-label=关闭]');
  await click('[data-control-form=inpaint] [data-control-stop]');await wait("!document.querySelector('[data-control-form=inpaint] [data-control-stop]')");
  // 恢复可编辑首通道，后续窄屏与工具测试不继承只读 mask 观察状态。
  // 恢复观察通道不更改任何像素，也不取消已由上一步停止的任务。
  // 页面级导出仍可任意选择通道，只有生成路径固定使用 composite。
  await click('[data-mask-channel=painting]');
  // 双端控件与普通数值框都必须继承运行期间的 fieldset 禁用边界。
  // 停止后保持用户设置，不能以任务结束为由回填模板默认值。
  // 跨工具返回后的实际参数同样检查，避免只证明 Canvas 像素被保留。
  // 断点后检查真实输入坐标与页面横向溢出，不只检查 Tailwind 类名。
  // 主题通过正式设置入口切换，不能注入 CSS 伪造暗色截图。
  for(const width of [900,390,320]){await metrics(width,844);smoke.check('Mask workspace fits '+width+'px',await run("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('[data-mask-grid]').scrollWidth<=document.querySelector('[data-mask-grid]').clientWidth"));await click('[data-mask-pane=settings]');smoke.check('Narrow settings remain accessible at '+width,await run("document.querySelector('[data-control-form=inpaint]').getBoundingClientRect().width>0"));await click('[data-mask-pane=canvas]');}
  await metrics(1440,900);await click('#anima-edit-tab');await click('#mask-edit-tab');smoke.check('Tool switch preserves document pixels',decode(await output(ctx)).pixel(10,10)[0]===filled.pixel(10,10)[0]);
  // 用正式主题入口检查画布和参数在暗色下仍可见，截图保留原像素预览。
  // 测试只验证主题传递和布局，不把截图比较当成模型质量指标。
  await click('[data-theme-trigger]'); await click('[data-theme-option=dark]'); await require('./sidebar-menu-fixture').closeAppearance(run);
  // 自由色板也必须继承实际暗色主题，不能落回操作系统的默认浅色窗口。
  // 打开蒙版颜色入口保留截图，测试不会为截图临时注入背景 CSS。
  // Escape 通过正式键盘路径收起，随后关闭设置给主题菜单让出空间。
  // 当前验证仅涉及颜色 UI，实际蒙版覆盖率此前已用导出字节作反证。
  // 与亮色用例共用组件，不使用专门的测试色板替代正式入口。
  // 背景从 Portal 外壳实测读取，不能只看到根节点 dark 字样就通过。
  // 保留既有截图名，历史人工核对入口仍可直接找到本轮暗色结果。
  await wait("document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('theme-ripple')"); await click('[data-mask-settings]');await click('[data-color-trigger=mask]');await shot('mask-studio-brush-dark');
  smoke.check('Color popup inherits dark theme',await run("getComputedStyle(document.querySelector('[data-color-picker]').closest('[role=dialog]')).backgroundColor!=='rgb(255, 255, 255)'"));
  await run("document.querySelector('[data-color-channel=blue]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await click('[data-mask-settings]');
  await click('[data-theme-trigger]'); await click('[data-theme-option=light]'); await require('./sidebar-menu-fixture').closeAppearance(run);
  await require('./check-anima-control').checkEdge({...ctx,sourceBytes:Buffer.from(source,'base64')});
  await click('#mask-edit-tab');await shot('mask-studio-final');
};

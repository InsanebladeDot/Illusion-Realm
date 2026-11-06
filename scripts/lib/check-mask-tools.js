/**
 * 套索、裁剪、模糊与新版布局的真实 Electron 交互回归。
 * 使用上游套件的 512×320 纯色底图和中央 RGB 笔迹。
 * 输出读取正式 PNG 后独立解码，不从产品 store 获取预期像素。
 * 不连接 ComfyUI；这里验证本地编辑与表单，而非 GPU 画质。
 */

// points 是相对于原图的比例，因此窗口缩放不会改变测试目标。
// 真实鼠标事件进入 pointer capture，不直接调用像素工具冒充交互。
// 几何手势需要不同 y，原基础画笔 helper 仅支持水平线。
// 每次滚动后重读矩形，避免复用旧页面位置点到工具条。
// 等待使用主进程计时器，窗口遮挡不会停在 rAF。
// 最后抬起点与最后移动点相同，用于覆盖重复收尾的边界条件。
// points 至少两点，单击操作继续使用基础套件的 paint helper。
// 每一段移动等待35ms，让Chromium采集到中间顶点而不是合并成一个终点。
// 这不修改产品算法，只保证输入确实包含测试意图中的三角路径。
// 点坐标由当前canvas矩形换算，不能以main区域宽度代替图像宽度。
// 起点和终点可以相同，闭合套索仍应包含多个不同顶点。
// mouseup之后等待状态提交，再点击选择转换或裁剪确认。
// 辅助不调用工具store，也不向Canvas直接填充三角形。
// 因此缺少pointermove处理或坐标换算错误都会在后续像素断言暴露。
// 只用于本地工具，不代表输入设备压感或触控多指行为已经覆盖。
// 页面滚动发生在手势之前，捕获过程不会再改变工具条位置。
// 需要取消手势的场景应另发pointercancel，正常mouseup不能当取消。
async function gesture(ctx, points) {
  await ctx.run("document.querySelector('[data-mask-surface]').scrollIntoView({block:'center'})");
  const box = await ctx.run("(()=>{const r=document.querySelector('[data-mask-surface]').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()");
  const at = point => ({ x: Math.round(box.x + box.w * point[0]), y: Math.round(box.y + box.h * point[1]) });
  ctx.input({ type: 'mouseMove', ...at(points[0]) }); ctx.input({ type: 'mouseDown', button: 'left', clickCount: 1, ...at(points[0]) });
  // Chromium 合并同拍 mouseMove，逐顶点等待确保真实套索路径没有被压成终点。
  // 这是输入采样前置，不通过注入业务状态替代手绘操作。
  for (const point of points.slice(1)) { ctx.input({ type: 'mouseMove', ...at(point) }); await new Promise(resolve => setTimeout(resolve, 35)); }
  ctx.input({ type: 'mouseUp', button: 'left', clickCount: 1, ...at(points.at(-1)) }); await new Promise(resolve => setTimeout(resolve, 120));
}

// 先检查独立的通道视图不会被点击当成新的蒙版笔迹。
// 缩略图排列通过真实几何断言，class 名含 flex-col 不能证明最终布局。
// 四张通道应位于主图右侧，顺序以可编辑合成作为首张。
// 下方提示词必须在画布之后且只有一个受控输入。
// 不检查外部生成图的视觉相似度，固定输入保证布局可复现。
// 通道几何从实际DOMRect读取，不能把存在四个按钮当作排布正确。
// 每项顶部必须低于上一项底部，水平卡片排列会明确失败。
// 右侧rail必须在stage右边，不能浮在图片中央遮住主体。
// 首项稳定为painting，用于回到可写图像，不误把mask当默认原图。
// 导入input必须属于工具条且multiple为false，满足单图文档约束。
// 反向预设区的top必须在stage之后，不允许挤进右侧再放一个重复输入。
// 旧上传验证按钮应不存在，不能只是变成透明或被遮住。
// 缩放之前记录stage宽高、canvas宽高和左区scrollTop。
// 点击放大后canvas宽度必须增加，同时stage两边长度保持完全一致。
// 这个对照能区分放大镜与改变整个左栏宽高两种实现。
// 随后在主图派发可取消wheel事件，确认正式非被动监听接受输入。
// Alt 滚轮向下使图像缩小，普通滚轮和 Ctrl 滚轮分别平移图片。
// 该断言不依赖固定倍率，避免对指数缩放公式作实现镜像测试。
// 适应按钮在像素操作之前恢复视图，后续几何点仍落在预期位置。
// 切到mask通道后故意点击画布，导出字节应与点击前严格相同。
// 如果只读守卫失效，中心覆盖变化就会导致该负向对照失败。
// 回到painting后继续工具检查，不能把测试停留在禁用通道。
// 此处滚轮为DOM事件集成验证，不声称已覆盖所有触控板驱动行为。
// 布局证据来自产品静态导出，不能用模板截图替代实际容器尺寸。
// 没有通过overflow裁掉错误宽度来通过，只要grid内部溢出仍会被外层捕获。
// 固定视口先记录初值，再分别点击按钮和派发wheel，两个入口均需保持布局。
// 放大不改变stage.width，排除把整个左栏拉宽的错误实现。
// 缩小不改变stage.height，排除图片内容反过来决定父容器高度。
// scrollTop不变证明滚轮没有同时操作视图与滚动页面。
// 读取canvas宽度是实际CSS矩形，不以显示百分数字符串代替。
// 导出前恢复适应倍率，后续手势位置不会被上一个布局检查污染。
// 只读通道故意画一笔，属于负向对照而非只检查按钮disabled。
// PNG完全相同才能证明此次点击没有修改mask。
// 反向输入在stage下方，右侧参数的重复id也必须不存在。
// 导入按钮位置以DOM祖先检查，不只比较图标截图的近似位置。
// 本测试没有断言特定浏览器滚轮速度，只要求方向和几何关系正确。
// 光标锚点的公式不在测试中照抄，避免实现镜像掩盖同一错误。
// 固定视口仍允许图片内部平移，不能通过禁止缩放来通过布局断言。
// 通道栏所有项都要存在，不因窄屏把其他输出直接隐藏。
// 设置浮层在stage内绝对定位，展开不应改变父布局的可用宽度。
// 操作后的状态先等待真实DOM更新，不能读取React提交前的旧矩形。
// 截图作为人工观察，判断来自浏览器实际布局与导出字节。
// 测试来源是当前生产构建，外层指纹校验先保证源码与产物一致。
// 当前固定画布不要求整页不可滚动，必要的参数仍可在各自区域访问。
// 输出通道切换不增加任务请求，这里没有任何推理服务回包参与。
// 一个文档四个通道共享revision，视觉选择不能创建四份不同像素草稿。
// 检查结束返回可编辑项，保证后续套索确实测试写入能力。
// 只读点击前后都从正式导出获取字节，避免从缓存常量制造恒等。
// 图像比例保持由文档尺寸决定，卡片的方形外框不代表输出被裁成正方形。
// 断言失败会继续保留外层截图日志，方便确认是几何还是像素条件不满足。
// 多个工具顺序运行但不启动额外Electron进程，遵守项目冒烟串行前提。
// 指针输入位置读取当前图片边界，nav宽度变化不能使测试点落到页面空白。
// 选择输出通道后触发pointerdown仍需由产品入口拒绝，单靠没有hover外观不够。
// 实际反向预设通过后返回字符串，后续工作流检查独立核对提交内容。
// 左栏现在填满可用高度，独立高度回归核对展开与折叠后的空间分配。
// 本组只检查蒙版工具功能区域，不重构全局head/nav布局。
// 窄屏适配仍由外层多档尺寸验证，这里保持桌面前置以隔离缩放问题。
// 不同纯色输入下像素结果应可独立推导，不依赖示例图片的视觉内容。
// 鼠标抬起与最后move同位置，不应为此再盖一次半透明画笔。
// 如果产品把缩略图当成另一份可编辑文档，这里的主画布导出对照会暴露状态不一致。
async function layout(ctx, helpers) {
  const { click, run, smoke } = ctx, { output } = helpers;
  smoke.check('Channels form a vertical rail beside the image', await run("(()=>{const rail=document.querySelector('[data-mask-results]').getBoundingClientRect(),stage=document.querySelector('[data-mask-stage]').getBoundingClientRect(),items=[...document.querySelectorAll('[data-mask-channel]')];return rail.left>=stage.right&&items[0].dataset.maskChannel==='painting'&&items.every((e,i)=>i===0||e.getBoundingClientRect().top>items[i-1].getBoundingClientRect().bottom)})()"));
  smoke.check('Import lives in the icon toolbar and accepts one image', await run("Boolean(document.querySelector('[data-mask-toolbar] [data-mask-import]'))&&!document.querySelector('[data-mask-import]').multiple"));
  smoke.check('Positive prompt is below canvas and negative prompt stays in side', await run("document.querySelector('[data-mask-prompt]').getBoundingClientRect().top>=document.querySelector('[data-mask-stage]').getBoundingClientRect().bottom&&Boolean(document.querySelector('[data-control-form=inpaint] #inpaint-negative'))&&!document.querySelector('[data-control-form=inpaint] [data-anima-instruction]')"));
  smoke.check('Manual upload validation is absent from the workspace',await run("!document.querySelector('[data-mask-upload]')"));
  const dimensions = () => run("(()=>{const s=document.querySelector('[data-mask-stage]').getBoundingClientRect(),c=document.querySelector('[data-mask-surface]').getBoundingClientRect();return {h:s.height,w:s.width,x:c.x,y:c.y,cw:c.width,ch:c.height,scroll:document.querySelector('[data-mask-grid] section').scrollTop}})()");
  const initial=await dimensions();await click('[data-mask-stage] button[aria-label=放大]');const larger=await dimensions();
  smoke.check('Zoom buttons change image size without changing viewport',larger.cw>initial.cw&&larger.h===initial.h&&larger.w===initial.w);
  await run("document.querySelector('[data-mask-surface]').dispatchEvent(new WheelEvent('wheel',{deltaY:100,altKey:true,bubbles:true,cancelable:true,clientX:500,clientY:400}))");await new Promise(resolve=>setTimeout(resolve,100));const wheel=await dimensions();
  smoke.check('Alt wheel zoom leaves the editor layout and scroll position fixed',wheel.cw<larger.cw&&wheel.h===initial.h&&wheel.scroll===larger.scroll);
  // 普通滚轮、Ctrl 和 Alt 分别只能改变 y、x 和观察倍率。
  // 使用 Electron 原生输入，覆盖 DOM 事件无法模拟的默认滚动和页面缩放路径。
  // 每种模式开始先适应，前一组位移不会让光标落在错误的图片位置。
  // 负 delta 在 Electron 输入中对应向下滚动，转换为 DOM 正 delta。
  // 普通模式图像向上移动，Ctrl 模式图像向左移动，Alt 模式图像缩小。
  // 原生修饰名称分别是 control 与 alt，不能只测试 DOM 合成事件标志位。
  // 测量 CSS 矩形而非产品内部 offset，避免重复实现公式来证明自己。
  // 另一个平移轴必须不变，防止一种快捷键同时改变两个方向。
  // 普通和 Ctrl 模式的图片宽高必须不变，不能误用旧版滚轮缩放逻辑。
  // 所有模式都要求 stage 尺寸固定，检测 Ctrl 触发浏览器页面缩放的回归。
  // 父滚动位置不能变化，画布观察操作只发生在固定视口内部。
  // CSS 坐标比较容忍 0.05px 浮点误差，不掩盖实际方向错误。
  // 主进程计时不依赖页面 rAF，窗口遮挡时仍能有界完成断言。
  // 光标取 stage 中心，避开左上设置按钮与右下缩放按钮。
  // 三种输入顺序运行，不并发操作同一窗口而制造焦点误判。
  // 事前记录两个独立导出通道，观察操作不能产生像素写入。
  // mask 与 composite 同时不变，能排除仅空蒙版不变的恒真测试。
  // 比较完整 PNG 字节，不能只比较尺寸或一处未触及角落。
  // 输入仍走正式监听，不调用 Zustand setter 伪造位移。
  // 不声称覆盖所有触控板驱动加速行为，只验证收到事件后的语义。
  // 各种修饰模式无需切换工具，画笔和只读观察继续共用该入口。
  // 最后适应复位，后面的笔刷与套索仍使用原图比例坐标。
  // 复位仅改变视图，不能通过导入新素材来消除错误写入的像素。
  // Alt 继续围绕鼠标锚点缩放，原有定位算法不在测试中照抄。
  const baseline=await output(ctx),composite=await output(ctx,'composite'),near=(a,b)=>Math.abs(a-b)<.05;
  for(const mode of ['plain','control','alt']) {
    await click('[data-mask-fit]');const previous=await dimensions();
    const anchor=await run("(()=>{const r=document.querySelector('[data-mask-stage]').getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
    ctx.input({type:'mouseMove',...anchor});ctx.input({type:'mouseWheel',...anchor,deltaY:-40,deltaX:0,canScroll:true,modifiers:mode==='plain'?[]:[mode]});await new Promise(resolve=>setTimeout(resolve,160));
    const next=await dimensions(),fixed=next.w===previous.w&&next.h===previous.h&&next.scroll===previous.scroll;
    smoke.check('Native '+mode+' wheel obeys canvas shortcut without parent scrolling',fixed&&(mode==='alt'?next.cw<previous.cw:near(next.cw,previous.cw)&&near(next.ch,previous.ch)&&(mode==='plain'?next.y<previous.y&&near(next.x,previous.x):next.x<previous.x&&near(next.y,previous.y))));
  }
  // 正式导出验证观察快捷键不把位移写成图像的几何变换。
  // RGB 与 mask 两份内容独立核对，不能用屏幕截图代替文件字节。
  // 导出仍走原编码器和按钮，不为快捷键测试提供专用像素通道。
  smoke.check('Wheel shortcuts leave mask and edited PNG bytes unchanged',baseline===await output(ctx)&&composite===await output(ctx,'composite'));
  await click('[data-mask-fit]');
  const before = await output(ctx); await click('[data-mask-channel=mask]'); await helpers.paint(ctx, .5, .5);
  smoke.check('Output channel previews are read only', before === await output(ctx)); await click('[data-mask-channel=painting]');
}

// 套索三角形刻意避开整图边角，中心与角落提供正反像素对照。
// 选完还需点击转蒙版，确认选择和实际生成 mask 是两个明确阶段。
// 操作后撤销应恢复原蒙版，不可丢失之前 RGB 笔迹。
// 裁剪只先建立矩形；确认才改变 PNG 自然尺寸。
// 拖动坐标经过屏幕像素取整，因此尺寸允许两像素误差。
// 导出宽高和 DOM 尺寸同时检查，CSS 遮挡不能冒充真实裁剪。
// 撤销后检查实际颜色及尺寸，防止仅恢复了外层容器。
// 选择三角的中心在主体内，左上角在主体外，两处独立检查覆盖率。
// 先点击lasso再输入顶点，必须经过真实工具分派。
// 转蒙版按钮只在有效选择时出现，缺少三点不会通过点击步骤。
// 转换后的白中心证明闭合填充工作，黑角落排除错误全选。
// 转换撤销比较完整PNG，不能只比一个点掩盖其他区域没有恢复。
// 裁剪矩形使用20%到80%的范围，原512×320应变为约308×192。
// 拖动后先导出检查宽度512，证明预览阶段没有提前删除像素。
// 确认后再取painting通道，裁剪必须同时移动RGB笔迹与底图。
// 中心颜色保持原画笔色，可发现只裁mask或只改CSS矩形的伪实现。
// 裁剪尺寸允许两像素误差，来自显示坐标取整而非任意宽松范围。
// 撤销后尺寸恢复512×320，并读取原图边角证明框外像素找回。
// 如果仅恢复外层容器，导出PNG仍小，断言会失败。
// 裁剪确认后selection被清理，旧三角坐标不能误用于新文档。
// 这些检查只评价功能正确性，不承诺大图内存和操作延时性能。
// 输出独立解码器不复用cropBounds，因此不会与同一计算错误共同通过。
// 连续操作保持一个文档会话，不能刷新页面躲避历史分支问题。
async function geometry(ctx, helpers) {
  const { click, smoke } = ctx, { output, decode } = helpers, before = await output(ctx);
  await click('[data-mask-mode=lasso]'); await gesture(ctx, [[.25,.25],[.75,.25],[.5,.8],[.25,.25]]); await click('[data-mask-selection-mask]');
  const selected = decode(await output(ctx)); smoke.check('Lasso converts enclosed pixels to a mask', selected.pixel(256,160)[0]===255&&selected.pixel(10,10)[0]===0);
  await click('[data-mask-action=undo]'); smoke.check('Lasso conversion undo restores previous mask bytes', before===await output(ctx));
  await click('[data-mask-mode=crop]'); await gesture(ctx, [[.2,.2],[.8,.8]]);
  smoke.check('Crop preview does not delete pixels before confirmation',decode(await output(ctx)).width===512);
  await click('[data-mask-apply-crop]'); const cropped=decode(await output(ctx,'painting'));
  smoke.check('Crop deletes outer pixels in exported image dimensions',Math.abs(cropped.width-308)<=2&&Math.abs(cropped.height-192)<=2&&cropped.pixel(Math.floor(cropped.width/2),Math.floor(cropped.height/2)).slice(0,3).join()==='255,85,119');
  await click('[data-mask-action=undo]'); const restored=decode(await output(ctx,'painting'));
  smoke.check('Crop undo restores full original extent',restored.width===512&&restored.height===320&&restored.pixel(0,0).slice(0,3).join()==='180,100,20');
}

// RGB 画笔留下实心圆，其硬边可以独立观察模糊造成的颜色混合。
// 先保存原始字节，撤销之后必须逐字节一致。
// 全局滤镜与局部笔刷分开验证，不能一个按钮实现就代表另一工具有效。
// 边角保持原色，证明镜像扩边未把不透明图像边界变暗。
// mask 字节在 RGB 模糊前后必须相同，滤镜不能改变生成区域。
// 参数和应用均通过真实面板，不从测试直接调用滤镜函数。
// 基线包含硬边圆形RGB笔迹，检测位置选在边界而不是纯色中心。
// 高斯若实际没有执行，边界像素与baseline完全相同，这条应失败。
// 角点保持原色且不透明，能够发现透明扩边造成的暗边或alpha变化。
// mask完整字节在滤镜前后比较，证明RGB修饰未污染重绘覆盖率。
// 高斯撤销使用全painting PNG比较，而非仅检查可见画面大致恢复。
// 局部blur通过真实工具选择与单击触发，不能复用全图按钮当作它的实现。
// 同一边界点应出现颜色混合，未落笔区域不作为局部成功的唯一证据。
// 局部操作撤销回到同一baseline，整笔历史不能拆成多个点才能恢复。
// 两种滤镜分别调用可观察入口，任何一种缺失都不能靠另一种检查通过。
// 结束恢复draw工具，后续队列准备不会继续模糊而误以为在涂mask。
// 测试不逐字比较Chromium高斯浮点结果，避免浏览器版本差异制造假红。
// 预期只使用颜色改变、角点稳定和历史恢复等跨实现不变量。
async function filters(ctx, helpers) {
  const { click, smoke } = ctx, { output, decode, paint } = helpers;
  const baseline=await output(ctx,'painting'), mask=await output(ctx), original=decode(baseline);
  await click('[data-mask-settings]'); await click('[data-mask-gaussian-all]'); await click('[data-mask-settings]');
  const blurred=decode(await output(ctx,'painting'));
  smoke.check('Gaussian blur changes a hard RGB boundary but preserves image corners',blurred.pixel(275,160).join()!==original.pixel(275,160).join()&&blurred.pixel(0,0).join()==='180,100,20,255');
  smoke.check('RGB filters do not alter generation mask',mask===await output(ctx));
  await click('[data-mask-action=undo]'); smoke.check('Gaussian undo restores exact prior RGB bytes',baseline===await output(ctx,'painting'));
  await click('[data-mask-mode=blur]'); await paint(ctx, .54, .5);
  smoke.check('Local blur brush modifies the touched hard edge',decode(await output(ctx,'painting')).pixel(275,160).join()!==original.pixel(275,160).join());
  await click('[data-mask-action=undo]'); smoke.check('Blur stroke has one reversible history entry',baseline===await output(ctx,'painting'));
  await click('[data-mask-mode=draw]');
}

// 通过文生图共用弹窗选择内置预设，编辑页面不能只有类似的外观。
// 先记录默认字段值，应用后要求真实 contenteditable 具有非空内容。
// 返回当前文字供提交阶段检查同一内容进入实际 API prompt。
// 弹窗关闭后不会重新挂载负面输入，因此草稿必须保留下来。
// 通过完整按钮文本匹配预设入口，不能用包含“预设”的模糊选择误点折叠提示。
// 保存按钮精确匹配保存更改，未找到时抛错而非继续读旧内容。
// 弹窗存在与关闭都使用有界wait，不能仅固定延迟猜测提交完成。
// 输入使用inpaint-negative唯一id，三个工具同时挂载也不会读错目标。
// 真实字段值作为后续prompt期望，不能自己硬写相同默认预设蒙混通过。
// 此处只检查本地预设应用，没有调用翻译服务或语言模型。
// 原自定义预设存储仍由共用组件处理，没有为蒙版另建一套数据。
// 返回字符串而不是DOM对象，跨进程结果保持可克隆。
// 预设弹窗交互不创建任务，后续显式生成时才允许有上传。
// 本用例使用当前内置预设，新增自定义持久化能力仍由原专项覆盖。
async function preset(ctx) {
  await ctx.run("[...document.querySelectorAll('[data-control-form=inpaint] button')].find(e=>e.textContent.trim()==='反向提示词预设').click()");
  await ctx.wait("document.querySelector('#negative-preset-dialog-title')");
  await ctx.run("(()=>{const root=document.querySelector('#negative-preset-dialog-title').closest('[role=dialog]');const button=[...root.querySelectorAll('button')].find(e=>e.textContent.trim()==='保存更改');if(!button)throw new Error('Preset save missing');button.click()})()");
  await ctx.wait("!document.querySelector('#negative-preset-dialog-title')");
  const value=await ctx.run("document.querySelector('#inpaint-negative').textContent");
  ctx.smoke.check('Mask uses the real negative prompt preset dialog',value.length>0);return value;
}

// 各组检查独立恢复像素状态，后面的公共队列回归仍使用原工作区。
// 预设是唯一有意保留的表单修改，用于验证真实提交的数据流。
// 组合返回预设值，不把浏览器私有状态或 store 引用泄漏给测试。
module.exports = async function checkMaskTools(ctx, helpers) {
  // 先验证固定反向输入与可用高度，长草稿和窗口尺寸在模块内恢复。
  // 与缩放、像素工具串行，不能同时操作同一窗口造成几何误判。
  // 仍使用外层静态构建和受限 IPC，不另开开发页面绕过指纹检查。
  await require('./check-mask-height')(ctx);
  // 统一选区回归在既有工具前执行，模块返回时恢复原像素和桌面尺寸。
  // 单一窗口串行操作，不并发污染捕获状态或导出结果。
  // 形状、反选、Delete 与裁剪均读取正式 PNG 而非展示层截图像素。
  await require('./check-mask-selection')(ctx,helpers);
  await layout(ctx,helpers); await geometry(ctx,helpers); await filters(ctx,helpers); return preset(ctx);
};

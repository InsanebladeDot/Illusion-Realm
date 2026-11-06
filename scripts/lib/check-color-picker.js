/**
 * 自由选色器的真实界面回归，运行静态导出的编辑器而非独立假组件。
 * RGB 与色板操作均走公开控件，像素结论读取正式 PNG 导出。
 * 不连接 ComfyUI，不把本地选色验证描述为模型推理成功。
 */

// 当前值从面板可见输出读取，不访问组件 hook 或 Zustand 私有状态。
// 查询缺失会抛错，不能把找不到面板当作空颜色通过。
// 大写输出与产品可见十六进制格式一致，像素断言另有独立通道。
const current = ctx => ctx.run("document.querySelector('[data-color-value]').textContent");

/**
 * 选色手势发送给 Electron 的实际输入管线，覆盖 pointer capture。
 * x/y 和目标坐标是相对色板的比例，测试不假定桌面缩放率。
 * 实际矩形在面板展开后读取，视口避让会改变绝对坐标。
 * 起点必须在色板内部，终点允许超出以验证夹取。
 * mouseMove 明确携带左键按下状态，避免被 Chromium 解释为悬停。
 * mouseUp 总是释放当前手势，不把后续点击留在捕获状态。
 * 结束等待主进程短计时，不依赖不可见窗口中可能暂停的 rAF。
 * 画笔不参与这个手势，色板拖动不应产生图片历史。
 * 色板尺寸由真实 DOM 提供，不使用产品内部 HSV 计算作为期望值。
 * 输出颜色随后按独立的预期 RGB 检查，避免只验证指示点移动。
 * 测试只使用鼠标输入，不声称覆盖真实触控笔硬件。
 * 指针坐标四舍五入后允许一个字节的颜色误差。
 * 误差来自 CSS 像素取整，不放宽对饱和边缘颜色的严格检查。
 * 调用时面板必须已可见，失败由外层看门狗和退出码护栏捕获。
 */
async function area(ctx, x, y, toX = x, toY = y) {
  const r = await ctx.run("(()=>{const r=document.querySelector('[data-color-area]').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()");
  const at = (a,b) => ({x:Math.round(r.x+r.w*a),y:Math.round(r.y+r.h*b)}), start=at(x,y), end=at(toX,toY);
  ctx.input({type:'mouseMove',...start});ctx.input({type:'mouseDown',button:'left',clickCount:1,...start});
  ctx.input({type:'mouseMove',button:'left',modifiers:['leftButtonDown'],...end});ctx.input({type:'mouseUp',button:'left',clickCount:1,...end});
  await new Promise(resolve=>setTimeout(resolve,100));
}

/**
 * 验证 hue、二维区域和键盘的连续选色，不以 CSS 渐变存在作为成功。
 * 先将色相设为绿色，再选择半饱和、四分之三亮度的内部点。
 * 理论 RGB 约为 96/191/96，允许实际指针取整带来一字节误差。
 * 随后从内部拖到右上外侧，预期夹到纯绿色而非产生非法值。
 * 黑色是关键边界：色相调整后 RGB 仍黑，但再次提高亮度应保持蓝色。
 * 这个反证能发现仅从 RGB 反推色相导致灰度后色相丢失的问题。
 * ArrowUp 通过正式键盘事件送到聚焦色板，不直接调用内部回调。
 * 修改 HSV 不应让图像颜色选择工具退出或改变当前选区。
 * 所有预期色值在测试中固定，不能读取产品换算函数计算期望。
 * 内部点与边界点同时检查，避免只实现简单固定色块也能通过。
 * 色板捕获结束后仍能键盘细调，测试后续操作不是截图冒充交互。
 * 黑色下设置 240 度，再增加百分之一亮度应只出现蓝色字节。
 * 白色、黑色蒙版是否有效仍由既有 PNG 通道专项负责。
 * 这里不对浏览器渐变做金图比较，避免主题与系统色彩差异误报。
 */
async function freeSelection(ctx, field) {
  await field(ctx,'[data-color-hue]',120); await area(ctx,.5,.25);
  const rgb=await ctx.run("[...document.querySelectorAll('[data-color-channel]')].map(e=>Number(e.value))");
  ctx.smoke.check('Color area freely chooses saturation and brightness',rgb.every((v,i)=>Math.abs(v-[96,191,96][i])<=1));
  await area(ctx,.5,.5,1.15,-.1);ctx.smoke.check('Captured color drag clamps outside area',await current(ctx)==='#00FF00');
  await area(ctx,.5,.9,.5,1.1);await field(ctx,'[data-color-hue]',240);
  await ctx.run("document.querySelector('[data-color-area]').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}))");
  ctx.smoke.check('Keyboard color adjustment retains hue through black',await current(ctx)==='#010103');
}

/**
 * 主用例在已有原图、空蒙版与默认笔刷上执行，不改变后续冒烟前置。
 * 先记录真实导出的 mask 和 image，后续改蒙版提示色应逐字节不变。
 * 打开使用正式彩虹按钮，验证浮层确实避开了祖先滚动裁切。
 * 面板矩形必须在视口内，单纯存在隐藏节点不能通过。
 * 禁止原生 color input，保证没有退回系统默认颜色窗口。
 * 精确 RGB 输入采用 17/34/51，正式画笔导出必须产生完全相同的字节。
 * 同时测试 300 的非法字节，预期夹取到 255 而非输出无效六位颜色。
 * 最终画笔用显式 RGB 重新设置，避免夹取测试影响像素断言。
 * Escape 必须收起浮层并把焦点交回入口，不能触发画布级取消动作。
 * 用户下一次点击设置即可继续绘制，不在 DOM 注入 store setter。
 * 只在中心落一笔，原图颜色与 PNG 编码由既有独立解码器读取。
 * 画笔验证后撤销一次，检查不会把后续工具专项的素材污染。
 * 蒙版选色使用另一入口，避免仅 RGB 画笔接入自由色板。
 * 改显示色后重新正式导出，比较完整字节而非几个刚好未覆盖的像素。
 * 当前用例开始为空 mask，后续基础笔迹仍会独立验证非空覆盖导出。
 * 外部点击模拟真正 pointerdown，DOM click 不会触发外壳的外部关闭监听。
 * 外部目标选用面板外的 settings 按钮，不对整页创建假遮罩。
 * 第二次打开后恢复默认色，后续既有断言仍应得到默认 RGB 笔迹。
 * 设置面板最后关闭，不能让其遮挡下一组真实鼠标落笔。
 * 只删除当前测试的一笔，既有工作区、原图和模型参数保持可继续使用。
 * 颜色变更本身不创建像素历史，一次 undo 就应撤回实际画笔。
 * 当前用例没有网络副作用，不下载第三方颜色包或调用吸管权限。
 * 最后记录截图帮助核对参考布局，核心结论仍由交互与字节断言给出。
 * 深色与窄屏截图在已有专项中验证，不能由此推断所有 DPI 外观一致。
 * 单窗口串行运行，避免多个 Electron 测试抢占焦点。
 * 所有断言复用外层 smoke.check，失败必须影响正式进程退出码。
 * 依赖当前静态导出指纹检查，源码变更后必须先重建再运行。
 * 这里不重置真实用户数据，素材与窗口来自隔离冒烟目录。
 * 颜色精度是 sRGB 字节契约，不覆盖印刷 CMYK 或 ICC 管理。
 * 极窄窗口以真实 320px 运行，检查 Portal 没有被参数面板裁切。
 * 断点切换后重新打开入口，不使用旧桌面位置模拟窄屏布局。
 * 色板完整边界必须在窗口内，不能仅由最外层 overflow 隐藏溢出。
 * 结束恢复 1440px，后面的既有生成与几何测试沿用原桌面前提。
 * RGB 数字输入未经过文件保存，不涉及用户文档格式迁移。
 * 鼠标手势结束后才改变窗口尺寸，避免把捕获中 resize 当产品失败。
 * 窄屏截图保留实际浮层和背景，便于人工确认紧凑密度。
 * 面板短于当前可用高度，顶部导航保护区由共享外壳独立夹取。
 */
module.exports = async function checkColorPicker(ctx,{output,decode,paint,field}) {
  // 两个基线通道必须分别取样；mask 正确不能推出透明原图也正确。
  // 记录发生在任何 UI 改色之前，避免把已污染结果当作基线。
  // 像素文档和颜色偏好分开恢复，因此后面还需显式重置 RGB 参数。
  const beforeMask=await output(ctx),beforeImage=await output(ctx,'image');
  await ctx.click('[data-mask-settings]');await ctx.click('[data-color-trigger=paint]');
  ctx.smoke.check('Rainbow trigger opens bounded custom color panel',await ctx.run("(()=>{const e=document.querySelector('[data-color-picker=paint]'),r=e.closest('[role=dialog]').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&!e.querySelector('input[type=color]')})()"));
  await freeSelection(ctx,field);await field(ctx,'[data-color-channel=red]',300);
  // 300 超过字节上界，检查实际显示值而非 HTML max 属性是否存在。
  // 这个边界用例仍经过 React onChange，可发现仅加 min/max 而没校验的实现。
  ctx.smoke.check('RGB byte input clamps invalid values',await ctx.run("document.querySelector('[data-color-channel=red]').value==='255'"));
  for(const [key,value] of Object.entries({red:17,green:34,blue:51})) await field(ctx,'[data-color-channel='+key+']',value);
  // 三个互异通道可以发现 BGR 颠倒或某一通道回调接错。
  // 不是预设色列表中的值，因此固定色块方案不能通过精确颜色断言。
  ctx.smoke.check('RGB inputs update exact current color',await current(ctx)==='#112233');await ctx.shot('mask-color-picker');
  await ctx.run("document.querySelector('[data-color-channel=blue]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  // 键盘关闭从输入框发出，覆盖子控件阻止冒泡时的捕获阶段处理。
  // 焦点检查使用 activeElement，不能用 aria-expanded 假装已经恢复键盘入口。
  ctx.smoke.check('Escape closes color panel and restores trigger focus',await ctx.run("!document.querySelector('[data-color-picker]')&&document.activeElement.matches('[data-color-trigger=paint]')"));
  await ctx.click('[data-mask-settings]');await ctx.click('[data-mask-mode=paint]');await paint(ctx,.5,.5);
  // 中心落点位于默认硬笔内部，边缘抗锯齿不应改变中心 RGB。
  // 输出取 painting 合成通道，image 通道刻意不包含独立绘画层。
  // 第四字节必须是 255，防止把画笔 RGB 改动误写成透明度。
  ctx.smoke.check('Chosen RGB reaches actual exported brush pixels',decode(await output(ctx,'painting')).pixel(256,160).join()==='17,34,51,255');await ctx.click('[data-mask-action=undo]');await ctx.click('[data-mask-mode=draw]');
  await ctx.click('[data-mask-settings]');await ctx.click('[data-color-trigger=mask]');await field(ctx,'[data-color-channel=red]',12);await ctx.shot('mask-tint-color-picker');
  // 外部关闭不点击导出，避免下载动作的焦点变化掩盖关闭逻辑。
  // 只派发 pointerdown 不派发 click，设置保持打开而色板应已收起。
  await ctx.run("document.querySelector('[data-mask-settings]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
  ctx.smoke.check('Outside pointer closes color panel',await ctx.run("!document.querySelector('[data-color-picker]')"));await ctx.click('[data-mask-settings]');
  // 先关闭设置再导出，确保比较不依赖颜色浮层仍挂载时的暂存状态。
  // 字节相等同时约束尺寸、原 RGB、alpha 与蒙版编码，不只约束预览外观。
  ctx.smoke.check('Mask display color does not alter exported coverage or alpha',await output(ctx)===beforeMask&&await output(ctx,'image')===beforeImage);
  await ctx.click('[data-mask-settings]');await ctx.click('[data-color-trigger=paint]');for(const [key,value]of Object.entries({red:255,green:85,blue:119}))await field(ctx,'[data-color-channel='+key+']',value);
  // 默认 RGB 来自旧能力的既有契约，不能以本轮刚选的颜色改写旧断言。
  // 恢复仅走用户可操作控件，不用隐藏状态重置来掩盖控件同步错误。
  await ctx.run("document.querySelector('[data-color-channel=blue]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await ctx.click('[data-mask-settings]');
  await ctx.metrics(320,844);await ctx.click('[data-mask-settings]');await ctx.click('[data-color-trigger=paint]');
  // 矩形读取 dialog 外壳，内部色板没溢出不能代表整个弹层没越界。
  // 使用 innerWidth 与 innerHeight，Electron 物理窗口尺寸不能替代 CSS 视口。
  // 不强制重载页面，断点前后的颜色组件必须依靠正常布局自行适应。
  ctx.smoke.check('Custom color panel stays within narrow viewport',await ctx.run("(()=>{const r=document.querySelector('[data-color-picker]').closest('[role=dialog]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"));await ctx.shot('mask-color-picker-narrow');
  await ctx.run("document.querySelector('[data-color-channel=blue]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await ctx.click('[data-mask-settings]');await ctx.metrics(1440,900);
};

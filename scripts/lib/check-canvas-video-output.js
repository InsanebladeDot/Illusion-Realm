/** 正式MiniMax节点的面积和比例回归；自动事件与真实SQLite落盘，不调用视频模型。 */
const assert = require("node:assert/strict");

module.exports = async ctx => {
  await ctx.click('.hy-image-sidebar header button');
  await megapixels(ctx);
  await duration(ctx);
  await fps(ctx);
  await ctx.click('.hy-project-header [aria-label="保存画布"]');
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  const value = require("./canvas-library-fixture").readCanvas(ctx);
  const a = value.nodes.find(n => n.id === 'a').data, b = value.nodes.find(n => n.id === 'b').data;
  // 同时读两张真实原子表记录，不能用B的初始显示代替持久化隔离证据。
  assert.deepEqual(a.videoOutput, { width: 768, height: 1376 });
  ctx.smoke.check("Video area, dimensions, duration and FPS persist without affecting B", a.videoMegapixels === 1 && a.videoDuration === 3.5 && a.videoFps === 48 && b.videoMegapixels === undefined && b.videoOutput === undefined && b.videoDuration === undefined && b.videoFps === undefined);
  await ctx.click('[data-canvas-node=a] .hy-panel-submit [data-canvas-workflow] button');
  await ctx.wait("document.querySelector('.hy-image-sidebar [data-canvas-video-settings]')");
};

/** 固定预期独立列出；若把百万像素误当倍率、短边或十进制百万，断言会失败。 */
async function megapixels(ctx) {
  await areaSlider(ctx);
  await ctx.click('[data-canvas-node=a] [data-canvas-image-ratio] > button');
  await ratioPresentation(ctx);
  await ctx.click('[data-canvas-node=a] [data-canvas-image-ratio] button[aria-label="9:16"]');
  ctx.smoke.check('Portrait keeps selected area and intended ratio label', await ctx.run("document.querySelector('[data-canvas-video-pixels]').textContent==='256 × 416 px'&&document.querySelector('[data-canvas-image-ratio]>button').textContent.endsWith('9:16')"));
  await ctx.click('[data-canvas-node=a] [data-canvas-parameter=megapixels] > button');
  await ctx.key('End');
  ctx.smoke.check('Portrait 1.0 MP restores full area', await ctx.run("document.querySelector('[data-canvas-video-pixels]').textContent==='768 × 1376 px'"));
  await ctx.key('Escape');
  await history(ctx);
  await ctx.shot('78-minimax-megapixels-portrait');
}

/** 使用原生滑块键盘路径验证上下界、步进和实时像素反馈。 */
async function areaSlider(ctx) {
  ctx.smoke.check('MiniMax defaults to 1.0 MP and aligned landscape dimensions', await ctx.run("document.querySelector('[data-canvas-video-pixels]').textContent==='1376 × 768 px'"));
  await ctx.click('[data-canvas-node=a] [data-canvas-parameter=megapixels] > button');
  ctx.smoke.check('Area uses focused native slider with ten 0.1 increments', await ctx.run("(()=>{const s=document.querySelector('[data-canvas-parameter=megapixels] input');return s.type==='range'&&s.min==='0.1'&&s.max==='1'&&s.step==='0.1'&&document.activeElement===s&&!document.querySelector('[data-canvas-parameter=megapixels] .hy-more-menu')})()"));
  ctx.smoke.check('Area popup uses black canvas background without gray border', await ctx.run("(()=>{const s=getComputedStyle(document.querySelector('[data-canvas-parameter=megapixels] .hy-ratio-popup'));return s.backgroundColor==='rgb(15, 15, 15)'&&s.borderTopWidth==='0px'})()"));
  await ctx.shot('78-minimax-megapixels-slider');
  // 原生键盘驱动range，证明每档与显示、原节点事务相接，而不是只改滑块DOM。
  await ctx.key('Home');
  ctx.smoke.check('0.1 MP uses 416 by 256 rather than cumulative scale', await ctx.run("document.querySelector('[data-canvas-video-pixels]').textContent==='416 × 256 px'"));
  await ctx.key('Right');
  ctx.smoke.check('Slider arrow advances exactly one tenth and updates pixels', await ctx.run("document.querySelector('[data-canvas-parameter=megapixels] input').value==='0.2'&&document.querySelector('[data-canvas-video-pixels]').textContent==='608 × 352 px'"));
  await ctx.key('Home');
  await ctx.key('Escape');
}

/** 图片原分段条在视频复用后仍横向且无灰色内层，保留全部八项与业务选中语义。 */
async function ratioPresentation(ctx) {
  ctx.smoke.check('Video ratio reuses horizontal image strip on black surface', await ctx.run("(()=>{const p=document.querySelector('[data-canvas-image-ratio] .hy-ratio-popup'),s=p.querySelector('.hy-segmented'),items=[...s.querySelectorAll('button')];return items.length===8&&new Set(items.map(b=>Math.round(b.getBoundingClientRect().top))).size===1&&getComputedStyle(s).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(p).backgroundColor==='rgb(15, 15, 15)'})()"));
  await ctx.shot('78-minimax-horizontal-ratio');
}

async function history(ctx) {
  // 离开控件后走真实画布快捷键，一笔事务应同时恢复面积和最终像素。
  await ctx.run("document.querySelector('[data-infinite-canvas]').focus()");
  await ctx.key('z', ['control']);
  // 原历史不保存选中态，恢复后通过正常点选再读属性；选择不产生新编辑记录。
  await ctx.pointer('[data-canvas-node=a] header>svg');
  ctx.smoke.check('Undo restores both MP label and pixel dimensions', await ctx.run("document.querySelector('[data-canvas-video-pixels]').textContent==='256 × 416 px'&&document.querySelector('[data-canvas-parameter=megapixels]>button').textContent==='0.1 百万像素'"));
  await ctx.key('y', ['control']);
  await ctx.pointer('[data-canvas-node=a] header>svg');
  ctx.smoke.check('Redo restores the complete MP transaction', await ctx.run("document.querySelector('[data-canvas-video-pixels]').textContent==='768 × 1376 px'&&document.querySelector('[data-canvas-parameter=megapixels]>button').textContent==='1.0 百万像素'"));
}

// 时长预设直接走原浮层，5.0初值、2.0选择和3.5自定义共用同一字段。
// 取消一份新草稿只丢掉9秒，不应把已经确认的3.5秒恢复成默认。
// 实际保存确认在外层读磁盘，避免只用按钮标签证明持久化。
// 输入零给明确错误，非法配置不能先显示0.0秒然后等待服务拒绝。
// 画面截图是当前视频参数区，未播放、未编码任何虚构视频。
// 数值setter直接作用正式输入，未修改React内部状态或产品校验结果。
// Escape事件由宿主注入，仍归自动键盘验证，用户实体手感待验。
// presets只影响菜单，不强迫自定义数字落到2、5、10三档。
// 预设选2.0秒而不只选初始5.0秒，防止无效onChange在默认值上被误判成功。
// 先确认2.0再输入零，断言同时检查错误出现和入口仍为2.0，形成状态不污染反证。
// 3.5覆盖小数输入，若组件误用parseInt变成3秒，后续标签和磁盘检查都应失败。
// 9只保留在临时草稿，Escape后不得显示9.0或把9秒偷偷落盘。
// 焦点恢复检查document.activeElement，不能根据元素有focus类推断键盘位置。
// 有界ctx.key会等事件处理完成，取消的结果仍要从真实DOM读取。
// 时长修改不触发源currentTime，所以没有用等待假视频播放去拖慢这组参数回归。
// 当前默认语言是zh-CN，明确“秒”后缀来自正式词条，不是测试自己补单位。
// 自定义按钮的原文为“自定义”，画质的“自定义画质”并非这层数字表单身份。
// 因此查询限定duration浮层，不能误点旁边的质量设置并操作错误字段。
// 打开菜单会聚焦当前预设，输入还需通过自定义动作挂载，不能寻找隐藏备用输入。
// 错误提示和输入都在同一局部浮层，不把整个工作区禁用来掩盖草稿错误。
// 79号截图在Escape后捕获，记录正式入口的一位小数摘要，而非未确认输入。
// 返回外层时没有残留open菜单，后续点击保存不依赖穿透遮罩。
// 一次应用只提交当前时长，A已有768×1376输出仍应保留。
// 若数据更新引发节点重建丢失选择，后续按稳定id打开设置将直接失败。
async function duration(ctx) {
  await ctx.click('[data-canvas-node=a] [data-canvas-parameter=duration] > button');
  await ctx.run("[...document.querySelectorAll('[data-canvas-parameter=duration] .hy-parameter-options button')].find(e=>e.textContent==='2.0秒').click()");
  ctx.smoke.check("Video duration preset shows one decimal second", await ctx.run("document.querySelector('[data-canvas-parameter=duration]>button').textContent==='2.0秒'"));
  await ctx.click('[data-canvas-node=a] [data-canvas-parameter=duration] > button');
  await ctx.run("[...document.querySelectorAll('[data-canvas-parameter=duration] .hy-parameter-options button')].find(e=>e.textContent==='自定义').click()");
  await number(ctx, '[data-canvas-parameter=duration] input', '0');
  await ctx.key('Enter');
  ctx.smoke.check("Zero duration is rejected without changing confirmed value", await ctx.run("!!document.querySelector('[data-canvas-parameter=duration] [role=alert]')&&document.querySelector('[data-canvas-parameter=duration]>button').textContent==='2.0秒'"));
  await number(ctx, '[data-canvas-parameter=duration] input', '3.5');
  await ctx.key('Enter');
  await ctx.click('[data-canvas-node=a] [data-canvas-parameter=duration] > button');
  await ctx.run("[...document.querySelectorAll('[data-canvas-parameter=duration] .hy-parameter-options button')].find(e=>e.textContent==='自定义').click()");
  await number(ctx, '[data-canvas-parameter=duration] input', '9');
  await ctx.key('Escape');
  ctx.smoke.check("Escape cancels duration draft and restores trigger focus", await ctx.run("document.querySelector('[data-canvas-parameter=duration]>button').textContent==='3.5秒'&&document.activeElement===document.querySelector('[data-canvas-parameter=duration]>button')"));
  // 操作截图保留左侧应用导航，可以识别当前是无限画布而非工具箱编辑器。
  // A仍为空媒体卡，截图不能被用来说明任何视频已经按新尺寸重新编码。
  // 已确认宽高来自面积和比例，完整像素在前一张78截图读取。
  // 时长入口显示3.5秒，取消时输入的9秒不得出现在最终截图中。
  // 画布主区没有因菜单退出改动节点时间或源文件，这些数据本例根本不提供。
  // 拍照前Escape同时返回触发焦点，下一次Tab应从时长入口继续，不回到页面开头。
  // 非模态参数菜单退出不取消节点选择，否则截图会丢失当前参数面板。
  // 原生成按钮保持禁用，参数可配置不等同于已接真实视频执行器。
  // 接下来的保存通过顶部原入口，必须在焦点已返回时仍可正常操作。
  // 截图不负责判断是否写盘，写盘由外层读取生产保存后的JSON单独验证。
  await ctx.shot("79-video-output-controls");
}

// setter绕过HTML本地格式化以输入坏样本，生产提交逻辑仍必须拒绝它。
// 不发送change后的假保存回包，确认参数仍由真实组件回调和主进程落盘。
// 执行source只包含测试固定值，JSON转义防止数字文字变成脚本片段。
// 原生setter是React受控input常用的测试入口，只改变DOM后还必须派发input事件。
// 不直接调用onChange私有闭包，实际字段事件处理和草稿状态仍由React完成。
// selector先经过JSON编码，包含方括号和引号也保持一个字符串参数。
// value同样编码，允许0和小数字符串而不把它们拼成可执行表达式。
// 若字段未挂载，querySelector为空会让用例失败，不能创建替代input继续跑。
// 本辅助函数不自动提交，坏值与合法值均需由调用步骤明确确认。
// 没有把输入限制改成文本框，number类型仍按生产页面的浏览器规则处理。
// 调用失败由最外层冒烟护栏记录，不能吞掉异常后继续算通过数量。
async function number(ctx, selector, value) {
  await ctx.run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
}

// FPS自定义复用秒数的同一数字组件，但只接受整数而非小数秒规则。
// 48不同于默认24，能发现回调未接通而始终展示默认的假可用入口。
// 24.5是正数却不是合法整帧率，先失败再修改同一草稿验证校验与恢复。
// 提交后父级只改变videoFps，已确认时长3.5秒与768×1376仍应保留。
// 保存断言由外层统一读取磁盘，不能只用入口文字48 FPS自证持久化。
// 截图新增80号以区别之前没有FPS入口的79号历史证据。
// 自动事件不代表实际视频已经48帧播放，本轮未接视频生成或转码。
// 非整数输入不由测试强制修成48，必须经正式输入事件和失焦确认。
// 自定义标签沿用现有i18n，菜单未硬编码另一套中文单位。
// 选择只影响当前A节点，B缺videoFps的断言用于反证共用组件串值。
// FPS不控制工程预览requestAnimationFrame频率，本例没有改变任何播放时钟。
// 同一浮层的错误不会蔓延到旁边时长入口，两个参数有独立草稿生命周期。
// 浮层提交关闭后点击原侧栏仍可用，避免配置输入错误留下全局键盘锁。
// 输入字段使用number类型并保留HTML step=1，运行时校验仍是最终防线。
// 正常48输入后失焦关闭菜单，若仍留下input则下次控件切换可能把草稿串到时长。
// 已确认标签应是48 FPS，不能只显示48使用户无法区分总帧数与每秒帧数。
// fps测试先选择A的精确marker，B未选中时不应存在一个共享的全局帧率输入。
// 若B后来显示48但磁盘无覆盖，说明只读默认或展示串值，也应由后续节点切换发现。
// 本组只改输出意图，视频实际源帧率可能仍是别的值，不把两者强行同步。
// 整段总帧数不是简单在这里乘时长后保存第二份字段，模型可能有帧数模约束。
// 因此未接执行器前只保留用户明确FPS和秒数，不生成虚假的已计算帧预算。
// 未来若服务拒绝48，应返回真实能力错误，不在菜单悄悄改成24继续请求。
// 这条测试没有用编码耗时或帧计数工具来证明48 FPS视频输出，因为并未输出视频。
// 48不同于五个快捷预设，覆盖真正自定义数值而不是再选一次已有预设。
// 零帧率和负帧率另外在两端纯数据检查拒绝，UI反例专门覆盖正小数这个细边界。
// 如果数值组件复用后把step固定成0.1，本例24.5会被接受并使反证失败。
// 预设只改变帧率，已确认的时长与尺寸仍需在最终真实存储中同时保留。
// 磁盘断言使用严格数值48，不允许保存为带FPS后缀的字符串。
async function fps(ctx) {
  await ctx.click('[data-canvas-node=a] [data-canvas-parameter=fps] > button');
  await fpsPresentation(ctx);
  await ctx.click('[data-canvas-parameter=fps] button[aria-label="25"]');
  ctx.smoke.check('New 25 FPS preset commits through original node transaction', await ctx.run("document.querySelector('[data-canvas-parameter=fps]>button').textContent==='25 FPS'"));
  await ctx.click('[data-canvas-node=a] [data-canvas-parameter=fps] > button');
  await ctx.run("[...document.querySelectorAll('[data-canvas-parameter=fps] .hy-parameter-options button')].find(e=>e.textContent==='自定义').click()");
  await number(ctx, '[data-canvas-parameter=fps] input', '24.5');
  await ctx.key('Enter');
  ctx.smoke.check('Fractional FPS remains invalid draft', await ctx.run("!!document.querySelector('[data-canvas-parameter=fps] [role=alert]')&&document.querySelector('[data-canvas-parameter=fps]>button').textContent==='25 FPS'"));
  ctx.smoke.check('Custom field has only bottom border and no apply button', await ctx.run("(()=>{const p=document.querySelector('[data-canvas-parameter=fps] .hy-number-custom'),s=getComputedStyle(p.querySelector('input'));return p.querySelectorAll('input').length===1&&!p.querySelector('button')&&s.borderTopWidth==='0px'&&s.borderRightWidth==='0px'&&s.borderLeftWidth==='0px'&&s.borderBottomWidth==='1px'&&s.backgroundColor==='rgba(0, 0, 0, 0)'})()"));
  await ctx.shot('82-video-fps-underline-error');
  // 真实指针会先让输入失焦，再点击预设；不能在失焦时卸载按钮吞掉这次选择。
  await ctx.pointer('[data-canvas-parameter=fps] button[aria-label="30"]');
  ctx.smoke.check('Clicking preset while draft is invalid commits preset instead of draft', await ctx.run("document.querySelector('[data-canvas-parameter=fps]>button').textContent==='30 FPS'&&!document.querySelector('[data-canvas-parameter=fps] input')"));
  await ctx.click('[data-canvas-node=a] [data-canvas-parameter=fps] > button');
  await ctx.click('[data-canvas-parameter=fps] button[aria-label="自定义"]');
  await number(ctx, '[data-canvas-parameter=fps] input', '48');
  await ctx.pointer('[data-canvas-node=a] [data-canvas-parameter=duration]>button');
  await ctx.key('Escape');
  ctx.smoke.check('Custom FPS updates confirmed label', await ctx.run("document.querySelector('[data-canvas-parameter=fps]>button').textContent==='48 FPS'"));
  await ctx.shot('80-video-fps-duration');
}

/** 原分段组件的真实DOM与计算样式，避免只改文案却仍留下灰色双层菜单。 */
async function fpsPresentation(ctx) {
  ctx.smoke.check('FPS offers 10 20 25 30 60 custom on one black row', await ctx.run("(()=>{const p=document.querySelector('[data-canvas-parameter=fps] .hy-ratio-popup'),s=p.querySelector('.hy-segmented'),b=[...s.querySelectorAll('button')];return b.map(e=>e.textContent).join('|')==='10|20|25|30|60|自定义'&&new Set(b.map(e=>Math.round(e.getBoundingClientRect().top))).size===1&&getComputedStyle(p).backgroundColor==='rgb(15, 15, 15)'&&getComputedStyle(s).backgroundColor==='rgba(0, 0, 0, 0)'&&!p.querySelector('.hy-more-menu')})()"));
  await ctx.shot('82-video-fps-strip');
}

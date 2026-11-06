/** 时间轴视口与真实单源播放起点回归；仍由原LIVE脚本串行驱动同一窗口。 */
const fs = require("node:fs"), path = require("node:path");
// 当前套件沿用LIVE-02真实本地H264文件，不把静态封面误称为实际媒体帧。
// ffprobe元数据由生产主进程得到，播放状态则从Chromium媒体节点独立观察。
// helper只使用外层公开操作能力，不持有工程reducer或React组件引用。
// 书签、片段起点、源内时间分别读取，防止用同一变量推导答案再验证自己。
// 内部鼠标输入由CDP发送，用户前台桌面不被占用；它不是资源管理器OLE拖入。
// 测试窗口虽不可见，backgroundThrottling和有界主进程等待仍保证事件能结束。
// 若真实媒体在规定时间内未就绪，wait明确失败，不切换到假的ready响应。
// 本组不自动补转码来让损坏或不支持的编码“通过”。
// UI缩放与媒体缩放分开测试，时间轴放大不能导致视频分辨率被改写。
// 轨道锁定是工程交互限制，不代表文件被锁定或不能从素材列表查看。
// 运行图使用capturePage保留导航、节目和时间轴位置，便于对照真实几何。
// 这里没有执行节目导出，也没有把单源播放描述为连续多轨播放。

// 输入用Chromium鼠标事件，目标位置从真实内容矩形计算，不读取私有播放状态。
// 只在标尺定位，轨道上的片段和细线都不该把点击误当成素材创建。
// 本组是自动事件，不等同于人工系统鼠标验收。
async function seek(ctx, time) {
  // lanePoint读取当前真实标尺宽度，不拿默认32px/s作为输入坐标。
  // Y位置改为R07顶部十二像素，确保点击标尺而非覆盖在轨道上的片段。
  // x仍对应工程秒数，轨道头和nav占位已经包含在真实矩形left中。
  // Input.cancelDragging结束上一次可能残留的Chromium内部拖动状态。
  // 它不改工程数组，也不替产品执行Escape回滚。
  // mouseMoved先把指针送到目标，再发按下和松开，保持普通点击事件顺序。
  // button与buttons分别描述按键身份和当前按住状态，松开时buttons必须归零。
  // clickCount设一，避免误触双击或把此次定位与上一次鼠标动作合并。
  // 发布位置后给React有界提交间隔，随后直接检查实际结果，不无限重试。
  // 定位由产品标尺事件处理，不能直接对媒体currentTime赋预期值自证。
  // 时间从外层当前片段start计算，移动片段之后仍能测试同一源内半秒位置。
  // 本组安排在第一次HTML拖动Escape之前，避免离屏Chromium后续输入投递限制。
  const point = await ctx.lanePoint(time);
  point.y = await ctx.run("document.querySelector('[data-editor-region=R07]').getBoundingClientRect().top+12");
  await ctx.win.webContents.debugger.sendCommand("Input.cancelDragging");
  await ctx.win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await ctx.win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", buttons: 1, clickCount: 1, ...point });
  await ctx.win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", buttons: 0, clickCount: 1, ...point });
  await ctx.delay(80);
}

// 先把书签放到片段内部0.5秒，再真正播放，不能用直接设置媒体currentTime当证据。
// 工程时钟应等于片段start加源内进度；两套坐标分别读取，避免相同变量自证。
// 暂停后记下位置，查看另一个素材不能改变工程播放书签。
// 源播放器与节目播放器复用组件，但模式和时钟归属必须隔离。
async function checkStartPosition(ctx) {
  // 选中首片段先建立明确工程预览，不能在素材源查看模式里测试工程书签。
  // time取片段start加0.5秒，源播放器应落0.5，而不是整个工程绝对time。
  // 两者在片段起点非零时差异明显，能发现错误直接赋工程秒数的实现。
  // 即使首片段恰从零开始，后续真实位置与媒体推进仍分别断言。
  // 等待readyState至少2，代表真实解码数据可用，单凭loadedmetadata不算首帧就绪。
  // currentTime大于0.4证明定位确实交给媒体，而非只有蓝线位置改变。
  // 容差0.08秒允许媒体事件调度，不能拿秒级宽松误差掩盖没有定位的问题。
  // 蓝线误差采用更紧的0.04，接近当前30fps一帧，保护工程舍入一致性。
  // 点播放后必须观察媒体时间超过0.8，不仅检查按钮文案从播放变暂停。
  // 媒体currentTime增长由解码器产生，测试没有安装递增进度定时器。
  // 点暂停后读取源时间与工程书签，两者差值应是当前clip.start。
  // 如果工程timeupdate被反过来当新seek，媒体会反复暂停，本项等待将失败。
  // 暂停是原生媒体事件，产品不能只把playing布尔改成false而视频仍在播。
  // 最后重新定位到半秒，给截图保留确定可见的真实媒体帧。
  // 这不会缩短片段、裁剪源文件或改sourceIn，仍是整段单源查看。
  // 分离音轨场景由原LIVE后续用例验证，本组先保护普通V1真实视频预览。
  const clip = (await ctx.clips())[0], time = clip.start + .5;
  await ctx.click(`[data-editor-clip="${clip.id}"]`);
  await seek(ctx, time);
  await ctx.wait("document.querySelector('[data-live-video]')?.readyState>=2&&document.querySelector('[data-live-video]').currentTime>.4");
  ctx.smoke.check("UI06: ruler bookmark maps to source offset before playback", await ctx.run(`Math.abs(document.querySelector('[data-live-video]').currentTime-.5)<.08&&Math.abs(Number(document.querySelector('[data-editor-playhead]').dataset.time)-${time})<.04`));
  await ctx.click('[data-editor-region=R03] button[aria-label=播放]');
  await ctx.wait("document.querySelector('[data-live-video]').currentTime>.8");
  await ctx.click('[data-editor-region=R03] button[aria-label=暂停]');
  ctx.smoke.check("UI06: actual media progress advances the project playhead", await ctx.run(`Math.abs(Number(document.querySelector('[data-editor-playhead]').dataset.time)-${clip.start}-document.querySelector('[data-live-video]').currentTime)<.08`));
  await seek(ctx, time);
}

// 缩放只改变像素宽度，片段id与秒数快照必须逐项不变。
// “适合全部”应真正消除横向溢出，而不是改写工程总长来塞进视口。
// 测完恢复32px/s，后面的LIVE拖动继续使用已知初始密度。
// 恢复通过公开滑杆input事件，不能直接修改CSS宽度伪造几何通过。
async function checkZoom(ctx) {
  // before保存所有片段身份与start/end，不只比较总时长是否凑巧相等。
  // 两片段互换位置也可能总长相同，完整快照才能发现不应有的数据改写。
  // 标尺宽度从DOM矩形测量，按钮pressed或滑杆数字变动不能证明视口真的变化。
  // 点击放大后内容列应更宽，允许通过内部横滚查看更长的像素范围。
  // “适合全部”则要求滚动体scrollWidth不大于clientWidth，留一像素舍入容差。
  // fit不应通过缩短range或删除片段来消除横向溢出，所以再次比较工程快照。
  // 这里的全部是当前编辑视口范围，包含放置余量，不把它当成新工程duration。
  // 使用公开滑杆恢复默认密度，后面的抓取偏移回归仍以32为已知前提。
  // 原生range默认value可能也是32，直接再派32不会被React识别为一次变化。
  // 所以先33再32，真实触发受控onChange，而不改CSS去伪造目标宽度。
  // 两步间给React提交时间，避免在同一次未处理状态中合并成未变化。
  // 恢复密度不恢复片段位置，因为前面的缩放本来就不应改变位置。
  // 不能直接调用viewport.zoom，测试要覆盖按钮和滑杆的真实接线。
  // 浏览器自动限制scrollLeft是合法几何结果，不是产品重新安排片段。
  // 适合全部后滑杆仍反映有效像素密度，不用默认数字假装已经同步。
  // 此处没有测试围绕鼠标缩放，那不是当前约定的左端时间锚定策略。
  const before = JSON.stringify(await ctx.clips()), width = await ctx.run("document.querySelector('[data-editor-region=R07]').getBoundingClientRect().width");
  // 片段快照包含非选中副本，避免缩放误改另一实例却只查当前片段。
  // width取R07而非整个timeline，轨道头宽不应参与每秒像素密度。
  // 放大动作必须让内容宽增加，不能只改变滑杆提示值。
  // 本测试所处初始范围足够长，默认32px/s不会被宽容器minWidth完全吞掉。
  // 若前置工程或密度发生变化，应修正测试前提而非取消宽度增长断言。
  await ctx.click('[data-editor-timeline] button[aria-label=放大时间轴]');
  ctx.smoke.check("UI06: zoom changes viewport pixels without changing timeline seconds", await ctx.run(`document.querySelector('[data-editor-region=R07]').getBoundingClientRect().width>${width}`) && JSON.stringify(await ctx.clips()) === before);
  await ctx.click('[data-editor-timeline] button[aria-label=适合全部]');
  ctx.smoke.check("UI06: fit all uses the actual viewport with no horizontal overflow", await ctx.run("(()=>{const e=document.querySelector('[data-editor-timeline-scroll]');return e.scrollWidth<=e.clientWidth+1})()") && JSON.stringify(await ctx.clips()) === before);
  await ctx.run("(()=>{const e=document.querySelector('[data-timeline-zoom]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'33');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await ctx.delay(80);
  await ctx.run("(()=>{const e=document.querySelector('[data-timeline-zoom]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'32');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await ctx.delay(80);
}

// 锁定只属于对应轨道，其他轨道按钮和素材导入仍可用。
// 禁用draggable与原生按钮共同表达只读，不能仅把片段颜色变暗。
// 取消锁后原实例恢复，不重建片段或更换ID；快照对照保护这一点。
async function checkLock(ctx) {
  // before是锁前安排快照，锁定不能删除、复制或移动任何片段。
  // V1锁按钮来自轨道头，不能用直接设置片段disabled属性替产品完成限制。
  // 每个V1片段须同时disabled和不可拖，防止只是视觉灰掉仍能原生dragstart。
  // 顶部真实导入按钮应继续启用，轨道锁不应锁死整个媒体库。
  // 锁定状态属于轨道ID，不根据当前选中哪个片段决定。
  // 解锁再次点击同一公开按钮，既有实例应恢复可拖而不生成新ID。
  // 快照完全一致保护了source引用和起止，不能通过重建一组相似片段来解锁。
  // 多轨同时播放仍未接入，锁按钮只表达编辑保护，不代表静音或不可见。
  // 素材查看不受轨道锁影响，用户仍可以检查原文件。
  // 本组没有右键编辑锁轨菜单，原生disabled片段和提交边界共同防止绕过。
  // 菜单锁定限制在正式会话重查，不能仅凭旧菜单曾经可用继续写入。
  // 其他轨道锁初始为空，按V1不会把A1/A2一起加入lockedTracks。
  const before = JSON.stringify(await ctx.clips());
  // 锁操作之前刚完成fit与恢复，能顺便发现视口事件是否干扰轨道头接线。
  // 不是用片段数量不变代替完整快照，相同数量也可能已有起止变化。
  // 原V1每个实例都要检查，不能只把当前选中一个按钮禁用就称整轨锁定。
  // 原导入按钮位于项目栏，所以即使素材面板紧凑隐藏也能验证导入能力没被锁死。
  // 解锁后draggable须恢复，不仅仅让按钮disabled回false。
  // 因为HTML拖放依赖draggable，遗漏它会出现可选中但再也拖不动的回归。
  // lockedTracks变化不要求重新探测文件，原metadata仍由媒体会话持有。
  // 不通过重载页面解锁，否则会掩盖锁状态清理并丢失真实工程。
  await ctx.click('[data-editor-track-head=V1] button[aria-label=锁定]');
  ctx.smoke.check("UI06: a locked V1 blocks clip interaction without disabling import", await ctx.run("[...document.querySelectorAll('[data-editor-track-lane=V1] [data-editor-clip]')].every(e=>e.disabled&&!e.draggable)&&!document.querySelector('[data-editor-region=R01] button[aria-label=导入素材]').disabled"));
  await ctx.click('[data-editor-track-head=V1] button[aria-label=锁定]');
  ctx.smoke.check("UI06: unlocking restores existing instances with unchanged time", JSON.stringify(await ctx.clips()) === before && await ctx.run("[...document.querySelectorAll('[data-editor-track-lane=V1] [data-editor-clip]')].every(e=>!e.disabled&&e.draggable)"));
}

// 当前媒体文件由LIVE脚本真实生成/探测，helper不制作元数据或返回假播放结果。
// 截图保留书签位于片段内部的实际节目帧，区别于仅显示静态封面。
async function checkVideoUiTimeline(ctx) {
  // 此时真实首片段已入轨，函数不是对空时间线生成一套假媒体数据。
  // 全部观测从当前窗口读取，截图与数值属于同一工程实例。
  // 播放终止由后续切源和路由退出回归再核对，不把暂停一项当成资源清理完成。
  // 用户扬声器试听仍未人工验证，本组默认静音避免测试惊扰桌面环境。
  // audio标签能读取真实音轨与听到声卡声音是不同证据层级。
  // 真实播放先验证，再改视口和锁定，便于失败时定位哪一层的约定破坏。
  // 顺序运行不新建媒体源、不重载路由，能发现视口操作意外清掉播放器的问题。
  // 最后截图的媒体来自当前真实源，不引用设计参考PNG充当节目。
  // 截图记录可视结果，数值断言则保留在外层日志，二者互相补充。
  // 文件写入测试临时目录，不占用用户生成视频的输出文件名。
  // 本helper不重置harness失败计数，早先LIVE行为不通过仍让整套失败。
  await checkStartPosition(ctx); await checkZoom(ctx); await checkLock(ctx);
  fs.writeFileSync(path.join(ctx.root, "ui-06-playhead.png"), (await ctx.win.webContents.capturePage()).toPNG());
}
module.exports = { checkVideoUiTimeline, seek };


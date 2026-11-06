/** 真实Electron编辑工具回归：生产导入后的真实视频，公开按钮和自动键盘事件。 */
// 不读取React私有状态，不用mock替代解码；系统选择结果夹具边界沿用外层LIVE脚本。
// 此套件位于原多轨合成之后，先清理隔离工程，再从已有真实素材建立单片段。
// Ctrl组合使用DOM事件，裁剪使用CDP指针捕获，二者都不是人工桌面操作。
const { field, mouse, shot } = require("./check-video-multitrack");
const { seek } = require("./check-video-ui-timeline");
const ready = ctx => ctx.wait("document.querySelector('[data-program-composite]')?.dataset.programPhase==='ready'");

// 事件发到编辑器可聚焦滚动区，走正式宿主快捷键，不直接调用工程命令。
// 输入框保护另发到搜索字段，以反证原生文字编辑不会被剪辑快捷键吞掉。
// 组合键的Ctrl与Shift明确传入，操作后等待React提交，再由后续断言读取结果。
async function key(ctx, name, ctrl = false, shift = false) {
  await ctx.run(`document.querySelector('[data-editor-timeline-scroll]').dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(name)},ctrlKey:${ctrl},shiftKey:${shift},bubbles:true,cancelable:true}))`);
  await ctx.delay(90);
}

// 只清理本轮生成的临时工程，保留真实素材和生产探测事实。
// 重复点击Delete直到数量归零，若锁误留下来会触发等待失败，不跳过保护。
// 先用工具快捷键A恢复选择意图，避免上一场景留下分割刀影响新片段选择。
// 从公开素材卡选中后用现成“添加到V1”命令，不能私下写clips数组。
async function arrange(ctx) {
  await key(ctx, "a");
  for (const clip of await ctx.clips()) {
    await ctx.run(`document.querySelector('[data-editor-clip="${clip.id}"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}))`);
    await ctx.wait(`!document.querySelector('[data-editor-clip="${clip.id}"]')`);
  }
  ctx.smoke.check("REFERENCE visual basic tools are absent without a selected clip", await ctx.run("!document.querySelector('[data-clip-basic-tools]')"));
  await ctx.click('[data-editor-timeline] button[aria-label=适合全部]');
  await ctx.run("document.querySelector('[data-editor-timeline-scroll]').scrollTop=0;document.querySelector('[data-editor-timeline-scroll]').scrollLeft=0");
  await ctx.click('[data-editor-asset]');
  await ctx.click('[data-editor-region=R02] button[aria-label="添加到 V1 末尾"]');
  await ctx.wait("document.querySelectorAll('[data-editor-clip]').length===1");
  const clip = (await ctx.clips())[0];
  await ctx.click(`[data-editor-clip="${clip.id}"]`); await ready(ctx);
  return clip;
}

// 复制在原片段末尾粘贴，独立ID与独立可删除性必须同时成立。
// 撤销和重做对工程实体恢复，单纯选择变化不应消耗一次历史。
// 剪切从原位移走，粘贴后是新实体；不是把同名素材重新导入一次。
// 在搜索框中按Delete/CtrlZ不应删除工程，保护文字输入的原生含义。
async function historyAndClipboard(ctx, original) {
  await key(ctx, "c", true); await seek(ctx, original.end); await key(ctx, "v", true);
  const pasted = (await ctx.clips()).find(clip => clip.id !== original.id);
  ctx.smoke.check("EDIT clipboard: paste makes an independent same-source entity at the playhead", !!pasted && Math.abs(pasted.start-original.end)<.001);
  await key(ctx, "Delete"); ctx.smoke.check("EDIT Delete removes only the selected pasted entity", (await ctx.clips()).length===1);
  await key(ctx, "z", true); ctx.smoke.check("EDIT Ctrl+Z restores the exact pasted entity", (await ctx.clips()).some(clip=>clip.id===pasted.id));
  await key(ctx, "z", true, true); ctx.smoke.check("EDIT Ctrl+Shift+Z redoes deletion", (await ctx.clips()).length===1);
  await ctx.click(`[data-editor-clip="${original.id}"]`); await key(ctx, "x", true);
  ctx.smoke.check("EDIT Ctrl+X removes the original entity", (await ctx.clips()).length===0);
  await key(ctx, "v", true); ctx.smoke.check("EDIT cut then paste creates a new independent identity", (await ctx.clips()).length===1 && (await ctx.clips())[0].id!==original.id);
  const before = JSON.stringify(await ctx.clips());
  await ctx.run("document.querySelector('[data-editor-region=R02] input').dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}))");
  ctx.smoke.check("EDIT text input does not trigger project Delete", JSON.stringify(await ctx.clips())===before);
  return (await ctx.clips())[0];
}

// 关键帧添加在片段第0与第30帧，X从960到1200，中点应是1080。
// 在已有关键帧字段上输入1200，必须只改该帧，不连带改基础位置。
// 实际媒体readyState与CSS投影一起检查，不能只让属性数字变化就算播放效果生效。
// 当前播放头不在标记上时，菱形保持空心；时间线仍显示两枚真实数据标记。
// 屏幕截图来自capturePage，保留当次真实视频帧和正式工具栏。
// 1920宽工程中X=1080对应56.25%，所以样式断言有独立可手算的预期。
// readyState至少2证明节点持有可用视频数据，但不等同扬声器试听或人工验收。
// 播放350ms后的属性继续向右，用来区分真正逐拍求值与仅定位时更新一次。
// 此源是横屏测试视频，断言不宣称已覆盖长GOP、4K或所有硬件解码器。
async function keyframes(ctx, clip) {
  await ctx.click(`[data-editor-clip="${clip.id}"]`); await ready(ctx);
  await ctx.click('[data-property-key=x] button');
  await seek(ctx, clip.start+1); await ready(ctx); await ctx.click('[data-property-key=x] button');
  await field(ctx,"位置 X",1200);
  await seek(ctx, clip.start+.5); await ready(ctx);
  ctx.smoke.check("EDIT keyframes interpolate actual video position at the midpoint", await ctx.run("(()=>{const c=document.querySelector('[data-canvas-content]'),v=document.querySelector('[data-program-video]');return Math.abs(parseFloat(c.style.left)-56.25)<.02&&v.readyState>=2})()"));
  ctx.smoke.check("EDIT timeline marks and hollow off-keyframe property diamond agree", await ctx.run(`document.querySelectorAll('[data-editor-clip="${clip.id}"] [data-clip-keyframe]').length===2&&document.querySelector('[data-property-key=x] button').getAttribute('aria-pressed')==='false'`));
  await shot(ctx,"editing-keyframe-real-frame");
  await ctx.click('[data-editor-region=R03] button[aria-label=播放]');
  await ctx.delay(350);
  await ctx.click('[data-editor-region=R03] button[aria-label=暂停]');
  ctx.smoke.check("EDIT playing actual video evaluates animated properties continuously", await ctx.run("parseFloat(document.querySelector('[data-canvas-content]').style.left)>56.5&&document.querySelector('[data-program-video]').currentTime>.55"));
  await key(ctx,"z",true); await key(ctx,"z",true); await key(ctx,"z",true);
  await seek(ctx,clip.start+.5); await ready(ctx);
}

// 倒放需要源currentTime随工程前进而减小，单看按钮或一个暂停画面不能证明。
// 定格插入后增加独立静帧主体，且3秒内源currentTime保持相同。
// 镜像与旋转检查实际内容层样式，不能只把工具图标设为选中。
// 每项结束撤销，避免把新状态污染后面的裁剪与旧媒体清理回归。
// 倒放在两个暂停位置与连续播放两条路径验证，排除只交换封面或初始源时间。
// 所用倒放阈值留出调度与解码余量，不承诺每40ms都能在所有机器完成寻帧。
// 镜像检查内容层scaleX，旋转检查内容层rotate，两者都不是操作选框的样式。
async function basicTools(ctx, clip) {
  await ctx.click('[data-clip-basic-tools] button[aria-label=倒放]');
  await seek(ctx,clip.start+.4); await ready(ctx); const first = await ctx.run("document.querySelector('[data-program-video]').currentTime");
  await seek(ctx,clip.start+1); await ready(ctx); const second = await ctx.run("document.querySelector('[data-program-video]').currentTime");
  ctx.smoke.check("EDIT reverse maps actual decoded source frames backwards", second<first-.5);
  await ctx.click('[data-editor-region=R03] button[aria-label=播放]');
  await ctx.delay(650);
  const playingReverse = await ctx.run("document.querySelector('[data-program-video]').currentTime");
  await ctx.click('[data-editor-region=R03] button[aria-label=暂停]');
  ctx.smoke.check("EDIT continuous reverse advances decoded source frames backwards", playingReverse < second-.15);
  await key(ctx,"z",true);
  await ctx.click('[data-clip-basic-tools] button[aria-label=镜像]');
  ctx.smoke.check("EDIT mirror affects actual video content", await ctx.run("document.querySelector('[data-canvas-content]').style.transform.includes('scaleX(-1)')")); await key(ctx,"z",true);
  await ctx.click('[data-clip-basic-tools] button[aria-label="顺时针旋转 90°"]');
  ctx.smoke.check("EDIT rotate affects actual video content", await ctx.run("document.querySelector('[data-canvas-content]').style.transform.includes('rotate(90deg)')")); await key(ctx,"z",true);
  await freezeCheck(ctx, clip);
}

// 插入定格的前后视频都须保留；三个不同工程时刻仍读取同一真实源帧。
// 截图前等真实解码ready，不能把冻结的封面当定格实现。
// 两次定位分别落在新静帧内部，源时间差应小于一帧，而工程时间确实不同。
// 三个工程实体的数量只证明分段保留；源范围的精确数值另由纯模型反证。
async function freezeCheck(ctx, clip) {
  await seek(ctx,clip.start+1); await ready(ctx); await ctx.click('[data-clip-basic-tools] button[aria-label=定格]');
  ctx.smoke.check("EDIT freeze inserts a separate three-second entity without losing surrounding video", (await ctx.clips()).length===3);
  await seek(ctx,clip.start+1.2); await ready(ctx); const frozen = await ctx.run("document.querySelector('[data-program-video]').currentTime");
  await seek(ctx,clip.start+2.5); await ready(ctx);
  ctx.smoke.check("EDIT inserted freeze displays the same real source frame across project time", Math.abs(await ctx.run("document.querySelector('[data-program-video]').currentTime")-frozen)<.025);
  await shot(ctx,"editing-freeze-real-frame"); await key(ctx,"z",true);
}

// 裁剪通过浏览器真实指针捕获框选，确认后真实视频的clip-path必须改变。
// 再次打开后Escape只丢草稿，不能多写一次裁剪或留下可响应的隐藏操作框。
// 锁轨之后工具与字段都不能编辑；最后解锁以恢复后续导航清理前提。
// 鼠标由CDP发送到真实渲染窗口，经过生产指针处理，但仍属于自动事件证据。
// 坐标取自当前元素几何，窗口尺寸变化不应靠硬编码屏幕位置勉强命中。
// 确认后读实际内容clipPath；取消后要求操作框消失且内容裁剪保持原状态。
// 该样例没有同时镜像并旋转后再裁剪，不能把单场景通过扩写为全部组合已测。
async function cropAndLock(ctx, clip) {
  await ctx.click(`[data-editor-clip="${clip.id}"]`); await ready(ctx);
  await ctx.click('[data-clip-basic-tools] button[aria-label=裁剪]'); await ctx.wait("!!document.querySelector('[data-clip-crop]')");
  const box = await ctx.run("(()=>{const b=document.querySelector('[data-clip-crop]').getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}})()");
  await mouse(ctx,"mousePressed",{x:box.x+box.width*.1,y:box.y+box.height*.1});
  await mouse(ctx,"mouseMoved",{x:box.x+box.width*.8,y:box.y+box.height*.8});
  await mouse(ctx,"mouseReleased",{x:box.x+box.width*.8,y:box.y+box.height*.8});
  await ctx.click('[data-clip-crop] button[aria-label=确认裁剪]');
  ctx.smoke.check("EDIT crop commits to real video content and closes the draft overlay", await ctx.run("!document.querySelector('[data-clip-crop]')&&document.querySelector('[data-canvas-content]').style.clipPath.startsWith('inset(')"));
  await shot(ctx,"editing-crop-real-frame"); await key(ctx,"z",true);
  await ctx.click('[data-clip-basic-tools] button[aria-label=裁剪]');
  await ctx.run("document.querySelector('[data-clip-crop]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
  ctx.smoke.check("EDIT Escape discards crop draft", await ctx.run("!document.querySelector('[data-clip-crop]')&&!document.querySelector('[data-canvas-content]').style.clipPath"));
  await ctx.click('[data-editor-track-head=V1] button[aria-label=锁定]');
  ctx.smoke.check("EDIT locked track disables basic editing tools and keyframes", await ctx.run("[...document.querySelectorAll('[data-clip-basic-tools] button,[data-property-key] button')].every(e=>e.disabled)"));
  await ctx.click('[data-editor-track-head=V1] button[aria-label=锁定]');
}

// 测试顺序明确分开实体编辑、关键帧、真实基础动作，失败保留外层harness的非零结果。
// 十二个素材类别只证明入口与禁用说明；没有把文本或转场入口当作已经实现业务。
async function checkVideoEditTools(ctx) {
  const clip = await arrange(ctx), current = await historyAndClipboard(ctx,clip);
  await keyframes(ctx,current); await basicTools(ctx,current); await cropAndLock(ctx,current);
  ctx.smoke.check("EDIT library exposes the twelve compact reference categories", await ctx.run("[...document.querySelectorAll('[data-media-library-tabs] [data-library-category]')].map(e=>e.textContent).join('|')==='素材|音频|文本|贴纸|特效|转场|字幕|智能包装|滤镜|调节|模板|数字人'"));
  await referenceControls(ctx);
  await squareFilmstrip(ctx, (await ctx.clips())[0]);
  await shot(ctx,"editing-final-real-workspace");
}
module.exports = { checkVideoEditTools };

// 时间线放大只改变覆盖秒数：帧槽保持40px，长片段也只分配视口附近的画布。
// 直接读真实几何与ready后像素缓冲，避免只断言产品写出的tile标签自证。
async function squareFilmstrip(ctx, clip) {
  const read = `(()=>{const c=document.querySelector('[data-editor-clip="${clip.id}"]'),f=c.querySelector('[data-video-filmstrip]');return {width:c.getBoundingClientRect().width,height:f.getBoundingClientRect().height,canvas:f.width}})()`;
  const before = await ctx.run(read);
  for(let i=0;i<4;i++) await ctx.click('[data-timeline-view-controls] button[aria-label=放大时间轴]');
  await ctx.run(`document.querySelector('[data-editor-clip="${clip.id}"]').scrollIntoView({block:'nearest',inline:'center'})`);
  await ctx.delay(250);
  await ctx.wait(`!!document.querySelector('[data-editor-clip="${clip.id}"] [data-filmstrip-ready=true]')`);
  const after = await ctx.run(read);
  ctx.smoke.check("EDIT zoom expands clip time width while filmstrip cells stay 40px high", after.width>before.width&&before.height===40&&after.height===40);
  ctx.smoke.check("EDIT filmstrip decoding buffer is bounded by the actual scroll viewport", await ctx.run(`document.querySelector('[data-editor-clip="${clip.id}"] [data-video-filmstrip]').width<=(document.querySelector('[data-editor-timeline-scroll]').clientWidth+82)*Math.min(2,devicePixelRatio)`));
}

// 顶栏固定间距要在真正素材区宽度变化时验证，不能通过源码里写了44px自证。
// 先滚到开头，再点右箭头，末端可见后应出现左箭头；类别选择不能因此丢失。
// 工具条通过计算样式确认没有边框盒子，键盘焦点线仍由focus-visible单独保留。
async function referenceControls(ctx) {
  ctx.smoke.check("REFERENCE timeline controls use bare icons", await ctx.run("[...document.querySelectorAll('[data-editor-timeline] [data-editor-action]')].every(e=>getComputedStyle(e).borderTopColor==='rgba(0, 0, 0, 0)')"));
  ctx.smoke.check("REFERENCE categories keep compact fixed spacing", await ctx.run("(()=>{const e=[...document.querySelectorAll('[data-library-category]')];return e.every(n=>n.getBoundingClientRect().width===44)&&e[1].offsetLeft-e[0].offsetLeft===46})()"));
  await ctx.run("document.querySelector('[data-library-category]').parentElement.scrollLeft=0"); await ctx.delay(70);
  const overflow = await ctx.run("!!document.querySelector('[data-library-page=right]')");
  ctx.smoke.check("REFERENCE narrow library exposes a right overflow arrow", overflow);
  if (overflow) {
    await ctx.click('[data-library-page=right]'); await ctx.delay(80);
    ctx.smoke.check("REFERENCE overflow arrow reveals right categories and preserves selected media", await ctx.run("!!document.querySelector('[data-library-page=left]')&&document.querySelector('[data-library-category=media]').getAttribute('aria-pressed')==='true'"));
  }
  await shot(ctx,"reference-compact-library");
  await ctx.run("document.querySelector('[data-library-category]').parentElement.scrollLeft=0");
}

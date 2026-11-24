/** 正式页面自动双击与键盘回归；文件、SQLite及解码真实，未调用模型，也不属于人工操作。 */
const fs = require("node:fs"), path = require("node:path");
const library = require("./canvas-library-fixture");
const preview = "[data-canvas-network-preview]";

async function seedNetwork(ctx) {
  const document = await library.readCanvas(ctx);
  const fixtures = path.resolve("scripts/fixtures/video-composition");
  const media = (kind, name) => ({ kind, name, path: path.join(fixtures, name), size: fs.statSync(path.join(fixtures, name)).size });
  const node = (id, kind, index, file) => ({ id, position: { x: 100 + index * 430, y: 180 }, data: { kind, title: id, prompt: "", content: kind === "text" ? "Connected text content" : "", ratio: "16/9", media: file } });
  const nodes = [node("image", "image", 0, media("image", "image.png")), node("video", "video", 1, media("video", "video.mp4")), node("text", "text", 2), { ...node("isolated", "image", 0), position: { x: 100, y: 500 } }, { ...node("audio", "audio", 1, media("audio", "audio.wav")), position: { x: 530, y: 500 } }, { ...node("note", "note", 2), position: { x: 960, y: 500 } }];
  const edges = [["image", "video"], ["text", "video"], ["text", "audio"]].map(([source, target], index) => ({ id: String(index), source, target, sourceHandle: "out", targetHandle: "in" }));
  await library.writeCanvas(ctx, { ...document, nodes, edges });
  await new Promise(resolve => { ctx.win.webContents.once("did-finish-load", resolve); ctx.win.webContents.reload(); });
  await library.openProject(ctx);
  await ctx.wait("document.querySelector('[data-canvas-node=image] img')");
  // 夹具重开会再显示首次更新公告；先关闭真实遮罩，不能向被遮住的卡片注入双击。
  await ctx.run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
}

// 按真正双击的输入序列打开，不能直接调用预览组件或注入业务状态。
async function openPreview(ctx, id) {
  await ctx.wait("!!document.querySelector('.react-flow__pane')");
  // 主题波纹期间浏览器让快照层接收点击；等真实交互层归位后再发物理双击。
  await ctx.wait("!document.documentElement.classList.contains('theme-ripple')");
  await ctx.click('.react-flow__pane');
  // 定位与改窗口会改变镜头；先用真实“适配全部”并等几何停稳，避免双击落到旧坐标。
  await ctx.click('[data-canvas-viewport] button[aria-label="适配全部"]');
  await ctx.run("window.networkGeometry={value:'',time:Date.now()}");
  await ctx.wait("(()=>{const value=document.querySelector('.react-flow__viewport').style.transform;if(value!==window.networkGeometry.value){window.networkGeometry={value,time:Date.now()};return false}return Date.now()-window.networkGeometry.time>250})()");
  const position = await ctx.run(`(()=>{const r=document.querySelector('[data-canvas-node=${id}] .hy-node-card').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  await ctx.wait(`document.elementFromPoint(${position.x},${position.y})?.closest('[data-canvas-node]')?.dataset.canvasNode===${JSON.stringify(id)}`);
  await ctx.run("window.networkDouble=null;document.addEventListener('dblclick',event=>{window.networkDouble={target:event.target.outerHTML.slice(0,300),node:event.target.closest('[data-canvas-node]')?.dataset.canvasNode}},{once:true,capture:true})");
  ctx.win.webContents.sendInputEvent({ type: "mouseMove", ...position });
  for (const clickCount of [1, 2]) for (const type of ["mouseDown", "mouseUp"]) ctx.win.webContents.sendInputEvent({ type, ...position, button: "left", clickCount });
  try { await ctx.wait(`!!document.querySelector('${preview}')`); }
  catch (error) { console.log("NETWORK_DOUBLE_DIAGNOSTIC", { id, position, result: await ctx.run("({event:window.networkDouble,active:document.activeElement.outerHTML.slice(0,200)})") }); throw error; }
}

async function checkNavigation(ctx) {
  await openPreview(ctx, "video");
  await checkVideoSwitch(ctx);
  await ctx.click(`${preview} [data-network-node=image]`);
  await ctx.wait("document.querySelector('[data-network-content=image] img').naturalWidth>0");
  await checkPreviewTools(ctx);
  ctx.smoke.check("Image preview uses full image fit and decoded size", await ctx.run("getComputedStyle(document.querySelector('[data-network-content=image] img')).objectFit==='contain'&&document.querySelector('[data-network-metadata]').textContent.includes('×')"));
  await ctx.key("Delete");
  await ctx.key("z", ["control"]);
  ctx.smoke.check("Preview keys cannot delete or undo the underlying graph", await ctx.run("document.querySelectorAll('[data-canvas-node]').length===6&&document.querySelectorAll('[data-network-node]').length===4"));
  await ctx.key("Tab");
  ctx.smoke.check("Keyboard focus stays in preview", await ctx.run(`!!document.activeElement.closest('${preview}')`));
  await ctx.click(`${preview} button[aria-label="关闭"]`);
  await ctx.wait(`!document.querySelector('${preview}')`);
  ctx.smoke.check("Close releases preview media and restores canvas focus", await ctx.run("document.activeElement===document.querySelector('[data-infinite-canvas]')"));
  // 预览专用样式必须随关闭撤销，不能让普通画布永久失去原来的外壳留白。
  ctx.smoke.check("Close restores ordinary canvas shell spacing", await ctx.run("(()=>{const s=getComputedStyle(document.querySelector('[data-app-main]'));return s.padding==='4px'&&s.borderTopWidth==='1px'})()"));
}

// 只有真实播放后再切换，才能证明旧播放器主动退出，而不是本来就没开始。
async function checkVideoSwitch(ctx) {
  try { await ctx.wait("document.querySelector('[data-network-content=video] video').readyState>=2&&document.querySelector('[data-network-content=video] [data-media-status=ready]')"); }
  catch (error) {
    console.log("NETWORK_MEDIA_DIAGNOSTIC", await ctx.run("Array.from(document.querySelectorAll('video')).map(v=>({source:v.getAttribute('src'),ready:v.readyState,duration:v.duration,status:v.closest('[data-media-status]')?.dataset.mediaStatus,connected:v.isConnected,inert:!!v.closest('[inert]')}))"));
    throw error;
  }
  ctx.smoke.check("Double-click opens clicked video and exactly its connected network", await ctx.run(`document.querySelectorAll('${preview} [data-network-node]').length===4&&!!document.querySelector('[data-network-content=video]')&&!document.querySelector('${preview} [data-network-node=isolated]')`));
  await ctx.wait("document.querySelector('[data-network-node=video] [data-video-cover] img')?.naturalWidth>0");
  // 主播放器可播放，底部始终是首帧静态图，不再常驻第二个解码器。
  ctx.smoke.check("Video thumbnail defaults to a decoded first frame without autoplay", await ctx.run("!document.querySelector('[data-network-node=video] video')&&document.querySelector('[data-network-content=video] video').paused&&document.querySelector('[data-network-content=video] video').currentTime===0"));
  await ctx.shot("100-network-video-dark");
  await ctx.click(`${preview} [aria-label="播放视频"]`);
  await ctx.wait("!document.querySelector('[data-network-content=video] video').paused");
  await ctx.run("window.networkOldPlayer=document.querySelector('[data-network-content=video] video')");
  await ctx.key("Right");
  await ctx.wait("!!document.querySelector('[data-network-content=text]')&&window.networkOldPlayer.paused&&!window.networkOldPlayer.getAttribute('src')");
  await checkPreviewFrame(ctx, 'dark-keyboard');
  ctx.smoke.check("Arrow switches to text and releases old video source", await ctx.run("!!document.querySelector('[data-network-content=text]')&&document.querySelector('[data-network-content=text]').textContent.includes('Connected text content')&&window.networkOldPlayer.paused&&!window.networkOldPlayer.getAttribute('src')"));
}

async function checkThemeAndLocate(ctx) {
  await require("./check-minimax-image-edit").changeTheme(ctx, "light");
  ctx.win.setSize(960, 720);
  await ctx.wait("innerWidth<=960");
  await checkVideoExpand(ctx, 'light-narrow');
  await openPreview(ctx, "image");
  await ctx.wait("document.querySelector('[data-network-content=image] img').naturalWidth>0");
  await checkMainHover(ctx, 'light-narrow');
  await ctx.click(`${preview} [data-network-node=text]`);
  await checkPreviewFrame(ctx, 'light-narrow-click');
  await ctx.click(`${preview} [data-network-node=image]`);
  await ctx.wait("document.querySelector('[data-network-content=image] img').naturalWidth>0");
  ctx.smoke.check("Narrow light preview and scroll strip stay within workspace", await ctx.run(`(()=>{const p=document.querySelector('${preview}').getBoundingClientRect(),s=document.querySelector('${preview} footer').getBoundingClientRect();return p.left>=0&&p.right<=innerWidth+1&&p.bottom<=innerHeight+1&&s.bottom<=p.bottom+1})()`));
  await ctx.shot("101-network-image-light-narrow");
  await ctx.click(`${preview} [data-network-node=text]`);
  await ctx.run(`Array.from(document.querySelectorAll('${preview} button')).find(e=>e.textContent.includes('定位到节点')).click()`);
  await ctx.wait(`!document.querySelector('${preview}')`);
  ctx.smoke.check("Locate closes preview and selects the exact text node", await ctx.run("document.querySelector('[data-canvas-node=text]').dataset.selected==='true'&&document.querySelectorAll('[data-selected=true]').length===1"));
  ctx.win.setSize(1600, 1000);
  await ctx.wait("innerWidth===1600");
  await require("./check-minimax-image-edit").changeTheme(ctx, "dark");
}

async function checkCanvasNetwork(ctx) {
  await require('./check-video-resource-covers').checkVideoResourceCovers(ctx);
  await seedNetwork(ctx);
  await require('./check-video-node-gestures').checkVideoNodeGestures(ctx);
  if (process.env.CANVAS_HMR_SMOKE === '1') await require('./check-canvas-dev-refresh').checkCanvasDevRefresh(ctx);
  await checkVideoExpand(ctx, 'dark');
  await checkNavigation(ctx);
  await checkThemeAndLocate(ctx);
  await checkAudioAndIsolation(ctx);
  await checkNoteEditing(ctx);
  await checkSharedIcons(ctx);
  await checkLongStrip(ctx);
}

// 从真实视频按钮进入已有主区预览；用系统全屏拦截计数反证，不能只检查浮层出现。
async function checkVideoExpand(ctx, theme) {
  const card = '[data-canvas-node=video]';
  await ctx.wait("!document.documentElement.classList.contains('theme-ripple')");
  await ctx.click('.react-flow__pane');
  await ctx.click('[data-canvas-viewport] button[aria-label="适配全部"]');
  await ctx.wait(`document.querySelector('${card} [data-media-status=ready]')`);
  await ctx.run("window.videoExpandGeometry={value:'',time:Date.now()}");
  await ctx.wait("(()=>{const value=document.querySelector('.react-flow__viewport').style.transform;if(value!==window.videoExpandGeometry.value){window.videoExpandGeometry={value,time:Date.now()};return false}return Date.now()-window.videoExpandGeometry.time>250})()");
  await ctx.run('window.videoFullscreenCalls=0;window.originalFullscreen=Element.prototype.requestFullscreen;Element.prototype.requestFullscreen=function(){window.videoFullscreenCalls++;return Promise.reject(Error("Unexpected system fullscreen"))};void 0');
  try {
    ctx.smoke.check(`${theme} video card fills its container`, await ctx.run(`getComputedStyle(document.querySelector('${card} video')).objectFit==='cover'`));
    await ctx.pointer(`${card} [aria-label="全屏预览"]`);
    await ctx.wait("document.querySelector('[data-network-content=video] [data-media-status=ready]')");
    ctx.smoke.check(`${theme} expand reuses in-app preview without system fullscreen`, !ctx.win.isFullScreen() && await ctx.run(`(()=>{const p=document.querySelector('${preview}').getBoundingClientRect(),m=document.querySelector('[data-app-main]').getBoundingClientRect();return window.videoFullscreenCalls===0&&!document.fullscreenElement&&p.width>m.width-12&&p.left>=m.left-1&&p.right<=m.right+1&&p.bottom<=m.bottom+1&&getComputedStyle(document.querySelector('[data-network-content=video] video')).objectFit==='contain'})()`));
    await ctx.shot(`106-video-expand-${theme}`);
    await ctx.key('Escape');
    await ctx.wait(`!document.querySelector('${preview}')`);
    ctx.smoke.check(`${theme} Escape returns focus to the same video button`, await ctx.run(`document.activeElement===document.querySelector('${card} [aria-label="全屏预览"]')`));
  } finally { await ctx.run('Element.prototype.requestFullscreen=window.originalFullscreen;void 0'); }
}

async function checkNoteEditing(ctx) {
  // 双击现在进入书写；网络预览仍可从媒体进入并查看相连文本。
  await ctx.run("document.querySelector('[data-canvas-node=note] .hy-node-card').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await ctx.pointer('[data-canvas-node=note] header>svg');
  await ctx.click('[data-canvas-node=note] [aria-label="手写内容"]');
  await ctx.wait("!!document.querySelector('[data-canvas-node=note] textarea')");
  await ctx.run("(()=>{const e=document.querySelector('[data-canvas-node=note] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Edited note content');e.dispatchEvent(new Event('input',{bubbles:true}));e.blur()})()");
  ctx.smoke.check("Note writing updates its card without opening network preview", await ctx.run(`!document.querySelector('${preview}')&&document.querySelector('[data-canvas-node=note] .hy-node-result').textContent.includes('Edited note content')`));
}

// 音频也必须真实推进后退出；孤立空节点只查看自己，不能混入前一次网络。
async function checkAudioAndIsolation(ctx) {
  await openPreview(ctx, "video");
  await ctx.click(`${preview} [data-network-node=audio]`);
  await ctx.wait("document.querySelector('[data-network-content=audio] [data-media-status=ready]')");
  await ctx.run("window.networkAudio=document.querySelector('[data-network-content=audio] audio')");
  await ctx.click(`${preview} [aria-label="播放音频"]`);
  await ctx.wait("window.networkAudio.currentTime>0");
  ctx.smoke.check("Network audio uses real media clock", await ctx.run("!window.networkAudio.paused&&window.networkAudio.currentTime>0"));
  await ctx.key("Escape");
  await ctx.wait(`!document.querySelector('${preview}')`);
  ctx.smoke.check("Escape closes and releases playing audio", await ctx.run("window.networkAudio.paused&&!window.networkAudio.getAttribute('src')"));
  await openPreview(ctx, "isolated");
  await checkPreviewFrame(ctx, 'empty-image');
  ctx.smoke.check("Isolated node previews alone with disabled navigation and genuine empty state", await ctx.run(`document.querySelectorAll('${preview} [data-network-node]').length===1&&document.querySelectorAll('${preview} [data-network-navigation] button:disabled').length===2&&!!document.querySelector('[data-network-content=isolated]')`));
  await ctx.key("Escape");
  await ctx.wait(`!document.querySelector('${preview}')`);
}
module.exports = { checkCanvasNetwork };

// 白框来自main外层的1px边线和4px留白；比对真实几何，不能只看预览自身outline。
async function checkPreviewFrame(ctx, label) {
  const measure = `(()=>{const p=document.querySelector('${preview}'),m=document.querySelector('[data-app-main]'),a=p.getBoundingClientRect(),b=m.getBoundingClientRect(),s=getComputedStyle(m),f=getComputedStyle(p);return {flush:['left','right','top','bottom'].every(k=>Math.abs(a[k]-b[k])<1),padding:s.padding,border:s.borderTopWidth,outline:f.outlineStyle}})()`;
  // 首次打开由现有 ResizeObserver 同步宿主尺寸；按有界轮询等它交付，切图无需重新布局。
  await ctx.wait(`(${measure}).flush`);
  const result = await ctx.run(measure);
  ctx.smoke.check(`${label}: 切换后预览贴合main，无外围浅色框或焦点框`, result.flush && result.padding === '0px' && result.border === '0px' && result.outline === 'none');
  await ctx.shot(`108-preview-switch-${label}`);
}

/** 图像查看状态用真实按钮验证，文件不旋转、不写入工程；动画读最终计算样式。 */
async function checkPreviewTools(ctx) {
  await checkMainHover(ctx, 'dark');
  await require('./check-preview-wheel').checkPreviewWheel(ctx);
  await checkNetworkPan(ctx);
  await hover(ctx, '[data-network-content=image] img');
  await ctx.wait(`document.querySelector('${preview}').dataset.controlsVisible==='true'`);
  await ctx.click(`${preview} [aria-label="图片信息"]`);
  ctx.smoke.check('信息点击显示真实解码尺寸，预览无大灰底', await ctx.run("!document.querySelector('[data-network-metadata]').hidden&&getComputedStyle(document.querySelector('[data-network-content=image]')).backgroundColor==='rgba(0, 0, 0, 0)'"));
  await ctx.click(`${preview} [aria-label="顺时针旋转"]`);
  await ctx.wait("document.querySelector('[data-preview-surface]').style.transform.includes('90deg')");
  await ctx.click(`${preview} [aria-label="放大"]`);
  await ctx.wait("document.querySelector('[data-preview-zoom]').textContent==='110%'");
  await dragNetworkImage(ctx, { x: 70, y: -20 }, '节点网旋转90度并放大');
  await ctx.shot('102-network-image-tools-dark');
  await hover(ctx, `${preview} [aria-label="逆时针旋转"]`);
  await ctx.wait("[...document.querySelectorAll('[data-hover-tip][data-visible=true]')].some(e=>e.textContent==='逆时针旋转')");
  ctx.smoke.check('黑色自绘提示复用、图标无原生title、缩放旋转真实应用', await ctx.run(`!document.querySelector('${preview} [aria-label="逆时针旋转"]').hasAttribute('title')&&document.querySelector('[data-preview-surface]').style.transform.includes('scale(1.1)')`));
  await ctx.shot('103-network-tooltip-dark');
  await ctx.click(`${preview} [aria-label="重置视图"]`);
  await ctx.wait("document.querySelector('[data-preview-zoom]').textContent==='100%'&&document.querySelector('[data-preview-surface]').style.transform.includes('rotate(0deg)')");
  await hover(ctx, `${preview} footer`);
  await ctx.wait(`document.querySelector('${preview}').dataset.controlsVisible==='false'`);
  ctx.smoke.check('重置恢复居中适配，footer悬停不唤出工具', true);
  ctx.smoke.check('缩略条居中且只有选中资源显示文件名前缀', await ctx.run(`(()=>{const e=document.querySelector('${preview} footer [aria-label] > div'),p=document.querySelector('${preview}').getBoundingClientRect(),r=e.getBoundingClientRect();return Math.abs((r.left+r.right)/2-(p.left+p.right)/2)<2&&document.querySelectorAll('${preview} [data-network-node] > span:not([data-video-cover])').length===1})()`));
}

// 使用原节点网和真实图片；与创作大图共用输入助手，避免只验某一个调用方。
async function dragNetworkImage(ctx, delta, label) {
  const selectors = { image: '[data-network-content=image] img', pane: '[data-network-content=image]', surface: '[data-preview-surface]' };
  await require('./preview-pan-input').dragImage({ ...ctx, input: event => ctx.win.webContents.sendInputEvent(event) }, selectors, delta, label);
}

async function checkNetworkPan(ctx) {
  await dragNetworkImage(ctx, { x: 80, y: 40 }, '节点网100%');
  await ctx.click(`${preview} [aria-label="缩小"]`);
  await ctx.wait("document.querySelector('[data-preview-zoom]').textContent==='90%'");
  await dragNetworkImage(ctx, { x: -30, y: 25 }, '节点网缩小90%');
  await require('./preview-pan-input').cancelPan({ ...ctx, input: event => ctx.win.webContents.sendInputEvent(event) }, { image: '[data-network-content=image] img', pane: '[data-network-content=image]', surface: '[data-preview-surface]' });
  await ctx.shot('107-network-image-panned');
  await ctx.click(`${preview} [aria-label="重置视图"]`);
  await ctx.wait("document.querySelector('[data-preview-surface]').style.transform.startsWith('translate(0px, 0px)')");
  await ctx.click(`${preview} [data-network-node=text]`);
  await ctx.click(`${preview} [data-network-node=image]`);
  await ctx.wait("document.querySelector('[data-network-content=image] img').naturalWidth>0");
  ctx.smoke.check('重置与切换图片清除平移，预览不影响底层节点', await ctx.run("document.querySelector('[data-preview-surface]').style.transform.startsWith('translate(0px, 0px)')&&document.querySelector('[data-network-content=image]').dataset.previewDragging==='false'&&document.querySelectorAll('[data-canvas-node]').length===6"));
}

// 四个点都落在main留白，不能用图片中心冒充扩大后的触发范围；每次先从footer移入。
async function checkMainHover(ctx, theme) {
  const points = await ctx.run(`(()=>{const r=document.querySelector('${preview} section').getBoundingClientRect();return [{x:r.left+3,y:(r.top+r.bottom)/2},{x:r.right-3,y:(r.top+r.bottom)/2},{x:(r.left+r.right)/2,y:r.top+3},{x:(r.left+r.right)/2,y:r.bottom-3}].map(p=>({x:Math.round(p.x),y:Math.round(p.y)}))})()`);
  for (const [index, point] of points.entries()) {
    await hover(ctx, `${preview} footer`);
    await ctx.wait(`document.querySelector('${preview}').dataset.controlsVisible==='false'`);
    ctx.smoke.check(`${theme}: main留白${index + 1}不在图片容器内`, await ctx.run(`(()=>{const e=document.elementFromPoint(${point.x},${point.y});return !!e?.closest('${preview} section')&&!e.closest('[data-network-content]')})()`));
    ctx.win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
    await ctx.wait(`document.querySelector('${preview}').dataset.controlsVisible==='true'`);
  }
  await ctx.wait(`getComputedStyle(document.querySelector('${preview} [data-preview-chrome]')).opacity==='1'`);
  await ctx.shot(`106-main-hover-${theme}`);
  // 应用导航仍可操作，但经过它必须收起工具；不发送点击，避免切换路由。
  await hover(ctx, '[data-app-nav] a[href="/canvas"]');
  await ctx.wait(`document.querySelector('${preview}').dataset.controlsVisible==='false'`);
  ctx.smoke.check(`${theme}: main四周均唤出工具，footer与应用导航均收起`, true);
}

// 只移动鼠标，不夹带点击，避免“悬停”用例偷偷执行一次旋转。
async function hover(ctx, selector) {
  const point = await ctx.run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  ctx.win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
}

// 共用图标在底栏与预览两个调用处均验；CSS变换不改变实际布局尺寸。
async function checkSharedIcons(ctx) {
  const selector = '.hy-canvas-dock [aria-label="画布设置"]';
  await hover(ctx, selector);
  await ctx.wait("[...document.querySelectorAll('[data-hover-tip][data-visible=true]')].some(e=>e.textContent==='画布设置')");
  ctx.smoke.check('底栏设置保持正圆、无padding压缩，共用悬停放大与自绘提示', await ctx.run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(e);return e.offsetWidth===e.offsetHeight&&s.padding==='0px'&&s.borderRadius==='50%'&&s.transform!=='none'&&!e.title})()`));
  await ctx.shot('104-canvas-settings-tooltip-dark');
}

// 长网只加载可见缩略项；真实横向滚动后仍能选择末尾，不让列表撑宽main。
async function checkLongStrip(ctx) {
  const document = await library.readCanvas(ctx);
  const image = document.nodes.find(node => node.id === 'image');
  document.nodes = Array.from({ length: 24 }, (_, index) => ({ ...(index ? image : document.nodes.find(node => node.id === 'text')), id: 'strip-' + index, position: { x: (index % 6) * 430, y: Math.floor(index / 6) * 340 + 100 } }));
  document.edges = document.nodes.slice(1).map((node, index) => ({ id: 'strip-edge-' + index, source: 'strip-0', target: node.id, sourceHandle: 'out', targetHandle: 'in' }));
  await library.writeCanvas(ctx, document);
  await new Promise(resolve => { ctx.win.webContents.once('did-finish-load', resolve); ctx.win.webContents.reload(); });
  await library.openProject(ctx);
  await ctx.run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await openPreview(ctx, 'strip-1');
  await ctx.click(`${preview} [data-network-node=strip-23]`);
  await ctx.wait("!!document.querySelector('[data-network-content=strip-23]')");
  ctx.smoke.check('24项缩略条横向滚动、选中末尾仍在main内且无重复名字', await ctx.run(`(()=>{const e=document.querySelector('${preview} footer > [aria-label]'),r=e.getBoundingClientRect();return e.scrollWidth>e.clientWidth&&e.scrollLeft>0&&r.right<=innerWidth&&document.querySelectorAll('${preview} [data-network-node] > span:not([data-video-cover])').length===1})()`));
  await ctx.shot('105-network-long-strip-dark');
  await ctx.key('Escape');
  await ctx.wait(`!document.querySelector('${preview}')`);
}

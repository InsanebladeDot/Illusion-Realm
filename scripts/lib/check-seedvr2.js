/** 正式静态页面、IPC和落盘回归；模型服务用固定媒体HTTP夹具，不能证明真实GPU推理或画质。 */
const fs = require("node:fs"), path = require("node:path");
const { nativeImage } = require("electron");
const library = require("./canvas-library-fixture");
const { execFile } = require("node:child_process"), { promisify } = require("node:util");

/** 2.3秒30 FPS、4:3素材包含69帧，同时反证卡片没有写死16:9默认比例。 */
async function writeVideoFixture(file) {
  const { ffmpegPath } = require("../../apps/electron/src/main/modules/ffmpeg/locate").resolveTools();
  await promisify(execFile)(ffmpegPath, ["-v", "error", "-stream_loop", "-1", "-i", path.resolve("scripts/fixtures/video-composition/video.mp4"), "-t", "2.3", "-vf", "fps=30,scale=240:180,setsar=1", "-c:v", "libx264", "-bf", "0", "-c:a", "aac", file], { windowsHide: true, timeout: 20000 });
}

// 画布直存后图库可以根本不存在；目录缺席等同零副本，但权限等读取错误仍应失败。
function galleryFiles(ctx) {
  const directory = path.join(ctx.root, "gallery");
  return fs.existsSync(directory) ? fs.readdirSync(directory) : [];
}

async function waitRequest(state, count) {
  const deadline = Date.now() + 10000;
  while (state.requests.length <= count && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  if (state.requests.length <= count) throw Error("SeedVR2 fixture received no prompt");
}

// 每次真正重开工程，保证超分配置经过保存恢复，而不是仅停留在React状态里。
async function restore(ctx, document) {
  await library.writeCanvas(ctx, document);
  await new Promise(resolve => { ctx.win.webContents.once("did-finish-load", resolve); ctx.win.webContents.reload(); });
  await library.openProject(ctx);
  await ctx.wait("document.querySelector('[data-canvas-node=target]')");
  if (document.nodes.find(node => node.id === "target").data.mode === "upscale") {
    await ctx.wait("document.querySelector('[data-canvas-node=target] [data-canvas-upscale-card] button')");
  } else {
    await ctx.pointer('[data-canvas-node=target] header>svg');
    await ctx.wait("document.querySelector('[data-canvas-node=target] .hy-submit')");
  }
}

async function save(ctx) {
  await ctx.click('.hy-project-header [aria-label="保存画布"]');
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  return library.readCanvas(ctx);
}

async function setup(ctx, kind, value) {
  const file = path.join(ctx.root, kind === "video" ? "reference.mp4" : "reference.png");
  if (kind === "video") await writeVideoFixture(file);
  else fs.copyFileSync(path.resolve("scripts/fixtures/video-composition/image.png"), file);
  const media = { kind, path: file, name: path.basename(file), size: fs.statSync(file).size };
  const data = { kind, title: "SeedVR2", prompt: "", content: "", ratio: "16/9" };
  const current = await library.readCanvas(ctx);
  const target = { id: "target", position: { x: 700, y: 180 }, data: { ...data, ...value } };
  const source = { id: "source", position: { x: 170, y: 180 }, data: { ...data, media } };
  const document = { ...current, nodes: [source, target], edges: [{ id: "input", source: "source", target: "target", sourceHandle: "out", targetHandle: "in" }] };
  await restore(ctx, document);
  return document;
}

// 挂起的请求必须只在对应卡片扫光；取消走真实生产取消会话，下一次允许重新提交。
async function checkNode(ctx, state) {
  const document = await setup(ctx, "image", { mode: "upscale", upscale: { enabled: false, model: "seedvr2_7b", scale: 2 } });
  ctx.smoke.check("Upscale card defaults to 7B 2x and has one settings icon plus submit", await ctx.run("(()=>{const card=document.querySelector('[data-canvas-upscale-card]');return card.textContent.includes('SeedVR2 7B')&&card.textContent.includes('×2')&&card.querySelectorAll('button').length===2&&!card.querySelector('select,textarea,[role=switch],[contenteditable]')&&!document.querySelector('[data-canvas-upscale-panel]')})()"));
  await ctx.shot("96-upscale-card-idle-dark");
  await checkImageSettings(ctx);
  state.holdUpscale = true;
  const count = state.requests.length;
  await ctx.pointer('[data-canvas-upscale-card] > div:last-child > button');
  await ctx.wait("document.querySelector('[data-canvas-node=target] [data-canvas-node-loading]')");
  ctx.smoke.check("Only target card shows loading, no global generation cover", await ctx.run("document.querySelectorAll('[data-canvas-node-loading]').length===1&&!document.querySelector('[data-canvas-node=source] [data-canvas-node-loading]')&&document.querySelector('[data-canvas-node=target]').closest('[inert]')===null"));
  await ctx.shot("90-seedvr2-node-loading-dark");
  await waitRequest(state, count);
  await ctx.click('[data-canvas-node-loading] button');
  await ctx.wait("!document.querySelector('[data-canvas-node-loading]')");
  state.holdUpscale = false;
  await ctx.click('[data-canvas-upscale-card] > div:last-child > button');
  await ctx.wait("document.querySelector('[data-canvas-node=target] [data-media-status=ready]')&&!document.querySelector('[data-canvas-node-loading]')");
  const saved = await save(ctx), result = saved.nodes.find(node => node.id === "target");
  const sourceSize = nativeImage.createFromPath(document.nodes[0].data.media.path).getSize();
  ctx.smoke.check("Image uses selected 3B model, fixed seed, uploaded image and true 3x pixels", nativeImage.createFromPath(result.data.media.path).getSize().width === sourceSize.width * 3 && state.requests.at(-1).prompt["66:52"].inputs.unet_name.includes("3b_int8") && state.requests.at(-1).prompt["66:54"].inputs.seed === 123 && state.requests.at(-1).prompt["1"].inputs.image.startsWith("fixture-input/"));
  await ctx.shot("91-seedvr2-image-result-http-fixture");
  const requests = state.requests.length;
  await restore(ctx, saved);
  ctx.smoke.check("Reopening preserves 3B, scale and fixed seed", saved.nodes.find(node => node.id === "target").data.upscale.model === "seedvr2_3b" && await ctx.run("document.querySelector('[data-canvas-upscale-card]').textContent.includes('×3')"));
  ctx.smoke.check("Reopening upscale card does not submit another request", state.requests.length === requests && await ctx.run("!!document.querySelector('[data-canvas-upscale-card] > div:last-child > button')&&!document.querySelector('[data-canvas-node=target] .hy-generation-panel')"));
}

// H3先生成一张，再交给超分；/free与第二份prompt都必须在第一份完成之后出现。
async function checkSequence(ctx, state) {
  await setup(ctx, "image", { workflow: "minimax-image-edit", prompt: "SeedVR2 integration fixture", upscale: { enabled: true, model: "seedvr2_7b", scale: 2 } });
  ctx.smoke.check("Image upscale switch follows quality on the same options row", await ctx.run("(()=>{const q=document.querySelector('[data-canvas-parameter=quality]'),u=document.querySelector('[data-kind=image] [data-upscale-options]');return q.parentElement===u.parentElement&&!!(q.compareDocumentPosition(u)&Node.DOCUMENT_POSITION_FOLLOWING)&&!u.querySelector('select')})()"));
  await ctx.shot("98-upscale-inline-quality-dark");
  const before = state.events.length, count = state.requests.length;
  await ctx.click('[data-canvas-node=target] .hy-submit');
  await ctx.wait("document.querySelector('[data-canvas-node=target] [data-media-status=ready]')&&!document.querySelector('[data-canvas-node-loading]')");
  const events = state.events.slice(before), requests = state.requests.slice(count);
  ctx.smoke.check("Generation and upscale are two ordered prompts with unload between", requests.length === 2 && !!requests[0].prompt["9"] && !!requests[1].prompt["66:57"] && events.map(item => item.type).join(",") === "prompt,free,prompt" && events[1].body.unload_models && events[1].body.free_memory);
  const saved = await save(ctx), result = saved.nodes.find(node => node.id === "target");
  const directory = path.dirname(result.data.media.path);
  // 图库必须为空，且工程 Picture 里有原图和超分图；只验节点地址会漏掉重复副本。
  ctx.smoke.check("Canvas saves original and upscale only in project Picture", nativeImage.createFromPath(result.data.media.path).getSize().width === 2048 && fs.readdirSync(directory).filter(name => name.endsWith(".png")).length >= 3 && galleryFiles(ctx).filter(name => name.endsWith(".png")).length === 0);
  state.failUpscale = true;
  await ctx.pointer('[data-canvas-node=target] header>svg');
  await ctx.click('[data-canvas-node=target] .hy-submit');
  await ctx.wait("!document.querySelector('[data-canvas-node-loading]')&&document.querySelector('[data-infinite-canvas]').textContent.includes('原图已保留')");
  state.failUpscale = false;
  ctx.smoke.check("Upscale failure keeps prior card result and saved original", fs.existsSync(result.data.media.path));
}

/** 七批包含HTTP轮询与本机三阶段封装，专用等待有20秒上限，不改其他UI等待。 */
async function waitVideoResult(ctx) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await ctx.run("!!document.querySelector('[data-canvas-node=target] video')&&!document.querySelector('[data-canvas-node-loading]')")) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error("Video upscale batches did not finish within 20 seconds");
}

async function checkVideo(ctx, state) {
  const source = await setup(ctx, "video", { mode: "upscale", upscale: { enabled: true, model: "seedvr2_7b", scale: 2 } });
  await checkVideoCancel(ctx, state, source.nodes[0].data.media.path);
  await checkVideoSettings(ctx);
  const before = state.requests.length, batchStart = state.videoUpscale.batches.length, uploads = state.uploads;
  await ctx.click('[data-canvas-upscale-card] > div:last-child > button');
  await waitVideoResult(ctx);
  await checkVideoCard(ctx);
  const graph = state.requests.at(-1).prompt, saved = await save(ctx);
  const result = saved.nodes.find(node => node.id === "target").data.media;
  ctx.smoke.check("Video upscale stays in project video with no gallery copy", path.basename(path.dirname(result.path)) === "video" && !galleryFiles(ctx).some(name => name.endsWith(".mp4")));
  const { probeVideo } = require("../../apps/electron/src/main/modules/ffmpeg/probe");
  const { ffprobePath } = require("../../apps/electron/src/main/modules/ffmpeg/locate").resolveTools();
  const output = await probeVideo(ffprobePath, result.path), input = await probeVideo(ffprobePath, source.nodes[0].data.media.path);
  const batches = state.videoUpscale.batches.slice(batchStart);
  ctx.smoke.check("Video uses selected twenty-frame batches with one-second slices", !graph["109"] && !graph.ir_sample && JSON.stringify(graph["66:75"].inputs.fps) === JSON.stringify(["66:74", 2]) && batches.map(batch => batch.frames).join(",") === "20,20,20,9" && graph["113:112"].inputs.fps === 20 && graph["113:115"].inputs.duration === 1 && state.requests.length - before === batches.length && batches.every(batch => batch.fps === 20));
  ctx.smoke.check("Merged video keeps source audio, duration and actual 2x pixels", Math.abs(output.fps - input.fps) < .001 && output.width === input.width * 2 && output.height === input.height * 2 && output.hasAudio === input.hasAudio && Math.abs(output.duration - input.duration) <= 1 / input.fps + .001 && result.kind === "video");
  ctx.smoke.check("Full source uploads once and workflow starts advance by one second", state.uploads - uploads === 1 && new Set(batches.map(batch => batch.source)).size === 1 && batches.every((batch, index) => batch.start === index));
  ctx.smoke.check("Random-once mode reuses one seed for all batches", new Set(batches.map(batch => batch.seed)).size === 1);
  await ctx.shot("92-seedvr2-video-result-http-fixture");
  await checkSavedVideoCard(ctx, saved);
}

/** 实际成片铺满到卡片四边；复用图片的真实鼠标缩放回归，不直接写尺寸伪装拖动成功。 */
async function checkVideoCard(ctx) {
  const node = '[data-canvas-node=target]', resize = require('./check-canvas-card-resize');
  await ctx.wait(`document.querySelector('${node}[data-auto-video=true] [data-media-status=ready]')`);
  ctx.smoke.check('Imported video shares the first-frame default sizing', await ctx.run("(()=>{const n=document.querySelector('[data-canvas-node=source]'),r=n.querySelector('.hy-node-card').getBoundingClientRect(),v=n.querySelector('video');return n.dataset.autoVideo==='true'&&Math.abs(r.width/r.height-v.videoWidth/v.videoHeight)<.02})()"));
  ctx.smoke.check('Video first frame sets default aspect and upscale media fills every edge', await ctx.run(`(()=>{const n=document.querySelector('${node}'),c=n.querySelector('.hy-node-card').getBoundingClientRect(),v=n.querySelector('video'),r=v.getBoundingClientRect();return Math.abs(c.width/c.height-v.videoWidth/v.videoHeight)<.02&&Math.abs(c.x-r.x)<=1&&Math.abs(c.y-r.y)<=1&&Math.abs(c.right-r.right)<=1&&Math.abs(c.bottom-r.bottom)<=1&&getComputedStyle(v).objectFit==='cover'})()`));
  await ctx.pointer(`${node} header>svg`);
  const before = await resize.geometry(ctx, node);
  await resize.drag(ctx, `${node} .react-flow__resize-control.handle.bottom.right`, 60, 40, false, node);
  const after = await resize.geometry(ctx, node);
  ctx.smoke.check('Upscale uses the image corner resizer and keeps full media coverage', after.w > before.w + 50 && after.h > before.h + 30 && await ctx.run(`(()=>{const n=document.querySelector('${node}'),v=n.querySelector('video').getBoundingClientRect(),c=n.querySelector('.hy-node-card').getBoundingClientRect();return n.dataset.card==='custom'&&Math.abs(v.height-c.height)<=2&&Math.abs(v.width-c.width)<=2})()`));
  await ctx.key('z', ['control']);
  ctx.smoke.check('Undo returns to first-frame aspect', Math.abs((await resize.geometry(ctx, node)).w - before.w) < 2);
  await ctx.key('y', ['control']);
  ctx.smoke.check('Redo restores manual upscale size', Math.abs((await resize.geometry(ctx, node)).w - after.w) < 2);
  await ctx.shot('93-seedvr2-video-full-card-dark');
}

/** 手动尺寸通过原工程重开恢复，首次解码不得把已保存的相框换回默认比例。 */
async function checkSavedVideoCard(ctx, document) {
  const card = document.nodes.find(node => node.id === 'target').data.card;
  await restore(ctx, document);
  await ctx.wait("document.querySelector('[data-canvas-node=target] [data-media-status=ready]')");
  ctx.smoke.check('Reopening keeps manual video size instead of first-frame default', await ctx.run(`(()=>{const n=document.querySelector('[data-canvas-node=target]');return n.dataset.autoVideo==='false'&&n.style.width==='${card.width}px'&&n.style.getPropertyValue('--canvas-card-height')==='${card.height}px'})()`));
  await require('./check-minimax-image-edit').changeTheme(ctx, 'light');
  await ctx.wait("!document.documentElement.classList.contains('theme-ripple')");
  ctx.smoke.check('Light upscale result has no header or footer gaps', await ctx.run("(()=>{const n=document.querySelector('[data-canvas-node=target]'),v=n.querySelector('video').getBoundingClientRect(),c=n.querySelector('.hy-node-card').getBoundingClientRect();return Math.abs(v.y-c.y)<=1&&Math.abs(v.bottom-c.bottom)<=1})()"));
  await ctx.shot('94-seedvr2-video-full-card-light');
  await ctx.click('[data-canvas-node=target] [data-canvas-parameter=upscale-settings] > button');
  await ctx.wait("document.querySelector('[data-upscale-settings]')");
  ctx.smoke.check('Result settings remain usable and media keeps card corners while popup is open', await ctx.run("(()=>{const n=document.querySelector('[data-canvas-node=target]'),p=n.querySelector('[data-canvas-upscale-card] > div:nth-child(2)');return getComputedStyle(p).borderTopLeftRadius===getComputedStyle(n.querySelector('.hy-node-card')).borderTopLeftRadius&&!!n.querySelector('[data-upscale-settings] button')})()"));
  ctx.smoke.check('Light settings labels keep their theme color over video', await ctx.run("(()=>{const p=document.querySelector('[data-upscale-settings]');return getComputedStyle(p.querySelector('[data-upscale-batch-frames] span')).color===getComputedStyle(p.querySelector(':scope > small')).color})()"));
  await ctx.shot('95-seedvr2-result-settings-light');
  await ctx.key('Escape');
  await require('./check-minimax-image-edit').changeTheme(ctx, 'dark');
}

/** 第一段挂起时停止，必须走正式取消链；下一次启用从完整视频重新开始。 */
async function checkVideoCancel(ctx, state, source) {
  state.holdUpscale = true;
  const before = state.requests.length;
  await ctx.click('[data-canvas-upscale-card] > div:last-child > button');
  await waitRequest(state, before);
  await ctx.click('[data-canvas-node=target] [data-canvas-node-loading] button');
  await ctx.wait("!document.querySelector('[data-canvas-node-loading]')");
  const request = state.requests.at(-1);
  ctx.smoke.check("Video cancellation stops first remote batch and preserves source", state.requests.length === before + 1 && request.cancelled && fs.existsSync(source));
  state.holdUpscale = false;
}

async function checkPadding(ctx) {
  await restore(ctx, await save(ctx));
  await ctx.click('[data-canvas-node=target] [data-canvas-workflow] .hy-chip');
  await ctx.click('[data-assistant-item=local]');
  await ctx.click('[data-assistant-item=minimax-image-series]');
  await ctx.click('[data-assistant-item=minimax-image-edit]');
  await ctx.click('[data-canvas-node=target] .hy-panel-submit [data-canvas-workflow] button');
  await ctx.wait("document.querySelector('.hy-image-sidebar [data-minimax-image-settings]')");
  ctx.smoke.check("Canvas H3 settings have balanced left and right padding", await ctx.run("(()=>{const a=document.querySelector('.hy-image-sidebar-body').getBoundingClientRect(),b=document.querySelector('.hy-image-sidebar [data-minimax-image-settings]').getBoundingClientRect();return b.left-a.left>=12&&a.right-b.right>=12&&Math.abs((b.left-a.left)-(a.right-b.right))<2})()"));
  await ctx.shot("94-h3-settings-padding");
  await require("./check-minimax-image-edit").changeTheme(ctx, "light");
  ctx.win.setSize(760, 820);
  // 窗口调整经跨进程通知生效，先等实际视口和容器重排，不能读上一帧的大窗口坐标。
  await ctx.wait("innerWidth<=760&&(()=>{const a=document.querySelector('.hy-image-sidebar').getBoundingClientRect();return a.left>=0&&a.right<=innerWidth+1})()");
  ctx.smoke.check("Light narrow H3 sidebar stays inside viewport", await ctx.run("(()=>{const a=document.querySelector('.hy-image-sidebar').getBoundingClientRect();return a.left>=0&&a.right<=innerWidth+1})()"));
  await ctx.shot("95-h3-settings-padding-light-narrow");
  ctx.win.setSize(1600, 1000);
  await require("./check-minimax-image-edit").changeTheme(ctx, "dark");
  await ctx.click('.hy-image-sidebar header button');
}

/** 创作页仍挂载原H3表单；只启用新增公共开关，验证相同队列的第二次请求。 */
async function checkCreateUpscale(ctx, state) {
  await require("./check-minimax-image-edit").checkCreate(ctx, state);
  // 先展开高级设置，测试沿用用户可见的入口。
  const advanced = "[data-anima-form] [data-advanced-settings-toggle]";
  if (await ctx.run(`document.querySelector(${JSON.stringify(advanced)}).getAttribute('aria-expanded') === 'false'`)) await ctx.click(advanced);
  ctx.smoke.check("Create upscale defaults off", await ctx.run("document.querySelector('[data-anima-form] [data-upscale-options] [role=switch]').getAttribute('aria-checked')==='false'"));
  await ctx.click('[data-anima-form] [data-upscale-options] [role=switch]');
  const before = state.events.length, requests = state.requests.length;
  await ctx.click('[data-anima-run]');
  // 快速夹具可能在轮询前已完成；等两个真实请求，不要求短暂的停止按钮必然被采到。
  await waitRequest(state, requests + 1);
  await ctx.wait("!document.querySelector('[data-anima-run]').disabled&&!document.querySelector('[data-anima-stop]')");
  ctx.smoke.check("Create generation invokes separate upscale request", state.events.slice(before).map(item => item.type).join(",") === "prompt,free,prompt");
  ctx.smoke.check("Create still saves to its own gallery", galleryFiles(ctx).filter(name => name.endsWith(".png")).length >= 2);
  await ctx.shot("93-seedvr2-create-dark-narrow-http-fixture");
}

async function checkSeedvr2(ctx, state) {
  await ctx.add("image", 200, 200);
  await save(ctx);
  await checkNode(ctx, state);
  await checkSequence(ctx, state);
  await checkPadding(ctx);
  await checkVideo(ctx, state);
  await checkCreateUpscale(ctx, state);
  console.log("SEEDVR2_EVIDENCE", { automaticEvents: true, prompts: state.requests.length, freeRequests: state.events.filter(item => item.type === "free").length, realInference: false, manual: false });
}
module.exports = { checkSeedvr2 };

/** 实际点开公共浮层，验证图像参数保存后进入请求，不直接改节点store。 */
async function checkImageSettings(ctx) {
  await ctx.click('[data-canvas-parameter=upscale-settings] > button');
  await ctx.wait("document.querySelector('[data-upscale-settings]')");
  ctx.smoke.check("Image settings offer every integer scale 2 through 8 and hide video frames", await ctx.run("document.querySelectorAll('[data-upscale-settings] [aria-label=放大倍数] button').length===7&&!document.querySelector('[data-upscale-batch-frames]')"));
  await ctx.click('[data-upscale-settings] button[aria-label="SeedVR2 3B"]');
  await ctx.click('[data-upscale-settings] button[aria-label="×3"]');
  await ctx.click('[data-upscale-settings] button[aria-label="固定"]');
  await ctx.fill('[data-upscale-settings] input[aria-label="固定种子"]', '123');
  await ctx.shot('99-upscale-image-settings-dark');
  // fill为确认参数主动失焦；重新聚焦实际输入，才是在测试控件收到Escape。
  await ctx.run(`document.querySelector('[data-upscale-settings] input').focus()`);
  await ctx.key('Escape');
  ctx.smoke.check("Escape closes settings and restores its icon focus", await ctx.run("!document.querySelector('[data-upscale-settings]')&&document.activeElement.closest('[data-canvas-parameter=upscale-settings]')!==null"));
}

/** 帧数沿用时长选择条的自定义输入；跨主题和窄窗口验证真实命中范围。 */
async function checkVideoSettings(ctx) {
  await ctx.click('[data-canvas-parameter=upscale-settings] > button');
  await ctx.click('[data-upscale-batch-frames] button[aria-label="自定义"]');
  await ctx.fill('[data-upscale-batch-frames] input', '20');
  ctx.smoke.check("Custom twenty frames confirm without closing the settings panel", await ctx.run(`!!document.querySelector('[data-upscale-settings]')&&document.querySelector('[data-upscale-batch-frames] button[aria-label="20"]').getAttribute('aria-pressed')==='true'`));
  await ctx.shot('97-upscale-video-settings-dark');
  await require('./check-minimax-image-edit').changeTheme(ctx, 'light');
  ctx.win.setSize(760, 820);
  await ctx.wait("innerWidth<=760");
  await ctx.wait("!document.documentElement.classList.contains('theme-ripple')&&(()=>{const c=document.querySelector('[data-upscale-settings] button[aria-label=\"×8\"]'),a=c.getBoundingClientRect();return c.contains(document.elementFromPoint(a.x+a.width/2,a.y+a.height/2))})()");
  ctx.smoke.check("Light narrow popup stays within canvas with a visible scale hit target", await ctx.run("(()=>{const e=document.querySelector('[data-upscale-settings]'),r=e.getBoundingClientRect(),b=document.querySelector('[data-infinite-canvas]').getBoundingClientRect();const c=e.querySelector('button[aria-label=\"×8\"]'),a=c.getBoundingClientRect();return r.left>=b.left&&r.right<=b.right&&r.top>=b.top&&r.bottom<=b.bottom&&c.contains(document.elementFromPoint(a.x+a.width/2,a.y+a.height/2))})()"));
  await ctx.shot('98-upscale-video-settings-light-narrow');
  await ctx.key('Escape');
  ctx.win.setSize(1600, 1000);
  await require('./check-minimax-image-edit').changeTheme(ctx, 'dark');
}

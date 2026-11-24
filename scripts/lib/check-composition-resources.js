/** 合成台资源回归：真实静态页面、素材库、文件写入和SQLite；只替换系统保存框选择。 */
const fs = require('node:fs');
const path = require('node:path');
const { dialog } = require('electron');
const library = require('./canvas-library-fixture');
const fixture = path.join(__dirname, '../fixtures/video-composition');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const inner = (ctx, expression) => ctx.run(`(()=>{const document=window.document.querySelector('[data-original-composition]').contentDocument;return (${expression})})()`);

async function iw(ctx, expression) {
  for (let i = 0; i < 150; i++) { if (await inner(ctx, expression)) return; await delay(60); }
  throw Error(`Composition condition timed out: ${expression}`);
}
async function button(ctx, text) {
  await iw(ctx, `[...document.querySelectorAll('button')].some(item=>item.textContent.trim()===${JSON.stringify(text)})`);
  await inner(ctx, `[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===${JSON.stringify(text)}).click()`);
}
async function picker(ctx) {
  await button(ctx, '从素材库添加');
  await ctx.wait("!!document.querySelector('[data-composition-resource-picker] [data-canvas-resources]')&&document.querySelector('[data-composition-resource-picker] footer button')?.disabled===false");
}
async function outerButton(ctx, text) {
  await ctx.run(`[...document.querySelectorAll('[data-composition-resource-picker] button')].find(item=>item.textContent.trim()===${JSON.stringify(text)}).click()`);
}
async function save(ctx) {
  await button(ctx, '保存');
  await iw(ctx, "document.querySelector('.vcd-save-status')?.dataset.hostStatus==='本地草稿已保存'");
  return library.readCanvas(ctx);
}
async function reload(ctx) {
  await new Promise(resolve => { ctx.win.webContents.once('did-finish-load', resolve); ctx.win.webContents.reload(); });
  await library.openProject(ctx);
  await ctx.run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
}
async function open(ctx) {
  await ctx.wait("!!document.querySelector('[data-canvas-node=compositor] .hy-open-composer')");
  await ctx.click('[data-canvas-node=compositor] .hy-open-composer');
  await ctx.wait("!!document.querySelector('[data-composition-state=ready]')");
  await iw(ctx, "!!document.querySelector('.vcd-header')");
}
// 同时量 iframe 内外的边界，外框铺满但合成台仍有留白也会失败。
async function checkMainBounds(ctx) {
  const original = ctx.win.getContentSize();
  const fillsMain = `(() => {
    const frame = document.querySelector('[data-original-composition]');
    const main = document.querySelector('[data-app-main]').getBoundingClientRect();
    const host = frame.getBoundingClientRect();
    const editor = frame.contentDocument.querySelector('.vcd-dialog').getBoundingClientRect();
    const close = (a, b) => Math.abs(a - b) < 1;
    return close(host.left, main.left) && close(host.top, main.top)
      && close(host.right, main.right) && close(host.bottom, main.bottom)
      && close(editor.left, 0) && close(editor.top, 0)
      && close(editor.width, host.width) && close(editor.height, host.height);
  })()`;
  await ctx.wait(fillsMain);
  ctx.win.setContentSize(1080, 740);
  await ctx.wait(`window.innerWidth < ${original[0]} && (${fillsMain})`);
  ctx.smoke.check('Composition fills the app main on desktop and after resizing', !ctx.win.isFullScreen());
  ctx.win.setContentSize(...original);
  await ctx.wait(`window.innerWidth >= ${original[0]} && (${fillsMain})`);
}

async function prepare(ctx) {
  const document = library.readCanvas(ctx);
  const files = ['image.png','video.mp4','audio.wav'].map((name,i)=>({ kind:['image','video','audio'][i],name,path:path.join(fixture,name),size:fs.statSync(path.join(fixture,name)).size }));
  const result = await ctx.run(`window.electronAPI.canvasImportMedia(${JSON.stringify({name:document.name,workspace:document.workspace,files,mode:'copy'})})`);
  if (!result.success) throw Error('composition-smoke-import-failed');
  const node = { id:'compositor',position:{x:300,y:200},data:{kind:'composition',title:'Composition',prompt:'',content:'',ratio:'16/9'} };
  await library.writeCanvas(ctx, {...document,nodes:[node],edges:[]});
  await reload(ctx); await open(ctx);
  return result.data.media;
}

/** 工程选择只改合成素材列表，不复制同一文件，也不添加画布节点和边。 */
async function checkProject(ctx, media) {
  await picker(ctx);
  ctx.smoke.check('Shared picker keeps iframe mounted and inert', await ctx.run("document.querySelector('[data-original-composition]').inert===true"));
  await outerButton(ctx, '全选');
  await outerButton(ctx, '使用素材');
  await ctx.wait("!document.querySelector('[data-composition-resource-picker]')");
  await iw(ctx, "document.querySelectorAll('.vcd-material').length===3");
  const saved = await save(ctx), assets = saved.nodes[0].data.composition.assets;
  ctx.smoke.check('Project selection reuses all three original paths without canvas nodes or edges', saved.nodes.length===1 && saved.edges.length===0 && assets.length===3 && assets.every(asset=>media.some(item=>item.path===asset.media.path)));
  await picker(ctx); await outerButton(ctx, '关闭');
  await ctx.wait("!document.querySelector('[data-composition-resource-picker]')");
  ctx.smoke.check('Cancelling picker retains original materials and releases iframe', await inner(ctx,"document.querySelectorAll('.vcd-material').length===3") && await ctx.run("!document.querySelector('[data-original-composition]').inert"));
}

/** 全局库原件保留，工程有独立副本；本地文件使用同一复制接口，不当成合成成片。 */
async function checkOtherSources(ctx) {
  const source = path.join(fixture,'image.png');
  await ctx.run(`window.electronAPI.canvasLibrary(${JSON.stringify({operation:'importLibraryResources',files:[{kind:'image',name:'global.png',path:source,size:fs.statSync(source).size}]})})`);
  await picker(ctx); await outerButton(ctx,'全局资源库');
  await ctx.wait("document.querySelector('[data-resource-scope=library]')&&document.querySelector('[data-composition-resource-picker] footer button')?.disabled===false");
  await outerButton(ctx,'全选'); await outerButton(ctx,'使用素材');
  await iw(ctx,"document.querySelectorAll('.vcd-material').length===4");
  let saved = await save(ctx);
  ctx.smoke.check('Global source is copied into current project', saved.nodes[0].data.composition.assets.at(-1).media.path.includes(path.sep+'Picture'+path.sep));
  await picker(ctx);
  const remote = await ctx.win.webContents.debugger.sendCommand('Runtime.evaluate',{expression:"document.querySelector('[data-composition-local-input]')"});
  await ctx.win.webContents.debugger.sendCommand('DOM.setFileInputFiles',{objectId:remote.result.objectId,files:[source]});
  await iw(ctx,"document.querySelectorAll('.vcd-material').length===5");
  saved = await save(ctx);
  ctx.smoke.check('Local import adds managed source without composition prefix',saved.nodes.length===1&&saved.nodes[0].data.composition.assets.length===5&&saved.nodes[0].data.composition.assets.every(asset=>fs.existsSync(asset.media.path)&&!asset.media.path.includes(path.sep+'Composition'+path.sep)));
  await ctx.shot('composition-shared-resources');
}

/** 保存框是唯一替身；正文通过正式IPC写入，取消/失败不能污染工程或截断旧成片。 */
async function checkOutputStorage(ctx) {
  const current = library.readCanvas(ctx);
  const root = path.join(path.dirname(ctx.documentPath),'user','Infinite Canvas');
  const project = path.join(root,current.workspace.folder);
  const files = () => fs.readdirSync(project,{recursive:true}).map(String).sort();
  const before = files(), output = path.join(ctx.root,'local-output.mp4');
  const original = dialog.showSaveDialog;
  const request = {name:current.name,workspace:current.workspace,fileName:'composition.mp4',kind:'video',bytes:[1,2,3],download:true};
  const send = patch => ctx.run(`window.electronAPI.canvasCompositionMedia({...${JSON.stringify({...request,...patch})},bytes:new Uint8Array([1,2,3])})`);
  try {
    dialog.showSaveDialog = async()=>({canceled:true,filePath:''});
    const cancel = await send({});
    ctx.smoke.check('Cancel export makes no project files',cancel.success&&cancel.data===null&&JSON.stringify(files())===JSON.stringify(before));
    dialog.showSaveDialog = async()=>({canceled:false,filePath:output});
    const exported = await send({});
    ctx.smoke.check('Local export writes chosen file without allocating a project copy',exported.success&&exported.data.downloaded===true&&fs.readFileSync(output).equals(Buffer.from([1,2,3]))&&JSON.stringify(files())===JSON.stringify(before));
    dialog.showSaveDialog = async()=>({canceled:false,filePath:path.join(ctx.root,'missing','out.mp4')});
    const failed = await send({});
    ctx.smoke.check('Failed export preserves prior output and project',!failed.success&&fs.readFileSync(output).equals(Buffer.from([1,2,3]))&&JSON.stringify(files())===JSON.stringify(before));
    const stored = await send({download:false});
    ctx.smoke.check('Canvas output gets separate Composition/video directory',stored.success&&stored.data.media.path.includes(path.sep+'Composition'+path.sep+'video'+path.sep)&&fs.existsSync(stored.data.media.path));
    return stored.data.media;
  } finally { dialog.showSaveDialog=original; }
}

/** 新目录也走原台账：被引用时保留，关闭后无引用才回收，并可恢复回原目录。 */
async function checkLifecycle(ctx, media) {
  const document = library.readCanvas(ctx);
  await inner(ctx,"document.querySelector('[data-tip=关闭]').click()");
  await ctx.wait("!document.querySelector('[data-original-composition]')");
  const base = path.join(path.dirname(ctx.documentPath),'user');
  const service = require('../../apps/electron/src/main/modules/canvas/canvas-library').createCanvasLibrary(base);
  const listing = await service.request({operation:'list'}), id = listing.entries[0].id;
  await service.request({operation:'load',id});
  const result = {id:'result',position:{x:600,y:200},data:{kind:'video',title:'Result',prompt:'',content:'',ratio:'16/9',media}};
  await service.request({operation:'save',id,document:{...document,nodes:[...document.nodes,result]}});
  await service.request({operation:'close',id}); await service.sweep();
  ctx.smoke.check('Referenced compositor output survives collection',fs.existsSync(media.path));
  await service.request({operation:'load',id});
  await service.request({operation:'save',id,document});
  await service.request({operation:'close',id}); await service.sweep();
  const ledger = require('../../apps/electron/src/main/modules/canvas/resource-ledger');
  const rows = await ledger.database(service.root,client=>ledger.select(client,'resource.all'));
  const row = rows.find(item=>item.relative_path.endsWith(path.basename(media.path)));
  ctx.smoke.check('Unused compositor output enters original trash lifecycle',row.state==='trashed'&&!fs.existsSync(media.path));
  await service.request({operation:'restoreResource',id,workspace:document.workspace,resourceId:row.resource_id});
  ctx.smoke.check('Restore returns output to original Composition/video path',fs.existsSync(media.path));
  await checkExpiry(ctx,service,id,document,media,row.resource_id);
}
async function checkExpiry(ctx, service, id, document, media, resourceId) {
  const manual = path.join(path.dirname(media.path), 'manual-unknown.mp4');
  fs.writeFileSync(manual, 'unknown ownership');
  await service.request({operation:'retainResource',id,workspace:document.workspace,resourceId,retained:false});
  await service.sweep(); await service.sweep(Date.now()+86400001);
  ctx.smoke.check('Expiry removes only managed output and preserves unknown files and composition sources',!fs.existsSync(media.path)&&fs.existsSync(manual)&&document.nodes[0].data.composition.assets.every(asset=>fs.existsSync(asset.media.path)));
}
async function checkCompositionResources(ctx) {
  const media = await prepare(ctx);
  await checkMainBounds(ctx);
  await checkProject(ctx,media);
  await checkOtherSources(ctx);
  const output = await checkOutputStorage(ctx);
  await checkLifecycle(ctx,output);
}
module.exports = {checkCompositionResources};

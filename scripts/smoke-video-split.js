/** Real quick-tools regression: equal 2/N parts, output duration/content, no overwrite, narrow layout and cancellation. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { app, BrowserWindow, dialog } = require("electron");
const { registerAppProtocol } = require("../apps/electron/appProtocol");
const { registerVideoToolIpc } = require("../apps/electron/ffmpeg");
const { registerHandle } = require("../apps/electron/ipcHandlers");
const { probeVideo } = require("../apps/electron/ffmpeg/probe");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "video-split", timeoutMs: 120000 });
smoke.installWatchdog(app);
const work = fs.mkdtempSync(path.join(os.tmpdir(), "ir-video-split-"));
smoke.setWorkDir(work);
const profile = path.join(work, "profile");
fs.mkdirSync(profile); app.setPath("userData", profile); app.disableHardwareAcceleration();
const ffmpeg = path.resolve(__dirname, "../apps/electron/bin/ffmpeg/ffmpeg.exe");
const ffprobe = path.resolve(__dirname, "../apps/electron/bin/ffmpeg/ffprobe.exe");
const source = path.join(work, "five-seconds.mp4");
const documentPath = path.join(work, "user.json");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let userDocument = { version: 1, userDataPath: documentPath, videoTool: { ffmpegPath: ffmpeg, outputFolder: work } };
registerAppProtocol(); registerVideoToolIpc();
registerHandle("userData:read", () => ({ filePath: documentPath, data: userDocument, isNew: false }));
registerHandle("userData:write", (_event, data) => { userDocument = data; return { filePath: documentPath, data }; });
registerHandle("userData:getDefaultPath", () => documentPath);
registerHandle("theme:setThemeSource", () => null);
registerHandle("models:downloadList", () => []);
registerHandle("changelog:read", () => "");
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });

async function waitFor(run, condition, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await run(`Boolean(${condition})`)) return;
    await delay(80);
  }
  throw new Error(`Timed out: ${label}`);
}

async function click(run, selector) {
  await run(`(() => { const button=document.querySelector(${JSON.stringify(selector)});
    if (!button || button.disabled) throw new Error('Missing or disabled button'); button.click(); return true; })()`);
  await delay(100);
}

async function setParts(run, value) {
  await run(`(() => { const input=document.querySelector('[aria-label="切分份数"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
  await delay(120);
}

async function verifyFiles(parts, suffix = "") {
  for (let index = 0; index < parts; index += 1) {
    const file=path.join(work, `five-seconds_part_${String(index+1).padStart(2,"0")}_of_${parts}${suffix}.mp4`);
    const info=await probeVideo(ffprobe,file);
    assert.ok(Math.abs(info.duration-5/parts)<0.12,`Unexpected duration ${info.duration}`);
    assert.equal(info.width,160); assert.equal(info.height,120); assert.equal(info.hasAudio,true);
    const pixel=execFileSync(ffmpeg,["-v","error","-ss","0.15","-i",file,"-frames:v","1","-vf","scale=1:1",
      "-pix_fmt","rgb24","-f","rawvideo","pipe:1"],{windowsHide:true,timeout:10000});
    const blue=index*5/parts+0.15>=2.5;
    assert.ok(blue ? pixel[2]>200 && pixel[0]<30 : pixel[0]>200 && pixel[2]<30);
  }
}

async function exportParts(run, parts, suffix = "") {
  await setParts(run,parts);
  await click(run,'[data-testid="video-split-run"]');
  await waitFor(run,`document.querySelector('[data-video-quick-panel]').innerText.includes('已保存 ${parts} 份视频') &&
    document.querySelector('[data-testid="video-split-run"]').textContent.includes('导出')`,"split completion");
  await verifyFiles(parts,suffix);
  smoke.check(`${parts} independent exports have equal durations, correct source frames and original audio/resolution${suffix}`,true);
}

async function verifyControls(run, win) {
  for (const value of [1,2.5,9999,""]) {
    await setParts(run,value);
    assert.equal(await run(`document.querySelector('[data-testid="video-split-run"]').disabled`),true);
  }
  await setParts(run,3);
  await click(run,'[data-video-quick-panel] [aria-label="关闭"]');
  await click(run,'[aria-label="快捷功能"]');
  assert.equal(await run(`document.querySelector('[aria-label="切分份数"]').value`),"3");
  await click(run,'[role="tab"]:last-child');
  assert.equal(await run(`document.querySelector('[role="tab"]:last-child').getAttribute('aria-selected')`),"true");
  await click(run,'[role="tab"]:first-child');
  win.setSize(480,800);
  await waitFor(run,`innerWidth<768`,"narrow viewport");
  const bounds=await run(`(() => {const r=document.querySelector('[data-video-quick-panel]').getBoundingClientRect();
    return {left:r.left,right:r.right,width:innerWidth,scroll:document.documentElement.scrollWidth};})()`);
  assert.ok(bounds.left>=0 && bounds.right<=bounds.width && bounds.scroll<=bounds.width+1,JSON.stringify(bounds));
  const colors=await run(`(() => {const root=document.documentElement;
    const before=getComputedStyle(document.querySelector('[data-video-quick-panel]')).backgroundColor;
    root.style.setProperty('--background','#18181b');
    const after=getComputedStyle(document.querySelector('[data-video-quick-panel]')).backgroundColor;
    root.style.removeProperty('--background'); return {before,after};})()`);
  assert.notEqual(colors.before,colors.after);
  smoke.check("Invalid N rejected; collapsing keeps settings; frame tab switches; narrow floating panel fits and follows theme",true);
}

async function verifyCancellation(run) {
  await setParts(run,50);
  await run(`(() => {document.querySelector('[data-testid="video-split-run"]').click();return true;})()`);
  await waitFor(run,`document.querySelector('[data-testid="video-split-run"]').textContent.trim()==='取消'`,"running batch");
  await click(run,'[data-testid="video-split-run"]');
  await waitFor(run,`document.querySelector('[data-testid="video-split-run"]').textContent.includes('导出')`,"cancel settles");
  const count=()=>fs.readdirSync(work).filter(name=>name.includes('_of_50')).length;
  const before=count(); await delay(500);
  assert.equal(count(),before); assert.ok(before<50);
  assert.equal(await run(`document.querySelector('fieldset').disabled`),false);
  smoke.check("Cancelling the batch stops subsequent files and re-enables editing",true);
}

async function main() {
  await app.whenReady(); smoke.assertBuildFresh({app});
  execFileSync(ffmpeg,["-v","error","-f","lavfi","-i","color=c=blue:s=160x120:r=30",
    "-f","lavfi","-i","sine=frequency=440:sample_rate=44100","-vf",
    "drawbox=x=0:y=0:w=iw:h=ih:color=red:t=fill:enable='lt(t,2.5)'",
    "-t","5","-c:v","libx264","-g","300","-sc_threshold","0","-c:a","aac",source],{windowsHide:true,timeout:15000});
  const win=new BrowserWindow({width:1600,height:1000,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,
    sandbox:false,backgroundThrottling:false,preload:path.resolve(__dirname,"../apps/electron/preload.js")}});
  smoke.attachWebContents(win.webContents); await smoke.hardenWindow(win);
  await win.loadURL("app://app/tools/video/editor"); const run=smoke.createRun();
  await waitFor(run,`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('点击添加视频片段')&&!b.disabled)`,"hydration");
  await run(`(() => {Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('点击添加视频片段')).click();return true;})()`);
  await waitFor(run,`!!document.querySelector('video') && document.querySelector('video').readyState>=2`,"import");
  await click(run,'[aria-label="快捷功能"]');
  await exportParts(run,2); await exportParts(run,3); await exportParts(run,2," (2)");
  await verifyControls(run,win); await verifyCancellation(run);
  win.destroy(); await smoke.finish({app,ok:true,cleanupDir:work});
}
main().catch(error=>{console.error(error.message);smoke.finish({app,ok:false,error});});

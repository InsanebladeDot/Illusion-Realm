/** Verify user canvas sizes, real lock behavior, export dimensions and backward-compatible drafts. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("../../../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp");
const { startBrowser, pause } = require("./edge-driver.cjs");
const output = path.join(__dirname, "page-size-results");
const checks = [];
let browser;
const evaluate = expression => browser.evaluate(expression);
function check(name, value) { assert.ok(value, name); checks.push(name); console.log("PASS: " + name); }
async function waitFor(expression) {
  for (let i=0;i<120;i++) { if(await evaluate(expression)) return; await pause(100); }
  throw Error("Timed out: " + expression);
}
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(100); }
async function ready() {
  await waitFor("Object.keys(document.querySelector('[data-canvas-dimension]')||{}).some(k=>k.startsWith('__reactProps'))");
  await pause(300);await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='知道了')?.click()");
}
async function reload() {
  await evaluate("window.pageSizeTestBeforeReload=true");await browser.send("Page.reload");
  await waitFor("!window.pageSizeTestBeforeReload");await ready();
}
async function dimension(axis,value) {
  await evaluate(`(()=>{const e=document.querySelector('[data-canvas-dimension=${axis}]');e.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await pause(80); await evaluate(`document.querySelector('[data-canvas-dimension=${axis}]').blur()`);await pause(100);
}
async function save() { await click("[data-save-comic]"); return evaluate("JSON.parse(localStorage.getItem('illusion-realm-comic-template-v1'))"); }
async function captureExport(type) {
  await evaluate(`(()=>{window.exported=null;window.fileName=null;const old=URL.createObjectURL.bind(URL);
    URL.createObjectURL=b=>{if(b.type===${JSON.stringify(type)})window.exported=b;return old(b)};HTMLAnchorElement.prototype.click=function(){window.fileName=this.download};})()`);
  if(type!=='image/png')await click('[data-comic-more] summary');
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(type==='image/png'?'导出 PNG':'导出排版 JSON')}).click()`);
  await waitFor("Boolean(window.exported)");
  if(type==='application/json') return evaluate("window.exported.text().then(JSON.parse)");
  const src=await evaluate("new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(window.exported)})");
  return Buffer.from(src.split(",")[1],"base64");
}
async function screenshot(name,width,height) {
  await browser.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<760});await pause(200);
  await evaluate("(()=>{const p=document.querySelector('[data-comic-view-pin]');if(p?.getBoundingClientRect().width)document.querySelector('[data-comic-view=stage]').click()})()");await pause(150);
  const result=await browser.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
  fs.writeFileSync(path.join(output,name),Buffer.from(result.data,"base64"));
}
async function currentTests() {
  check("Default dimensions are editable",await evaluate("[...document.querySelectorAll('[data-canvas-dimension]')].every(e=>!e.disabled)&&document.querySelector('[data-canvas-size]').textContent.includes('1200')"));
  const before=await save();await dimension("width",960);await dimension("height",640);
  const edited=await save();
  check("Width and height are independent",edited.pageSize.width===960&&edited.pageSize.height===640);
  check("Resizing preserves panel geometry and content",JSON.stringify(edited.panels)===JSON.stringify(before.panels));
  check("Dimensions appear above canvas",await evaluate("document.querySelector('[data-canvas-size]').textContent.includes('960')&&document.querySelector('[data-canvas-size]').textContent.includes('640')"));
  check("Preview follows selected aspect ratio",await evaluate("(()=>{const r=document.querySelector('[data-comic-canvas]').getBoundingClientRect();return Math.abs(r.width/r.height-1.5)<.01})()"));
  await click("[data-lock-canvas]");
  check("Lock disables both inputs",await evaluate("document.querySelector('[data-lock-canvas]').getAttribute('aria-pressed')==='true'&&[...document.querySelectorAll('[data-canvas-dimension]')].every(e=>e.disabled)"));
  await dimension("width",1400);
  check("Disabled inputs cannot mutate canvas dimensions",(await save()).pageSize.width===960);
  await reload();const restored=await save();
  check("Dimensions and lock persist after reload",restored.version===2&&restored.pageSize.width===960&&restored.pageSize.height===640&&restored.pageSize.locked);
  const json=await captureExport("application/json");
  check("Versioned JSON export includes size and lock",json.version===2&&JSON.stringify(json.pageSize)===JSON.stringify(restored.pageSize));
  const png=await captureExport("image/png");const meta=await sharp(png).metadata();
  fs.writeFileSync(path.join(output,"landscape.png"),png);
  check("PNG uses custom resolution while locked",meta.width===960&&meta.height===640);
  check("Export feedback reports actual dimensions",await evaluate("document.body.innerText.includes('960×640')"));
  await screenshot("desktop-locked.png",1440,1000);
}
async function boundsTests() {
  await click("[data-lock-canvas]");await dimension("width",800);await dimension("height",2000);
  check("Unlock reenables independent dimensions",(await save()).pageSize.height===2000);
  await screenshot("mobile.png",390,844);await screenshot("narrow.png",320,640);
  check("320px size controls fit without horizontal overflow",await evaluate("[...document.querySelectorAll('[data-canvas-dimension],[data-lock-canvas],[data-canvas-size]')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})"));
  check("Tall canvas retains full aspect ratio on mobile",await evaluate("(()=>{const r=document.querySelector('[data-comic-canvas]').getBoundingClientRect();return Math.abs(r.width/r.height-.4)<.01})()"));
  await dimension("width",10);check("Minimum dimensions enforced",(await save()).pageSize.width===64);
  await dimension("height",9000);check("Maximum dimensions enforced",(await save()).pageSize.height===4096);
  await dimension("width",1000.7);check("Fractional pixels normalize to integer",(await save()).pageSize.width===1001);
  await dimension("width","");check("Empty input retains last valid size",(await save()).pageSize.width===1001);
  await dimension("width",1200);await dimension("height",1600);
}
async function legacyTests() {
  const current=await save();
  check("Current version round trips dimensions",current.version===2&&current.pageSize.width===1200&&current.pageSize.height===1600);
  const legacy={panels:current.panels,customMode:current.customMode};
  await evaluate(`localStorage.setItem('illusion-realm-comic-template-v1',${JSON.stringify(JSON.stringify(legacy))})`);
  await reload();const restored=await save();
  check("Legacy drafts use default unlocked dimensions",JSON.stringify(restored.pageSize)===JSON.stringify({width:1200,height:1600,locked:false})&&JSON.stringify(restored.panels)===JSON.stringify(current.panels));
  legacy.pageSize={width:1e12,height:NaN,locked:true};
  await evaluate(`localStorage.setItem('illusion-realm-comic-template-v1',${JSON.stringify(JSON.stringify(legacy))})`);
  await reload();
  check("Invalid stored dimensions fall back safely",(await save()).pageSize.width===1200);
}
async function main() {
  fs.mkdirSync(output,{recursive:true});browser=await startBrowser();
  await browser.send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await browser.send("Page.navigate",{url:"http://localhost:3000/comic"});await ready();
  await currentTests();await boundsTests();await legacyTests();
  fs.writeFileSync(path.join(output,"verification.json"),JSON.stringify({status:"passed",checks},null,2));
}
main().catch(async error=>{console.error(error);process.exitCode=1;if(browser)console.error(await evaluate("document.body.innerText.slice(-1000)").catch(()=>"Browser unavailable"));})
  .finally(async()=>{if(browser)await browser.close();});

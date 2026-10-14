/** Exercise the actual template library, geometry, mobile layout, draft persistence and tool entries. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("../../../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp");
const { startBrowser, pause } = require("./edge-driver.cjs");
const output = path.join(__dirname, "template-results");
const checks = [];
let browser;
const evaluate = expression => browser.evaluate(expression);
function check(name, value) { assert.ok(value, name); checks.push(name); console.log("PASS: " + name); }
async function waitFor(expression) {
  for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await pause(100); }
  throw Error("Timed out: " + expression);
}
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(80); }
async function clickText(text) { await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)}).click()`); await pause(80); }
async function ready() {
  await waitFor("Object.keys(document.getElementById('comic-title')||{}).some(k=>k.startsWith('__reactProps'))");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='知道了')?.click()");
  await evaluate("(()=>{const p=document.querySelector('[data-comic-view-pin]');if(p?.getBoundingClientRect().width)document.querySelector('[data-comic-view=stage]').click()})()");
  await pause(300);
}
async function screenshot(name, width, height) {
  await browser.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 760 });
  await pause(200);
  await evaluate("(()=>{const p=document.querySelector('[data-comic-view-pin]');if(p?.getBoundingClientRect().width&&!document.querySelector('dialog'))document.querySelector('[data-comic-view=stage]').click()})()");await pause(150);
  const shot = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(output, name), Buffer.from(shot.data, "base64"));
}
async function draft() { await click("[data-save-comic]"); return evaluate("JSON.parse(localStorage.getItem('illusion-realm-comic-template-v1'))"); }
async function open() {
  if(await evaluate("document.querySelector('[data-open-templates]').getBoundingClientRect().width===0")) {
    await click('[data-comic-view=side]');await click('[data-comic-pane=side] button');
  } else await click('[data-open-templates]');
  await waitFor("document.querySelector('dialog')?.open");
}
async function apply(id) {
  await click(`[data-template-id="${id}"]`); await click("[data-apply-template]");
  if (await evaluate("Boolean(document.querySelector('dialog [role=alert]'))")) await click("[data-apply-template]");
  await waitFor("!document.querySelector('dialog')");
}
function cross(a, b, c) { return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x); }
function geometryValid(panel) {
  const p = panel.vertices;
  if (panel.x<0 || panel.y<0 || panel.x+panel.width>100.001 || panel.y+panel.height>100.001 || panel.width<8 || panel.height<8) return false;
  if (p.length<3 || p.some(v=>!Number.isFinite(v.x+v.y) || v.x<0 || v.y<0 || v.x>100.001 || v.y>100.001)) return false;
  const area = p.reduce((sum, v, i)=>sum+v.x*p[(i+1)%p.length].y-v.y*p[(i+1)%p.length].x,0);
  if (Math.abs(area)<1) return false;
  for(let i=0;i<p.length;i++) for(let j=i+2;j<p.length;j++) {
    if(i===0 && j===p.length-1) continue;
    const a=p[i],b=p[(i+1)%p.length],c=p[j],d=p[(j+1)%p.length];
    if(cross(a,b,c)*cross(a,b,d)<-1e-7 && cross(c,d,a)*cross(c,d,b)<-1e-7) return false;
  }
  return true;
}
async function templateTests() {
  await open();
  const ids = await evaluate("[...document.querySelectorAll('[data-template-id]')].map(b=>b.dataset.templateId)");
  check("Library includes 25 unique templates", ids.length===25 && new Set(ids).size===25);
  await waitFor("[...document.querySelectorAll('dialog img')].every(i=>i.complete&&i.naturalWidth===240)");
  const previews = await evaluate("[...document.querySelectorAll('dialog img')].map(i=>i.src)");
  check("All previews are distinct PNG assets", new Set(previews).size===25 && previews.every(src=>src.startsWith("data:image/png;base64,")));
  const preview = await sharp(Buffer.from(previews[0].split(",")[1],"base64")).stats();
  check("Thumbnail contains visible layout pixels", preview.channels[0].min<100 && preview.channels[0].max===255);
  await screenshot("library-desktop.png",1440,1000);
  for(const category of ["regular","dialogue","action","polygon","torn"]) {
    await click(`[data-template-category="${category}"]`);
    check(`${category} category has five layouts`,await evaluate("document.querySelectorAll('[data-template-id]').length===5"));
  }
  await screenshot("library-mobile.png",390,844);
  check("Mobile modal and apply button fit viewport", await evaluate("(()=>{const d=document.querySelector('dialog').getBoundingClientRect(),b=document.querySelector('[data-apply-template]').getBoundingClientRect();return d.left>=0&&d.right<=innerWidth&&d.top>=0&&d.bottom<=innerHeight&&b.right<=innerWidth&&b.bottom<=innerHeight})()"));
  await screenshot("library-narrow.png",320,640);
  check("320px modal has no horizontal overflow", await evaluate("document.querySelector('dialog').scrollWidth===document.querySelector('dialog').clientWidth"));
  await browser.send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await apply("torn-diagonal");
  for (const id of ids) {
    await open(); await apply(id); const value = await draft();
    check(`${id}: editable, bounded, nonintersecting polygons`, value.customMode&&value.panels.every(geometryValid));
  }
}
async function interactionTests() {
  await open(); await apply("regular-9"); const before = await draft();
  await open(); await click('[data-template-id="regular-4"]'); await click("[data-apply-template]");
  check("Fewer panels require confirmation", await evaluate("Boolean(document.querySelector('dialog [role=alert]'))"));
  await clickText("取消"); await click('dialog button[aria-label="关闭"]');
  check("Cancellation retains all content", JSON.stringify((await draft()).panels)===JSON.stringify(before.panels));
  await open(); await apply("regular-4"); const smaller = await draft();
  check("Applying preserves corresponding images and descriptions",smaller.panels.every((p,i)=>p.src===before.panels[i].src&&p.title===before.panels[i].title&&p.description===before.panels[i].description));
  await click('[data-comic-more] summary');await clickText('撤销模板替换');
  check("Undo restores all nine panels and geometry",JSON.stringify((await draft()).panels)===JSON.stringify(before.panels));
  await open(); await apply("torn-diagonal"); const torn = await draft();
  check("Torn overlay covers three base panels with many irregular vertices",torn.panels.length===4&&torn.panels[3].vertices.length===48&&torn.panels.slice(0,3).every(p=>p.y<torn.panels[3].y+torn.panels[3].height&&p.y+p.height>torn.panels[3].y));
  await evaluate("window.templateTestBeforeReload=true");await browser.send("Page.reload");
  await waitFor("!window.templateTestBeforeReload");await ready();
  check("Saved template survives page reload", JSON.stringify((await draft()).panels)===JSON.stringify(torn.panels));
  check("Transparent polygon bounds do not block underlying panel",await evaluate("(()=>{const e=document.querySelector('section [aria-label=\"漫画生成器\"]').getBoundingClientRect();return document.elementFromPoint(e.left+e.width*.055,e.top+e.height*.2)?.getAttribute('alt')===document.getElementById('comic-title').value})()"));
  await evaluate("document.querySelector('[aria-label=resize-panel]').scrollIntoView({block:'center'})");await pause(150);
  const start = await evaluate("(()=>{const e=document.querySelector('[aria-label=resize-panel]').getBoundingClientRect();return{x:e.x+e.width/2,y:e.y+e.height/2}})()");
  await browser.send("Input.dispatchMouseEvent",{type:"mousePressed",x:start.x,y:start.y,button:"left",clickCount:1});
  await browser.send("Input.dispatchMouseEvent",{type:"mouseMoved",x:start.x-20,y:start.y-20,button:"left",buttons:1});
  await browser.send("Input.dispatchMouseEvent",{type:"mouseReleased",x:start.x-20,y:start.y-20,button:"left",clickCount:1});
  await pause(150);
  check("Applied template remains draggable",(await draft()).panels[0].width<torn.panels[0].width);
  await evaluate("window.png=null;const original=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{if(b.type==='image/png')window.png=b;return original(b)};HTMLAnchorElement.prototype.click=function(){}");
  await clickText("导出 PNG"); await waitFor("Boolean(window.png)");
  const png = await evaluate("new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(window.png)})");
  fs.writeFileSync(path.join(output,"torn-export.png"),Buffer.from(png.split(",")[1],"base64"));
  const meta = await sharp(Buffer.from(png.split(",")[1],"base64")).metadata();
  check("Applied torn template exports 1200x1600 PNG",meta.width===1200&&meta.height===1600);
  await screenshot("applied-desktop.png",1440,1000); await screenshot("applied-mobile.png",390,844);
  check("Mobile canvas retains full-page aspect ratio within viewport",await evaluate("(()=>{const e=document.querySelector('[data-comic-canvas]').getBoundingClientRect(),v=document.querySelector('[data-canvas-viewport]').getBoundingClientRect();return Math.abs(e.width/e.height-.75)<.01&&e.width>0&&e.left>=v.left&&e.right<=v.right+.5&&e.top>=v.top&&e.bottom<=v.bottom+.5})()"));
}
async function toolboxTests() {
  await browser.send("Page.navigate",{url:"http://localhost:3000/toolBox"});
  await waitFor("document.querySelector('a[href=\"/comic\"]')&&document.querySelector('a[href=\"/cartoon\"]')");
  check("Both independent comic tools are in toolbox",await evaluate("Boolean(document.querySelector('a[href=\"/comic\"]')&&document.querySelector('a[href=\"/cartoon\"]'))"));
  check("Neither comic tool remains in sidebar",await evaluate("!document.querySelector('nav a[href=\"/comic\"],nav a[href=\"/cartoon\"]')"));
}
async function main() {
  fs.mkdirSync(output,{recursive:true});browser=await startBrowser();
  await browser.send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await browser.send("Page.navigate",{url:"http://localhost:3000/comic"});await ready();
  await click('[data-comic-more] summary');await clickText("恢复模板");await templateTests();await interactionTests();await toolboxTests();
  fs.writeFileSync(path.join(output,"verification.json"),JSON.stringify({status:"passed",checks},null,2));
}
main().catch(async error=>{console.error(error);process.exitCode=1;if(browser){console.error(await evaluate("document.body.innerText.slice(-1200)").catch(()=>"Browser unavailable"));await screenshot("failure.png",1440,1000).catch(()=>{});}})
  .finally(async()=>{if(browser)await browser.close();});

/** Verify the create-page style compact pin, single-pane navigation and retained editing state. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("../../../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp");
const { startBrowser, pause } = require("./edge-driver.cjs");
const output=path.join(__dirname,"compact-view-results"),checks=[];
let browser;
const evaluate=expression=>browser.evaluate(expression);
function check(name,value){assert.ok(value,name);checks.push(name);console.log("PASS: "+name);}
async function waitFor(expression){for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(100);}throw Error("Timed out: "+expression);}
async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await pause(150);}
async function clickText(text){await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)}).click()`);await pause(150);}
async function viewport(width,height){await browser.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<760});await pause(250);}
async function visiblePanes(){return evaluate("[...document.querySelectorAll('[data-comic-pane]')].filter(e=>e.getBoundingClientRect().width>0).map(e=>e.dataset.comicPane)");}
async function only(view){return JSON.stringify(await visiblePanes())===JSON.stringify([view]);}
async function screenshot(name){const result=await browser.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});fs.writeFileSync(path.join(output,name),Buffer.from(result.data,"base64"));}
async function enterTitle(value){
  await evaluate(`(()=>{const e=document.getElementById('comic-title');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(100);
}
async function save(){await click('[data-save-comic]');return evaluate("JSON.parse(localStorage.getItem('illusion-realm-comic-template-v1'))");}
async function checkPin(width){
  check(`${width}px pin has three named modes`,await evaluate("[...document.querySelectorAll('[data-comic-view]')].length===3&&[...document.querySelectorAll('[data-comic-view]')].every(e=>e.getAttribute('aria-label')&&e.title)"));
  check(`${width}px pin does not overlap commands or dimension controls`,await evaluate("(()=>{const p=document.querySelector('[data-comic-view-pin]').getBoundingClientRect();return [...document.querySelectorAll('[data-comic-header] button,[data-canvas-controls] input,[data-canvas-controls] button,[data-canvas-controls] output')].every(e=>{const r=e.getBoundingClientRect();return r.right<=p.left||r.left>=p.right||r.bottom<=p.top||r.top>=p.bottom})})()"));
  check(`${width}px pin remains inside visible workspace`,await evaluate("(()=>{const r=document.querySelector('[data-comic-view-pin]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"));
}
async function compactScreens(){
  for(const [w,h]of [[1279,1000],[1100,900],[950,1080],[390,844],[320,640]]){
    await viewport(w,h);await click('[data-comic-view=side]');
    check(`${w}px only editor is visible`,await only('side'));await checkPin(w);await screenshot(`editor-${w}.png`);
    await click('[data-comic-view=stage]');check(`${w}px only canvas is visible`,await only('stage'));
    check(`${w}px default preview uses fit`,await evaluate("document.querySelector('[data-fit-canvas]').getAttribute('aria-pressed')==='true'"));
    check(`${w}px fit has no horizontal scroll`,await evaluate("(()=>{const v=document.querySelector('[data-canvas-viewport]');return v.scrollWidth===v.clientWidth})()"));
    check(`${w}px pin strip does not overlap active canvas`,await evaluate("(()=>{const p=document.querySelector('[data-comic-view-pin]').getBoundingClientRect(),c=document.querySelector('[data-comic-pane=stage]').getBoundingClientRect();return c.right<=p.left})()"));
    check(`${w}px size controls remain on a single line`,await evaluate("(()=>{const es=[...document.querySelectorAll('[data-canvas-controls] input,[data-canvas-controls] button')];return es.every(e=>Math.abs(e.getBoundingClientRect().top-es[0].getBoundingClientRect().top)<1)})()"));
    check(`${w}px full canvas fits active pane`,await evaluate("(()=>{const c=document.querySelector('[data-comic-canvas]').getBoundingClientRect(),v=document.querySelector('[data-canvas-viewport]').getBoundingClientRect();return c.width>0&&c.height>0&&c.left>=v.left&&c.right<=v.right+.5&&c.top>=v.top&&c.bottom<=v.bottom+.5})()"));
    await screenshot(`canvas-${w}.png`);await click('[data-comic-view=outline]');check(`${w}px only directory is visible`,await only('outline'));
    check(`${w}px every pane stays horizontally in bounds`,await evaluate("[...document.querySelectorAll('[data-comic-pane]')].filter(e=>e.getBoundingClientRect().width>0).every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})"));
  }
}
async function zoomAndMenuTests(){
  await viewport(320,640);await click('[data-comic-view=stage]');const before=await save();
  const scale=await evaluate("document.querySelector('[data-comic-canvas]').getBoundingClientRect().width/1200");
  await click('[data-zoom-in]');
  check("Zoom in changes display scale accurately",await evaluate(`Math.abs(document.querySelector('[data-comic-canvas]').getBoundingClientRect().width/1200-${scale*1.25})<.001`));
  check("Zoom switches from fit to scrollable preview",await evaluate("document.querySelector('[data-fit-canvas]').getAttribute('aria-pressed')==='false'&&getComputedStyle(document.querySelector('[data-canvas-viewport]')).overflowX==='auto'"));
  await click('[data-zoom-out]');
  check("Zoom out returns to the previous display scale",await evaluate(`Math.abs(document.querySelector('[data-comic-canvas]').getBoundingClientRect().width/1200-${scale})<.001`));
  await click('[data-zoom-actual]');check("Actual size displays document pixels one to one",await evaluate("document.querySelector('[data-comic-canvas]').getBoundingClientRect().width===1200"));
  await click('[data-zoom-fit]');
  check("Fit resets zoom without modifying the document",JSON.stringify(await save())===JSON.stringify(before));
  check("Only save, PNG and more are exposed in header",await evaluate("document.querySelectorAll('[data-comic-header] > div > button').length===2&&document.querySelectorAll('[data-comic-header] summary').length===1"));
  await click('[data-comic-more] summary');
  check("More actions fit narrow screen",await evaluate("(()=>{const r=document.querySelector('[data-comic-more] > div').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()"));await screenshot('menu-320.png');
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await pause(100);
  check("Escape closes more and returns focus",await evaluate("!document.querySelector('[data-comic-more]').open&&document.activeElement.matches('[data-comic-more] summary')"));
  await click('[data-comic-more] summary');await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x:12,y:20,button:'left',clickCount:1});await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:12,y:20,button:'left',clickCount:1});await pause(100);
  check("Outside click closes more",await evaluate("!document.querySelector('[data-comic-more]').open"));
}
async function interactionTests(){
  await viewport(950,1080);await click('[data-comic-view=outline]');await click('[data-comic-pane=outline] button:nth-child(3)');
  check("Choosing a panel returns to its editor",await only('side')&&await evaluate("document.getElementById('comic-title').value==='对话特写'"));
  await enterTitle('Retained compact title');const before=await save();
  await click('[data-comic-view=stage]');await click('[data-comic-view=outline]');await click('[data-comic-view=side]');
  check("Switching modes retains input edits",await evaluate("document.getElementById('comic-title').value==='Retained compact title'"));
  check("Mode changes do not alter content or geometry",JSON.stringify((await save()).panels)===JSON.stringify(before.panels));
  await clickText('编辑多边形');check("Polygon editing opens canvas",await only('stage')&&await evaluate("document.querySelectorAll('[aria-label^=vertex-]').length===5"));
  await click('[data-comic-view=side]');await clickText('完成形状编辑');
  await click('[data-comic-view=stage]');check("Finished polygon edit removes handles",await evaluate("document.querySelectorAll('[aria-label^=vertex-]').length===0"));
  await click('[data-comic-view=side]');await click('[data-comic-pane=side] button');await click('[data-template-id=polygon-hexagon]');await click('[data-apply-template]');
  check("Applying template opens canvas",await only('stage')&&await evaluate("!document.querySelector('dialog')"));
  await viewport(1280,1000);check("1280px restores all three panes",(await visiblePanes()).length===3);
  check("Wide mode hides compact pin",await evaluate("document.querySelector('[data-comic-view-pin]').getBoundingClientRect().width===0"));
  await screenshot('wide-1280.png');await viewport(1279,1000);check("Crossing breakpoint restores selected compact view",await only('stage'));
  await viewport(1279,600);await click('[data-comic-view=side]');await evaluate("document.querySelector('[data-comic-pane=side]').scrollTop=500");
  check("Editor can scroll independently",await evaluate("document.querySelector('[data-comic-pane=side]').scrollTop>0"));
  await checkPin(1279);check("Pin remains stationary while editor scrolls",await evaluate("document.querySelector('[data-comic-view-pin]').getBoundingClientRect().top<40"));
}
async function exportTests(){
  await click('[data-comic-view=side]');const before=await save();
  await evaluate("(()=>{window.compactPng=null;const old=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{if(b.type==='image/png')window.compactPng=b;return old(b)};HTMLAnchorElement.prototype.click=function(){};[...document.querySelectorAll('button')].find(b=>b.textContent==='导出 PNG').click()})()");
  await waitFor("Boolean(window.compactPng)");const src=await evaluate("new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(window.compactPng)})");
  const png=Buffer.from(src.split(',')[1],'base64');fs.writeFileSync(path.join(output,'export.png'),png);const meta=await sharp(png).metadata();
  check("Editor-only view exports complete canvas at saved resolution",meta.width===before.pageSize.width&&meta.height===before.pageSize.height);
}
async function main(){
  fs.mkdirSync(output,{recursive:true});browser=await startBrowser();await viewport(950,1080);
  await browser.send("Page.navigate",{url:"http://localhost:3000/comic"});
  await waitFor("Object.keys(document.getElementById('comic-title')||{}).some(k=>k.startsWith('__reactProps'))");await pause(350);
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='知道了')?.click()");
  check("Narrow first visit defaults to editor only",await only('side'));
  check("Hidden views remain mounted",await evaluate("document.querySelectorAll('[data-comic-pane]').length===3"));
  await compactScreens();await zoomAndMenuTests();await interactionTests();await exportTests();
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({status:'passed',checks},null,2));
}
main().catch(async error=>{console.error(error);process.exitCode=1;if(browser){console.error(await evaluate("document.body.innerText.slice(-1000)").catch(()=>"Browser unavailable"));await screenshot('failure.png').catch(()=>{});}}).finally(async()=>{if(browser)await browser.close();});

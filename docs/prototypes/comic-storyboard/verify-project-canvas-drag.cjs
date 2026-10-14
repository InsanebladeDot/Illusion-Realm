/** Real pointer gestures and fit-to-container geometry checks on the comic canvas. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("../../../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp");
const { startBrowser, pause } = require("./edge-driver.cjs");
const output = path.join(__dirname,"canvas-drag-results"), checks=[];
let browser;
const evaluate=expression=>browser.evaluate(expression);
function check(name,value){assert.ok(value,name);checks.push(name);console.log("PASS: "+name);}
async function waitFor(expression){for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(100);}throw Error("Timed out: "+expression);}
async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await pause(150);}
async function save(){await click("[data-save-comic]");return evaluate("JSON.parse(localStorage.getItem('illusion-realm-comic-template-v1'))");}
async function dimension(axis,value){
  await evaluate(`(()=>{const e=document.querySelector('[data-canvas-dimension=${axis}]');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await pause(80);await evaluate(`document.querySelector('[data-canvas-dimension=${axis}]').blur()`);await pause(150);
}
async function viewport(width,height){
  await browser.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<760});await pause(250);
  await evaluate("(()=>{const p=document.querySelector('[data-comic-view-pin]');if(p?.getBoundingClientRect().width)document.querySelector('[data-comic-view=stage]').click()})()");await pause(150);
}
async function screenshot(name){const result=await browser.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});fs.writeFileSync(path.join(output,name),Buffer.from(result.data,"base64"));}
const fits="(()=>{const c=document.querySelector('[data-comic-canvas]').getBoundingClientRect(),v=document.querySelector('[data-canvas-viewport]').getBoundingClientRect();return c.width>0&&c.height>0&&c.left>=v.left&&c.right<=v.right+.5&&c.top>=v.top&&c.bottom<=v.bottom+.5})()";
async function drag(axis,dx,dy,touch=false){
  const before=await save();await evaluate(`document.querySelector('[data-resize-page=${axis}]').scrollIntoView({block:'center',inline:'center'})`);await pause(100);
  const point=await evaluate(`(()=>{const b=document.querySelector('[data-resize-page=${axis}]').getBoundingClientRect(),c=document.querySelector('[data-comic-canvas]').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2,scale:c.width/${before.pageSize.width}}})()`);
  if(touch){
    await browser.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:point.x,y:point.y,id:1}]});
    await browser.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:point.x+dx,y:point.y+dy,id:1}]});
    await browser.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  }else{
    await browser.send("Input.dispatchMouseEvent",{type:"mousePressed",x:point.x,y:point.y,button:"left",clickCount:1});
    await browser.send("Input.dispatchMouseEvent",{type:"mouseMoved",x:point.x+dx,y:point.y+dy,button:"left",buttons:1});
    await browser.send("Input.dispatchMouseEvent",{type:"mouseReleased",x:point.x+dx,y:point.y+dy,button:"left",clickCount:1});
  }
  await pause(200);const after=await save();
  const width=axis==='height'?before.pageSize.width:Math.round(before.pageSize.width+dx/point.scale);
  const height=axis==='width'?before.pageSize.height:Math.round(before.pageSize.height+dy/point.scale);
  check(`${touch?'Touch':'Mouse'} ${axis} drag changes actual pixel size`,Math.abs(after.pageSize.width-width)<=1&&Math.abs(after.pageSize.height-height)<=1);
  check(`${axis} drag preserves panel content and geometry`,JSON.stringify(before.panels)===JSON.stringify(after.panels));
  check("Live inputs follow dragged size",await evaluate(`document.querySelector('[data-canvas-dimension=width]').value==='${after.pageSize.width}'&&document.querySelector('[data-canvas-dimension=height]').value==='${after.pageSize.height}'`));
}
async function fitTests(){
  check("Dimension controls are in upper white toolbar",await evaluate("Boolean(document.querySelector('[data-comic-toolbar] [data-canvas-controls]'))&&!document.querySelector('section [data-canvas-controls]')&&getComputedStyle(document.querySelector('[data-comic-toolbar]')).backgroundColor==='rgb(255, 255, 255)'"));
  check("New previews fit by default",await evaluate("document.querySelector('[data-fit-canvas]').getAttribute('aria-pressed')==='true'"));
  await click('[data-fit-canvas]');
  await dimension('width',1500);await dimension('height',2600);const before=await save();
  check("Normal preview can be scrolled",await evaluate("document.querySelector('[data-canvas-viewport]').scrollHeight>document.querySelector('[data-canvas-viewport]').clientHeight"));
  await click('[data-fit-canvas]');check("Fit contains full tall canvas",await evaluate(fits));
  check("Fit only changes preview, not output dimensions",JSON.stringify((await save()).pageSize)===JSON.stringify(before.pageSize));
  check("Fit keeps canvas aspect ratio",await evaluate("(()=>{const r=document.querySelector('[data-comic-canvas]').getBoundingClientRect();return Math.abs(r.width/r.height-1500/2600)<.001})()"));
  await screenshot('desktop-fit.png');
  await drag('width',25,10);await drag('height',10,25);await drag('both',-20,-20);
  await click('[data-lock-canvas]');const locked=await save();
  check("Lock disables manual inputs and removes drag handles",await evaluate("document.querySelectorAll('[data-resize-page]').length===0&&[...document.querySelectorAll('[data-canvas-dimension]')].every(e=>e.disabled)"));
  await click('[data-fit-canvas]');await click('[data-fit-canvas]');
  check("Fit still works when locked without changing dimensions",await evaluate(fits)&&JSON.stringify((await save()).pageSize)===JSON.stringify(locked.pageSize));
  await click('[data-lock-canvas]');
  for(const [w,h]of [[1024,768],[950,768],[390,844],[320,640]]){
    await viewport(w,h);check(`${w}px fit stays inside preview bounds`,await evaluate(fits));
    check(`${w}px white toolbar controls stay within screen`,await evaluate("[...document.querySelectorAll('[data-canvas-controls] input,[data-lock-canvas],[data-fit-canvas]')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})"));
    check(`${w}px stage does not overflow horizontal viewport`,await evaluate("(()=>{const r=document.querySelector('[data-canvas-viewport]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()"));
    check(`${w}px dimension group is centered in toolbar`,await evaluate("(()=>{const c=document.querySelector('[data-canvas-controls]').getBoundingClientRect(),t=document.querySelector('[data-comic-toolbar]').getBoundingClientRect();return Math.abs(c.left+c.width/2-t.left-t.width/2)<1})()"));
    await evaluate("document.querySelector('[data-canvas-viewport]').scrollIntoView({block:'center'})");await screenshot(`fit-${w}.png`);
  }
  await viewport(390,844);await drag('both',-10,-10,true);
  await dimension('width',4000);await dimension('height',128);check("Extreme landscape also fits",await evaluate(fits));
  await viewport(1440,1000);await dimension('width',1500);await dimension('height',900);await screenshot('landscape-fit.png');
}
async function exportTest(){
  const before=await save();await evaluate("(()=>{window.dragPng=null;const old=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{if(b.type==='image/png')window.dragPng=b;return old(b)};HTMLAnchorElement.prototype.click=function(){};[...document.querySelectorAll('button')].find(b=>b.textContent==='导出 PNG').click()})()");
  await waitFor("Boolean(window.dragPng)");const src=await evaluate("new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(window.dragPng)})");
  const png=Buffer.from(src.split(',')[1],'base64');fs.writeFileSync(path.join(output,'custom-size.png'),png);const meta=await sharp(png).metadata();
  check("Fit preview exports full custom resolution",meta.width===before.pageSize.width&&meta.height===before.pageSize.height);
  await click('[data-fit-canvas]');await viewport(390,844);await dimension('width',1200);await dimension('height',1600);
  check("Returning to normal preview restores scrolling",await evaluate("document.querySelector('[data-fit-canvas]').getAttribute('aria-pressed')==='false'&&getComputedStyle(document.querySelector('[data-canvas-viewport]')).overflowY==='auto'"));
}
async function main(){
  fs.mkdirSync(output,{recursive:true});browser=await startBrowser();await viewport(1440,1000);
  await browser.send("Page.navigate",{url:"http://localhost:3000/comic"});
  await waitFor("Object.keys(document.querySelector('[data-fit-canvas]')||{}).some(k=>k.startsWith('__reactProps'))");await pause(350);
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='知道了')?.click()");
  await fitTests();await exportTest();fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({status:'passed',checks},null,2));
}
main().catch(async error=>{console.error(error);process.exitCode=1;if(browser){console.error(await evaluate("document.body.innerText.slice(-1000)").catch(()=>"Browser unavailable"));await screenshot('failure.png').catch(()=>{});}}).finally(async()=>{if(browser)await browser.close();});

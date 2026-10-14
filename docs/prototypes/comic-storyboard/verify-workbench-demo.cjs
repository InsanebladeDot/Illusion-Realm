/** Browser checks for the workbench demo, not the shipped Electron application. */
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const { pathToFileURL } = require("url");
const { startBrowser, pause } = require("./edge-driver.cjs");
const sharp = require("../../../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp");
const output = path.join(__dirname, "workbench-results");
const checks = [];
let browser;
const evaluate = expression => browser.evaluate(expression);
function check(name, value) { assert.ok(value, name); checks.push(name); console.log("PASS: " + name); }
const click = id => evaluate(`document.getElementById('${id}').click()`);
async function ready() {
  for (let i = 0; i < 100; i++) {
    if (await evaluate("Boolean(window.demoReady)")) return;
    await pause(100);
  }
  throw Error("Demo startup timeout");
}
const set = (id, value, event = "change") => evaluate(`document.getElementById('${id}').value=${JSON.stringify(value)}; document.getElementById('${id}').dispatchEvent(new Event('${event}'))`);
async function slider(id, value) { await set(id, value, "input"); await evaluate(`document.getElementById('${id}').dispatchEvent(new Event('change'))`); }

async function interactions() {
  check("Default five-panel page renders without errors", await evaluate("demoTest.state().panels.length === 5 && demoErrors.length === 0"));
  check("Vertical panel spans portrait and dialogue rows", await evaluate("demoTest.frames().b.height > demoTest.frames().c.height + 100 && demoTest.frames().e.y > demoTest.frames().c.y"));
  await click("split-x");
  check("Split retains old panel and creates blank sixth panel", await evaluate("demoTest.state().panels.length === 6 && demoTest.state().panels[0].asset === 'panel-a' && demoTest.state().panels[5].asset === null"));
  await click("merge");
  check("Merge returns to five panels", await evaluate("demoTest.state().panels.length === 5 && demoTest.state().panels[0].archived.length === 1"));
  await click("undo"); check("Undo restores split", await evaluate("demoTest.state().panels.length === 6"));
  await click("redo"); check("Redo restores merge", await evaluate("demoTest.state().panels.length === 5"));
  await evaluate("demoTest.reset()");
  const before = await evaluate("demoTest.frames()");
  await slider("boundary-position", 52);
  const after = await evaluate("demoTest.frames()");
  check("Shared boundary resizes scene and lower subtree together", after.a.height > before.a.height && after.b.y > before.b.y && after.c.y > before.c.y);
  await click("lock-panel"); const locked = await evaluate("JSON.stringify(demoTest.state().tree)");
  await slider("boundary-position", 60);
  check("Locked linked panel rejects boundary edit", locked === await evaluate("JSON.stringify(demoTest.state().tree)"));
  await click("lock-panel");
  await set("template", "balanced"); check("Template preserves all panel descriptions and IDs", await evaluate("demoTest.state().panels.length === 5 && demoTest.state().panels[0].description.includes('营地')"));
  await evaluate("demoTest.reset(); demoTest.select('c')");
  await set("edge", "photo"); await click("new-tear");
  check("Tear changes selected panel only", await evaluate("demoTest.state().panels.find(p=>p.id==='c').edge === 'photo' && demoTest.state().panels.find(p=>p.id==='a').edge === 'straight'"));
  await slider("focus-y", 65); check("Independent crop applies", await evaluate("demoTest.state().panels.find(p=>p.id==='c').focusY === .65"));
  await set("caption", "午后的营地，安静了下来。");
  const pngWithText = await evaluate("document.getElementById('page').toDataURL()");
  await click("move-earlier"); check("Reading order changes without moving frame", await evaluate("demoTest.state().order[1] === 'c' && demoTest.frames().c.x > demoTest.frames().d.x"));
  await click("show-path"); check("Guides excluded from page export", pngWithText === await evaluate("document.getElementById('page').toDataURL()"));
  await evaluate("demoTest.reset()");
  await set("template", "custom");
  check("Custom layout mode snapshots every panel frame", await evaluate("demoTest.state().layoutMode === 'custom' && Object.keys(demoTest.state().customFrames).length === 5"));
  await click("edit-layout");
  const rect = await evaluate("(()=>{const r=document.getElementById('page').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}})()");
  const startX = rect.x + rect.w * .25, startY = rect.y + rect.h * .25;
  await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", x: startX, y: startY, button: "left", buttons: 1 });
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: startX + 20, y: startY + 12, button: "left", buttons: 1 });
  await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: startX + 20, y: startY + 12, button: "left", buttons: 0 });
  const moved = await evaluate("demoTest.state().customFrames.a.x");
  check("Custom layout drag changes selected frame", await evaluate("demoTest.state().customFrames.a.y > 48"));
  await click("edit-layout"); await click("edit-shape"); await click("add-vertex");
  check("Custom polygon supports five vertices", await evaluate("demoTest.state().panels.find(p=>p.id==='a').customVertices.length === 5"));
  await click("remove-vertex"); check("Custom polygon removes a vertex", await evaluate("demoTest.state().panels.find(p=>p.id==='a').customVertices.length === 4"));
  const shapeBefore = await evaluate("JSON.stringify(demoTest.state().panels.find(p=>p.id==='a').customVertices)");
  await evaluate(`(()=>{const c=document.getElementById('page'),r=c.getBoundingClientRect();const x=r.left+r.width*.12,y=r.top+r.height*.12;
    c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:x,clientY:y,pointerId:8}));
    c.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:x+24,clientY:y+18,pointerId:8}));
    c.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:x+24,clientY:y+18,pointerId:8}));})();`);
  check("Custom polygon drag persists vertices", shapeBefore !== await evaluate("JSON.stringify(demoTest.state().panels.find(p=>p.id==='a').customVertices)"));
}
async function persistence() {
  await pause(450);
  const snapshot = await evaluate("JSON.stringify(demoTest.state())");
  await browser.send("Page.reload"); await ready();
  check("Reload preserves full demo document", snapshot === await evaluate("JSON.stringify(demoTest.state())"));
  await evaluate("demoTest.importProject(new File([JSON.stringify({...demoTest.state(),version:99})],'future.json'))");
  check("Invalid import preserves current document", snapshot === await evaluate("JSON.stringify(demoTest.state())"));
  await evaluate("demoTest.importProject(new File([JSON.stringify(demoTest.export())],'valid.json'))");
  check("Demo JSON round trip preserves content", snapshot === await evaluate("JSON.stringify(demoTest.state())"));
  await evaluate(`(async()=>{
    const bytes=Uint8Array.from(atob(PROTOTYPE_DATA.images['panel-d'].split(',')[1]),c=>c.charCodeAt(0));
    await demoTest.importImage(new File([bytes],'detail.png',{type:'image/png'}));
  })()`);
  check("Custom image import applies to selected panel", await evaluate("demoTest.state().panels[0].asset.startsWith('asset-')"));
  await click("undo");
  check("Image import undo restores document and assets", snapshot === await evaluate("JSON.stringify(demoTest.state())"));
  await click("redo");
  check("Image import redo restores decoded custom image", await evaluate("demoTest.state().panels[0].asset.startsWith('asset-')"));
  await evaluate("demoTest.reset()");
}
async function screenshot(name, width, height, view) {
  await browser.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 760 });
  await evaluate(`document.querySelector('.mobile-tabs [data-view="${view}"]').click()`); await pause(100);
  await evaluate("document.getElementById('status').hidden=true");
  check(`${width}px ${view} has no horizontal overflow`, await evaluate("document.documentElement.scrollWidth <= innerWidth"));
  const r = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(output, name), Buffer.from(r.data, "base64"));
}
async function outputs() {
  const png = await evaluate("document.getElementById('page').toDataURL('image/png')");
  const bytes = Buffer.from(png.split(',')[1], 'base64');
  const blobPng = await evaluate(`new Promise(resolve=>document.getElementById('page').toBlob(blob=>{
    const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);
  },'image/png'))`);
  const blobPixels = await sharp(Buffer.from(blobPng.split(',')[1], 'base64')).raw().toBuffer();
  check("PNG Blob export matches page pixels exactly", blobPixels.equals(await sharp(bytes).raw().toBuffer()));
  fs.writeFileSync(path.join(output, "mixed-page.png"), bytes);
  const pixels = await sharp(bytes).removeAlpha().raw().toBuffer();
  let colored = 0;
  for (let i = 0; i < pixels.length; i += 3) if (Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 200) colored++;
  check("Export canvas contains visible image pixels", colored > 500000);
  fs.writeFileSync(path.join(output, "mixed-project.json"), JSON.stringify(await evaluate("demoTest.export()"), null, 2));
  await screenshot("desktop-1440.png", 1440, 1000, "canvas");
  await screenshot("mobile-390-canvas.png", 390, 844, "canvas");
  await screenshot("mobile-390-settings.png", 390, 844, "settings");
  await screenshot("mobile-320-outline.png", 320, 667, "outline");
  await screenshot("mobile-320-canvas.png", 320, 667, "canvas");
}
async function main() {
  fs.mkdirSync(output, { recursive: true }); browser = await startBrowser();
  await browser.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await browser.send("Page.navigate", { url: pathToFileURL(path.join(__dirname, "workbench-demo.html")).href }); await ready();
  await interactions(); await persistence(); await outputs();
  check("No runtime errors after all interactions", await evaluate("demoErrors.length === 0"));
  fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify({ status: "passed", checks,
    browser: "Edge via CDP", scope: "Standalone workbench demo", limitations: ["Rectangular horizontal/vertical cuts only", "One page", "No generation backend", "Captions only; no speech bubbles", "Demo format is not formal project v1"] }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });

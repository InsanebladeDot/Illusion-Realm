/** Real mouse/touch regression: floating toolbar, native file-picker requests and exported image effects. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("../../../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp");
const electron = process.argv.includes("--electron");
const { startBrowser, pause } = require(electron ? "./electron-image-driver.cjs" : "./edge-driver.cjs");
const output = path.join(__dirname, electron ? "image-tools-electron-results" : "image-tools-results"), checks = [];
let browser;
const evaluate = expression => browser.evaluate(expression);
function check(name, value) { assert.ok(value, name); checks.push(name); console.log("PASS: " + name); }
async function waitFor(expression) { for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await pause(100); } throw Error("Timed out: " + expression); }
async function point(selector) {
  return evaluate("(()=>{const e=document.querySelector(" + JSON.stringify(selector) + ");const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()");
}
async function pointer(p, button = "left", count = 1) {
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...p }); await pause(80);
  await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", ...p, button, clickCount: count });
  await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...p, button, clickCount: count }); await pause(120);
}
async function click(selector) { await pointer(await point(selector)); }
async function menu(id = "p1") {
  const p = await evaluate("(()=>{const r=document.querySelector('[data-comic-panel=" + id + "]').getBoundingClientRect();return {x:r.left+r.width*.9,y:r.top+r.height*.9}})()");
  await pointer(p, "right"); await waitFor("Boolean(document.querySelector('[data-image-context-menu]'))");
}
async function save() { await click("[data-save-comic]"); return evaluate("JSON.parse(localStorage.getItem('illusion-realm-comic-template-v1'))"); }
async function viewport(width, height) {
  await browser.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 760 }); await pause(250);
  if (await evaluate("document.querySelector('[data-comic-view-pin]').getBoundingClientRect().width>0")) await click("[data-comic-view=stage]");
}
async function screenshot(name) {
  const result = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(output, name), Buffer.from(result.data, "base64"));
}
async function replaceTest(selector, label) {
  const pickerCount = browser.fileChooserRequests();
  await evaluate("window.filePickerRequests=0");
  await click(selector);
  await waitFor("window.filePickerRequests===1");
  check(label + " requests native picker exactly once", await evaluate("window.filePickerRequests===1"));
  check(label + " receives actual browser file chooser event", browser.fileChooserRequests() === pickerCount + 1);
  const { root } = await browser.send("DOM.getDocument");
  const { nodeId } = await browser.send("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-replace-panel-image]" });
  await browser.send("DOM.setFileInputFiles", { nodeId, files: [path.resolve("apps/next/src/assets/cartoon/6.png")] });
  await waitFor("document.querySelector('[data-comic-panel=p1] img')?.src.startsWith('data:image/png')");
  check(label + " replaces targeted image", (await save()).panels[0].src.startsWith("data:image/png"));
}
async function pickerTests() {
  await evaluate("(()=>{const e=document.querySelector('[data-replace-panel-image]');e.addEventListener('click',()=>window.filePickerRequests++);window.filePickerRequests=0})()");
  await replaceTest("[data-image-action=replace]", "Floating toolbar");
  await menu(); await replaceTest("[data-image-context-menu] > button:first-child", "Context menu");
  await evaluate("window.filePickerRequests=0");
  const pickerCount = browser.fileChooserRequests();
  const p = await point("[data-comic-panel=p2]");
  await pointer(p, "left", 1); await pointer(p, "left", 2);
  check("Real double click opens native picker", await evaluate("window.filePickerRequests===1"));
  check("Double click receives actual browser file chooser event", browser.fileChooserRequests() === pickerCount + 1);
  const { root } = await browser.send("DOM.getDocument");
  const { nodeId } = await browser.send("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-replace-panel-image]" });
  await click("[data-comic-panel=p1]");
  await browser.send("DOM.setFileInputFiles", { nodeId, files: [path.resolve("apps/next/src/assets/cartoon/5.png")] });
  await pause(180); const draft = await save();
  check("Asynchronous replacement stays bound to original target", draft.panels[1].src.startsWith("data:image/png") && draft.panels[0].src !== draft.panels[1].src);
}
async function blurTests() {
  await menu(); await click("[data-image-tools-menu]");
  check("Real hover followed by click keeps Tools submenu open", await evaluate("Boolean(document.querySelector('[data-image-tools-submenu]'))"));
  await click("[data-image-tools-submenu] button:first-child");
  check("Blur opens floating settings without switching away from canvas", await evaluate("document.querySelector('[data-comic-pane=stage]').getBoundingClientRect().width>0&&!!document.querySelector('[data-image-blur-panel]')"));
  await click("[data-image-blur]"); await pause(120);
  const draft = await save();
  check("Real slider click edits blur", draft.panels[0].blur > 0);
  check("Preview blur follows document scale", await evaluate("(()=>{const e=document.querySelector('[data-comic-panel=p1] img'),c=document.querySelector('[data-comic-canvas]');return Math.abs(parseFloat(getComputedStyle(e).filter.slice(5))-JSON.parse(localStorage.getItem('illusion-realm-comic-template-v1')).panels[0].blur*c.getBoundingClientRect().width/1200)<.01})()"));
  await screenshot("blur-desktop.png");
}
async function exportPng() {
  await evaluate("(()=>{window.exportedImage=null;const old=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{if(b.type==='image/png')window.exportedImage=b;return old(b)};HTMLAnchorElement.prototype.click=function(){}})()");
  await click("[data-export-comic-png]"); await waitFor("!!window.exportedImage");
  const src = await evaluate("new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(window.exportedImage)})");
  return Buffer.from(src.split(",")[1], "base64");
}
async function removalTests() {
  const blurred = await exportPng();
  await click("[data-image-action=restore]"); const normal = await exportPng();
  check("Blur affects full-resolution exported pixels", !blurred.equals(normal));
  await menu(); await click("[data-image-context-menu] > button:last-child");
  check("Real menu delete clears selected image but keeps panel", await evaluate("!document.querySelector('[data-comic-panel=p1] img')&&document.querySelectorAll('[data-comic-panel]').length===5"));
  check("Removed image also clears sidebar preview", await evaluate("document.querySelector('[data-comic-pane=side]').textContent.includes('图片已移除')"));
  const removed = await exportPng(), pixel = await sharp(removed).extract({ left: 600, top: 300, width: 1, height: 1 }).raw().toBuffer();
  check("Removed image exports blank panel", pixel[0] === 241 && pixel[1] === 245 && pixel[2] === 249);
  await click("[data-image-action=restore]"); await click("[data-image-action=remove]");
  check("Real floating toolbar delete works", await evaluate("!document.querySelector('[data-comic-panel=p1] img')"));
  await save(); await evaluate("window.beforeReload=true"); await browser.send("Page.reload"); await waitFor("!window.beforeReload");
  await waitFor("Object.keys(document.querySelector('[data-image-action=restore]')||{}).some(k=>k.startsWith('__reactProps'))"); await pause(300);
  check("Removal survives reload", (await save()).panels[0].imageRemoved);
  await click("[data-image-action=restore]");
  check("Restore recovers image and clears blur", await evaluate("!!document.querySelector('[data-comic-panel=p1] img')") && (await save()).panels[0].blur === 0);
}
async function responsiveTests() {
  for (const width of [950, 390, 320]) {
    await viewport(width, width === 320 ? 640 : 844);
    check(width + "px toolbar visible without opening a menu", await evaluate("(()=>{const r=document.querySelector('[data-image-tools]').getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth})()"));
    await click("[data-image-action=blur]");
    check(width + "px floating settings stay inside canvas", await evaluate("(()=>{const r=document.querySelector('[data-image-tools]').getBoundingClientRect(),s=document.querySelector('[data-comic-pane=stage]').getBoundingClientRect();return r.left>=s.left&&r.right<=s.right&&r.bottom<s.bottom-40})()"));
    await screenshot("floating-" + width + ".png");
    await menu(); await click("[data-image-tools-menu]");
    check(width + "px submenu stays within window", await evaluate("(()=>{const r=document.querySelector('[data-image-tools-submenu]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()"));
    await screenshot("menu-" + width + ".png");
    await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await pause(100);
    check(width + "px Escape closes menu", await evaluate("!document.querySelector('[data-image-context-menu]')"));
  }
  const from = await point("[data-drag-image-tools]");
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...from }); await pause(100);
  await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", ...from, button: "left", clickCount: 1 });
  await pause(80);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x+20, y: from.y+80, button: "left", buttons: 1 });
  await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: from.x+20, y: from.y+80, button: "left", clickCount: 1 }); await pause(100);
  check("Floating toolbar can be dragged", (await point("[data-drag-image-tools]")).y > from.y+50);
  for (const action of ["remove", "restore", "blur"]) {
    const p = await point('[data-image-action=' + action + ']');
    await browser.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...p, id: 1 }] });
    await browser.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await pause(120);
    const expression = action === "remove" ? "!document.querySelector('[data-comic-panel=p1] img')" : action === "restore" ? "!!document.querySelector('[data-comic-panel=p1] img')" : "!!document.querySelector('[data-image-blur-panel]')";
    check("Touch toolbar " + action + " works", await evaluate(expression));
  }
}
async function main() {
  fs.mkdirSync(output, { recursive: true }); browser = await startBrowser();
  await browser.send("Page.setInterceptFileChooserDialog", { enabled: true });
  await browser.send("Page.navigate", { url: "http://localhost:3000/comic" });
  await waitFor("Object.keys(document.querySelector('[data-image-action=replace]')||{}).some(k=>k.startsWith('__reactProps'))"); await pause(350);
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='知道了')?.click()");
  await viewport(1440, 1000);
  await pickerTests(); await blurTests(); await removalTests(); await responsiveTests();
  fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify({ status: "passed", checks }, null, 2));
}
main().catch(async error => { console.error(error); process.exitCode = 1; if(browser)await screenshot("failure.png").catch(()=>{}); }).finally(async () => { if (browser) await browser.close(); });

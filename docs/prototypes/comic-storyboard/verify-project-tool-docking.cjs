/** Real mouse/touch docking regression: reservation, snap preview, detach, persistence and narrow rail. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const electron = process.argv.includes("--electron");
const { startBrowser, pause } = require(electron ? "./electron-image-driver.cjs" : "./edge-driver.cjs");
const output = path.join(__dirname, electron ? "tool-docking-electron-results" : "tool-docking-results"), checks = [];
let browser;
const evaluate = expression => browser.evaluate(expression);
function check(name, value) { assert.ok(value, name); checks.push(name); console.log("PASS: " + name); }
async function waitFor(expression) { for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await pause(100); } throw Error("Timed out: " + expression); }
async function point(selector) { return evaluate("(()=>{const r=document.querySelector(" + JSON.stringify(selector) + ").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()"); }
async function pointer(p, button = "left") {
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...p }); await pause(80);
  await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", ...p, button, clickCount: 1 });
  await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...p, button, clickCount: 1 }); await pause(120);
}
async function click(selector) { await pointer(await point(selector)); }
async function viewport(width, height) {
  await browser.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 760 }); await pause(250);
  if (await evaluate("document.querySelector('[data-comic-view-pin]').getBoundingClientRect().width>0")) await click("[data-comic-view=stage]");
}
async function dock(mode) { await click("[data-tool-dock-menu] summary"); await click("[data-tool-dock=" + mode + "]"); }
async function screenshot(name) {
  const image = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(output, name), Buffer.from(image.data, "base64"));
}
async function save() { await click("[data-save-comic]"); return evaluate("JSON.parse(localStorage.getItem('illusion-realm-comic-template-v1'))"); }
const mode = () => evaluate("document.querySelector('[data-image-tools]').dataset.toolDockMode");
const fits = "(()=>{const c=document.querySelector('[data-comic-canvas]').getBoundingClientRect(),v=document.querySelector('[data-canvas-viewport]').getBoundingClientRect();return c.width>0&&c.left>=v.left-.5&&c.right<=v.right+.5&&c.top>=v.top-.5&&c.bottom<=v.bottom+.5})()";
async function reservation(side, width) {
  check(side + " dock reserves " + width + "px", await evaluate("(()=>{const t=document.querySelector('[data-image-tools]').getBoundingClientRect(),v=document.querySelector('[data-canvas-viewport]').getBoundingClientRect();return Math.abs(t.width-" + width + ")<1&&" + (side === "left" ? "v.left>=t.right-.5" : "v.right<=t.left+.5") + "})()"));
  check(side + " dock keeps canvas in bounds", await evaluate(fits));
}
async function beginDrag(destination) {
  const from = await point("[data-drag-image-tools]");
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...from });
  await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", ...from, button: "left", clickCount: 1 }); await pause(80);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...destination, button: "left", buttons: 1 }); await pause(150);
}
async function endDrag(destination) { await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...destination, button: "left", clickCount: 1 }); await pause(180); }
async function stagePoint(side) {
  return evaluate("(()=>{const r=document.querySelector('[data-comic-pane=stage]').getBoundingClientRect();return {x:" + (side === "left" ? "r.left+10" : side === "right" ? "r.right-10" : "r.left+r.width*.55") + ",y:r.top+180}})()");
}
async function desktopTests() {
  check("Fresh toolbox floats", await mode() === "floating"); const before = await save();
  await dock("left"); await reservation("left", 216); await screenshot("dock-left-wide.png");
  await click("[data-collapse-image-tools]"); await reservation("left", 48);
  check("Collapse leaves image commands accessible", await evaluate("[...document.querySelectorAll('[data-image-action]')].every(e=>e.getBoundingClientRect().width>0)"));
  await click("[data-collapse-image-tools]"); await reservation("left", 216);
  await dock("floating"); check("Explicit detach restores float position", await evaluate("document.querySelector('[data-image-tools]').style.left==='8px'"));
  const left = await stagePoint("left"); await beginDrag(left);
  check("Drag near left edge previews dock", await evaluate("!!document.querySelector('[data-tool-dock-preview=left]')"));
  check("Snap is not committed before pointer release", await mode() === "floating"); await screenshot("snap-preview.png");
  await endDrag(left); check("Release attaches left", await mode() === "left"); await reservation("left", 216);
  const center = await stagePoint("center"); await beginDrag(center);
  check("Dragging docked toolbox separates immediately", await mode() === "floating");
  await endDrag(center); const position = await evaluate("JSON.parse(localStorage.getItem('illusion-realm-comic-tool-dock-v1'))");
  check("Floating position is saved", position.mode === "floating" && position.top > 8);
  const right = await stagePoint("right"); await beginDrag(right);
  check("Drag near right edge previews dock", await evaluate("!!document.querySelector('[data-tool-dock-preview=right]')"));
  await endDrag(right); await reservation("right", 216); await screenshot("dock-right-wide.png");
  await dock("floating");
  check("Detach restores most recent float position", await evaluate("Math.abs(parseFloat(document.querySelector('[data-image-tools]').style.left)-" + position.left + ")<.01"));
  const saved = await evaluate("JSON.parse(localStorage.getItem('illusion-realm-comic-tool-dock-v1'))");
  check("Saved float position is finite and bounded", saved.left >= 8 && saved.top >= 8);
  await dock("right"); await click("[data-collapse-image-tools]"); await reservation("right", 48);
  await evaluate("window.beforeDockReload=true"); await browser.send("Page.reload"); await waitFor("!window.beforeDockReload");
  await waitFor("Object.keys(document.querySelector('[data-drag-image-tools]')||{}).some(k=>k.startsWith('__reactProps'))"); await pause(300);
  check("Dock side and collapse persist after reload", await mode() === "right" && await evaluate("document.querySelector('[data-image-tools]').dataset.toolCollapsed==='true'"));
  check("Docking never mutates page or panels", JSON.stringify((await save()).panels) === JSON.stringify(before.panels) && JSON.stringify((await save()).pageSize) === JSON.stringify(before.pageSize));
}
async function mobileTests() {
  await click("[data-collapse-image-tools]");
  for (const width of [950, 390, 320]) {
    await viewport(width, width === 320 ? 640 : 844);
    for (const side of ["left", "right"]) {
      await dock(side); await reservation(side, width < 480 ? 48 : 216);
      await click("[data-image-action=blur]");
      check(width + "px " + side + " blur settings remain visible", await evaluate("(()=>{const r=document.querySelector('[data-image-blur-panel]').getBoundingClientRect(),s=document.querySelector('[data-comic-pane=stage]').getBoundingClientRect();return r.left>=s.left&&r.right<=s.right&&r.top>=s.top&&r.bottom<=s.bottom-40})()"));
      await screenshot("dock-" + side + "-" + width + ".png");
      await click("[data-image-action=blur]");
      await click("[data-tool-dock-menu] summary");
      check(width + "px docking menu stays inside stage", await evaluate("(()=>{const r=document.querySelector('[data-tool-dock-menu] > div').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()"));
      await click("[data-tool-dock=" + side + "]");
    }
  }
  await dock("floating"); const initial = await evaluate("JSON.parse(localStorage.getItem('illusion-realm-comic-tool-dock-v1'))");
  const from = await point("[data-drag-image-tools]"), left = await stagePoint("left");
  await browser.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...from, id: 1 }] });
  await browser.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...left, id: 1 }] }); await pause(120);
  check("Touch drag previews left dock", await evaluate("!!document.querySelector('[data-tool-dock-preview=left]')"));
  await browser.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] }); await pause(150);
  check("Cancelled touch restores previous layout", JSON.stringify(await evaluate("JSON.parse(localStorage.getItem('illusion-realm-comic-tool-dock-v1'))")) === JSON.stringify(initial));
  await browser.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...from, id: 1 }] });
  await browser.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...left, id: 1 }] });
  await browser.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await pause(180);
  check("Touch release docks toolbox", await mode() === "left"); await reservation("left", 48);
}
async function main() {
  fs.mkdirSync(output, { recursive: true }); browser = await startBrowser();
  await browser.send("Page.navigate", { url: "http://localhost:3000/comic" });
  await waitFor("Object.keys(document.querySelector('[data-drag-image-tools]')||{}).some(k=>k.startsWith('__reactProps'))"); await pause(350);
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='知道了')?.click()");
  await viewport(1600, 1000); await desktopTests(); await mobileTests();
  fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify({ status: "passed", checks }, null, 2));
}
main().catch(async error => { console.error(error); process.exitCode = 1; if(browser)await screenshot("failure.png").catch(()=>{}); }).finally(async () => { if(browser)await browser.close(); });

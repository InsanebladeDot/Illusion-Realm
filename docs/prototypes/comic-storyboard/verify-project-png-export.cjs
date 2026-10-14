/** Verify the actual /comic button, exported pixels, editable polygons and error feedback. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("../../../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp");
const { startBrowser, pause } = require("./edge-driver.cjs");
const output = path.join(__dirname, "project-export-results");
const checks = [];
let browser;
const evaluate = expression => browser.evaluate(expression);
function check(name, value) { assert.ok(value, name); checks.push(name); console.log("PASS: " + name); }
async function waitFor(expression) {
  for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(100); }
  throw Error("Timed out: " + expression);
}
async function intercept() {
  await evaluate(`window.exportedPng=null; window.downloadName=null;
    const original=URL.createObjectURL.bind(URL);
    URL.createObjectURL=blob=>{if(blob.type==='image/png')window.exportedPng=blob;return original(blob)};
    HTMLAnchorElement.prototype.click=function(){window.downloadName=this.download};`);
}
async function ready() {
  await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent==='导出 PNG')");
  await waitFor("Object.keys(document.getElementById('comic-title')).some(k=>k.startsWith('__reactProps'))");
  await waitFor("[...document.images].every(i=>i.complete && i.naturalWidth>0)");
  await pause(250);
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='知道了')?.click()");
}
async function click(text) {
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)}).click()`);
}
async function exportPng() {
  await evaluate("window.exportedPng=null"); await click("导出 PNG");
  await waitFor("Boolean(window.exportedPng)");
  const data = await evaluate(`new Promise((resolve,reject)=>{const r=new FileReader();
    r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(window.exportedPng)})`);
  return Buffer.from(data.split(",")[1], "base64");
}
async function screenshot(name, width, height) {
  await browser.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 760 });
  await pause(100);
  const shot = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(output, name), Buffer.from(shot.data, "base64"));
  check(`${width}px export button remains in viewport`, await evaluate(`(()=>{const r=[...document.querySelectorAll('button')].find(b=>b.textContent==='导出 PNG').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight})()`));
}
async function fixtures() {
  const stripes = Buffer.alloc(400 * 100 * 3);
  for (let y = 0; y < 100; y++) for (let x = 0; x < 400; x++) stripes[(y * 400 + x) * 3 + (x < 150 ? 0 : x < 250 ? 1 : 2)] = 255;
  const stripedPng = await sharp(stripes, { raw: { width: 400, height: 100, channels: 3 } }).png().toBuffer();
  const red = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#ff0000" } }).png().toBuffer();
  const blue = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#0000ff" } }).png().toBuffer();
  const rectangle = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  return [{ id: "cover", src: stripedPng, x: 10, y: 10, width: 20, height: 20, vertices: rectangle },
    { id: "triangle", src: red, x: 40, y: 40, width: 30, height: 20, vertices: [{ x: 0, y: 100 }, { x: 50, y: 0 }, { x: 100, y: 100 }] },
    { id: "overlay", src: blue, x: 50, y: 45, width: 10, height: 10, vertices: rectangle }]
    .map(panel => ({ ...panel, title: panel.id, description: "", src: "data:image/png;base64," + panel.src.toString("base64") }));
}
async function loadDraft(panels) {
  await evaluate(`localStorage.setItem('illusion-realm-comic-template-v1',${JSON.stringify(JSON.stringify({ panels, customMode: true }))})`);
  await browser.send("Page.reload"); await ready(); await intercept();
}
async function pixelTests() {
  const panels = await fixtures(); await loadDraft(panels);
  const image = await exportPng();
  fs.writeFileSync(path.join(output, "custom-polygons.png"), image);
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => Array.from(data.subarray((Math.round(y * 1600) * info.width + Math.round(x * 1200)) * 3, (Math.round(y * 1600) * info.width + Math.round(x * 1200)) * 3 + 3));
  check("PNG is 1200 by 1600", info.width === 1200 && info.height === 1600);
  check("Page margin is opaque white", pixel(.02, .02).every(v => v === 255));
  check("Cover cropping matches centered object-cover", JSON.stringify(pixel(.2, .2)) === "[0,255,0]");
  check("Outside polygon remains white", pixel(.42, .41).every(v => v === 255));
  check("Inside polygon contains its image", JSON.stringify(pixel(.55, .58)) === "[255,0,0]");
  check("Last panel overlays previous panel", JSON.stringify(pixel(.55, .5)) === "[0,0,255]");
  await click("编辑多边形"); const editingExport = await exportPng();
  check("Selection guides and vertex handles excluded", image.equals(editingExport));
  panels[0].src = "data:image/png;base64,bm90LWltYWdl";
  await evaluate(`localStorage.setItem('illusion-realm-comic-template-v1',${JSON.stringify(JSON.stringify({ panels, customMode: true }))})`);
  await browser.send("Page.reload");
  await waitFor("Object.keys(document.getElementById('comic-title')||{}).some(k=>k.startsWith('__reactProps'))");
  await waitFor("[...document.images].some(i=>i.src==='data:image/png;base64,bm90LWltYWdl')");
  await intercept(); await click("导出 PNG");
  await waitFor("document.body.innerText.includes('分镜图片加载失败')");
  check("Image failure produces no partial export", await evaluate("window.exportedPng===null"));
  check("Image failure reenables export", await evaluate("![...document.querySelectorAll('button')].find(b=>b.textContent==='导出 PNG').disabled"));
}
async function main() {
  fs.mkdirSync(output, { recursive: true }); browser = await startBrowser();
  await browser.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await browser.send("Page.navigate", { url: "http://localhost:3000/comic" }); await ready(); await intercept();
  const image = await exportPng(); fs.writeFileSync(path.join(output, "comic-page.png"), image);
  check("Actual page button exports named PNG", await evaluate("downloadName==='comic-storyboard.png' && exportedPng.type==='image/png'"));
  await screenshot("desktop.png", 1440, 1000); await screenshot("mobile.png", 390, 844);
  await pixelTests();
  fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify({ status: "passed", checks }, null, 2));
}
main().catch(async error => {
  console.error(error); process.exitCode = 1;
  if (browser) console.error(await evaluate("document.body.innerText.slice(-1000)").catch(() => "Browser unavailable"));
}).finally(async () => { if (browser) await browser.close(); });

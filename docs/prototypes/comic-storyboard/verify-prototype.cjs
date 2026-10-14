/** Verify the standalone prototype in an isolated headless Edge instance via CDP. */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");
const { once } = require("events");
const assert = require("assert/strict");
const sharp = require("../../../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp");

const browserPath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const outputDir = path.join(__dirname, "results");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ir-comic-prototype-"));
const checks = [];
let child;
let socket;
let sessionId;
let requestId = 0;
const pending = new Map();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForPort() {
  const file = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100; i++) {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").split(/\r?\n/);
    if (child.exitCode !== null) throw Error(`Browser exited: ${child.exitCode}`);
    await pause(100);
  }
  throw Error("Browser startup timeout");
}

function send(method, params = {}, browser = false) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(!browser && sessionId ? { sessionId } : {}) }));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.text + ": " + result.exceptionDetails.exception?.description);
  return result.result.value;
}

function check(name, value) {
  assert.ok(value, name);
  checks.push(name);
  console.log(`PASS: ${name}`);
}

function isSimple(vertices) {
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < vertices.length; i++) for (let j = i + 2; j < vertices.length; j++) {
    if (i === 0 && j === vertices.length - 1) continue;
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const c = vertices[j], d = vertices[(j + 1) % vertices.length];
    if (cross(a, b, c) * cross(a, b, d) < -1e-15 && cross(c, d, a) * cross(c, d, b) < -1e-15) return false;
  }
  return true;
}

async function screenshot(name, width, height, settings = false) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 760 });
  await evaluate(`document.getElementById('${settings ? "show-settings" : "show-stage"}').click()`);
  await pause(150);
  const overflow = await evaluate("document.documentElement.scrollWidth > innerWidth");
  check(`${width}px viewport has no horizontal overflow (${name})`, !overflow);
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(outputDir, name), Buffer.from(result.data, "base64"));
}

async function verifyInteractions() {
  check("Four images decoded and no script errors", await evaluate("prototypeReady && prototypeErrors.length === 0"));
  check("Default photo tear has many irregular vertices", await evaluate("prototypeTest.getLayout().overlay.edge === 'torn' && prototypeTest.getLayout().overlayVertices.length > 100"));
  check("All base panels export polygon shapes", await evaluate("prototypeTest.getLayout().baseShape === 'polygon' && prototypeTest.getLayout().panels.every(p => p.shape.kind === 'polygon')"));
  check("Default tear has no crossing edges", isSimple(await evaluate("prototypeTest.getLayout().overlayVertices")));
  await evaluate("document.getElementById('irregular-bases').click()");
  check("Rectangle fallback applies", await evaluate("prototypeTest.getLayout().baseShape === 'rectangle'"));
  await evaluate("document.getElementById('undo').click()");
  check("Undo restores irregular base shapes", await evaluate("prototypeTest.getLayout().baseShape === 'polygon'"));
  const tear = await evaluate("JSON.stringify(prototypeTest.getLayout().overlayVertices)");
  await evaluate("document.getElementById('new-tear').click()");
  check("New tear changes actual geometry", tear !== await evaluate("JSON.stringify(prototypeTest.getLayout().overlayVertices)"));
  await evaluate("document.getElementById('undo').click()");
  check("Undo restores exact tear vertices", tear === await evaluate("JSON.stringify(prototypeTest.getLayout().overlayVertices)"));
  await evaluate("document.querySelector('[data-edge=straight]').click()");
  check("Straight comparison restores simple clipped polygon", await evaluate("prototypeTest.getLayout().overlayVertices.length >= 4 && prototypeTest.getLayout().overlayVertices.length <= 8 && prototypeTest.getLayout().overlay.edge === 'straight'"));
  const straightPng = await evaluate("document.getElementById('page').toDataURL('image/png')");
  fs.writeFileSync(path.join(outputDir, "straight-comparison.png"), Buffer.from(straightPng.split(',')[1], 'base64'));
  await evaluate("prototypeTest.reset()");
  check("All three base panels retain at least 50% area", await evaluate("prototypeTest.getVisibleRatios().every(item => item.ratio >= .5)"));
  await evaluate("document.querySelector('[data-id=\"panel-b\"]').click()");
  check("Layer list selects occluded base panel B", await evaluate("prototypeTest.getSelected() === 'panel-b'"));
  await evaluate(`document.getElementById('page').dispatchEvent(new MouseEvent('click', {
    bubbles:true, clientX:document.getElementById('page').getBoundingClientRect().left + 80/1200*document.getElementById('page').getBoundingClientRect().width,
    clientY:document.getElementById('page').getBoundingClientRect().top + 700/1600*document.getElementById('page').getBoundingClientRect().height
  }))`);
  check("Outside polygon click reaches base panel B", await evaluate("prototypeTest.getSelected() === 'panel-b'"));
  await evaluate("document.getElementById('band-width').value=360; document.getElementById('band-width').dispatchEvent(new Event('input')); document.getElementById('band-width').dispatchEvent(new Event('change'));");
  check("Width changes are applied", await evaluate("prototypeTest.getLayout().overlay.width === 360"));
  await evaluate("document.getElementById('undo').click()");
  check("Undo restores width", await evaluate("prototypeTest.getLayout().overlay.width === 180"));
  await evaluate("document.getElementById('redo').click()");
  check("Redo reapplies width", await evaluate("prototypeTest.getLayout().overlay.width === 360"));
  await evaluate("document.getElementById('reading-order').value='early'; document.getElementById('reading-order').dispatchEvent(new Event('change'))");
  check("Reading order changes without changing render order", await evaluate("prototypeTest.getLayout().panelOrder[1] === 'panel-d' && prototypeTest.getLayout().renderOrder[3] === 'panel-d'"));
  await evaluate("document.querySelector('[data-direction=\"down-left\"]').click()");
  check("Opposite direction applies", await evaluate("prototypeTest.getLayout().overlay.direction === 'down-left'"));
  await evaluate("prototypeTest.reset(); document.querySelector('[data-id=\"panel-d\"]').click()");
  const png = await evaluate("document.getElementById('page').toDataURL('image/png')");
  fs.writeFileSync(path.join(outputDir, "torn-page.png"), Buffer.from(png.split(",")[1], "base64"));
  const cleanLayout = await evaluate("prototypeTest.getLayout()");
  fs.writeFileSync(path.join(outputDir, "torn-layout.json"), JSON.stringify(cleanLayout, null, 2) + "\n");
  const canvasCheck = await evaluate(`(() => {
    const ctx=document.getElementById('page').getContext('2d');
    const original=ctx.getImageData(0,0,1200,1600).data;
    document.getElementById('overlay-visible').click();
    const base=ctx.getImageData(0,0,1200,1600).data;
    let changed=0, unchanged=0;
    for(let i=0;i<base.length;i+=4) { if(base[i]!==original[i] || base[i+1]!==original[i+1] || base[i+2]!==original[i+2]) changed++; else unchanged++; }
    prototypeTest.reset();
    return {changed,unchanged};
  })()`);
  check("Overlay modifies canvas pixels and preserves most underlying pixels", canvasCheck.changed > 50000 && canvasCheck.unchanged > 1000000);
  const exported = await evaluate(`new Promise(resolve => document.getElementById('page').toBlob(blob => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob);
  }, 'image/png'))`);
  const decode = value => sharp(Buffer.from(value.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer();
  const originalPixels = await decode(png);
  const exportedPixels = await decode(exported);
  check("PNG export and reset preview have identical decoded pixels", originalPixels.equals(exportedPixels));
  for (const direction of ["down-right", "down-left"]) for (const offset of [-260, 260]) {
    await evaluate(`document.querySelector('[data-direction="${direction}"]').click();
      document.getElementById('band-width').value=480; document.getElementById('band-width').dispatchEvent(new Event('input'));
      document.getElementById('band-offset').value=${offset}; document.getElementById('band-offset').dispatchEvent(new Event('input'));`);
    check(`Extreme ${direction} ${offset} polygon stays within normalized page bounds`, await evaluate("prototypeTest.getLayout().overlayVertices.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)"));
    check(`Extreme ${direction} ${offset} tear has no crossing edges`, isSimple(await evaluate("prototypeTest.getLayout().overlayVertices")));
  }
  await evaluate("prototypeTest.reset()");
}

async function verifyPresets() {
  await evaluate("prototypeTest.reset(); document.querySelector('[data-id=\"panel-a\"]').click()");
  await evaluate("document.getElementById('edge-preset').value='impact'; document.getElementById('edge-preset').dispatchEvent(new Event('change'))");
  check("Preset editing targets selected base only", await evaluate("prototypeTest.getLayout().panels[0].preset === 'impact' && prototypeTest.getLayout().overlay.preset === 'photo' && prototypeTest.getLayout().panels[1].preset === 'memory'"));
  await evaluate("document.getElementById('new-tear').click()");
  check("New tear targets selected base seed", await evaluate("prototypeTest.getLayout().panels[0].seed !== 9137 && prototypeTest.getLayout().overlay.seed === 7319"));
  const thumbnails = [];
  for (const preset of ['photo', 'memory', 'impact']) {
    await evaluate(`document.getElementById('edge-preset').value='${preset}'; document.getElementById('edge-preset').dispatchEvent(new Event('change')); document.getElementById('apply-all-edges').click()`);
    const data = await evaluate("prototypeTest.getLayout()");
    check(`${preset} applies to all four panels`, data.overlay.preset === preset && data.panels.every(panel => panel.preset === preset));
    check(`${preset} base outlines stay simple and bounded`, data.panels.every(panel => isSimple(panel.shape.vertices)
      && panel.shape.vertices.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)));
    check(`${preset} overlay stays simple`, isSimple(data.overlayVertices));
    const png = await evaluate("document.getElementById('page').toDataURL('image/png')");
    const bytes = Buffer.from(png.split(',')[1], 'base64');
    fs.writeFileSync(path.join(outputDir, `preset-${preset}.png`), bytes);
    thumbnails.push({ input: await sharp(bytes).resize(400, 533).toBuffer(), left: thumbnails.length * 400, top: 0 });
  }
  await sharp({ create: { width: 1200, height: 533, channels: 4, background: '#fff' } })
    .composite(thumbnails).png().toFile(path.join(outputDir, 'preset-comparison.png'));
  await evaluate("prototypeTest.reset(); document.querySelector('[data-id=\"panel-d\"]').click()");
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  child = spawn(browserPath, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  child.on("error", error => console.error(error.message));
  const [port, endpoint] = await waitForPort();
  socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    pending.delete(message.id);
    message.error ? waiter.reject(Error(message.error.message)) : waiter.resolve(message.result);
  });
  await once(socket, "open");
  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, true);
  const attached = await send("Target.attachToTarget", { targetId, flatten: true }, true);
  sessionId = attached.sessionId;
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pathToFileURL(path.join(__dirname, "prototype.html")).href });
  for (let i = 0; i < 100 && !await evaluate("Boolean(window.prototypeReady)"); i++) await pause(100);
  await verifyInteractions();
  await verifyPresets();
  await evaluate("document.getElementById('band-width').value=240; document.getElementById('band-width').dispatchEvent(new Event('input')); document.getElementById('band-width').dispatchEvent(new Event('change'));");
  await pause(450);
  const savedTear = await evaluate("JSON.stringify(prototypeTest.getLayout().overlayVertices)");
  const savedBases = await evaluate("JSON.stringify(prototypeTest.getLayout().panels)");
  await send("Page.reload");
  for (let i = 0; i < 100 && !await evaluate("Boolean(window.prototypeReady)"); i++) await pause(100);
  check("Reload restores validated local draft", await evaluate("prototypeTest.getLayout().overlay.width === 240"));
  check("Reload preserves exact tear geometry", savedTear === await evaluate("JSON.stringify(prototypeTest.getLayout().overlayVertices)"));
  check("Reload preserves all base presets and vertices", savedBases === await evaluate("JSON.stringify(prototypeTest.getLayout().panels)"));
  await evaluate(`(() => {
    const old = prototypeTest.getLayout(); old.version = 1; delete old.baseShape;
    old.overlay = { direction: 'down-right', width: 200, offset: 0, visible: true };
    localStorage.setItem('ir-comic-diagonal-prototype-v1', JSON.stringify(old));
  })()`);
  await send("Page.reload");
  for (let i = 0; i < 100 && !await evaluate("Boolean(window.prototypeReady)"); i++) await pause(100);
  check("Legacy v1 draft migrates without changing straight geometry intent", await evaluate("prototypeTest.getLayout().version === 3 && prototypeTest.getLayout().baseShape === 'rectangle' && prototypeTest.getLayout().overlay.edge === 'straight' && prototypeTest.getLayout().overlay.width === 200"));
  await evaluate(`(() => {
    const old = prototypeTest.getLayout(); old.version = 2; old.baseShape = 'polygon';
    old.overlay = { direction: 'down-right', width: 80, offset: 0, visible: true, edge: 'torn', roughness: 44, seed: 7319, generatorVersion: 1 };
    localStorage.setItem('ir-comic-diagonal-prototype-v1', JSON.stringify(old));
  })()`);
  await send("Page.reload");
  for (let i = 0; i < 100 && !await evaluate("Boolean(window.prototypeReady)"); i++) await pause(100);
  check("Legacy v2 draft retains old tear generator and straight base edges", await evaluate("prototypeTest.getLayout().version === 3 && prototypeTest.getLayout().overlay.generatorVersion === 1 && prototypeTest.getLayout().overlay.width === 80 && prototypeTest.getLayout().panels.every(panel => panel.edge === 'straight')"));
  await evaluate("prototypeTest.reset()");
  await screenshot("desktop-1440.png", 1440, 1000);
  await screenshot("mobile-390-canvas.png", 390, 844);
  await screenshot("mobile-390-settings.png", 390, 844, true);
  await screenshot("mobile-320-canvas.png", 320, 667);
  check("No runtime exceptions after interactions", await evaluate("prototypeErrors.length === 0"));
  fs.writeFileSync(path.join(outputDir, "verification.json"), JSON.stringify({
    status: "passed", browser: "Microsoft Edge via CDP", checks, outputSize: { width: 1200, height: 1600 },
    limitations: ["Area estimated with 100x100 samples per base panel", "No subject or dialogue protection regions", "No project importer or generation backend"],
  }, null, 2) + "\n");
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await send("Browser.close", {}, true); } catch { /* Browser may disconnect during close. */ }
    socket.close();
  }
  if (child && child.exitCode === null) {
    await Promise.race([once(child, "exit"), pause(3000)]);
    if (child.exitCode === null) child.kill();
  }
});

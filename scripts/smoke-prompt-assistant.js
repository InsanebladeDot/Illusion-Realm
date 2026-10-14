/** Real preload/IPC prompt assistant regression with isolated secrets, deferred GLM and a local compatible API. */
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path"); const http = require("node:http");
const { app, BrowserWindow } = require("electron"); const { IPC_CHANNELS: C } = require("../apps/electron/ipcChannels");
const { registerHandle } = require("../apps/electron/ipcHandlers");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "prompt-assistant", timeoutMs: 60000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-assistant-")); process.env.ILLUSION_PROMPT_SECRET_DIR = path.join(root, "secrets");
app.disableHardwareAcceleration(); app.setPath("userData", path.join(root, "browser")); smoke.installWatchdog(app);
require("../apps/electron/appProtocol").registerAppProtocol(); require("../apps/electron/ipc-handlers/window.handlers").registerThemeHandlers();
require("../apps/electron/ipc-handlers/prompt-assistant.handlers").registerPromptAssistantHandlers();
let userData = { version: 1, settings: { paths: {}, theme: "light", outputPath: root }, promptAssistant: { provider: "glm", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.7-flash", customModel: "", presetId: "translate", presets: Array.from({ length: 24 }, (_, index) => ({ id: `fixture-${index}`, name: `Preset ${index + 1}`, instruction: "Translate to English, preserving the original scene." })) } };
registerHandle(C.USER_DATA_READ, () => ({ data: userData, filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, (_event, data) => { userData = data; return { data, filePath: "" }; });
for (const channel of [C.MODELS_DOWNLOAD_LIST, C.MODELS_SCAN, C.FILES_LIST_GENERATED_IMAGES, C.FILES_LIST_OUTPUT_FOLDERS]) registerHandle(channel, () => []);
for (const channel of [C.AGENT_SECRET_STATUS, C.CIVITAI_KEY_STATUS]) registerHandle(channel, () => ({ configured: false, source: "none", protection: "", tail: "" }));
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root); registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => ""); registerHandle(C.CHANGELOG_READ, () => "");
const requests = []; let complete; let win; let server; let endpoint; let localRequest;
const originalFetch = global.fetch;
global.fetch = (url, options) => {
  if (!String(url).startsWith("https://open.bigmodel.cn/")) return originalFetch(url, options);
  requests.push(JSON.parse(options.body));
  return new Promise(resolve => { complete = (content = "a girl under the moon", status = 200, finish = "stop") => resolve(new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }] }), { status })); });
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms)); const run = source => win.webContents.executeJavaScript(source, true);
async function wait(source) { for (let i = 0; i < 150; i++) { if (await run(`(()=>{try{return Boolean(${source})}catch{return false}})()`)) return; await delay(50); } throw new Error("Assistant step timed out: " + source); }
async function fixtureRequest(previous) { for (let i = 0; i < 150 && requests.length === previous; i++) await delay(50); if (requests.length !== previous + 1) throw new Error("Fixture request missing"); }
const TOOL = "[data-prompt-assistant=prompt-editor]";
const qaDir = process.argv.find(value => value.startsWith("--qa-dir="))?.slice(9);
async function capture(name) { if (qaDir) { fs.mkdirSync(qaDir, { recursive: true }); await delay(200); fs.writeFileSync(path.join(qaDir, name + ".png"), (await win.webContents.capturePage()).toPNG()); } }
async function click(selector) { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function input(selector, text) { await run(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});const setter=Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;setter.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`); }
async function text(value) { await run(`document.querySelector('#prompt-editor').textContent=${JSON.stringify(value)}`); }
async function options() { await wait("!document.querySelector('[data-prompt-assistant-menu]')"); await click(`${TOOL} [data-assistant-options]`); await wait("document.querySelector('[data-prompt-assistant-menu]')"); }
async function item(id) { await click(`[data-assistant-item="${id}"]`); }
async function translation() { await click(`${TOOL} [data-assistant-translate]`); }
async function startServer() {
  server = http.createServer((request, response) => { let body = ""; request.on("data", chunk => { body += chunk; }); request.on("end", () => { localRequest = { body: JSON.parse(body), authorized: request.headers.authorization === "Bearer fixture-custom-key", url: request.url }; response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ choices: [{ message: { content: "local translated text" }, finish_reason: "stop" }] })); }); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); endpoint = `http://127.0.0.1:${server.address().port}/v1`;
}
async function checkBasics() {
  smoke.check("Single subtle icon rests inside each plain editor", await run("document.querySelectorAll('[data-prompt-assistant]').length===2&&document.querySelector('[data-assistant-actions]').dataset.expanded==='false'"));
  await run(`document.querySelector('${TOOL}').dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}))`);
  await wait(`document.querySelector('${TOOL} [data-assistant-actions]').dataset.expanded==='true'`);
  smoke.check("Hover expands the toolbar", true);
  await run(`document.querySelector('${TOOL}').dispatchEvent(new PointerEvent('pointerout',{bubbles:true,pointerType:'mouse',relatedTarget:document.body}))`);
  await wait(`document.querySelector('${TOOL} [data-assistant-actions]').dataset.expanded==='false'`);
  smoke.check("Leaving collapses the toolbar", true);
  await text("女孩站在月光下"); await translation();
  await wait("document.body.textContent.includes('设置 → API 密钥 → 提示词助手')");
  smoke.check("Missing credentials preserve the original input", requests.length === 0 && await run("document.querySelector('#prompt-editor').textContent==='女孩站在月光下'"));
  await options(); await item("provider"); await item("glm");
  smoke.check("Provider and GLM models form three cascade columns", await run("document.querySelectorAll('[data-prompt-assistant-menu] [role=menu]').length===3&&document.querySelectorAll('[data-assistant-item^=glm-4]').length===3"));
  await checkCascadeLayout();
  await capture("prompt-assistant-light");
  await item("glm-4.5-flash"); await options(); await item("settings");
  await checkKeySettings();
  await text("女孩站在月光下");
  await translation(); await fixtureRequest(0);
  smoke.check("Selected model and original text reach the API", requests[0].model === "glm-4.5-flash" && requests[0].messages[1].content === "女孩站在月光下");
  complete(); await wait("document.querySelector('#prompt-editor').textContent==='a girl under the moon'");
  smoke.check("Translation replaces the input", true); await click(`${TOOL} [data-assistant-undo]`);
  smoke.check("Undo restores the exact original text", await run("document.querySelector('#prompt-editor').textContent==='女孩站在月光下'"));
}
async function checkConflicts() {
  await translation(); await fixtureRequest(1); await text("newer edit"); complete("older translated result");
  await wait("document.querySelector('[data-assistant-result]')");
  smoke.check("A deferred result cannot overwrite newer edits", await run("document.querySelector('#prompt-editor').textContent==='newer edit'"));
  await run("Array.from(document.querySelectorAll('[data-assistant-result] button')).find(button=>button.textContent==='应用结果').click()");
  smoke.check("Explicit apply accepts the preserved result", await run("document.querySelector('#prompt-editor').textContent==='older translated result'"));
  await click(`${TOOL} [data-assistant-undo]`); smoke.check("Undo after explicit apply restores the newer edit", await run("document.querySelector('#prompt-editor').textContent==='newer edit'"));
  await translation(); await fixtureRequest(2); complete("", 401); await wait("document.body.textContent.includes('密钥无效')");
  smoke.check("Authentication errors preserve input", await run("document.querySelector('#prompt-editor').textContent==='newer edit'"));
  const before = requests.length; await translation(); await fixtureRequest(before); complete("", 403);
  await wait("document.body.textContent.includes('访问被拒绝（403）')");
  smoke.check("Access denial differs from invalid authentication and preserves input", await run("document.querySelector('#prompt-editor').textContent==='newer edit'"));
}
async function checkPresetsAndCustom() {
  await options(); await item("presets"); await item("add"); await wait("document.querySelector('[data-assistant-preset-name]')");
  await input("[data-assistant-preset-name]", "My instruction"); await input("[data-assistant-preset-instruction]", "Return English tags only."); await click("[data-assistant-save]");
  await wait("!document.querySelector('[data-resource-dialog=prompt-assistant-settings]')"); const before = requests.length; await translation(); await fixtureRequest(before);
  smoke.check("Custom preset becomes the system instruction", requests[before].messages[0].content === "Return English tags only."); complete();
  await wait(`!document.querySelector('${TOOL} [data-assistant-translate]').disabled`);
  await options(); await item("provider"); await item("custom"); await wait("document.querySelector('[data-assistant-endpoint]')");
  await input("[data-assistant-endpoint]", endpoint); await input("[data-assistant-model]", "local-model"); await click("[data-assistant-connection-save]");
  const custom = '[data-prompt-key-provider="custom"]'; await wait(`document.querySelector('${custom} [data-assistant-api-key]')`);
  await input(`${custom} [data-assistant-api-key]`, "fixture-custom-key"); await click(`${custom} [data-assistant-save]`);
  await wait(`document.querySelector('${custom} [data-prompt-key-status]').dataset.promptKeyStatus==='configured'`);
  await returnToCreate(); await text("newer edit"); await translation(); await wait("document.querySelector('#prompt-editor').textContent==='local translated text'");
  smoke.check("Custom compatible API receives authenticated POST and selected model", localRequest.authorized && localRequest.url === "/v1/chat/completions" && localRequest.body.model === "local-model");
  for (let i = 0; i < 100 && !userData.promptAssistant?.presets.length; i++) await delay(50);
  smoke.check("Preferences and custom presets persist without credentials", userData.promptAssistant.presets.length === 25 && !JSON.stringify(userData).includes("fixture-glm-secret") && !JSON.stringify(userData).includes("fixture-custom-key"));
  const status = await run(`window.electronAPI.promptSecretStatus({provider:'glm',baseUrl:''})`);
  smoke.check("GLM credential remains separate, encrypted, and only status is exposed", status.success && status.data.configured && status.data.protection === "safeStorage" && !JSON.stringify(status).includes("fixture-glm-secret"));
  const other = await run(`window.electronAPI.promptSecretStatus({provider:'custom',baseUrl:${JSON.stringify(endpoint + "/other")}})`);
  smoke.check("A different proxy endpoint cannot reuse the previous key", other.success && !other.data.configured);
  const invalid = await run("window.electronAPI.transformPrompt({provider:'custom',baseUrl:'http://example.com/v1',model:'x',text:'test',instruction:'test'})");
  smoke.check("IPC rejects insecure non-local endpoints", !invalid.success && invalid.code === "INVALID_ARGUMENT");
}
async function returnToCreate() {
  await click('a[href="/create"]'); await wait("document.querySelector('[data-prompt-assistant=prompt-editor]')");
}
async function checkKeySettings() {
  await wait("document.querySelector('[data-settings-category=keys]').getAttribute('aria-pressed')==='true'");
  smoke.check("Assistant settings deep-link selects the API keys category", await run("location.hash==='#prompt-keys'&&Boolean(document.querySelector('#agent'))&&Boolean(document.querySelector('#civitai-api-key'))"));
  await capture("prompt-api-keys");
  await click('[data-settings-category=tools]');
  smoke.check("Toolbox settings no longer contain credentials", await run("!document.querySelector('#agent')&&!document.querySelector('#prompt-keys')&&!document.querySelector('#civitai-api-key')"));
  await click('[data-settings-category=models]');
  smoke.check("Model settings no longer contain Civitai credentials", await run("!document.querySelector('#civitai-api-key')"));
  await click('[data-settings-category=tools]'); await run("location.hash='agent'");
  await wait("document.querySelector('[data-settings-category=keys]').getAttribute('aria-pressed')==='true'");
  smoke.check("Existing Agent anchor still opens the credential category", await run("Boolean(document.querySelector('#agent-api-key'))"));
  await click('[data-settings-category=keys]');
  const glm = '[data-prompt-key-provider="glm"]';
  await input(`${glm} [data-assistant-api-key]`, "fixture-glm-secret"); await click(`${glm} [data-assistant-save]`);
  await wait(`document.querySelector('${glm} [data-prompt-key-status]').dataset.promptKeyStatus==='configured'`);
  smoke.check("Saved credentials clear the draft input", await run(`document.querySelector('${glm} [data-assistant-api-key]').value===''`));
  await click(`${glm} [data-assistant-clear]`); await wait(`document.querySelector('${glm} [data-prompt-key-status]').dataset.promptKeyStatus==='missing'`);
  smoke.check("Settings clear removes the isolated credential", !(await run("window.electronAPI.promptSecretStatus({provider:'glm',baseUrl:''})")).data.configured);
  await input(`${glm} [data-assistant-api-key]`, "fixture-glm-secret"); await click(`${glm} [data-assistant-save]`);
  await wait(`document.querySelector('${glm} [data-prompt-key-status]').dataset.promptKeyStatus==='configured'`);
  await returnToCreate();
}
async function checkAppearance() {
  await options(); await item("provider"); await item("glm");
  const colors = () => run("(()=>{const css=getComputedStyle(document.querySelector('[data-assistant-column=\"0\"]'));return css.backgroundColor+' '+css.color})()");
  const light = await colors(); await click("[data-theme-trigger]"); await wait("document.querySelector('[data-theme-option=dark]')"); await click("[data-theme-option=dark]"); await wait("document.documentElement.dataset.theme==='dark'");
  smoke.check("Menu follows the application's dark theme", light !== await colors());
  await delay(700); await capture("prompt-assistant-dark");
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await wait("document.querySelectorAll('[data-prompt-assistant-menu] [role=menu]').length===1");
  smoke.check("Narrow screens show a navigable single-column menu inside viewport", await run("(()=>{const r=document.querySelector('[data-prompt-assistant-menu]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"));
  await capture("prompt-assistant-narrow");
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await wait("!document.querySelector('[data-prompt-assistant-menu]')"); smoke.check("Escape closes the menu", true);
}
async function checkAssemblyTargets() {
  await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
  await options(); await item("provider"); await item("glm"); await item("glm-4.7-flash");
  await click("[data-advanced-prompt-toggle]"); await wait("document.querySelector('[data-prompt-tab-input]')");
  const ids = await run("Array.from(document.querySelectorAll('[data-prompt-tab]')).map(button=>button.dataset.promptTab)");
  const tabTool = id => `[data-prompt-assistant="${id}"]`;
  await input("[data-prompt-tab-input]", "first category description");
  const before = requests.length; await click(`${tabTool(ids[0])} [data-assistant-translate]`); await fixtureRequest(before);
  await click(`[data-prompt-tab="${ids[1]}"]`); await input("[data-prompt-tab-input]", "other category description"); complete("translated first category");
  await wait(`!document.querySelector('${tabTool(ids[1])} [data-assistant-translate]').disabled`);
  smoke.check("Switching tabs during translation cannot overwrite another category", await run("document.querySelector('[data-prompt-tab-input]').value==='other category description'&&!document.querySelector('[data-assistant-result]')"));
  await click(`[data-prompt-tab="${ids[0]}"]`); await wait("document.querySelector('[data-assistant-result]')");
  smoke.check("Original category retains its deferred translation for review", await run("document.querySelector('[data-prompt-tab-input]').value==='first category description'"));
  await run("Array.from(document.querySelectorAll('[data-assistant-result] button')).find(button=>button.textContent==='应用结果').click()");
  await wait("document.querySelector('[data-prompt-tab-input]').value==='translated first category'");
  smoke.check("Applying translation updates the assembly category and merged prompt", await run("document.querySelector('#prompt-editor').textContent.includes('translated first category')&&document.querySelector('#prompt-editor').textContent.includes('other category description')"));
  await click(`${tabTool(ids[0])} [data-assistant-undo]`); await wait("document.querySelector('[data-prompt-tab-input]').value==='first category description'");
  smoke.check("Assembly translation also supports undo", true);
  const negative = "[data-prompt-assistant=negative-prompt-editor]"; await run("document.querySelector('#negative-prompt-editor').textContent='模糊画面'");
  const previous = requests.length; await click(`${negative} [data-assistant-translate]`); await fixtureRequest(previous); complete("blurry image");
  await wait("document.querySelector('#negative-prompt-editor').textContent==='blurry image'");
  smoke.check("Negative prompt translation writes only to the negative editor", await run("document.querySelector('[data-prompt-tab-input]').value==='first category description'"));
  const truncated = requests.length; await click(`${negative} [data-assistant-translate]`); await fixtureRequest(truncated); complete("incomplete output", 200, "length");
  await wait("document.body.textContent.includes('输出超过长度限制')");
  smoke.check("Truncated model output cannot replace the original text", await run("document.querySelector('#negative-prompt-editor').textContent==='blurry image'"));
  for (let i = 0; i < 100 && !userData.createForm?.advancedPrompt; i++) await delay(50);
  win.reload(); await delay(100); await wait("document.querySelector('[data-prompt-assistant]')");
  const persisted = await run("window.electronAPI.promptSecretStatus({provider:'glm',baseUrl:''})");
  smoke.check("Credentials and custom instructions survive reload", persisted.success && persisted.data.configured && userData.promptAssistant.presets.some(preset => preset.name === "My instruction" && preset.instruction === "Return English tags only."));
}
async function checkCascadeLayout() {
  const geometry = () => run("(()=>{const r=document.querySelector('[data-assistant-column=\"0\"]').getBoundingClientRect();return [r.left,r.top,r.width,r.height].join(',')})()");
  const first = await geometry(); await item("presets"); await wait("document.querySelector('[data-assistant-item=anima]')");
  smoke.check("Root position and height stay fixed when a taller submenu opens", first === await geometry());
  smoke.check("Preset submenu uses extra height and scrolls within the viewport", await run("(()=>{const r=document.querySelector('[data-assistant-column=\"0\"]').getBoundingClientRect();const child=document.querySelector('[data-assistant-column=\"1\"]');const c=child.getBoundingClientRect();return c.height>r.height&&c.bottom<=innerHeight&&child.scrollHeight>child.clientHeight})()"));
  await capture("prompt-assistant-scroll"); await item("provider"); await item("glm");
  smoke.check("Child columns open right when there is space", await run("document.querySelector('[data-prompt-assistant-menu]').dataset.submenuDirection==='right'&&document.querySelector('[data-assistant-column=\"1\"]').getBoundingClientRect().left>=document.querySelector('[data-assistant-column=\"0\"]').getBoundingClientRect().right"));
  const style = await run(`(()=>{const anchor=document.querySelector('${TOOL}');const previous=anchor.getAttribute('style');anchor.style.position='fixed';anchor.style.left=(innerWidth-45)+'px';anchor.style.top='300px';anchor.style.right='auto';anchor.style.bottom='auto';window.dispatchEvent(new Event('resize'));return previous})()`);
  await wait("document.querySelector('[data-prompt-assistant-menu]').dataset.submenuDirection==='left'");
  smoke.check("Child columns flip left without exceeding the window", await run("(()=>{const columns=Array.from(document.querySelectorAll('[data-assistant-column]')).map(el=>el.getBoundingClientRect());return columns[1].right<=columns[0].left&&columns.every(r=>r.left>=0&&r.right<=innerWidth)})()"));
  const leftRoot = await geometry(); await item("presets"); await wait("document.querySelector('[data-assistant-item=anima]')");
  smoke.check("Left-opening tall submenu also leaves the root unchanged", leftRoot === await geometry());
  await capture("prompt-assistant-left");
  await run(`(()=>{const anchor=document.querySelector('${TOOL}');${style === null ? "anchor.removeAttribute('style')" : `anchor.setAttribute('style',${JSON.stringify(style)})`};window.dispatchEvent(new Event('resize'))})()`);
  await item("provider"); await item("glm");
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app }); await startServer();
  win = new BrowserWindow({ show: false, width: 1500, height: 1000, webPreferences: { offscreen: true, preload: path.join(__dirname, "../apps/electron/preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } }); win.webContents.debugger.attach("1.3");
  try { await win.loadURL("app://app/create"); await wait("document.querySelector('[data-prompt-assistant]')"); await delay(300); await run("Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='知道了')?.click()");
    await checkBasics(); await checkConflicts(); await checkPresetsAndCustom(); await checkAppearance(); await checkAssemblyTargets();
  } finally { win.destroy(); server.close(); global.fetch = originalFetch; }
  smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch(error => { console.error(error.message); if (win && !win.isDestroyed()) win.destroy(); server?.close(); global.fetch = originalFetch; smoke.finish({ app, ok: false, error }); });

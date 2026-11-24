/** 转译真实页面回归：外部推理用替身，凭据、模型弹窗和本地兼容接口走实际实现。 */
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path"); const http = require("node:http");
const { app, BrowserWindow } = require("electron"); const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/src/main/core/windows/window-chrome");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "prompt-assistant", timeoutMs: 120000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-assistant-")); process.env.ILLUSION_PROMPT_SECRET_DIR = path.join(root, "secrets");
process.env.ILLUSION_AGENT_SECRET_DIR = path.join(root, "agent-secrets");
app.disableHardwareAcceleration(); app.setPath("userData", path.join(root, "browser")); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol(); require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
require("../apps/electron/src/main/core/windows/window.handlers").registerWindowHandlers();
require("../apps/electron/src/main/modules/prompt-assistant/prompt-assistant.handlers").registerPromptAssistantHandlers();
// 用工作流声明的相对路径准备占位文件，让系列切换经过真实的目录扫描和就绪判断。
// 文件只用于测试转译界面，测试不会调用 ComfyUI 加载这些权重。
function installImageModels(modelsRoot) {
  const workflowRoot = path.join(__dirname, '../apps/next/src/data/comfy/imageWorkflower');
  const loaders = { UNETLoader: ['diffusion_models', 'unet_name'], CLIPLoader: ['text_encoders', 'clip_name'], VAELoader: ['vae', 'vae_name'] };
  for (const template of ['Anima/标准anima生成流.json', 'Moss_Image/文生图.json']) {
    const workflow = JSON.parse(fs.readFileSync(path.join(workflowRoot, template), 'utf8'));
    for (const { class_type: type, inputs } of Object.values(workflow)) {
      if (!Object.hasOwn(loaders, type)) continue;
      const [directory, input] = loaders[type];
      const file = path.join(modelsRoot, directory, ...inputs[input].split(/[\\/]/));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'fixture weights');
    }
  }
}
const modelsRoot = path.join(root, 'models');
installImageModels(modelsRoot);
let userData = { version: 1, settings: { paths: { searchPath: modelsRoot }, theme: "light", outputPath: root }, promptAssistant: { provider: "glm", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.7-flash", customModel: "", presetId: "translate", presets: Array.from({ length: 24 }, (_, index) => ({ id: `fixture-${index}`, name: `Preset ${index + 1}`, instruction: "Translate to English, preserving the original scene." })) } };
registerHandle(C.USER_DATA_READ, () => ({ data: require("./lib/guest-session-fixture").withGuestSession(userData), filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, (_event, data) => { userData = data; return { data, filePath: "" }; });
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHENTICATED" } }));
for (const channel of [C.MODELS_DOWNLOAD_LIST, C.FILES_LIST_GENERATED_IMAGES, C.FILES_LIST_OUTPUT_FOLDERS]) registerHandle(channel, () => []);
const { scanModelsInDirectory } = require("../apps/electron/src/main/modules/models/scanner");
registerHandle(C.MODELS_SCAN, (_event, directory, type) => scanModelsInDirectory(directory, type));
for (const channel of [C.AGENT_SECRET_STATUS, C.CIVITAI_KEY_STATUS]) registerHandle(channel, () => ({ configured: false, source: "none", protection: "", tail: "" }));
require("../apps/electron/src/main/modules/agent/agent.handlers").registerAgentHandlers();
registerHandle(C.AGENT_CATALOG, (_event, provider) => require("../apps/electron/src/main/modules/agent/provider-catalog").fallback(provider));
// 图片生成使用独立密钥；本套件只查询空状态，不覆盖用户的图片配置。
registerHandle(C.EUZHI_IMAGE_SECRET_STATUS, () => ({ configured: false, protection: '', tail: '' }));
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root); registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => ""); registerHandle(C.CHANGELOG_READ, () => "");
const requests = []; let complete; let win; let server; let endpoint; let localRequest;
const originalFetch = global.fetch;
userData.agentPreferences = { provider: "siliconflow", models: { siliconflow: "fixture-silicon", euzhi: "grok-4.7" } };
const euzhiRequests = [];
global.fetch = (url, options) => {
  if (String(url) === "https://euzhi.vip/v1/chat/completions") {
    euzhiRequests.push({ body: JSON.parse(options.body), authorized: options.headers.Authorization === "Bearer fixture-euzhi-key" });
    return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "euzhi translated tags" }, finish_reason: "stop" }] })));
  }
  if (!String(url).startsWith("https://open.bigmodel.cn/")) return originalFetch(url, options);
  requests.push(JSON.parse(options.body));
  return new Promise(resolve => { complete = (content = "a girl under the moon", status = 200, finish = "stop") => resolve(new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }] }), { status })); });
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms)); const run = source => win.webContents.executeJavaScript(source, true).catch(error => { throw new Error(`${error.message}: ${source}`); });
async function wait(source) { for (let i = 0; i < 150; i++) { if (await run(`(()=>{try{return Boolean(${source})}catch{return false}})()`)) return; await delay(50); } throw new Error("Assistant step timed out: " + source); }
async function fixtureRequest(previous) { for (let i = 0; i < 150 && requests.length === previous; i++) await delay(50); if (requests.length !== previous + 1) throw new Error("Fixture request missing"); }
const TOOL = "[data-prompt-assistant=prompt-editor]";
const qaDir = process.argv.find(value => value.startsWith("--qa-dir="))?.slice(9);
async function capture(name) { if (qaDir) { fs.mkdirSync(qaDir, { recursive: true }); win.webContents.invalidate(); await delay(200); fs.writeFileSync(path.join(qaDir, name + ".png"), (await win.webContents.capturePage()).toPNG()); } }
async function click(selector) { await require("./lib/sidebar-menu-fixture").revealSidebarPreference(run, selector); await run(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function input(selector, text) { await run(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});const setter=Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;setter.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`); }
async function text(value) { await run(`document.querySelector('#prompt-editor').textContent=${JSON.stringify(value)}`); }
async function options() { await wait("!document.querySelector('[data-prompt-assistant-menu]')"); await click(`${TOOL} [data-assistant-options]`); await wait("document.querySelector('[data-prompt-assistant-menu]')"); }
async function item(id) { await click(`[data-assistant-item="${id}"]`); }
// 供应商点击打开的就是 Agent 模型窗口；这里用实际卡片和应用按钮确认选择。
async function chooseModel(provider, model) {
  await item(provider); await wait("document.querySelector('#agent-model-dialog')");
  await wait(`document.querySelector('[data-agent-model-option="${model}"]')`);
  smoke.check("Transcreation reuses the Agent model cards and price display", await run("!!document.querySelector('[data-resource-dialog=agent-model-dialog] [data-agent-model-option]')&&document.querySelectorAll('[data-agent-provider]').length===3"));
  if (provider === 'glm') await require('./lib/check-agent-model-order').checkAgentModelOrder({ run, wait, check: smoke.check, capture });
  await capture(`transcreation-models-${provider}`);
  await click(`[data-agent-model-option="${model}"]`);
  await click('[data-agent-model-apply]'); await wait("!document.querySelector('#agent-model-dialog')");
}
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
  await run(`document.querySelector('${TOOL} [data-assistant-translate]').dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}))`);
  await wait("[...document.querySelectorAll('[data-hover-tip][data-visible=true]')].some(t=>t.textContent==='转译')");
  smoke.check("Transcreate uses the shared black hint without a native title", await run(`(()=>{const el=[...document.querySelectorAll('[data-hover-tip][data-visible=true]')].find(t=>t.textContent==='转译');return getComputedStyle(el).backgroundColor==='rgb(5, 5, 5)'&&!document.querySelector('${TOOL} [title]')})()`));
  await capture("transcreate-tooltip");
  await run(`document.querySelector('${TOOL}').dispatchEvent(new PointerEvent('pointerout',{bubbles:true,pointerType:'mouse',relatedTarget:document.body}))`);
  await wait(`document.querySelector('${TOOL} [data-assistant-actions]').dataset.expanded==='false'`);
  smoke.check("Leaving collapses the toolbar", true);
  await text("女孩站在月光下"); await translation();
  await wait("document.body.textContent.includes('设置 → API 密钥 → 提示词助手')");
  smoke.check("Missing credentials preserve the original input", requests.length === 0 && await run("document.querySelector('#prompt-editor').textContent==='女孩站在月光下'"));
  await options(); await item("provider");
  smoke.check("Three shared providers appear in the second column", await run("document.querySelectorAll('[data-prompt-assistant-menu] [role=menu]').length===2&&['siliconflow','euzhi','glm'].every(id=>document.querySelector('[data-assistant-item='+id+']'))"));
  await checkCascadeLayout();
  await checkCascadePointerHandoff('right', 540);
  await options();
  await checkCascadePointerHandoff('left', 890);
  await options(); await item('presets'); await item('presets-general'); await item('translate');
  await options(); await item('provider');
  await capture("prompt-assistant-light");
  await chooseModel("glm", "glm-4.7-flash"); await options(); await item("settings");
  await checkKeySettings();
  await text("女孩站在月光下");
  await translation(); await fixtureRequest(0);
  smoke.check("Selected model and original text reach the API", requests[0].model === "glm-4.7-flash" && requests[0].messages[1].content === "女孩站在月光下");
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
  // 自定义端点仅兼容老文档，新的供应商菜单不再创建第四个入口。
  userData.promptAssistant.provider = "custom"; win.reload();
  await wait("document.querySelector('[data-prompt-assistant=prompt-editor]')");
  await options(); await item("settings"); await wait("document.querySelector('[data-assistant-endpoint]')");
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

async function checkPresetEditing() {
  const preset = userData.promptAssistant.presets.find(value => value.name === "My instruction");
  await options(); await item("presets");
  await item("presets-general");
  smoke.check("Built-in assistant presets have no editing entry", await run("!document.querySelector('[data-assistant-edit=translate]')&&!document.querySelector('[data-assistant-edit=anima]')"));
  await run(`document.querySelector('[data-assistant-edit="${preset.id}"]').scrollIntoView({block:'nearest'})`); await capture("prompt-custom-preset-edit-entry");
  const entry = await run(`(()=>{const e=document.querySelector('[data-assistant-edit="${preset.id}"]').getBoundingClientRect(),m=document.querySelector('[data-prompt-assistant-menu]').getBoundingClientRect();return {visible:e.width>0&&e.left>=0&&e.top>=0&&e.right<=innerWidth&&e.bottom<=innerHeight,entry:[e.left,e.top,e.width,e.height],menu:[m.left,m.top,m.width,m.height]}})()`); smoke.check("Custom preset management remains visible after scrolling", entry.visible, JSON.stringify(entry));
  await click(`[data-assistant-edit="${preset.id}"]`); await wait("document.querySelector('[data-assistant-preset-name]')?.value==='My instruction'");
  await input("[data-assistant-preset-name]", "Edited instruction"); await input("[data-assistant-preset-instruction]", "Return concise English tags."); await click("[data-assistant-save]"); await wait("!document.querySelector('[data-resource-dialog=prompt-assistant-settings]')");
  smoke.check("Editing replaces the original preset without changing selection", userData.promptAssistant.presets.length === 25 && userData.promptAssistant.presetId === preset.id && userData.promptAssistant.presets.find(value => value.id === preset.id).instruction === "Return concise English tags.");
  await text("edited instruction check"); await translation(); await wait("document.querySelector('#prompt-editor').textContent==='local translated text'");
  smoke.check("The next request uses the edited system instruction", localRequest.body.messages[0].content === "Return concise English tags.");
}

async function checkPresetDeletion() {
  const preset = userData.promptAssistant.presets.find(value => value.name === "Edited instruction");
  const openPresetMenu = async () => { await click('[data-prompt-assistant=negative-prompt-editor] [data-assistant-options]'); await wait("document.querySelector('[data-prompt-assistant-menu]')"); await item("presets"); };
  await openPresetMenu(); await capture("prompt-custom-presets"); await click(`[data-assistant-edit="${preset.id}"]`); await wait("document.querySelector('[data-assistant-delete]')"); await click("[data-assistant-delete]"); await wait("document.querySelector('[data-assistant-delete-confirmation]')"); await click("[data-assistant-delete-cancel]");
  smoke.check("Cancelling deletion preserves the preset and selection", userData.promptAssistant.presets.length === 25 && userData.promptAssistant.presetId === preset.id && await run("!document.querySelector('[data-assistant-delete-confirmation]')"));
  await click("[data-assistant-save]"); await wait("!document.querySelector('[data-resource-dialog=prompt-assistant-settings]')");
  await openPresetMenu(); await click('[data-assistant-edit="fixture-0"]'); await wait("document.querySelector('[data-assistant-delete]')"); await click("[data-assistant-delete]"); await click("[data-assistant-delete]"); await wait("!document.querySelector('[data-resource-dialog=prompt-assistant-settings]')");
  smoke.check("Deleting an inactive preset preserves the active selection", !userData.promptAssistant.presets.some(value => value.id === 'fixture-0') && userData.promptAssistant.presetId === preset.id);
  await openPresetMenu(); await click(`[data-assistant-edit="${preset.id}"]`); await wait("document.querySelector('[data-assistant-delete]')"); await click("[data-assistant-delete]"); await capture("prompt-preset-delete-confirmation"); await click("[data-assistant-delete]"); await wait("!document.querySelector('[data-resource-dialog=prompt-assistant-settings]')");
  smoke.check("Deleting the active preset falls back to English translation", userData.promptAssistant.presetId === 'translate' && userData.promptAssistant.presets.length === 23 && !userData.promptAssistant.presets.some(value => value.id === preset.id));
  win.reload(); await wait("document.querySelector('[data-prompt-assistant=negative-prompt-editor]')"); await openPresetMenu(); await item("presets-general");
  smoke.check("Preset deletion and fallback survive page reload", await run(`!document.querySelector('[data-assistant-item="${preset.id}"]')&&!document.querySelector('[data-assistant-edit="fixture-0"]')&&document.querySelector('[data-assistant-item=translate] svg')`));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
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
  await click('[data-agent-provider=glm]');
  await wait("document.querySelector('[data-agent-provider=glm]').getAttribute('aria-pressed')==='true'");
  await input('#agent-api-key', "fixture-glm-secret"); await click('[data-agent-key-save]');
  await wait("document.querySelector('[data-agent-key-status]').dataset.agentKeyStatus==='configured'");
  smoke.check("Shared credential form clears its saved draft", await run("document.querySelector('#agent-api-key').value===''") );
  await click('[data-agent-key-clear]'); await wait("document.querySelector('[data-agent-key-status]').dataset.agentKeyStatus==='missing'");
  smoke.check("Agent clear removes the same GLM credential used by transcreation", !(await run("window.electronAPI.promptSecretStatus({provider:'glm',baseUrl:''})")).data.configured);
  await input('#agent-api-key', "fixture-glm-secret"); await click('[data-agent-key-save]');
  await wait("document.querySelector('[data-agent-key-status]').dataset.agentKeyStatus==='configured'");
  await returnToCreate();
}
async function checkAppearance() {
  await options(); await item("provider");
  const colors = () => run("(()=>{const css=getComputedStyle(document.querySelector('[data-assistant-column=\"0\"]'));return css.backgroundColor+' '+css.color})()");
  const light = await colors(); await click("[data-theme-trigger]"); await wait("document.querySelector('[data-theme-option=dark]')"); await click("[data-theme-option=dark]"); await wait("document.documentElement.dataset.theme==='dark'");
  await wait(`(()=>{const css=getComputedStyle(document.querySelector('[data-assistant-column="0"]'));return css.backgroundColor+' '+css.color!==${JSON.stringify(light)}})()`);
  smoke.check("Menu follows the application's dark theme", light !== await colors());
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
  await delay(700); await capture("prompt-assistant-dark");
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await wait("document.querySelectorAll('[data-prompt-assistant-menu] [role=menu]').length===1");
  await wait("(()=>{const r=document.querySelector('[data-prompt-assistant-menu]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()");
  smoke.check("Narrow screens show a navigable single-column menu inside viewport", true);
  await capture("prompt-assistant-narrow");
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await wait("!document.querySelector('[data-prompt-assistant-menu]')"); smoke.check("Escape closes the menu", true);
}
async function checkAssemblyTargets() {
  const ids = await openAssemblyForChecks();
  const tabTool = id => `[data-prompt-assistant="${id}"]`;
  await input("[data-prompt-tab-input]", "first category description");
  const before = requests.length; await click(`${tabTool(ids[0])} [data-assistant-translate]`); await fixtureRequest(before);
  await click(`[data-prompt-tab="${ids[1]}"]`);
  await wait(`document.querySelector('${tabTool(ids[1])}')`);
  await input("[data-prompt-tab-input]", "other category description"); complete("translated first category");
  await wait(`!document.querySelector('${tabTool(ids[1])} [data-assistant-translate]').disabled`);
  smoke.check("Switching tabs during translation cannot overwrite another category", await run("document.querySelector('[data-prompt-tab-input]').value==='other category description'&&!document.querySelector('[data-assistant-result]')"));
  await click(`[data-prompt-tab="${ids[0]}"]`); await wait("document.querySelector('[data-assistant-result]')");
  smoke.check("Original category retains its deferred translation for review", await run("document.querySelector('[data-prompt-tab-input]').value==='first category description'"));
  await run("Array.from(document.querySelectorAll('[data-assistant-result] button')).find(button=>button.textContent==='应用结果').click()");
  await wait("document.querySelector('[data-prompt-tab-input]').value==='translated first category'");
  smoke.check("Applying translation updates the assembly category and merged prompt", await run("document.querySelector('#prompt-editor').textContent.includes('translated first category')&&document.querySelector('#prompt-editor').textContent.includes('other category description')"));
  await click(`${tabTool(ids[0])} [data-assistant-undo]`); await wait("document.querySelector('[data-prompt-tab-input]').value==='first category description'");
  smoke.check("Assembly translation also supports undo", true);
  await checkAssemblyNegative();
  await checkPromptOrder(ids);
  await checkAssemblyPersistence(ids);
}
async function openAssemblyForChecks() {
  await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
  // 先确认真实视口已恢复，避免在窄屏宿主换回弹窗时点击即将卸载的排序控件。
  await wait("innerWidth===1500&&matchMedia('(min-width: 1280px)').matches");
  await options(); await item("provider"); await chooseModel("glm", "glm-4.7-flash");
  await click("[data-advanced-prompt-toggle]"); await wait("document.querySelector('[data-prompt-tab-input]')");
  return run("Array.from(document.querySelectorAll('[data-prompt-tab]')).map(button=>button.dataset.promptTab)");
}
async function checkAssemblyNegative() {
  const negative = "[data-prompt-assistant=negative-prompt-editor]"; await run("document.querySelector('#negative-prompt-editor').textContent='模糊画面'");
  const previous = requests.length; await click(`${negative} [data-assistant-translate]`); await fixtureRequest(previous); complete("blurry image");
  await wait("document.querySelector('#negative-prompt-editor').textContent==='blurry image'");
  smoke.check("Negative prompt translation writes only to the negative editor", await run("document.querySelector('[data-prompt-tab-input]').value==='first category description'"));
  const truncated = requests.length; await click(`${negative} [data-assistant-translate]`); await fixtureRequest(truncated); complete("incomplete output", 200, "length");
  await wait("document.body.textContent.includes('输出超过长度限制')");
  smoke.check("Truncated model output cannot replace the original text", await run("document.querySelector('#negative-prompt-editor').textContent==='blurry image'"));
}
async function checkAssemblyPersistence(ids) {
  for (let i = 0; i < 100 && !userData.createForm?.advancedPrompt; i++) await delay(50);
  win.reload(); await delay(100); await wait("document.querySelector('[data-prompt-assistant]')");
  const persisted = await run("window.electronAPI.promptSecretStatus({provider:'glm',baseUrl:''})");
  smoke.check("Credentials and edited custom instructions survive reload", persisted.success && persisted.data.configured && userData.promptAssistant.presets.some(preset => preset.name === "Edited instruction" && preset.instruction === "Return concise English tags."));
  await wait(`document.querySelector('[data-prompt-tab]')?.dataset.promptTab===${JSON.stringify(ids[1])}`);
  smoke.check("Prompt group queue survives document hydration", await run("document.querySelector('#prompt-editor').textContent==='other category description, first category description'"));
  await click("[data-advanced-prompt-toggle]");
  await wait("document.querySelector('[data-prompt-assistant=prompt-editor]')");
}
async function checkPromptOrder(ids) {
  await require("./lib/check-prompt-order-editor")({ win, run, wait, click, delay, ids,
    check: smoke.check, capture, setTheme: setOrderTheme,
    savedIds: () => userData.createForm.promptTabs.map(tab => tab.id) });
}
async function setOrderTheme(theme) {
  await click("[data-theme-trigger]");
  await wait(`document.querySelector('[data-theme-option=${theme}]')`);
  await click(`[data-theme-option=${theme}]`);
  await wait(`document.documentElement.dataset.theme==='${theme}'&&!document.documentElement.classList.contains('theme-ripple')&&matchMedia('(prefers-color-scheme: dark)').matches===${theme === "dark"}`);
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
}
async function checkEuzhi() {
  await wait("document.querySelector('[data-advanced-prompt-toggle]')");
  if (await run("document.querySelector('[data-advanced-prompt-toggle]').getAttribute('aria-checked')==='true'")) await click("[data-advanced-prompt-toggle]");
  await wait("document.querySelector('[data-prompt-assistant=prompt-editor] [data-assistant-options]')");
  await run("window.electronAPI.agentClearSecret('euzhi')");
  const agentBefore = JSON.stringify(userData.agentPreferences);
  await options(); await item("provider"); await chooseModel("euzhi", "grok-4.7"); await text("moonlit landscape"); await translation();
  await wait("document.body.textContent.includes('设置 → API 密钥 → 提示词助手')");
  smoke.check("Euzhi missing key preserves draft without reusing GLM credentials", euzhiRequests.length === 0 && await run("document.querySelector('#prompt-editor').textContent==='moonlit landscape'"));
  // 模型选择与两业务请求均走页面；凭据共用由正式 IPC 核对，不访问用户真实密钥。
  await run("window.electronAPI.agentSetSecret('fixture-euzhi-key','euzhi')");
  smoke.check("Agent saves the same Euzhi credential visible to transcreation", (await run("window.electronAPI.promptSecretStatus({provider:'euzhi',baseUrl:''})")).data.configured);
  await text("moonlit landscape"); await translation(); await wait("document.querySelector('#prompt-editor').textContent==='euzhi translated tags'");
  smoke.check("Euzhi receives fixed endpoint auth, Agent Grok model and selected instruction", euzhiRequests.length === 1 && euzhiRequests[0].authorized && euzhiRequests[0].body.model === "grok-4.7" && euzhiRequests[0].body.messages[1].content === "moonlit landscape");
  smoke.check("Choosing Euzhi for creation does not switch Agent or persist a key", JSON.stringify(userData.agentPreferences) === agentBefore && !JSON.stringify(userData).includes("fixture-euzhi-key"));
  await checkEuzhiPersistence();
}
async function checkEuzhiPersistence() {
  await options(); await item("provider"); await capture("prompt-euzhi-provider"); await chooseModel("euzhi", "grok-4.7");
  win.reload(); await wait("document.querySelector('[data-prompt-assistant=prompt-editor]')"); await options(); await item("provider");
  smoke.check("Euzhi supplier selection survives reload", userData.promptAssistant.provider === "euzhi" && await run("!!document.querySelector('[data-assistant-item=euzhi] svg')"));
  await chooseModel("glm", "glm-4.7-flash"); await run("window.electronAPI.agentClearSecret('euzhi')");
  smoke.check("Clearing Euzhi in Agent also clears prompt credentials", !(await run("window.electronAPI.promptSecretStatus({provider:'euzhi',baseUrl:''})")).data.configured);
  const invalid = await run("window.electronAPI.transformPrompt({provider:'euzhi',baseUrl:'https://elsewhere.invalid',model:'grok-imagine-image',text:'x',instruction:'x'})");
  smoke.check("Euzhi rejects image model IDs through production IPC validation", !invalid.success && invalid.code === "INVALID_ARGUMENT");
}
async function checkMaskOrder() {
  const before = JSON.stringify(userData.createForm.promptTabs);
  await run("[...document.querySelectorAll('[data-create-mode-tabs] button')].find(b=>b.textContent.trim()==='编辑').click()");
  await click("#mask-edit-tab");
  await click("[data-mask-advanced]");
  await wait("document.querySelector('[data-mask-assembly] [data-prompt-tab-input]')");
  smoke.check("Mask queue starts independently from the reordered image queue", await run("document.querySelector('[data-mask-assembly] [data-prompt-tab]').dataset.promptTab==='quality'"));
  await input("[data-mask-assembly] [data-prompt-tab-input]", "mask quality");
  await click("[data-mask-assembly] [data-prompt-tab=shot]");
  await input("[data-mask-assembly] [data-prompt-tab-input]", "mask camera");
  await click("[data-mask-assembly] [data-prompt-sort-toggle]");
  await require("./lib/check-prompt-drag").drag(win, run, "shot", "quality");
  smoke.check("Mask order stays uncommitted until Done", await run("document.querySelector('#mask-positive').textContent==='mask quality, mask camera'"));
  await click("[data-mask-assembly] [data-prompt-sort-done]");
  await wait("document.querySelector('#mask-positive').textContent==='mask camera, mask quality'");
  smoke.check("Mask ordering updates its instruction and preserves image groups", before === JSON.stringify(userData.createForm.promptTabs));
  await capture("prompt-group-order-mask");
}
async function moveCascadePointer(id, select = false) {
  const { x, y } = await run(`(() => {
    const rect = document.querySelector('[data-assistant-item="${id}"]').getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`);
  const dispatch = (type, button, clickCount) => win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, x, y, button, clickCount });
  await dispatch('mouseMoved', 'none', 0);
  if (select) {
    await dispatch('mousePressed', 'left', 1);
    await dispatch('mouseReleased', 'left', 1);
  }
}

/** 右侧刚好能放一列时也要提前定向。用 Chromium 鼠标事件跨过相邻分类再点第三级。 */
async function checkCascadePointerHandoff(direction, left) {
  const anchor = `document.querySelector('${TOOL}')`;
  const original = await run(`(() => { const element = ${anchor}; const style = element.getAttribute('style');
    Object.assign(element.style, { position: 'fixed', left: '${left}px', top: '460px', right: 'auto', bottom: 'auto' });
    window.dispatchEvent(new Event('resize')); return style;
  })()`);
  try {
    await wait(`document.querySelector('[data-prompt-assistant-menu]').dataset.submenuDirection==='${direction}'`);
    await moveCascadePointer('presets');
    await wait("document.querySelector('[data-assistant-item=presets-minimax]')");
    await moveCascadePointer('provider');
    await moveCascadePointer('presets-minimax');
    await wait("document.querySelector('[data-assistant-item=minimax-h3-base]')");
    // 经过相邻分类后进入当前子列，切换计时必须已取消，停一会仍能点中原选项。
    await moveCascadePointer('presets-general');
    await moveCascadePointer('minimax-h3-base');
    await delay(300);
    smoke.check(`Mouse can reach the third menu column on the ${direction}`, await run(`document.querySelector('[data-prompt-assistant-menu]').dataset.submenuDirection==='${direction}' && document.querySelector('[data-assistant-item=minimax-h3-base]').matches(':hover')`));
    await moveCascadePointer('minimax-h3-base', true);
    await wait("!document.querySelector('[data-prompt-assistant-menu]')");
    smoke.check(`Mouse selection saves the hovered preset on the ${direction}`, userData.promptAssistant.presetId === 'minimax-h3-base');
  } finally {
    await run(`(() => { const element = ${anchor}; const style = ${JSON.stringify(original)};
      if (style === null) element.removeAttribute('style'); else element.setAttribute('style', style);
      window.dispatchEvent(new Event('resize'));
    })()`);
  }
}

async function checkCascadeLayout() {
  const geometry = () => run("(()=>{const r=document.querySelector('[data-assistant-column=\"0\"]').getBoundingClientRect();return [r.left,r.top,r.width,r.height].join(',')})()");
  await delay(250);
  const first = await geometry(); await item("presets"); await wait("document.querySelector('[data-assistant-item=presets-general]')");
  smoke.check("Root position and height stay fixed when a taller submenu opens", first === await geometry());
  smoke.check("Preset submenu uses extra height and scrolls within the viewport", await run("(()=>{const r=document.querySelector('[data-assistant-column=\"0\"]').getBoundingClientRect();const child=document.querySelector('[data-assistant-column=\"1\"]');const c=child.getBoundingClientRect();return c.height>r.height&&c.bottom<=innerHeight&&child.scrollHeight>child.clientHeight})()"));
  await capture("prompt-assistant-scroll"); await item("provider");
  smoke.check("Child columns open right when there is space", await run("document.querySelector('[data-prompt-assistant-menu]').dataset.submenuDirection==='right'&&document.querySelector('[data-assistant-column=\"1\"]').getBoundingClientRect().left>=document.querySelector('[data-assistant-column=\"0\"]').getBoundingClientRect().right"));
  const style = await run(`(()=>{const anchor=document.querySelector('${TOOL}');const previous=anchor.getAttribute('style');anchor.style.position='fixed';anchor.style.left=(innerWidth-45)+'px';anchor.style.top='300px';anchor.style.right='auto';anchor.style.bottom='auto';window.dispatchEvent(new Event('resize'));return previous})()`);
  await wait("document.querySelector('[data-prompt-assistant-menu]').dataset.submenuDirection==='left'");
  await wait("(()=>{const columns=Array.from(document.querySelectorAll('[data-assistant-column]')).map(el=>el.getBoundingClientRect());return columns[1].right<=columns[0].left&&columns.every(r=>r.left>=0&&r.right<=innerWidth)})()");
  smoke.check("Child columns flip left without exceeding the window", true);
  const leftRoot = await geometry(); await item("presets"); await wait("document.querySelector('[data-assistant-item=presets-general]')");
  smoke.check("Left-opening tall submenu also leaves the root unchanged", leftRoot === await geometry());
  await capture("prompt-assistant-left");
  await run(`(()=>{const anchor=document.querySelector('${TOOL}');${style === null ? "anchor.removeAttribute('style')" : `anchor.setAttribute('style',${JSON.stringify(style)})`};window.dispatchEvent(new Event('resize'))})()`);
  await item("provider");
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app }); await startServer();
  win = new BrowserWindow({ ...windowChromeOptions(), show: false, width: 1500, height: 1000, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } }); win.webContents.debugger.attach("1.3");
  try { await win.loadURL("app://app/create"); await wait("document.querySelector('[data-prompt-assistant]')"); await delay(300); await run("Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='知道了')?.click()");
    const history = require("./lib/check-prompt-translation-history"), context = historyContext();
    await history.checkEmpty(context);
    await checkBasics(); await checkConflicts(); await history.checkResults(context);
    await require('./lib/check-preset-copy').checkPresetCopy({ options, item, capture, text, translation, fixtureRequest, complete: (...args) => complete(...args), run, wait, check: smoke.check,
      requestCount: () => requests.length, request: index => requests[index], focus: context.focus, reload: context.reload, win });
    await require('./lib/check-h3-transcreation').checkH3Presets({ options, item, capture, text, translation, fixtureRequest, complete: (...args) => complete(...args), run, wait, check: smoke.check,
      requestCount: () => requests.length, request: index => requests[index], undo: () => click(`${TOOL} [data-assistant-undo]`),
      reload: async () => { win.reload(); await delay(100); await wait(`document.querySelector('${TOOL}')`); } });
    await checkPresetsAndCustom(); await checkPresetEditing(); await checkAppearance(); await checkAssemblyTargets(); await checkPresetDeletion(); await checkEuzhi(); await history.checkPersistence(context); await checkMaskOrder();
    await require("./lib/check-prompt-image-api").checkPromptImageApi({ run, check: smoke.check, requests, complete: (...args) => complete(...args), fixtureRequest });
  } finally { win.destroy(); server.close(); global.fetch = originalFetch; }
  smoke.finish({ app, ok: smoke.allPassed() });
}
function historyContext() {
  return {
    run, wait, click, capture, toolbar: TOOL, check: smoke.check, setTheme: setOrderTheme,
    copyShortcut: () => {
      const modifiers = [process.platform === 'darwin' ? 'meta' : 'control'];
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'C', modifiers });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'C', modifiers });
    },
    focus: async () => { win.show(); win.focus(); win.webContents.focus(); await wait("document.hasFocus()"); },
    history: () => userData.promptAssistant.history ?? [], requestCount: () => requests.length,
    waitSaved: async count => { for (let i = 0; i < 100 && userData.promptAssistant.history?.length !== count; i++) await delay(50); },
    reload: async () => { await win.loadURL("app://app/create"); await wait(`document.querySelector('${TOOL}')`); },
    metrics: width => width ? win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false }) : win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride"),
  };
}
main().catch(async error => { console.error(error.message); if (win && !win.isDestroyed()) { await capture("prompt-assistant-failure").catch(() => {}); win.destroy(); } server?.close(); global.fetch = originalFetch; smoke.finish({ app, ok: false, error }); });

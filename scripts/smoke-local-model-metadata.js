/** 本地来源 JSON 的真实 IPC 与 UI 回归：版本隔离、异常文件、LoRA 普通/高级提示词追加及去重。 */
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { app, BrowserWindow } = require("electron");
const { createSmokeHarness } = require("./lib/smoke-harness");
const { registerHandle } = require("../apps/electron/ipcHandlers");
const { IPC_CHANNELS: C } = require("../apps/electron/ipcChannels");
const smoke = createSmokeHarness({ name: "local-model-metadata", timeoutMs: 100000 });
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ir-model-metadata-"));
const root = path.join(directory, "models"), run = smoke.createRun();
const document = require("./lib/guest-session-fixture").withGuestSession({ version: 1, settings: { theme: "light", locale: "zh-CN", paths: { searchPath: root } } });
const waitTime = ms => new Promise(resolve => setTimeout(resolve, ms));
function fixture(relative, data) {
  const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.alloc(32));
  if (data !== undefined) fs.writeFileSync(file + ".civitai.json", typeof data === "string" ? data : JSON.stringify(data));
  return file;
}
const metadata = { version: 1, source: "Civitai", sourceTitle: "Source A", creator: "Author A", modelPageUrl: "https://civitai.red/models/1?modelVersionId=101&token=secret-fixture", trainedWords: ["fixture style", "shared word"], description: "<p>Model description</p><script>window.BAD_METADATA=true</script>", versionName: "Version A", sha256: "a".repeat(64) };
const a = fixture("loras/Anima/style/Alpha/a.safetensors", metadata);
const b = fixture("loras/Anima/style/Beta/b.safetensors", { ...metadata, trainedWords: ["shared word", "second word"], sourceTitle: "Source B" });
const missing = fixture("loras/Anima/style/Alpha/z-missing.safetensors");
fixture("diffusion_models/Anima/base.safetensors");
app.disableHardwareAcceleration(); app.setPath("userData", path.join(directory, "browser"));
smoke.setWorkDir(directory); smoke.installWatchdog(app);
require("../apps/electron/userData").readUserData = () => ({ data: document, filePath: "", isNew: false });
require("../apps/electron/appProtocol").registerAppProtocol();
require("../apps/electron/ipc-handlers/models.handlers").registerModelHandlers();
require("../apps/electron/ipc-handlers/window.handlers").registerThemeHandlers();
for (const [channel, handler] of [
  [C.USER_DATA_READ, () => ({ data: document, filePath: "", isNew: false })], [C.USER_DATA_WRITE, () => undefined],
  [C.USER_DATA_GET_DEFAULT_PATH, () => ""], [C.PATHS_GET_DEFAULT_OUTPUT, () => directory], [C.CHANGELOG_READ, () => ""],
  [C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHORIZED" } })],
  [C.MODELS_DOWNLOAD_LIST, () => []], [C.COMFY_LIST_MODELS, () => ({ checkpoints: [], loras: [], diffusionModels: [], clips: [], vaes: [] })],
  [C.FILES_LIST_GENERATED_IMAGES, () => []], [C.FILES_LIST_OUTPUT_FOLDERS, () => []], [C.FILES_READ_IMAGE_DATA_URL, () => null],
]) registerHandle(channel, handler);
async function wait(expression) {
  for (let i = 0; i < 180; i++) { if (await run(`Boolean(${expression})`)) return; await waitTime(50); }
  throw new Error("Condition timeout: " + expression + " · " + await run("document.body.innerText.slice(-1800)"));
}
async function click(selector) { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await waitTime(80); }
async function nativeRead(paths) { return run(`window.electronAPI.readLocalModelMetadata(${JSON.stringify(paths)})`); }
async function verifyNative() {
  const malformed = fixture("tests/bad.safetensors", "{bad");
  const future = fixture("tests/future.safetensors", { version: 999 });
  const huge = fixture("tests/huge.safetensors", " ".repeat(2 * 1024 * 1024 + 1));
  const result = await nativeRead([a, missing, malformed, future, huge, path.join(directory, "outside.safetensors")]);
  smoke.check("real IPC distinguishes ready, missing, invalid, unsupported, oversized and outside paths", result.success && result.data.map(item => item.status).join(",") === "ready,missing,invalid,unsupported,invalid,unavailable");
  smoke.check("source URLs strip credentials before crossing IPC", result.data[0].metadata.modelPageUrl === "https://civitai.red/models/1?modelVersionId=101");
  for (const input of [[], [1], Array(201).fill(a)]) {
    const bad = await nativeRead(input); smoke.check("IPC rejects invalid batch arguments", !bad.success && bad.code === "INVALID_ARGUMENT");
  }
  const absent = (await nativeRead([missing])).data[0];
  smoke.check("missing version never borrows sibling JSON", absent.status === "missing" && absent.metadata === null);
  const linked = fixture("tests/link.safetensors");
  try {
    fs.symlinkSync(a + ".civitai.json", linked + ".civitai.json");
    smoke.check("linked sidecars cannot read another model's JSON", (await nativeRead([linked])).data[0].status === "invalid");
  } catch (error) { if (error.code === "EPERM") console.log("SKIP symlink fixture: OS requires symlink privilege"); else throw error; }
}
async function verifyDetails(win) {
  await win.loadURL("app://app/tools/models/civitai");
  await wait("document.querySelector('[data-model-library=local]')");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await click("[data-model-library=local]"); await wait("document.querySelector('[data-local-model-card]')");
  await run("[...document.querySelectorAll('[data-local-model-card]')].find(el=>el.textContent.includes('Alpha')).click()");
  await wait("document.querySelector('[data-local-model-metadata]')?.dataset.status==='ready'");
  smoke.check("local details show source, triggers and safe plain descriptions", await run("(()=>{const el=document.querySelector('[data-local-model-metadata]');return ['Civitai','Source A','Author A','fixture style','Model description'].every(text=>el.textContent.includes(text))&&!el.querySelector('script')&&!window.BAD_METADATA})()"));
  await click("[data-local-model-metadata] button");
  await run("[...document.querySelectorAll('[role=option]')].find(el=>el.textContent.includes('z-missing')).click()");
  await wait("document.querySelector('[data-local-model-metadata]')?.dataset.status==='missing'");
  smoke.check("switching to version without JSON clears old source details", await run("!document.querySelector('[data-local-metadata-content]')&&!document.querySelector('[data-local-trigger-words]')"));
}
async function addLora(name) {
  await run("[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='添加扩展').click()");
  await wait("document.querySelector('[data-lora-model-picker]')"); await click("[data-lora-model-picker]");
  await wait("document.querySelector('[data-lora-model-option]')");
  await run(`[...document.querySelectorAll('[data-lora-model-option]')].find(el=>el.textContent.includes(${JSON.stringify(name)})).querySelector('[data-resource-model-select]').click()`);
  await wait("!document.querySelector('[aria-labelledby=model-version-dialog-title]')"); await click("[data-resource-confirm]");
  await wait("document.querySelector('[data-apply-lora-triggers]')");
}
async function setTab(text) {
  await run(`(()=>{const el=document.querySelector('[data-prompt-tab-input]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await waitTime(100);
}
async function verifyTriggers(win) {
  await win.loadURL("app://app/create"); await wait("document.querySelector('#prompt-editor')");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await waitTime(500);
  smoke.check("no trigger button without a selected LoRA", await run("!document.querySelector('[data-apply-lora-triggers]')"));
  await addLora("Alpha"); await addLora("Beta");
  await run("document.querySelector('#prompt-editor').textContent='existing prompt, FIXTURE STYLE'");
  await click("[data-apply-lora-triggers]");
  const expected = "existing prompt, FIXTURE STYLE, shared word, second word";
  smoke.check("normal mode preserves existing text and deduplicates selected LoRA words", await run(`document.querySelector('#prompt-editor').textContent===${JSON.stringify(expected)}`));
  await click("[data-apply-lora-triggers]");
  smoke.check("repeat application is idempotent", await run(`document.querySelector('#prompt-editor').textContent===${JSON.stringify(expected)}`));
  await click("[data-advanced-prompt-toggle]"); await wait("document.querySelector('[data-prompt-tab-input]')");
  const tabs = await run("[...document.querySelectorAll('[data-prompt-tab]')].map(el=>el.dataset.promptTab)");
  await click(`[data-prompt-tab="${tabs[0]}"]`); await setTab("fixture style");
  await click(`[data-prompt-tab="${tabs[1]}"]`); await setTab("my character");
  await click("[data-apply-lora-triggers]");
  const advanced = "my character, shared word, second word";
  smoke.check("advanced mode appends into active category and deduplicates across categories", await run(`document.querySelector('[data-prompt-tab-input]').value===${JSON.stringify(advanced)}`));
  await click("[data-apply-lora-triggers]");
  smoke.check("advanced mode repeat is idempotent", await run(`document.querySelector('[data-prompt-tab-input]').value===${JSON.stringify(advanced)}`));
  await click(`[data-prompt-tab="${tabs[0]}"]`);
  smoke.check("other prompt category remains unchanged", await run("document.querySelector('[data-prompt-tab-input]').value==='fixture style'"));
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  const win = new BrowserWindow({ width: 1500, height: 950, show: false, webPreferences: { offscreen: true, preload: path.join(__dirname, "../apps/electron/preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  smoke.attachWebContents(win.webContents);
  try { await verifyDetails(win); await verifyNative(); await verifyTriggers(win); }
  finally { win.destroy(); }
  smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch(error => { console.error(error.message); smoke.finish({ app, ok: false, error }); });

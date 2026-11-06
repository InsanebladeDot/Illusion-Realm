/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * window-chrome：复用同一份窗口装饰配置与启动参数。
 * protocol：使用客户端的 app:// 与 localfile:// 协议实现。
 * window.handlers：窗口和主题 IPC 隶属 core 的系统交互边界。
 * index：窗口加载迁移后的真实 preload 桥接文件。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * window-chrome：窗口样式和传给 preload 的标记必须配套，不能各自猜测当前装饰模式。
 * protocol：Next 静态资源含绝对 URL，必须保持应用同源加载。
 * window.handlers：handler 仍通过统一结果封装注册，不因移动改变参数和错误码。
 * index：contextIsolation 保持启用，CommonJS 本地依赖仍需要 sandbox 为 false。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 */
/** 内容访问回归：隔离用户文档和网络，用纯色占位图验证协议门槛、持久化、分页与预览过滤。 */
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), vm = require("node:vm");
const { app, BrowserWindow, protocol, nativeImage } = require("electron");
const ts = require("../apps/next/node_modules/typescript");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/src/main/core/windows/window-chrome");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "civitai-content", timeoutMs: 90000 });
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ir-content-access-"));
let document = require("./lib/guest-session-fixture").withGuestSession({ version: 1, settings: { paths: {}, theme: "light", locale: "zh-CN" } });
const requests = [], errors = [];
const cover = nativeImage.createFromBitmap(Buffer.from([42, 100, 200, 255]), { width: 1, height: 1 }).toPNG();
app.disableHardwareAcceleration(); app.setPath("userData", path.join(directory, "browser"));
smoke.setWorkDir(directory); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
registerHandle(C.USER_DATA_READ, () => ({ data: document, filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, (_event, next) => { document = next; });
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => "");
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => directory);
registerHandle(C.MODELS_DOWNLOAD_LIST, () => ({ revision: 0, tasks: [] }));
registerHandle(C.CHANGELOG_READ, () => "");
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHORIZED" } }));
for (const key of [C.CIVITAI_KEY_STATUS, C.AGENT_SECRET_STATUS, C.PROMPT_SECRET_STATUS]) registerHandle(key, () => ({ configured: false, source: "none", protection: "", tail: "" }));
const run = smoke.createRun(), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function model(id, nsfw) {
  return { id, name: `Fixture ${id}`, type: "LORA", nsfw, modelVersions: [{ id, name: "v1", images: [{ type: "image", nsfw: true, nsfwLevel: 16, url: "https://image.civitai.com/fixture.png" }] }] };
}
async function api(request) {
  const url = new URL(request.url);
  if (!url.pathname.includes("/api/v1/models")) return new Response(cover, { headers: { "Content-Type": "image/png" } });
  requests.push(url);
  return new Response(JSON.stringify({ items: [model(1, false), model(2, true)], metadata: {} }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
async function wait(source) {
  for (let attempt = 0; attempt < 100; attempt++) { if (await run(`Boolean(${source})`)) return; await delay(60); }
  throw new Error("Content condition timed out: " + source);
}
async function click(selector) { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(60); }
async function settings(win) {
  await win.loadURL("app://app/settings"); await wait("document.querySelector('[data-nsfw-toggle]')"); await delay(150);
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await wait("!document.querySelector('[aria-labelledby=update-announcement-title]')");
}
async function library(win) { const count = requests.length; await win.loadURL("app://app/tools/models/civitai"); await wait("document.querySelector('[data-civitai-card]')"); smoke.check("catalog makes a new request", requests.length > count); }
function loadTs(file, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, URL, URLSearchParams, AbortController, require: () => ({ t: key => key }), ...globals });
  return module.exports;
}
async function verifyContract() {
  const access = loadTs("packages/shared/src/types/content-access.ts");
  for (const invalid of [null, { enabled: true }, { enabled: true, agreementVersion: 0, acceptedAt: 1 }, { enabled: true, agreementVersion: 1, acceptedAt: "1" }]) {
    smoke.check("missing or obsolete agreement cannot enable access", !access.resolveCivitaiContentAccess(invalid).enabled);
  }
  let requested;
  const civitai = loadTs("apps/next/src/utils/civitai.ts", { fetch: async url => { requested = url; return { ok: true, json: async () => url.pathname.endsWith("/2") ? model(2, true) : { items: [model(1, false), model(2, true)], metadata: {} } }; } });
  const filters = { source: "https://civitai.red", query: "", type: "LORA", base: "", sort: "Most Downloaded" };
  for (const enabled of [false, true]) {
    const page = await civitai.fetchCivitai({ ...filters, allowNsfw: enabled }, `https://civitai.red/api/v1/models?page=2&nsfw=${!enabled}`, new AbortController().signal);
    smoke.check("pagination uses current preference instead of stale nextPage", requested.searchParams.get("nsfw") === String(enabled));
    smoke.check("model and preview parsing follow the same preference", page.models.length === (enabled ? 2 : 1) && page.models[0].versions[0].images.length === (enabled ? 1 : 0));
  }
  const direct = await civitai.fetchCivitai({ ...filters, query: "2" }, null, new AbortController().signal);
  smoke.check("direct model lookup remains filtered when disabled", direct.models.length === 0);
}
async function verifyUi(win) {
  await settings(win);
  smoke.check("legacy documents default to NSFW off", await run("document.querySelector('[data-nsfw-toggle]').getAttribute('aria-checked')==='false'"));
  await click("[data-settings-category=models]");
  smoke.check("content access is in model settings", await run("Boolean(document.querySelector('#content-access'))"));
  await click("[data-nsfw-toggle]");
  smoke.check("accept is disabled until agreement checkbox is checked", await run("document.querySelector('[data-nsfw-accept]').disabled&&document.querySelector('[data-nsfw-toggle]').getAttribute('aria-checked')==='false'"));
  await delay(250); fs.writeFileSync(path.join(directory, "agreement-light.png"), (await win.webContents.capturePage()).toPNG());
  await click("[data-nsfw-accept]");
  smoke.check("disabled accept cannot enable access", !document.settings.civitaiContentAccess?.enabled);
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" }); win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await wait("!document.getElementById('civitai-content-agreement')");
  smoke.check("Escape cancels without consent", !document.settings.civitaiContentAccess?.enabled);
  await click("[data-nsfw-toggle]"); await click("[data-nsfw-acknowledge]");
  await click("[aria-labelledby=civitai-content-agreement] button");
  await click("[data-nsfw-toggle]");
  smoke.check("cancelled checkbox draft is not reused", await run("!document.querySelector('[data-nsfw-acknowledge]').checked&&document.querySelector('[data-nsfw-accept]').disabled"));
  await click("[data-nsfw-acknowledge]"); await click("[data-nsfw-accept]"); await delay(450);
  smoke.check("consent stores version, timestamp and preference", document.settings.civitaiContentAccess?.enabled === true && document.settings.civitaiContentAccess.agreementVersion === 1 && document.settings.civitaiContentAccess.acceptedAt > 0);
  await settings(win);
  smoke.check("full reload restores approved preference", await run("document.querySelector('[data-nsfw-toggle]').getAttribute('aria-checked')==='true'"));
  await library(win);
  smoke.check("enabled search sends nsfw=true and renders permitted fixture previews", requests.at(-1).searchParams.get("nsfw") === "true" && await run("document.querySelectorAll('[data-civitai-card]').length===2&&Boolean(document.querySelector('[data-civitai-card] img'))"));
  await settings(win); await click("[data-nsfw-toggle]"); await delay(450);
  smoke.check("turning off requires no new agreement", !document.settings.civitaiContentAccess.enabled && await run("!document.getElementById('civitai-content-agreement')"));
  await library(win);
  smoke.check("disabled search sends nsfw=false and filters fixture models and previews", requests.at(-1).searchParams.get("nsfw") === "false" && await run("document.querySelectorAll('[data-civitai-card]').length===1&&!document.querySelector('[data-civitai-card] img')"));
  document.settings.civitaiContentAccess = { enabled: true, agreementVersion: 0, acceptedAt: 1 };
  await settings(win);
  smoke.check("obsolete agreement requires fresh consent after hydration", await run("document.querySelector('[data-nsfw-toggle]').getAttribute('aria-checked')==='false'"));
  document.settings.theme = "dark"; await settings(win); await click("[data-nsfw-toggle]");
  smoke.check("agreement follows dark theme", await run("document.documentElement.dataset.theme==='dark'"));
  win.setSize(650, 500); await delay(250);
  smoke.check("small window keeps agreement and footer inside viewport", await run("(()=>{const d=document.querySelector('[aria-labelledby=civitai-content-agreement]'),r=d.getBoundingClientRect(),b=d.querySelector('[data-nsfw-accept]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&b.bottom<=r.bottom})()"));
  fs.writeFileSync(path.join(directory, "agreement-narrow.png"), (await win.webContents.capturePage()).toPNG());
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app }); await verifyContract();
  protocol.handle("https", api);
  const win = new BrowserWindow({ ...windowChromeOptions(), width: 1350, height: 900, show: false, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  smoke.attachWebContents(win.webContents); const occlusion = await smoke.hardenWindow(win);
  win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  try { await verifyUi(win); smoke.check("no render or hydration errors", !errors.some(message => /while rendering|hydration|Minified React error/.test(message))); }
  finally { occlusion.dispose(); win.destroy(); }
  console.log("CONTENT_SCREENSHOTS", directory); smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch(error => { console.error(error.message); smoke.finish({ app, ok: false }); });

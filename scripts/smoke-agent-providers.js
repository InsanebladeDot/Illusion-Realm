/** 共享模型目录页面回归：使用隔离用户目录和官网替身，不发送真实付费推理。 */
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/src/main/core/windows/window-chrome");
const smoke = require('./lib/smoke-harness').createSmokeHarness({ name: 'agent-providers', timeoutMs: 90000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-agent-provider-ui-'));
process.env.ILLUSION_AGENT_SECRET_DIR = root; delete process.env.ILLUSION_AGENT_API_KEY;
app.setPath('userData', path.join(root, 'browser')); app.disableHardwareAcceleration(); smoke.setWorkDir(root); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/modules/agent/agent.handlers").registerAgentHandlers();
const handlers = require("../apps/electron/src/main/core/windows/window.handlers"); handlers.registerThemeHandlers(); handlers.registerWindowHandlers();
require('./lib/guest-session-fixture').installGuestDocumentFixture();
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false } }));
for (const channel of [C.MODELS_SCAN, C.FILES_LIST_GENERATED_IMAGES, C.FILES_LIST_OUTPUT_FOLDERS]) registerHandle(channel, () => []);
registerHandle(C.MODELS_DOWNLOAD_LIST, () => ({ revision: 0, tasks: [] })); // 图片生成使用独立密钥；本套件只查询空状态，不覆盖用户的图片配置。
registerHandle(C.EUZHI_IMAGE_SECRET_STATUS, () => ({ configured: false, protection: '', tail: '' }));
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root); registerHandle(C.CHANGELOG_READ, () => '');
registerHandle(C.CIVITAI_KEY_STATUS, () => ({ configured: false, protection: '', tail: '' }));
registerHandle(C.PROMPT_SECRET_STATUS, () => ({ configured: false, protection: '', tail: '' }));
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => path.join(root, 'document.json'));
let win, captured, offline = false, priceReads = 0;
registerHandle(C.AGENT_RUN, (_event, options) => { const { config } = JSON.parse(require("../apps/electron/src/main/modules/agent/runner").buildPayloadLine(options)); captured = { provider: config.provider, model: config.model, baseUrl: config.baseUrl, matchingKey: config.apiKey === 'sk-euzhi-ui-2222' }; return { runId: 'provider-ui' }; }, require("../apps/electron/src/main/modules/agent/agent.handlers").validateRunArgs);
global.fetch = async url => {
  if (offline || String(url).includes('siliconflow')) throw new Error('offline');
  if (String(url).includes('docs.bigmodel.cn')) {
    const name = String(url).endsWith('pricing.md') ? 'pricing' : String(url).endsWith('model-overview.md') ? 'model-overview' : 'glm-4';
    return new Response(fs.readFileSync(path.join(__dirname, '../docs/design/glm-model-order-2026-11-17/evidence', name + '.md'), 'utf8'));
  }
  if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'grok-4.7' }, { id: 'grok-4.6' }, { id: 'gpt-5.5' }, { id: 'claude-sonnet-4.6' }] }));
  if (!String(url).endsWith('/api/pricing')) throw new Error('unexpected request');
  priceReads++;
  return new Response(JSON.stringify({ success: true, group_ratio: { grok: 0.8 }, data: ['grok-4.6', 'grok-4.7', 'gpt-5.5', 'claude-sonnet-4.6'].map(model_name => ({ model_name, quota_type: 0, model_ratio: 1, completion_ratio: 3, enable_groups: ['grok'], supported_endpoint_types: ['openai'] })) }));
};
const run = smoke.createRun(), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression) { for (let i = 0; i < 160; i++) { if (await run(`Boolean(${expression})`)) return; await delay(60); } throw new Error('Provider UI wait: ' + expression); }
async function input(selector, value) { await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`); await delay(70); }
async function checkPicker() {
  await win.loadURL('app://app/agent'); await wait("document.querySelector('[data-agent-model]')");
  await wait("document.querySelector('[aria-labelledby=update-announcement-title]')"); await run("document.querySelector('[aria-labelledby=update-announcement-title] button').click()");
  smoke.check('Legacy provider retains model', await run("document.querySelector('[data-agent-model]').dataset.agentModel==='deepseek-ai/DeepSeek-V4-Flash'"));
  await run("document.querySelector('[data-agent-model]').click()"); await wait("document.querySelector('#agent-model-dialog')"); await run("document.querySelector('[data-agent-provider=euzhi]').click()"); await wait("document.querySelectorAll('[data-agent-model-option]').length===4");
  smoke.check('Three shared suppliers are available', await run("document.querySelectorAll('[data-agent-provider]').length===3"));
  smoke.check('Browsing provider does not commit selection', await run("document.querySelector('[data-agent-model]').dataset.agentModel==='deepseek-ai/DeepSeek-V4-Flash'"));
  await delay(350); fs.writeFileSync(path.join(root, 'models-wide.png'), (await win.webContents.capturePage()).toPNG());
  await input('[data-agent-model-search]', '4.7'); smoke.check('Search filters the multi-family catalog', await run("document.querySelectorAll('[data-agent-model-option]').length===1"));
  await run("document.querySelector('[data-agent-model-option]').click()");
  smoke.check('Card selection stays in draft until Apply', await run("!!document.querySelector('#agent-model-dialog')&&document.querySelector('[data-agent-model-option]').getAttribute('aria-pressed')==='true'&&document.querySelector('[data-agent-model]').dataset.agentModel==='deepseek-ai/DeepSeek-V4-Flash'&&!document.querySelector('[data-agent-model-apply]').disabled"));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await wait("!document.querySelector('#agent-model-dialog')");
  await run("document.querySelector('[data-agent-model]').click()"); await wait("document.querySelector('#agent-model-dialog')"); await run("document.querySelector('[data-agent-provider=euzhi]').click()"); await wait("document.querySelectorAll('[data-agent-model-option]').length===4");
  smoke.check('Closing discards the unapplied provider and model', await run("!document.querySelector('[data-agent-model-option][aria-pressed=true]')&&document.querySelector('[data-agent-model-apply]').disabled&&document.querySelector('[data-agent-model]').dataset.agentModel==='deepseek-ai/DeepSeek-V4-Flash'"));
  await run("document.querySelector('[data-agent-model-option=\"grok-4.7\"]').click();document.querySelector('[data-agent-provider=siliconflow]').click()");
  await run("document.querySelector('[data-agent-provider=euzhi]').click()");
  smoke.check('Provider browsing preserves only its local draft', await run("document.querySelector('[data-agent-model-option=\"grok-4.7\"]').getAttribute('aria-pressed')==='true'&&document.querySelector('[data-agent-model]').dataset.agentModel==='deepseek-ai/DeepSeek-V4-Flash'"));
  await delay(200); fs.writeFileSync(path.join(root, 'models-apply.png'), (await win.webContents.capturePage()).toPNG());
  await run("document.querySelector('[data-agent-model-apply]').click()"); await wait("!document.querySelector('#agent-model-dialog')");
  const beforeLogin = priceReads;
  win.webContents.reload(); await wait("document.querySelector('[data-agent-model]')?.dataset.agentModel==='grok-4.7'"); smoke.check('Provider and model survive reload', true);
  for (let i = 0; i < 100 && priceReads === beforeLogin; i++) await delay(30);
  smoke.check('Next session refreshes the official catalog', priceReads > beforeLogin);
  await input('[data-agent-input]', 'test provider'); await run("document.querySelector('[data-agent-send]').click()"); await wait("document.querySelector('[data-agent-key-notice]')"); smoke.check('Missing Euzhi key blocks run and retains draft', !captured && await run("document.querySelector('[data-agent-input]').value==='test provider'"));
}
async function checkSubmission() {
  const summary = await run("window.electronAPI.agentSecretStatus('euzhi')"); smoke.check('Scoped secret returns only summary', summary.success && summary.data.configured && !JSON.stringify(summary).includes('sk-euzhi'));
  await run("window.electronAPI.agentSetSecret('sk-silicon-ui-1111','siliconflow')");
  smoke.check('Invalid provider rejected', await run("window.electronAPI.agentSecretStatus('unknown').then(x=>!x.success&&x.code==='INVALID_ARGUMENT')"));
  smoke.check('Arbitrary endpoint rejected', await run("window.electronAPI.runAgent({question:'test',config:{provider:'euzhi',model:'grok-4.7',baseUrl:'https://invalid.example/v1'}}).then(x=>!x.success&&x.code==='INVALID_ARGUMENT')"));
  smoke.check('Renderer key injection rejected', await run("window.electronAPI.runAgent({question:'test',config:{apiKey:'fake-test'}}).then(x=>!x.success&&x.code==='INVALID_ARGUMENT')"));
  await run("document.querySelector('[data-agent-send]').click()"); await wait("document.querySelector('[data-agent-stop]')");
  smoke.check('Submission routes model endpoint and key together', captured?.provider === 'euzhi' && captured.model === 'grok-4.7' && captured.baseUrl === 'https://euzhi.vip/v1' && captured.matchingKey);
  win.webContents.send(C.AGENT_EVENT, { runId: 'provider-ui', type: 'final', text: 'test complete', steps: 1 });
  await wait("!document.querySelector('[data-agent-stop]')");
  smoke.check('Clearing Euzhi retains SiliconFlow key', await run("window.electronAPI.agentClearSecret('euzhi').then(()=>window.electronAPI.agentSecretStatus('siliconflow')).then(x=>x.success&&x.data.configured)"));
}
async function checkSettings() {
  await run("document.querySelector('[data-agent-key-notice-link]').click()"); await wait("document.querySelector('#agent-api-key')");
  await input('#agent-api-key', 'unsaved-test-key'); await run("document.querySelector('[data-agent-provider=siliconflow]').click()"); await wait("document.querySelector('[data-agent-provider=siliconflow]').getAttribute('aria-pressed')==='true'");
  smoke.check('Switching provider discards unsaved key draft', await run("document.querySelector('#agent-api-key').value===''") );
  await run("document.querySelector('[data-agent-provider=euzhi]').click()"); await wait("document.querySelector('[data-agent-provider=euzhi]').getAttribute('aria-pressed')==='true'");
  await input('#agent-api-key', 'sk-euzhi-ui-2222'); await run("document.querySelector('[data-agent-key-save]').click()"); await wait("document.querySelector('[data-agent-key-status]').dataset.agentKeyStatus==='configured'");
  smoke.check('Settings clears saved key input', await run("document.querySelector('#agent-api-key').value===''") );
  await win.loadURL('app://app/settings?provider-preview=1#agent'); await wait("document.querySelector('[data-agent-key-status]')?.dataset.agentKeyStatus==='configured'");
  win.webContents.invalidate(); await delay(500); fs.writeFileSync(path.join(root, 'provider-settings.png'), (await win.webContents.capturePage()).toPNG());
  await win.loadURL('app://app/agent'); await wait("document.querySelector('[data-agent-model]')?.dataset.agentModel==='grok-4.7'"); await input('[data-agent-input]', 'test provider');
}
async function checkNarrow() {
  win.setSize(900, 850); await delay(120); await run("document.querySelector('[data-agent-model]').click()"); await wait("document.querySelector('#agent-model-dialog')");
  smoke.check('Narrow dialog stays inside viewport', await run("(()=>{const r=document.querySelector('[data-resource-dialog=agent-model-dialog]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1})()"));
  smoke.check('Compact dialog aligns to actual main inset', await run("Math.abs(document.querySelector('[data-resource-dialog=agent-model-dialog]').getBoundingClientRect().left-document.querySelector('[data-app-main]').getBoundingClientRect().left)<1"));
  await wait("!document.querySelector('[data-agent-catalog-refresh]').disabled"); offline = true; await run("document.querySelector('[data-agent-catalog-refresh]').click()"); await wait("[...document.querySelectorAll('[data-resource-dialog=agent-model-dialog] [role=status]')].some(e=>e.textContent.includes('刷新失败'))");
  smoke.check('Failed refresh keeps Grok choices', await run("document.querySelectorAll('[data-agent-model-option]').length===4")); await delay(200); fs.writeFileSync(path.join(root, 'models-narrow.png'), (await win.webContents.capturePage()).toPNG());
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await wait("!document.querySelector('#agent-model-dialog')"); smoke.check('Escape restores conversation', await run("document.querySelector('[data-agent-answer]')?.textContent.includes('test complete')"));
}
async function checkGlmOrder() {
  await run("document.querySelector('[data-agent-model]').click()");
  await wait("document.querySelector('#agent-model-dialog')");
  await run("document.querySelector('[data-agent-provider=glm]').click()");
  // 官网会补充型号；等目标卡片出现，不把旧目录数量当作加载条件。
  await wait("document.querySelector('[data-agent-model-option=\"glm-4.7-flash\"]')");
  await require('./lib/check-agent-model-order').checkAgentModelOrder({
    run, wait, check: smoke.check,
    capture: async name => {
      await delay(250);
      fs.writeFileSync(path.join(root, name + '.png'), (await win.webContents.capturePage()).toPNG());
    },
  });
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await wait("!document.querySelector('#agent-model-dialog')");
}
// 同一个黑卡片要能用于 nav、head 和模型入口；聚焦只展示提示，不点击窗口动作。
async function checkSharedHints() {
  win.show(); win.focus(); win.webContents.focus(); await wait('document.hasFocus()');
  for (const selector of ['[data-sidebar-toggle]', '[data-window-control=minimize]', '[data-agent-model]']) {
    await run(`document.querySelector('${selector}').focus()`);
    await wait("document.querySelectorAll('[data-hover-tip][data-visible=true]').length===1");
    smoke.check(`Shared hint follows keyboard focus: ${selector}`, await run(`(()=>{const tip=document.querySelector('[data-hover-tip][data-visible=true]');return getComputedStyle(tip).backgroundColor==='rgb(5, 5, 5)'&&!document.querySelector('${selector}').hasAttribute('title')})()`));
  }
  await wait("getComputedStyle(document.querySelector('[data-hover-tip][data-visible=true]')).opacity==='1'");
  fs.writeFileSync(path.join(root, 'shared-tooltip.png'), (await win.webContents.capturePage()).toPNG());
  await run("document.querySelector('[data-agent-input]').focus()");
  await wait("!document.querySelector('[data-hover-tip][data-visible=true]')");
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  win = new BrowserWindow({ ...windowChromeOptions(), show: false, width: 1280, height: 900, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  smoke.attachWebContents(win.webContents); const occlusion = await smoke.hardenWindow(win);
  try { await checkPicker(); await checkGlmOrder(); await require('./lib/check-agent-image-capability').checkAgentImageCapability({ run, wait, check: smoke.check }); await checkSettings(); await checkSubmission(); await checkNarrow(); await checkSharedHints(); console.log('PROVIDER_SCREENSHOTS', root); }
  finally { occlusion.dispose(); win.destroy(); }
  smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch(error => { console.error(error.message); smoke.finish({ app, ok: false, error }); });

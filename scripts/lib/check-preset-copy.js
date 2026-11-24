/** 复用正式提示词页面；实际剪贴板与请求逐字比对完整指令，外部推理仍由原套件模拟。 */
const path = require('node:path');
const { clipboard } = require('electron');
const { load } = require('./load-director-source');
const { ANIMA_INSTRUCTION } = load(path.resolve(__dirname, '../../apps/next/src/data/anima-instruction.ts'));
const messages = load(path.resolve(__dirname, '../../apps/next/src/i18n/locales/zh-CN/create.ts')).create.promptAssistant;

// Windows 剪贴板会把换行变成 CRLF，只统一换行符，正文和空行仍逐字核对。
function copiedText() { return clipboard.readText().replace(/\r\n/g, '\n'); }

// 每条预设都走真实菜单。先停留在名称上，再点「查看」，避免把悬停误算成点击打开。
async function checkPresetView(ctx, id, expected) {
  const row = `[data-assistant-item="${id}"]`;
  const previewed = await ctx.run(`(async () => {
    const button = document.querySelector(${JSON.stringify(row)});
    button.focus();
    button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    // 等过悬停说明的延时，确认名称行没有自行弹出正文。
    await new Promise(resolve => setTimeout(resolve, 320));
    const tips = [...document.querySelectorAll('[data-hover-tip][data-visible=true]')];
    return !!document.querySelector('[data-preset-reader]') || tips.some(tip =>
      tip.textContent === button.textContent.trim() || tip.textContent === ${JSON.stringify(expected)});
  })()`);
  ctx.check(`Preset ${id} has no hover preview`, !previewed);
  await ctx.run(`document.querySelector(${JSON.stringify(`${row} ~ [data-preset-view]`)}).click()`);
  await ctx.wait("document.querySelector('[data-preset-reader-text]')");
  const contents = await ctx.run("document.querySelector('[data-preset-reader-text]').textContent");
  ctx.check(`Preset ${id} opens complete text on click`, contents === expected && copiedText() === 'preset-clipboard-original');
  await ctx.run("document.querySelector('[data-preset-reader-close]').click()");
  await ctx.wait("!document.querySelector('[data-preset-reader]')");
}

async function selectPreset(ctx, group, id, expected) {
  clipboard.writeText('preset-clipboard-original');
  await ctx.options();
  await ctx.item('presets');
  if (group) await ctx.item(`presets-${group}`);
  await checkPresetView(ctx, id, expected);
  await ctx.item(id);
  await ctx.wait("!document.querySelector('[data-prompt-assistant-menu]')");
  // 保存完成后检查系统剪贴板，选中预设不应覆盖用户先前复制的内容。
  ctx.check(`Selecting preset ${id} preserves the clipboard`, copiedText() === 'preset-clipboard-original');
}

async function checkDirectorRequest(ctx) {
  await ctx.reload();
  await ctx.options(); await ctx.item('presets');
  await ctx.item('presets-general');
  ctx.check('Director selection survives reload', await ctx.run("!!document.querySelector('[data-assistant-item=director-storyboard] svg')"));
  await ctx.capture('director-storyboard-preset');
  await ctx.item('director-storyboard');
  await ctx.text('一个女孩在车站发现自己的车票已经过期。');
  const before = ctx.requestCount();
  await ctx.translation(); await ctx.fixtureRequest(before);
  // 请求与复制共用原始全文，末尾章节和表格也必须保留，不能换成菜单摘要。
  ctx.check('Complete director instruction reaches the real transform request', ctx.request(before).messages[0].content === messages.directorStoryboardInstruction);
  ctx.complete('导演分镜测试结果');
  await ctx.wait("document.querySelector('#prompt-editor').textContent==='导演分镜测试结果'");
}

/** 旧上限会在请求发出前拦截长指令；用实际转译入口确认正文完整到达。 */
async function checkMossRequest(ctx, instruction) {
  await ctx.text('一张写着“春日集市”的海报');
  const before = ctx.requestCount();
  await ctx.translation(); await ctx.fixtureRequest(before);
  ctx.check('Complete Moss instruction reaches the real transform request', ctx.request(before).messages[0].content === instruction);
  ctx.complete('A poster for 春日集市');
  await ctx.wait("document.querySelector('#prompt-editor').textContent==='A poster for 春日集市'");
}

async function selectImageSeries(ctx, id) {
  await ctx.run("document.querySelector('[data-model-series] [aria-haspopup=listbox]').click()");
  await ctx.wait(`document.querySelector('[data-model-series-option=${id}]')`);
  await ctx.run(`document.querySelector('[data-model-series-option=${id}]').click()`);
}

/** 供应商回包固定可控，实际打开画板并检查相对位置及再次回填的坐标。 */
async function checkStructuredMossRequest(ctx, instruction) {
  const original = '左边 girl1，右边 girl2，右上是 girl3';
  const result = { summary: { caption: 'Three girls on a street.' }, items: [
    { label: 'character', caption: 'girl1 wears a red coat.', bbox: [-160, -485, 420, -155] },
    { label: 'character', caption: 'girl2 wears a blue coat.', bbox: [-35, 145, 450, 477] },
    { label: 'character', caption: 'girl3 wears a green coat.', bbox: [-490, 190, -120, 459] },
  ], bbox_coord_space: 'abs_centralized', bbox_format: 'yxyx' };
  await ctx.text(original);
  const before = ctx.requestCount();
  await ctx.translation(); await ctx.fixtureRequest(before);
  const request = ctx.request(before).messages[0].content;
  ctx.check('Moss JSON receives its preset and active output dimensions', request.startsWith(instruction) && request.includes('W=1024 pixels, H=1024 pixels'));
  const invalid = structuredClone(result);
  invalid.items[0].bbox[1] = -513;
  ctx.complete(JSON.stringify(invalid));
  await ctx.wait("document.body.textContent.includes('画框超出了当前尺寸')");
  ctx.check('An out-of-bounds response leaves the original prompt intact', await ctx.run(`document.querySelector('#prompt-editor').textContent===${JSON.stringify(original)}`));
  await ctx.translation(); await ctx.fixtureRequest(before + 1); ctx.complete(JSON.stringify(result));
  await ctx.wait("document.querySelector('#prompt-editor').textContent.includes('abs_centralized')");
  await checkCompositionEditor(ctx, result);
}

async function checkCompositionEditor(ctx, result) {
  const boxes = "document.querySelectorAll('[data-moss-artboard] [data-composition-box]')";
  await ctx.run("document.querySelector('[data-moss-edit]').click()");
  await ctx.wait(`${boxes}.length===3`);
  ctx.check('Generated characters appear left, right and upper right in the actual editor', await ctx.run(`(() => {
    const [left, right, upper] = ${boxes};
    return parseFloat(left.style.left) < 50 && parseFloat(right.style.left) > 50
      && parseFloat(upper.style.left) > 50 && parseFloat(upper.style.top) < parseFloat(right.style.top);
  })()`));
  await ctx.run("document.querySelector('[data-moss-apply]').click()");
  await ctx.wait("!document.querySelector('[data-moss-artboard]')");
  const text = await ctx.run("document.querySelector('#prompt-editor').textContent");
  ctx.check('Applying imported boxes round-trips descriptions and coordinates', text === JSON.stringify(result));
  // 另贴一段 JSON，确认重新打开读取新内容，旧草稿不会盖掉新框。
  await ctx.text(JSON.stringify({ ...result, items: [result.items[2]] }, null, 2));
  await ctx.run("document.querySelector('[data-moss-edit]').click()");
  await ctx.wait(`${boxes}.length===1`);
  ctx.check('Pasted JSON replaces the previous composition on reopen', true);
  await ctx.run("document.querySelector('[data-moss-apply]').click()");
  await ctx.wait("!document.querySelector('[data-moss-artboard]')");
  await checkCompositionImport(ctx, result, boxes);
}

async function fillJsonImport(ctx, value) {
  await ctx.run(`(() => {
    const input = document.querySelector('[data-moss-json-import-input]');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await ctx.wait("!document.querySelector('[data-moss-json-import-apply]').disabled");
  await ctx.run("document.querySelector('[data-moss-json-import-apply]').click()");
}

/** 覆盖画板内直接粘贴：无效输入可就地纠正，导入成功后由应用按钮提交。 */
async function checkCompositionImport(ctx, result, boxes) {
  const before = await ctx.run("document.querySelector('#prompt-editor').textContent");
  await ctx.run("document.querySelector('[data-moss-edit]').click()");
  await ctx.wait(`${boxes}.length===1`);
  await ctx.run("document.querySelector('[data-moss-import-json]').click()");
  await ctx.wait("document.querySelector('[data-moss-json-import-input]')");
  const invalid = '{"summary":';
  await fillJsonImport(ctx, invalid);
  await ctx.wait("document.querySelector('[data-moss-json-import-input]').getAttribute('aria-invalid')==='true'");
  ctx.check('Invalid JSON stays in the input and preserves the previous region', await ctx.run(`${boxes}.length===1&&document.querySelector('[data-moss-json-import-input]').value===${JSON.stringify(invalid)}`));
  await fillJsonImport(ctx, JSON.stringify(result, null, 2));
  await ctx.wait(`${boxes}.length===3&&!document.querySelector('[data-moss-json-import-input]')`);
  ctx.check('Import restores all regions without submitting the composition', await ctx.run(`document.querySelector('#prompt-editor').textContent===${JSON.stringify(before)}`));
  await ctx.run("document.querySelector('[data-moss-apply]').click()");
  await ctx.wait("!document.querySelector('[data-moss-artboard]')");
  ctx.check('Applying the imported draft writes the restored JSON back to the prompt', await ctx.run(`document.querySelector('#prompt-editor').textContent===${JSON.stringify(JSON.stringify(result))}`));
}

// 离屏窗口的系统鼠标仍可能抢焦点。直接检查 Chromium 的伪类样式，再单独触发查看按钮。
async function openMossReader(ctx, selector) {
  const send = (method, params) => ctx.win.webContents.debugger.sendCommand(method, params);
  await send('DOM.enable');
  await send('CSS.enable');
  const { root } = await send('DOM.getDocument');
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
  const force = forcedPseudoClasses => send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses });
  const computed = property => `getComputedStyle(document.querySelector('${selector}')).${property}`;
  const color = await ctx.run(computed('color'));
  const plain = await ctx.run(`${computed('backgroundColor')}==='rgba(0, 0, 0, 0)'&&${computed('borderTopWidth')}==='0px'`);
  ctx.check('Moss View rests as text with no fill or border', plain);
  try {
    await force(['hover']);
    await ctx.wait(`${computed('textDecorationLine')}==='underline'&&${computed('color')}!==${JSON.stringify(color)}`);
    await force(['hover', 'active']);
    await ctx.wait(`(() => {
      const scale = ${computed('scale')}.split(' ')[0];
      return Number.parseFloat(scale) / (scale.endsWith('%') ? 100 : 1) < 1 && !document.querySelector('[data-preset-reader]');
    })()`);
  } finally {
    await force([]);
  }
  ctx.check('Moss View changes color on hover and presses in before opening', true);
  await ctx.run(`document.querySelector('${selector}').click()`);
  await ctx.wait("document.querySelector('[data-preset-reader]')");
}

async function checkMossReader(ctx, instruction) {
  const selector = '[data-assistant-item=moss-composition-json] + [data-preset-view]';
  const original = '保留这个画面描述';
  await ctx.text(original);
  clipboard.writeText('moss-reader-preview');
  await ctx.options();
  await ctx.item('presets'); await ctx.item('presets-moss');
  await openMossReader(ctx, selector);
  // 打开正文和复制分别验证，避免“查看”误选预设或改掉用户草稿。
  const contents = await ctx.run(`document.querySelector('[data-preset-reader-text]').textContent`);
  const untouched = await ctx.run(`document.querySelector('#prompt-editor').textContent===${JSON.stringify(original)}&&!document.querySelector('[data-assistant-item=moss-composition-json] svg')`);
  ctx.check('Reading opens the complete Moss preset without selecting, copying or writing the draft', contents === instruction && untouched && copiedText() === 'moss-reader-preview');
  await ctx.capture('moss-preset-reader');
  await checkMossReaderClose(ctx, selector);
  await ctx.run("document.querySelector('[data-preset-reader-copy]').click()");
  for (let attempt = 0; attempt < 50 && copiedText() !== instruction; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  ctx.check('Reader copies the complete unmodified preset', copiedText() === instruction);
  await ctx.run("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  ctx.check('Escape closes the reader and returns to its text button', await ctx.run(`!document.querySelector('[data-preset-reader]')&&document.activeElement.matches('${selector}')`));
  await ctx.run(`document.querySelector('${selector}').click()`);
  await ctx.wait("document.querySelector('[data-preset-reader-use]')");
  // 手动复制后换成另一段内容，避免「使用此预设」再次复制同一份正文却未被发现。
  clipboard.writeText('preset-clipboard-original');
  await ctx.run("document.querySelector('[data-preset-reader-use]').click()");
  await ctx.wait("!document.querySelector('[data-prompt-assistant-menu]')");
  ctx.check('Using the preset from its reader preserves the clipboard', copiedText() === 'preset-clipboard-original');
  await ctx.options();
  await ctx.item('presets'); await ctx.item('presets-moss');
  ctx.check('Use this preset selects it and leaves the original input intact', await ctx.run(`document.querySelector('[data-assistant-item=moss-composition-json] svg')&&document.querySelector('#prompt-editor').textContent===${JSON.stringify(original)}`));
  await ctx.run("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
}

// 从放大页直接关闭应解除后台禁用，并回到打开卡片的同一个入口。
async function checkMossReaderClose(ctx, selector) {
  await ctx.run("document.querySelector('[data-preset-reader-size]').click()");
  await ctx.wait("document.querySelector('[data-preset-reader-expanded]')");
  await ctx.run("document.querySelector('[data-preset-reader-close]').click()");
  await ctx.wait(`document.activeElement.matches('${selector}')`);
  const restored = await ctx.run("!document.querySelector('[data-preset-reader]')&&!document.querySelector('[data-app-main]').firstElementChild.inert");
  ctx.check('Closing the expanded reader restores the create page and trigger focus', restored);
  await ctx.run(`document.querySelector('${selector}').click()`);
  await ctx.wait("document.querySelector('[data-preset-reader-text]')");
}

// 用 Moss 的真实输入区检查收起高度，同时确认结构化构图入口和两份草稿还在。
async function checkCompactMossPrompt(ctx) {
  await ctx.wait("document.querySelector('[data-moss-edit]')");
  // 验证同一工具栏在创作页也默认只显示三项。
  ctx.check('Create Moss shows only Scene, 3D and Action by default', await ctx.run(
    "[...document.querySelectorAll('[data-create-prompt-tools] [data-prompt-tool]')].map(node => node.dataset.promptTool).join(',') === 'background,view3d,pose'"));
  for (const [name, attribute, id] of [
    ['提示词', 'data-prompt-editor-panel', 'prompt-editor'],
    ['反向提示词', 'data-negative-editor-panel', 'negative-prompt-editor'],
  ]) {
    const before = await ctx.run(`document.getElementById('${id}').textContent`);
    await ctx.run(`document.querySelector(${JSON.stringify(`[aria-label="收起${name}"]`)}).click()`);
    await ctx.wait(`document.querySelector('[${attribute}]').getBoundingClientRect().height === 0`);
    ctx.check(`Moss ${id} collapses without a placeholder and keeps its draft`, await ctx.run(`
      document.getElementById('${id}').textContent === ${JSON.stringify(before)}
      && !!document.querySelector('[data-moss-edit]')
      && !document.querySelector('[data-prompt-collapsed-hint], [data-negative-collapsed-hint]')`));
    // 工具栏要随正向框一起退出交互，收起反向框不影响它。
    const tools = "document.querySelector('[data-create-prompt-tools]')";
    ctx.check(`Moss tools follow only the positive prompt collapse (${id})`, await ctx.run(
      `Boolean(${tools}.closest('[inert]')) === ${id === 'prompt-editor'}`));
    await ctx.run(`document.querySelector(${JSON.stringify(`[aria-label="展开${name}"]`)}).click()`);
    await ctx.wait(`document.querySelector('[${attribute}]').getBoundingClientRect().height > 50 && !${tools}.closest('[inert]')`);
  }
  ctx.check('Closed model loader occupies one compact row', await ctx.run(`(() => {
    const section = document.querySelector('[data-video-model-section]');
    return section.getBoundingClientRect().height <= 34 && !section.querySelector('[data-video-model-settings]');
  })()`));
}

// 先读勾选再发请求；测试本身不能点击「普通自然语言」来制造默认值。
async function checkMossDefaultPreset(ctx) {
  await ctx.options();
  ctx.check('Moss first-level menu has no format shortcuts', await ctx.run(`(() => {
    const rows = [...document.querySelectorAll('[data-prompt-assistant-menu] [data-assistant-column="0"] [data-assistant-item]')];
    const formats = ${JSON.stringify([messages.mossCaption, messages.mossCompositionJson])};
    return rows.some(row => row.dataset.assistantItem === 'presets')
      && rows.every(row => !formats.includes(row.getAttribute('aria-label')));
  })()`));
  await ctx.item('presets'); await ctx.item('presets-moss');
  const checked = await ctx.run(`!!document.querySelector('[data-assistant-item=moss-caption] svg')
    && !!document.querySelector('[data-assistant-item=moss-composition-json]')
    && !document.querySelector('[data-assistant-item=moss-composition-json] svg')`);
  ctx.check('Moss natural language is selected by default in the preset group', checked);
  await ctx.run("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await ctx.wait("!document.querySelector('[data-prompt-assistant-menu]')");
}

async function checkStructuredMoss(ctx) {
  const instruction = load(path.resolve(__dirname, '../../apps/next/src/data/moss-composition-instruction.ts')).MOSS_COMPOSITION_INSTRUCTION;
  await selectImageSeries(ctx, 'moss');
  await ctx.wait("document.querySelector('[data-moss-edit]')");
  await ctx.focus();
  await checkMossDefaultPreset(ctx);
  const natural = load(path.resolve(__dirname, '../../apps/next/src/data/moss-caption-instruction.ts')).MOSS_CAPTION_INSTRUCTION;
  await checkMossRequest(ctx, natural);
  await checkMossReader(ctx, instruction);
  await selectPreset(ctx, 'moss', 'moss-composition-json', instruction);
  await checkStructuredMossRequest(ctx, instruction);
  await checkCompactMossPrompt(ctx);
  await selectImageSeries(ctx, 'anima');
  await ctx.wait("!document.querySelector('[data-moss-edit]')");
}

exports.checkPresetCopy = async ctx => {
  const previous = clipboard.readText();
  await ctx.focus();
  try {
    const moss = load(path.resolve(__dirname, '../../apps/next/src/data/moss-caption-instruction.ts')).MOSS_CAPTION_INSTRUCTION;
    await selectPreset(ctx, 'moss', 'moss-caption', moss);
    await checkMossRequest(ctx, moss);
    const cases = [['translate', messages.translationInstruction], ['anima', ANIMA_INSTRUCTION], ['image-tags', messages.imageTagsInstruction], ['minimax-h3-base', messages.h3BaseInstruction], ['minimax-h3-reference', messages.h3ReferenceInstruction], ['fixture-0', 'Translate to English, preserving the original scene.'], ['director-storyboard', messages.directorStoryboardInstruction]];
    for (const [id, instruction] of cases) {
      const group = id.startsWith('minimax') ? 'minimax' : id === 'fixture-0' ? null : 'general';
      await selectPreset(ctx, group, id, instruction);
    }
    await checkDirectorRequest(ctx);
    await checkStructuredMoss(ctx);
    await ctx.options(); await ctx.item('presets'); await ctx.item('presets-general'); await ctx.item('translate');
  } finally {
    clipboard.writeText(previous);
  }
};

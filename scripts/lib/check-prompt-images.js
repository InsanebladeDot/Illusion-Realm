/** 在正式画布输入框验证开关、附件和迟到结果；供应商推理用明确的 IPC 替身。 */
const fs = require("node:fs"), path = require("node:path");
const panel = "[data-canvas-node=target] .hy-generation-panel";
const editor = `${panel} [data-video-prompt]`;
const menu = "[data-prompt-assistant-menu]";

async function options(ctx) {
  if (!await ctx.run(`!!document.querySelector('${menu}')`)) await ctx.click(`${panel} [data-assistant-options]`);
  await ctx.wait(`document.querySelector('${menu}')`);
}
async function item(ctx, id) { await ctx.click(`[data-assistant-item=${id}]`); }
async function translate(ctx, state, output) {
  if (await ctx.run(`!!document.querySelector('${menu}')`)) await ctx.key("Escape");
  await ctx.run(`document.querySelector('${panel} [data-assistant-options]').focus()`);
  state.output = output;
  await ctx.click(`${panel} [data-assistant-translate]`);
  try { await ctx.wait(`document.querySelector('${editor}').textContent===${JSON.stringify(output)}`); }
  catch (error) {
    console.error("IMAGE_TRANSLATION_STATE", JSON.stringify({ requests: state.requests.length, output, ui: await ctx.run(`({disabled:document.querySelector('${panel} [data-assistant-translate]')?.disabled,pending:document.querySelector('${panel} [data-assistant-result]')?.textContent,text:document.querySelector('${editor}')?.textContent})`) }));
    throw error;
  }
}

/** FileList 通过浏览器文件 API 注入；不声称验证过操作系统的原生选图对话框。 */
async function upload(ctx) {
  return ctx.run(`(() => {
    const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2;
    const painter = canvas.getContext('2d');
    painter.fillStyle = 'red'; painter.fillRect(0, 0, 2, 2);
    const first = canvas.toDataURL();
    painter.fillStyle = 'blue'; painter.fillRect(0, 0, 2, 2);
    const second = canvas.toDataURL();
    const transfer = new DataTransfer();
    [first, second].forEach((url, index) => {
      const bytes = Uint8Array.from(atob(url.split(',')[1]), char => char.charCodeAt(0));
      transfer.items.add(new File([bytes], 'reference-' + index + '.png', {type: 'image/png'}));
    });
    const input = document.querySelector('${panel} [data-assistant-image-input]');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', {bubbles: true}));
    return [first, second];
  })()`);
}

async function checkCanvasImages(ctx, state, seed, image) {
  await seed(ctx, { kind: "image", workflow: "minimax-image-edit", prompt: "Describe", inputImages: [image] });
  await options(ctx);
  ctx.smoke.check("Canvas image upload is off by default and reuses the original menu", await ctx.run(`document.querySelector('[data-assistant-item=use-images]').getAttribute('aria-checked')==='false'&&!document.querySelector('[data-assistant-images]')&&document.querySelector('${menu}').hasAttribute('data-canvas-theme')`));
  await item(ctx, "presets"); await item(ctx, "image-tags");
  await translate(ctx, state, "text tags");
  ctx.smoke.check("New image preset preserves text-only requests while image upload is off", !state.requests.at(-1).images && state.requests.at(-1).instruction.includes("10年") && state.requests.at(-1).instruction.includes("可见内容"));
  await checkBatch(ctx, state);
  await checkImageConflict(ctx, state);
  await checkOwnImage(ctx, state, seed, image);
  await checkImageFailure(ctx, state);
  await checkImageMenuLayout(ctx);
  state.output = null;
}

async function checkBatch(ctx, state) {
  await options(ctx); await item(ctx, "use-images");
  ctx.smoke.check("Enabling images keeps the menu open and reveals its attachments", await ctx.run(`!!document.querySelector('${menu} [data-assistant-images]')`));
  const extra = await upload(ctx);
  await checkCapabilitySwitch(ctx);
  await ctx.fill(editor, "");
  await translate(ctx, state, "Image 1: original\nImage 2: red\nImage 3: blue");
  const images = state.requests.at(-1).images;
  const original = fs.readFileSync(path.resolve("scripts/fixtures/video-composition/image.png")).toString("base64");
  ctx.smoke.check("Image-only transcreation sends the current reference followed by ordered batch uploads", images.length === 3 && images[0] === `data:image/png;base64,${original}` && images[1] === extra[0] && images[2] === extra[1]);
  ctx.smoke.check("Image group headings survive workflow marker conversion", await ctx.run(`document.querySelector('${editor}').textContent.startsWith('Image 1:')`));
  await options(ctx);
  ctx.smoke.check("The same compact menu shows ordered thumbnails and an upload tile", await ctx.run("document.querySelectorAll('[data-assistant-image]').length===3&&document.querySelector('[data-assistant-images]').textContent.includes('3 张')&&!!document.querySelector('[data-assistant-item=upload-images]')"));
  await ctx.pointer(`${menu} [data-assistant-column='0'] > div:first-child`);
  await ctx.shot("127-transcreation-images-enabled");
  await checkRemoval(ctx, state, extra);
  await options(ctx);
  await item(ctx, "use-images");
  await ctx.fill(editor, "Text only"); await translate(ctx, state, "text only result");
  ctx.smoke.check("Turning image upload off immediately restores text-only transport", state.requests.at(-1).images === undefined);
  const document = await ctx.run("window.electronAPI.readUserData()");
  ctx.smoke.check("Translation history contains no uploaded image bytes", !JSON.stringify(document.data.data.promptAssistant.history).includes("data:image/"));
}

/** 切换转译自己的型号；Agent 仍是文本型号，用来反查是否误读了另一个选择。 */
async function chooseModel(ctx, model) {
  await options(ctx); await item(ctx, 'provider'); await item(ctx, 'glm');
  await ctx.wait("document.querySelector('#agent-model-dialog')");
  await ctx.wait(`document.querySelector('[data-agent-model-option="${model}"]')`);
  await ctx.click(`[data-agent-model-option="${model}"]`);
  await ctx.click('[data-agent-model-apply]');
  await ctx.wait("!document.querySelector('#agent-model-dialog')");
}

async function checkCapabilitySwitch(ctx) {
  await chooseModel(ctx, 'glm-4.7-flash'); await options(ctx);
  ctx.smoke.check('Text-only transcreation disables images and its file input', await ctx.run(`document.querySelector('[data-assistant-item=use-images]').disabled&&document.querySelector('[data-assistant-item=use-images]').getAttribute('aria-checked')==='false'&&document.querySelector('${panel} [data-assistant-image-input]').disabled&&!document.querySelector('[data-assistant-images]')`));
  await ctx.shot('130-text-model-image-disabled');
  await chooseModel(ctx, 'glm-4.6v-flash'); await options(ctx);
  ctx.smoke.check('Vision transcreation restores upload availability without auto-enabling consent', await ctx.run("!document.querySelector('[data-assistant-item=use-images]').disabled&&document.querySelector('[data-assistant-item=use-images]').getAttribute('aria-checked')==='false'"));
  await item(ctx, 'use-images');
  ctx.smoke.check('Switching models preserves all three image drafts', await ctx.run("document.querySelectorAll('[data-assistant-image]').length===3"));
}

/** 移除借用图不碰生成引用；移除上传图则立即回收自己创建的地址。 */
async function checkRemoval(ctx, state, extra) {
  const references = await ctx.run(`document.querySelector('${panel} [data-canvas-reference-inputs]')?.innerHTML`);
  await ctx.run("window.__imageRevoke=URL.revokeObjectURL;window.__revoked=[];URL.revokeObjectURL=url=>{window.__revoked.push(url);window.__imageRevoke(url)};void 0");
  const removed = await ctx.run("document.querySelectorAll('[data-assistant-image] img')[1].src");
  await item(ctx, "remove-image-1");
  ctx.smoke.check("Removing an upload revokes its address and renumbers thumbnails", await ctx.run(`window.__revoked.includes(${JSON.stringify(removed)})&&document.querySelectorAll('[data-assistant-image]').length===2&&document.querySelectorAll('[data-assistant-image] span')[1].textContent==='2'`));
  await item(ctx, "remove-image-0");
  ctx.smoke.check("Excluding a borrowed image preserves the canvas generation references", references === await ctx.run(`document.querySelector('${panel} [data-canvas-reference-inputs]')?.innerHTML`));
  ctx.smoke.check("The remaining thumbnail still has readable image bytes", await ctx.run("Promise.all([...document.querySelectorAll('[data-assistant-image] img')].map(image=>fetch(image.src).then(r=>r.ok))).then(results=>results.length===1&&results.every(Boolean))"));
  await ctx.run("URL.revokeObjectURL=window.__imageRevoke;delete window.__imageRevoke;delete window.__revoked");
  await translate(ctx, state, "remaining upload");
  ctx.smoke.check("Re-translating grouped image results keeps headings instead of resolving them as canvas references", state.requests.at(-1).text === "Image 1: original\nImage 2: red\nImage 3: blue");
  ctx.smoke.check("Only the remaining thumbnail is sent in the next request", state.requests.at(-1).images.length === 1 && state.requests.at(-1).images[0] === extra[1]);
  await checkImageLimits(ctx);
}

/** 取消文件选择和超过上限都必须保留原列表；键盘开关与鼠标走相同请求状态。 */
async function checkImageLimits(ctx) {
  await options(ctx);
  await ctx.run(`(()=>{const input=document.querySelector('${panel} [data-assistant-image-input]');input.files=new DataTransfer().files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  ctx.smoke.check("Cancelling image selection preserves the remaining thumbnail", await ctx.run("document.querySelectorAll('[data-assistant-image]').length===1"));
  await ctx.run(`(()=>{const transfer=new DataTransfer();for(let i=0;i<8;i++)transfer.items.add(new File(['x'],'limit-'+i+'.png',{type:'image/png'}));const input=document.querySelector('${panel} [data-assistant-image-input]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  ctx.smoke.check("Image limit rejects the entire extra selection without changing attachments", await ctx.run("document.querySelectorAll('[data-assistant-image]').length===1&&document.body.textContent.includes('最多使用8张图片')"));
  await ctx.run("document.querySelector('[data-assistant-item=use-images]').focus()");
  await ctx.key("Space");
  ctx.smoke.check("Space turns images off without closing the menu", await ctx.run(`!!document.querySelector('${menu}')&&!document.querySelector('[data-assistant-images]')`));
  await ctx.key("Space");
  await ctx.wait("document.querySelectorAll('[data-assistant-image]').length===1");
}

async function checkOwnImage(ctx, state, seed, image) {
  await seed(ctx, { kind: "image", workflow: "anima", prompt: "Describe", media: image });
  await options(ctx);
  ctx.smoke.check("A new editor resets the switch and does not inherit extra uploads", await ctx.run("document.querySelector('[data-assistant-item=use-images]').getAttribute('aria-checked')==='false'&&!document.querySelector('[data-assistant-images]')"));
  await item(ctx, "use-images"); await translate(ctx, state, "own image tags");
  ctx.smoke.check("An uploaded image on a text-to-image node is usable for transcreation without adding generation inputs", state.requests.at(-1).images.length === 1 && await ctx.run(`!document.querySelector('${panel} [data-canvas-reference-inputs]')`));
}

/** 改变主题与窗口后读取真实边界，新增菜单项不能溢出主显示区。 */
async function checkImageMenuLayout(ctx) {
  await require("./check-minimax-image-edit").changeTheme(ctx, "light");
  ctx.win.setSize(960, 1000);
  await ctx.wait("innerWidth===960&&!document.documentElement.classList.contains('theme-ripple')");
  await options(ctx);
  await ctx.wait("document.querySelectorAll('[data-assistant-image]').length===1");
  await ctx.wait("!document.body.textContent.includes('供应商拒绝了图片请求')");
  await ctx.pointer(`${menu} [data-assistant-column='0'] > div:first-child`);
  ctx.smoke.check("Light narrow canvas reuses the same image menu within the viewport", await ctx.run(`(()=>{const r=document.querySelector('${menu}').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&document.documentElement.dataset.theme==='light'})()`));
  await ctx.shot("128-transcreation-images-light-narrow");
  ctx.win.setSize(390, 844);
  await ctx.wait("innerWidth===390");
  ctx.smoke.check("Image menu stays within a phone-width viewport", await ctx.run(`(()=>{const r=document.querySelector('${menu}').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`));
  await ctx.shot("129-transcreation-images-phone");
  await ctx.key("Escape");
  ctx.smoke.check("Escape returns keyboard focus to the original prompt toolbar", await ctx.run(`!document.querySelector('${menu}')&&document.activeElement===document.querySelector('${panel} [data-assistant-options]')`));
}

/** 服务拒绝图片时必须保留正文，不得当作成功替换或丢图重试。 */
async function checkImageFailure(ctx, state) {
  await ctx.fill(editor, "Keep original");
  const count = state.requests.length;
  state.failure = "imageRequestRejected";
  await ctx.click(`${panel} [data-assistant-translate]`);
  await ctx.wait("document.body.textContent.includes('供应商拒绝了图片请求')");
  ctx.smoke.check("Rejected vision requests preserve the draft and show a specific recoverable error", state.requests.length === count + 1 && await ctx.run(`document.querySelector('${editor}').textContent==='Keep original'&&!document.querySelector('${panel} [data-assistant-translate]').disabled`));
  state.failure = null;
}

/** 等待时改开关，旧图结果不能悄悄覆盖当前草稿。 */
async function checkImageConflict(ctx, state) {
  await options(ctx); await item(ctx, "use-images");
  state.hold = true;
  const count = state.requests.length;
  await ctx.click(`${panel} [data-assistant-translate]`);
  for (let i = 0; i < 100 && state.requests.length === count; i++) await new Promise(resolve => setTimeout(resolve, 20));
  if (!state.complete) throw Error("Image request did not start");
  await options(ctx); await item(ctx, "use-images");
  state.complete("Late image tags"); state.hold = false; state.complete = null;
  await ctx.wait(`document.querySelector('${panel} [data-assistant-result]')`);
  ctx.smoke.check("Changing image consent during inference defers the old result", await ctx.run(`document.querySelector('${editor}').textContent==='text only result'`));
  await ctx.run(`document.querySelectorAll('${panel} [data-assistant-result] button')[1].click()`);
}
module.exports = { checkCanvasImages };

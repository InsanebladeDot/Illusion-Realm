/** 执行已安装 Next 的真实热更新模块，覆盖旧样式提前移除后的 load/error 回调。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

class StyleLink {
  constructor(parent, href) { this.parentNode = parent; this.href = href; this.listeners = new Map(); }
  cloneNode() { return new StyleLink(null, this.href); }
  // 同步触发插件原回调，让断言能在当前用例捕获异常；真实浏览器流程另跑开发冒烟。
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  dispatchEvent(event) { this.listeners.get(event.type)?.call(this, event); }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.removeChild(this);
  }
}

function createDocument() {
  const links = [];
  const parent = {
    appendChild(link) { links.push(link); link.parentNode = parent; },
    removeChild(link) { links.splice(links.indexOf(link), 1); link.parentNode = null; },
  };
  const original = new StyleLink(parent, 'http://localhost:3000/styles.css');
  links.push(original);
  return { original, links, document: {
    currentScript: { src: 'http://localhost:3000/styles.js' },
    querySelectorAll: () => [...links],
  } };
}

// 像换灯泡时旧灯已被别人拿走：延迟通知只负责收尾，不能再向不存在的灯座取旧灯。
function checkCompletion(source, event, detachEarly) {
  const fixture = createDocument();
  let pending;
  const context = { module: { exports: {} }, __dirname: '.', document: fixture.document,
    console: { log() {} }, setTimeout(callback) { pending = callback; return 1; }, clearTimeout() {} };
  vm.runInNewContext(source, context);
  context.module.exports('styles', { locals: true })();
  pending();
  const replacement = fixture.links[1];
  assert.ok(replacement, 'must install a replacement stylesheet');
  if (detachEarly) fixture.original.remove();
  // load 和 error 都走真实插件监听；再次通知也不能误删新样式。
  replacement.dispatchEvent(new Event(event));
  replacement.dispatchEvent(new Event(event));
  assert.deepEqual(fixture.links, [replacement]);
  assert.equal(fixture.original.parentNode, null);
  console.log(`PASS Next CSS HMR ${event}, detached=${detachEarly}`);
}

const installed = require.resolve('../apps/next/node_modules/next/dist/compiled/mini-css-extract-plugin/hmr/hotModuleReplacement.js');
const source = fs.readFileSync(process.argv[2] ? path.resolve(process.argv[2]) : installed, 'utf8');
for (const event of ['load', 'error']) for (const detached of [false, true]) checkCompletion(source, event, detached);

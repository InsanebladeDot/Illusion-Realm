/** 执行真实两端校验与更新器；验证本地标注，不模拟媒体生成或读写用户工程。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../apps/next/node_modules/typescript');
const main = require('../apps/electron/src/main/modules/canvas/project-validation');

// 本进程转译生产 TS，主进程产品代码仍不运行时依赖 shared TS。
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const { InfiniteCanvasDocumentSchema: schema } = require('../packages/shared/src/schemas/infinite-canvas.schema.ts');
const { serializeCanvas, restoreCanvas } = require('../apps/next/src/view/infinite-canvas/canvas-model.ts');
const { saveCanvasAnnotation, annotationInk } = require('../apps/next/src/view/infinite-canvas/canvas-annotations.ts');
const tag = { id: 'a', text: '分镜一', color: '#fde047' };
const full = Array.from({ length: 8 }, (_, i) => ({ ...tag, id: String(i) }));
let count = 0;

function check(annotations, expected, kind = 'image') {
  const doc = { version: 1, name: '', edges: [], nodes: [{ id: 'node', position: { x: 0, y: 0 }, data: {
    kind, title: '', prompt: '', content: '', ratio: '1/1', ...(annotations === undefined ? {} : { annotations }),
  } }] };
  const parsed = schema.safeParse(doc);
  assert.equal(parsed.success, expected, `shared: ${JSON.stringify(annotations)}`);
  assert.equal(main.document(doc), expected, `main: ${JSON.stringify(annotations)}`);
  if (parsed.success) {
    // 像把八块编号牌装箱再拆箱，不仅核对数量，也核对文字、颜色和顺序。
    assert.deepEqual(parsed.data, doc);
    assert.deepEqual(JSON.parse(JSON.stringify(serializeCanvas(restoreCanvas(parsed.data)))), doc);
  }
  count++;
}

for (const kind of ['text', 'image', 'video', 'audio', 'note', 'scene', 'composition']) {
  check([tag], true, kind);
  check(full, true, kind);
}
for (const value of [null, true, {}, 'tag', [null], [...full, { ...tag, id: '9' }], [tag, tag],
  [{ ...tag, id: '' }], [{ ...tag, id: 1 }], [{ ...tag, text: '' }], [{ ...tag, text: '  ' }],
  [{ ...tag, text: '字'.repeat(81) }], [{ ...tag, color: 'red' }], [{ ...tag, color: '#fff' }],
  [{ ...tag, color: '#ffffff00' }], [{ ...tag, color: 'url(file)' }], [{ ...tag, extra: true }]]) check(value, false);
check([{ ...tag, text: '字'.repeat(80), color: '#AABBCC' }], true);
check([], true);
check(undefined, true);

// 满额允许改已有牌子；返回值不可修改旧数组，否则复制品和撤销会一起变色。
const frozen = Object.freeze(full.map(item => Object.freeze(item)));
assert.equal(saveCanvasAnnotation(frozen, { ...tag, id: 'ninth' }), null);
const changed = saveCanvasAnnotation(frozen, { ...tag, id: '7', text: ' 已更改 ', color: '#123456' });
assert.equal(changed.length, 8);
assert.equal(changed[7].text, '已更改');
assert.equal(frozen[7].text, tag.text);
assert.equal(saveCanvasAnnotation([], { ...tag, text: ' ' }), null);
assert.equal(annotationInk('#ffffff'), '#18181b');
assert.equal(annotationInk('#000000'), '#ffffff');
console.log(`PASS: ${count} annotation contract cases; cap, immutable update and color contrast`);

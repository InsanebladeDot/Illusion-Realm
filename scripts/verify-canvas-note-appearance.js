/** 对照两端真实校验与序列化，防止外观保存时被剥掉或写到其他节点类型。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../apps/next/node_modules/typescript');
const validate = require('../apps/electron/src/main/modules/canvas/project-validation');

// 仅在本验证进程转译源文件；产品主进程仍不依赖 shared 的 TS 运行时。
require.extensions['.ts'] = (module, file) => {
  module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
};
const { InfiniteCanvasDocumentSchema: schema } = require('../packages/shared/src/schemas/infinite-canvas.schema.ts');
const { serializeCanvas, restoreCanvas } = require('../apps/next/src/view/infinite-canvas/canvas-model.ts');
let count = 0;

function check(noteAppearance, expected, kind = 'note') {
  const value = { version: 1, name: '', edges: [], nodes: [{ id: 'note', position: { x: 0, y: 0 },
    data: { kind, title: '', prompt: '', content: '原文', ratio: '1/1', ...(noteAppearance === undefined ? {} : { noteAppearance }) } }] };
  assert.equal(validate.document(value), expected, `main: ${JSON.stringify(noteAppearance)}`);
  const parsed = schema.safeParse(value);
  assert.equal(parsed.success, expected, `shared: ${JSON.stringify(noteAppearance)}`);
  if (parsed.success) {
    // 像保存后再拆开信封，逐字核对内容；单纯“不报错”不能证明字段未丢失。
    const restored = JSON.parse(JSON.stringify(serializeCanvas(restoreCanvas(parsed.data))));
    assert.deepEqual(restored.nodes[0].data, value.nodes[0].data);
    assert.deepEqual(parsed.data, value);
  }
  count++;
}

for (const attach of ['none', 'tape', 'pin']) for (const color of ['yellow', 'pink', 'blue', 'green', 'orange']) {
  check({ attach, color }, true);
}
// 先验新格式，再验旧节点缺省；空值、未知键和跨类型配置都必须明确拒绝。
for (const invalid of [null, [], {}, true, 'blue', { attach: 'pin' }, { color: 'blue' },
  { attach: 'ribbon', color: 'blue' }, { attach: 'none', color: 'red' }, { attach: 'tape', color: 'pink', css: 'border:1px' }]) {
  check(invalid, false);
}
for (const kind of ['note', 'text', 'image', 'video', 'audio', 'scene', 'composition']) {
  check(undefined, true, kind);
  if (kind !== 'note') check({ attach: 'pin', color: 'blue' }, false, kind);
}
console.log(`PASS: canvas note appearance ${count} cases (shared/main/save/restore)`);

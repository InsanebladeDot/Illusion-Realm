/** 执行实际排序工具，覆盖零价、未知价、同价稳定性和不改动目录；不替代项目类型检查。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../apps/next/node_modules/typescript');
const source = fs.readFileSync(path.join(__dirname, '../apps/next/src/utils/agent-model-order.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
require('node:vm').runInThisContext('(function(exports){' + compiled + '\n})')(loaded.exports);
const { orderAgentModels } = loaded.exports;
const model = (id, input, output) => ({ id, input, output, tier: 'budget' });
// 故意给未知价标经济档、零价标经济档，排序只能相信输入输出数值。
const models = Object.freeze([
  model('expensive', 8, 28), model('unknown', null, null), model('free', 0, 0),
  model('cheap', 0.1, 0.1), model('tie', 0.1, 0.1), model('partial', 0, null),
]);
const ids = order => orderAgentModels(models, order).map(x => x.id);
assert.deepEqual(ids('free-first'), ['free', 'cheap', 'tie', 'expensive', 'unknown', 'partial']);
assert.deepEqual(ids('price-asc'), ids('free-first'));
assert.deepEqual(ids('price-desc'), ['expensive', 'cheap', 'tie', 'free', 'unknown', 'partial']);
assert.deepEqual(ids('official'), models.map(x => x.id));
assert.equal(models[0].id, 'expensive');
assert.notEqual(orderAgentModels(models, 'official'), models);
assert.deepEqual(orderAgentModels([], 'free-first'), []);
console.log('PASS Agent model order: zero, unknown, partial, ties, descending and immutable catalog');

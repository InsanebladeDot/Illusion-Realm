/** 用构造的 SiliconFlow 目录核对图片能力和旧缓存升级。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('../../apps/electron/src/main/modules/agent/provider-catalog-parser');

function siliconRows(rows) {
  const base = { subType: 'chat', status: 'normal', functionCallSupport: true, pricing: [] };
  const data = rows.map(row => ({ ...base, ...row }));
  const flight = '4:' + JSON.stringify({ data }) + '\n';
  return parser.parseSiliconFlow('<script>self.__next_f.push(' + JSON.stringify([1, flight]) + ')</script>');
}

function checkCapabilities() {
  const rows = siliconRows([{ modelName: 'visual', vlm: true }, { modelName: 'text', vlm: false }, { modelName: 'unknown-VL' }, { modelName: 'explicit', input_modalities: ['text', 'image'] }]);
  assert.deepEqual(rows.map(row => row.imageInput), [true, false, null, true]);
  // 名字看起来像视觉模型也不能猜支持；纯文本能力必须保留为 false。
  assert.equal(rows[2].id, 'unknown-VL');
  const models = Array.from({ length: 20 }, (_, index) => ({ ...rows[0], id: 'visual-' + index }));
  assert.equal(parser.curateSiliconFlow(models).length, 20);
}

/** 缺字段的旧目录即使未过期也刷新；离线恢复只补已核实型号，陌生型号仍未知。 */
async function checkOldCache(root) {
  const file = path.join(root, 'agent-catalog-siliconflow.json');
  const models = [{ id: 'unknown-VL', input: 0, output: 0, tier: 'free' }];
  fs.writeFileSync(file, JSON.stringify({ provider: 'siliconflow', models, recommended: 'unknown-VL', updatedAt: new Date().toISOString() }));
  const original = global.fetch;
  const modulePath = require.resolve('../../apps/electron/src/main/modules/agent/provider-catalog');
  let reads = 0;
  global.fetch = async () => { reads++; throw Error('offline'); };
  delete require.cache[modulePath];
  try {
    const { getProviderCatalog } = require(modulePath);
    const catalog = await getProviderCatalog('siliconflow');
    assert.ok(reads > 0); assert.equal(catalog.error, 'availability');
    assert.equal(catalog.models.find(row => row.id === 'unknown-VL').imageInput, null);
  } finally { global.fetch = original; delete require.cache[modulePath]; }
}

async function checkModelImageCapability(root) { checkCapabilities(); await checkOldCache(root); }
module.exports = { checkModelImageCapability };

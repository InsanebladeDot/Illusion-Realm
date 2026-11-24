/** 官网样本验证免费补项、收费优先和缓存失败恢复；不使用用户密钥，不发送推理请求。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseGlm } = require('../../apps/electron/src/main/modules/agent/glm-catalog-parser');
const { getProviderCatalog } = require('../../apps/electron/src/main/modules/agent/provider-catalog');
const evidence = path.join(__dirname, '../../docs/design/glm-model-order-2026-11-17/evidence');
const pages = ['pricing', 'model-overview', 'glm-4'].map(name => fs.readFileSync(path.join(evidence, name + '.md'), 'utf8'));
const expected = ['glm-4.7-flash', 'glm-4.5-flash', 'glm-4-flash-250414', 'glm-4-flash', 'glm-4.6v-flash', 'glm-4v-flash', 'glm-4.1v-thinking-flash'];

function checkOfficialPages() {
  const models = parseGlm(...pages);
  for (const id of expected) assert.ok(models.some(x => x.id === id && x.input === 0 && x.output === 0 && x.tier === 'free'), id);
  // 视觉聊天用于识图；专用 OCR、图片生成与语音生成仍不能混进来。
  assert.ok(!models.some(x => /ocr|image|tts/i.test(x.id)));
  const override = parseGlm(pages[0] + '\n', pages[1] + '\n| [GLM-5.3](https://docs.bigmodel.cn/test) | 免费文本模型 | 1M |', pages[2]);
  assert.equal(override.find(x => x.id === 'glm-5.3').input, 8);
  assert.equal(models.length, new Set(models.map(x => x.id)).size);
}

async function checkGlmFreeCatalog() {
  checkOfficialPages();
  const original = global.fetch;
  let failDetails = false;
  // 真正经过目录刷新和落盘，单个资料页失败时不能用残缺目录覆盖完整缓存。
  global.fetch = async url => {
    const index = String(url).endsWith('pricing.md') ? 0 : String(url).endsWith('model-overview.md') ? 1 : 2;
    if (failDetails && index === 1) throw Error('offline');
    return new Response(pages[index]);
  };
  try {
    const live = await getProviderCatalog('glm', true);
    assert.equal(live.source, 'live');
    for (const id of expected) assert.ok(live.models.some(x => x.id === id));
    failDetails = true;
    const cached = await getProviderCatalog('glm', true);
    assert.equal(cached.error, 'network');
    assert.equal(cached.updatedAt, live.updatedAt);
    assert.deepEqual(cached.models, live.models);
  } finally { global.fetch = original; }
}
module.exports = { checkGlmFreeCatalog };

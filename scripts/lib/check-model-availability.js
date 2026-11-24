/** 使用假响应验证默认放行和实际拒绝；不发送推理请求，不接触用户密钥。 */
const assert = require('node:assert/strict');
const { updateProviderKey, resolveProviderKey } = require('../../apps/electron/src/main/modules/agent/provider-secrets');
const { getProviderCatalog } = require('../../apps/electron/src/main/modules/agent/provider-catalog');
const { beginModelAttempt, applyModelAvailability, resetModelAvailability, agentModelAttempt } = require('../../apps/electron/src/main/modules/agent/provider-model-availability');
const assistant = require('../../apps/electron/src/main/modules/prompt-assistant/service');
const model = 'gpt-5.5';

/** 沿用真实目录读取，确认 UI 收到的 available 状态，不只断言登记表本身。 */
async function availability() {
  const catalog = await getProviderCatalog('euzhi');
  assert.ok(catalog.models.some(item => item.id === model));
  return catalog.models.find(item => item.id === model).available;
}

/** 测试像两把钥匙开同一扇门：失败只能记到请求发出时的那把钥匙上。 */
async function checkAttemptIsolation() {
  const key = resolveProviderKey('euzhi').key;
  const old = beginModelAttempt('euzhi', model, key);
  const latest = beginModelAttempt('euzhi', model, key);
  latest(true); old(false, 'model_not_found');
  assert.equal(await availability(), true);
  const stale = beginModelAttempt('euzhi', model, key);
  resetModelAvailability('euzhi'); stale(false, 'model_not_found');
  assert.equal(await availability(), null);
  const agentResult = agentModelAttempt(JSON.stringify({ config: { provider: 'euzhi', model, apiKey: key } }));
  agentResult(false, "NotFoundError: Error code: 404 - {'error': {'code': 'model_not_found'}}");
  assert.equal(await availability(), false);
  updateProviderKey('euzhi', 'test-another-availability-key');
  assert.equal(await availability(), null);
  updateProviderKey('euzhi', key);
  assert.equal(await availability(), false);
  const sample = [{ id: model, available: false }];
  assert.equal(applyModelAvailability('glm', sample)[0].available, null);
  await getProviderCatalog('euzhi', true);
  assert.equal(await availability(), null);
}

/** 余额、限流、断网、无效密钥和图片参数错误不能把聊天模型永久封住。 */
async function checkTemporaryFailures() {
  const key = resolveProviderKey('euzhi').key;
  for (const error of [
    { status: 401, error: { code: 'model_not_found' } },
    { status: 429, error: { message: 'model not found' } },
    { status: 503, error: { code: 'model_not_found' } },
    { status: 403, error: { message: 'insufficient balance for model' } },
    { status: 400, error: { message: 'model does not support image_url' } },
    'TimeoutError: request timed out', 'Error code: 403 - forbidden',
  ]) {
    resetModelAvailability('euzhi');
    beginModelAttempt('euzhi', model, key)(false, error);
    assert.equal(await availability(), null);
  }
  beginModelAttempt('euzhi', model, key)(false, { status: 403, error: { message: 'No access to this model' } });
  assert.equal(await availability(), false);
}

/** 转译走正式服务入口，检查返回错误后只有被调用型号置灰，成功后恢复。 */
async function checkTransformRejection(setReply) {
  const input = { provider: 'euzhi', baseUrl: '', model, text: 'test', instruction: 'translate' };
  setReply(200, { choices: [] });
  await assert.rejects(() => assistant.transform(input), /emptyResponse/);
  assert.equal(await availability(), null);
  setReply(404, { error: { code: 'model_not_found', message: 'Model does not exist' } });
  await assert.rejects(() => assistant.transform(input), /http404/);
  assert.equal(await availability(), false);
  const catalog = await getProviderCatalog('euzhi');
  assert.ok(catalog.models.filter(item => item.id !== model).every(item => item.available !== false));
  setReply(200, { choices: [{ message: { content: 'translated' } }] });
  assert.equal(await assistant.transform(input), 'translated');
  assert.equal(await availability(), true);
}

/** 固定价目和不完整 /models 列表隔离官网变化；所有写入仍在调用方的临时用户目录。 */
async function checkModelAvailability(pricing) {
  const original = global.fetch;
  const previousKey = resolveProviderKey('euzhi').key;
  updateProviderKey('euzhi', 'test-model-availability-key');
  let status = 200, reply = {};
  global.fetch = async url => {
    if (String(url).endsWith('/api/pricing')) return Response.json(pricing);
    if (String(url).endsWith('/models')) return Response.json({ data: [] });
    return Response.json(reply, { status });
  };
  try {
    await getProviderCatalog('euzhi', true);
    assert.equal(await availability(), null);
    await checkAttemptIsolation();
    await checkTemporaryFailures();
    resetModelAvailability('euzhi');
    await checkTransformRejection((code, body) => { status = code; reply = body; });
  } finally { global.fetch = original; resetModelAvailability('euzhi'); updateProviderKey('euzhi', previousKey || null); }
}

module.exports = { checkModelAvailability };

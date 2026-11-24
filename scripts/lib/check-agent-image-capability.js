/** 用正式选择器切换模型，验证图片入口随能力改变；不触发付费生成。 */
async function choose({ run, wait }, provider, model) {
  await run("document.querySelector('[data-agent-model]').click()");
  await wait("document.querySelector('#agent-model-dialog')");
  await run(`document.querySelector('[data-agent-provider=${provider}]').click()`);
  await wait(`document.querySelector('[data-agent-model-option="${model}"]')`);
  await run(`document.querySelector('[data-agent-model-option="${model}"]').click()`);
  await run("document.querySelector('[data-agent-model-apply]').click()");
  await wait("!document.querySelector('#agent-model-dialog')");
}

async function checkAgentImageCapability(ctx) {
  const { run, wait, check } = ctx;
  await choose(ctx, 'glm', 'glm-4.7-flash');
  check('Text-only Agent model disables the image upload entry', await run("document.querySelector('[data-agent-add]').disabled"));
  await choose(ctx, 'glm', 'glm-4.6v-flash');
  await wait("!document.querySelector('[data-agent-add]').disabled");
  check('Official vision Agent model enables image upload', true);
  // 测试完恢复原供应商，后续密钥与实际请求断言仍使用原前提。
  await choose(ctx, 'euzhi', 'grok-4.7');
  check('Unconfirmed Agent capability stays disabled without blocking model selection', await run("document.querySelector('[data-agent-add]').disabled&&document.querySelector('[data-agent-model]').dataset.agentModel==='grok-4.7'"));
}
module.exports = { checkAgentImageCapability, chooseAgentModel: choose };

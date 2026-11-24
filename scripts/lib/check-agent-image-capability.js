/** 通过正式选择器应用模型，等待弹窗关闭后再交还控制。 */
async function choose({ run, wait }, provider, model) {
  await run("document.querySelector('[data-agent-model]').click()");
  await wait("document.querySelector('#agent-model-dialog')");
  await run(`document.querySelector('[data-agent-provider=${provider}]').click()`);
  await wait(`document.querySelector('[data-agent-model-option="${model}"]')`);
  await run(`document.querySelector('[data-agent-model-option="${model}"]').click()`);
  await run("document.querySelector('[data-agent-model-apply]').click()");
  await wait("!document.querySelector('#agent-model-dialog')");
}

module.exports = { chooseAgentModel: choose };

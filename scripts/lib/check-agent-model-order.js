/** 两个真实入口共用同一组交互断言；目录数据来自官方存档，外部聊天仍用测试替身。 */
async function checkAgentModelOrder({ run, wait, check, capture }) {
  const first = "document.querySelector('[data-agent-model-option]')?.dataset.agentModelOption";
  // Agent 和转译共用这组断言；账户目录缺项时，全部型号仍应允许首次尝试。
  check('All GLM models are initially selectable', await run("[...document.querySelectorAll('[data-agent-model-option]')].every(button=>!button.disabled)"));
  check('Default order puts official free GLM models first', await run(`${first}==='glm-4.7-flash'&&['glm-4.5-flash','glm-4-flash-250414','glm-4-flash'].every(id=>document.querySelector('[data-agent-model-option="'+id+'"]'))`));
  await capture('glm-free-first');
  await run("document.querySelector('[data-agent-model-option=\"glm-4.5-flash\"]').click()");
  for (const [order, expected] of [['price-desc', 'glm-5.3'], ['price-asc', 'glm-4.7-flash'], ['official', 'glm-5.3'], ['free-first', 'glm-4.7-flash']]) {
    await run("document.querySelector('[data-agent-model-sort]').click()");
    await wait("document.querySelector('[data-simple-select-panel]')");
    await run(`document.querySelector('[data-simple-select-option="${order}"]').click()`);
    await wait(`${first}==='${expected}'`);
    check(`Order ${order} works without changing the selected model`, await run("document.querySelector('[data-agent-model-option=\"glm-4.5-flash\"]').getAttribute('aria-pressed')==='true'"));
    if (order === 'price-desc') await capture('glm-high-price-first');
  }
  await checkImageFilter({ run, wait, check, capture });
  // Escape 先关排序菜单，模型窗口与暂选都应留下，避免误丢用户选择。
  await run("document.querySelector('[data-agent-model-sort]').click()");
  await wait("document.querySelector('[data-simple-select-panel]')");
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await wait("!document.querySelector('[data-simple-select-panel]')");
  check('Escape closes only the sorting menu', await run("!!document.querySelector('#agent-model-dialog')"));
}
/** 两个模型弹窗共用分类；筛选不提交选择，也不把未知能力算成多模态。 */
async function checkImageFilter({ run, wait, check, capture }) {
  check('Text model card clearly marks unsupported image input', await run("document.querySelector('[data-agent-model-option=\"glm-4.7-flash\"]').dataset.imageInput==='unsupported'"));
  await run("document.querySelector('[data-agent-image-filter=images]').click()");
  await wait("document.querySelector('[data-agent-model-option=\"glm-4.6v-flash\"]')");
  check('Image classification contains only confirmed vision models', await run("[...document.querySelectorAll('[data-agent-model-option]')].every(card=>card.dataset.imageInput==='supported')&&!document.querySelector('[data-agent-model-option=\"glm-4.7-flash\"]')"));
  await capture('glm-image-models');
  await run("document.querySelector('[data-agent-image-filter=all]').click()");
  await wait("document.querySelector('[data-agent-model-option=\"glm-4.5-flash\"]')");
  check('Restoring all models preserves the draft selection', await run("document.querySelector('[data-agent-model-option=\"glm-4.5-flash\"]').getAttribute('aria-pressed')==='true'"));
}
module.exports = { checkAgentModelOrder };

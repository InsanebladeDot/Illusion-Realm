/** 用本地 HTTP 夹具验证 ComfyUI 代理能从提交和历史响应中识别主 UNet 错误。 */
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { generateWithComfy } = require('../apps/electron/src/main/modules/comfy/proxy');

const prompt = {
  '147:127': { class_type: 'UNETLoader', inputs: { unet_name: 'Custom\\model.safetensors' } },
  '147:128': { class_type: 'CLIPLoader', inputs: { clip_name: 'clip.safetensors' } },
};
const nodeError = input_name => ({ errors: [{ type: 'value_not_in_list', extra_info: { input_name } }] });
const modelError = 'ERROR: Could not detect model type of: C:\\private\\weights.safetensors';

function executionError(node_id, node_type, exception_message) {
  return { p: { status: { status_str: 'error', completed: false, messages: [
    ['execution_error', { node_id, node_type, exception_message }],
  ] } } };
}

async function verifyComfyErrors() {
  let rejection;
  let history;
  const server = createServer((request, response) => {
    // 400 必须走提交失败分支，成功入队的错误则只能从 /history 读到。
    const isQueue = request.method === 'POST' && request.url === '/prompt';
    response.writeHead(isQueue && rejection ? 400 : 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(isQueue ? rejection ?? { prompt_id: 'p' } : history));
  }).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const generate = () => generateWithComfy(`127.0.0.1:${server.address().port}`, prompt);
    rejection = { node_errors: { '147:127': nodeError('unet_name') } };
    await assert.rejects(generate, { code: 'COMFY_UNET_NOT_FOUND' });
    rejection = { node_errors: { '147:128': nodeError('clip_name') } };
    await assert.rejects(generate, { code: 'COMFY_EXECUTION_FAILED' });
    rejection = undefined;
    // 同一个节点可能遇到显存不足。另一个节点也可能返回看起来相似的格式错误。
    history = executionError('147:127', 'UNETLoader', 'CUDA out of memory');
    await assert.rejects(generate, { code: 'COMFY_EXECUTION_FAILED' });
    history = executionError('147:128', 'CLIPLoader', modelError);
    await assert.rejects(generate, { code: 'COMFY_EXECUTION_FAILED' });
    history = executionError('147:127', 'UNETLoader', modelError);
    await assert.rejects(generate, { code: 'COMFY_UNET_LOAD_FAILED', message: 'ComfyUI failed to load the selected UNet' });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

verifyComfyErrors().then(() => console.log('PASS ComfyUI UNet submission and execution errors')).catch(error => {
  console.error(error);
  process.exitCode = 1;
});

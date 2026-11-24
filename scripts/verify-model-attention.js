/** 运行真实接线器与仓库模板；验证可达性、开关回接和旁路不变，不声称实际模型加速。 */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ts = require('../apps/next/node_modules/typescript');

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name === '@/i18n') return { t: key => key };
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw Error(`Unexpected runtime import: ${name}`);
  }, module, module.exports);
  return module.exports;
}
const { applyModelAttention: apply } = load('apps/next/src/utils/comfy/model-attention.ts');
const { DEFAULT_MODEL_ATTENTION: defaults, resolveModelAttention } = load('packages/shared/src/types/model-attention.ts');
const { workflowToApiPrompt } = load('apps/next/src/utils/comfy/workflowToApi.ts');
const off = { ...defaults, enabled: false };
let checked = 0;
function check(name, run) { run(); checked++; console.log('PASS', name); }
function links(prompt) {
  return Object.values(prompt).flatMap(node => Object.values(node.inputs).filter(value => Array.isArray(value) && typeof value[0] === 'string' && Number.isInteger(value[1])));
}
function assertAcyclic(prompt) {
  const visited = new Set(), active = new Set();
  function visit(id) {
    assert.ok(!active.has(id), `cycle at ${id}`);
    if (visited.has(id)) return;
    assert.ok(prompt[id], `missing node ${id}`);
    active.add(id);
    for (const [source] of links({ [id]: prompt[id] })) visit(source);
    active.delete(id); visited.add(id);
  }
  for (const id of Object.keys(prompt)) visit(id);
}
check('Old and malformed preferences recover Kitchen defaults; explicit off survives', () => {
  for (const value of [undefined, null, {}, { enabled: 'true', backend: 'pytorch attention' }]) assert.deepEqual(resolveModelAttention(value), defaults);
  assert.deepEqual(resolveModelAttention(off), off);
});
const basic = { main: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model' } }, sampler: { class_type: 'KSampler', inputs: { model: ['main', 0], clip: ['main', 1], vae: ['main', 2] } } };
check('Only MODEL output changes; CLIP/VAE, existing IDs and sampler parameters remain', () => {
  const graph = structuredClone(basic); apply(graph, defaults); assertAcyclic(graph);
  const id = graph.sampler.inputs.model[0];
  assert.equal(graph[id].class_type, 'ModelAttentionBackend'); assert.deepEqual(graph[id].inputs.model, ['main', 0]);
  assert.deepEqual(graph.sampler.inputs.clip, ['main', 1]); assert.deepEqual(graph.sampler.inputs.vae, ['main', 2]);
  const once = structuredClone(graph); apply(graph, defaults); assert.deepEqual(graph, once);
  apply(graph, { ...defaults, backend: 'pytorch attention' }); assert.equal(graph[id].inputs.attention, 'pytorch attention');
  apply(graph, off); assert.deepEqual(graph, basic);
});
check('An existing backend is reused even when other model consumers bypass it', () => {
  const graph = structuredClone(basic);
  graph.existing = { class_type: 'ModelAttentionBackend', inputs: { model: ['main', 0], attention: 'pytorch attention' } };
  graph.branch = { class_type: 'LoraLoaderModelOnly', inputs: { model: ['existing', 0], strength_model: 1 } };
  apply(graph, defaults); assertAcyclic(graph);
  assert.deepEqual(graph.sampler.inputs.model, ['existing', 0]);
  assert.equal(Object.values(graph).filter(node => node.class_type === 'ModelAttentionBackend').length, 1);
  apply(graph, off); assert.deepEqual(graph.branch.inputs.model, ['main', 0]);
});
check('Invalid settings reject before mutation; unrelated graphs stay unchanged', () => {
  const graph = structuredClone(basic);
  for (const value of [{ enabled: true, backend: 'unknown' }, { enabled: 'true', backend: defaults.backend }]) { assert.throws(() => apply(graph, value), /attention.invalid/); assert.deepEqual(graph, basic); }
  const other = { vae: { class_type: 'VAELoader', inputs: { vae_name: 'vae' } } }; const before = structuredClone(other);
  apply(other, defaults); assert.deepEqual(other, before);
});

/** 对真实 API 图逐一接线再拆除；不读取权重，也不以文件名断定推理兼容性。 */
function checkTemplate(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const original = Array.isArray(data.nodes) ? workflowToApiPrompt(data) : data;
  if (!Object.values(original).some(node => node?.class_type)) return;
  const clean = structuredClone(original); apply(clean, off);
  const graph = structuredClone(original); apply(graph, defaults); assertAcyclic(graph);
  const backend = Object.values(graph).filter(node => node.class_type === 'ModelAttentionBackend');
  const loaders = Object.values(original).some(node => ['UNETLoader', 'UnetLoaderGGUF', 'CheckpointLoaderSimple', 'CheckpointLoader'].includes(node.class_type));
  if (loaders) assert.ok(backend.length, file);
  else assert.deepEqual(graph, original);
  assert.ok(backend.every(node => node.inputs.attention === defaults.backend));
  const once = structuredClone(graph); apply(graph, defaults); assert.deepEqual(graph, once);
  apply(graph, off); assert.deepEqual(graph, clean);
  checked++;
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : entry.name.endsWith('.json') ? [path.join(directory, entry.name)] : []);
}
for (const file of walk('apps/next/src/data/comfy')) checkTemplate(file);
console.log('MODEL_ATTENTION_OK', checked);

const comfyRoot = 'apps/next/src/utils/comfy';
const dataRoot = 'apps/next/src/data/comfy/imageWorkflower';
const modelPath = load(`${comfyRoot}/comfyModelPath.ts`);
const { buildImagePrompt, getImageWorkflowDefaults } = load(`${comfyRoot}/imageWorkflow.ts`, {
  '@/data/comfy/imageWorkflower/Anima/标准anima生成流.json': require(`../${dataRoot}/Anima/标准anima生成流.json`),
  '@/data/comfy/imageWorkflower/SDXL/标准SDXL生成.json': require(`../${dataRoot}/SDXL/标准SDXL生成.json`),
  '@/data/comfy/imageWorkflower/Moss_Image/文生图.json': require(`../${dataRoot}/Moss_Image/文生图.json`),
  '@/utils/comfy/workflowToApi': load(`${comfyRoot}/workflowToApi.ts`),
  '@/utils/comfy/comfyModelPath': modelPath,
  './video-workflow-models': load(`${comfyRoot}/video-workflow-models.ts`, {
    './comfyModelPath': modelPath,
    '@/data/videoForm': { isMinimaxWorkflow: () => false },
  }),
});

// 检查采样器实际接到哪条模型线，避免只验证开关值却漏掉断开的 SLG。
check('Moss routes SLG through the same LoRA and attention backend and applies Flux2 batching', () => {
  const baseline = buildImagePrompt('moss');
  assert.equal(baseline['18:24'].inputs.switch, false);
  assert.deepEqual(baseline['18:24'].inputs.on_false, ['18:27', 0]);
  assert.equal(getImageWorkflowDefaults('moss').samplerName, 'er_sde');
  const graph = buildImagePrompt('moss', { slg: true, width: 768, height: 1152, batchSize: 4, loras: [{ name: 'Moss_Image/fixture.safetensors', strength: 0.8 }] });
  apply(graph, defaults);
  assertAcyclic(graph);
  assert.deepEqual(graph['18:6'].inputs, { width: 768, height: 1152, batch_size: 4 });
  assert.deepEqual(graph['18:7'].inputs.model, ['18:24', 0]);
  assert.deepEqual(graph['18:24'].inputs, { switch: true, on_false: ['100', 0], on_true: ['18:15', 0] });
  assert.deepEqual(graph['18:15'].inputs.model, ['100', 0]);
  assert.deepEqual(graph['100'].inputs.model, ['18:27', 0]);
  assert.equal(graph['18:27'].inputs.attention, 'comfy kitchen attention');
  apply(graph, off);
  assertAcyclic(graph);
  assert.deepEqual(graph['100'].inputs.model, ['18:1', 0]);
  assert.deepEqual(buildImagePrompt('moss'), baseline);
});

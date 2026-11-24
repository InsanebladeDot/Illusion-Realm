/** MiniMax面积预算回归：真实算法、两份工作流、复制与旧尺寸兼容；不执行模型或读用户数据。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../apps/next/node_modules/typescript');
const requireFromNext = require('node:module').createRequire(path.resolve(__dirname, '../apps/next/package.json'));
const cache = new Map();

// 只转译仓库纯模块；翻译是返回键名的替身，尺寸和模板均为生产代码。
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const module = { exports: {} };
  cache.set(file, module);
  const resolve = name => {
    if (name === '@/i18n') return { t: key => key };
    if (!name.startsWith('@/') && !name.startsWith('.')) return requireFromNext(name);
    const bases = name.startsWith('@/') ? ['apps/next/src', 'packages/shared/src'].map(root => path.resolve(__dirname, '..', root, name.slice(2))) : [path.resolve(path.dirname(file), name)];
    const target = bases.flatMap(base => [base, base + '.ts', base + '.json']).find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    assert.ok(target, `Missing production dependency: ${name}`);
    return load(target);
  };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(resolve, module, module.exports);
  return module.exports;
}
const source = name => load(path.resolve(__dirname, '../apps/next/src', name + '.ts'));
const area = source('view/infinite-canvas/canvas-video-resolution');
const output = source('view/infinite-canvas/canvas-output-size');
const workflow = source('view/infinite-canvas/canvas-video-workflow');
const templates = source('utils/comfy/videoWorkflow');
const { findMinimaxVideoNode } = source('utils/comfy/minimax-video-node');
const base = { kind: 'video', workflow: 'minimax', title: 'A', prompt: '', content: '', ratio: '16/9' };

// 固定案例不从被测函数反推；连续切换像换画框，不能拿上次舍入后的边长再缩一次。
function fixedCases() {
  for (const [ratio, mp, width, height] of [['16/9', 0.1, 416, 256], ['9/16', 0.1, 256, 416], ['16/9', 1, 1376, 768], ['9/16', 1, 768, 1376], ['1/1', 1, 1024, 1024]]) {
    assert.deepEqual(area.canvasMegapixelDimensions(ratio, mp), { width, height });
  }
  let data = base;
  for (const value of [0.1, 1, 0.1]) data = { ...data, ...area.canvasMegapixelPatch(data, '16/9', value) };
  assert.deepEqual(data.videoOutput, { width: 416, height: 256 });
  for (const value of [0, -1, 0.15, 1.1, NaN, Infinity, '0.1']) assert.throws(() => area.canvasMegapixelDimensions('16/9', value));
  for (const ratio of ['0/1', '1/0', 'bad', 'Infinity/1']) assert.throws(() => area.canvasMegapixelDimensions(ratio, 1));
  assert.throws(() => area.canvasMegapixelPatch({ ...base, kind: 'image' }, '1/1', 1));
}

// 160个真实模板组合逐项读回生成节点，其余模板内容必须完全不变。
function templateCases() {
  const ratios = load(path.resolve(__dirname, '../packages/shared/src/data/imageSizes.ts')).IMAGE_SIZE_PRESETS.map(preset => preset.id);
  assert.equal(ratios.length, 8);
  assert.deepEqual(area.VIDEO_MEGAPIXELS, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  for (const id of ['minimax', 'minimax-reference']) for (const ratio of ratios) for (const mp of area.VIDEO_MEGAPIXELS) {
    const original = templates.getVideoWorkflowTemplate(id), before = JSON.stringify(original);
    const data = { ...base, workflow: id, ...area.canvasMegapixelPatch({ ...base, workflow: id }, ratio, mp) };
    const result = workflow.getCanvasVideoWorkflowTemplate(data);
    const dimensions = output.canvasOutputDimensions(data), node = findMinimaxVideoNode(result);
    assert.deepEqual({ width: node.inputs.width, height: node.inputs.height }, dimensions);
    assert.ok(dimensions.width % 32 === 0 && dimensions.height % 32 === 0);
    Object.assign(findMinimaxVideoNode(original).inputs, dimensions);
    assert.deepEqual(result, original);
    assert.equal(JSON.stringify(templates.getVideoWorkflowTemplate(id)), before);
  }
}

// 旧工程不偷偷改尺寸；新节点默认面积，复制后更新副本不得原地改写原片。
function compatibility() {
  assert.deepEqual(output.canvasOutputDimensions(base), { width: 1376, height: 768 });
  assert.deepEqual(output.canvasOutputDimensions({ ...base, workflow: 'wan2.2' }), { width: 1280, height: 720 });
  const legacy = { ...base, videoOutput: { width: 1920, height: 1080 } };
  assert.deepEqual(output.canvasOutputDimensions(legacy), legacy.videoOutput);
  assert.deepEqual(workflow.getCanvasVideoWorkflowTemplate(legacy), templates.getVideoWorkflowTemplate('minimax'));
  const data = { ...base, ...area.canvasMegapixelPatch(base, '16/9', 0.1) };
  const model = source('view/infinite-canvas/canvas-model');
  const duplicate = model.duplicateNodes([{ id: 'a', type: 'canvas', position: { x: 0, y: 0 }, data, selected: true }], 'test');
  const copied = duplicate.at(-1).data;
  assert.notEqual(copied, data);
  assert.notEqual(copied.videoOutput, data.videoOutput);
  assert.equal(copied.videoMegapixels, 0.1);
  const changed = { ...copied, ...area.canvasMegapixelPatch(copied, '9/16', 1) };
  assert.deepEqual(changed.videoOutput, { width: 768, height: 1376 });
  assert.deepEqual(data.videoOutput, { width: 416, height: 256 });
}
try {
  fixedCases();
  templateCases();
  compatibility();
  console.log('CANVAS_MEGAPIXELS_OK: fixed, invalid, 160 template combinations, defaults, legacy and copy isolation');
} catch (error) { console.error(error); process.exitCode = 1; }

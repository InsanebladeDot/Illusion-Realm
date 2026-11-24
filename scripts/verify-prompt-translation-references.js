/** 转译引用反证：执行正式转换函数，验证稀疏编号、同名素材及迟到结果，不调用云端模型。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const nextRequire = createRequire(path.resolve('apps/next/package.json'));
const sharedRequire = createRequire(path.resolve('packages/shared/package.json'));
const ts = nextRequire('typescript');
const cache = new Map();

// 仅将翻译函数替换为 key；引用排序、自定义前缀校验和映射均来自生产源码。
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const dependency = name => {
    if (name === '@/i18n') return { t: key => key };
    if (name === 'zod') return sharedRequire(name);
    if (name.startsWith('@/schemas/')) return load(path.resolve('packages/shared/src', name.slice(2) + '.ts'));
    if (name.startsWith('@/')) return load(path.resolve('apps/next/src', name.slice(2) + '.ts'));
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'));
    return nextRequire(name);
  };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, dependency);
  return exports;
}
const { normalizeVideoReferences: normalize } = load(path.resolve('apps/next/src/utils/comfy/video-reference-media.ts'));
const { restoreTranslationReferences: restore, assertTranslationReferenceKey: sameKey } = load(path.resolve('apps/next/src/utils/prompt-translation-references.ts'));
let checked = 0;
function check(name, test) { test(); checked++; console.log('PASS', name); }
function asset(id, kind, number) { return { id, kind, number, name: 'same-name.png', src: `fixture:${id}`, tokenPrefix: 'picture' }; }
const media = [asset('second', 'image', 9), asset('voice', 'audio', 4), asset('first', 'image', 2), asset('clip', 'video', 3)];
const prepare = text => normalize(text, media);
const input = prepare('Use @picture9, @picture2, @video3 and @audio4.');

check('稀疏编辑编号按实际上传表连续排列，三类独立编号', () => {
  assert.equal(input, 'Use <Picture 2>, <Picture 1>, <Video 1> and <Audio 1>.');
  assert.equal(restore(input, input, media, prepare), 'Use @picture9, @picture2, @video3 and @audio4.');
});
check('同名文件和重复使用同一素材不会混淆身份', () => {
  const output = input + ' Repeat <Picture 2>.';
  assert.equal(prepare(restore(output, input, media, prepare)), output);
});
check('全参考可新增 Subject 内容定义，不能被当成图片或上传文件', () => {
  assert.equal(restore('<Subject 1> comes from <Picture 1>.', '<Picture 1>', media, prepare), '<Subject 1> comes from @picture2.');
});
check('自定义三类前缀也使用同一请求映射，保留真实资源编号', () => {
  const custom = text => normalize(text, media, { image: 'XXX', video: 'Clip', audio: 'Voice' });
  const text = custom('@picture9 @video3 @audio4');
  assert.equal(text, '<XXX 2> <Clip 1> <Voice 1>');
  assert.equal(restore(text, text, media, custom), '@picture9 @video3 @audio4');
});
check('漏掉一个已有引用拒绝回填；不能把 Picture 2 偷换成 Picture 1', () => {
  assert.throws(() => restore('Use <Picture 1>.', '<Picture 2>', media, prepare), /referenceInvalid/);
  assert.throws(() => restore('No references.', input, media, prepare), /referenceInvalid/);
});
check('越界引用在正式规范化时拒绝，不进入还原或写回', () => {
  for (const token of ['<Picture 3>', '<Video 0>', '<Audio 9>', '@picture8']) assert.throws(() => prepare(token));
});
check('空素材不接受伪造的默认类型标记', () => {
  assert.throws(() => restore('<Picture 1>', '', [], text => text), /referenceInvalid/);
});
check('旧 Slot 在请求边界统一为 Audio，还原后保持音频身份', () => {
  assert.equal(restore(prepare('<Slot 1>'), '<Audio 1>', media, prepare), '@audio4');
});
check('紧贴英文或中文的标记回填后仍可再次识别', () => {
  const restored = restore('从<Picture 1>to<Picture 2>结束', '<Picture 1> <Picture 2>', media, prepare);
  assert.equal(restored, '从 @picture2 to @picture9 结束');
  assert.equal(prepare(restored), '从 <Picture 1> to <Picture 2> 结束');
});
check('多次转译保持可编辑引用，提交仍产生相同的工作流标记', () => {
  let text = '@picture9 with @audio4';
  for (let index = 0; index < 3; index++) text = restore(prepare(text), prepare(text), media, prepare);
  assert.equal(text, '@picture9 with @audio4');
});
check('清单或转换设置变化后，手动应用也不能绕过快照校验', () => {
  sameKey('original', 'original');
  sameKey(undefined, undefined);
  for (const current of ['reordered', 'removed', undefined]) assert.throws(() => sameKey('original', current), /referenceChanged/);
});
console.log(`PASS ${checked} prompt reference scenarios; no remote inference`);

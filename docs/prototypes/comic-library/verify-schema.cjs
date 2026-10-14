/** Validate current template data first, then legacy defaults and malformed persisted data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = path.resolve(__dirname, '../../../apps/next');
const ts = require(path.join(base, 'node_modules/typescript'));
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const result = { exports: {} };
  cache.set(file, result.exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const resolve = request => load(request.startsWith('@/')
    ? path.join(base, 'src', request.slice(2) + '.ts') : path.resolve(path.dirname(file), request + '.ts'));
  new Function('require', 'module', 'exports', code)(resolve, result, result.exports);
  return result.exports;
}
const { readComicTemplateLibrary } = load(path.join(base, 'src/utils/comic/custom-templates.ts'));
const vertices = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const current = {
  id: 'golden', name: 'Golden', category: 'custom:Golden',
  frames: [{ x: 4, y: 3, width: 92, height: 94, vertices }],
  pageSize: { width: 1129, height: 1600 }, backgroundColor: '#f8e4c8',
};
const read = templates => readComicTemplateLibrary({ version: 1, templates });
assert.deepEqual(read([current]), { version: 1, templates: [current] });
const legacy = { ...current }; delete legacy.backgroundColor;
assert.equal(read([legacy]).templates[0].backgroundColor, '#ffffff');
assert.deepEqual(readComicTemplateLibrary(undefined), { version: 1, templates: [] });
assert.equal(readComicTemplateLibrary({ version: 2, templates: [current] }).templates.length, 0);
assert.equal(read([{ ...current, backgroundColor: 'url(invalid)' }]).templates[0].backgroundColor, '#ffffff');
assert.equal(read([{ ...current, category: 'missing-key' }]).templates.length, 0);
assert.equal(read([{ ...current, category: 'custom: ' }]).templates.length, 0);
assert.equal(read([{ ...current, pageSize: { width: 0, height: 1600 } }]).templates.length, 0);
assert.equal(read([{ ...current, frames: [{ ...current.frames[0], vertices: [{ x: NaN, y: 0 }] }] }]).templates.length, 0);
assert.equal(read([current, current]).templates.length, 1);
const imageTemplate = { ...current, image: 'private', frames: [{ ...current.frames[0], image: 'private', description: 'private' }] };
assert.deepEqual(read([imageTemplate]).templates[0], current);
console.log('PASS: current format, legacy white default, malformed data, duplicates and geometry whitelist');

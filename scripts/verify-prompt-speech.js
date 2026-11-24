/** 直接编译生产匹配器，核对原文区间；不以相同正则再实现一遍预期。 */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ts = require('../apps/next/node_modules/typescript');
const file = path.resolve('apps/next/src/utils/prompt-speech.ts');
const source = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const production = {exports:{}};
new Function('exports', source)(production.exports);
const ranges = production.exports.promptSpeechRanges;
const cases = [
  ['背景 [English] Hello。背景',['[English] Hello。']],
  ['[Chiness] 你好。接着 [Japanese] こんにちは。',['[Chiness] 你好。','[Japanese] こんにちは。']],
  ['[English] First. Second。End.',['[English] First. Second。']],
  ['[English] first\nsecond。',['[English] first\nsecond。']],
  ['[English] still typing',['[English] still typing']],
  ['[English] use @picture1 <Picture 1> [aside]。',['[English] use @picture1 <Picture 1> [aside]。']],
  ['[Simplified Chinese] 你好。',['[Simplified Chinese] 你好。']],
  ['[Shot 1] scene。',[]],
  ['[中文] 你好。',[]],
  ['English] broken。',[]],
  ['ordinary text。',[]],
  ['[english] hello。。',['[english] hello。']],
];
for (const [text,expected] of cases) {
  const spans = ranges(text);
  assert.deepEqual(spans.map(span=>text.slice(span.start,span.end)),expected,text);
  assert.ok(spans.every(span=>span.start>=0&&span.end<=text.length));
}
console.log('PROMPT_SPEECH_OK',cases.length);

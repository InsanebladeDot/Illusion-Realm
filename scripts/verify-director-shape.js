// 静态字段清单来自 shared 的 schema，生产主进程不会加载 TypeScript 或 Zod。
// 这个维护工具像核对两端的印刷版：默认只检查；明确 --write 才更新清单文件。
// 自定义引用关系仍是手写校验，另由两端 golden 和反例测试比较行为。
// 因为这是构建辅助脚本，未知 Zod 节点必须报错，不能悄悄生成宽松规则。
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { load } = require("./lib/load-director-source");
const source = load(path.resolve(__dirname, "../packages/shared/src/schemas/director.schema.ts"));
const file = path.resolve(__dirname, "../apps/electron/src/main/modules/canvas/director-shape.json");
const rules = {
  // 纯 JSON 限额由主进程手写等价检查，静态字段清单取管道输出侧。
  ZodPipeline: d => serialize(d.out),
  ZodEffects: d => serialize(d.schema),
  ZodOptional: d => ({ optional: serialize(d.innerType) }),
  ZodNullable: d => ({ nullable: serialize(d.innerType) }),
  ZodObject: d => ({ fields: Object.fromEntries(Object.entries(d.shape()).map(([key, value]) => [key, serialize(value)])) }),
  ZodArray: d => ({ array: serialize(d.type), ...(d.maxLength ? { max: d.maxLength.value } : {}) }),
  ZodRecord: d => ({ record: serialize(d.valueType), key: serialize(d.keyType) }),
  ZodUnion: d => ({ union: d.options.map(serialize) }),
  ZodEnum: d => ({ enum: d.values }),
  ZodLiteral: d => ({ literal: d.value }),
  ZodBoolean: () => ({ type: "boolean" }),
  ZodString: scalar,
  ZodNumber: scalar,
};
function scalar(definition) {
  return { type: definition.typeName === "ZodString" ? "string" : "number", checks: definition.checks.map(check => check.regex ? { kind: "regex", source: check.regex.source, flags: check.regex.flags } : check) };
}
function serialize(schema) {
  const rule = rules[schema._def.typeName];
  if (!rule) throw new Error(`Unsupported director shape: ${schema._def.typeName}`);
  return rule(schema._def);
}
const expected = JSON.parse(JSON.stringify(serialize(source.DirectorDocumentSchema)));
if (process.argv.includes("--write")) fs.writeFileSync(file, JSON.stringify(expected, null, 2) + "\n");
else assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), expected, "director static shape drift");
console.log("Director shape matches shared schema");

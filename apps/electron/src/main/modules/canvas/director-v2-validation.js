// 主进程手写检查共享字段清单，避免运行时加载 Zod 或渲染层。
// 字段清单是共享 schema 的静态产物，回归测试同时检查两端接受和拒绝的结果。
// 像按装箱单逐层开箱：外层不是对象时立即停止，不能继续读取子字段。
const { isDirectorJson } = require("./director-json");
const shape = require("./director-shape.json");
const { validDirectorReferences } = require("./director-references");
/** @typedef {{optional?: Rule, nullable?: Rule, fields?: Record<string, Rule>, array?: Rule, max?: number, record?: Rule, key?: Rule, union?: Rule[], enum?: unknown[], literal?: unknown, type?: string, checks?: {kind:string,value?:number,source?:string,flags?:string}[]}} Rule */
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function object(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @param {Rule} rule @returns {boolean} */
function matches(value, rule) {
  if (rule.optional) return value === undefined || matches(value, rule.optional);
  if (rule.nullable) return value === null || matches(value, rule.nullable);
  if (rule.union) return rule.union.some(item => matches(value, item));
  if (rule.enum) return rule.enum.includes(value);
  if ("literal" in rule) return value === rule.literal;
  if (rule.fields) return object(value) && Object.entries(rule.fields).every(([key, field]) => matches(value[key], field));
  if (rule.array) return Array.isArray(value) && value.length <= (rule.max ?? Infinity) && value.every(item => matches(item, /** @type {Rule} */ (rule.array)));
  if (rule.record) return object(value) && Object.entries(value).every(([key, item]) => matches(key, /** @type {Rule} */ (rule.key)) && matches(item, /** @type {Rule} */ (rule.record)));
  if (typeof value !== rule.type) return false;
  if (typeof value === "number" && !Number.isFinite(value)) return false;
  return (rule.checks ?? []).every(check => checkValue(value, check));
}
/** @param {unknown} value @param {{kind:string,value?:number,source?:string,flags?:string}} check */
function checkValue(value, check) {
  const size = typeof value === "string" ? value.length : value;
  if (check.kind === "min") return typeof size === "number" && size >= (check.value ?? -Infinity);
  if (check.kind === "max") return typeof size === "number" && size <= (check.value ?? Infinity);
  if (check.kind === "int") return Number.isInteger(value);
  if (check.kind === "finite") return typeof value === "number" && Number.isFinite(value);
  if (check.kind === "regex") return typeof value === "string" && new RegExp(check.source ?? "(?!)", check.flags).test(value);
  return false;
}
/** @param {unknown} value */
function scene(value) {
  return isDirectorJson(value) && matches(value, /** @type {Rule} */ (shape)) && validDirectorReferences(/** @type {import('@illusion-realm/shared').DirectorDocument} */ (value));
}
module.exports = { scene };

// 原组件会保存宿主尚未解释的字段，不能为了类型整齐把它们删掉。
// 保留字段不等于接受任意对象；这里检查纯 JSON、深度和总量。
// 像收行李时不拆掉里面的零件，但仍检查重量、危险品和箱子层数。
// 数量预算按整棵树累计，不能让许多小数组绕过单个数组的限额。
// 该检查只读输入；失败时保存器保留原工程，不尝试修补用户数据。
// 主进程有等价手写版本，由反例测试核对，运行时不加载 shared TS。
/** @param {unknown} value */
function isDirectorJson(value) {
  const budget = { remaining: 100000, characters: 0 };
  return visit(value, 0, budget);
}

// 预览可能附带 JPEG，因此正文上限大于普通参数文件。
// 允许 undefined 是为了兼容原组件构造的可选字段；落盘 JSON 会省略它。
// 禁止非有限数字，否则 JSON.stringify 会把 NaN 悄悄改成 null。
// 禁止原型键，避免未知扩展字段在后续对象合并时污染原型。
// 深度先检查，循环引用会在达到上限后退出，不会递归到栈溢出。
// Date、Blob、DOM、类实例都不能混入场景；下载事件另有 Blob 通道。
/** @param {unknown} value @param {number} depth @param {{remaining:number, characters:number}} budget @returns {boolean} */
function visit(value, depth, budget) {
  if (depth > 24 || --budget.remaining < 0) return false;
  if (value === null || value === undefined || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    budget.characters += value.length;
    return value.length <= 16000000 && budget.characters <= 24000000;
  }
  if (Array.isArray(value)) return value.length <= 10000 && value.every(item => visit(item, depth + 1, budget));
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.entries(value).every(([key, item]) =>
    !["__proto__", "prototype", "constructor"].includes(key) && key.length <= 200 && visit(item, depth + 1, budget),
  );
}

module.exports = { isDirectorJson };

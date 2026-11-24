/** 音频参数的标量和列表检查；坏对象直接返回 false，不靠异常阻止保存。 */
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function object(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @param {number} min @param {number} max @returns {value is string} */
function text(value, min, max) { return typeof value === "string" && value.length >= min && value.length <= max; }
/** @param {unknown} value @param {number} min @param {number} max @returns {value is number} */
function number(value, min, max) { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max; }

/** @param {unknown} value */
function overrides(value) {
  return value === undefined || object(value) && Object.keys(value).length <= 64
    && Object.entries(value).every(([id, name]) => text(id, 1, 200) && text(name, 0, 32767));
}

/** @param {unknown} value */
function loras(value) {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 128) return false;
  const ids = new Set();
  // 保留原加载顺序和显式空数组；身份重复会让权重编辑指向错误的行。
  return value.every(item => {
    if (!object(item)) return false;
    if (!text(item.id, 1, 200) || ids.has(item.id) || !text(item.name, 1, 32767) || !number(item.strength, -5, 5)) return false;
    ids.add(item.id);
    return true;
  });
}

module.exports = { object, text, number, overrides, loras };

/** 与共享 schema 对齐校验前缀；这里只检查工程数据，不修改提示词或引用。 */
const DEFAULTS = { image: 'Picture', video: 'Video', audio: 'Audio' };

/** @param {unknown} value */
function promptReferenceLabels(value) {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = /** @type {Record<string, unknown>} */ (value);
  if (Object.keys(row).some(key => !Object.hasOwn(DEFAULTS, key))) return false;
  const labels = Object.entries(DEFAULTS).map(([key, fallback]) => row[key] ?? fallback);
  if (Object.values(row).some(label => label !== undefined && (typeof label !== 'string' || /\s/.test(label) || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(label)))) return false;
  const keys = labels.map(label => String(label).toLowerCase());
  return new Set(keys).size === 3 && Object.keys(DEFAULTS).every((kind, index) =>
    !Object.entries(DEFAULTS).some(([other, reserved]) => kind !== other && keys[index] === reserved.toLowerCase())
    && (kind === 'audio' || keys[index] !== 'slot'));
}

module.exports = { promptReferenceLabels };

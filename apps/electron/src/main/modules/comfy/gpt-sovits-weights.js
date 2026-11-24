/** 读取加载节点的下拉选项，沿用插件登记的目录和去重顺序。 */
const { readComfyJson, comfyError } = require("./comfy-request");

/** @param {unknown} value @returns {Record<string, unknown> | undefined} */
function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value) : undefined;
}

/** @param {unknown} field @param {string} suffix */
function choices(field, suffix) {
  if (!Array.isArray(field)) return undefined;
  // V3 节点使用 COMBO options，旧节点把列表直接放在第一个位置。
  const values = Array.isArray(field[0]) ? field[0] : record(field[1])?.options;
  if (!Array.isArray(values)) return undefined;
  return [...new Set(values.filter(value => typeof value === "string" && value.length <= 2048
    && value.toLowerCase().endsWith(suffix) && !/[:\u0000-\u001f]/.test(value)
    && value.split(/[\\/]/).every(segment => segment && segment !== "." && segment !== "..")))];
}

/** @param {string} server @returns {Promise<import('@illusion-realm/shared').GptSovitsWeights>} */
async function listGptSovitsWeights(server) {
  const result = record(await readComfyJson(server, "/object_info/GSVAtomicLoadModel", { redirect: "error" }));
  const inputs = record(record(record(result?.GSVAtomicLoadModel)?.input)?.required);
  const gpt = choices(inputs?.gpt, ".ckpt");
  const sovits = choices(inputs?.sovits, ".pth");
  if (!gpt || !sovits) throw comfyError("COMFY_GSV_NODE_MISSING", "GPT-SoVITS loader unavailable");
  return { gpt, sovits };
}

module.exports = { listGptSovitsWeights };

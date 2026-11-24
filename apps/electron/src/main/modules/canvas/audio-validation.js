/** 校验音频节点的工程参数；与 shared 配对，不读取媒体或模型正文。 */
const { object, text, number, overrides, loras } = require("./audio-validation-fields");

/** @param {unknown} value */
function gptSovits(value) {
  if (value === undefined) return true;
  if (!object(value)) return false;
  // 工程只检查字段形状，插件支持哪些值由提交的工作流校验。
  return Object.entries(value).every(([key, field]) => {
    if (field === undefined) return ["textLanguage", "referenceLanguage", "transcript", "cut", "seed", "random", "gptWeight", "sovitsWeight", "speed", "interval"].includes(key);
    // 和共享工程 schema 保持同一范围，尤其保留 0 秒停顿。
    if (key === "speed") return number(field, 0.25, 4);
    if (key === "interval") return number(field, 0, 30);
    if (key === "gptWeight") return text(field, 1, 2048) && /\.ckpt$/i.test(field);
    if (key === "sovitsWeight") return text(field, 1, 2048) && /\.pth$/i.test(field);
    if (key === "random") return typeof field === "boolean";
    if (key === "seed") return text(field, 0, 32) && /^\d*$/.test(field);
    if (key === "transcript") return text(field, 0, 4000);
    if (key === "cut") return text(field, 1, 48);
    return ["textLanguage", "referenceLanguage"].includes(key) && text(field, 1, 24);
  });
}

/** @param {unknown} value @param {unknown} kind @param {(value: unknown) => boolean} validMedia */
function audioParameters(value, kind, validMedia) {
  if (value === undefined) return true;
  const fields = ["unetName", "steps", "durationSeconds", "seed", "random", "count", "loras", "modelOverrides", "reference", "engine", "gptSovits"];
  if (kind !== "audio" || !object(value) || Object.keys(value).some(key => !fields.includes(key))) return false;
  if (value.engine !== undefined && value.engine !== "minimax" && value.engine !== "gpt-sovits") return false;
  if (!gptSovits(value.gptSovits)) return false;
  if (value.unetName !== undefined && !text(value.unetName, 1, 32767)) return false;
  if (value.steps !== undefined && (!number(value.steps, 1, 100) || !Number.isInteger(value.steps))) return false;
  if (value.durationSeconds !== undefined && !number(value.durationSeconds, 0.1, 60)) return false;
  if (value.seed !== undefined && (!text(value.seed, 0, 32) || !/^\d*$/.test(value.seed))) return false;
  if (value.random !== undefined && typeof value.random !== "boolean") return false;
  if (value.count !== undefined && (typeof value.count !== "number" || ![1, 2, 4, 6].includes(value.count))) return false;
  if (!loras(value.loras)) return false;
  // 两种模板分别保存辅助模型；切换参考不会覆盖另一份已确认配置。
  if (value.modelOverrides !== undefined && (!object(value.modelOverrides) || !Object.entries(value.modelOverrides).every(([key, row]) => ["text", "reference"].includes(key) && overrides(row)))) return false;
  return value.reference === undefined || object(value.reference) && validMedia(value.reference) && value.reference.kind === "audio";
}

module.exports = { audioParameters };

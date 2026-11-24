/** 只在 ComfyUI 点名主 UNet 加载器时识别模型问题；不把服务端原文带到界面。 */

/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value) : {};
}

/** @param {object} prompt */
function primaryUnetId(prompt) {
  return Object.entries(prompt).find(([, node]) => node?.class_type === "UNETLoader" &&
    typeof node.inputs?.unet_name === "string")?.[0];
}

/** @param {object} prompt @param {unknown} nodeErrors */
function unetValidationCode(prompt, nodeErrors) {
  const id = primaryUnetId(prompt);
  if (!id) return;
  const { errors } = record(record(nodeErrors)[id]);
  if (!Array.isArray(errors)) return;
  // 像按工单编号核对出问题的零件，必须同时匹配请求里的节点和 unet_name 字段。
  for (const entry of errors) {
    const info = record(entry);
    if (info.type === "value_not_in_list" && record(info.extra_info).input_name === "unet_name") {
      return "COMFY_UNET_NOT_FOUND";
    }
  }
}

/** @param {object} prompt @param {unknown} messages */
function unetExecutionCode(prompt, messages) {
  const id = primaryUnetId(prompt);
  if (!id || !Array.isArray(messages)) return;
  for (const event of messages) {
    if (!Array.isArray(event) || event[0] !== "execution_error") continue;
    const error = record(event[1]);
    if (String(error.node_id) !== id || error.node_type !== "UNETLoader") continue;
    const message = typeof error.exception_message === "string" ? error.exception_message : "";
    // 显存、权限或设备异常也可出现在同一节点，只认明确的模型检测和文件格式错误。
    if (/could not detect model type|unsupported (?:diffusion )?model (?:type|format)|not a valid safetensors/i.test(message) ||
        (typeof error.exception_type === "string" && /(?:^|\.)SafetensorError$/.test(error.exception_type) &&
          /deserializing header|invalid header|incomplete metadata|invalid (?:offset|tensor)/i.test(message))) {
      return "COMFY_UNET_LOAD_FAILED";
    }
  }
}

module.exports = { unetValidationCode, unetExecutionCode };

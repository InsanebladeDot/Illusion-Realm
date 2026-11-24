// 两代场景仅在输入边界兼容；新导演台不会调用旧运行时。
const oldInput = require("./director-v1-validation");
const current = require("./director-v2-validation");
/** @param {unknown} value */
function scene(value) { return oldInput.scene(value) || current.scene(value); }
module.exports = { scene };

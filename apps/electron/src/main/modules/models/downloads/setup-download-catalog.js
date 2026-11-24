/** 安装项锁定版本、摘要和工作流相对路径；与渲染层共用随包 JSON。 */
const assets = require("@illusion-realm/shared/src/data/setup-downloads.json").files;

/** @param {unknown} id */
function setupAsset(id) { return assets.find(asset => asset.id === id); }

/** 已验证的来源文件可以使用工作流本地别名，身份仍由固定 SHA256 校验。 @param {string} id
 * @returns {import('@illusion-realm/shared').ModelDownloadRequest} */
function setupRequest(id) {
  const asset = setupAsset(id);
  if (!asset) throw new Error("invalid");
  return {
    setupId: /** @type {import('@illusion-realm/shared').SetupDownloadId} */ (id),
    modelType: "Checkpoint", baseModel: asset.baseModel, modelName: asset.modelName, fileName: asset.fileName,
    category: "", downloadUrl: asset.downloadUrl, sha256: asset.sha256, previewUrl: "",
  };
}

/** setupId 不能成为绕过下载校验的通行证，所有可写入字段必须符合内置清单。
 * @param {Record<string, unknown>} request */
function validSetupRequest(request) {
  const asset = setupAsset(request.setupId);
  if (!asset || request.source || request.logoDataUrl) return false;
  const expected = setupRequest(asset.id);
  return Object.entries(expected).every(([key, value]) => request[key] === value);
}

module.exports = { setupAsset, setupRequest, validSetupRequest };

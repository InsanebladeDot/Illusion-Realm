/** 保存逐文件来源快照：版本化 JSON 与模型同目录，过滤 URL 授权参数，原子提交且不覆盖旧文件。 */
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
/** 仅保留决定模型文件格式的公开参数，不记录 API Key、签名或临时 CDN 链接。 @param {string} value */
function publicDownloadUrl(value) {
  const url = new URL(value), query = new URLSearchParams();
  for (const key of ["type", "format", "size", "fp"]) {
    const option = url.searchParams.get(key);
    if (option) query.set(key, option);
  }
  url.search = query.toString(); url.hash = ""; url.username = ""; url.password = "";
  return url.href;
}
/** @param {import("@illusion-realm/shared").ModelDownloadRequest} request */
function downloadMetadata(request) {
  const downloadUrl = publicDownloadUrl(request.downloadUrl), origin = new URL(downloadUrl).origin;
  const source = request.source;
  return {
    version: 1, downloadedAt: new Date().toISOString(),
    source: "Civitai", sourceUrl: origin, sourceTitle: request.modelName,
    modelPageUrl: source ? `${origin}/models/${source.modelId}?modelVersionId=${source.versionId}` : "",
    downloadUrl, modelId: source?.modelId ?? null, modelName: request.modelName,
    modelType: request.modelType, baseModel: request.baseModel,
    versionId: source?.versionId ?? Number(new URL(downloadUrl).pathname.split("/").pop()), versionName: source?.versionName ?? "",
    creator: source?.creator ?? "", fileName: request.fileName, sha256: request.sha256,
    trainedWords: source?.trainedWords ?? [], description: source?.description ?? "", versionDescription: source?.versionDescription ?? "",
    cover: { type: request.logoDataUrl ? "custom" : request.previewUrl ? "preview" : "none", previewUrl: request.previewUrl ? new URL(request.previewUrl).origin + new URL(request.previewUrl).pathname : "" },
  };
}
/** 先写临时文件，再无覆盖链接到独立 sidecar；失败时可重试，不留下半截 JSON。
 * @param {string} modelPath @param {import("@illusion-realm/shared").ModelDownloadRequest} request */
async function saveDownloadMetadata(modelPath, request) {
  const target = modelPath + ".civitai.json";
  const temporary = path.join(path.dirname(modelPath), ".metadata-" + randomUUID() + ".part");
  try {
    await fs.promises.writeFile(temporary, JSON.stringify(downloadMetadata(request), null, 2) + "\n", { flag: "wx" });
    await fs.promises.link(temporary, target);
    return target;
  } finally { await fs.promises.rm(temporary, { force: true }); }
}
module.exports = { saveDownloadMetadata };

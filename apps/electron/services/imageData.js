/** 图片 → data URL（EXIF 工具箱 / 本地解析 / 预览共用） */
const fs = require("fs");
const path = require("path");

/**
 * 扩展名 → MIME。
 * 显式标注为 Record 而非字面量类型：否则 `IMAGE_MIME_TYPES[ext]` 这种动态字符串索引会报 TS7053。
 * @type {Record<string, string>}
 */
const IMAGE_MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
};

/**
 * 读取图片并编码为 data URL
 * @param {string | null | undefined} filePath 绝对路径
 * @returns {string | null} `data:<mime>;base64,...`；扩展名不受支持或读取失败时返回 null
 */
function readImageDataUrl(filePath) {
  if (!filePath || typeof filePath !== "string") return null;

  const ext = path.extname(filePath).toLowerCase();
  const mimeType = IMAGE_MIME_TYPES[ext];
  if (!mimeType) return null;

  try {
    const buffer = fs.readFileSync(filePath);
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

module.exports = { readImageDataUrl, IMAGE_MIME_TYPES };

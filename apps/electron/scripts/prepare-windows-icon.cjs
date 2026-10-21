/** Windows ICO 支持直接嵌入 PNG。给现有 256px 图标补 ICO 目录头，避开 WASM 转码和额外依赖。 */
const fs = require("node:fs/promises");
const path = require("node:path");
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function prepareWindowsIcon() {
  const root = path.resolve(__dirname, "..");
  const png = await fs.readFile(path.join(root, "icon.png"));
  if (png.length < 33 || !png.subarray(0, 8).equals(PNG_SIGNATURE) || png.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("Windows icon source must be a valid PNG.");
  }
  if (png.readUInt32BE(16) !== 256 || png.readUInt32BE(20) !== 256) {
    throw new Error("Windows icon source must be exactly 256x256 pixels. Resize icon.png before packaging.");
  }
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); // ICONDIR：图标类型。
  header.writeUInt16LE(1, 4); // 一张 256x256 的 PNG，Windows 负责其他显示尺寸。
  // ICONDIRENTRY：宽高的 0 均表示 256，颜色数和保留位也保持 0。
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  await fs.writeFile(path.join(root, "icon.ico"), Buffer.concat([header, png]));
  console.log("PASS prepared Windows ICO from the original 256x256 PNG (no image conversion required)");
}

module.exports = { prepareWindowsIcon };
if (require.main === module) {
  prepareWindowsIcon().catch(error => { console.error(error.message); process.exitCode = 1; });
}

/**
 * Prepare deterministic storyboard fixtures from an existing repository image.
 * Crop coordinates live in the manifest; this script writes PNGs and a contact sheet.
 */
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "../../..");
const sharp = require(path.join(
  workspaceRoot,
  "node_modules/.pnpm/sharp@0.34.5/node_modules/sharp"
));
const manifest = require("./asset-manifest.json");
const sourcePath = path.join(workspaceRoot, manifest.source);
const outputDir = path.join(__dirname, "assets");

function labelSvg(asset, index) {
  const letter = String.fromCharCode(65 + index);
  return Buffer.from(`<svg width="560" height="66" xmlns="http://www.w3.org/2000/svg">
    <rect width="560" height="66" fill="#ffffff"/>
    <text x="20" y="27" font-family="Microsoft YaHei, sans-serif" font-size="18" fill="#202124">${letter} · ${asset.title}</text>
    <text x="20" y="52" font-family="Microsoft YaHei, sans-serif" font-size="14" fill="#62686f">${asset.shot} · ${asset.role === "overlay" ? "上层覆盖素材" : "底层分镜素材"}</text>
  </svg>`);
}

async function prepareTile(asset, index) {
  const filePath = path.join(__dirname, asset.file);
  await sharp(sourcePath).extract(asset.crop).png().toFile(filePath);
  const preview = await sharp(filePath)
    .resize(520, 370, { fit: "contain", background: "#edf0f2" })
    .png().toBuffer();
  return sharp({ create: {
    width: 560, height: 450, channels: 4, background: "#edf0f2",
  } }).composite([
    { input: preview, left: 20, top: 10 },
    { input: labelSvg(asset, index), left: 0, top: 384 },
  ]).png().toBuffer();
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(sourcePath, path.join(outputDir, "source.webp"));
  const tiles = [];
  for (const [index, asset] of manifest.assets.entries()) {
    tiles.push(await prepareTile(asset, index));
    console.log(`${asset.id}: ${asset.crop.width} x ${asset.crop.height}`);
  }
  await sharp({ create: {
    width: 1168, height: 948, channels: 4, background: "#dce1e5",
  } }).composite(tiles.map((input, index) => ({
    input, left: 16 + (index % 2) * 576, top: 16 + Math.floor(index / 2) * 466,
  }))).png().toFile(path.join(outputDir, "contact-sheet.png"));
  console.log("Contact sheet ready.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Asset preparation failed");
  process.exitCode = 1;
});

/** Compress the user-provided login illustration to WebP without changing the source file. */
const fs = require("node:fs"), path = require("node:path");
const { createRequire } = require("node:module");
const requireNext = createRequire(fs.realpathSync(path.resolve(__dirname, "../apps/next/node_modules/next/package.json")));
const sharp = requireNext("sharp");
async function main() {
  const source = process.argv[2];
  if (!source) throw new Error("Provide the source illustration path");
  const target = path.resolve(__dirname, "../apps/next/public/images/login-background.webp");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await sharp(source).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82, effort: 6 }).toFile(target);
  console.log(JSON.stringify({ originalBytes: fs.statSync(source).size, webpBytes: fs.statSync(target).size, ...await sharp(target).metadata() }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

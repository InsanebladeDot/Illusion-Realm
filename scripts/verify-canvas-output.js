/** 真实磁盘反证：本工程图片/视频/音频复用一份，外部与其他工程继续复制且不破坏来源。 */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { importAssets, DIRECTORIES } = require("../apps/electron/src/main/modules/canvas/project-assets");

async function checkMedia(root, kind, extension) {
  const source = path.join(root, `external.${extension}`);
  await fs.writeFile(source, "fixture bytes: not a decoded media test");
  const file = { kind, path: source, name: path.basename(source), size: 0 };
  const first = await importAssets(root, { name: kind, files: [file] });
  const directory = first.outputDirectories[kind];
  assert.equal(path.basename(directory), DIRECTORIES[kind]);
  assert.notEqual(first.media[0].path, source);
  // 连续登记同一文件不复制、不改名；外部原件仍在，剪贴板引用不会失效。
  const before = await fs.readdir(directory);
  const again = await importAssets(root, { name: kind, workspace: first.workspace, files: [first.media[0]] });
  assert.equal(again.media[0].path, first.media[0].path);
  assert.deepEqual(await fs.readdir(directory), before);
  assert.equal(await fs.readFile(source, "utf8"), "fixture bytes: not a decoded media test");
  const other = await importAssets(root, { name: `${kind}-other`, files: [first.media[0]] });
  assert.notEqual(other.media[0].path, first.media[0].path);
  assert.equal(await fs.readFile(first.media[0].path, "utf8"), await fs.readFile(other.media[0].path, "utf8"));
  return first;
}

async function checkDirectories(root) {
  assert.equal(require("../apps/electron/src/main/modules/canvas/project-validation").importRequest({ name: "empty", files: [] }), true);
  const first = await importAssets(root, { name: "empty", files: [] });
  for (const directory of Object.values(first.outputDirectories)) assert.ok((await fs.stat(directory)).isDirectory());
  const target = first.outputDirectories.video;
  await fs.rmdir(target);
  // 用目录链接模拟资源目录被替换；必须拒绝，不能把生成结果写到外部。
  const outside = path.join(root, "outside");
  await fs.mkdir(outside);
  await fs.symlink(outside, target, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(importAssets(root, { name: "empty", workspace: first.workspace, files: [] }), /canvas-invalid-directory/);
  assert.deepEqual(await fs.readdir(outside), []);
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ir-canvas-output-"));
  for (const [kind, extension] of [["image", "png"], ["video", "mp4"], ["audio", "wav"]]) await checkMedia(root, kind, extension);
  await checkDirectories(root);
  console.log("CANVAS_OUTPUT_OK: image/video/audio, own-file reuse, cross-project copy, output paths, symlink rejection", root);
}
main().catch(error => { console.error(error); process.exitCode = 1; });

/** Native filesystem regression: moving complete model folders, preserving series, refusing cross-root/links/overwrites. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, shell } = require("electron");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-category-test-"));
const models = path.join(root, "models");
let paths = { searchPath: models, lorasPath: "", checkpointPath: "", diffusionModelsPath: "" };
require("../apps/electron/userData").readUserData = () => ({ data: { settings: { paths } } });
const { categoryTarget, moveCategory, operateModels } = require("../apps/electron/services/model-category-manager");
const { validateCategoryMove, validateModelBatch } = require("../apps/electron/services/model-download-validation");
const { scanModelsInDirectory } = require("../apps/electron/modelScanner");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "model-categories", timeoutMs: 30000 });
smoke.installWatchdog(app);
function fixture(relative) {
  const folder = path.join(models, relative); fs.mkdirSync(folder, { recursive: true });
  for (const [name, content] of [["v1.safetensors", "first version"], ["v2.safetensors", "second version"], ["logo.png", "cover"], ["notes.json", '{"name":"model"}']]) fs.writeFileSync(path.join(folder, name), content);
  return folder;
}
function request(folderPath, category, targetRootPath = path.join(models, "loras")) { return { folderPath, targetRootPath, category }; }
function movement() {
  const source = fixture("loras/Anima/Uncategorized/Example");
  fs.mkdirSync(path.join(models, "checkpoints"), { recursive: true });
  const info = categoryTarget(source);
  assert.equal(info.rootPath, path.join(models, "loras"));
  assert.equal(info.categoryRootPath, path.join(models, "loras", "Anima"));
  assert.deepEqual(info.roots.map((item) => item.name).sort(), ["checkpoints", "loras"]);
  const moved = moveCategory(request(source, "风格"));
  assert.equal(moved, path.join(models, "loras", "Anima", "风格", "Example"));
  assert.equal(fs.existsSync(source), false);
  assert.deepEqual(fs.readdirSync(moved).sort(), ["logo.png", "notes.json", "v1.safetensors", "v2.safetensors"]);
  assert.equal(fs.readFileSync(path.join(moved, "v1.safetensors"), "utf8"), "first version");
  assert.equal(fs.readFileSync(path.join(moved, "logo.png"), "utf8"), "cover");
  assert.equal(scanModelsInDirectory(info.rootPath, "lora")[0].filePath, moved);
  assert.equal(categoryTarget(moved).currentCategory, "风格");
  assert.equal(moveCategory(request(moved, "风格")), moved);
  assert.equal(moveCategory(request(moved, "")), source);
  console.log("PASS whole-folder rename, versions/cover/metadata intact, series preserved, rescan and Uncategorized");
  return source;
}
function refusals(source) {
  assert.throws(() => moveCategory(request(source, "Styles", path.join(models, "checkpoints"))), /^Error: crossRoot$/);
  assert.equal(fs.existsSync(source), true);
  assert.equal(fs.existsSync(path.join(models, "checkpoints", "Styles")), false);
  const conflict = fixture("loras/Anima/Existing/Example");
  fs.writeFileSync(path.join(conflict, "v1.safetensors"), "existing contents");
  assert.throws(() => moveCategory(request(source, "Existing")), /^Error: exists$/);
  assert.equal(fs.readFileSync(path.join(conflict, "v1.safetensors"), "utf8"), "existing contents");
  for (const category of ["../escape", "CON", "bad/name", "name."]) assert.throws(() => moveCategory(request(source, category)), /invalid/);
  const partial = path.join(source, ".download-test.part"); fs.writeFileSync(partial, "partial");
  assert.throws(() => moveCategory(request(source, "Styles")), /busy/); fs.unlinkSync(partial);
  fixture("loras/Legacy"); assert.throws(() => categoryTarget(path.join(models, "loras", "Legacy")), /layout/);
  fixture("loras/Anima/Uncategorized/Extra");
  assert.throws(() => categoryTarget(path.join(models, "loras", "Anima")), /invalid/);
  assert.equal(fs.existsSync(source), true);
  console.log("PASS cross-root refused, conflicts retained, invalid paths rejected, partial/legacy folders protected");
}
function links(source) {
  const outside = path.join(root, "outside"); fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(models, "loras", "Anima", "Linked"), "junction");
  assert.throws(() => moveCategory(request(source, "Linked")), /invalid/);
  const badSource = path.join(models, "loras", "Anima", "Uncategorized", "LinkedModel");
  fs.symlinkSync(source, badSource, "junction");
  assert.throws(() => categoryTarget(badSource), /invalid/);
  assert.equal(fs.readdirSync(outside).length, 0);
  console.log("PASS source/destination junctions cannot redirect a move outside configured roots");
}
function explicitRoots() {
  paths = { searchPath: "", lorasPath: path.join(models, "loras"), checkpointPath: path.join(models, "checkpoints"), diffusionModelsPath: "" };
  const folder = fixture("loras/Portrait/Local");
  assert.equal(categoryTarget(folder).rootPath, paths.lorasPath);
  const moved = moveCategory(request(folder, "Custom")); assert.equal(path.dirname(moved), path.join(paths.lorasPath, "Custom"));
  paths.checkpointPath = path.join(paths.lorasPath, "OtherMajor"); fs.mkdirSync(paths.checkpointPath);
  assert.throws(() => moveCategory(request(moved, "OtherMajor")), /crossRoot/);
  const valid = request(moved, "Styles"); assert.equal(validateCategoryMove([valid]), null);
  for (const args of [[], [valid, valid], [{ ...valid, category: "../escape" }], [{ ...valid, folderPath: 42 }], [{ ...valid, extra: true }]]) assert.equal(validateCategoryMove(args), "invalid");
  console.log("PASS explicit model roots, overlapping-root boundary and strict IPC validation");
}
async function batchChecks() {
  const rootPath = path.join(models, "loras");
  const sources = [fixture("loras/One/Batch A"), fixture("loras/Two/Batch B")];
  const request = { action: "move", folderPaths: sources, targetRootPath: rootPath, category: "Batch", acknowledged: true };
  assert.equal(validateModelBatch([request]), null);
  for (const value of [{ ...request, acknowledged: false }, { ...request, extra: true }, { ...request, folderPaths: [] }, { ...request, folderPaths: [42] }, { ...request, category: "../escape" }, { ...request, folderPaths: Array(201).fill(sources[0]) }]) assert.equal(validateModelBatch([value]), "invalid");
  await assert.rejects(operateModels({ ...request, acknowledged: false }), /invalid/);
  await assert.rejects(operateModels({ ...request, targetRootPath: path.join(models, "checkpoints") }), /crossRoot/);
  const collision = fixture("loras/Batch/Batch B");
  await assert.rejects(operateModels(request), /exists/);
  assert.ok(sources.every(fs.existsSync));
  fs.renameSync(collision, path.join(models, "loras", "Batch", "Other"));
  const result = await operateModels(request);
  assert.ok(result.items.every((item) => item.success));
  assert.ok(sources.every((folder) => !fs.existsSync(folder)));
  result.items.forEach((item) => assert.equal(fs.readFileSync(path.join(item.destinationPath, "logo.png"), "utf8"), "cover"));
  const sameNames = [fixture("loras/One/Same"), fixture("loras/Two/Same")];
  await assert.rejects(operateModels({ ...request, folderPaths: sameNames }), /exists/);
  assert.ok(sameNames.every(fs.existsSync));
  await deleteChecks(result.items.map((item) => item.destinationPath));
  console.log("PASS batch acknowledgement/strict validation, cross-root and collision preflight, whole-folder move and batch deletion");
}
async function deleteChecks(folders) {
  const originalTrash = shell.trashItem;
  const trashed = [];
  shell.trashItem = async (folder) => {
    trashed.push(folder);
    assert.throws(() => moveCategory(request(folder, "Busy")), /busy/);
    if (folder === folders[1]) throw new Error("fixture-locked");
    fs.renameSync(folder, path.join(root, "trashed-model"));
  };
  try {
    const args = { action: "delete", folderPaths: folders, acknowledged: true };
    assert.equal(validateModelBatch([args]), null);
    assert.equal(validateModelBatch([{ ...args, category: "extra" }]), "invalid");
    await assert.rejects(operateModels({ ...args, folderPaths: [path.join(models, "loras")] }), /invalid|layout/);
    assert.equal(trashed.length, 0);
    const result = await operateModels(args);
    assert.deepEqual(trashed, folders);
    assert.deepEqual(result.items.map((item) => item.success), [true, false]);
    assert.equal(result.items[1].error, "io");
    assert.equal(fs.existsSync(folders[0]), false);
    assert.equal(fs.existsSync(folders[1]), true);
    assert.ok(fs.existsSync(moveCategory(request(folders[1], "AfterFailure"))));
  } finally { shell.trashItem = originalTrash; }
}
app.whenReady().then(async () => {
  try { const source = movement(); refusals(source); links(source); explicitRoots(); await batchChecks(); app.exit(0); }
  catch (error) { console.error(error); app.exit(1); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}).catch((error) => { console.error(error); app.exit(1); });

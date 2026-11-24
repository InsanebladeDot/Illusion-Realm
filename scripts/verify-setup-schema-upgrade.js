/** 用旧版真实数据库验证升级：保留Anima旧行，再允许新分组登记；不接触用户下载库。 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { app } = require("electron");
const {
  openConnection,
  APPLICATION_ID,
} = require("../apps/electron/src/main/storage/sqlite/connection");
const smoke = require("./lib/smoke-harness").createSmokeHarness({
  name: "setup-schema-upgrade",
});
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-setup-upgrade-"));
smoke.setWorkDir(root);
smoke.installWatchdog(app);

const LEGACY_MIGRATIONS = [
  "schema.sql",
  "migration-002.sql",
  "migration-003.sql",
  "migration-004.sql",
  "migration-005.sql",
];
function createLegacy(file) {
  const db = new DatabaseSync(file);
  const directory = path.resolve("apps/electron/src/main/storage/sqlite");
  for (const [index, name] of LEGACY_MIGRATIONS.entries()) {
    const sql = fs
      .readFileSync(path.join(directory, name), "utf8")
      .replace(/\r\n/g, "\n");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migration VALUES(?,?,?)").run(
      index + 1,
      createHash("sha256").update(sql).digest("hex"),
      1,
    );
  }
  db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=5`);
  db.exec(
    "INSERT INTO folder(folder_id,folder_path) VALUES('folder','C:/fixture/models')",
  );
  db.exec(
    "INSERT INTO download_job(download_id,target_folder_id,requested_file_name,source_label,status,created_at) VALUES('old','folder','anima.safetensors','public','cancelled',1)",
  );
  db.exec("INSERT INTO download_setup_asset VALUES('old','anima-model',1)");
  db.close();
}

async function main() {
  await app.whenReady();
  const file = path.join(root, "queue.sqlite");
  createLegacy(file);
  const db = openConnection(file);
  try {
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 6);
    assert.deepEqual(
      { ...db.prepare("SELECT * FROM download_setup_asset").get() },
      { download_id: "old", asset_id: "anima-model", queued: 1 },
    );
    db.exec(
      "UPDATE download_setup_asset SET asset_id='minimax-model' WHERE download_id='old'",
    );
    assert.throws(() =>
      db.exec("UPDATE download_setup_asset SET asset_id='../invalid'"),
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    smoke.check(
      "v5→v6保留旧行和等待状态，新分组可写、非法编号拒绝、外键完整",
      true,
    );
  } finally {
    db.close();
  }
  smoke.finish({ app, ok: true });
}
main().catch((error) => {
  console.error(error);
  smoke.finish({ app, ok: false });
});

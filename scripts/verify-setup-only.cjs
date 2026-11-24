/** 用隔离小文件检查复用门槛；真正的 EXE 封装另外执行 pnpm build:setup 验证。 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { sha256, readReusableManifest } = require('../apps/electron/scripts/build-installer.cjs');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ir-setup-only-'));
  const engine = path.join(root, 'engine.exe'), file = path.join(root, 'manifest.json');
  await assert.rejects(readReusableManifest(engine, file, '1.0.0'), /pnpm build once/);
  await fs.writeFile(engine, 'fixture engine');
  const manifest = { version: '1.0.0', engineSha256: await sha256(engine), registryKey: 'e7d6ff20-cd40-4117-82f1-8aa8b5f19a28', installedBytes: 512 };
  await fs.writeFile(file, JSON.stringify(manifest));
  assert.deepEqual(await readReusableManifest(engine, file, '1.0.0'), manifest);
  await assert.rejects(readReusableManifest(engine, file, '2.0.0'), /pnpm build once/);
  for (const patch of [{ installedBytes: 0 }, { installedBytes: 1.5 }, { registryKey: '' }, { engineSha256: '0'.repeat(64) }]) {
    await fs.writeFile(file, JSON.stringify({ ...manifest, ...patch }));
    await assert.rejects(readReusableManifest(engine, file, '1.0.0'), /pnpm build once/);
  }
  // 清单没变而引擎被换过，也必须拒绝；仅同名、同版本不算可以复用。
  await fs.writeFile(file, JSON.stringify(manifest));
  await fs.writeFile(engine, 'changed engine');
  await assert.rejects(readReusableManifest(engine, file, '1.0.0'), /pnpm build once/);
  console.log('PASS Setup-only prerequisites: valid pair, missing, version, capacity, identity and changed bytes');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

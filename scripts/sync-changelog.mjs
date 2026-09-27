import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// 本脚本位于工作区根 scripts/：logs.md 在工作区根，产物写入 apps/next/public/
const workspaceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(workspaceRoot, "logs.md");
const target = path.join(workspaceRoot, "apps", "next", "public", "changelog.md");

if (!fs.existsSync(source)) {
  console.error("[sync-changelog] logs.md not found:", source);
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
console.log("[sync-changelog] copied logs.md -> apps/next/public/changelog.md");

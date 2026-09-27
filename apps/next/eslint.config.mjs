import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Electron 主进程 / preload / 脚本必须是 CommonJS（require + module.exports），
    // 与 Next 的 ESM/TS 规则天然冲突；其正确性由 scripts/verify-electron-modules.js 等脚本覆盖
    "../electron/**",
    "scripts/**",
    // 共享包独立于渲染进程，不套用 Next 的规则集
    "../../packages/**",
  ]),
]);

export default eslintConfig;

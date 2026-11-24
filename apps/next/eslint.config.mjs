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
    "public/vendor/**",
    // 用户提供的原编译导演台原件不按 React 源码重新格式化或改写。
    "public/director/original/**",
    // 原 Vue 编译资源原样分发；自有宿主 embed.js 仍参与检查。
    "public/embedded-tools/video-composition/original/**",
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

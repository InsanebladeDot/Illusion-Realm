import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Electron 桌面应用：始终静态导出，不依赖 Next 服务端
  output: "export",
  images: {
    unoptimized: true,
  },
  // monorepo：允许从 apps/next 之外解析依赖
  experimental: {
    externalDir: true,
  },
  // packages/shared 以 TS 源码形式被消费，需要交给 Next 转译
  transpilePackages: ["@illusion-realm/shared"],
};

export default nextConfig;

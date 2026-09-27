/**
 * 跨进程共享的基础类型。
 *
 * 这里刻意不引入 next/image 等渲染进程框架的类型：
 * - packages/shared 必须能在 Electron 主进程（纯 Node 环境）里安全引用；
 * - 结构上与 next/image 的 StaticImageData 兼容，渲染进程传入静态图片导入结果无需转换。
 */

import type { ComponentType } from "react";

/** 静态图片导入结果（与 next/image 的 StaticImageData 结构兼容） */
export interface ImageAsset {
  src: string;
  width: number;
  height: number;
  blurDataURL?: string;
  blurWidth?: number;
  blurHeight?: number;
}

/** 图标组件的 props（lucide-react 图标的子集） */
export interface IconComponentProps {
  size?: number | string;
  className?: string;
  strokeWidth?: number | string;
  color?: string;
}

/**
 * 图标组件类型。
 * 只依赖 react 的类型（type-only import，不产生运行时代码），
 * 因此 Electron 主进程侧引用本文件也不会把 React 带进打包产物。
 */
export type IconComponent = ComponentType<IconComponentProps>;

"use client";

/**
 * 资料库共用左侧容器，角色字母分类与静态库分类都填入同一父级。
 * 只统一宽度、主题与边界，不接管库自身的查询或折叠状态。
 * 外层不滚动，固定入口和内部分类列表由子内容分配高度。
 * 窄窗口保持原modal替换布局，不额外创建覆盖式导航。
 */
import type { ReactNode } from "react";

/**
 * prefix仅保留既有定位入口，不能用于推断业务逻辑。
 * children来自实际业务组件，不复制其节点或监听器。
 * data-library-sidebar支持所有库统一的主题回归。
 * 共享md:w-56确保角色与动作、背景的主区起点相同。
 * 背景和边框均从主题读取，不再随库分别声明白色。
 * 高度约束与LibraryResults一致，分页不会被侧栏内容推出视野。
 */
/**
 * 共享父级不会修改孩子的key，折叠状态由原组件继续持有。
 * 分类可组合但不通过绝对定位覆盖网格，主区宽度由flex正常计算。
 */
export function LibrarySidebar({ prefix, children }: { prefix: string; children: ReactNode }) {
  return <aside data-library-sidebar {...{ [`data-${prefix}-sidebar`]: true }} className="flex h-full w-full shrink-0 flex-col overflow-hidden border-b border-border bg-background md:w-56 md:border-b-0 md:border-r">{children}</aside>;
}

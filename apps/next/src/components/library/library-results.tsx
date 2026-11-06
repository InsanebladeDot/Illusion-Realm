"use client";

/**
 * 资料库共用内部布局：主区滚动与底部分页只维护一份。
 * 原角色和静态库的数据钩子由prefix保留，筛选逻辑仍归业务父级。
 * sidebar与footer留在ResourceDialogShell，避免这里再叠一层浮动面板。
 * 背景和分割线跟随主题，与角色库使用完全相同的层级。
 */
import type { ReactNode, RefObject } from "react";

/**
 * children可包含网格、空状态或加载态，不限定源数据格式。
 * pagination未提供时不保留空白栏，完整高度交还给卡片区。
 * scrollRef供既有切页/筛选回调回到顶部，不在组件内部复制页码。
 * prefix保持character/pose/background等现有自动化定位入口。
 * 不绑定视口事件，宽窄布局仍由同一个弹窗父组件决定。
 * sidebar的滚动与这里互不影响，分页不随网格滚出视野。
 * 只有卡片内容滚动，避免整个modal产生第二根纵向滚动条。
 * 调用者无需重新写一份main背景和padding来适配新资料库。
 */
interface LibraryResultsProps { prefix: string; scrollRef?: RefObject<HTMLDivElement | null>; children: ReactNode; pagination?: ReactNode }

/**
 * 主区占满sidebar之外的剩余宽度，min-w-0防止长名称挤宽modal。
 * min-h-0允许flex子级收缩，使分页始终留在实际可见区域。
 * 所有库统一p-4卡片留白与px-4/py-3分页留白。
 * 主题切换不需要重新挂载网格，因此多选和滚动位置不会被清除。
 * JSX只生成结构，不克隆孩子或改写其事件回调。
 * data-library-results提供跨库的统一回归入口。
 * 既有data-character-pagination-bar等属性同时保留。
 * 无副作用和网络调用，业务请求异常由传入内容展示。
 */
export function LibraryResults({ prefix, scrollRef, children, pagination }: LibraryResultsProps) {
  return <section data-library-results {...{ [`data-${prefix}-main`]: true }} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-muted">
    {/* 界面：卡片展示区，各资料库使用相同滚动与内边距。 */}
    <div ref={scrollRef} {...{ [`data-${prefix}-scroll-area`]: true }} className="min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-width:thin]">{children}</div>
    {/* 界面：分页固定在主区下方，不加入侧栏或modal外部。 */}
    {pagination && <div {...{ [`data-${prefix}-pagination-bar`]: true }} className="shrink-0 border-t border-border bg-muted px-4 py-3">{pagination}</div>}
  </section>;
}

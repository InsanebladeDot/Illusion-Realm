/** 标题栏共用内容槽：控制分隔和收缩；路由、目录与说明由调用方注入。 */
import type { ReactNode } from "react";

export function WindowTitlebarContent({ children, marker }: { children: ReactNode; marker: string }) {
  return <div data-window-titlebar-content={marker} className="flex min-w-0 items-center border-l border-border pl-2 text-xs">{children}</div>;
}

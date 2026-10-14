import { ToolBoxHead } from './head/ToolBoxhead';

export function ToolBoxPage({ children }: { children: React.ReactNode }) {
  return (
    // 1. 外层容器：使用 flex 纵向布局，并设置高度（根据外层 AppShell 调整）
    <div className="mx-auto flex h-full min-h-0 w-full flex-col p-4 text-foreground sm:p-6 lg:p-8">
      
      {/* 2. 头部区域：flex-shrink-0 确保它不会被压缩，始终完整显示 */}
      <div className="flex-shrink-0 mb-8">
        <ToolBoxHead />
      </div>
      
      {/* 3. 子路由内容区域：flex-1 占据剩余所有空间，overflow-y-auto 开启垂直滚动 */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {children}
      </div>
      
    </div>
  );
}

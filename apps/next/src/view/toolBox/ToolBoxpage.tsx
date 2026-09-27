import { ToolBoxHead } from './head/ToolBoxhead';

export function ToolBoxPage({ children }: { children: React.ReactNode }) {
  return (
    // 1. 外层容器：使用 flex 纵向布局，并设置高度（根据外层 AppShell 调整）
    <div className="h-[calc(100vh-1rem)] max-w-7xl mx-auto flex flex-col p-8">
      
      {/* 2. 头部区域：flex-shrink-0 确保它不会被压缩，始终完整显示 */}
      <div className="flex-shrink-0 mb-8">
        <ToolBoxHead />
      </div>
      
      {/* 3. 子路由内容区域：flex-1 占据剩余所有空间，overflow-y-auto 开启垂直滚动 */}
      <div className="flex-1 overflow-y-auto pr-2">
        {children}
      </div>
      
    </div>
  );
}
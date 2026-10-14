import type { ReactNode } from "react";

interface ModelLibraryHeaderProps {
  title: string;
  description: string;
  switcher: ReactNode;
  actions: ReactNode;
}

export function ModelLibraryHeader({ title, description, switcher, actions }: ModelLibraryHeaderProps) {
  return <header data-model-library-header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
    {/* 界面：模型库标题与在线 / 本地切换同一行 */}
    <div className="min-w-0 max-w-full">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="shrink-0 text-xl font-semibold">{title}</h2>
        {switcher}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
    {/* 界面：API 来源或本地扫描操作，空间不足时换行 */}
    <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>
  </header>;
}

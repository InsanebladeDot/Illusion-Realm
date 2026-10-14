import { AppShell } from "@/components/AppShell";
import "@/view/toolBox/tool-theme.css";

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell fillViewport><div data-tools className="h-full min-h-0 min-w-0">{children}</div></AppShell>;
}

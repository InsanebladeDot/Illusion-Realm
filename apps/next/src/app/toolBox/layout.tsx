import { AppShell } from "@/components/AppShell";
import { ToolBoxPage } from "@/view/toolBox/ToolBoxpage";

export default function ToolBoxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
     <AppShell fillViewport>
      <ToolBoxPage>{children}</ToolBoxPage>
    </AppShell>
  );
}


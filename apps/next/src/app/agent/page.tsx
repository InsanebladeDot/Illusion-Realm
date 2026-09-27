import { AppShell } from "@/components/AppShell";
import { AgentPage } from "@/view/agent/AgentPage";

export default function Page() {
  return (
    <AppShell fillViewport>
      <AgentPage />
    </AppShell>
  );
}

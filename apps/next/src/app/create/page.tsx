import { AppShell } from "@/components/AppShell";
import { CreatePage } from "@/view/CreatePage";

export default function Page() {
  return (
    <AppShell fillViewport>
      <CreatePage />
    </AppShell>
  );
}

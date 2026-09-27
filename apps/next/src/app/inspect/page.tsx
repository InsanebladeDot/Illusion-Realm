import { AppShell } from "@/components/AppShell";
import { LocalImageInspectPage } from "@/view/inspect/LocalImageInspectPage";

export default function Page() {
  return (
    <AppShell fillViewport>
      <LocalImageInspectPage />
    </AppShell>
  );
}

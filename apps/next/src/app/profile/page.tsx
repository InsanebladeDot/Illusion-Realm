import { AppShell } from "@/components/AppShell";
import { ProfilePage } from "@/view/ProfilePage";

export default function Page() {
  return (
    <AppShell fillViewport>
      <ProfilePage />
    </AppShell>
  );
}

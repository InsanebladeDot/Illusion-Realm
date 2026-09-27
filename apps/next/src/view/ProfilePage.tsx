"use client";

import { useState } from "react";
import { EditProfileDialog } from "@/view/profile/EditProfileDialog";
import { ProfileHeader } from "@/view/profile/ProfileHeader";
import { ProfileTabs } from "@/view/profile/ProfileTabs";

export function ProfilePage() {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-background">
      <ProfileHeader onEdit={() => setEditOpen(true)} />
      <ProfileTabs />
      <EditProfileDialog open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}

"use client";

import { useState } from "react";
import { EditProfileDialog } from "@/view/profile/EditProfileDialog";
import { ProfileHeader } from "@/view/profile/ProfileHeader";
import { ProfileTabs } from "@/view/profile/ProfileTabs";
import { GuestSessionStatus } from "@/view/auth/guest-session-status";

export function ProfilePage() {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {/* 界面：封面、资料与身份入口固定，滚动只发生在标签下方。 */}
      <div data-profile-fixed-header className="shrink-0">
        <ProfileHeader onEdit={() => setEditOpen(true)} />
        {/* 界面：游客身份与退出入口 */}
        <GuestSessionStatus />
      </div>
      <ProfileTabs />
      <EditProfileDialog open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}

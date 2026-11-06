"use client";

import { useState } from "react";
import { EditProfileDialog } from "@/view/profile/EditProfileDialog";
import { ProfileHeader } from "@/view/profile/ProfileHeader";
import { ProfileTabs } from "@/view/profile/ProfileTabs";
import { GuestSessionStatus } from "@/view/auth/guest-session-status";
import { useTranslation } from "@/i18n";
import "./profile/profile-replica.css";

/**
 * 个人中心仍使用唯一 /profile 路由；参考模板的两个功能由内部标签切换。
 * sample 是当前页面状态，不进入 Zustand 持久化，也不改变账户权限。
 * 页尾保留游客退出入口，编辑弹窗继续调用真实资料存储。
 */
/**
 * 个人中心仍使用唯一 /profile 路由；参考模板的两个功能由内部标签切换。
 * sample 是当前页面状态，不进入 Zustand 持久化，也不改变账户权限。
 * 页尾保留游客退出入口，编辑弹窗继续调用真实资料存储。
 */
export function ProfilePage() {
  const [editOpen, setEditOpen] = useState(false);
  // 打开个人中心默认显示自己的本地资料和统计，避免把样例数字当作产出。
  // 样例仍可手动查看，切换只作用于当前页面，不写入用户数据。
  // 统计账本不依赖这个开关，查看样例期间完成的真实任务仍会正常记账。
  const [sample, setSample] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="profile-replica" data-profile-scroll data-profile-mode={sample ? "sample" : "actual"}>
      {/* 界面：样例与实际内容显式切换，演示状态不写入用户数据。 */}
      <div className="pr-mode"><div className="pr-mode-switch"><button type="button" data-profile-sample aria-pressed={sample} onClick={() => setSample(true)}>{t("profile.ui.sample")}</button><button type="button" data-profile-actual aria-pressed={!sample} onClick={() => setSample(false)}>{t("profile.ui.actual")}</button></div><p>{t(sample ? "profile.ui.sampleHint" : "profile.ui.actualHint")}</p></div>
      {/* 历史测试钩子保留名称；横幅现在按模板随个人中心整体滚动。 */}
      {/* 历史测试钩子保留名称；横幅现在按模板随个人中心整体滚动。 */}
      <div data-profile-fixed-header>
        <ProfileHeader onEdit={() => setEditOpen(true)} sample={sample} />
      </div>
      <ProfileTabs sample={sample} />
      {/* 界面：保留当前身份和主动退出功能，移至页尾避免挤占横幅。 */}
      <div className="pr-session"><GuestSessionStatus /></div>
      <EditProfileDialog open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}

/** 前端只保存账户资料；访问与刷新令牌由 Electron 主进程持有。 */
export interface AccountProfile {
  id: string;
  email: string;
  displayName: string;
  bio: string | null;
  role: "user" | "maintainer" | "admin";
  maintainedLibraries: string[];
  status: "active" | "disabled";
  revision: string;
  emailVerifiedAt: string | null;
  createdAt: string;
}

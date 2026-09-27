import type { ProfileSocialPlatform, ProfileTabId, UserProfile } from "../types/profile";

export const DEFAULT_USERNAME = "guest";

export const DEFAULT_PROFILE: UserProfile = {
  username: DEFAULT_USERNAME,
  bio: "",
  avatarDataUrl: null,
  socialLinks: [],
  stats: {
    posts: 0,
    followers: 0,
    following: 0,
  },
};

export const PROFILE_BIO_MAX_LENGTH = 500;

export const PROFILE_AVATAR_MAX_BYTES = 10 * 1024 * 1024;

export const PROFILE_SOCIAL_PLATFORM_LABELS: Record<
  ProfileSocialPlatform,
  string
> = {
  discord: "Discord",
  x: "X",
  reddit: "Reddit",
  github: "GitHub",
  website: "个人网站",
};

export const PROFILE_TABS: Array<{
  id: ProfileTabId;
  label: string;
  privateOnly?: boolean;
}> = [
  { id: "posts", label: "帖子" },
  { id: "likes", label: "喜欢" },
  { id: "comments", label: "评论" },
  { id: "received", label: "收到的评论", privateOnly: true },
  { id: "private", label: "私密统计", privateOnly: true },
];

export type ProfileSocialPlatform =
  | "discord"
  | "x"
  | "reddit"
  | "github"
  | "website";

export type ProfileSocialLink = {
  id: string;
  platform: ProfileSocialPlatform;
  url: string;
};

export type ProfileStats = {
  posts: number;
  followers: number;
  following: number;
};

export type ProfileTabId =
  | "posts"
  | "likes"
  | "comments"
  | "received"
  | "private";

export type UserProfile = {
  username: string;
  bio: string;
  avatarDataUrl: string | null;
  socialLinks: ProfileSocialLink[];
  stats: ProfileStats;
};

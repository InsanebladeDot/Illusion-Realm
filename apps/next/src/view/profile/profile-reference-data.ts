/** 个人中心的显式界面样例：仅内存展示，不写入资料、云端记录或生成历史。 */
import banner from "@/assets/profile/banner.webp";
import avatar from "@/assets/profile/avatar.webp";
import first from "@/assets/profile/post-1.webp";
import second from "@/assets/profile/post-2.webp";
import third from "@/assets/profile/post-3.webp";
import fourth from "@/assets/profile/post-4.webp";
import fifth from "@/assets/profile/post-5.webp";
import sixth from "@/assets/profile/post-6.webp";

export type ProfileCategory = "all" | "art" | "notes" | "daily";
export type ProfileContentTab = "posts" | "likes" | "privatePosts" | "private" | "cloudImages" | "cloudCollections" | "comments" | "received";
export interface ProfileReferencePost {
  id: number;
  category: Exclude<ProfileCategory, "all">;
  image: string;
  date: string;
  likes: number;
  comments: number;
}
export const PROFILE_REFERENCE_ART = { banner: banner.src, avatar: avatar.src };
export const PROFILE_REFERENCE_POSTS: ProfileReferencePost[] = [
  { id: 1, category: "art", image: first.src, date: "2025-10-20", likes: 128, comments: 12 },
  { id: 2, category: "notes", image: second.src, date: "2025-10-18", likes: 86, comments: 8 },
  { id: 3, category: "art", image: third.src, date: "2025-10-16", likes: 102, comments: 15 },
  { id: 4, category: "daily", image: fourth.src, date: "2025-10-14", likes: 64, comments: 6 },
  { id: 5, category: "art", image: fifth.src, date: "2025-10-12", likes: 98, comments: 10 },
  { id: 6, category: "notes", image: sixth.src, date: "2025-10-10", likes: 76, comments: 9 },
];
export const PROFILE_TAB_ORDER: ProfileContentTab[] = ["posts", "likes", "privatePosts", "private", "cloudImages", "cloudCollections", "comments", "received"];
export const PROFILE_CATEGORIES: ProfileCategory[] = ["all", "art", "notes", "daily"];
export const REFERENCE_TREND = [22, 30, 20, 37, 27, 22, 28];
export const REFERENCE_HOURS = [2, 3, 3, 4, 6, 8, 7, 9, 10, 12, 15, 16, 18, 12, 12, 12, 10, 8, 7, 5, 4, 3, 0, 0];

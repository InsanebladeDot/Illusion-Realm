/** 收藏夹界面样例：复用帖子内置图，两张补图来自用户参考截图；不代表账户收藏。 */
import seventh from "@/assets/profile/collection-7.webp";
import eighth from "@/assets/profile/collection-8.webp";
import { PROFILE_REFERENCE_POSTS } from "./profile-reference-data";
import type { MessageKey } from "@/i18n";

export const COLLECTION_CATEGORIES = ["all", "character", "scene", "illustration", "work", "other"] as const;
export type CollectionCategory = typeof COLLECTION_CATEGORIES[number];
export interface CollectionSample {
  id: number; category: Exclude<CollectionCategory, "all">; image: string;
  title: MessageKey; tags: MessageKey; date: string; likes: number;
}
export const COLLECTION_SAMPLES: CollectionSample[] = [
  { id: 1, category: "character", image: PROFILE_REFERENCE_POSTS[0].image, title: "profile.ui.post1", tags: "profile.collections.tags1", date: "2025-10-20", likes: 128 },
  { id: 2, category: "scene", image: PROFILE_REFERENCE_POSTS[1].image, title: "profile.ui.post2", tags: "profile.collections.tags2", date: "2025-10-18", likes: 86 },
  { id: 3, category: "illustration", image: PROFILE_REFERENCE_POSTS[2].image, title: "profile.ui.post3", tags: "profile.collections.tags3", date: "2025-10-16", likes: 102 },
  { id: 4, category: "work", image: PROFILE_REFERENCE_POSTS[3].image, title: "profile.ui.post4", tags: "profile.collections.tags4", date: "2025-10-14", likes: 64 },
  { id: 5, category: "character", image: PROFILE_REFERENCE_POSTS[4].image, title: "profile.ui.post5", tags: "profile.collections.tags5", date: "2025-10-12", likes: 98 },
  { id: 6, category: "scene", image: PROFILE_REFERENCE_POSTS[5].image, title: "profile.ui.post6", tags: "profile.collections.tags6", date: "2025-10-10", likes: 76 },
  { id: 7, category: "illustration", image: seventh.src, title: "profile.collections.title7", tags: "profile.collections.tags7", date: "2025-10-08", likes: 53 },
  { id: 8, category: "other", image: eighth.src, title: "profile.collections.title8", tags: "profile.collections.tags8", date: "2025-10-05", likes: 41 },
];

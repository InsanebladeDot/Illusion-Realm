/**
 * 「我的主页」的资料辅助：头像首字母、读图、社交链接 id。
 *
 * 怎么做：纯函数 + `FileReader`；头像体积上限来自 `data/profile`。
 */
import { t } from "@/i18n";
import { PROFILE_AVATAR_MAX_BYTES } from "@/data/profile";

export function getProfileInitials(username: string): string {
  const trimmed = username.trim();
  if (!trimmed) return "IR";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error(t("profile.errors.invalidImageType")));
      return;
    }

    if (file.size > PROFILE_AVATAR_MAX_BYTES) {
      reject(new Error(t("profile.errors.imageTooLarge")));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error(t("profile.errors.readFailed")));
    };
    reader.onerror = () => reject(new Error(t("profile.errors.readFailed")));
    reader.readAsDataURL(file);
  });
}

export function createSocialLinkId(): string {
  return `social_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

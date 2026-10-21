/** Auth.js 供应商展示数据：当前只展示入口，正式 OAuth 在后端接入，密钥不能进入渲染包。 */
import type { ProviderType } from "@auth/core/providers";

export interface AuthProviderOption { id: "google" | "apple" | "github"; name: string; type: ProviderType }
export const AUTH_PROVIDERS: readonly AuthProviderOption[] = [
  { id: "google", name: "Google", type: "oidc" },
  { id: "apple", name: "Apple", type: "oidc" },
  { id: "github", name: "GitHub", type: "oauth" },
];

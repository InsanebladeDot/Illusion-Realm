export {
  DEFAULT_USER_DATA_DOCUMENT,
  USER_DATA_SETTING,
  USER_DATA_VERSION,
} from "@illusion-realm/shared";

export const LEGACY_STORAGE_KEYS = {
  settings: "illusion-realm-settings",
  profile: "illusion-realm-profile",
  sidebar: "illusion-realm-sidebar",
  historyFolders: "illusion-realm-history-folders",
  quickPhrases: "illusion-realm-quick-phrases",
} as const;

export const BROWSER_USER_DATA_KEY = "illusion-realm-user-data";

/**
 * English catalogue — keys must stay identical to `zh-CN/nav.ts`
 * (enforced by `Record<Locale, Messages>` at typecheck time).
 *
 * Translation status: translated (see apps/next/scripts/check-i18n-en.mjs).
 * When adding a nav entry, add it to zh-CN **and** here — the ratchet only
 * allows untranslated growth for *new* keys, never for regressions.
 */
export const nav = {
  canvas: "Infinite canvas",
  brandTagline: "AI art · Create your own fantasy world",
  "agent": "Agent",
  "home": "Home",
  "create": "Create",
  "inspect": "Inspect",
  "comic": "Comic Storyboard",
  "tags": "Tags",
  "profile": "Profile",
  "updates": "Updates",
  "settings": "Settings",
  "language": "Language",
  "toolBox": "Toolbox",
  "theme": "Theme",
  history: {
    back: "Back", forward: "Forward", noBack: "No previous page", noForward: "No next page",
    breadcrumb: "Page path", samples: "Component samples", sampleProject: "Sample project",
  },
  routeHelp: {
    home: "Choose a creative workspace or explore the available tools.",
    create: "Choose a workflow and use prompts to generate images, video or audio.",
    canvas: "Organize media as nodes, connect workflows and save canvas projects.",
    agent: "Chat with the Agent and use connected creation and management tools.",
    inspect: "Inspect local images and their generation parameters.",
    profile: "View your profile, artwork and saved items.",
    settings: "Configure model folders, service connections and app preferences.",
    updates: "Read version updates and change notes.",
    login: "Sign in or enter the app as a guest.",
    image: "Image tools category. Choose a specific tool on a child page.",
    video: "Video tools category. Choose a specific tool on a child page.",
    models: "Model tools for browsing, managing and downloading models.",
    editor: "Arrange media on a timeline, preview and adjust video clips.",
    samples: "Explore video editor components and example states.",
    sampleProject: "Open an isolated sample project to explore the video editor layout.",
    unknown: "No purpose description is registered for this page yet.",
  },
  "sidebar": {
    "collapse": "Collapse sidebar",
    "expand": "Expand sidebar"
  },
  "mobile": {
    "menu": "Menu",
    "explore": "Explore",
    "history": "History",
    "notifications": "Notifications",
    "you": "You"
  }
} as const;

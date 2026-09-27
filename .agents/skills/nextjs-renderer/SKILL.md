### `.agents/skills/nextjs-renderer/SKILL.md`

---
name: nextjs-renderer
description: >
  Next.js 渲染进程开发规范。当需要编写或修改渲染进程（UI层）代码时使用。
  触发关键词：Next.js, App Router, React component, Zustand, Tailwind, page, layout, server component, client component。
  适用于：页面组件、UI 组件、状态管理、样式、路由、数据获取等场景。
---



## Technology Stack
- Next.js 15 with App Router
- React 19
- TypeScript 5.x (strict)
- Tailwind CSS 4
- Zustand for client state
- No CSS-in-JS libraries (use Tailwind only)

## Component Rules
- All components in `apps/next/src/components/`.
- Group by feature: `components/image-gen/`, `components/3d-viewer/`, `components/asset-library/`.
- File naming: PascalCase for components (`ImageCard.tsx`), kebab-case for utilities (`format-date.ts`).
- Max 200 lines per component file. Extract sub-components if larger.

## Server vs Client Components
- Default to Server Components. Add `'use client'` ONLY when needed:
  - Uses useState, useEffect, useReducer, or other hooks
  - Uses browser-only APIs (window, document, localStorage)
  - Uses event handlers (onClick, onChange, etc.)
  - Calls `window.electronAPI.*`
- Since this is a desktop app, MOST components will be client components (they interact with Electron APIs).
- Layout files can remain as server components when possible.

## State Management
- Zustand stores in `apps/next/src/stores/`.
- One store per domain: `useImageStore`, `useAssetStore`, `useSettingsStore`.
- Store pattern:
```ts
import { create } from 'zustand';

interface ImageStore {
  isGenerating: boolean;
  progress: number;
  currentImage: ImageResult | null;
  generate: (params: GenerateImageParams) => Promise<void>;
  reset: () => void;
}

export const useImageStore = create<ImageStore>((set) => ({
  isGenerating: false,
  progress: 0,
  currentImage: null,
  generate: async (params) => {
    set({ isGenerating: true, progress: 0 });
    const result = await window.electronAPI.image.generate(params);
    if (result.success) {
      set({ currentImage: result.data, isGenerating: false, progress: 100 });
    } else {
      set({ isGenerating: false, progress: 0 });
      throw new Error(result.error);
    }
  },
  reset: () => set({ isGenerating: false, progress: 0, currentImage: null }),
}));
```
- NEVER use React Context for global state (use Zustand).
- NEVER use Redux.

## Electron API Usage in Renderer
- Always access via `window.electronAPI.*` — never import ipcRenderer directly.
- Wrap electronAPI calls in Zustand stores or custom hooks, NOT in raw component bodies.
- Handle the case where `window.electronAPI` is undefined (for web-only development mode):
```ts
const api = window.electronAPI;
if (!api) {
  console.warn('Running outside Electron — some features unavailable');
  return;
}
```

## Styling
- Tailwind CSS only. No inline styles except for dynamic values.
- Use CSS variables for theme tokens (colors, spacing) defined in `globals.css`.
- Responsive design: desktop-first (min-width breakpoints), since this is a desktop app.
- Dark mode: use `prefers-color-scheme` + manual toggle via class on `<html>`.

## Routing
- App Router file-based routing in `apps/next/src/app/`.
- Routes:
  - `/` — Home / Gallery
  - `/generate` — Image generation workspace
  - `/generate/video` — Video generation
  - `/assets` — Asset library browser
  - `/tools` — Utility tools (metadata cleanup, video-to-gif, comic panels)
  - `/settings` — App settings
- Use `next/navigation` hooks (`useRouter`, `usePathname`, `useSearchParams`).

## Anti-patterns (Forbidden)
- ❌ Importing `electron`, `ipcRenderer`, or Node.js built-ins in renderer
- ❌ Using `getServerSideProps` or `getStaticProps` (App Router doesn't use them)
- ❌ Storing Electron-returned data in URL search params (use Zustand)
- ❌ Using `next/image` for local file paths from main process (use regular `<img>` with file:// protocol or base64)
- ❌ Global CSS imports in layout files (use Tailwind's @import in globals.css)



---

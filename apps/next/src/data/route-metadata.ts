/** 标题栏的路由门牌：名称、父级和用途放一起；分类路径只展示，不跳到不存在的页面。 */
import { Bot, Box, Film, FolderOpen, Home, Images, Info, Layers, LogIn, Megaphone, MessageSquare, ScanSearch, Settings, User, WandSparkles, Workflow, type LucideIcon } from "lucide-react";
import type { MessageKey } from "@/i18n";

export interface RouteMetadata {
  path: string;
  parent?: string;
  title: MessageKey | null;
  description: MessageKey;
  icon: LucideIcon;
  navigable?: boolean;
}

export const ROUTE_METADATA: readonly RouteMetadata[] = [
  { path: "/", title: "nav.home", description: "nav.routeHelp.home", icon: Home },
  { path: "/create", parent: "/", title: "nav.create", description: "nav.routeHelp.create", icon: WandSparkles },
  { path: "/canvas", parent: "/", title: "nav.canvas", description: "nav.routeHelp.canvas", icon: Workflow },
  { path: "/agent", parent: "/", title: "nav.agent", description: "nav.routeHelp.agent", icon: Bot },
  { path: "/inspect", parent: "/", title: "nav.inspect", description: "nav.routeHelp.inspect", icon: ScanSearch },
  { path: "/profile", parent: "/", title: "nav.profile", description: "nav.routeHelp.profile", icon: User },
  { path: "/settings", parent: "/", title: "nav.settings", description: "nav.routeHelp.settings", icon: Settings },
  { path: "/updates", parent: "/", title: "nav.updates", description: "nav.routeHelp.updates", icon: Megaphone },
  { path: "/login", title: "auth.login", description: "nav.routeHelp.login", icon: LogIn },
  { path: "/tools", parent: "/", title: "nav.toolBox", description: "toolBox.head.description", icon: Box },
  { path: "/tools/image", parent: "/tools", title: "toolBox.head.tabs.image", description: "nav.routeHelp.image", icon: Images, navigable: false },
  { path: "/tools/video", parent: "/tools", title: "toolBox.head.tabs.video", description: "nav.routeHelp.video", icon: Film, navigable: false },
  { path: "/tools/models", parent: "/tools", title: "toolBox.head.tabs.models", description: "nav.routeHelp.models", icon: Layers, navigable: false },
  { path: "/tools/image/cartoon", parent: "/tools/image", title: "dialogue.title", description: "dialogue.hint", icon: MessageSquare },
  { path: "/tools/image/comic", parent: "/tools/image", title: "toolBox.comic.title", description: "toolBox.comic.description", icon: Images },
  { path: "/tools/image/exif", parent: "/tools/image", title: "toolBox.exif.title", description: "toolBox.exif.subtitleEmpty", icon: Info },
  { path: "/tools/models/civitai", parent: "/tools/models", title: "toolBox.civitai.title", description: "toolBox.civitai.description", icon: Box },
  { path: "/tools/video/gif", parent: "/tools/video", title: "toolBox.gif.title", description: "toolBox.gif.description", icon: Film },
  { path: "/tools/video/editor", parent: "/tools/video", title: "toolBox.main.videoName", description: "nav.routeHelp.editor", icon: Film },
  { path: "/tools/video/editor/legacy", parent: "/tools/video/editor", title: "toolBox.video.title", description: "toolBox.video.description", icon: Film },
  { path: "/tools/video/editor/samples", parent: "/tools/video/editor", title: "nav.history.samples", description: "nav.routeHelp.samples", icon: Layers },
  { path: "/tools/video/editor/samples/project", parent: "/tools/video/editor/samples", title: "nav.history.sampleProject", description: "nav.routeHelp.sampleProject", icon: FolderOpen },
];

const ROUTE_ALIASES: Record<string, string> = {
  // 兼容旧窗口的入口文件地址，只复用首页门牌，不新增跳转或历史记录。
  "/index.html": "/",
  "/toolBox": "/tools", "/toolBox/video": "/tools/video/editor", "/toolBox/civitai": "/tools/models/civitai",
  "/toolBox/comic": "/tools/image/comic", "/toolBox/exif": "/tools/image/exif", "/toolBox/gif": "/tools/video/gif",
  "/cartoon": "/tools/image/cartoon", "/comic": "/tools/image/comic",
};

/** 有界向上找父级，顺序由元数据决定；未知页保留实际路径，不猜测它的用途。 */
export function routeBreadcrumbs(pathname: string): RouteMetadata[] {
  const path = pathname.replace(/\/+$/, "") || "/";
  const canonical = ROUTE_ALIASES[path] ?? path;
  let current = ROUTE_METADATA.find(route => route.path === canonical);
  if (!current) return [{ path: canonical, title: null, description: "nav.routeHelp.unknown", icon: Info }];
  const trail: RouteMetadata[] = [];
  while (current && trail.length < ROUTE_METADATA.length) {
    trail.unshift(current);
    current = ROUTE_METADATA.find(route => route.path === current?.parent);
  }
  return trail;
}

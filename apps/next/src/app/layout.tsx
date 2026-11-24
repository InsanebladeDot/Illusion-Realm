import { CanvasSessionHost } from "@/view/infinite-canvas/canvas-session-host";
import type { Metadata } from "next";
// 图引擎的定位样式随应用常驻，避免异步画布热更新时短暂丢失节点布局。
import "@xyflow/react/dist/style.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Illusion Realm",
  description: "AIGC 图片生成系统",
  icons: {
    icon: [{ url: "/logo.jpg", type: "image/jpeg" }],
    apple: [{ url: "/logo.jpg", type: "image/jpeg" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-css-tags -- 自定义高亮交给浏览器解析，避免构建器改写。 */}
        <link rel="stylesheet" href="/prompt-speech.css" />
      </head>
      <body className="min-h-full overflow-x-hidden bg-background text-foreground">
        {children}
        <CanvasSessionHost />
      </body>
    </html>
  );
}

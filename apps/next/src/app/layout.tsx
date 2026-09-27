import type { Metadata } from "next";
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
      <body className="min-h-full overflow-x-hidden bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}

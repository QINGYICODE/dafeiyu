import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./mobile.css";
import "./chat-media.css";
import "./bilibili.css";
import "./character.css";
import "./chat-input.css";
import "./voice.css";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#f7f9fa',
};

export const metadata: Metadata = {
  title: "大肥鱼 · 你的智能伙伴",
  description: "一个会聊天、记得你，也有自己小小生活的 AI 伙伴。",
  icons: {
    icon: "/characters/dafeiyu-avatar-v1.webp",
    shortcut: "/characters/dafeiyu-avatar-v1.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}

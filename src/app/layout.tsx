import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "6 Minute English リスニング＆単語ノート",
  description:
    "BBC Learning English「6 Minute English」専用のリスニング＆AI単語ノートWebアプリ",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "6Min English",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#e11d48",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="6Min English" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body className="min-h-dvh bg-slate-100 text-slate-900 antialiased selection:bg-rose-100 selection:text-rose-900">
        {children}
      </body>
    </html>
  );
}

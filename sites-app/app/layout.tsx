import { MobileAppSupport } from "./mobile-app-support";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediBill Pro",
  description: "Secure billing, inventory, GST and collections for medical agencies.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MediBill", statusBarStyle: "default" },
  icons: {
    apple: "/icons/app-192.png",
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b2b26" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased"><MobileAppSupport />{children}</body>
    </html>
  );
}
